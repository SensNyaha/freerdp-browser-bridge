#include "test_host.hpp"
#include "text_session.hpp"
#include <array>
#include <string>
#include <string_view>
#include <thread>

using namespace bridge::clipboard;
using namespace bridge::clipboard::test;
namespace {
using Bytes = ::bridge::compat::span<const std::uint8_t>;
Bytes utf8(std::string_view value) {
  return {reinterpret_cast<const BYTE *>(value.data()), value.size()};
}
std::vector<BYTE> id_bytes(UINT32 id) {
  return {static_cast<BYTE>(id), static_cast<BYTE>(id >> 8), static_cast<BYTE>(id >> 16),
          static_cast<BYTE>(id >> 24)};
}
struct Format {
  UINT32 id;
  const char *name;
};
std::vector<BYTE> list(std::initializer_list<Format> formats, bool long_names = true) {
  std::vector<BYTE> bytes;
  for (const auto &format : formats) {
    const auto id = id_bytes(format.id);
    bytes.insert(bytes.end(), id.begin(), id.end());
    const std::string name = format.name ? format.name : "";
    if (!long_names)
      REQUIRE(name.size() <= 15);
    const auto length = long_names ? name.size() + 1 : 16;
    for (std::size_t i = 0; i < length; ++i) {
      bytes.push_back(i < name.size() ? static_cast<BYTE>(name[i]) : 0);
      bytes.push_back(0);
    }
  }
  return record(2, 0, bytes);
}
// Independently specified on-wire CF_HTML, not produced by the codec under test.
std::vector<BYTE> golden() {
  const std::string text =
      "Version:1.0\r\nStartHTML:0000000105\r\nEndHTML:0000000177\r\n"
      "StartFragment:0000000137\r\nEndFragment:0000000145\r\n"
      "<html><body><!--StartFragment--><b>X</b><!--EndFragment--></body></html>";
  std::vector<BYTE> bytes(text.begin(), text.end());
  bytes.push_back(0);
  return bytes;
}
struct Observer {
  struct Result {
    std::uint64_t id;
    TextReply status;
    std::vector<BYTE> bytes;
    HtmlInspection inspection;
  };
  std::vector<std::pair<std::uint64_t, bool>> offers;
  std::vector<Result> text, html;
  std::function<bool()> on_html;
  std::uint64_t now = 1;
  TextSession owner;
  explicit Observer(TextPolicy policy = {true, true, 1024, true})
      : owner(
            policy,
            [this](auto revision, auto available) {
              offers.emplace_back(revision, available);
              return true;
            },
            [this](auto id, auto status, auto value) {
              text.push_back({id, status, {value.begin(), value.end()}, {}});
              return true;
            },
            [this] { return now; }, [](freerdp *i) { return Host::get(i).resolved; },
            [this](auto id, auto status, HtmlView value) {
              const HtmlInspection inspection{
                  status == TextReply::ok ? TextStatus::ok : TextStatus::invalid,
                  0, value.body.size(), value.fragment_offset, value.fragment_bytes,
                  value.selection_offset, value.selection_bytes, value.context, value.selection};
              html.push_back({id, status, {value.body.begin(), value.body.end()}, inspection});
              return !on_html || on_html();
            }) {}
};
void start(Host &h, TextSession &owner, bool long_names = true) {
  REQUIRE(owner.bind(*h.clip) == CHANNEL_RC_OK);
  if (long_names)
    REQUIRE(h.send(record(7, 0, long_caps)));
  REQUIRE(h.send(record(1, 0)));
  REQUIRE(h.writes.back() == record(2, 0));
  REQUIRE(h.send(record(3, 1)));
}
void request_local(Host &h, UINT32 id) {
  REQUIRE(h.send(record(4, 0, id_bytes(id))));
}
void no_html(const Observer::Result &result, TextReply status) {
  REQUIRE(result.status == status);
  REQUIRE(result.bytes.empty());
  REQUIRE(result.inspection.status == TextStatus::invalid);
  REQUIRE(result.inspection.body_bytes == 0);
  REQUIRE(result.inspection.fragment_bytes == 0);
  REQUIRE_FALSE(result.inspection.context);
  REQUIRE_FALSE(result.inspection.selection);
}
} // namespace

