// The pinned internal Golomb header requires these definitions first.
#include <wels_common_defs.h>

#include <array>
#include <cstdint>
#include <golomb_common.h>
#include <iostream>
#include <stdexcept>

namespace {
std::size_t checks = 0;
void check(bool condition) {
  ++checks;
  if (!condition)
    throw std::runtime_error("BsFlush regression failed");
}
void empty_flush(std::uint32_t pending, std::size_t offset) {
  std::array<std::uint8_t, 64> storage;
  storage.fill(0xa5);
  WelsCommon::SBitStringAux state{};
  check(WelsCommon::InitBits(&state, storage.data(), static_cast<std::int32_t>(storage.size())) ==
        static_cast<std::int32_t>(storage.size()));
  state.pCurBuf += offset;
  state.uiCurBits = pending;
  const auto before = storage;
  const auto cursor = state.pCurBuf;
  check(state.iLeftBits == 32);
  check(WelsCommon::BsFlush(&state) == 0);
  check(storage == before);
  check(state.pCurBuf == cursor);
  check(state.iLeftBits == 32);
  check(state.uiCurBits == pending);
}
} // namespace

int main() {
  try {
    empty_flush(0, 0);
    // Upstream's regression uses pending=123, iLeftBits=32.
    empty_flush(123, 0);
    // A completed word must leave the following bytes untouched.
    empty_flush(0, 4);
    for (std::int32_t left = 0; left < 32; ++left) {
      std::array<std::uint8_t, 64> storage;
      storage.fill(0xa5);
      WelsCommon::SBitStringAux state{};
      check(
          WelsCommon::InitBits(&state, storage.data(), static_cast<std::int32_t>(storage.size())) ==
          static_cast<std::int32_t>(storage.size()));
      const auto mask = (std::uint64_t{1} << (32 - left)) - 1;
      const auto pending = static_cast<std::uint32_t>(0xa5c37218U & mask);
      state.iLeftBits = left;
      state.uiCurBits = pending;
      const auto expected = static_cast<std::uint32_t>(std::uint64_t{pending} << left);
      check(WelsCommon::BsFlush(&state) == 0);
      for (unsigned i = 0; i < 4; ++i)
        check(storage[i] == static_cast<std::uint8_t>(expected >> (24 - i * 8)));
      check(state.pCurBuf == storage.data() + 4 - left / 8);
      check(state.iLeftBits == 32 && state.uiCurBits == 0);
      for (std::size_t i = 4; i < storage.size(); ++i)
        check(storage[i] == 0xa5);
      const auto before_repeat = storage;
      const auto cursor = state.pCurBuf;
      check(WelsCommon::BsFlush(&state) == 0);
      check(storage == before_repeat);
      check(state.pCurBuf == cursor);
      check(state.iLeftBits == 32 && state.uiCurBits == 0);
    }
    std::cout << "BsFlush regression passed: " << checks << " checks\n";
    return 0;
  } catch (const std::exception &error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
