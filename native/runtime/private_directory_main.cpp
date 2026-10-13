#include "private_directory.hpp"
#include <cstdio>
#include <string_view>

// Private host bootstrap only. No RDP, credentials, environment mutation or
// existing-object repair. argv contains an internal nonsecret directory path.
int wmain(int argc, wchar_t **argv) {
  if (argc != 3 || !argv || !argv[1] || !argv[2] ||
      std::wstring_view(argv[1]) != L"--create-private-directory")
    return 2;
  const auto status = bridge::runtime::create_private_directory(argv[2]);
  if (std::printf("{\"v\":1,\"created\":%s,\"error\":%lu}\n",
                  status == ERROR_SUCCESS ? "true" : "false",
                  static_cast<unsigned long>(status)) < 0 ||
      std::fflush(stdout))
    return 3;
  return status == ERROR_SUCCESS ? 0 : 1;
}