TEST_CASE("Pinned CLIPRDR owner advertises HTML before Unicode and serves neither before one ACK") {
  for (bool long_names : {false, true}) {
    Host h(false);
    Observer o;
    start(h, o.owner, long_names);
    REQUIRE(o.owner.set_local_html(utf8("<b>X</b>"), utf8("X")) == CHANNEL_RC_OK);
    REQUIRE(h.writes.back() == list({{0xc001, "HTML Format"}, {13, nullptr}}, long_names));
    for (UINT32 id : {13U, 0xc001U}) {
      request_local(h, id);
      REQUIRE(h.writes.back() == record(5, 2));
    }
    REQUIRE_FALSE(o.owner.snapshot()->local_html_accepted);
    REQUIRE(h.send(record(3, 1)));
    REQUIRE(o.owner.snapshot()->local_accepted);
    REQUIRE(o.owner.snapshot()->local_html_accepted);
    request_local(h, 0xc001);
    REQUIRE(h.writes.back() == record(5, 1, golden()));
    request_local(h, 13);
    REQUIRE(h.writes.back() == record(5, 1, {88, 0, 0, 0}));
    request_local(h, 0xc000);
    REQUIRE(h.writes.back() == record(5, 2));
  }
}

TEST_CASE("Pinned CLIPRDR HTML uses the peer named ID and preserves full context separately") {
  for (bool long_names : {false, true}) {
    for (UINT32 id : {0x1234U, 0xf0123456U}) {
      Host h(false);
      Observer o;
      start(h, o.owner, long_names);
      REQUIRE(h.send(list({{id, "hTmL fOrMaT"}, {13, nullptr}}, long_names)));
      REQUIRE(o.owner.snapshot()->remote_html);
      REQUIRE(o.owner.snapshot()->remote_text);
      REQUIRE(o.owner.request_html(1, 71) == CHANNEL_RC_OK);
      REQUIRE(h.writes.back() == record(4, 0, id_bytes(id)));
      REQUIRE(o.owner.request(1, 72) != CHANNEL_RC_OK);
      REQUIRE(o.owner.request_html(1, 73) != CHANNEL_RC_OK);
      REQUIRE(h.send(record(5, 1, golden())));
      REQUIRE(o.text.empty());
      REQUIRE(o.html.size() == 1);
      const auto &reply = o.html.back();
      REQUIRE(reply.id == 71);
      REQUIRE(reply.status == TextReply::ok);
      const auto wire = golden();
      REQUIRE(reply.bytes == std::vector<BYTE>(wire.begin() + 105, wire.end() - 1));
      REQUIRE(reply.inspection.context);
      REQUIRE(reply.inspection.body_offset == 0);
      REQUIRE(reply.inspection.body_bytes == 72);
      REQUIRE(reply.inspection.fragment_offset == 32);
      REQUIRE(reply.inspection.fragment_bytes == 8);
      REQUIRE(o.owner.request(1, 72) == CHANNEL_RC_OK);
      REQUIRE(h.writes.back() == record(4, 0, id_bytes(13)));
      REQUIRE(h.send(record(5, 1, {88, 0, 0, 0})));
      REQUIRE(o.text.back().id == 72);
      REQUIRE(o.text.back().bytes == std::vector<BYTE>{88});
    }
  }
}

