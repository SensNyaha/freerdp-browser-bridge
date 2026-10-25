#include "recovery.hpp"
#include <cstdio>
#include <string_view>
namespace {
template <class Char> bool bounded(const Char *text, std::size_t maximum) noexcept {
  if (!text)
    return false;
  for (std::size_t i = 0; i <= maximum; ++i)
    if (text[i] == 0)
      return i != 0;
  return false;
}
int run(const std::filesystem::path &root, const std::filesystem::path &component) {
  const auto result = bridge::runtime::recover_runtime_directory(root, component);
  const auto *status = result == bridge::runtime::RecoveryResult::removed ? "removed"
                       : result == bridge::runtime::RecoveryResult::busy  ? "busy"
                                                                          : "retained";
  return std::printf("{\"v\":1,\"status\":\"%s\"}\n", status) < 0 || std::fflush(stdout) ? 3 : 0;
}
} // namespace
#ifdef _WIN32
int wmain(int argc, wchar_t **argv) {
#else
int main(int argc, char **argv) {
#endif
  if (argc != 3 || !argv ||
      !bounded(argv[1],
#ifdef _WIN32
               32767
#else
               4096
#endif
               ) ||
      !bounded(argv[2], 74))
    return 2;
  try {
    return run(argv[1], argv[2]);
  } catch (...) {
    std::fputs("Runtime recovery refused\n", stderr);
    return 2;
  }
}
