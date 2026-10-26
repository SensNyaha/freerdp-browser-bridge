#include "../compat/span.hpp"
#include "test_host.hpp"
#include "worker_session.hpp"
#include <atomic>
#include <thread>
using namespace bridge::clipboard;
using namespace bridge::clipboard::test;
namespace wire = bridge::ipc::clipboard;
using bridge::ipc::Kind;
namespace {
::bridge::compat::span<const BYTE> html_bytes(std::string_view value) {
  return {reinterpret_cast<const BYTE *>(value.data()),value.size()};
}
std::vector<BYTE> html_wire() {
  const std::string value="Version:1.0\r\nStartHTML:0000000105\r\nEndHTML:0000000177\r\n"
    "StartFragment:0000000137\r\nEndFragment:0000000145\r\n"
    "<html><body><!--StartFragment--><b>X</b><!--EndFragment--></body></html>";
  std::vector<BYTE> bytes(value.begin(),value.end());bytes.push_back(0);return bytes;
}
struct Owner {
  struct Record {
    Kind kind;
    std::uint64_t id;
    std::vector<std::uint8_t> bytes;
  };
  std::atomic<std::uint64_t> now{1};
  bool state_credit = true, result_credit = true;
  unsigned attempts = 0;
  std::vector<Record> records;
  std::function<void(Kind)> before_send;
  WorkerSession session;
  explicit Owner(TextPolicy policy = {true, true, 1024})
      : session(
            policy,
            [this](auto kind, auto id, auto bytes) {
              if (before_send)
                before_send(kind);
              if (kind == Kind::clipboard_state ? !state_credit : !result_credit) {
                ++attempts;
                return false;
              }
              records.push_back({kind, id, {bytes.begin(), bytes.end()}});
              return true;
            },
            [this] { return now.load(); }, [](freerdp *i) { return Host::get(i).resolved; }) {}
  ~Owner() { session.retire(); }
  void start(Host &h) {
    REQUIRE(session.start(1));
    REQUIRE(session.pump());
    REQUIRE_FALSE(session.admitted()->ready);
    REQUIRE(session.bind(*h.clip) == CHANNEL_RC_OK);
    REQUIRE(h.send(record(7, 0, long_caps)));
    REQUIRE(h.send(record(1, 0)));
    REQUIRE(h.send(record(3, 1)));
    REQUIRE(session.pump());
    REQUIRE(session.admitted()->ready);
  }
  void offer(Host &h) {
    REQUIRE(h.send(record(2, 0, {13, 0, 0, 0, 0, 0})));
    REQUIRE(session.pump());
  }
  std::vector<std::uint8_t> read(std::uint64_t revision = 1, std::uint64_t generation = 1) {
    return wire::encode_command({wire::Operation::read, generation, revision, {}});
  }
  std::vector<std::uint8_t> set(::bridge::compat::span<const std::uint8_t> bytes) {
    return wire::encode_command({wire::Operation::set, 1, 0, bytes});
  }
  wire::Result result(std::uint64_t id) const {
    REQUIRE(records.back().kind == Kind::clipboard_result);
    REQUIRE(records.back().id == id);
    return wire::decode_result(records.back().bytes);
  }
};
} // namespace
TEST_CASE("Clipboard worker handoff moves one cross-thread command and waits for actual data") {
  Host h(false);
  Owner o;
  o.start(h);
  o.offer(h);
  auto bytes = o.read();
  std::optional<wire::Status> admission;
  std::thread producer([&] { admission = o.session.submit(7, bytes); });
  producer.join();
  REQUIRE_FALSE(admission);
  REQUIRE(bytes.empty());
  auto duplicate = o.read();
  REQUIRE(o.session.submit(8, duplicate) == wire::Status::busy);
  REQUIRE(o.session.pump());
  REQUIRE(h.writes.back() == record(4, 0, {13, 0, 0, 0}));
  REQUIRE(o.session.admitted()->remote_pending);
  REQUIRE(h.send(record(5, 1, {0x16, 4, 0, 0})));
  REQUIRE(o.session.pump());
  const auto result = o.result(7);
  REQUIRE(result.status == wire::Status::accepted);
  REQUIRE(std::vector(result.text.begin(), result.text.end()) == std::vector<BYTE>{0xd0, 0x96});
  REQUIRE_FALSE(o.session.admitted()->remote_pending);
}
TEST_CASE("HTML worker set owns both formats through ACK and shared revoke result credit") {
  Host h(false);Owner o({true,true,1024,true});o.start(h);
  REQUIRE(o.session.admitted()->html);
  const wire::HtmlItem item{html_bytes("<b>X</b>"),0,8,0,0,false,false,html_bytes("X")};
  const auto inner=wire::encode_html_item(item);
  auto set=wire::encode_command({wire::Operation::set_html,1,0,inner});
  REQUIRE_FALSE(o.session.submit(1,set));REQUIRE(set.empty());REQUIRE(o.session.pump());
  REQUIRE(o.session.admitted()->local_pending);
  REQUIRE_FALSE(o.session.admitted()->local_html_accepted);
  auto revoke=wire::encode_command({wire::Operation::revoke,1,0,{}});
  REQUIRE(o.session.submit(2,revoke)==wire::Status::busy);
  REQUIRE(h.send(record(3,1)));REQUIRE(o.session.pump());
  REQUIRE(o.result(1).status==wire::Status::accepted);
  REQUIRE(o.session.admitted()->local_html_accepted);
  REQUIRE(h.send(record(4,0,{1,192,0,0})));
  REQUIRE(h.writes.back()==record(5,1,html_wire()));
  REQUIRE_FALSE(o.session.submit(2,revoke));REQUIRE(o.session.pump());
  REQUIRE_FALSE(o.session.admitted()->local_html_accepted);
  REQUIRE(h.writes.back()==record(2,0));
  REQUIRE(h.send(record(3,1)));o.result_credit=false;REQUIRE(o.session.pump());
  auto replacement=wire::encode_command({wire::Operation::set_html,1,0,inner});
  REQUIRE(o.session.submit(3,replacement)==wire::Status::busy);
  REQUIRE(h.send(record(4,0,{1,192,0,0})));REQUIRE(h.writes.back()==record(5,2));
  o.result_credit=true;REQUIRE(o.session.pump());REQUIRE(o.result(2).status==wire::Status::accepted);
}
TEST_CASE("HTML worker gathers one revision with optional Unicode fallback and exact aggregate quota") {
  for(bool fallback:{false,true})for(std::size_t maximum:{181U,182U}) {
    Host h(false);Owner o({true,true,maximum,true});o.start(h);
    std::vector<BYTE> formats{0x34,0x12,0,0};
    for(const auto c:std::string_view("HTML Format")){formats.push_back(static_cast<BYTE>(c));formats.push_back(0);}
    formats.insert(formats.end(),{0,0});
    if(fallback)formats.insert(formats.end(),{13,0,0,0,0,0});
    REQUIRE(h.send(record(2,0,formats)));REQUIRE(o.session.pump());
    REQUIRE(o.session.admitted()->remote_html);
    auto request=wire::encode_command({wire::Operation::read_html,1,1,{}});
    REQUIRE_FALSE(o.session.submit(7,request));REQUIRE(o.session.pump());
    REQUIRE(h.writes.back()==record(4,0,{0x34,0x12,0,0}));
    REQUIRE(h.send(record(5,1,html_wire())));REQUIRE(o.session.pump());
    if(fallback) {
      REQUIRE(o.session.admitted()->remote_pending);
      REQUIRE(h.writes.back()==record(4,0,{13,0,0,0}));
      auto competing=o.read();REQUIRE(o.session.submit(8,competing)==wire::Status::busy);
      REQUIRE(h.send(record(5,1,{88,0,0,0})));REQUIRE(o.session.pump());
    }
    const auto result=o.result(7);
    if(fallback&&maximum==181){REQUIRE(result.status==wire::Status::refused);REQUIRE(result.text.empty());}
    else {
      REQUIRE(result.status==wire::Status::accepted);
      const auto item=wire::decode_html_item(result.text,maximum);
      REQUIRE(item.context);REQUIRE(item.body.size()==72);
      REQUIRE(item.fragment_offset==32);REQUIRE(item.fragment_bytes==8);
      REQUIRE(item.text.has_value()==fallback);
      if(fallback)REQUIRE(std::vector(item.text->begin(),item.text->end())==std::vector<BYTE>{88});
    }
    REQUIRE_FALSE(o.session.admitted()->remote_pending);
  }
}
TEST_CASE("HTML worker never returns a partial item after replacement refusal or result backpressure") {
  for(unsigned mode=0;mode<4;++mode) {
    Host h(false);Owner o({true,true,1024,true});o.start(h);
    std::vector<BYTE> formats{0x34,0x12,0,0};
    for(const auto c:std::string_view("HTML Format")){formats.push_back(static_cast<BYTE>(c));formats.push_back(0);}
    formats.insert(formats.end(),{0,0,13,0,0,0,0,0});
    REQUIRE(h.send(record(2,0,formats)));REQUIRE(o.session.pump());
    auto request=wire::encode_command({wire::Operation::read_html,1,1,{}});
    REQUIRE_FALSE(o.session.submit(1,request));REQUIRE(o.session.pump());
    REQUIRE(h.send(record(5,1,html_wire())));
    if(mode==0)REQUIRE(h.send(record(2,0,formats)));
    REQUIRE(o.session.pump());
    if(mode!=0) {
      if(mode==1)REQUIRE(h.send(record(2,0,formats)));
      REQUIRE(h.send(record(5,mode==2?2:1,mode==2?std::vector<BYTE>{}:std::vector<BYTE>{88,0,0,0})));
      if(mode==3){o.result_credit=false;REQUIRE(o.session.pump());REQUIRE(h.send(record(2,0,formats)));o.result_credit=true;}
      REQUIRE(o.session.pump());
    }
    const auto result=o.result(1);
    REQUIRE(result.status==(mode==2?wire::Status::refused:wire::Status::stale));
    REQUIRE(result.text.empty());
  }
}
TEST_CASE("HTML worker aggregate deadline cannot be revived by a late second response before poll") {
  Host h(false);Owner o({true,true,1024,true});o.start(h);
  std::vector<BYTE> formats{0x34,0x12,0,0};
  for(const auto c:std::string_view("HTML Format")){formats.push_back(static_cast<BYTE>(c));formats.push_back(0);}
  formats.insert(formats.end(),{0,0,13,0,0,0,0,0});
  REQUIRE(h.send(record(2,0,formats)));REQUIRE(o.session.pump());
  auto request=wire::encode_command({wire::Operation::read_html,1,1,{}});
  REQUIRE_FALSE(o.session.submit(1,request));REQUIRE(o.session.pump());
  o.now=4999;REQUIRE(h.send(record(5,1,html_wire())));
  o.now=9999;REQUIRE(o.session.pump()); // Second SDK deadline is now 14999.
  o.now=10001;REQUIRE_FALSE(h.send(record(5,1,{88,0,0,0})));
  REQUIRE_FALSE(o.session.pump());REQUIRE_FALSE(o.session.admitted());
  REQUIRE(h.clip->custom==nullptr);
}
TEST_CASE("HTML worker opt-in and encoded quota admission preserve caller-owned refused payloads") {
  for(bool html:{false,true}) {
    Host h(false);Owner o({true,true,181,html});o.start(h);
    const wire::HtmlItem item{html_bytes("<b>X</b>"),0,8,0,0,false,false,html_bytes("X")};
    const auto inner=wire::encode_html_item(item);
    auto request=wire::encode_command({wire::Operation::set_html,1,0,inner});
    const auto copy=request;
    REQUIRE(o.session.submit(1,request)==(html?wire::Status::refused:wire::Status::unavailable));
    REQUIRE(request==copy);
    REQUIRE(o.session.pump());REQUIRE_FALSE(o.session.admitted()->local_pending);
  }
}
TEST_CASE("Clipboard worker set completes only after peer ACK and preserves text serving") {
  Host h(false);
  Owner o;
  o.start(h);
  const std::vector<BYTE> text{65, 10};
  auto bytes = o.set(text);
  REQUIRE_FALSE(o.session.submit(9, bytes));
  REQUIRE(o.session.pump());
  REQUIRE(o.session.admitted()->local_pending);
  REQUIRE(o.records.back().kind == Kind::clipboard_state);
  REQUIRE(h.send(record(3, 1)));
  REQUIRE(o.session.pump());
  REQUIRE(o.result(9).status == wire::Status::accepted);
  REQUIRE(h.send(record(4, 0, {13, 0, 0, 0})));
  REQUIRE(h.writes.back() == record(5, 1, {65, 0, 13, 0, 10, 0, 0, 0}));
  bytes = o.set({});
  REQUIRE_FALSE(o.session.submit(10, bytes));
  REQUIRE(o.session.pump());
  REQUIRE(h.send(record(3, 2)));
  REQUIRE(o.session.pump());
  REQUIRE(o.result(10).status == wire::Status::refused);
  REQUIRE_FALSE(o.session.admitted()->local_accepted);
}
TEST_CASE("Clipboard worker revoke owns one empty-list ACK through result backpressure") {
  for (unsigned mode = 0; mode < 4; ++mode) {
    Host h(false);
    Owner o;
    o.start(h);
    auto bytes = o.set(std::vector<BYTE>{65});
    REQUIRE_FALSE(o.session.submit(1, bytes));
    REQUIRE(o.session.pump());
    auto revoke = wire::encode_command({wire::Operation::revoke, 1, 0, {}});
    REQUIRE(o.session.submit(2, revoke) == wire::Status::busy);
    REQUIRE(h.send(record(3, 1)));
    REQUIRE(o.session.pump());
    REQUIRE(o.result(1).status == wire::Status::accepted);
    REQUIRE_FALSE(o.session.submit(2, revoke));
    REQUIRE(o.session.pump());
    REQUIRE(h.writes.back() == record(2, 0));
    REQUIRE_FALSE(o.session.admitted()->local_accepted);
    REQUIRE(o.session.admitted()->local_pending);
    REQUIRE(h.send(record(4, 0, {13, 0, 0, 0})));
    REQUIRE(h.writes.back() == record(5, 2));
    if (mode == 3) {
      o.now = 5001;
      REQUIRE_FALSE(o.session.pump());
      REQUIRE_FALSE(o.session.admitted());
      continue;
    }
    o.result_credit = mode != 1;
    REQUIRE(h.send(record(3, mode == 2 ? 2 : 1)));
    REQUIRE(o.session.pump());
    if (mode == 1) {
      bytes = o.set({});
      REQUIRE(o.session.submit(3, bytes) == wire::Status::busy);
      REQUIRE(h.send(record(4, 0, {13, 0, 0, 0})));
      REQUIRE(h.writes.back() == record(5, 2));
      o.result_credit = true;
      REQUIRE(o.session.pump());
    }
    REQUIRE(o.result(2).operation == wire::Operation::revoke);
    REQUIRE(o.result(2).status == (mode == 2 ? wire::Status::refused : wire::Status::accepted));
    REQUIRE_FALSE(o.session.admitted()->local_accepted);
    REQUIRE_FALSE(o.session.admitted()->local_pending);
  }
  Host h(false);
  Owner o({false, true, 1});
  o.start(h);
  auto revoke = wire::encode_command({wire::Operation::revoke, 1, 0, {}});
  REQUIRE_FALSE(o.session.submit(1, revoke));
  const auto writes = h.writes.size();
  REQUIRE(o.session.pump());
  REQUIRE(o.result(1).status == wire::Status::accepted);
  REQUIRE(h.writes.size() == writes);
}
TEST_CASE(
    "Clipboard worker admission uses published authority and dispatch rechecks current offers") {
  Host h(false);
  Owner o;
  REQUIRE(o.session.start(1));
  REQUIRE(o.session.bind(*h.clip) == CHANNEL_RC_OK);
  REQUIRE(h.send(record(1, 0)));
  REQUIRE(h.send(record(3, 1)));
  o.state_credit = false;
  REQUIRE(o.session.pump());
  auto bytes = o.set({});
  REQUIRE(o.session.submit(1, bytes) == wire::Status::unavailable);
  REQUIRE_FALSE(bytes.empty());
  o.state_credit = true;
  REQUIRE(o.session.pump());
  REQUIRE(h.send(record(2, 0, std::vector<BYTE>(36, 0)))); // No Unicode.
  REQUIRE(o.session.pump());
  bytes = o.read();
  REQUIRE(o.session.submit(1, bytes) == wire::Status::refused);
  REQUIRE(h.send(record(2, 0, {13, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                               0,  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0})));
  REQUIRE(o.session.pump());
  bytes = o.read(2, 2);
  REQUIRE(o.session.submit(1, bytes) == wire::Status::stale);
  bytes = o.read(2);
  REQUIRE_FALSE(o.session.submit(3, bytes));
  REQUIRE(h.send(record(2, 0))); // Change between producer and RDP dispatch.
  const auto writes = h.writes.size();
  REQUIRE(o.session.pump());
  REQUIRE(o.result(3).status == wire::Status::stale);
  REQUIRE(h.writes.size() == writes); // No data request.
}
TEST_CASE("Clipboard worker blocked result is not reread and cannot outlive its offer") {
  Host h(false);
  Owner o;
  o.start(h);
  o.offer(h);
  auto bytes = o.read();
  REQUIRE_FALSE(o.session.submit(11, bytes));
  REQUIRE(o.session.pump());
  REQUIRE(h.send(record(5, 1, {65, 0, 0, 0})));
  o.result_credit = false;
  const auto writes = h.writes.size();
  for (unsigned i = 0; i < 4; ++i)
    REQUIRE(o.session.pump());
  REQUIRE(h.writes.size() == writes);
  REQUIRE(o.attempts == 4);
  bytes = o.read();
  REQUIRE(o.session.submit(12, bytes) == wire::Status::busy);
  o.offer(h);
  o.result_credit = true;
  REQUIRE(o.session.pump());
  REQUIRE(o.result(11).status == wire::Status::stale);
  REQUIRE(o.result(11).text.empty());
  REQUIRE(h.writes.size() == writes + 1); // Only new offer ACK.
}
TEST_CASE("Clipboard worker deadlines retire authority without retrying uncertain remote work") {
  for (unsigned mode = 0; mode < 4; ++mode) {
    Host h(false);
    Owner o;
    o.start(h);
    o.offer(h);
    auto bytes = o.read();
    REQUIRE_FALSE(o.session.submit(1, bytes));
    if (mode == 0) {
      o.now = 251;
      REQUIRE(o.session.pump());
      REQUIRE(o.result(1).status == wire::Status::timeout);
      continue; // Expired before any RDP dispatch: session remains usable.
    }
    REQUIRE(o.session.pump());
    if (mode == 1)
      o.now = 5001; // Native response deadline permanently retires owner.
    else if (mode == 2) {
      REQUIRE(h.send(record(5, 1, {65, 0, 0, 0})));
      o.result_credit = false;
      REQUIRE(o.session.pump());
      o.now = 1001;
    } else
      o.now = 0; // Clock regression.
    REQUIRE_FALSE(o.session.pump());
    REQUIRE_FALSE(o.session.admitted());
    REQUIRE(h.clip->custom == nullptr);
    bytes = o.read();
    REQUIRE(o.session.submit(2, bytes) == wire::Status::unavailable);
    REQUIRE_FALSE(o.session.start(2));
  }
}
TEST_CASE("Clipboard worker policy, faults and retirement preserve callback and thread ownership") {
  Host h(false);
  Owner o({false, true, 4});
  o.start(h);
  auto bytes = o.set({});
  REQUIRE(o.session.submit(1, bytes) == wire::Status::refused);
  bytes = o.set(std::vector<BYTE>{65, 66});
  REQUIRE(o.session.submit(1, bytes) == wire::Status::refused); // Unicode NUL counts.
  bool foreign_pump = true;
  std::thread foreign([&] {
    foreign_pump = o.session.pump();
    o.session.retire();
  });
  foreign.join();
  REQUIRE_FALSE(foreign_pump);
  REQUIRE(o.session.admitted()->ready);
  o.before_send = [&](auto) { o.session.retire(); };
  REQUIRE(h.send(record(2, 0, {13, 0, 0, 0, 0, 0})));
  REQUIRE_FALSE(o.session.pump());
  REQUIRE_FALSE(o.session.admitted());
  REQUIRE(h.clip->custom == nullptr);
}
TEST_CASE("Clipboard worker lifetime constructs and releases SDK ownership on the RDP thread") {
  Owner o;
  std::thread rdp([&] {
    Host h(false);
    o.start(h);
    o.session.retire();
    REQUIRE(h.clip->custom == nullptr);
  });
  rdp.join();
  REQUIRE_FALSE(o.session.admitted());
  // Owner destruction now occurs on the original root thread, after join.
}
TEST_CASE(
    "Clipboard worker publication faults and initial credit timeout revoke producer authority") {
  for (bool throws : {false, true}) {
    Host h(false);
    Owner o;
    REQUIRE(o.session.start(1));
    REQUIRE(o.session.bind(*h.clip) == CHANNEL_RC_OK);
    if (throws)
      o.before_send = [](auto) { throw std::runtime_error("Synthetic output fault"); };
    else {
      o.state_credit = false;
      REQUIRE(o.session.pump());
      o.now = 1001;
    }
    REQUIRE_FALSE(o.session.pump());
    REQUIRE_FALSE(o.session.admitted());
    REQUIRE(h.clip->custom == nullptr);
  }
  Owner o;
  auto bad = o.set({});
  bad[0] = 1;
  REQUIRE(o.session.submit(1, bad) == wire::Status::invalid);
  auto valid = o.set({});
  REQUIRE(o.session.submit(0, valid) == wire::Status::invalid);
  REQUIRE_FALSE(o.session.start(0));
}