TEST_CASE("HTML receive preserves rich Unicode context and selection but excludes source metadata") {
  std::string header =
      "Version:1.0\r\nStartHTML:0000000000\r\nEndHTML:0000000000\r\n"
      "StartFragment:0000000000\r\nEndFragment:0000000000\r\n"
      "StartSelection:0000000000\r\nEndSelection:0000000000\r\n"
      "SourceURL:https://example.invalid/unselected-private-metadata\r\n";
  const std::string before = "<html><body>unselected<table><tr><td><!--StartFragment-->";
  const std::string fragment = "<b>\xd0\x96\xe4\xb8\xad\xf0\x9f\x98\x80\r\n</b>";
  const std::string after = "<!--EndFragment--></td></tr></table>unselected</body></html>";
  const auto body = before + fragment + after;
  const auto base = header.size();
  const auto put = [&](const char *key, std::size_t number) {
    const auto begin = header.find(std::string(key) + ':') + std::strlen(key) + 1;
    const auto digits = std::to_string(number);
    header.replace(begin, 10, std::string(10 - digits.size(), '0') + digits);
  };
  put("StartHTML", base);
  put("EndHTML", base + body.size());
  put("StartFragment", base + before.size());
  put("EndFragment", base + before.size() + fragment.size());
  put("StartSelection", base + before.size() + 3);
  put("EndSelection", base + before.size() + 12);
  std::string document = header + body + std::string(8, '\0');
  Host h(false);
  Observer o;
  start(h, o.owner);
  REQUIRE(h.send(list({{0x1234, "HTML Format"}})));
  REQUIRE(o.owner.request_html(1, 1) == CHANNEL_RC_OK);
  REQUIRE(h.send(record(5, 1, {document.begin(), document.end()})));
  const auto &reply = o.html.back();
  REQUIRE(reply.status == TextReply::ok);
  REQUIRE(reply.bytes == std::vector<BYTE>(body.begin(), body.end()));
  REQUIRE(reply.inspection.fragment_offset == before.size());
  REQUIRE(reply.inspection.fragment_bytes == fragment.size());
  REQUIRE(reply.inspection.selection);
  REQUIRE(reply.inspection.selection_offset == before.size() + 3);
  REQUIRE(reply.inspection.selection_bytes == 9);
  const std::string received(reply.bytes.begin(), reply.bytes.end());
  REQUIRE(received.substr(reply.inspection.selection_offset, reply.inspection.selection_bytes) ==
          "\xd0\x96\xe4\xb8\xad\xf0\x9f\x98\x80");
  REQUIRE(received.find("SourceURL") == std::string::npos);
  REQUIRE(received.find("private-metadata") == std::string::npos);
}

TEST_CASE("HTML fallback absence empty text replacement refusal and revoke share one local item") {
  Host h(false);
  Observer o;
  start(h, o.owner);
  REQUIRE(o.owner.set_local_html(utf8("<b>X</b>")) == CHANNEL_RC_OK);
  REQUIRE(h.writes.back() == list({{0xc001, "HTML Format"}}));
  REQUIRE(h.send(record(3, 1)));
  request_local(h, 13);
  REQUIRE(h.writes.back() == record(5, 2));
  REQUIRE(o.owner.set_local_html(utf8("<b>X</b>"), Bytes{}) == CHANNEL_RC_OK);
  REQUIRE(h.send(record(3, 1)));
  request_local(h, 13);
  REQUIRE(h.writes.back() == record(5, 1, {0, 0}));
  REQUIRE(o.owner.set_local(utf8("Y")) == CHANNEL_RC_OK);
  REQUIRE(h.writes.back() == list({{13, nullptr}}));
  REQUIRE(h.send(record(3, 1)));
  REQUIRE_FALSE(o.owner.snapshot()->local_html_accepted);
  request_local(h, 0xc001);
  REQUIRE(h.writes.back() == record(5, 2));
  REQUIRE(o.owner.set_local_html(utf8("<b>X</b>"), utf8("X")) == CHANNEL_RC_OK);
  REQUIRE(h.send(record(3, 2)));
  REQUIRE_FALSE(o.owner.snapshot()->local_accepted);
  REQUIRE_FALSE(o.owner.snapshot()->local_html_accepted);
  for (UINT32 id : {13U, 0xc001U}) {
    request_local(h, id);
    REQUIRE(h.writes.back() == record(5, 2));
  }
  REQUIRE(o.owner.set_local_html(utf8("<b>X</b>"), utf8("X")) == CHANNEL_RC_OK);
  REQUIRE(o.owner.revoke_local() != CHANNEL_RC_OK); // Drain the previous ACK first.
  REQUIRE(h.send(record(3, 1)));
  REQUIRE(o.owner.revoke_local() == CHANNEL_RC_OK);
  REQUIRE(h.writes.back() == record(2, 0));
  REQUIRE(o.owner.set_local_html(utf8("new")) != CHANNEL_RC_OK);
  for (UINT32 id : {13U, 0xc001U}) {
    request_local(h, id);
    REQUIRE(h.writes.back() == record(5, 2));
  }
  REQUIRE(h.send(record(3, 1)));
  REQUIRE_FALSE(o.owner.snapshot()->local_accepted);
  REQUIRE_FALSE(o.owner.snapshot()->local_html_accepted);
  REQUIRE(o.owner.set_local_html(utf8("new")) == CHANNEL_RC_OK);
}

