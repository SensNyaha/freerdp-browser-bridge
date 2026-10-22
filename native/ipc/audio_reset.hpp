#pragma once
#include "../compat/span.hpp"
#include "protocol.hpp"

namespace bridge::ipc::audio {
constexpr std::size_t reset_request_bytes = 12, reset_result_bytes = 4;
enum class ResetResult : std::uint8_t { scheduled, stale, unavailable, busy };
std::uint64_t decode_reset(::bridge::compat::span<const std::uint8_t>);
std::array<std::uint8_t, reset_request_bytes> encode_reset(std::uint64_t expected_epoch);
ResetResult decode_reset_result(::bridge::compat::span<const std::uint8_t>);
std::array<std::uint8_t, reset_result_bytes> encode_reset_result(ResetResult);
} // namespace bridge::ipc::audio
