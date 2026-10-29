#include "rdpdr_static.hpp"
#include <algorithm>
#include <cstring>
#include <exception>
#include <limits>
#include <stdexcept>
#include <freerdp/channels/rdpdr.h>
#include <winpr/error.h>
#include <winpr/sysinfo.h>

namespace bridge::files::rdpdr {
namespace {
void increment(std::uint64_t &value) noexcept {
  if (value != (std::numeric_limits<std::uint64_t>::max)()) ++value;
}
void wipe(const BorrowedWrite &item) noexcept { std::fill_n(item.data, item.capacity, std::uint8_t{0}); }
bool static_drives_only(const rdpSettings &settings) noexcept {
  const auto count = freerdp_settings_get_uint32(&settings, FreeRDP_DeviceCount);
  if (count > 32) return false;
  for (UINT32 i = 0; i < count; ++i) {
    const auto *device = static_cast<const RDPDR_DEVICE *>(freerdp_settings_get_pointer_array(&settings, FreeRDP_DeviceArray, i));
    if (!device || device->Type != RDPDR_DTYP_FILESYSTEM) return false;
    const auto *drive = reinterpret_cast<const RDPDR_DRIVE *>(device);
    if (drive->automount || !drive->Path || std::strcmp(drive->Path, "*") == 0 ||
        std::strcmp(drive->Path, "DynamicDrives") == 0) return false;
  }
  return true;
}
} // namespace
std::uint64_t StaticGate::monotonic_ms() { return GetTickCount64(); }
StaticGate::StaticGate(rdpContext &context, Clock clock)
    : context_(context), clock_(clock), thread_(std::this_thread::get_id()) {
  if (!clock) throw std::invalid_argument("Invalid drive channel clock");
}
StaticGate::~StaticGate() {
  if (registered_ && !host_terminated_.load()) std::terminate();
}
bool StaticGate::on_thread() const noexcept { return thread_ == std::this_thread::get_id(); }
bool StaticGate::ready_for(const rdpContext &context) const noexcept {
  return on_thread() && &context == &context_ && !attempted_ && !retiring_ && !failed_.load();
}
void StaticGate::fail() noexcept {
  if (!failed_.exchange(true)) setChannelError(&context_, ERROR_INVALID_DATA, "Invalid managed drive channel lifecycle or budget");
}
std::optional<StaticGateStats> StaticGate::stats() const noexcept {
  if (!on_thread()) return {};
  auto result = counters_;result.budget = budget_.stats();
  result.failed = failed_.load() || result.budget.failed;
  result.retired = retired_;result.terminated = host_terminated_.load();return result;
}
bool StaticGate::poll() noexcept {
  if (!on_thread() || retiring_ || failed_.load()) return false;
  try {
    const auto now = clock_();
    if (!budget_.poll(now) || !ingress_.poll(now)) { fail();return false; }
  } catch (...) { fail();return false; }
  trim_idle();
  return true;
}
void StaticGate::trim_idle() noexcept {
  // Public Clear also destroys used streams: never call it with any borrow or
  // active SDK reassembly/IRP. Bound dispatch count until this idle point.
  if (!pool_ || finalizing_ || busy_ || writing_ || completing_ ||
      budget_.stats().pending || StreamPool_UsedCount(pool_) != 0) return;
  StreamPool_Clear(pool_);counters_.dispatches_since_idle = 0;increment(counters_.pool_trims);
}
BOOL StaticGate::install(CHANNEL_ENTRY_POINTS_FREERDP_EX *host, LPVOID handle,
                           PVIRTUALCHANNELENTRYEX entry) noexcept {
  if (!ready_for(context_) || !host || !handle || !entry || host->cbSize != sizeof(*host) ||
      host->MagicNumber != FREERDP_CHANNEL_MAGIC_NUMBER || host->context != &context_ ||
      !host->pVirtualChannelInitEx || !host->pVirtualChannelOpenEx ||
      !host->pVirtualChannelCloseEx || !host->pVirtualChannelWriteEx || !context_.settings ||
      !freerdp_settings_get_bool(context_.settings, FreeRDP_SynchronousStaticChannels) ||
      freerdp_settings_get_bool(context_.settings, FreeRDP_AsyncChannels) ||
      freerdp_settings_get_bool(context_.settings, FreeRDP_AsyncUpdate) ||
      freerdp_settings_get_bool(context_.settings, FreeRDP_AutoReconnectionEnabled) ||
      !static_drives_only(*context_.settings)) return FALSE;
  attempted_ = installing_ = true;handle_ = handle;host_ = wrapped_ = *host;
  wrapped_.pExtendedData = nullptr; // No arbitrary addin argv/device backend selection.
  wrapped_.pVirtualChannelInitEx = init;wrapped_.pVirtualChannelOpenEx = open;
  wrapped_.pVirtualChannelCloseEx = close;wrapped_.pVirtualChannelWriteEx = write;
  BOOL accepted = FALSE;
  try { accepted = entry(reinterpret_cast<PCHANNEL_ENTRY_POINTS_EX>(&wrapped_), this); }
  catch (...) { fail(); }
  installing_ = false;
  return accepted && registered_ && !failed_.load() ? TRUE : FALSE;
}
UINT VCAPITYPE StaticGate::init(LPVOID user, LPVOID client, LPVOID opaque, PCHANNEL_DEF channels,
                                INT count, ULONG version, PCHANNEL_INIT_EVENT_EX_FN callback) noexcept {
  auto *self = static_cast<StaticGate *>(opaque);
  if (!self || !self->on_thread() || !self->installing_ || self->registered_ ||
      !user || !client || !callback || count != 1 || !channels ||
      std::strncmp(channels->name, "rdpdr", sizeof(channels->name)) != 0 ||
      version != VIRTUAL_CHANNEL_VERSION_WIN2000) return ERROR_INVALID_PARAMETER;
  self->delegate_user_ = user;self->delegate_init_ = callback;self->registered_ = true;
  UINT result = ERROR_INTERNAL_ERROR;
  try { result = self->host_.pVirtualChannelInitEx(self, client, self->handle_, channels, count, version, init_event); }
  catch (...) {
    // Unknown registration handoff: keep upstream alive until final host join.
    self->fail();return CHANNEL_RC_OK;
  }
  if (result != CHANNEL_RC_OK) {
    if (self->init_observed_) { self->fail();return CHANNEL_RC_OK; }
    self->registered_ = false;self->delegate_user_ = nullptr;self->delegate_init_ = nullptr;
  }
  return result;
}
UINT VCAPITYPE StaticGate::open(LPVOID opaque, LPDWORD result, PCHAR name,
                                PCHANNEL_OPEN_EVENT_EX_FN callback) noexcept {
  auto *self = static_cast<StaticGate *>(opaque);
  if (!self || !self->on_thread() || self->retiring_ || self->failed_.load() ||
      !self->connected_ || self->disconnected_ || self->open_handle_ || !result || !name ||
      std::strcmp(name, "rdpdr") != 0 || !callback) return ERROR_INVALID_STATE;
  self->delegate_open_ = callback;
  UINT status = ERROR_INTERNAL_ERROR;
  try { status = self->host_.pVirtualChannelOpenEx(self->handle_, result, name, open_event); }
  catch (...) { self->fail(); }
  if (status == CHANNEL_RC_OK && *result) self->open_handle_ = self->completion_handle_ = *result;
  else { self->delegate_open_ = nullptr;self->fail();if (status == CHANNEL_RC_OK) status = ERROR_INVALID_HANDLE; }
  return status;
}
UINT VCAPITYPE StaticGate::close(LPVOID opaque, DWORD handle) noexcept {
  auto *self = static_cast<StaticGate *>(opaque);
  if (!self || (!self->on_thread() && !self->finalizing_) || !handle ||
      handle != self->open_handle_ || self->closing_) return ERROR_INVALID_STATE;
  self->closing_ = true;
  UINT result = ERROR_INTERNAL_ERROR;
  try { result = self->host_.pVirtualChannelCloseEx(self->handle_, handle); } catch (...) { self->fail(); }
  self->closing_ = false;self->close_status_ = result;
  if (result == CHANNEL_RC_OK) self->open_handle_ = 0;
  else self->fail();
  return result;
}
UINT VCAPITYPE StaticGate::write(LPVOID opaque, DWORD handle, LPVOID data, ULONG size, LPVOID token) noexcept {
  auto *self = static_cast<StaticGate *>(opaque);
  if (!self || !self->on_thread()) return ERROR_INVALID_STATE;
  if (self->retiring_ || self->failed_.load() || !self->connected_ || self->disconnected_ ||
      !handle || handle != self->open_handle_ || self->writing_ || self->completing_) {
    self->fail();return ERROR_INVALID_STATE;
  }
  std::optional<std::uintptr_t> ticket;
  // rdpdr_send passes its public wStream as the completion token. Account
  // allocated capacity, not just the shorter payload in a reused pooled buffer.
  auto *stream = static_cast<wStream *>(token);
  if (!stream || Stream_Buffer(stream) != data || Stream_GetPosition(stream) != size ||
      !stream->count || Stream_Capacity(stream) < size || Stream_Capacity(stream) > maximum_stream_capacity ||
      (self->pool_ && stream->pool != self->pool_)) {
    self->fail();return ERROR_INVALID_DATA;
  }
  if (stream->pool) self->pool_ = stream->pool;
  if (size >= 4 && !restrict_capabilities({static_cast<BYTE *>(data), size})) {
    self->fail();return ERROR_INVALID_DATA;
  }
  try { ticket = self->budget_.admit(token, static_cast<BYTE *>(data), size, self->clock_(), Stream_Capacity(stream)); }
  catch (...) { self->fail();return ERROR_INTERNAL_ERROR; }
  if (!ticket) { increment(self->counters_.refusals);self->fail();return ERROR_NOT_ENOUGH_MEMORY; }
  increment(self->counters_.writes);self->writing_ = true;
  UINT result = ERROR_INTERNAL_ERROR;
  try {
    result = self->host_.pVirtualChannelWriteEx(self->handle_, handle, data, size,
                                                reinterpret_cast<LPVOID>(*ticket));
  } catch (...) {
    // Host may already hold the pointer. Never return a second-free status.
    self->writing_ = false;self->fail();return CHANNEL_RC_OK;
  }
  self->writing_ = false;
  if (result != CHANNEL_RC_OK) {
    increment(self->counters_.refusals);self->fail();
    const auto item = self->budget_.refused(*ticket);
    if (!item) return CHANNEL_RC_OK; // Inline completion already released upstream.
    wipe(*item); // Definitive refusal: caller still owns and will release its stream.
  }
  return result;
}
void StaticGate::complete(BorrowedWrite item, UINT event) noexcept {
  wipe(item);
  increment(event == CHANNEL_EVENT_WRITE_COMPLETE ? counters_.completions : counters_.cancellations);
  completing_ = true;
  try {
    if (delegate_open_) delegate_open_(delegate_user_, completion_handle_, event, item.token,
                                        static_cast<UINT>(item.bytes), static_cast<UINT>(item.bytes), 0);
    else fail();
  } catch (...) { fail(); }
  completing_ = false;
  trim_idle();
}
void StaticGate::disconnect() noexcept {
  if (!connected_ || disconnected_) return;
  disconnected_ = true;
  busy_ = true;
  try { if (delegate_init_) delegate_init_(delegate_user_, this, CHANNEL_EVENT_DISCONNECTED, nullptr, 0); }
  catch (...) { fail(); }
  busy_ = false;
}
UINT StaticGate::retire() noexcept {
  if (!on_thread() || busy_ || writing_ || closing_ || completing_) return ERROR_INVALID_STATE;
  retiring_ = true;budget_.stop();ingress_.close();
  const bool already_disconnected = disconnected_;
  disconnect();
  if (budget_.stats().pending) return ERROR_IO_PENDING;
  if (open_handle_) {
    if (!already_disconnected && connected_) return close_status_ == CHANNEL_RC_OK ? ERROR_INVALID_STATE : close_status_;
    const auto result = close(this, open_handle_);
    if (result != CHANNEL_RC_OK) return result;
  }
  retired_ = true;return CHANNEL_RC_OK;
}
void StaticGate::finish() noexcept {
  if (host_terminated_.load()) return;
  if (installing_ || busy_ || writing_ || closing_ || completing_) { fail();return; }
  // Pinned host drains/joins its queue BEFORE Terminated. Any still-uncertain
  // handoff can now be cancelled exactly once while the SDK pool is alive.
  finalizing_ = retiring_ = true;budget_.stop();ingress_.close();
  while (const auto item = budget_.cancel_after_join()) complete(*item, CHANNEL_EVENT_WRITE_CANCELLED);
  disconnect();
  if (open_handle_) (void)close(this, open_handle_);
  open_handle_ = 0;
  busy_ = true;
  pool_ = nullptr; // The SDK frees its pool during the following callback.
  try { if (delegate_init_) delegate_init_(delegate_user_, this, CHANNEL_EVENT_TERMINATED, nullptr, 0); }
  catch (...) { fail(); }
  busy_ = false;delegate_init_ = nullptr;delegate_open_ = nullptr;delegate_user_ = nullptr;
  retired_ = true;finalizing_ = false;host_terminated_.store(true);
}
void VCAPITYPE StaticGate::init_event(LPVOID opaque, LPVOID handle, UINT event, LPVOID data, UINT size) noexcept {
  auto *self = static_cast<StaticGate *>(opaque);
  if (!self || handle != self->handle_) return;
  if (event == CHANNEL_EVENT_TERMINATED) { self->finish();return; }
  if (!self->on_thread()) { self->fail();return; }
  self->init_observed_ = true;
  if (self->host_terminated_.load() || !self->registered_ || !self->delegate_init_ ||
      self->busy_ || self->writing_ || self->closing_ || self->completing_) { self->fail();return; }
  if (event == CHANNEL_EVENT_DISCONNECTED) {
    self->retiring_ = true;self->budget_.stop();self->ingress_.close();self->disconnect();return;
  }
  if (self->retiring_ || self->failed_.load()) return;
  if (event == CHANNEL_EVENT_INITIALIZED) {
    if (self->initialized_ || self->connected_) { self->fail();return; }
    self->initialized_ = true;
  } else if (event == CHANNEL_EVENT_CONNECTED) {
    if (!self->initialized_ || self->connected_ || self->disconnected_) { self->fail();return; }
    self->connected_ = true;
  }
  self->busy_ = true;
  try { self->delegate_init_(self->delegate_user_, self, event, data, size); }
  catch (...) { self->fail(); }
  self->busy_ = false;
}
void VCAPITYPE StaticGate::open_event(LPVOID opaque, DWORD handle, UINT event, LPVOID data,
                                     UINT size, UINT total, UINT flags) noexcept {
  auto *self = static_cast<StaticGate *>(opaque);
  if (!self) return;
  if (!self->on_thread()) { self->fail();return; }
  if (self->host_terminated_.load()) return;
  if (event == CHANNEL_EVENT_WRITE_COMPLETE || event == CHANNEL_EVENT_WRITE_CANCELLED) {
    if (self->completing_ || handle != self->completion_handle_ || flags) { self->fail();return; }
    try {
      const auto item = self->budget_.complete(reinterpret_cast<std::uintptr_t>(data), size, total, self->clock_());
      if (!item) { self->fail();return; }
      self->complete(*item, event);
      if (self->budget_.stats().failed) self->fail();
    } catch (...) { self->fail(); }
    return;
  }
  if (self->retiring_ || self->failed_.load()) return;
  if (self->busy_ || self->writing_ || self->closing_ || self->completing_ ||
      !self->delegate_open_ || !handle || handle != self->open_handle_) { self->fail();return; }
  if (event == CHANNEL_EVENT_DATA_RECEIVED) {
    constexpr UINT32 framing = CHANNEL_FLAG_FIRST | CHANNEL_FLAG_LAST;
    constexpr UINT32 notifications = CHANNEL_FLAG_SUSPEND | CHANNEL_FLAG_RESUME;
    constexpr UINT32 metadata = CHANNEL_FLAG_SHOW_PROTOCOL | CHANNEL_FLAG_SHADOW_PERSISTENT;
    if (flags & ~(framing | notifications | metadata)) { self->fail();return; }
    if (flags & notifications) {
      if ((flags & notifications) == notifications || (flags & framing) || size || total) self->fail();
      return; // Pinned RDPDR ignores these; preserve the active assembly deadline.
    }
    try {
      if ((!data && size) || !self->ingress_.admit(size, total, (flags & CHANNEL_FLAG_FIRST) != 0,
                                                  (flags & CHANNEL_FLAG_LAST) != 0, self->clock_())) {
        self->fail();return;
      }
      if ((flags & CHANNEL_FLAG_LAST) && ++self->counters_.dispatches_since_idle > maximum_pending_writes) {
        self->fail();return;
      }
    } catch (...) { self->fail();return; }
  }
  self->busy_ = true;
  try { self->delegate_open_(self->delegate_user_, handle, event, data, size, total, flags); }
  catch (...) { self->fail(); }
  self->busy_ = false;
  self->trim_idle();
}
} // namespace bridge::files::rdpdr
