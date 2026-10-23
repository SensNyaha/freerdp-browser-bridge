#include "../compat/span.hpp"
#include "test_host.hpp"
#include "text_session.hpp"
#include <freerdp/channels/channels.h>
#include <string_view>
#include <thread>
#include <winpr/synch.h>
using namespace bridge::clipboard;
using namespace bridge::clipboard::test;
namespace {
::bridge::compat::span<const std::uint8_t> utf8(std::string_view s) {
  return {reinterpret_cast<const std::uint8_t *>(s.data()), s.size()};
}
struct Observer {
  std::vector<std::pair<std::uint64_t, bool>> offers;
  struct Result {
    std::uint64_t id;
    TextReply status;
    std::vector<std::uint8_t> text;
  };
  std::vector<Result> replies;
  std::uint64_t now = 1;
  TextSession owner;
  explicit Observer(TextPolicy policy = {true, true, 1024})
      : owner(
            policy,
            [this](auto revision, auto available) {
              offers.emplace_back(revision, available);
              return true;
            },
            [this](auto id, auto status, auto text) {
              replies.push_back({id, status, {text.begin(), text.end()}});
              return true;
            },
            [this] { return now; }, [](freerdp *i) { return Host::get(i).resolved; }) {}
};
void start(Host &h, TextSession &owner, bool long_names = true) {
  REQUIRE(owner.bind(*h.clip) == CHANNEL_RC_OK);
  if (long_names)
    REQUIRE(h.send(record(7, 0, long_caps)));
  REQUIRE(h.send(record(1, 0)));
  REQUIRE(owner.snapshot()->ready);
  REQUIRE(owner.snapshot()->awaiting_local);
  REQUIRE(h.send(record(3, 1)));
  REQUIRE_FALSE(owner.snapshot()->awaiting_local);
}
void offer(Host &h, bool long_names = true) {
  std::vector<BYTE> formats(long_names ? 6 : 36, 0);
  formats[0] = 13;
  REQUIRE(h.send(record(2, 0, formats)));
}
} // namespace
TEST_CASE("Actual CLIPRDR text owner negotiates Unicode and transfers independently encoded text "
          "both ways") {
  Host h(false);
  Observer o;
  start(h, o.owner);
  REQUIRE(h.writes[0] == record(7, 0, long_caps)); // No file capability flags.
  REQUIRE(h.writes[1] == record(2, 0));
  const std::string_view text = "\xd0\x96\xf0\x9f\x98\x80\n";
  const std::vector<BYTE> wire{0x16, 4, 0x3d, 0xd8, 0, 0xde, 13, 0, 10, 0, 0, 0};
  REQUIRE(o.owner.set_local(utf8(text)) == CHANNEL_RC_OK);
  REQUIRE(h.writes.back() == record(2, 0, {13, 0, 0, 0, 0, 0}));
  REQUIRE(h.send(record(4, 0, {13, 0, 0, 0})));
  REQUIRE(h.writes.back() == record(5, 2)); // Not served before list ACK.
  REQUIRE(h.send(record(3, 1)));
  REQUIRE(o.owner.snapshot()->local_accepted);
  REQUIRE(h.send(record(4, 0, {13, 0, 0, 0})));
  REQUIRE(h.writes.back() == record(5, 1, wire));
  REQUIRE(h.send(record(4, 0, {1, 0, 0, 0})));
  REQUIRE(h.writes.back() == record(5, 2)); // ANSI is not guessed from UTF-8.
  offer(h);
  REQUIRE(o.offers == std::vector<std::pair<std::uint64_t, bool>>{{1, true}});
  REQUIRE(o.owner.request(1, 71) == CHANNEL_RC_OK);
  REQUIRE(h.writes.back() == record(4, 0, {13, 0, 0, 0}));
  REQUIRE(h.send(record(5, 1, wire)));
  REQUIRE(o.replies.size() == 1);
  REQUIRE(o.replies[0].id == 71);
  REQUIRE(o.replies[0].status == TextReply::ok);
  REQUIRE(std::equal(o.replies[0].text.begin(), o.replies[0].text.end(), utf8(text).begin(),
                     utf8(text).end()));
  REQUIRE(o.owner.close());
  REQUIRE(h.clip->custom == nullptr);
  REQUIRE(h.clip->ServerFormatDataResponse == nullptr);
  REQUIRE(h.clip->ClientFormatDataRequest != nullptr);
}
TEST_CASE(
    "Actual CLIPRDR direction policy refuses forbidden transfers without host clipboard access") {
  for (const auto policy : {TextPolicy{true, false, 1024}, TextPolicy{false, true, 1024},
                            TextPolicy{false, false, 1024}}) {
    Host h(false);
    Observer o(policy);
    start(h, o.owner, false);
    offer(h, false);
    REQUIRE(o.offers.back().second == policy.from_server);
    REQUIRE((o.owner.set_local(utf8("A")) == CHANNEL_RC_OK) == policy.to_server);
    if (policy.to_server)
      REQUIRE(h.send(record(3, 1)));
    REQUIRE(h.send(record(4, 0, {13, 0, 0, 0})));
    REQUIRE(h.writes.back() == (policy.to_server ? record(5, 1, {65, 0, 0, 0}) : record(5, 2)));
    REQUIRE((o.owner.request(1, 1) == CHANNEL_RC_OK) == policy.from_server);
    if (policy.from_server) {
      REQUIRE(h.send(record(5, 2)));
      REQUIRE(o.replies.back().status == TextReply::refused);
    }
    REQUIRE_FALSE(o.owner.snapshot()->failed);
  }
}
TEST_CASE("Actual CLIPRDR revoke removes formats and never serves the previous or empty value") {
  for (unsigned mode = 0; mode < 4; ++mode) {
    Host h(false);
    Observer o;
    start(h, o.owner);
    REQUIRE(o.owner.set_local(mode == 0 ? utf8("") : utf8("private synthetic")) == CHANNEL_RC_OK);
    const auto writes = h.writes.size();
    REQUIRE(o.owner.revoke_local() != CHANNEL_RC_OK); // No second uncorrelated ACK.
    REQUIRE(h.writes.size() == writes);
    REQUIRE(h.send(record(3, 1)));
    REQUIRE(o.owner.snapshot()->local_accepted);
    REQUIRE(o.owner.revoke_local() == CHANNEL_RC_OK);
    REQUIRE(h.writes.back() == record(2, 0)); // No formats, not CF13 + empty UTF16.
    REQUIRE_FALSE(o.owner.snapshot()->local_accepted);
    REQUIRE(o.owner.snapshot()->awaiting_local);
    REQUIRE(h.send(record(4, 0, {13, 0, 0, 0})));
    REQUIRE(h.writes.back() == record(5, 2));
    if (mode == 3) {
      o.now = 5001;
      REQUIRE_FALSE(o.owner.poll());
      REQUIRE(o.owner.snapshot()->failed);
      REQUIRE(h.clip->custom == nullptr);
      continue;
    }
    REQUIRE(h.send(record(3, mode == 2 ? 2 : 1)));
    REQUIRE(o.owner.snapshot()->local_response_ok == (mode != 2));
    REQUIRE_FALSE(o.owner.snapshot()->local_accepted);
    REQUIRE(h.send(record(4, 0, {13, 0, 0, 0})));
    REQUIRE(h.writes.back() == record(5, 2));
    REQUIRE(o.owner.set_local(utf8("new owner")) == CHANNEL_RC_OK);
    REQUIRE(h.send(record(3, 1)));
    REQUIRE(h.send(record(4, 0, {13, 0, 0, 0})));
    REQUIRE(h.writes.back() == record(5, 1, {110, 0, 101, 0, 119, 0, 32,  0, 111, 0,
                                             119, 0, 110, 0, 101, 0, 114, 0, 0,   0}));
  }
  Host h(false);
  Observer o({false, true, 1});
  start(h, o.owner);
  const auto writes = h.writes.size();
  REQUIRE(o.owner.revoke_local() == CHANNEL_RC_OK);
  REQUIRE(o.owner.snapshot()->local_response_ok);
  REQUIRE(h.writes.size() == writes); // Receive-only never offers local content.
}
TEST_CASE("CLIPRDR revoke checks public send failure and stable channel identity without retry") {
  for (unsigned mode = 0; mode < 5; ++mode) {
    Host h(false);
    Observer o;
    start(h, o.owner);
    REQUIRE(o.owner.set_local(utf8("synthetic")) == CHANNEL_RC_OK);
    REQUIRE(h.send(record(3, 1)));
    if (mode == 0)
      h.resolved = 0;
    else if (mode == 1)
      h.context->instance->SendChannelData = nullptr;
    else if (mode == 2)
      h.context->instance->SendChannelData = [](auto *, auto, auto *, auto) -> BOOL {
        return FALSE;
      };
    else if (mode == 3)
      h.context->instance->SendChannelData = [](auto *, auto, auto *, auto) -> BOOL {
        throw std::runtime_error("Synthetic revoke transport fault");
      };
    else {
      REQUIRE(o.owner.revoke_local() == CHANNEL_RC_OK);
      REQUIRE(h.send(record(3, 1)));
      h.resolved = 1006;
    }
    const auto writes = h.writes.size();
    REQUIRE(o.owner.revoke_local() != CHANNEL_RC_OK);
    REQUIRE(h.writes.size() == writes);
    REQUIRE(o.owner.snapshot()->failed);
    REQUIRE_FALSE(o.owner.snapshot()->local_accepted);
    REQUIRE(h.clip->custom == nullptr);
    REQUIRE(o.owner.revoke_local() != CHANNEL_RC_OK);
  }
}
TEST_CASE("CLIPRDR revoke drains the public SDK channel dispatcher before direct send") {
  Host h(false);
  Observer o;
  start(h, o.owner);
  struct Pending {
    Host *host;
    unsigned calls = 0;
    static BOOL run(rdpContext *, void *userdata) {
      auto &self = *static_cast<Pending *>(userdata);
      ++self.calls;
      self.host->writes.push_back(record(5, 2));
      return TRUE;
    }
  } pending{&h};
  const auto event = CreateEvent(nullptr, TRUE, TRUE, nullptr);
  if (!event)
    throw std::runtime_error("Synthetic dispatcher event unavailable");
  REQUIRE(freerdp_client_channel_register(h.context->channels, event, Pending::run, &pending));
  const auto rc = o.owner.revoke_local();
  REQUIRE(freerdp_client_channel_unregister(h.context->channels, event));
  REQUIRE(CloseHandle(event));
  REQUIRE(rc == CHANNEL_RC_OK);
  REQUIRE(pending.calls == 1);
  REQUIRE(h.writes[h.writes.size() - 2] == record(5, 2));
  REQUIRE(h.writes.back() == record(2, 0));
  REQUIRE(h.send(record(3, 1)));
  REQUIRE_FALSE(o.owner.snapshot()->local_accepted);
}
TEST_CASE("Actual CLIPRDR new offers preserve one pending response and discard its stale text") {
  Host h(false);
  Observer o;
  start(h, o.owner);
  offer(h);
  REQUIRE(o.owner.request(1, 1) == CHANNEL_RC_OK);
  const auto writes = h.writes.size();
  REQUIRE(o.owner.request(1, 2) != CHANNEL_RC_OK);
  REQUIRE(h.writes.size() == writes);
  offer(h);
  REQUIRE(o.owner.request(2, 2) != CHANNEL_RC_OK);
  REQUIRE(h.send(record(5, 1, {65, 0, 0, 0})));
  REQUIRE(o.replies.size() == 1);
  REQUIRE(o.replies[0].id == 1);
  REQUIRE(o.replies[0].status == TextReply::stale);
  REQUIRE(o.replies[0].text.empty());
  REQUIRE(o.owner.request(1, 3) != CHANNEL_RC_OK);
  REQUIRE(o.owner.request(2, 0) != CHANNEL_RC_OK);
  REQUIRE(o.owner.request(2, 2) == CHANNEL_RC_OK);
  REQUIRE(h.send(record(5, 1, {0, 0})));
  REQUIRE(o.replies.back().status == TextReply::ok);
  REQUIRE(o.replies.back().text.empty());
}
TEST_CASE("Actual CLIPRDR local validation ACK refusal and finite remote or local waits preserve "
          "ownership") {
  for (unsigned mode = 0; mode < 4; ++mode) {
    Host h(false);
    Observer o;
    start(h, o.owner);
    if (mode < 2) {
      REQUIRE(o.owner.set_local(utf8("A")) == CHANNEL_RC_OK);
      if (mode == 0) {
        REQUIRE(h.send(record(3, 2)));
        REQUIRE_FALSE(o.owner.snapshot()->local_accepted);
        REQUIRE(h.send(record(4, 0, {13, 0, 0, 0})));
        REQUIRE(h.writes.back() == record(5, 2));
        const auto writes = h.writes.size();
        REQUIRE(o.owner.set_local(std::vector<BYTE>(1025, 65)) != CHANNEL_RC_OK);
        REQUIRE(o.owner.set_local(std::vector<BYTE>{0xed, 0xa0, 0x80}) != CHANNEL_RC_OK);
        REQUIRE(h.writes.size() == writes);
        REQUIRE(o.owner.set_local({}) == CHANNEL_RC_OK);
        REQUIRE(h.send(record(3, 1)));
        REQUIRE(h.send(record(4, 0, {13, 0, 0, 0})));
        REQUIRE(h.writes.back() == record(5, 1, {0, 0}));
        continue;
      }
    } else {
      offer(h);
      REQUIRE(o.owner.request(1, 1) == CHANNEL_RC_OK);
    }
    o.now = mode == 3 ? 0 : 5001;
    REQUIRE_FALSE(o.owner.poll());
    REQUIRE(o.owner.snapshot()->failed);
    REQUIRE_FALSE(o.owner.snapshot()->awaiting_remote);
    REQUIRE_FALSE(o.owner.snapshot()->awaiting_local);
    REQUIRE(h.clip->custom == nullptr);
    REQUIRE(o.owner.request(1, 2) != CHANNEL_RC_OK);
    REQUIRE(o.replies.empty());
  }
}
TEST_CASE("Actual CLIPRDR owner refuses malformed or unsolicited responses and unhealthy callback "
          "profiles") {
  for (unsigned mode = 0; mode < 4; ++mode) {
    Host h(false);
    Observer o;
    if (mode == 0) {
      REQUIRE(freerdp_settings_set_uint32(h.context->settings, FreeRDP_ThreadingFlags, 0));
      REQUIRE(o.owner.bind(*h.clip) != CHANNEL_RC_OK);
      REQUIRE(h.clip->custom == nullptr);
      continue;
    }
    start(h, o.owner);
    if (mode != 1) {
      offer(h);
      REQUIRE(o.owner.request(1, 1) == CHANNEL_RC_OK);
    }
    const auto response =
        record(5, 1, mode == 3 ? std::vector<BYTE>{65, 0} : std::vector<BYTE>{0, 0xd8, 0, 0});
    REQUIRE_FALSE(h.send(response));
    REQUIRE(o.owner.snapshot()->failed);
    REQUIRE(o.replies.empty());
    REQUIRE(h.clip->custom == nullptr);
  }
  Host already_owned;
  Observer o;
  REQUIRE(o.owner.bind(*already_owned.clip) != CHANNEL_RC_OK);
  REQUIRE(already_owned.clip->custom == &already_owned);
  Host asynchronous(false);
  Observer second;
  REQUIRE(freerdp_settings_set_bool(asynchronous.context->settings, FreeRDP_AsyncChannels, TRUE));
  REQUIRE(second.owner.bind(*asynchronous.clip) != CHANNEL_RC_OK);
  REQUIRE(asynchronous.clip->custom == nullptr);
}
TEST_CASE("Actual CLIPRDR consumer retirement reentry faults and foreign calls cannot retain text "
          "ownership") {
  for (unsigned mode = 0; mode < 3; ++mode) {
    Host h(false);
    TextSession *ptr = nullptr;
    std::vector<BYTE> observed;
    TextSession owner(
        {true, true, 1024}, [](auto, auto) { return true; },
        [&](auto, auto, auto text) {
          REQUIRE(ptr->request(1, 2) != CHANNEL_RC_OK);
          REQUIRE_FALSE(ptr->snapshot());
          if (mode == 0)
            REQUIRE(ptr->close());
          if (mode == 1)
            return false;
          if (mode == 2)
            throw std::runtime_error("Synthetic clipboard consumer fault");
          observed.assign(text.begin(), text.end());
          return true;
        },
        [] { return 1; });
    ptr = &owner;
    start(h, owner);
    offer(h);
    REQUIRE(owner.request(1, 1) == CHANNEL_RC_OK);
    REQUIRE(h.send(record(5, 1, {65, 0, 0, 0})) == (mode == 0));
    REQUIRE(owner.snapshot()->failed == (mode != 0));
    REQUIRE(h.clip->custom == nullptr);
    if (mode == 0)
      REQUIRE(observed == std::vector<BYTE>{65});
  }
  Host h(false);
  Observer o;
  start(h, o.owner);
  bool foreign_closed = true;
  UINT foreign_write = CHANNEL_RC_OK;
  std::thread foreign([&] {
    foreign_closed = o.owner.close();
    foreign_write = o.owner.set_local(utf8("A"));
  });
  foreign.join();
  REQUIRE_FALSE(foreign_closed);
  REQUIRE(foreign_write != CHANNEL_RC_OK);
  REQUIRE(o.owner.snapshot()->ready);
}
TEST_CASE("CLIPRDR text callback faults retire ownership and preserve a borrowed local response") {
  for (unsigned mode = 0; mode < 3; ++mode) {
    Host h(false);
    Observer o;
    if (mode == 0) {
      h.clip->ClientCapabilities = [](auto *, const CLIPRDR_CAPABILITIES *) -> UINT {
        throw std::runtime_error("Synthetic capability write fault");
      };
      REQUIRE(o.owner.bind(*h.clip) == CHANNEL_RC_OK);
      REQUIRE_FALSE(h.send(record(1, 0)));
    } else {
      start(h, o.owner);
      if (mode == 1) {
        h.clip->ClientFormatList = [](auto *, const CLIPRDR_FORMAT_LIST *) -> UINT {
          return ERROR_NOT_ENOUGH_MEMORY;
        };
        REQUIRE(o.owner.set_local(utf8("A")) != CHANNEL_RC_OK);
      } else {
        offer(h);
        h.clip->ClientFormatDataRequest = [](auto *, const CLIPRDR_FORMAT_DATA_REQUEST *) -> UINT {
          throw std::runtime_error("Synthetic request write fault");
        };
        REQUIRE(o.owner.request(1, 1) != CHANNEL_RC_OK);
      }
    }
    REQUIRE(o.owner.snapshot()->failed);
    REQUIRE(h.clip->custom == nullptr);
  }
  Host h(false);
  Observer o;
  start(h, o.owner);
  REQUIRE(o.owner.set_local(utf8("A")) == CHANNEL_RC_OK);
  REQUIRE(h.send(record(3, 1)));
  h.before_write = [&] { REQUIRE(o.owner.close()); };
  h.clip->ClientFormatDataResponse = [](auto *c, const CLIPRDR_FORMAT_DATA_RESPONSE *r) -> UINT {
    auto &host = Host::get(c->rdpcontext->instance);
    host.before_write();
    REQUIRE(r->common.dataLen == 4);
    // Read the caller's local text after synchronous retirement, before return.
    host.samples.assign(r->requestedFormatData, r->requestedFormatData + r->common.dataLen);
    return CHANNEL_RC_OK;
  };
  REQUIRE(h.send(record(4, 0, {13, 0, 0, 0})));
  REQUIRE(h.samples == std::vector<BYTE>{65, 0, 0, 0});
  REQUIRE(h.clip->custom == nullptr);
  REQUIRE_FALSE(o.owner.snapshot()->failed);
}
TEST_CASE("Actual CLIPRDR refuses over-policy text without retiring the Unicode owner") {
  for (bool fragmented : {false, true}) {
    Host h(false);
    Observer o;
    start(h, o.owner);
    offer(h);
    REQUIRE(o.owner.request(1, 1) == CHANNEL_RC_OK);
    const auto over = record(5, 1, std::vector<BYTE>(2048, 65));
    if (fragmented) {
      REQUIRE(h.send(::bridge::compat::span(over).first(8), CHANNEL_FLAG_FIRST, over.size()));
      REQUIRE(h.guard->stats().allocated == 0);
      REQUIRE(h.guard->stats().discarding);
      REQUIRE(h.send(::bridge::compat::span(over).subspan(8), CHANNEL_FLAG_LAST, over.size()));
    } else
      REQUIRE(h.send(over));
    REQUIRE(o.replies.size() == 1);
    REQUIRE(o.replies[0].id == 1);
    REQUIRE(o.replies[0].status == TextReply::refused);
    REQUIRE(o.replies[0].text.empty());
    REQUIRE(o.owner.snapshot()->ready);
    REQUIRE_FALSE(o.owner.snapshot()->failed);
    REQUIRE(h.guard->stats().quota_refused == 1);
    REQUIRE_FALSE(h.guard->stats().failed);
    REQUIRE(getChannelError(h.context.get()) == CHANNEL_RC_OK);
    offer(h);
    REQUIRE(o.owner.request(1, 2) != CHANNEL_RC_OK);
    REQUIRE(o.owner.request(2, 2) == CHANNEL_RC_OK);
    REQUIRE(h.send(record(5, 1, {65, 0, 0, 0})));
    REQUIRE(o.replies.back().status == TextReply::ok);
    REQUIRE(o.replies.back().text == std::vector<BYTE>{65});
  }
}
TEST_CASE("Actual CLIPRDR UTF8 expansion quota refuses text without retiring the channel") {
  Host h(false);
  Observer o({true, true, 8});
  start(h, o.owner);
  offer(h);
  REQUIRE(o.owner.request(1, 1) == CHANNEL_RC_OK);
  // Three BMP Han characters occupy eight terminated UTF16 bytes but nine UTF8.
  REQUIRE(h.send(record(5, 1, {0x00, 0x4e, 0x01, 0x4e, 0x02, 0x4e, 0, 0})));
  REQUIRE(o.replies.back().status == TextReply::refused);
  REQUIRE(o.replies.back().text.empty());
  REQUIRE(o.owner.snapshot()->ready);
  REQUIRE_FALSE(o.owner.snapshot()->failed);
  REQUIRE(o.owner.request(1, 2) == CHANNEL_RC_OK);
  REQUIRE(h.send(record(5, 1, {65, 0, 0, 0})));
  REQUIRE(o.replies.back().status == TextReply::ok);
}
