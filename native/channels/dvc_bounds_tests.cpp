#include "../compat/span.hpp"
#include "dvc_bounds.hpp"
#include <array>
#include <catch2/catch_test_macros.hpp>
#include <cstdlib>
#include <memory>
#include <type_traits>
#include <vector>
#ifdef BRIDGE_DVC_BOUNDS_SDK
#include <freerdp/codec/zgfx.h>
#endif

using namespace bridge::channels;
namespace {
void le(std::vector<std::uint8_t> &bytes, std::uint32_t value, std::size_t width) {
  for (std::size_t index = 0; index < width; ++index)
    bytes.push_back(static_cast<std::uint8_t>(value >> (index * 8)));
}
std::size_t width(unsigned selector) { return selector == 0 ? 1 : selector == 1 ? 2 : 4; }
std::vector<std::uint8_t> first(unsigned command, unsigned id_width, unsigned length_width,
                                std::uint32_t length, ::bridge::compat::span<const std::uint8_t> body = {}) {
  std::vector<std::uint8_t> bytes{
      static_cast<std::uint8_t>((command << 4) | (length_width << 2) | id_width)};
  le(bytes, 0x42, width(id_width));
  le(bytes, length, width(length_width));
  bytes.insert(bytes.end(), body.begin(), body.end());
  return bytes;
}
std::vector<std::uint8_t> multipart(std::uint32_t declared,
                                    const std::vector<std::vector<std::uint8_t>> &segments) {
  std::vector<std::uint8_t> bytes{0xe1};
  le(bytes, static_cast<std::uint32_t>(segments.size()), 2);
  le(bytes, declared, 4);
  for (const auto &segment : segments) {
    le(bytes, static_cast<std::uint32_t>(segment.size()), 4);
    bytes.insert(bytes.end(), segment.begin(), segment.end());
  }
  return bytes;
}
} // namespace

TEST_CASE(
    "DVC allocation inspection owns no dynamic state and trusts only reduced bounded policy") {
  STATIC_REQUIRE(std::is_trivially_copyable_v<DvcAllocationInfo>);
  STATIC_REQUIRE(sizeof(DvcAllocationInfo) <= 128);
  STATIC_REQUIRE(noexcept(inspect_dvc_allocations({})));
  REQUIRE_FALSE(inspect_dvc_allocations({}));
  const std::uint8_t control[]{0x50, 0, 3, 0};
  REQUIRE(inspect_dvc_allocations(control)->command == 5);
  for (unsigned field = 0; field < 4; ++field) {
    DvcAllocationLimits limits;
    auto &value = field == 0   ? limits.message_bytes
                  : field == 1 ? limits.codec_bytes
                  : field == 2 ? limits.encoded_bytes
                               : limits.segments;
    value = 0;
    REQUIRE_FALSE(inspect_dvc_allocations(control, limits));
    value = field == 2   ? limits.hard_encoded_bytes + 1
            : field == 3 ? limits.hard_segments + 1
                         : limits.hard_message_bytes + 1;
    REQUIRE_FALSE(inspect_dvc_allocations(control, limits));
  }
  DvcAllocationLimits policy;
  policy.encoded_bytes = 3;
  REQUIRE_FALSE(inspect_dvc_allocations(control, policy));
}

TEST_CASE(
    "DVC DATA_FIRST reads pinned little-endian selector aliases and refuses missing/huge fields") {
  for (unsigned id_width = 0; id_width < 4; ++id_width)
    for (unsigned length_width = 0; length_width < 4; ++length_width) {
      const auto wire = first(2, id_width, length_width, 14);
      const auto info = inspect_dvc_allocations(wire);
      REQUIRE(info);
      REQUIRE(info->channel_id == 0x42);
      REQUIRE(info->declared_message == 14);
      REQUIRE(info->payload_bytes == 0);
      for (std::size_t end = 0; end < wire.size(); ++end)
        REQUIRE_FALSE(inspect_dvc_allocations(::bridge::compat::span(wire).first(end)));
    }
  DvcAllocationLimits policy;
  policy.message_bytes = 14;
  REQUIRE(inspect_dvc_allocations(first(2, 3, 3, 14), policy));
  REQUIRE_FALSE(inspect_dvc_allocations(first(2, 3, 3, 15), policy));
  REQUIRE_FALSE(inspect_dvc_allocations(first(2, 3, 3, 0xffffffffU)));
  const std::uint8_t body[]{1, 2, 3};
  REQUIRE_FALSE(inspect_dvc_allocations(first(2, 0, 0, 2, body)));
  REQUIRE(inspect_dvc_allocations(first(2, 0, 0, 3, body)));
  REQUIRE(inspect_dvc_allocations(first(2, 0, 0, 0)));
}

