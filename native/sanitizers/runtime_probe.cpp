// Test-only negative controls: each mode must fail under its sanitizer.
#include <cstdint>
#include <cstdlib>
#include <limits>
#include <memory>
#include <string_view>

namespace {
void *volatile leaked = nullptr;
}

int main(int argc, char **argv) {
  if (argc != 2)
    return 2;
  const std::string_view mode(argv[1]);
  if (mode == "undefined") {
    volatile int maximum = std::numeric_limits<int>::max();
    // Without nonrecovering UBSan this wraps to INT_MIN and exits with status 0.
    return maximum + 1;
  }
  if (mode == "address") {
    auto storage = std::make_unique<std::uint8_t[]>(8);
    volatile std::size_t beyond = 8;
    volatile std::uint8_t *bytes = storage.get();
    bytes[beyond] = 1;
    return bytes[0];
  }
  if (mode == "leak") {
    leaked = std::malloc(128);
    if (!leaked)
      return 2;
    leaked = nullptr;
    return 0;
  }
  return 2;
}
