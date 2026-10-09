#include "touch_ipc.hpp"

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
} // namespace bridge::touch