TEST_CASE(
    "DVC raw DATA permits a large graphics-sized payload without a tiny global touch ceiling") {
  std::vector<std::uint8_t> bytes(12 * 1024 * 1024 + 2, 0x5a);
  bytes[0] = 0x30;
  bytes[1] = 4;
  const auto info = inspect_dvc_allocations(bytes);
  REQUIRE(info);
  REQUIRE(info->channel_id == 4);
  REQUIRE(info->payload_bytes == 12 * 1024 * 1024);
  DvcAllocationLimits touch;
  touch.message_bytes = 14;
  REQUIRE_FALSE(inspect_dvc_allocations(bytes, touch));
  bytes.resize(DvcAllocationLimits::hard_message_bytes + 3);
  REQUIRE_FALSE(inspect_dvc_allocations(bytes));
}

TEST_CASE("ZGFX single segments bound raw output and unknown compressed expansion before SDK "
          "allocation") {
  const std::uint8_t raw[]{0xe0, 4, 0x12, 0x34};
  const auto info = inspect_zgfx_allocations(raw);
  REQUIRE(info);
  REQUIRE(info->declared_output == 2);
  REQUIRE(info->allocation_ceiling == 66);
  const std::uint8_t compressed[]{0xe0, 0x24, 0, 0, 7};
  const auto coded = inspect_zgfx_allocations(compressed);
  REQUIRE(coded);
  REQUIRE_FALSE(coded->declared_output);
  REQUIRE(coded->allocation_ceiling == 65536 + 64);
  DvcAllocationLimits policy;
  policy.codec_bytes = 65535;
  REQUIRE_FALSE(inspect_zgfx_allocations(compressed, policy));
  REQUIRE(inspect_zgfx_allocations(raw, policy));
  std::vector<std::uint8_t> large(65536 + 2, 0);
  large[0] = 0xe0;
  REQUIRE(inspect_zgfx_allocations(large));
  large.push_back(0);
  REQUIRE_FALSE(inspect_zgfx_allocations(large));
  for (const auto &bad : std::vector<std::vector<std::uint8_t>>{
           {}, {0xe0}, {0xe0, 0}, {0xff, 0, 1}, {0xe0, 0x24, 1}, {0xe0, 0x24, 0, 9}})
    REQUIRE_FALSE(inspect_zgfx_allocations(bad));
}

TEST_CASE("ZGFX multipart caps count/output and validates each remaining range without "
          "count-driven allocation") {
  const auto raw = multipart(3, {{4, 10, 11}, {4, 12}});
  const auto info = inspect_zgfx_allocations(raw);
  REQUIRE(info);
  REQUIRE(info->segments == 2);
  REQUIRE(info->declared_output == 3);
  REQUIRE(info->allocation_ceiling == 67);
  for (std::size_t end = 0; end < raw.size(); ++end)
    REQUIRE_FALSE(inspect_zgfx_allocations(::bridge::compat::span(raw).first(end)));
  auto bad = raw;
  bad[1] = 0xff;
  bad[2] = 0xff;
  REQUIRE_FALSE(inspect_zgfx_allocations(bad));
  bad = raw;
  for (std::size_t index = 3; index < 7; ++index)
    bad[index] = 0xff;
  REQUIRE_FALSE(inspect_zgfx_allocations(bad));
  bad = raw;
  for (std::size_t index = 7; index < 11; ++index)
    bad[index] = 0xff;
  REQUIRE_FALSE(inspect_zgfx_allocations(bad));
  bad = raw;
  bad.push_back(0);
  REQUIRE_FALSE(inspect_zgfx_allocations(bad));
  REQUIRE_FALSE(inspect_zgfx_allocations(multipart(2, {{4, 10, 11}, {4, 12}})));
  REQUIRE_FALSE(inspect_zgfx_allocations(multipart(4, {{4, 10, 11}, {4, 12}})));
  DvcAllocationLimits policy;
  policy.codec_bytes = 2;
  REQUIRE_FALSE(inspect_zgfx_allocations(raw, policy));
  policy.codec_bytes = 3;
  policy.segments = 1;
  REQUIRE_FALSE(inspect_zgfx_allocations(raw, policy));
  const auto empty = inspect_zgfx_allocations(multipart(0, {}));
  REQUIRE(empty);
  REQUIRE(empty->allocation_ceiling == 0);
  const auto empty_coded = inspect_zgfx_allocations(multipart(0, {{0x24, 0}}));
  REQUIRE(empty_coded);
  REQUIRE(empty_coded->allocation_ceiling == 64);
}

