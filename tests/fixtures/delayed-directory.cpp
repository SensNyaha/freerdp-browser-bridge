#include "private_directory.hpp"
#include <chrono>
#include <cstdio>
#include <string_view>
#include <thread>

// Synthetic process-start delay; native directory creation itself is real.
// Never installed or selected by production, and takes only nonsecret test paths.
int wmain(int argc, wchar_t **argv) {
  if (argc != 3 || !argv || !argv[1] || !argv[2] ||
      std::wstring_view(argv[1]) != L"--create-private-directory")
    return 2;
  std::this_thread::sleep_for(std::chrono::milliseconds(5500));
  const auto result = bridge::runtime::create_private_directory(argv[2]);
  if (std::printf("{\"v\":1,\"created\":%s,\"error\":%lu}\n",
                  result == ERROR_SUCCESS ? "true" : "false",
                  static_cast<unsigned long>(result)) < 0 ||
      std::fflush(stdout))
    return 3;
  return result == ERROR_SUCCESS ? 0 : 1;
}
