#include "touch_ipc.hpp"
#include <algorithm>

namespace bridge::touch {
Event decode_ipc(std::span<const std::uint8_t> p) {
  if (p.size() != ipc_event_bytes || ipc::read_be(p.first(2)) != 1 || p[2] < 1 || p[2] > 4 ||
      p[3] != 0)
    throw ipc::ProtocolError();
  const auto action = p[2] == 1   ? Action::begin
                      : p[2] == 2 ? Action::update
                      : p[2] == 3 ? Action::end
                                  : Action::cancel;
  const Event event{action, static_cast<std::uint32_t>(ipc::read_be(p.subspan(4, 4))),
                    static_cast<std::uint32_t>(ipc::read_be(p.subspan(8, 4))),
                    static_cast<std::uint32_t>(ipc::read_be(p.subspan(12, 4)))};
  if (!valid(event))
    throw ipc::ProtocolError();
  return event;
}
Request decode_request(std::span<const std::uint8_t> p) {
  if (p.size() != 24 || ipc::read_be(p.first(2)) != 2)
    throw ipc::ProtocolError();
  std::array<std::uint8_t, 16> record{};
  std::copy_n(p.begin(), record.size(), record.begin());
  record[1] = 1;
  const Request request{decode_ipc(record), ipc::read_be(p.subspan(16, 8))};
  if (!request.generation)
    throw ipc::ProtocolError();
  return request;
}
std::vector<std::uint8_t> encode_update(const Update &u) {
  const auto phase = static_cast<unsigned>(u.availability);
  if (!u.revision || !u.generation || !u.width || u.width > 7680 || !u.height || u.height > 4320 ||
      phase > 5 || (!u.enabled && phase != 0) ||
      (u.availability == Availability::ready ? u.contacts < 1 || u.contacts > 10 : u.contacts != 0))
    throw ipc::ProtocolError();
  std::vector<std::uint8_t> p;
  p.reserve(32);
  ipc::append_be(p, 1, 2);
  ipc::append_be(p, u.enabled ? 1 : 0, 1);
  ipc::append_be(p, 0, 1);
  ipc::append_be(p, u.revision, 8);
  ipc::append_be(p, u.generation, 8);
  ipc::append_be(p, u.width, 2);
  ipc::append_be(p, u.height, 2);
  ipc::append_be(p, u.contacts, 2);
  ipc::append_be(p, phase, 2);
  ipc::append_be(p, 0, 4);
  return p;
}
} // namespace bridge::touch
