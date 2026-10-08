#include "jpeg.hpp"
#include <array>
#include <filesystem>
#include <freerdp/client/channels.h>
#include <freerdp/freerdp.h>
#include <iostream>
#include <memory>
#include <set>
#include <string>
#include <turbojpeg.h>
#include <vector>
#include <zlib.h>
#ifdef _WIN32
#include <windows.h>
#else
#include <dlfcn.h>
#endif

namespace {
std::filesystem::path module_path(const void *address) {
#ifdef _WIN32
  HMODULE module = nullptr;
  if (!GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS |
                              GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
                          reinterpret_cast<LPCWSTR>(address), &module))
    return {};
  std::vector<wchar_t> path(32768);
  const auto length = GetModuleFileNameW(module, path.data(), static_cast<DWORD>(path.size()));
  if (length == 0 || length == path.size())
    return {};
  return std::wstring(path.data(), length);
#else
  Dl_info info{};
  if (!dladdr(address, &info) || !info.dli_fname)
    return {};
  return info.dli_fname;
#endif
}
std::string utf8(const std::filesystem::path &path) {
  const auto bytes = path.generic_u8string();
  return std::string(bytes.begin(), bytes.end());
}
bool jpeg_roundtrip() {
  try {
    bridge::media::JpegEncoder encoder;
    std::vector<std::uint8_t> source(32 * 16 * 4, 240);
    const auto jpeg = encoder.encode(source, 32, 16, 32 * 4);
    const auto decoder = tj3Init(TJINIT_DECOMPRESS);
    if (!decoder)
      return false;
    const std::unique_ptr<void, decltype(&tj3Destroy)> guard(decoder, tj3Destroy);
    if (tj3DecompressHeader(decoder, jpeg.data(), jpeg.size()) != 0 ||
        tj3Get(decoder, TJPARAM_JPEGWIDTH) != 32 || tj3Get(decoder, TJPARAM_JPEGHEIGHT) != 16)
      return false;
    std::vector<std::uint8_t> rgb(32 * 16 * 3);
    return tj3Decompress8(decoder, jpeg.data(), jpeg.size(), rgb.data(), 32 * 3, TJPF_RGB) == 0 &&
           rgb[0] > 230 && rgb[1] > 230 && rgb[2] > 230;
  } catch (...) {
    return false;
  }
}
} // namespace
int main() {
  constexpr std::array<unsigned char, 11> original{'b', 'u', 'n', 'd', 'l', 'e',
                                                   '-', 't', 'e', 's', 't'};
  std::array<unsigned char, 128> compressed{};
  std::array<unsigned char, 11> decoded{};
  uLongf compressed_size = static_cast<uLongf>(compressed.size());
  uLongf decoded_size = static_cast<uLongf>(decoded.size());
  if (std::string(zlibVersion()) != ZLIB_VERSION ||
      compress2(compressed.data(), &compressed_size, original.data(),
                static_cast<uLong>(original.size()), Z_BEST_SPEED) != Z_OK ||
      uncompress(decoded.data(), &decoded_size, compressed.data(), compressed_size) != Z_OK ||
      decoded_size != original.size() || decoded != original)
    return 2;
  const auto zlib_path = module_path(reinterpret_cast<const void *>(&zlibVersion));
  const auto freerdp_path =
      module_path(reinterpret_cast<const void *>(&freerdp_get_version_string));
  const auto jpeg_path = module_path(reinterpret_cast<const void *>(&tj3InitVersion));
  if (zlib_path.empty() || freerdp_path.empty() || jpeg_path.empty())
    return 3;
  if (!jpeg_roundtrip())
    return 5;
  const std::unique_ptr<FREERDP_ADDIN *, decltype(&freerdp_channels_addin_list_free)> addins(
      freerdp_channels_list_addins(nullptr, nullptr, nullptr,
                                   FREERDP_ADDIN_CLIENT | FREERDP_ADDIN_STATIC),
      freerdp_channels_addin_list_free);
  if (!addins)
    return 4;
  std::set<std::string> channels;
  for (std::size_t i = 0; i < 128 && addins.get()[i]; ++i) {
    const auto *addin = addins.get()[i];
    if ((addin->dwFlags & FREERDP_ADDIN_SUBSYSTEM) == 0)
      channels.insert(addin->cName);
  }
  std::cout << "zlib=" << zlibVersion() << "\nruntime=" << utf8(zlib_path)
            << "\nfreerdp=" << freerdp_get_version_string()
            << "\nfreerdpRuntime=" << utf8(freerdp_path) << "\njpegRuntime=" << utf8(jpeg_path)
            << "\njpegRoundtrip=true\nchannels=";
  for (const auto &channel : channels)
    std::cout << channel << ',';
  std::cout << '\n';
  return 0;
}
