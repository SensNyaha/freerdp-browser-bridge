#include "process_cpu.hpp"
#include "process_stat.hpp"
#include <array>
#include <cerrno>
#include <charconv>
#include <cstdio>
#include <fcntl.h>
#include <limits>
#include <string_view>
#include <unistd.h>

namespace {
class QueryFile final {
public:
  QueryFile(const char *path, int &error) noexcept
      : fd_(::open(path, O_RDONLY | O_CLOEXEC)), error_(error) {
    if (fd_ < 0)
      error_ = errno;
  }
  QueryFile(const QueryFile &) = delete;
  QueryFile &operator=(const QueryFile &) = delete;
  ~QueryFile() noexcept {
    // On Linux close may already have retired the FD even when it returns EINTR.
    if (fd_ >= 0 && ::close(fd_) < 0 && !error_)
      error_ = errno;
  }
  int get() const noexcept { return fd_; }

private:
  int fd_;
  int &error_;
};
} // namespace

// Private scalar host query only. No RDP, directory ownership, secrets or arbitrary paths.
int main(int argc, char **argv) {
  if (argc != 3 || !argv || !argv[1] || !argv[2] ||
      std::string_view(argv[1]) != "--process-cpu-micros")
    return 2;
  const std::string_view text(argv[2]);
  std::uint32_t pid = 0;
  if (text.empty() || text.size() > 10 || text[0] < '0' || text[0] > '9')
    return 2;
  const auto parsed = std::from_chars(text.data(), text.data() + text.size(), pid);
  if (parsed.ec != std::errc{} || parsed.ptr != text.data() + text.size() || !pid ||
      pid > 0x7fffffff)
    return 2;
  std::array<char, 40> path{};
  const auto count =
      std::snprintf(path.data(), path.size(), "/proc/%u/stat", static_cast<unsigned>(pid));
  if (count < 0 || static_cast<std::size_t>(count) >= path.size())
    return 2;
  int error = 0;
  std::optional<bridge::runtime::ProcessCpuTicks> ticks;
  std::array<char, 8193> scratch{};
  {
    const QueryFile file(path.data(), error);
    if (file.get() >= 0) {
      std::size_t used = 0;
      bool complete = false;
      for (unsigned attempt = 0; attempt < 32; ++attempt) {
        const auto size = ::read(file.get(), scratch.data() + used, scratch.size() - used);
        if (size < 0) {
          if (errno == EINTR)
            continue;
          error = errno;
          break;
        }
        used += static_cast<std::size_t>(size);
        if (used > 8192) {
          error = EOVERFLOW;
          break;
        }
        if (!size) {
          complete = true;
          break;
        }
      }
      if (!error && !complete)
        error = EIO;
      if (!error) {
        ticks = bridge::runtime::process_stat_cpu(std::string_view(scratch.data(), used), pid);
        if (!ticks)
          error = EINVAL;
      }
    }
  } // FD close precedes the receipt, including read/parser failures.
  unsigned long long micros = 0;
  if (!error && ticks) {
    errno = 0;
    const auto hertz = ::sysconf(_SC_CLK_TCK);
    if (hertz <= 0 ||
        static_cast<unsigned long>(hertz) > (std::numeric_limits<std::uint32_t>::max)())
      error = errno ? errno : EINVAL;
    else {
      const auto value = bridge::runtime::process_cpu_tick_micros(
          ticks->kernel, ticks->user, static_cast<std::uint32_t>(hertz));
      if (!value)
        error = EOVERFLOW;
      else
        micros = *value;
    }
  }
  if (std::printf("{\"v\":1,\"micros\":%llu,\"error\":%u}\n", micros,
                  static_cast<unsigned>(error)) < 0 ||
      std::fflush(stdout))
    return 3;
  return error ? 1 : 0;
}
