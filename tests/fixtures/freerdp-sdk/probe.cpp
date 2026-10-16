#include <filesystem>
#include <freerdp/client/channels.h>
#include <freerdp/freerdp.h>
#include <iostream>
#include <memory>
#include <set>
#include <string>
#include <winpr/winpr.h>
#ifdef _WIN32
#include <windows.h>
#else
#include <dlfcn.h>
#endif

namespace {
bool private_module(const void *address, const std::filesystem::path &prefix) {
#ifdef _WIN32
  HMODULE module = nullptr;
  if (!GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS |
                              GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
                          reinterpret_cast<LPCWSTR>(address), &module))
    return false;
  wchar_t name[32768]{};
  const auto length = GetModuleFileNameW(module, name, 32768);
  if (!length || length == 32768)
    return false;
  const std::filesystem::path path{name};
#else
  Dl_info info{};
  if (!dladdr(address, &info) || !info.dli_fname)
    return false;
  const std::filesystem::path path{info.dli_fname};
#endif
  const auto relative = std::filesystem::canonical(path).lexically_relative(prefix);
  if (relative.empty() || relative.is_absolute() || *relative.begin() == "..")
    std::cerr << "SDK module origin mismatch: " << path << " expected " << prefix << '\n';
  return !relative.empty() && !relative.is_absolute() && *relative.begin() != "..";
}
} // namespace

int main(int argc, char **argv) {
  try {
    if (argc != 2)
      return 1;
    const auto prefix = std::filesystem::canonical(argv[1]);
    if (!private_module(reinterpret_cast<const void *>(&freerdp_get_version_string), prefix) ||
        !private_module(reinterpret_cast<const void *>(&freerdp_channels_list_addins), prefix) ||
        !private_module(reinterpret_cast<const void *>(&winpr_get_version_string), prefix))
      return 2;
    const std::unique_ptr<FREERDP_ADDIN *, decltype(&freerdp_channels_addin_list_free)> addins(
        freerdp_channels_list_addins(nullptr, nullptr, nullptr,
                                     FREERDP_ADDIN_CLIENT | FREERDP_ADDIN_STATIC),
        freerdp_channels_addin_list_free);
    if (!addins)
      return 3;
    std::set<std::string> channels;
    std::size_t count = 0;
    for (; count < 128 && addins.get()[count]; ++count) {
      const auto *addin = addins.get()[count];
      if ((addin->dwFlags & FREERDP_ADDIN_SUBSYSTEM) == 0)
        channels.insert(addin->cName);
    }
    if (count == 128)
      return 4;
    std::cout << "{\"privateModules\":3,\"version\":\"" << freerdp_get_version_string()
              << "\",\"winpr\":\"" << winpr_get_version_string() << "\",\"channels\":[";
    bool first = true;
    for (const auto &channel : channels) {
      if (channel.empty() || channel.size() > 64 ||
          channel.find_first_not_of("abcdefghijklmnopqrstuvwxyz0123456789_-") != std::string::npos)
        return 5;
      std::cout << (first ? "" : ",") << '"' << channel << '"';
      first = false;
    }
    std::cout << "]}\n";
    return std::cout.good() ? 0 : 6;
  } catch (...) {
    return 7;
  }
}
