#include "test_host.hpp"
#include "worker_session.hpp"
#include <atomic>
#include <thread>

using namespace bridge::clipboard;
using namespace bridge::clipboard::test;
namespace wire = bridge::ipc::clipboard;
namespace {
struct Owner {
  struct Output {
    bridge::ipc::Kind kind;
    std::uint64_t id;
    std::vector<BYTE> bytes;
  };
  std::atomic<std::uint64_t> now{1};
  bool credit = true;
  std::vector<Output> output;
  WorkerSession worker;
  explicit Owner(TextPolicy policy = {true, true, 1024, true, true})
      : worker(
            policy,
            [this](auto kind, auto id, auto bytes) {
              if (kind == bridge::ipc::Kind::clipboard_result && !credit)
                return false;
              output.push_back({kind, id, {bytes.begin(), bytes.end()}});
              return true;
            },
            [this] { return now.load(); }, [](freerdp *i) { return Host::get(i).resolved; }) {}
  ~Owner() { worker.retire(); }
  void start(Host &h) {
    REQUIRE(worker.start(1));
    REQUIRE(worker.pump());
    REQUIRE(worker.bind(*h.clip) == CHANNEL_RC_OK);
    REQUIRE(h.send(record(7, 0, long_caps)));
    REQUIRE(h.send(record(1, 0)));
    REQUIRE(h.send(record(3, 1)));
    REQUIRE(worker.pump());
    REQUIRE(worker.admitted()->ready);
  }
  void offer(Host &h) {
    REQUIRE(h.send(record(2, 0, {17, 0, 0, 0, 0, 0, 13, 0, 0, 0, 0, 0})));
    REQUIRE(worker.pump());
  }
  wire::Result result(std::uint64_t id) {
    REQUIRE(output.back().kind == bridge::ipc::Kind::clipboard_result);
    REQUIRE(output.back().id == id);
    return wire::decode_result(output.back().bytes);
  }
};
const std::array<BYTE, 8> pixels{0x12, 0x34, 0x56, 0x78, 0xfe, 0xdc, 0xba, 0x98};
std::vector<BYTE> inner() { return wire::encode_image_item({2, 1, pixels}); }
std::vector<BYTE> dib() {
  std::vector<BYTE> bytes(132);
  REQUIRE(encode_dibv5_clipboard(pixels, 2, 1, bytes, 1024).status == ImageStatus::ok);
  return bytes;
}
std::vector<BYTE> read(std::uint64_t revision = 1, std::uint64_t generation = 1) {
  return wire::encode_command({wire::Operation::read_image, generation, revision, {}});
}
std::vector<BYTE> set() {
  const auto image = inner();
  return wire::encode_command({wire::Operation::set_image, 1, 0, image});
}
} // namespace

TEST_CASE("Image worker moves one producer command and returns owned checked RGBA only after "
          "remote reply") {
  Host h(false);
  Owner o;
  o.start(h);
  o.offer(h);
  REQUIRE(o.worker.admitted()->image);
  REQUIRE(o.worker.admitted()->remote_image);
  auto command = read();
  std::optional<wire::Status> admission;
  std::thread producer([&] { admission = o.worker.submit(7, command); });
  producer.join();
  REQUIRE_FALSE(admission);
  REQUIRE(command.empty());
  auto competing = wire::encode_command({wire::Operation::read, 1, 1, {}});
  REQUIRE(o.worker.submit(8, competing) == wire::Status::busy);
  REQUIRE(o.worker.pump());
  REQUIRE(h.writes.back() == record(4, 0, {17, 0, 0, 0}));
  REQUIRE(o.worker.admitted()->remote_pending);
  REQUIRE(h.send(record(5, 1, dib())));
  REQUIRE(o.worker.pump());
  const auto result = o.result(7);
  REQUIRE(result.operation == wire::Operation::read_image);
  REQUIRE(result.status == wire::Status::accepted);
  const auto image = wire::decode_image_item(result.text);
  REQUIRE(image.width == 2);
  REQUIRE(image.height == 1);
  REQUIRE(std::equal(image.rgba.begin(), image.rgba.end(), pixels.begin(), pixels.end()));
  REQUIRE_FALSE(o.worker.admitted()->remote_pending);
}

TEST_CASE("Image worker keeps set revoke and result credit in the shared flight") {
  Host h(false);
  Owner o;
  o.start(h);
  auto command = set();
  REQUIRE_FALSE(o.worker.submit(1, command));
  REQUIRE(command.empty());
  REQUIRE(o.worker.pump());
  REQUIRE(h.writes.back() == record(2, 0, {17, 0, 0, 0, 0, 0}));
  REQUIRE(o.worker.admitted()->local_pending);
  auto revoke = wire::encode_command({wire::Operation::revoke, 1, 0, {}});
  REQUIRE(o.worker.submit(2, revoke) == wire::Status::busy);
  REQUIRE(h.send(record(3, 1)));
  o.credit = false;
  REQUIRE(o.worker.pump());
  REQUIRE(o.worker.admitted()->local_image_accepted);
  REQUIRE(o.worker.submit(2, revoke) == wire::Status::busy);
  REQUIRE(h.send(record(4, 0, {17, 0, 0, 0})));
  REQUIRE(h.writes.back() == record(5, 1, dib()));
  o.credit = true;
  REQUIRE(o.worker.pump());
  REQUIRE(o.result(1).status == wire::Status::accepted);
  REQUIRE_FALSE(o.worker.submit(2, revoke));
  REQUIRE(o.worker.pump());
  REQUIRE(h.writes.back() == record(2, 0));
  REQUIRE_FALSE(o.worker.admitted()->local_image_accepted);
  REQUIRE(h.send(record(4, 0, {17, 0, 0, 0})));
  REQUIRE(h.writes.back() == record(5, 2));
  REQUIRE(h.send(record(3, 1)));
  REQUIRE(o.worker.pump());
  REQUIRE(o.result(2).status == wire::Status::accepted);
}

