#include "../compat/span.hpp"
#include "dvc_receive_guard.hpp"
#include <array>
#include <catch2/catch_test_macros.hpp>
#include <freerdp/client.h>
#include <memory>
#include <stdexcept>
#include <vector>
#include <winpr/wtsapi.h>
using namespace bridge::channels;
namespace {
struct Fixture {
  struct Context {
    rdpContext base{};
    Fixture *owner;
  } context{{}, this};
  freerdp instance{};
  UINT16 resolved = 1004, received_id = 0;
  UINT16 audio_resolved = 1006;
  UINT32 received_flags = 0;
  std::size_t received_size = 0, received_total = 0;
  const BYTE *received_pointer = nullptr;
  std::vector<BYTE> copied;
  unsigned calls = 0;
  bool accept = true, throw_call = false, throw_resolve = false;
  enum class Reentry { none, close, receive, poll, resolve_close } reentry = Reentry::none;
  DvcReceiveGuard guard;
  explicit Fixture(bool audio = false)
      : guard(instance, delegate, {}, resolve, audio ? resolve_audio : nullptr) {
    instance.context = &context.base;
  }
  static Fixture &owner(freerdp *instance) {
    return *reinterpret_cast<Context *>(instance->context)->owner;
  }
  static UINT16 resolve(freerdp *instance) {
    auto &f = owner(instance);
    if (f.throw_resolve)
      throw std::runtime_error("fixture");
    if (f.reentry == Reentry::resolve_close)
      f.guard.close();
    return f.resolved;
  }
  static UINT16 resolve_audio(freerdp *instance) { return owner(instance).audio_resolved; }
  static BOOL delegate(freerdp *instance, UINT16 id, const BYTE *data, std::size_t size,
                       UINT32 flags, std::size_t total) {
    auto &f = owner(instance);
    ++f.calls;
    f.received_id = id;
    f.received_flags = flags;
    f.received_size = size;
    f.received_total = total;
    f.received_pointer = data;
    if (f.reentry == Reentry::close)
      f.guard.close();
    if (f.reentry == Reentry::receive)
      REQUIRE_FALSE(f.guard.receive(id, data, size, flags, total, 2));
    if (f.reentry == Reentry::poll)
      REQUIRE_FALSE(f.guard.poll(2));
    // Read after reentrant retirement to verify the active staged borrow remains valid.
    if (size)
      f.copied.assign(data, data + size);
    if (f.throw_call)
      throw std::runtime_error("fixture");
    return f.accept ? TRUE : FALSE;
  }
  bool receive(::bridge::compat::span<const BYTE> bytes, UINT32 flags = CHANNEL_FLAG_ONLY, std::size_t total = 4,
               std::uint64_t now = 1) {
    return guard.receive(1004, bytes.data(), bytes.size(), flags, total, now);
  }
};
constexpr BYTE data[]{0x30, 0x42, 0xab, 0xcd};
constexpr BYTE volume[]{3, 0, 4, 0, 1, 2, 3, 4};
} // namespace

