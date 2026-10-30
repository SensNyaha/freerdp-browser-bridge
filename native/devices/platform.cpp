#include "inventory.hpp"
#include <array>
#include <cstring>
#include <string>
#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <winspool.h>
#include <winscard.h>
#elif defined(__linux__)
#include <cerrno>
#include <dirent.h>
#include <sys/stat.h>
#endif

namespace bridge::devices {
namespace {
using Bytes = ::bridge::compat::span<const std::uint8_t>;
Bytes bytes(const std::string &value) {
  return {reinterpret_cast<const std::uint8_t *>(value.data()), value.size()};
}
#ifdef _WIN32
wire::Status error(DWORD code) {
  if (code == ERROR_ACCESS_DENIED) return wire::Status::denied;
  if (code == RPC_S_SERVER_UNAVAILABLE || code == ERROR_SERVICE_NOT_ACTIVE) return wire::Status::unavailable;
  return wire::Status::failure;
}
std::string utf8(const wchar_t *value, std::size_t count) {
  if (!count || count > 255) return {};
  const auto length = WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, value,
                                         static_cast<int>(count), nullptr, 0, nullptr, nullptr);
  if (length <= 0 || length > 255) return {};
  std::string result(static_cast<std::size_t>(length), '\0');
  if (WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, value, static_cast<int>(count),
                          result.data(), length, nullptr, nullptr) != length) return {};
  return result;
}
wire::Status ports(Snapshot &snapshot, bool serial) {
  // Query DOS names only. Never open a port, change permissions or probe hardware.
  const auto names = std::make_unique<std::array<wchar_t, 32768>>();
  const auto length = QueryDosDeviceW(nullptr, names->data(), static_cast<DWORD>(names->size()));
  if (!length) return GetLastError() == ERROR_INSUFFICIENT_BUFFER ? wire::Status::limit : error(GetLastError());
  std::size_t offset = 0;
  while (offset < length && (*names)[offset]) {
    std::size_t end = offset;
    while (end < length && (*names)[end]) ++end;
    if (end == length) return wire::Status::failure;
    const auto count = end - offset;
    const auto *name = names->data() + offset;
    const bool prefix = count >= 4 && name[0] == (serial ? L'C' : L'L') &&
        name[1] == (serial ? L'O' : L'P') && name[2] == (serial ? L'M' : L'T');
    bool digits = prefix;
    for (std::size_t i = 3; i < count && digits; ++i) digits = name[i] >= L'0' && name[i] <= L'9';
    if (digits) {
      const auto id = utf8(name, count);
      if (!snapshot.append({bytes(id), bytes(id)})) return wire::Status::available;
    }
    offset = end + 1;
  }
  return wire::Status::available;
}
wire::Status smartcards(Snapshot &snapshot) {
  SCARDCONTEXT context = 0;
  const auto established = SCardEstablishContext(SCARD_SCOPE_SYSTEM, nullptr, nullptr, &context);
  if (established != SCARD_S_SUCCESS)
    return established == SCARD_E_NO_SERVICE || established == SCARD_E_SERVICE_STOPPED
        ? wire::Status::unavailable : wire::Status::failure;
  struct Release { SCARDCONTEXT context; ~Release() { (void)SCardReleaseContext(context); } } release{context};
  DWORD length = 0;
  auto result = SCardListReadersW(context, nullptr, nullptr, &length);
  if (result == SCARD_E_NO_READERS_AVAILABLE) return wire::Status::available;
  if (result != SCARD_S_SUCCESS) return wire::Status::failure;
  if (length < 2 || length > 16384) return wire::Status::limit;
  const auto readers = std::make_unique<std::array<wchar_t, 16384>>();
  result = SCardListReadersW(context, nullptr, readers->data(), &length);
  if (result == SCARD_E_INSUFFICIENT_BUFFER) return wire::Status::limit;
  if (result == SCARD_E_NO_READERS_AVAILABLE) return wire::Status::available;
  if (result != SCARD_S_SUCCESS || length > readers->size()) return wire::Status::failure;
  std::size_t offset = 0;
  while (offset < length && (*readers)[offset]) {
    auto end = offset;
    while (end < length && (*readers)[end]) ++end;
    if (end == length) return wire::Status::failure;
    const auto id = utf8(readers->data() + offset, end - offset);
    if (!snapshot.append({bytes(id), bytes(id)})) return wire::Status::available;
    offset = end + 1;
  }
  return wire::Status::available;
}
wire::Status printers(Snapshot &snapshot) {
  DWORD needed = 0, returned = 0;
  constexpr DWORD flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
  const auto first = EnumPrintersW(flags, nullptr, 4, nullptr, 0, &needed, &returned);
  const auto code = GetLastError();
  if (first && !needed) return wire::Status::available;
  if (!first && code != ERROR_INSUFFICIENT_BUFFER) return error(code);
  if (!needed || needed > 2 * 1024 * 1024) return wire::Status::limit;
  const auto capacity = needed;
  const auto storage = std::make_unique<std::uint8_t[]>(capacity);
  if (!EnumPrintersW(flags, nullptr, 4, storage.get(), capacity, &needed, &returned))
    return GetLastError() == ERROR_INSUFFICIENT_BUFFER ? wire::Status::limit : error(GetLastError());
  if (returned > capacity / sizeof(PRINTER_INFO_4W)) return wire::Status::failure;
  const auto *entries = reinterpret_cast<const PRINTER_INFO_4W *>(storage.get());
  for (DWORD i = 0; i < returned; ++i) {
    const auto address = reinterpret_cast<std::uintptr_t>(entries[i].pPrinterName);
    const auto start = reinterpret_cast<std::uintptr_t>(storage.get());
    if (address < start || address >= start + capacity || address % alignof(wchar_t)) return wire::Status::failure;
    const auto maximum = (capacity - static_cast<std::size_t>(address - start)) / sizeof(wchar_t);
    const auto *name = entries[i].pPrinterName;
    std::size_t count = 0;
    while (count < maximum && count <= 255 && name[count]) ++count;
    if (count == maximum || count > 255) return wire::Status::failure;
    const auto id = utf8(name, count);
    if (!snapshot.append({bytes(id), bytes(id)})) return wire::Status::available;
  }
  return wire::Status::available;
}
#elif defined(__linux__)
wire::Status ports(Snapshot &snapshot, bool serial) {
  DIR *const directory = ::opendir(serial ? "/sys/class/tty" : "/sys/class/ppdev");
  if (!directory) return errno == EACCES ? wire::Status::denied : wire::Status::unavailable;
  struct Close { DIR *value; ~Close() { (void)::closedir(value); } } close{directory};
  std::size_t inspected = 0;
  while (true) {
    errno = 0;
    const auto *entry = ::readdir(directory);
    if (!entry) return errno ? wire::Status::failure : wire::Status::available;
    if (++inspected > 4096) return wire::Status::limit;
    const std::string name(entry->d_name);
    bool selected = false;
    const auto numeric = [&](const char *prefix) {
      const auto size = std::strlen(prefix);
      return name.size() > size && name.compare(0, size, prefix) == 0 &&
          name.find_first_not_of("0123456789", size) == name.npos;
    };
    if (serial) selected = numeric("ttyS") || numeric("ttyUSB") || numeric("ttyACM") || numeric("ttyAMA");
    else selected = numeric("parport");
    if (!selected) continue;
    const auto id = std::string("/dev/") + name;
    struct stat state{};
    if (::lstat(id.c_str(), &state) != 0) {
      if (errno == ENOENT || errno == ENXIO) continue;
      return errno == EACCES ? wire::Status::denied : wire::Status::failure;
    }
    if (!S_ISCHR(state.st_mode)) continue;
    if (!snapshot.append({bytes(id), bytes(name)})) return wire::Status::available;
  }
}
#endif
}
std::vector<std::uint8_t> discover(wire::Request request) {
  Snapshot result(request);
  for (unsigned kind = 1; kind <= 5; ++kind) {
    if (!(request.classes & (1U << (kind - 1)))) continue;
    const auto type = static_cast<wire::DeviceClass>(kind);
    result.begin(type);
    auto status = wire::Status::unsupported;
#ifdef _WIN32
    if (type == wire::DeviceClass::printers) status = printers(result);
    if (type == wire::DeviceClass::smartcards) status = smartcards(result);
#endif
#ifdef __linux__
    if (type == wire::DeviceClass::printers) status = discover_cups(result);
    if (type == wire::DeviceClass::smartcards) status = discover_pcsc(result);
#endif
    if (type == wire::DeviceClass::usb) status = discover_usb(result);
#if defined(_WIN32) || defined(__linux__)
    if (type == wire::DeviceClass::serial || type == wire::DeviceClass::parallel)
      status = ports(result, type == wire::DeviceClass::serial);
#endif
    result.finish(status);
  }
  wire::validate_selection(result.view(), request);
  return wire::encode_report(result.view());
}
} // namespace bridge::devices