TEST_CASE("HTML item admission checks both encoded sizes atomically and preserves the previous item") {
  for (std::size_t limit : {181U, 182U}) {
    Host h(false);
    Observer o({true, true, limit, true});
    start(h, o.owner);
    const UINT expected = limit == 182 ? CHANNEL_RC_OK : ERROR_INVALID_DATA;
    REQUIRE(o.owner.set_local_html(utf8("<b>X</b>"), utf8("X")) == expected);
    if (limit == 182) {
      REQUIRE(h.send(record(3, 1)));
      request_local(h, 0xc001);
      REQUIRE(h.writes.back() == record(5, 1, golden()));
      continue;
    }
    REQUIRE(o.owner.set_local_html(utf8("B"), utf8("B")) == CHANNEL_RC_OK);
    REQUIRE(h.send(record(3, 1)));
    const auto writes = h.writes.size();
    REQUIRE(o.owner.set_local_html(utf8("<b>X</b>"), utf8("X")) == ERROR_INVALID_DATA);
    REQUIRE(o.owner.set_local_html(utf8("<b>X</b>"), utf8(std::string("x\0y", 3))) == ERROR_INVALID_DATA);
    REQUIRE(o.owner.set_local_html(std::array<BYTE, 1>{0x80}) == ERROR_INVALID_DATA);
    REQUIRE(h.writes.size() == writes);
    REQUIRE(o.owner.snapshot()->local_html_accepted);
    request_local(h, 13);
    REQUIRE(h.writes.back() == record(5, 1, {66, 0, 0, 0}));
  }
}

TEST_CASE("HTML requires explicit format and direction policy with a complete read consumer") {
  for (auto policy : {TextPolicy{true, true, 1024, false}, TextPolicy{true, false, 1024, true},
                      TextPolicy{false, true, 1024, true}, TextPolicy{false, false, 1024, true}}) {
    Host h(false);
    Observer o(policy);
    start(h, o.owner);
    REQUIRE(h.send(list({{0xc123, "HTML Format"}})));
    REQUIRE(o.owner.snapshot()->remote_html == (policy.html && policy.from_server));
    REQUIRE_FALSE(o.owner.snapshot()->remote_text);
    REQUIRE(o.owner.request(1, 1) != CHANNEL_RC_OK);
    if (policy.html && policy.from_server) {
      REQUIRE(o.owner.request_html(1, 1) == CHANNEL_RC_OK);
      REQUIRE(h.send(record(5, 2)));
      no_html(o.html.back(), TextReply::refused);
    } else
      REQUIRE(o.owner.request_html(1, 1) != CHANNEL_RC_OK);
    const auto rc = o.owner.set_local_html(utf8("<b>X</b>"));
    const UINT expected = policy.html && policy.to_server ? CHANNEL_RC_OK : ERROR_INVALID_STATE;
    REQUIRE(rc == expected);
  }
  REQUIRE_THROWS_AS(
      TextSession(TextPolicy{true, true, 1024, true}, [](auto, auto) { return true; },
                  [](auto, auto, auto) { return true; }, [] { return 1; }),
      std::invalid_argument);
}