TEST_CASE("Image worker admits complete DIBV5 quota before moving or replacing an item") {
  for (const auto maximum : {131U, 132U}) {
    Host h(false);
    Owner o({true, true, maximum, false, true});
    o.start(h);
    auto command = set();
    const auto original = command;
    const auto admitted = o.worker.submit(1, command);
    if (maximum == 131) {
      REQUIRE(admitted == wire::Status::refused);
      REQUIRE(command == original);
    } else {
      REQUIRE_FALSE(admitted);
      REQUIRE(command.empty());
      REQUIRE(o.worker.pump());
      REQUIRE(h.send(record(3, 1)));
      REQUIRE(o.worker.pump());
      REQUIRE(o.result(1).status == wire::Status::accepted);
    }
  }
}

TEST_CASE("Image worker rejects unselected directions stale identities and retains caller bytes") {
  for (const auto policy :
       {TextPolicy{true, true, 1024, true, false}, TextPolicy{true, false, 1024, false, true},
        TextPolicy{false, true, 1024, false, true}}) {
    Host h(false);
    Owner o(policy);
    o.start(h);
    o.offer(h);
    auto command = read();
    auto original = command;
    const auto admission = o.worker.submit(1, command);
    const auto expected = !policy.image         ? wire::Status::unavailable
                          : !policy.from_server ? wire::Status::refused
                                                : wire::Status::accepted;
    if (expected == wire::Status::accepted) {
      REQUIRE_FALSE(admission);
      REQUIRE(o.worker.pump());
      REQUIRE(h.send(record(5, 2)));
      REQUIRE(o.worker.pump());
    } else {
      REQUIRE(admission == expected);
      REQUIRE(command == original);
    }
    command = set();
    original = command;
    if (!policy.image) {
      REQUIRE(o.worker.submit(2, command) == wire::Status::unavailable);
      REQUIRE(command == original);
    } else if (!policy.to_server) {
      REQUIRE(o.worker.submit(2, command) == wire::Status::refused);
      REQUIRE(command == original);
    }
  }
  Host h(false);
  Owner o;
  o.start(h);
  o.offer(h);
  for (auto command : {read(2), read(1, 2)}) {
    const auto original = command;
    REQUIRE(o.worker.submit(9, command) == wire::Status::stale);
    REQUIRE(command == original);
  }
}

TEST_CASE("Image worker discards held or pending pixels on a newer remote offer") {
  for (bool held : {false, true}) {
    Host h(false);
    Owner o;
    o.start(h);
    o.offer(h);
    auto command = read();
    REQUIRE_FALSE(o.worker.submit(1, command));
    REQUIRE(o.worker.pump());
    if (held) {
      o.credit = false;
      REQUIRE(h.send(record(5, 1, dib())));
      REQUIRE(o.worker.pump());
    }
    o.offer(h);
    if (!held)
      REQUIRE(h.send(record(5, 1, {0xff})));
    o.credit = true;
    REQUIRE(o.worker.pump());
    const auto result = o.result(1);
    REQUIRE(result.status == wire::Status::stale);
    REQUIRE(result.text.empty());
  }
}

TEST_CASE("Image worker dispatch and output deadlines retire ownership without byte replay") {
  for (unsigned mode = 0; mode < 3; ++mode) {
    Host h(false);
    Owner o;
    o.start(h);
    o.offer(h);
    auto command = read();
    REQUIRE_FALSE(o.worker.submit(1, command));
    if (mode == 0) {
      const auto writes = h.writes.size();
      o.now += 250;
      REQUIRE(o.worker.pump());
      REQUIRE(h.writes.size() == writes);
      REQUIRE(o.result(1).status == wire::Status::timeout);
    } else if (mode == 1) {
      REQUIRE(o.worker.pump());
      REQUIRE(h.send(record(5, 1, dib())));
      o.credit = false;
      REQUIRE(o.worker.pump());
      o.now += 1000;
      REQUIRE_FALSE(o.worker.pump());
      REQUIRE_FALSE(o.worker.admitted());
    } else {
      o.worker.retire();
      REQUIRE_FALSE(o.worker.admitted());
      auto next = read();
      const auto original = next;
      REQUIRE(o.worker.submit(2, next) == wire::Status::unavailable);
      REQUIRE(next == original);
    }
  }
}
