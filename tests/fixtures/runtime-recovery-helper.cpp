// Synthetic helper failure control. Never installed and never handles RDP data.
#include <chrono>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <string_view>
#include <thread>
#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
int wmain(int argc, wchar_t **argv) {
  const auto pid = GetCurrentProcessId();
  using View = std::wstring_view;
#else
#include <unistd.h>
int main(int argc, char **argv) {
  const auto pid = ::getpid();
  using View = std::string_view;
#endif
  if (argc != 3)
    return 2;
  std::ofstream receipt(std::filesystem::path(argv[1]), std::ios::binary);
  receipt << pid;
  receipt.close();
  if (!receipt)
    return 3;
  const View mode(argv[2]);
  if (mode.size() != 1)
    return 2;
  switch (mode[0]) {
  case 'c':
    std::fputs("{\"v\":1,\"status\":\"retained\"}\n", stdout);
    std::fflush(stdout);
    std::this_thread::sleep_for(std::chrono::seconds(20));
    return 0;
  case 'f':
    for (int i = 0; i < 129; ++i)
      std::fputc('x', stdout);
    return 0;
  case 'e':
    std::fputs("synthetic-secret-sentinel", stderr);
    return 0;
  default:
    return 3;
  }
}
