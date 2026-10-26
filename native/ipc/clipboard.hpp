#pragma once
#include "../compat/span.hpp"
#include "protocol.hpp"

namespace bridge::ipc::clipboard {
inline constexpr std::size_t metadata_bytes = 24, max_text_bytes = 16 * 1024 * 1024,
                             max_record_bytes = metadata_bytes + max_text_bytes;
enum class Operation : std::uint16_t { read = 1, set = 2, revoke = 3, read_html = 4, set_html = 5 };
constexpr bool is_read(Operation op) { return op == Operation::read || op == Operation::read_html; }
constexpr bool is_html(Operation op) { return op == Operation::read_html || op == Operation::set_html; }
enum class Status : std::uint16_t {
  accepted = 0,
  refused,
  stale,
  unavailable,
  busy,
  invalid,
  timeout,
  disconnected
};
struct State {
  std::uint64_t generation, revision;
  std::uint32_t maximum;
  bool ready, to_server, from_server, remote_text, local_accepted, local_pending, remote_pending;
  bool html = false, remote_html = false, local_html_accepted = false;
};
struct Command {
  Operation operation;
  std::uint64_t generation, revision;
  ::bridge::compat::span<const std::uint8_t> text;
};
struct Result {
  Operation operation;
  Status status;
  std::uint64_t generation, revision;
  ::bridge::compat::span<const std::uint8_t> text;
};
// Schema-1 state/read/set, schema-2 revoke, schema-3 HTML state/read/set.
// HTML operations carry a separately validated inner item in the text field.
// Revoke requires the separate HELLO capability. Text borrows immutable input;
// encoders copy only after validation. Ownership/capability checks are separate.
std::array<std::uint8_t, metadata_bytes> encode_state(const State &);
State decode_state(::bridge::compat::span<const std::uint8_t>);
std::vector<std::uint8_t> encode_command(const Command &);
Command decode_command(::bridge::compat::span<const std::uint8_t>);
std::vector<std::uint8_t> encode_result(const Result &);
Result decode_result(::bridge::compat::span<const std::uint8_t>);
} // namespace bridge::ipc::clipboard
