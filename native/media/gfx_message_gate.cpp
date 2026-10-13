#include "gfx_message_gate.hpp"
#include <algorithm>
#include <cstdlib>
#include <stdexcept>
#include <vector>
#include <winpr/error.h>
#include <winpr/stream.h>

namespace bridge::media {
namespace {
void append(std::vector<BYTE> &bytes, std::uint32_t value, unsigned count) {
  for (unsigned i = 0; i < count; ++i)
    bytes.push_back(static_cast<BYTE>(value >> (8U * i)));
}
std::vector<BYTE> literal(std::span<const BYTE> decoded) {
  constexpr std::size_t segment = ZGFX_SEGMENTED_MAXSIZE;
  const auto count = (decoded.size() + segment - 1U) / segment;
  std::vector<BYTE> bytes;
  bytes.reserve(decoded.size() + (count == 1 ? 2U : 7U + count * 5U));
  bytes.push_back(count == 1 ? ZGFX_SEGMENTED_SINGLE : ZGFX_SEGMENTED_MULTIPART);
  if (count > 1) {
    append(bytes, static_cast<std::uint32_t>(count), 2);
    append(bytes, static_cast<std::uint32_t>(decoded.size()), 4);
  }
  while (!decoded.empty()) {
    const auto length = (std::min)(decoded.size(), segment);
    if (count > 1)
      append(bytes, static_cast<std::uint32_t>(length + 1U), 4);
    bytes.push_back(ZGFX_PACKET_COMPR_TYPE_RDP8);
    bytes.insert(bytes.end(), decoded.begin(), decoded.begin() + length);
    decoded = decoded.subspan(length);
  }
  return bytes;
}
} // namespace
GfxMessageGate::GfxMessageGate(channels::DvcAllocationLimits allocations, GfxPduLimits pdus)
    : allocations_(allocations), pdus_(pdus) {
  if (!allocations.valid() || !pdus.bytes || pdus.bytes > GfxPduLimits::hard_bytes || !pdus.pdus ||
      pdus.pdus > GfxPduLimits::hard_pdus || !pdus.regions ||
      pdus.regions > GfxPduLimits::hard_regions)
    throw std::invalid_argument("Invalid graphics message limits");
  codec_.reset(zgfx_context_new(FALSE));
  if (!codec_)
    throw std::bad_alloc();
}
GfxMessageGate::~GfxMessageGate() {
  if (busy_)
    std::terminate();
}
UINT GfxMessageGate::process(IWTSVirtualChannelCallback &target, wStream &stream) {
  const auto length = Stream_GetRemainingLength(&stream);
  const auto *bytes = static_cast<const BYTE *>(Stream_ConstPointer(&stream));
  if ((!bytes && length) || !channels::inspect_zgfx_allocations({bytes, length}, allocations_))
    return ERROR_INVALID_DATA;
  BYTE *raw = nullptr;
  UINT32 size = 0;
  const auto status =
      zgfx_decompress(codec_.get(), bytes, static_cast<UINT32>(length), &raw, &size, 0);
  std::unique_ptr<BYTE, decltype(&std::free)> decoded(raw, std::free);
  if (status < 0 || (!raw && size) || size > allocations_.codec_bytes ||
      (size && !admit_gfx_pdus({raw, size}, pdus_)))
    return ERROR_INVALID_DATA;
  if (retiring_ || failed_)
    return ERROR_INVALID_STATE;
  if (!size)
    return CHANNEL_RC_OK; // Pinned rdpgfx creates a static stream from null zero-output storage.
  // The original decoder receives only literal segments. Independent ingress dictionary
  // progression stays with this owner; no private SDK parser/ABI is used.
  auto forwarded = literal({raw, size});
  decoded.reset(); // Avoid retaining both decoded outputs during the original callback.
  wStream view{};
  if (!Stream_StaticConstInit(&view, forwarded.data(), forwarded.size()))
    return ERROR_INTERNAL_ERROR;
  return target.OnDataReceived(&target, &view);
}
UINT GfxMessageGate::forward(IWTSVirtualChannelCallback &target, wStream &stream) noexcept {
  if (std::this_thread::get_id() != thread_)
    return ERROR_INVALID_STATE;
  if (busy_) {
    failed_ = true;
    return ERROR_INVALID_STATE;
  }
  if (retiring_ || failed_ || !codec_ || !target.OnDataReceived)
    return ERROR_INVALID_STATE;
  busy_ = true;
  UINT status = ERROR_INTERNAL_ERROR;
  try {
    status = process(target, stream);
  } catch (const std::bad_alloc &) {
    status = ERROR_NOT_ENOUGH_MEMORY;
  } catch (...) {
    status = ERROR_INTERNAL_ERROR;
  }
  busy_ = false;
  if (status != CHANNEL_RC_OK)
    failed_ = true;
  if (retiring_)
    codec_.reset();
  return failed_ && status == CHANNEL_RC_OK ? ERROR_INVALID_STATE : status;
}
UINT GfxMessageGate::retire() noexcept {
  if (std::this_thread::get_id() != thread_)
    return ERROR_INVALID_STATE;
  retiring_ = true;
  if (busy_)
    return ERROR_IO_PENDING;
  codec_.reset();
  return CHANNEL_RC_OK;
}
} // namespace bridge::media