TEST_CASE("DVC compressed first checks logical and independent codec claims before forwarding") {
  const auto raw = multipart(2, {{4, 20, 21}});
  DvcAllocationLimits limits;
  limits.message_bytes = 14;
  limits.codec_bytes = 65536;
  const auto good = inspect_dvc_allocations(first(6, 0, 0, 14, raw), limits);
  REQUIRE(good);
  REQUIRE(good->codec);
  REQUIRE(good->codec->declared_output == 2);
  REQUIRE_FALSE(inspect_dvc_allocations(first(6, 0, 0, 1, raw), limits));
  REQUIRE_FALSE(inspect_dvc_allocations(first(6, 2, 2, 0xffffffffU, raw), limits));
  const auto huge = multipart(0xffffffffU, {{4, 0}});
  REQUIRE_FALSE(inspect_dvc_allocations(first(6, 0, 0, 14, huge), limits));
  const std::uint8_t literal[]{0xe0, 0x24, 0, 0, 7};
  REQUIRE(inspect_dvc_allocations(first(6, 0, 0, 14, literal), limits));
  std::vector<std::uint8_t> data{0x70, 0x42};
  data.insert(data.end(), raw.begin(), raw.end());
  REQUIRE(inspect_dvc_allocations(data, limits));
  data[2] = 0;
  REQUIRE_FALSE(inspect_dvc_allocations(data, limits));
  data = {0x70, 0x42, 0xe0, 4};
  data.resize(4 + 15, 0);
  REQUIRE_FALSE(inspect_dvc_allocations(data, limits));
  data.pop_back();
  REQUIRE(inspect_dvc_allocations(data, limits));
}

TEST_CASE("ZGFX raw partitioning never changes exact size claims at bounded segment counts") {
  for (std::uint32_t count = 1; count <= 512; ++count) {
    const auto bytes = multipart(count, std::vector<std::vector<std::uint8_t>>(count, {4, 0}));
    const auto info = inspect_zgfx_allocations(bytes);
    REQUIRE(info);
    REQUIRE(info->declared_output == count);
    REQUIRE(info->allocation_ceiling == count + 64);
    DvcAllocationLimits limits;
    limits.segments = count;
    REQUIRE(inspect_zgfx_allocations(bytes, limits));
    if (count > 1) {
      --limits.segments;
      REQUIRE_FALSE(inspect_zgfx_allocations(bytes, limits));
    }
  }
}

#ifdef BRIDGE_DVC_BOUNDS_SDK
TEST_CASE(
    "Pinned public ZGFX accepts inspected raw/compressed and zero-output multipart allocations") {
  STATIC_REQUIRE(ZGFX_SEGMENTED_SINGLE == 0xe0);
  STATIC_REQUIRE(ZGFX_SEGMENTED_MULTIPART == 0xe1);
  for (const auto &wire :
       std::vector<std::vector<std::uint8_t>>{{0xe0, 4, 10, 11},
                                              {0xe0, 0x24, 0, 0, 7},
                                              multipart(3, {{4, 10, 11}, {4, 12}}),
                                              multipart(0, {{0x24, 0}})}) {
    const auto info = inspect_zgfx_allocations(wire);
    REQUIRE(info);
    std::unique_ptr<ZGFX_CONTEXT, decltype(&zgfx_context_free)> codec(zgfx_context_new(FALSE),
                                                                      zgfx_context_free);
    REQUIRE(codec);
    BYTE *output = nullptr;
    UINT32 size = 0;
    const auto result = zgfx_decompress(codec.get(), wire.data(), static_cast<UINT32>(wire.size()),
                                        &output, &size, 0);
    std::unique_ptr<BYTE, decltype(&std::free)> owner(output, std::free);
    REQUIRE(result >= 0);
    REQUIRE(static_cast<std::size_t>(size) + (output ? 64 : 0) <= info->allocation_ceiling);
    if (info->declared_output)
      REQUIRE(size == *info->declared_output);
    if (wire[0] == 0xe0 && wire[1] == 0x24) {
      REQUIRE(size == 1);
      REQUIRE(output[0] == 0);
    }
  }
}
TEST_CASE("Pinned public ZGFX reconstructs an inspected large multipart payload") {
  constexpr std::uint32_t payload_size = 12U * 1024U * 1024U;
  std::vector<std::vector<std::uint8_t>> segments;
  std::size_t remaining = payload_size;
  while (remaining) {
    const auto count = remaining > ZGFX_SEGMENTED_MAXSIZE ? ZGFX_SEGMENTED_MAXSIZE : remaining;
    std::vector<std::uint8_t> bytes(count + 1, 0x5a);
    bytes[0] = 4;
    segments.push_back(std::move(bytes));
    remaining -= count;
  }
  const auto wire = multipart(payload_size, segments);
  const auto info = inspect_zgfx_allocations(wire);
  REQUIRE(info);
  REQUIRE(info->declared_output == payload_size);
  std::unique_ptr<ZGFX_CONTEXT, decltype(&zgfx_context_free)> codec(zgfx_context_new(FALSE),
                                                                    zgfx_context_free);
  REQUIRE(codec);
  BYTE *output = nullptr;
  UINT32 size = 0;
  const auto result = zgfx_decompress(codec.get(), wire.data(), static_cast<UINT32>(wire.size()),
                                      &output, &size, 0);
  std::unique_ptr<BYTE, decltype(&std::free)> owner(output, std::free);
  REQUIRE(result >= 0);
  REQUIRE(size == payload_size);
  REQUIRE(output);
  REQUIRE(output[0] == 0x5a);
  REQUIRE(output[size - 1] == 0x5a);
  REQUIRE(static_cast<std::size_t>(size) + 64 <= info->allocation_ceiling);
}
#endif
