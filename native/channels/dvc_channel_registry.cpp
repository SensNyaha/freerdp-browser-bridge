#include "dvc_channel_registry.hpp"
#include "../audio/audin_ingress.hpp"
#include "../audio/ingress.hpp"
#include <algorithm>
#include <freerdp/channels/audin.h>
#include <freerdp/channels/rdpgfx.h>
#include <freerdp/channels/rdpsnd.h>
#include <limits>
#include <stdexcept>
#include <string_view>
#include <winpr/error.h>

namespace bridge::channels {
namespace {
void increment(std::uint64_t &value) noexcept {
  if (value != (std::numeric_limits<std::uint64_t>::max)())
    ++value;
}
std::optional<DvcPayload> channel_payload(IWTSVirtualChannelManager &manager,
                                          IWTSVirtualChannel &channel) {
  if (!manager.GetChannelName)
    return DvcPayload::opaque; // Production resolver requires this API.
  const auto *name = manager.GetChannelName(&channel);
  if (!name)
    return std::nullopt;
  std::size_t length = 0;
  while (length < 128 && name[length])
    ++length;
  if (!length || length == 128)
    return std::nullopt;
  const auto value = std::string_view(name, length);
  if (value == RDPGFX_DVC_CHANNEL_NAME)
    return DvcPayload::graphics;
  if (value == RDPSND_DVC_CHANNEL_NAME)
    return DvcPayload::audio;
  if (value == AUDIN_DVC_CHANNEL_NAME)
    return DvcPayload::microphone;
  return DvcPayload::opaque;
}
} // namespace
DvcChannelRegistry::DvcChannelRegistry(DvcCompletionHook::Clock clock, void *clock_context,
                                       DvcMessageBudgetLimits budget,
                                       DvcAllocationLimits allocations)
    : budget_(budget), allocations_(allocations), slots_(budget.slots), clock_(clock),
      clock_context_(clock_context) {
  if (!clock || !allocations.valid())
    throw std::invalid_argument("Invalid DVC channel registry");
}
bool DvcChannelRegistry::fail(UINT status) noexcept {
  if (!failed_) {
    failed_ = true;
    failure_status_ = status;
    increment(failures_);
  }
  closed_ = true;
  // Admission is closed, but host target retirement is still owed independently.
  budget_.close();
  return false;
}
bool DvcChannelRegistry::contains(std::uint32_t id) const noexcept {
  return std::any_of(entries_.begin(), entries_.end(), [id](const auto &entry) {
    return entry.hook && !entry.hook->closed() && entry.id == id;
  });
}
bool DvcChannelRegistry::owns_callback(const IWTSVirtualChannelCallback &callback) const noexcept {
  return std::any_of(entries_.begin(), entries_.end(), [&callback](const auto &entry) {
    return entry.hook && !entry.hook->closed() && entry.original == &callback;
  });
}
bool DvcChannelRegistry::poll(std::uint64_t now) noexcept {
  if (closed_)
    return false;
  if (busy_)
    return fail(ERROR_INVALID_DATA);
  if (std::any_of(entries_.begin(), entries_.end(),
                  [now](const auto &entry) { return entry.hook && !entry.hook->poll(now); }) ||
      !budget_.poll(now))
    return fail(ERROR_INVALID_DATA);
  return true;
}
DvcChannelBinding DvcChannelRegistry::bind(IWTSVirtualChannelManager &manager,
                                           IWTSVirtualChannel &channel,
                                           IWTSVirtualChannelCallback &original,
                                           std::uint64_t now) noexcept {
  if (!poll(now))
    return {ERROR_INVALID_STATE, nullptr};
  if (!manager.GetChannelId || !original.OnDataReceived) {
    (void)fail(ERROR_INVALID_PARAMETER);
    return {ERROR_INVALID_PARAMETER, nullptr};
  }
  busy_ = true;
  DvcChannelBinding result{ERROR_INVALID_STATE, nullptr};
  try {
    const auto id = manager.GetChannelId(&channel);
    const auto payload = channel_payload(manager, channel);
    if (!payload) {
      (void)fail(ERROR_INVALID_DATA);
      result.status = ERROR_INVALID_DATA;
    } else if (!closed_) {
      if (contains(id) || owns_callback(original)) {
        (void)fail(ERROR_ALREADY_EXISTS);
        result.status = ERROR_ALREADY_EXISTS;
      } else {
        auto end = entries_.begin() + slots_;
        auto free = std::find_if(entries_.begin(), end, [](const auto &entry) {
          return !entry.hook || entry.hook->closed();
        });
        if (free == end) {
          (void)fail(ERROR_TOO_MANY_OPEN_FILES);
          result.status = ERROR_TOO_MANY_OPEN_FILES;
        } else {
          auto hook = std::make_unique<DvcCompletionHook>(budget_, id, original, clock_,
                                                          clock_context_, *payload, allocations_);
          if (free->hook)
            increment(reused_);
          free->id = id;
          free->original = &original;
          free->hook = std::move(hook);
          result = {CHANNEL_RC_OK, free->hook->interface()};
          increment(bindings_);
        }
      }
    }
  } catch (...) {
    (void)fail(ERROR_INTERNAL_ERROR);
    result = {ERROR_INTERNAL_ERROR, nullptr};
  }
  busy_ = false;
  return result;
}
bool DvcChannelRegistry::admit(std::span<const std::uint8_t> payload, std::uint64_t now) noexcept {
  if (!poll(now))
    return false;
  const auto info = inspect_dvc_allocations(payload, allocations_);
  if (!info)
    return fail(ERROR_INVALID_DATA);
  if (info->channel_id) {
    const auto entry = std::find_if(entries_.begin(), entries_.end(), [&](const auto &item) {
      return item.hook && !item.hook->closed() && item.id == *info->channel_id;
    });
    if (entry != entries_.end() && (entry->hook->payload() == DvcPayload::audio ||
                                    entry->hook->payload() == DvcPayload::microphone)) {
      const auto maximum = entry->hook->payload() == DvcPayload::microphone
                               ? audio::AudinIngress::max_bytes
                               : audio::AudioAssembler::max_bytes;
      auto audio_limits = allocations_;
      audio_limits.message_bytes = (std::min)(audio_limits.message_bytes, maximum);
      audio_limits.codec_bytes = (std::min)(audio_limits.codec_bytes, maximum);
      audio_limits.encoded_bytes = (std::min)(audio_limits.encoded_bytes, maximum * 2);
      if (!inspect_dvc_allocations(payload, audio_limits))
        return fail(ERROR_INVALID_DATA);
    }
  }
  if (info->declared_message && info->channel_id && contains(*info->channel_id))
    if (!budget_.reserve(*info->channel_id, *info->declared_message, now))
      return fail(ERROR_INVALID_DATA);
  return true;
}
UINT DvcChannelRegistry::retire() noexcept {
  closed_ = true;
  bool pending = busy_;
  for (auto &entry : entries_) {
    if (!entry.hook)
      continue;
    const auto status = entry.hook->retire();
    pending = pending || !entry.hook->closed();
    if (status != CHANNEL_RC_OK && status != ERROR_IO_PENDING)
      (void)fail(status);
  }
  budget_.close();
  return pending ? ERROR_IO_PENDING : (failed_ ? failure_status_ : CHANNEL_RC_OK);
}
DvcChannelRegistryStats DvcChannelRegistry::stats() const noexcept {
  DvcChannelRegistryStats result{};
  result.budget = budget_.stats();
  result.bindings = bindings_;
  result.reused_slots = reused_;
  result.failures = failures_;
  result.closed = closed_;
  result.failed = failed_;
  result.resources_retired = closed_ && !busy_;
  for (const auto &entry : entries_) {
    if (!entry.hook)
      continue;
    if (!entry.hook->closed()) {
      ++result.active_channels;
      result.resources_retired = false;
    }
    result.failed = result.failed || entry.hook->failed();
  }
  return result;
}
} // namespace bridge::channels
