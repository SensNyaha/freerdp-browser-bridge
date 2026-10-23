#include <algorithm>
#include <array>
#include <catch2/catch_test_macros.hpp>
#include <memory>
#include <winpr/stream.h>
namespace {
struct Release {
  void operator()(wStream *stream) const noexcept {
    if (stream)
      Stream_Release(stream);
  }
};
using StreamOwner = std::unique_ptr<wStream, Release>;
using PoolOwner = std::unique_ptr<wStreamPool, decltype(&StreamPool_Free)>;
} // namespace
TEST_CASE(
    "Pinned public WinPR pool retains a released large stream independently of active claims") {
  PoolOwner pool(StreamPool_New(TRUE, 10), StreamPool_Free);
  REQUIRE(pool);
  constexpr std::size_t size = 12U * 1024U * 1024U;
  StreamOwner message(StreamPool_Take(pool.get(), size));
  REQUIRE(message);
  REQUIRE(Stream_Capacity(message.get()) >= size);
  const auto pointer = message.get();
  message.reset();
  StreamOwner next(StreamPool_Take(pool.get(), 1));
  REQUIRE(next);
  REQUIRE(next.get() == pointer);
  REQUIRE(Stream_Capacity(next.get()) >= size);
}
TEST_CASE("Pinned public WinPR pool caches multiple previously simultaneous message capacities") {
  PoolOwner pool(StreamPool_New(TRUE, 10), StreamPool_Free);
  REQUIRE(pool);
  constexpr std::size_t size = 1024U * 1024U;
  std::array<StreamOwner, 4> messages;
  std::array<wStream *, 4> original{};
  for (std::size_t index = 0; index < messages.size(); ++index) {
    messages[index].reset(StreamPool_Take(pool.get(), size));
    REQUIRE(messages[index]);
    original[index] = messages[index].get();
  }
  for (auto &message : messages)
    message.reset();
  for (auto &message : messages) {
    message.reset(StreamPool_Take(pool.get(), 1));
    REQUIRE(message);
    REQUIRE(std::find(original.begin(), original.end(), message.get()) != original.end());
    REQUIRE(Stream_Capacity(message.get()) >= size);
  }
}