TEST_CASE("HTML item quota covers aggregate UTF8 even when the Unicode representation shrinks") {
  Host h(false);
  Observer o;
  start(h, o.owner);
  std::string han;
  for (unsigned i = 0; i < 300; ++i)
    han += "\xe4\xb8\xad";
  const std::string fragment(250, 'A');
  // Wire representations alone would fit: 420 CF_HTML + 602 Unicode = 1022.
  // Their original UTF8 item is 250 + 900 = 1150, exceeding the same 1024 cap.
  const auto writes = h.writes.size();
  REQUIRE(o.owner.set_local_html(utf8(fragment), utf8(han)) == ERROR_INVALID_DATA);
  REQUIRE(h.writes.size() == writes);
  REQUIRE_FALSE(o.owner.snapshot()->local_accepted);
  REQUIRE(o.owner.snapshot()->ready);
}

TEST_CASE("HTML and Unicode remote requests share a flight and new lists retire old mappings") {
  Host h(false);
  Observer o;
  start(h, o.owner);
  REQUIRE(h.send(list({{0xc123, "HTML Format"}, {13, nullptr}})));
  REQUIRE(o.owner.request_html(1, 1) == CHANNEL_RC_OK);
  REQUIRE(h.send(list({{0xf234, "HTML Format"}})));
  REQUIRE(o.owner.request_html(2, 2) != CHANNEL_RC_OK);
  REQUIRE(h.send(record(5, 1, {0xff}))); // Stale data is never parsed or exposed.
  REQUIRE(o.html.back().id == 1);
  no_html(o.html.back(), TextReply::stale);
  REQUIRE(o.owner.request_html(1, 2) != CHANNEL_RC_OK);
  REQUIRE(o.owner.request_html(2, 0) != CHANNEL_RC_OK);
  REQUIRE(o.owner.request_html(2, 2) == CHANNEL_RC_OK);
  REQUIRE(h.writes.back() == record(4, 0, id_bytes(0xf234)));
  REQUIRE(h.send(record(5, 1, golden())));
  REQUIRE(h.send(list({{13, nullptr}})));
  REQUIRE_FALSE(o.owner.snapshot()->remote_html);
  REQUIRE(o.owner.request_html(3, 3) != CHANNEL_RC_OK);
  REQUIRE(o.owner.request(3, 3) == CHANNEL_RC_OK);
  REQUIRE(h.send(list({{0x1234, "HTML Format"}})));
  REQUIRE(h.send(record(5, 1, {88, 0, 0, 0})));
  REQUIRE(o.text.back().status == TextReply::stale);
  REQUIRE(o.text.back().bytes.empty());
  REQUIRE(o.owner.request_html(4, 4) == CHANNEL_RC_OK);
  REQUIRE(h.send(record(5, 2)));
  no_html(o.html.back(), TextReply::refused);
}

TEST_CASE("HTML ambiguous name and ID mappings retire ownership before issuing any remote request") {
  for (const auto &formats : {
           list({{0, "HTML Format"}}), list({{13, "HTML Format"}}),
           list({{0xc001, "HTML Format"}, {0xc001, "other"}}),
           list({{0xc001, "HTML Format"}, {0xc002, "html format"}})}) {
    Host h(false);
    Observer o;
    start(h, o.owner);
    REQUIRE_FALSE(h.send(formats));
    REQUIRE(o.owner.snapshot()->failed);
    REQUIRE_FALSE(o.owner.snapshot()->remote_html);
    REQUIRE(o.html.empty());
    REQUIRE(o.owner.request_html(1, 1) != CHANNEL_RC_OK);
  }
  Host h(false);
  Observer o;
  start(h, o.owner);
  REQUIRE(h.send(list({{0xc001, "HTML FormatX"}, {0xc002, "HTML"}, {0xc003, nullptr}})));
  REQUIRE_FALSE(o.owner.snapshot()->remote_html);
}

