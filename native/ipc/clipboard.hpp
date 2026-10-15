#pragma once
#include "protocol.hpp"

namespace bridge::ipc::clipboard {
inline constexpr std::size_t metadata_bytes = 24, max_text_bytes = 16 * 1024 * 1024,
                             max_record_bytes = metadata_bytes + max_text_bytes;
enum class Operation : std::uint16_t { read = 1, set = 2 };
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
};
struct Command {
  Operation operation;
  std::uint64_t generation, revision;
  std::span<const std::uint8_t> text;
};
struct Result {
  Operation operation;
  Status status;
  std::uint64_t generation, revision;
  std::span<const std::uint8_t> text;
};
// Prepared schema-1 payloads. Text borrows the immutable input; encoders copy only
// after validation. Not assigned a RWI1 kind until transport/worker activation.
std::array<std::uint8_t, metadata_bytes> encode_state(const State &);
State decode_state(std::span<const std::uint8_t>);
std::vector<std::uint8_t> encode_command(const Command &);
Command decode_command(std::span<const std::uint8_t>);
std::vector<std::uint8_t> encode_result(const Result &);
Result decode_result(std::span<const std::uint8_t>);
} // namespace bridge::ipc::clipboard