TEST_CASE("Public DVC receive guard forwards only complete inspected input with normalized flags") {
  Fixture whole;
  REQUIRE(whole.receive(data, CHANNEL_FLAG_ONLY | CHANNEL_FLAG_SHOW_PROTOCOL));
  REQUIRE(whole.calls == 1);
  REQUIRE(whole.received_pointer == data);
  REQUIRE(whole.received_id == 1004);
  REQUIRE(whole.received_size == 4);
  REQUIRE(whole.received_total == 4);
  REQUIRE(whole.received_flags == (CHANNEL_FLAG_ONLY | CHANNEL_FLAG_SHOW_PROTOCOL));
  REQUIRE(whole.guard.stats().assembly.allocated_bytes == 0);
  for (std::size_t split = 1; split <= sizeof(data); ++split) {
    Fixture f;
    REQUIRE(
        f.receive(::bridge::compat::span(data).first(split), CHANNEL_FLAG_FIRST | CHANNEL_FLAG_SHOW_PROTOCOL));
    REQUIRE(f.calls == 0);
    REQUIRE(f.receive(::bridge::compat::span(data).subspan(split),
                      CHANNEL_FLAG_LAST | CHANNEL_FLAG_SHADOW_PERSISTENT, 4, 2));
    REQUIRE(f.calls == 1);
    REQUIRE(f.received_flags ==
            (CHANNEL_FLAG_ONLY | CHANNEL_FLAG_SHOW_PROTOCOL | CHANNEL_FLAG_SHADOW_PERSISTENT));
    REQUIRE(f.copied == std::vector<BYTE>(std::begin(data), std::end(data)));
    REQUIRE(f.guard.stats().assembly.allocated_bytes == 0);
  }
}
TEST_CASE(
    "Public DVC receive guard delegates unrelated SVC arguments without applying DVC framing") {
  Fixture f;
  REQUIRE(f.guard.receive(1005, data, 4, 0xffffffffU, 0xffffffffU, 1));
  REQUIRE(f.calls == 1);
  REQUIRE(f.received_id == 1005);
  REQUIRE(f.received_pointer == data);
  REQUIRE(f.received_flags == 0xffffffffU);
  REQUIRE(f.received_total == 0xffffffffU);
  REQUIRE(f.guard.stats().other_packets == 1);
  f.resolved = 0;
  REQUIRE_FALSE(f.receive(data)); // A resolved channel cannot disappear or migrate.
  REQUIRE(f.calls == 1);
  Fixture unresolved;
  unresolved.resolved = 0;
  REQUIRE(unresolved.receive(data));
  REQUIRE(unresolved.guard.stats().other_packets == 1);
  unresolved.resolved = 1004;
  REQUIRE(unresolved.receive(data));
  REQUIRE(unresolved.guard.stats().assembly.forwarded == 1);
}
TEST_CASE("Public DVC raw flag and pointer refusal occurs before host dispatch") {
  constexpr UINT32 known = CHANNEL_FLAG_ONLY | CHANNEL_FLAG_SHOW_PROTOCOL |
                           CHANNEL_FLAG_SHADOW_PERSISTENT | CHANNEL_FLAG_SUSPEND |
                           CHANNEL_FLAG_RESUME;
  for (unsigned bit = 0; bit < 32; ++bit) {
    const UINT32 flag = UINT32{1} << bit;
    if (known & flag)
      continue;
    Fixture f;
    REQUIRE_FALSE(f.receive(data, CHANNEL_FLAG_ONLY | flag));
    REQUIRE(f.calls == 0);
    REQUIRE(f.guard.stats().failures == 1);
  }
  Fixture pointer;
  REQUIRE_FALSE(pointer.guard.receive(1004, nullptr, 4, CHANNEL_FLAG_ONLY, 4, 1));
  REQUIRE(pointer.calls == 0);
  REQUIRE(pointer.guard.stats().assembly.allocated_bytes == 0);
  const BYTE claim[]{0x2a, 1, 0, 0, 0, 0xff, 0xff, 0xff, 0xff};
  Fixture inner;
  REQUIRE_FALSE(inner.receive(claim, CHANNEL_FLAG_ONLY, sizeof(claim)));
  REQUIRE(inner.calls == 0);
  Fixture outer;
  REQUIRE_FALSE(outer.receive(::bridge::compat::span(data).first(1), CHANNEL_FLAG_FIRST, 0xffffffffU));
  REQUIRE(outer.calls == 0);
  REQUIRE(outer.guard.stats().assembly.allocated_bytes == 0);
}
TEST_CASE(
    "Public DVC empty suspend/resume notifications preserve deadline and cannot hide payload") {
  Fixture f;
  REQUIRE(f.receive(::bridge::compat::span(data).first(1), CHANNEL_FLAG_FIRST));
  REQUIRE(f.guard.receive(1004, nullptr, 0, CHANNEL_FLAG_SUSPEND, 0, 100));
  REQUIRE(f.guard.receive(1004, nullptr, 0, CHANNEL_FLAG_RESUME, 0, 2000));
  REQUIRE(f.calls == 2);
  REQUIRE(f.guard.stats().notifications == 2);
  REQUIRE_FALSE(f.guard.poll(2001));
  REQUIRE(f.guard.stats().assembly.abandoned == 1);
  REQUIRE(f.guard.stats().assembly.allocated_bytes == 0);
  for (const auto flags :
       {CHANNEL_FLAG_SUSPEND | CHANNEL_FLAG_RESUME, CHANNEL_FLAG_SUSPEND | CHANNEL_FLAG_FIRST,
        CHANNEL_FLAG_RESUME | CHANNEL_FLAG_LAST}) {
    Fixture bad;
    REQUIRE_FALSE(bad.guard.receive(1004, nullptr, 0, flags, 0, 1));
    REQUIRE(bad.calls == 0);
  }
  Fixture payload;
  REQUIRE_FALSE(payload.receive(data, CHANNEL_FLAG_SUSPEND));
  REQUIRE(payload.calls == 0);
  Fixture total;
  REQUIRE_FALSE(total.guard.receive(1004, nullptr, 0, CHANNEL_FLAG_RESUME, 1, 1));
  REQUIRE(total.calls == 0);
}
TEST_CASE("Public DVC unrelated traffic polls partial expiry before any host call") {
  Fixture f;
  REQUIRE(f.receive(::bridge::compat::span(data).first(1), CHANNEL_FLAG_FIRST));
  REQUIRE_FALSE(f.guard.receive(1005, data, 4, CHANNEL_FLAG_ONLY, 4, 2001));
  REQUIRE(f.calls == 0);
  REQUIRE(f.guard.stats().assembly.abandoned == 1);
  REQUIRE_FALSE(f.receive(data, CHANNEL_FLAG_ONLY, 4, 2002));
  REQUIRE(f.guard.stats().failures == 1);
}
TEST_CASE(
    "Public DVC reentrant and provider failures retain staged borrow then release without retry") {
  for (const auto mode :
       {Fixture::Reentry::close, Fixture::Reentry::receive, Fixture::Reentry::poll}) {
    Fixture f;
    REQUIRE(f.receive(::bridge::compat::span(data).first(2), CHANNEL_FLAG_FIRST));
    f.reentry = mode;
    REQUIRE_FALSE(f.receive(::bridge::compat::span(data).subspan(2), CHANNEL_FLAG_LAST, 4, 2));
    REQUIRE(f.copied == std::vector<BYTE>(std::begin(data), std::end(data)));
    REQUIRE(f.guard.stats().assembly.allocated_bytes == 0);
    REQUIRE(f.guard.stats().closed);
    REQUIRE(f.guard.stats().failed == (mode != Fixture::Reentry::close));
    REQUIRE_FALSE(f.receive(data));
    REQUIRE(f.calls == 1);
  }
  for (bool exception : {false, true}) {
    Fixture f;
    f.accept = false;
    f.throw_call = exception;
    REQUIRE_FALSE(f.receive(data));
    REQUIRE(f.guard.stats().failed);
    REQUIRE_FALSE(f.receive(data));
    REQUIRE(f.calls == 1);
  }
  Fixture resolver;
  resolver.throw_resolve = true;
  REQUIRE_FALSE(resolver.receive(data));
  REQUIRE(resolver.calls == 0);
  Fixture retired;
  retired.reentry = Fixture::Reentry::resolve_close;
  REQUIRE_FALSE(retired.receive(data));
  REQUIRE(retired.calls == 0);
  REQUIRE_FALSE(retired.guard.stats().failed);
}
TEST_CASE("Public DVC guard validates its delegates and uses public channel lookup without private "
          "casts") {
  freerdp instance{};
  REQUIRE_THROWS_AS(DvcReceiveGuard(instance, nullptr), std::invalid_argument);
  REQUIRE_THROWS_AS(DvcReceiveGuard(instance, Fixture::delegate, {}, nullptr),
                    std::invalid_argument);
  RDP_CLIENT_ENTRY_POINTS entry{};
  entry.Size = sizeof(entry);
  entry.Version = RDP_CLIENT_INTERFACE_VERSION;
  entry.ContextSize = sizeof(rdpClientContext);
  std::unique_ptr<rdpContext, decltype(&freerdp_client_context_free)> context(
      freerdp_client_context_new(&entry), freerdp_client_context_free);
  REQUIRE(context);
  REQUIRE(DvcReceiveGuard::resolve_channel(context->instance) == 0);
  REQUIRE(DvcReceiveGuard::resolve_audio_channel(context->instance) == 0);
}