TEST_CASE("HTML quota refusal does not poison the channel and invalid current HTML retires it") {
  Host h(false);
  Observer o;
  start(h, o.owner);
  REQUIRE(h.send(list({{0xc001, "HTML Format"}})));
  REQUIRE(o.owner.request_html(1, 1) == CHANNEL_RC_OK);
  REQUIRE(h.send(record(5, 1, std::vector<BYTE>(2048, 65))));
  REQUIRE(h.guard->stats().quota_refused == 1);
  no_html(o.html.back(), TextReply::refused);
  REQUIRE(o.owner.snapshot()->ready);
  REQUIRE(o.owner.request_html(1, 2) == CHANNEL_RC_OK);
  REQUIRE(h.send(record(5, 1, golden())));
  REQUIRE(o.html.back().status == TextReply::ok);
  REQUIRE(o.owner.request_html(1, 3) == CHANNEL_RC_OK);
  REQUIRE_FALSE(h.send(record(5, 1, {60, 98, 62})));
  REQUIRE(o.owner.snapshot()->failed);
  REQUIRE(o.html.size() == 2);
  REQUIRE(h.clip->custom == nullptr);
}

TEST_CASE("HTML consumer reentry fault timeout and foreign calls cannot retain or replace ownership") {
  for (unsigned mode = 0; mode < 4; ++mode) {
    Host h(false);
    Observer o;
    start(h, o.owner);
    REQUIRE(o.owner.set_local_html(utf8("<b>X</b>"), utf8("X")) == CHANNEL_RC_OK);
    REQUIRE(h.send(record(3, 1)));
    REQUIRE(h.send(list({{0xc123, "HTML Format"}})));
    REQUIRE(o.owner.request_html(1, 1) == CHANNEL_RC_OK);
    if (mode == 3) {
      o.now = 5001;
      REQUIRE_FALSE(o.owner.poll());
      REQUIRE(o.html.empty());
    } else {
      o.on_html = [&] {
        REQUIRE(o.owner.request_html(1, 2) != CHANNEL_RC_OK);
        REQUIRE(o.owner.set_local_html(utf8("new")) != CHANNEL_RC_OK);
        if (mode == 0)
          return o.owner.close();
        if (mode == 1)
          return false;
        throw std::runtime_error("Synthetic HTML callback fault");
      };
      REQUIRE(h.send(record(5, 1, golden())) == (mode == 0));
      const auto wire = golden();
      REQUIRE(o.html.back().bytes == std::vector<BYTE>(wire.begin() + 105, wire.end() - 1));
    }
    REQUIRE(h.clip->custom == nullptr);
    REQUIRE_FALSE(o.owner.snapshot()->local_accepted);
    REQUIRE_FALSE(o.owner.snapshot()->local_html_accepted);
    REQUIRE_FALSE(o.owner.snapshot()->remote_html);
    REQUIRE(o.owner.snapshot()->failed == (mode != 0));
  }
  Host h(false);
  Observer o;
  start(h, o.owner);
  UINT rc = CHANNEL_RC_OK;
  std::thread foreign([&] { rc = o.owner.set_local_html(utf8("foreign")); });
  foreign.join();
  REQUIRE(rc != CHANNEL_RC_OK);
  REQUIRE(o.owner.snapshot()->ready);
}

TEST_CASE("HTML local borrow survives reentrant close until the SDK response callback returns") {
  Host h(false);
  Observer o;
  start(h, o.owner);
  REQUIRE(o.owner.set_local_html(utf8("<b>X</b>"), utf8("X")) == CHANNEL_RC_OK);
  REQUIRE(h.send(record(3, 1)));
  h.before_write = [&] { REQUIRE(o.owner.close()); };
  h.clip->ClientFormatDataResponse = [](auto *c, const CLIPRDR_FORMAT_DATA_RESPONSE *r) -> UINT {
    auto &host = Host::get(c->rdpcontext->instance);
    host.before_write();
    REQUIRE(r->common.msgFlags == CB_RESPONSE_OK);
    host.samples.assign(r->requestedFormatData, r->requestedFormatData + r->common.dataLen);
    return CHANNEL_RC_OK;
  };
  request_local(h, 0xc001);
  REQUIRE(h.samples == golden());
  REQUIRE(h.clip->custom == nullptr);
  REQUIRE_FALSE(o.owner.snapshot()->local_html_accepted);
}
