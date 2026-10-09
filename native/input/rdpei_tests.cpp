#include "rdpei.hpp"
#include <catch2/catch_test_macros.hpp>
#include <vector>
#include <winpr/error.h>
#include <winpr/wtsapi.h>
using namespace bridge::touch;
namespace {
struct Write {
  INT32 external, x, y;
  UINT32 flags, fields;
};
struct Fixture {
  RdpeiClientContext context{};
  UINT status = CHANNEL_RC_OK;
  INT32 contact = 0;
  std::vector<Write> writes;
  Fixture() {
    context.handle = this; // Replaces only the public API call, not contact state.
    context.TouchRawEvent = raw;
  }
  static UINT raw(RdpeiClientContext *c, INT32 external, INT32 x, INT32 y, INT32 *contact,
                  UINT32 flags, UINT32 fields, ...) {
    auto &f = *static_cast<Fixture *>(c->handle);
    f.writes.push_back({external, x, y, flags, fields});
    *contact = f.contact;
    return f.status;
  }
  bool send(const Event &event) { return send_rdpei(&context, event); }
};
} // namespace
TEST_CASE("RDPEI projection uses only valid contact flags and preserves signed API bounds") {
  Fixture f;
  for (const auto action : {Action::begin, Action::update, Action::end, Action::cancel})
    REQUIRE(f.send({action, 0x7fffffffU, 7679, 4319}));
  REQUIRE(f.writes.size() == 4);
  REQUIRE(f.writes[0].flags == (RDPINPUT_CONTACT_FLAG_DOWN | RDPINPUT_CONTACT_FLAG_INRANGE |
                                RDPINPUT_CONTACT_FLAG_INCONTACT));
  REQUIRE(f.writes[1].flags == (RDPINPUT_CONTACT_FLAG_UPDATE | RDPINPUT_CONTACT_FLAG_INRANGE |
                                RDPINPUT_CONTACT_FLAG_INCONTACT));
  REQUIRE(f.writes[2].flags == RDPINPUT_CONTACT_FLAG_UP);
  REQUIRE(f.writes[3].flags == (RDPINPUT_CONTACT_FLAG_UP | RDPINPUT_CONTACT_FLAG_CANCELED));
  for (const auto &write : f.writes) {
    REQUIRE(write.external == 0x7fffffff);
    REQUIRE(write.x == 7679);
    REQUIRE(write.y == 4319);
    REQUIRE(write.fields == 0);
  }
}
TEST_CASE("RDPEI validates records and missing API before a public call") {
  Fixture f;
  for (const auto event : {Event{static_cast<Action>(255), 1, 1, 1},
                           {Action::begin, 0x80000000U, 1, 1},
                           {Action::begin, 1, 7680, 1},
                           {Action::begin, 1, 1, 4320}})
    REQUIRE_FALSE(f.send(event));
  REQUIRE_FALSE(send_rdpei(nullptr, {Action::begin, 1, 1, 1}));
  f.context.TouchRawEvent = nullptr;
  REQUIRE_FALSE(f.send({Action::begin, 1, 1, 1}));
  f.context = {};
  REQUIRE_FALSE(f.send({Action::begin, 1, 1, 1}));
  REQUIRE(f.writes.empty());
}
TEST_CASE("RDPEI OK without a contact ID and actual API errors are not accepted") {
  Fixture f;
  f.contact = -1;
  REQUIRE_FALSE(f.send({Action::begin, 1, 1, 1}));
  f.contact = 0;
  f.status = ERROR_INTERNAL_ERROR;
  REQUIRE_FALSE(f.send({Action::begin, 1, 1, 1}));
  f.status = CHANNEL_RC_OK;
  REQUIRE(f.send({Action::begin, 1, 1, 1}));
}
TEST_CASE("RDPEI state bridge preserves ordered UPDATE then UP and failed cancellation retry") {
  Fixture f;
  State state;
  const State::Sink sink = [&](const auto &event) { return f.send(event); };
  REQUIRE(state.apply({Action::begin, 1, 20, 30}, sink, 1920, 1080) == Result::accepted);
  REQUIRE(state.apply({Action::end, 1, 40, 50}, sink, 1920, 1080) == Result::accepted);
  REQUIRE(f.writes.size() == 3);
  REQUIRE(f.writes[1].flags == (RDPINPUT_CONTACT_FLAG_UPDATE | RDPINPUT_CONTACT_FLAG_INRANGE |
                                RDPINPUT_CONTACT_FLAG_INCONTACT));
  REQUIRE(f.writes[2].flags == RDPINPUT_CONTACT_FLAG_UP);
  REQUIRE(f.writes[1].x == f.writes[2].x);
  REQUIRE(f.writes[1].y == f.writes[2].y);
  REQUIRE(state.apply({Action::begin, 2, 60, 70}, sink, 1920, 1080) == Result::accepted);
  f.status = ERROR_INTERNAL_ERROR;
  REQUIRE_FALSE(state.release(sink));
  REQUIRE(state.active() == 1);
  f.status = CHANNEL_RC_OK;
  REQUIRE(state.release(sink));
  REQUIRE(state.active() == 0);
  REQUIRE(f.writes.back().flags == (RDPINPUT_CONTACT_FLAG_UP | RDPINPUT_CONTACT_FLAG_CANCELED));
  REQUIRE(f.writes.back().x == 60);
  REQUIRE(f.writes.back().y == 70);
}