TEST_CASE("Public static RDPSND receive guard stages bounded complete PDUs before dispatch") {
  for (std::size_t split = 1; split < sizeof(volume); ++split) {
    Fixture f(true);
    REQUIRE(f.guard.receive(1006, volume, split, CHANNEL_FLAG_FIRST | CHANNEL_FLAG_SHOW_PROTOCOL,
                            sizeof(volume), 1));
    REQUIRE(f.calls == 0);
    REQUIRE(f.guard.stats().audio.stored_bytes == split);
    REQUIRE(f.guard.receive(1006, volume + split, sizeof(volume) - split,
                            CHANNEL_FLAG_LAST | CHANNEL_FLAG_SHADOW_PERSISTENT, sizeof(volume), 2));
    REQUIRE(f.calls == 1);
    REQUIRE(f.received_flags ==
            (CHANNEL_FLAG_ONLY | CHANNEL_FLAG_SHOW_PROTOCOL | CHANNEL_FLAG_SHADOW_PERSISTENT));
    REQUIRE(f.received_id == 1006);
    REQUIRE(f.received_total == sizeof(volume));
    REQUIRE(f.copied == std::vector<BYTE>(std::begin(volume), std::end(volume)));
    REQUIRE(f.guard.stats().audio.stored_bytes == 0);
    REQUIRE(f.guard.stats().audio.forwarded == 1);
    REQUIRE(f.receive(data, CHANNEL_FLAG_ONLY, 4, 3)); // Separate DVC owner remains healthy.
    REQUIRE(f.guard.stats().assembly.forwarded == 1);
  }
}
TEST_CASE("Public static RDPSND receive guard refuses raw flags claims and malformed PDUs") {
  for (const UINT32 flags : std::array<UINT32, 3>{CHANNEL_FLAG_ONLY | UINT32{0x00200000},
                                                  CHANNEL_FLAG_SUSPEND | CHANNEL_FLAG_FIRST,
                                                  CHANNEL_FLAG_SUSPEND | CHANNEL_FLAG_RESUME}) {
    Fixture f(true);
    REQUIRE_FALSE(f.guard.receive(1006, volume, sizeof(volume), flags, sizeof(volume), 1));
    REQUIRE(f.calls == 0);
  }
  Fixture oversized(true);
  REQUIRE_FALSE(oversized.guard.receive(1006, volume, 1, CHANNEL_FLAG_FIRST, 65537, 1));
  REQUIRE(oversized.calls == 0);
  Fixture malformed(true);
  const BYTE bad[]{7, 0, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 65, 0, 0, 0, 0, 0};
  REQUIRE_FALSE(malformed.guard.receive(1006, bad, sizeof(bad), CHANNEL_FLAG_ONLY, sizeof(bad), 1));
  REQUIRE(malformed.calls == 0);
  Fixture pointer(true);
  REQUIRE_FALSE(pointer.guard.receive(1006, nullptr, 8, CHANNEL_FLAG_ONLY, 8, 1));
  REQUIRE(pointer.calls == 0);
}
TEST_CASE("Public static RDPSND notifications preserve partial and legacy deadlines") {
  Fixture partial(true);
  REQUIRE(partial.guard.receive(1006, volume, 1, CHANNEL_FLAG_FIRST, sizeof(volume), 1));
  REQUIRE(partial.guard.receive(1006, nullptr, 0, CHANNEL_FLAG_SUSPEND, 0, 100));
  REQUIRE(partial.guard.receive(1006, nullptr, 0, CHANNEL_FLAG_RESUME, 0, 2000));
  REQUIRE_FALSE(partial.receive(data, CHANNEL_FLAG_ONLY, 4, 2001));
  REQUIRE(partial.calls == 2);
  REQUIRE(partial.guard.stats().audio.abandoned == 1);
  Fixture legacy(true);
  const BYTE info[]{2, 0, 16, 0, 1, 0, 0, 0, 1, 0, 0, 0, 10, 11, 12, 13};
  REQUIRE(legacy.guard.receive(1006, info, sizeof(info), CHANNEL_FLAG_ONLY, sizeof(info), 1));
  REQUIRE(legacy.guard.stats().audio.awaiting_wave);
  REQUIRE(legacy.guard.receive(1006, nullptr, 0, CHANNEL_FLAG_RESUME, 0, 2000));
  REQUIRE_FALSE(legacy.guard.poll(2001));
  REQUIRE(legacy.calls == 2);
  REQUIRE(legacy.guard.stats().audio.abandoned == 1);
}
TEST_CASE("Public static RDPSND retirement preserves callback borrow and prevents replay") {
  for (const auto mode :
       {Fixture::Reentry::close, Fixture::Reentry::receive, Fixture::Reentry::poll}) {
    Fixture f(true);
    f.reentry = mode;
    REQUIRE_FALSE(
        f.guard.receive(1006, volume, sizeof(volume), CHANNEL_FLAG_ONLY, sizeof(volume), 1));
    REQUIRE(f.copied == std::vector<BYTE>(std::begin(volume), std::end(volume)));
    REQUIRE(f.guard.stats().audio.stored_bytes == 0);
    REQUIRE(f.guard.stats().closed);
    REQUIRE(f.guard.stats().failed == (mode != Fixture::Reentry::close));
    REQUIRE_FALSE(
        f.guard.receive(1006, volume, sizeof(volume), CHANNEL_FLAG_ONLY, sizeof(volume), 2));
    REQUIRE(f.calls == 1);
  }
}
TEST_CASE("Public static RDPSND resolution refuses migration and channel identity aliases") {
  Fixture f(true);
  REQUIRE(f.guard.receive(1006, volume, sizeof(volume), CHANNEL_FLAG_ONLY, sizeof(volume), 1));
  f.audio_resolved = 1007;
  REQUIRE_FALSE(f.receive(data));
  REQUIRE(f.calls == 1);
  Fixture alias(true);
  alias.audio_resolved = 1004;
  REQUIRE_FALSE(alias.receive(data));
  REQUIRE(alias.calls == 0);
}
