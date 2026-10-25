#include <windows.h>
#include "startup-record.hpp"
#include "ownership.hpp"

#include <array>
#include <filesystem>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

namespace {
constexpr wchar_t service_name[] = L"FreeRDPBridge";
SERVICE_STATUS_HANDLE status_handle{};
HANDLE stop_event{};
std::wstring config_path;
std::wstring runtime_path;
bool console_mode{};

class handle final {
 public:
  handle() noexcept = default;
  explicit handle(HANDLE value) noexcept : value_(value) {}
  ~handle() { reset(); }
  handle(const handle&) = delete;
  handle& operator=(const handle&) = delete;
  handle(handle&& other) noexcept : value_(std::exchange(other.value_, nullptr)) {}
  handle& operator=(handle&& other) noexcept {
    if (this != &other) reset(std::exchange(other.value_, nullptr));
    return *this;
  }
  void reset(HANDLE next = nullptr) noexcept {
    if (value_ && value_ != INVALID_HANDLE_VALUE) CloseHandle(value_);
    value_ = next;
  }
  [[nodiscard]] HANDLE get() const noexcept { return value_; }
 private:
  HANDLE value_{};
};

void require(bool condition) {
  if (!condition) throw std::runtime_error("STANDALONE_SERVICE_FAILED");
}

std::wstring quote(const std::wstring& input) {
  // Fixed executable/absolute paths only. Reject quote/control injection rather
  // than accepting arbitrary Node arguments or a command interpreter.
  require(!input.empty() && input.size() < 30000 && input.find_first_of(L"\"\r\n") == std::wstring::npos);
  std::wstring result = L"\"" + input;
  // Windows argv parsing doubles trailing backslashes before a closing quote.
  for (auto index = input.size(); index > 0 && input[index - 1] == L'\\'; --index)
    result += L'\\';
  return result + L'\"';
}

void status(DWORD state, DWORD error = NO_ERROR) noexcept {
  if (!status_handle) return;
  SERVICE_STATUS value{};
  value.dwServiceType = SERVICE_WIN32_OWN_PROCESS;
  value.dwCurrentState = state;
  value.dwControlsAccepted = state == SERVICE_RUNNING ? SERVICE_ACCEPT_STOP | SERVICE_ACCEPT_SHUTDOWN : 0;
  value.dwWin32ExitCode = error;
  value.dwWaitHint = (state == SERVICE_START_PENDING || state == SERVICE_STOP_PENDING) ? 15000 : 0;
  value.dwCheckPoint = value.dwWaitHint ? 1 : 0;
  // A failed status report cannot make a child outlive the enclosing job.
  static_cast<void>(SetServiceStatus(status_handle, &value));
}

DWORD WINAPI control(DWORD code, DWORD, void*, void*) noexcept {
  if (code == SERVICE_CONTROL_STOP || code == SERVICE_CONTROL_SHUTDOWN)
    return SetEvent(stop_event) ? NO_ERROR : ERROR_SERVICE_CANNOT_ACCEPT_CTRL;
  if (code == SERVICE_CONTROL_INTERROGATE) return NO_ERROR;
  return ERROR_CALL_NOT_IMPLEMENTED;
}

BOOL WINAPI console_control(DWORD code) noexcept {
  if (code != CTRL_C_EVENT && code != CTRL_BREAK_EVENT && code != CTRL_CLOSE_EVENT && code != CTRL_SHUTDOWN_EVENT)
    return FALSE;
  return SetEvent(stop_event);
}

class child_lifetime final {
 public:
  child_lifetime(HANDLE job, HANDLE process) noexcept : job_(job), process_(process) {}
  ~child_lifetime() {
    // This guard runs before the owning handles close, including exception paths.
    static_cast<void>(TerminateJobObject(job_, 1));
    static_cast<void>(WaitForSingleObject(process_, 5000));
  }
  child_lifetime(const child_lifetime&) = delete;
  child_lifetime& operator=(const child_lifetime&) = delete;
 private:
  HANDLE job_;
  HANDLE process_;
};

class attributes final {
 public:
  explicit attributes(const std::array<HANDLE, 3>& inherited) {
    SIZE_T size{};
    static_cast<void>(InitializeProcThreadAttributeList(nullptr, 1, 0, &size));
    require(size > 0 && size <= 65536);
    memory_.resize(size);
    list_ = reinterpret_cast<LPPROC_THREAD_ATTRIBUTE_LIST>(memory_.data());
    require(InitializeProcThreadAttributeList(list_, 1, 0, &size) != FALSE);
    if (!UpdateProcThreadAttribute(list_, 0, PROC_THREAD_ATTRIBUTE_HANDLE_LIST,
                                  const_cast<HANDLE*>(inherited.data()), sizeof(inherited), nullptr, nullptr)) {
      DeleteProcThreadAttributeList(list_);
      list_ = nullptr;
      require(false);
    }
  }
  ~attributes() { if (list_) DeleteProcThreadAttributeList(list_); }
  attributes(const attributes&) = delete;
  attributes& operator=(const attributes&) = delete;
  [[nodiscard]] LPPROC_THREAD_ATTRIBUTE_LIST get() const noexcept { return list_; }
 private:
  std::vector<unsigned char> memory_;
  LPPROC_THREAD_ATTRIBUTE_LIST list_{};
};

void recover_worker_directory(const std::filesystem::path& directory) {
  bool marker_found = false;
  for (const auto& entry : std::filesystem::directory_iterator(directory)) {
    require(!marker_found && entry.path().filename() == L".rdp-worker-owned");
    marker_found = true;
  }
  if (marker_found) {
    const auto marker = directory / L".rdp-worker-owned";
    {
      handle file(CreateFileW(marker.c_str(), GENERIC_READ, FILE_SHARE_READ, nullptr, OPEN_EXISTING,
                              FILE_FLAG_OPEN_REPARSE_POINT, nullptr));
      require(file.get() != INVALID_HANDLE_VALUE);
      BY_HANDLE_FILE_INFORMATION info{};
      require(GetFileInformationByHandle(file.get(), &info) != FALSE);
      require((info.dwFileAttributes & (FILE_ATTRIBUTE_DIRECTORY | FILE_ATTRIBUTE_REPARSE_POINT)) == 0 &&
              info.nFileSizeHigh == 0 && info.nFileSizeLow == 10);
      std::array<char, 11> bytes{};
      DWORD count{};
      require(ReadFile(file.get(), bytes.data(), static_cast<DWORD>(bytes.size()), &count, nullptr) &&
              count == 10 && std::string(bytes.data(), count) == "runtime-v1");
    }
    require(DeleteFileW(marker.c_str()) != FALSE);
  }
  require(RemoveDirectoryW(directory.c_str()) != FALSE);
}

handle acquire_runtime() {
  const auto attributes = GetFileAttributesW(runtime_path.c_str());
  require(attributes != INVALID_FILE_ATTRIBUTES && (attributes & FILE_ATTRIBUTE_DIRECTORY) != 0 &&
          (attributes & FILE_ATTRIBUTE_REPARSE_POINT) == 0);
  const auto lock_path = (std::filesystem::path(runtime_path) / L".bridge-service.lock").wstring();
  handle lock(CreateFileW(lock_path.c_str(), GENERIC_READ | GENERIC_WRITE, FILE_SHARE_READ,
                          nullptr, CREATE_NEW, FILE_ATTRIBUTE_TEMPORARY | FILE_FLAG_DELETE_ON_CLOSE |
                          FILE_FLAG_OPEN_REPARSE_POINT, nullptr));
  require(lock.get() != INVALID_HANDLE_VALUE);
  // The runtime directory is exclusive service scratch. Recovery removes only
  // directories with the exact Windows worker naming grammar, empty or holding
  // just the exact runtime-v1 ownership marker. No recursive deletion, junction
  // traversal, session files or guessed ownership of other data is allowed.
  std::size_t count{};
  for (const auto& entry : std::filesystem::directory_iterator(runtime_path)) {
    require(++count <= 1024);
    const auto name = entry.path().filename().wstring();
    if (name == L".bridge-service.lock") continue;
    // Schema-1 sessions have independent Node/worker lifetime ownership. Only
    // the verified SDK recovery path may reclaim them; the legacy service scan
    // must not reject or remove them before Node can inspect their OS locks.
    if (bridge::runtime::runtime_identity(std::wstring_view(name))) continue;
    require(name.size() == 39 && name.substr(0, 7) == L"worker-");
    require(name.find_first_not_of(L"0123456789abcdef", 7) == std::wstring::npos);
    const auto flags = GetFileAttributesW(entry.path().c_str());
    require(flags != INVALID_FILE_ATTRIBUTES && (flags & FILE_ATTRIBUTE_DIRECTORY) != 0 &&
            (flags & FILE_ATTRIBUTE_REPARSE_POINT) == 0);
    recover_worker_directory(entry.path());
  }
  return lock;
}

void supervise() {
  const auto runtime_lock = acquire_runtime();
  std::array<wchar_t, 32768> path{};
  const auto length = GetModuleFileNameW(nullptr, path.data(), static_cast<DWORD>(path.size()));
  require(length > 0 && length < path.size());
  const auto root = std::filesystem::path(std::wstring(path.data(), length)).parent_path();
  const auto node = (root / L"node" / L"node.exe").wstring();
  const auto main = (root / L"service" / L"dist" / L"main.js").wstring();
  auto command = quote(node) + L" " + quote(main) + L" --config " + quote(config_path) +
                 L" --runtime-root " + quote(runtime_path) + L" --supervised";
  require(command.size() < 32767);

  SECURITY_ATTRIBUTES security{sizeof(SECURITY_ATTRIBUTES), nullptr, TRUE};
  HANDLE read_raw{}, write_raw{};
  require(CreatePipe(&read_raw, &write_raw, &security, 4096) != FALSE);
  handle input_read(read_raw), input_write(write_raw);
  require(SetHandleInformation(input_write.get(), HANDLE_FLAG_INHERIT, 0) != FALSE);
  require(CreatePipe(&read_raw, &write_raw, &security, 4096) != FALSE);
  handle output_read(read_raw), output_write(write_raw);
  require(SetHandleInformation(output_read.get(), HANDLE_FLAG_INHERIT, 0) != FALSE);
  handle discard(CreateFileW(L"NUL", GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE,
                            &security, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr));
  require(discard.get() != INVALID_HANDLE_VALUE);
  const std::array<HANDLE, 3> inherited{input_read.get(), output_write.get(), discard.get()};
  attributes inherited_attributes(inherited);
  STARTUPINFOEXW startup{};
  startup.StartupInfo.cb = sizeof(startup);
  startup.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
  startup.StartupInfo.hStdInput = input_read.get();
  startup.StartupInfo.hStdOutput = output_write.get();
  startup.StartupInfo.hStdError = discard.get();
  startup.lpAttributeList = inherited_attributes.get();

  std::array<wchar_t, 32768> windows{};
  const auto windows_length = GetWindowsDirectoryW(windows.data(), static_cast<UINT>(windows.size()));
  require(windows_length > 0 && windows_length < windows.size());
  const std::wstring system_root(windows.data(), windows_length);
  // Do not inherit NODE_OPTIONS, profile files, account configuration or session
  // secrets. This environment contains only OS paths and private scratch paths.
  std::wstring environment;
  for (const auto& entry : {L"PATH=" + system_root + L"\\System32", L"SystemRoot=" + system_root,
                            L"TEMP=" + runtime_path, L"TMP=" + runtime_path, L"WINDIR=" + system_root}) {
    environment += entry;
    environment += L'\0';
  }
  environment += L'\0';
  handle job(CreateJobObjectW(nullptr, nullptr));
  require(job.get() != nullptr);
  JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits{};
  limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE | JOB_OBJECT_LIMIT_DIE_ON_UNHANDLED_EXCEPTION;
  require(SetInformationJobObject(job.get(), JobObjectExtendedLimitInformation, &limits, sizeof(limits)) != FALSE);
  PROCESS_INFORMATION child{};
  require(CreateProcessW(node.c_str(), command.data(), nullptr, nullptr, TRUE,
                        CREATE_SUSPENDED | CREATE_NO_WINDOW | CREATE_UNICODE_ENVIRONMENT | EXTENDED_STARTUPINFO_PRESENT,
                        environment.data(), root.c_str(), &startup.StartupInfo, &child) != FALSE);
  handle process(child.hProcess), thread(child.hThread);
  if (!AssignProcessToJobObject(job.get(), process.get())) {
    static_cast<void>(TerminateProcess(process.get(), 1));
    static_cast<void>(WaitForSingleObject(process.get(), 5000));
    require(false);
  }
  child_lifetime reclaim(job.get(), process.get());
  require(ResumeThread(thread.get()) != static_cast<DWORD>(-1));
  input_read.reset(); output_write.reset(); discard.reset(); thread.reset();
  const auto started = GetTickCount64();
  bool ready = false;
  std::optional<bool> recovery_ready;
  std::string startup_output;
  const std::array<HANDLE, 2> waiting{stop_event, process.get()};
  for (;;) {
    DWORD available{};
    if (PeekNamedPipe(output_read.get(), nullptr, 0, nullptr, &available, nullptr) && available) {
      std::array<char, 4096> bytes{};
      DWORD count{};
      require(ReadFile(output_read.get(), bytes.data(), static_cast<DWORD>(bytes.size()), &count, nullptr) != FALSE);
      if (!ready) {
        require(startup_output.size() + count <= 4096);
        startup_output.append(bytes.data(), count);
        for (auto end = startup_output.find('\n'); !ready && end != std::string::npos;
             end = startup_output.find('\n')) {
          const auto line = startup_output.substr(0, end + 1);
          startup_output.erase(0, end + 1);
          const auto record = bridge::standalone::parse_startup_record(line);
          require(record.has_value());
          if (*record != bridge::standalone::StartupRecord::ready) {
            require(!recovery_ready.has_value());
            recovery_ready = *record == bridge::standalone::StartupRecord::recovery_complete;
            if (console_mode) {
              DWORD written{};
              require(WriteFile(GetStdHandle(STD_OUTPUT_HANDLE), line.data(),
                                static_cast<DWORD>(line.size()), &written, nullptr) && written == line.size());
            }
            continue;
          }
          require(!recovery_ready || *recovery_ready);
          ready = true;
          startup_output.clear();
          status(SERVICE_RUNNING);
          if (console_mode) {
            constexpr char ready_record[] = "{\"code\":\"STANDALONE_READY\"}\n";
            DWORD written{};
            require(WriteFile(GetStdHandle(STD_OUTPUT_HANDLE), ready_record, sizeof(ready_record) - 1, &written, nullptr) && written == sizeof(ready_record) - 1);
          }
        }
      }
    }
    if (console_mode && GetFileType(GetStdHandle(STD_INPUT_HANDLE)) == FILE_TYPE_PIPE) {
      DWORD pending{};
      if (!PeekNamedPipe(GetStdHandle(STD_INPUT_HANDLE), nullptr, 0, nullptr, &pending, nullptr)) {
        require(GetLastError() == ERROR_BROKEN_PIPE);
        require(SetEvent(stop_event) != FALSE);
      } else if (pending) {
        unsigned char byte{};
        DWORD count{};
        require(pending == 1 && ReadFile(GetStdHandle(STD_INPUT_HANDLE), &byte, 1, &count, nullptr) && count == 1 && byte == 1);
        require(SetEvent(stop_event) != FALSE);
      }
    }
    const auto reason = WaitForMultipleObjects(static_cast<DWORD>(waiting.size()), waiting.data(), FALSE, 20);
    if (reason == WAIT_OBJECT_0) break;
    require(reason == WAIT_TIMEOUT);
    require(ready || GetTickCount64() - started < 12000);
  }
  status(SERVICE_STOP_PENDING);
  DWORD written{};
  const unsigned char stop = 1;
  const bool sent = WriteFile(input_write.get(), &stop, 1, &written, nullptr) && written == 1;
  input_write.reset();
  require(sent);
  require(WaitForSingleObject(process.get(), 12000) == WAIT_OBJECT_0);
  DWORD exit_code{};
  require(GetExitCodeProcess(process.get(), &exit_code) && exit_code == 0);
  // Closing the job also reclaims any unexpected surviving descendant.
}

void WINAPI service_main(DWORD, wchar_t**) noexcept {
  status_handle = RegisterServiceCtrlHandlerExW(service_name, control, nullptr);
  if (!status_handle) return;
  status(SERVICE_START_PENDING);
  try {
    supervise();
    status(SERVICE_STOPPED);
  } catch (...) {
    // SCM's default failure actions apply when a process exits without reporting
    // SERVICE_STOPPED. supervise() has already unwound its Job/child guards.
    // Do not rely on the problematic MSI failure-actions-on-error flag.
    ExitProcess(ERROR_PROCESS_ABORTED);
  }
}
}  // namespace

int wmain(int argc, wchar_t** argv) {
  try {
    if (argc == 6 && std::wstring(argv[1]) == L"--console") {
      console_mode = true;
      --argc;
      ++argv;
    }
    require(argc == 5 && std::wstring(argv[1]) == L"--config" && std::wstring(argv[3]) == L"--runtime-root");
    config_path = argv[2]; runtime_path = argv[4];
    require(std::filesystem::path(config_path).is_absolute() && std::filesystem::path(runtime_path).is_absolute());
    handle event(CreateEventW(nullptr, TRUE, FALSE, nullptr));
    require(event.get() != nullptr);
    stop_event = event.get();
    if (console_mode) {
      require(SetConsoleCtrlHandler(console_control, TRUE) != FALSE);
      supervise();
      return 0;
    }
    SERVICE_TABLE_ENTRYW table[]{{const_cast<wchar_t*>(service_name), service_main}, {nullptr, nullptr}};
    require(StartServiceCtrlDispatcherW(table) != FALSE);
    return 0;
  } catch (...) {
    return 1;
  }
}
