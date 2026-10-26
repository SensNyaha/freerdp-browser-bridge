#include "../compat/span.hpp"
#include "clipboard.hpp"
#include "clipboard_html.hpp"
#include "../clipboard/text.hpp"
#include <algorithm>

namespace bridge::ipc::clipboard {
namespace {
void put(::bridge::compat::span<std::uint8_t> b, std::size_t at, std::uint64_t value, std::size_t count) {
  for (std::size_t i = 0; i < count; ++i)
    b[at + i] = static_cast<std::uint8_t>(value >> ((count - i - 1) * 8));
}
void validate(const State &s) {
  if (!s.generation || !s.maximum || s.maximum > max_text_bytes ||
      (!s.to_server && !s.from_server) ||
      ((!s.ready || !s.from_server) && (s.remote_text || s.remote_pending)) ||
      ((!s.ready || !s.to_server) && (s.local_accepted || s.local_pending)) ||
      (s.local_accepted && s.local_pending) || (!s.revision && (s.remote_text || s.remote_pending)) ||
      ((!s.html || !s.ready || !s.from_server || !s.revision) && s.remote_html) ||
      ((!s.html || !s.ready || !s.to_server || !s.local_accepted) && s.local_html_accepted))
    throw ProtocolError();
}
void validate(Operation op, std::uint64_t generation, std::uint64_t revision) {
  if (!generation || (op != Operation::read && op != Operation::set && op != Operation::revoke &&
                      !is_html(op)) ||
      (is_read(op) ? !revision : revision != 0))
    throw ProtocolError();
}
void text(::bridge::compat::span<const std::uint8_t> bytes) {
  const auto result = bridge::clipboard::encode_unicode_text(bytes, {}, max_text_bytes);
  if (result.status != bridge::clipboard::TextStatus::capacity)
    throw ProtocolError();
}
void validate(const Command &c) {
  validate(c.operation, c.generation, c.revision);
  if (c.operation == Operation::set_html) {
    const auto item = decode_html_item(c.text);
    // Browser writes provide a complete immutable fragment. Contextual reads
    // are not silently truncated or reinterpreted as outgoing fragments.
    if (item.context || item.selection)
      throw ProtocolError();
  } else if (c.operation != Operation::set) {
    if (!c.text.empty())
      throw ProtocolError();
  } else
    text(c.text);
}
void validate(const Result &r) {
  validate(r.operation, r.generation, r.revision);
  if (static_cast<unsigned>(r.status) > static_cast<unsigned>(Status::disconnected))
    throw ProtocolError();
  if (r.operation == Operation::read_html && r.status == Status::accepted)
    (void)decode_html_item(r.text);
  else if (r.operation == Operation::read && r.status == Status::accepted)
    text(r.text);
  else if (!r.text.empty())
    throw ProtocolError();
}
void header(::bridge::compat::span<const std::uint8_t> b) {
  if (b.size() < metadata_bytes || b.size() > max_record_bytes || read_be(b.subspan(6, 2)) ||
      read_be(b.first(2)) != (read_be(b.subspan(2, 2)) >= 4 ? 3u
                            : read_be(b.subspan(2, 2)) == 3 ? 2u : 1u))
    throw ProtocolError();
}
std::vector<std::uint8_t> encode(Operation op, Status status, std::uint64_t generation,
                                 std::uint64_t revision, ::bridge::compat::span<const std::uint8_t> text) {
  std::vector<std::uint8_t> b(metadata_bytes + text.size());
  put(b, 0, is_html(op) ? 3 : op == Operation::revoke ? 2 : 1, 2);
  put(b, 2, static_cast<std::uint16_t>(op), 2);
  put(b, 4, static_cast<std::uint16_t>(status), 2);
  put(b, 8, generation, 8);
  put(b, 16, revision, 8);
  std::copy(text.begin(), text.end(), b.begin() + metadata_bytes);
  return b;
}
} // namespace
std::array<std::uint8_t, metadata_bytes> encode_state(const State &s) {
  validate(s);
  std::array<std::uint8_t, metadata_bytes> b{};
  const unsigned flags = unsigned{s.ready} | (unsigned{s.to_server} << 1) |
                         (unsigned{s.from_server} << 2) | (unsigned{s.remote_text} << 3) |
                         (unsigned{s.local_accepted} << 4) | (unsigned{s.local_pending} << 5) |
                         (unsigned{s.remote_pending} << 6) | (unsigned{s.html} << 7) |
                         (unsigned{s.remote_html} << 8) | (unsigned{s.local_html_accepted} << 9);
  put(b, 0, s.html ? 3 : 1, 2);
  put(b, 2, flags, 2);
  put(b, 4, s.maximum, 4);
  put(b, 8, s.generation, 8);
  put(b, 16, s.revision, 8);
  return b;
}
State decode_state(::bridge::compat::span<const std::uint8_t> b) {
  if (b.size() != metadata_bytes)
    throw ProtocolError();
  const auto f = read_be(b.subspan(2, 2));
  const auto schema = read_be(b.first(2));
  if ((schema == 1 ? f > 127 : schema != 3 || f > 1023 || !(f & 128)))
    throw ProtocolError();
  State s{read_be(b.subspan(8, 8)),
          read_be(b.subspan(16, 8)),
          static_cast<std::uint32_t>(read_be(b.subspan(4, 4))),
          (f & 1) != 0,
          (f & 2) != 0,
          (f & 4) != 0,
          (f & 8) != 0,
          (f & 16) != 0,
          (f & 32) != 0,
          (f & 64) != 0,
          (f & 128) != 0, (f & 256) != 0, (f & 512) != 0};
  validate(s);
  return s;
}
std::vector<std::uint8_t> encode_command(const Command &c) {
  validate(c);
  return encode(c.operation, Status::accepted, c.generation, c.revision, c.text);
}
Command decode_command(::bridge::compat::span<const std::uint8_t> b) {
  header(b);
  if (read_be(b.subspan(4, 2)))
    throw ProtocolError();
  Command c{static_cast<Operation>(read_be(b.subspan(2, 2))), read_be(b.subspan(8, 8)),
            read_be(b.subspan(16, 8)), b.subspan(metadata_bytes)};
  validate(c);
  return c;
}
std::vector<std::uint8_t> encode_result(const Result &r) {
  validate(r);
  return encode(r.operation, r.status, r.generation, r.revision, r.text);
}
Result decode_result(::bridge::compat::span<const std::uint8_t> b) {
  header(b);
  Result r{static_cast<Operation>(read_be(b.subspan(2, 2))),
           static_cast<Status>(read_be(b.subspan(4, 2))), read_be(b.subspan(8, 8)),
           read_be(b.subspan(16, 8)), b.subspan(metadata_bytes)};
  validate(r);
  return r;
}
} // namespace bridge::ipc::clipboard
