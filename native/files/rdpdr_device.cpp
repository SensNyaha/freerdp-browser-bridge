#include "rdpdr_device.hpp"
#include "rdpdr_wire.hpp"
#include "rdpdr_static.hpp"
#include "drive_descriptor.hpp"
#include "../compat/bit.hpp"
#include <algorithm>
#include <atomic>
#include <cstring>
#include <exception>
#include <stdexcept>
#include <thread>
#include <freerdp/channels/channels.h>
#include <winpr/error.h>

namespace bridge::files::rdpdr {
namespace {
static_assert(static_cast<std::uint32_t>(NtStatus::success) == static_cast<std::uint32_t>(STATUS_SUCCESS));
static_assert(static_cast<std::uint32_t>(NtStatus::invalid_handle) == static_cast<std::uint32_t>(STATUS_INVALID_HANDLE));
static_assert(static_cast<std::uint32_t>(NtStatus::invalid_parameter) == static_cast<std::uint32_t>(STATUS_INVALID_PARAMETER));
static_assert(static_cast<std::uint32_t>(NtStatus::no_such_file) == static_cast<std::uint32_t>(STATUS_NO_SUCH_FILE));
static_assert(static_cast<std::uint32_t>(NtStatus::name_collision) == static_cast<std::uint32_t>(STATUS_OBJECT_NAME_COLLISION));
static_assert(static_cast<std::uint32_t>(NtStatus::access_denied) == static_cast<std::uint32_t>(STATUS_ACCESS_DENIED));
static_assert(static_cast<std::uint32_t>(NtStatus::sharing_violation) == static_cast<std::uint32_t>(STATUS_SHARING_VIOLATION));
static_assert(static_cast<std::uint32_t>(NtStatus::delete_pending) == static_cast<std::uint32_t>(STATUS_DELETE_PENDING));
static_assert(static_cast<std::uint32_t>(NtStatus::disk_full) == static_cast<std::uint32_t>(STATUS_DISK_FULL));
static_assert(static_cast<std::uint32_t>(NtStatus::device_not_ready) == static_cast<std::uint32_t>(STATUS_DEVICE_NOT_READY));
static_assert(static_cast<std::uint32_t>(NtStatus::not_supported) == static_cast<std::uint32_t>(STATUS_NOT_SUPPORTED));
static_assert(static_cast<std::uint32_t>(NtStatus::is_directory) == static_cast<std::uint32_t>(STATUS_FILE_IS_A_DIRECTORY));
static_assert(static_cast<std::uint32_t>(NtStatus::not_directory) == static_cast<std::uint32_t>(STATUS_NOT_A_DIRECTORY));
static_assert(static_cast<std::uint32_t>(NtStatus::directory_not_empty) == static_cast<std::uint32_t>(STATUS_DIRECTORY_NOT_EMPTY));
static_assert(static_cast<std::uint32_t>(NtStatus::too_many_open_files) == static_cast<std::uint32_t>(STATUS_TOO_MANY_OPENED_FILES));
static_assert(static_cast<std::uint32_t>(NtStatus::no_more_files) == static_cast<std::uint32_t>(STATUS_NO_MORE_FILES));
static_assert(IRP_MJ_CREATE == 0 && IRP_MJ_CLOSE == 2 && IRP_MJ_READ == 3 && IRP_MJ_WRITE == 4 &&
              IRP_MJ_QUERY_INFORMATION == 5 && IRP_MJ_SET_INFORMATION == 6 &&
              IRP_MJ_QUERY_VOLUME_INFORMATION == 10 && IRP_MJ_DIRECTORY_CONTROL == 12 &&
              IRP_MN_QUERY_DIRECTORY == 1);
static_assert(managed_io_mask == (RDPDR_IRP_MJ_CREATE | RDPDR_IRP_MJ_CLOSE | RDPDR_IRP_MJ_READ |
    RDPDR_IRP_MJ_WRITE | RDPDR_IRP_MJ_QUERY_VOLUME_INFORMATION | RDPDR_IRP_MJ_QUERY_INFORMATION |
    RDPDR_IRP_MJ_SET_INFORMATION | RDPDR_IRP_MJ_DIRECTORY_CONTROL));
static_assert(WRITE_DAC == 0x00040000U && WRITE_OWNER == 0x00080000U && ACCESS_SYSTEM_SECURITY == 0x01000000U);
static_assert(FileBasicInformation == 4 && FileStandardInformation == 5 && FileAttributeTagInformation == 35 &&
              FileDirectoryInformation == 1 && FileFullDirectoryInformation == 2 &&
              FileBothDirectoryInformation == 3 && FileNamesInformation == 12 &&
              FileDispositionInformation == 13 && FileEndOfFileInformation == 20 &&
              FileAllocationInformation == 19 && FileRenameInformation == 10);
constexpr std::size_t response_header_bytes = 16;
std::string folded(std::string_view name) {
  if (!valid_drive_name(name))
    throw std::invalid_argument("Invalid drive name");
  std::string result(name.substr(0, maximum_drive_dos_name));
  for (auto &ch : result) {
    if (!((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') ||
          (ch >= '0' && ch <= '9') || ch == '_' || ch == '-' || ch == ' '))
      throw std::invalid_argument("Invalid drive name");
    if (ch >= 'a' && ch <= 'z') ch = static_cast<char>(ch - 'a' + 'A');
  }
  return result;
}
class Device final : public DEVICE {
public:
  const std::shared_ptr<DriveSession> session;
  const std::size_t share_index;
  Wire wire;
  std::array<char, maximum_drive_name + 1> title{};
  std::array<char, maximum_drive_dos_name + 1> preferred{};
  std::thread::id thread;
  DEVMAN *manager = nullptr;
  bool attempted = false;
  std::atomic<bool> registered{false}, freed{false}, busy{false}, failed{false};
  Device(std::shared_ptr<DriveSession> owner, std::size_t share, std::string_view name)
      : DEVICE{}, session(std::move(owner)), share_index(share), wire(*session, share) {
    std::copy(name.begin(), name.end(), title.begin());
    std::copy_n(name.begin(), (std::min)(name.size(), maximum_drive_dos_name), preferred.begin());
    type = RDPDR_DTYP_FILESYSTEM;this->name = preferred.data();
    // Match pinned FreeRDP 3.32.1 drive_main.c's terminated narrow DeviceData.
    // Configured names are bounded ASCII; PreferredDosName has its own NUL.
    data = Stream_New(nullptr, name.size() + 1);
    if (!data) throw std::bad_alloc{};
    Stream_Write(data, title.data(), name.size() + 1);
    Stream_SealLength(data);
    Init = initialize;Free = release;IRPRequest = request;
  }
  ~Device() { if (data) Stream_Free(data, TRUE); }
  bool released() const noexcept { return !busy.load() && (!registered.load() || freed.load()); }
  void fail() noexcept {
    failed.store(true);
    try { session->retire();wire.close(); } catch (...) { /* Keep uncertain resources owned. */ }
  }
  static UINT discard(IRP *irp, UINT reason) noexcept {
    if (!irp) return reason;
    if (!irp->Discard) return ERROR_INVALID_PARAMETER;
    try {
      const auto result = irp->Discard(irp);
      return result == CHANNEL_RC_OK ? reason : result;
    } catch (...) { return ERROR_INTERNAL_ERROR; }
  }
  static UINT initialize(DEVICE *base) noexcept {
    if (!base) return ERROR_INVALID_PARAMETER;
    auto &self = *static_cast<Device *>(base);
    try {
      return self.registered.load() && !self.freed.load() && !self.failed.load() && !self.busy.load() &&
                     self.thread == std::this_thread::get_id() &&
                     self.session->volume(self.share_index).status == DriveStatus::ok ? CHANNEL_RC_OK : ERROR_INVALID_STATE;
    } catch (...) { return ERROR_INVALID_STATE; }
  }
  static UINT release(DEVICE *base) noexcept {
    if (!base) return ERROR_INVALID_PARAMETER;
    auto &self = *static_cast<Device *>(base);
    if (self.freed.load()) return CHANNEL_RC_OK;
    if (self.busy.exchange(true)) return ERROR_BUSY;
    // Final SDK free may run on a joined context-destruction thread. No channel
    // callback may overlap it; wrapper storage remains owned by Registration.
    try {
      self.wire.close();
      if (self.data) { Stream_Free(self.data, TRUE);self.data = nullptr; }
      self.freed.store(true);self.busy.store(false);return CHANNEL_RC_OK;
    } catch (...) {
      self.failed.store(true);self.busy.store(false);return ERROR_INTERNAL_ERROR;
    }
  }
  static UINT request(DEVICE *base, IRP *irp) noexcept {
    if (!base || !irp) return ERROR_INVALID_PARAMETER;
    auto &self = *static_cast<Device *>(base);
    if (!self.registered.load() || self.freed.load() || self.failed.load() ||
        self.thread != std::this_thread::get_id() || self.busy.exchange(true))
      return discard(irp, ERROR_INVALID_STATE);
    struct Joined { Device &self;~Joined() { self.busy.store(false); } } joined{self};
    try {
      if (irp->device != base || irp->devman != self.manager || !irp->input || !irp->output ||
          !irp->Complete || !irp->Discard || Stream_GetPosition(irp->output) != response_header_bytes ||
          Stream_GetRemainingLength(irp->input) > maximum_request_bytes) {
        self.fail();return discard(irp, ERROR_INVALID_DATA);
      }
      std::size_t capacity = 1024;
      if (irp->MajorFunction == IRP_MJ_READ && Stream_GetRemainingLength(irp->input) >= 4) {
        const auto *body = static_cast<const std::uint8_t *>(Stream_ConstPointer(irp->input));
        const auto count = std::uint32_t(body[0]) | std::uint32_t(body[1]) << 8U |
                           std::uint32_t(body[2]) << 16U | std::uint32_t(body[3]) << 24U;
        if (count <= maximum_transfer_bytes) capacity = static_cast<std::size_t>(count) + 4;
      }
      if (!Stream_EnsureRemainingCapacity(irp->output, capacity)) {
        self.fail();return discard(irp, ERROR_NOT_ENOUGH_MEMORY);
      }
      const auto bytes = ::bridge::compat::span<const std::uint8_t>(
          static_cast<const std::uint8_t *>(Stream_ConstPointer(irp->input)), Stream_GetRemainingLength(irp->input));
      auto reply = self.wire.request(irp->MajorFunction, irp->MinorFunction, irp->FileId, bytes);
      if (reply.malformed || reply.bytes.size() > capacity || reply.bytes.size() > maximum_reply_bytes) {
        self.fail();return discard(irp, ERROR_INVALID_DATA);
      }
      irp->IoStatus = static_cast<NTSTATUS>(reply.status);
      if (!reply.bytes.empty()) Stream_Write(irp->output, reply.bytes.data(), reply.bytes.size());
      std::fill(reply.bytes.begin(), reply.bytes.end(), 0);
      const bool terminal = reply.status == NtStatus::device_not_ready;
      if (terminal) self.fail();
      const auto complete = irp->Complete;
      auto *transferred = irp;irp = nullptr; // Callback may free, even before throwing.
      const auto result = complete(transferred);
      return terminal && result == CHANNEL_RC_OK ? ERROR_INVALID_STATE : result;
    } catch (const std::bad_alloc &) {
      self.fail();return discard(irp, ERROR_NOT_ENOUGH_MEMORY);
    } catch (...) {
      self.fail();return discard(irp, ERROR_INVALID_DATA);
    }
  }
};
} // namespace
struct Registration::Impl {
  rdpContext &context;
  std::vector<std::unique_ptr<Device>> devices;
  std::thread::id thread;
  bool bound = false, entering = false;
  Impl(rdpContext &ctx, const std::shared_ptr<DriveSession> &session, const std::vector<std::string> &names)
      : context(ctx) {
    if (!ctx.settings || !session || names.empty() || names.size() > 32)
      throw std::invalid_argument("Invalid drive registration");
    devices.reserve(names.size());
    std::vector<std::string> checked;
    for (std::size_t i = 0; i < names.size(); ++i) {
      const auto key = folded(names[i]);
      if (std::find(checked.begin(), checked.end(), key) != checked.end())
        throw std::invalid_argument("Invalid drive registration");
      checked.push_back(key);
      devices.push_back(std::make_unique<Device>(session, i, names[i]));
    }
  }
};
Registration::Registration(rdpContext &context, std::shared_ptr<DriveSession> session, std::vector<std::string> names)
    : impl_(std::make_unique<Impl>(context, session, names)) {}
Registration::~Registration() {
  if (!released()) std::terminate(); // Never leave SDK callbacks pointing at released wrappers.
}
bool Registration::released() const noexcept {
  return std::all_of(impl_->devices.begin(), impl_->devices.end(), [](const auto &item) { return item->released(); });
}
bool Registration::for_context(const rdpContext &context) const noexcept { return &impl_->context == &context; }
UINT Registration::install(PDEVICE_SERVICE_ENTRY_POINTS points) noexcept {
  auto &self = *impl_;
  if (self.entering || (self.bound && self.thread != std::this_thread::get_id())) return ERROR_INVALID_STATE;
  try {
    if (!points || points->rdpcontext != &self.context || !points->devman || !points->RegisterDevice ||
        !points->device || points->device->Type != RDPDR_DTYP_FILESYSTEM || !points->device->Name ||
        !freerdp_settings_get_bool(self.context.settings, FreeRDP_SynchronousStaticChannels) ||
        freerdp_settings_get_bool(self.context.settings, FreeRDP_AsyncChannels) ||
        freerdp_settings_get_bool(self.context.settings, FreeRDP_AsyncUpdate)) return ERROR_INVALID_PARAMETER;
    // Bounded scan; never strlen an untrusted/unbounded device name.
    std::size_t length = 0;
    while (length <= maximum_drive_name && points->device->Name[length]) ++length;
    if (!length || length > maximum_drive_name) return ERROR_INVALID_PARAMETER;
    const auto found = std::find_if(self.devices.begin(), self.devices.end(), [&](const auto &item) {
      return std::string_view(item->title.data()) == std::string_view(points->device->Name, length);
    });
    if (found == self.devices.end() || (*found)->attempted) return ERROR_INVALID_STATE;
    auto &device = **found;
    if (device.session->volume(device.share_index).status != DriveStatus::ok) return ERROR_INVALID_STATE;
    device.attempted = true;device.thread = self.thread = std::this_thread::get_id();self.bound = true;
    device.manager = points->devman;self.entering = true;
    UINT result;
    try { result = points->RegisterDevice(points->devman, &device); }
    catch (...) {
      // A throwing host may have retained its callback pointer. Keep wrapper
      // ownership until an explicit final Free acknowledgement, never guess.
      device.registered.store(true);self.entering = false;return ERROR_INTERNAL_ERROR;
    }
    self.entering = false;
    if (result != CHANNEL_RC_OK) return result;
    device.registered.store(true);
    points->device->Id = device.id;
    return device.id ? CHANNEL_RC_OK : ERROR_INVALID_DATA;
  } catch (...) { self.entering = false;return ERROR_INVALID_PARAMETER; }
}
std::atomic<Provider *> Provider::active_{nullptr};
Provider::~Provider() {
  if (bound_) { (void)close();if (bound_) std::terminate(); }
}
UINT Provider::bind(rdpContext &context, Registration &registration, StaticGate *gate) noexcept {
  if (bound_ || !registration.for_context(context) || !registration.released() ||
      (gate && !gate->ready_for(context))) return ERROR_INVALID_STATE;
  Provider *empty = nullptr;
  if (!active_.compare_exchange_strong(empty, this)) return ERROR_INVALID_STATE;
  const auto result = scope_.bind(context, load);
  if (result != CHANNEL_RC_OK) { active_.store(nullptr);return result; }
  registration_ = &registration;gate_ = gate;thread_ = std::this_thread::get_id();bound_ = true;
  return CHANNEL_RC_OK;
}
PVIRTUALCHANNELENTRY Provider::load(LPCSTR name, LPCSTR subsystem, LPCSTR type, DWORD flags) noexcept {
  auto *self = active_.load();
  const bool allowed = self && self->bound_ && self->thread_ == std::this_thread::get_id() &&
                       !self->entering_ && !self->loading_ && self->scope_.active();
  if (name && std::strcmp(name, "rdpdr") == 0) {
    if (flags & FREERDP_ADDIN_CHANNEL_DYNAMIC)
      return ::bridge::compat::bit_cast<PVIRTUALCHANNELENTRY>(static_cast<PDVC_PLUGIN_ENTRY>(dynamic_denied));
    if (!(flags & FREERDP_ADDIN_CHANNEL_ENTRYEX)) return legacy_denied;
    const auto refusal = ::bridge::compat::bit_cast<PVIRTUALCHANNELENTRY>(static_cast<PVIRTUALCHANNELENTRYEX>(channel_denied));
    if (!allowed || !self->gate_ || self->channel_attempted_ || subsystem || type ||
        flags != (FREERDP_ADDIN_CHANNEL_STATIC | FREERDP_ADDIN_CHANNEL_ENTRYEX) || !self->scope_.previous()) return refusal;
    self->loading_ = true;
    PVIRTUALCHANNELENTRY delegated = nullptr;
    try { delegated = self->scope_.previous()(name, nullptr, nullptr, flags); } catch (...) {}
    self->loading_ = false;
    if (!delegated) return refusal;
    self->channel_delegate_ = ::bridge::compat::bit_cast<PVIRTUALCHANNELENTRYEX>(delegated);
    return ::bridge::compat::bit_cast<PVIRTUALCHANNELENTRY>(static_cast<PVIRTUALCHANNELENTRYEX>(channel_entry));
  }
  if (name && std::strcmp(name, "drive") == 0) {
    // Refuse using the ABI requested by the selector. Returning a Win32 error
    // through a BOOL channel entry would incorrectly look like success.
    if (flags & FREERDP_ADDIN_CHANNEL_DYNAMIC)
      return ::bridge::compat::bit_cast<PVIRTUALCHANNELENTRY>(static_cast<PDVC_PLUGIN_ENTRY>(dynamic_denied));
    if (flags & FREERDP_ADDIN_CHANNEL_ENTRYEX)
      return ::bridge::compat::bit_cast<PVIRTUALCHANNELENTRY>(static_cast<PVIRTUALCHANNELENTRYEX>(channel_denied));
    if (flags & FREERDP_ADDIN_CHANNEL_STATIC) return legacy_denied;
    const bool selector = !subsystem && type && std::strcmp(type, "DeviceServiceEntry") == 0 && flags == 0;
    // A non-null denial prevents the SDK's dynamic-library fallback, including
    // foreign threads, mismatched selectors and callbacks after retirement.
    return ::bridge::compat::bit_cast<PVIRTUALCHANNELENTRY>(
        static_cast<PDEVICE_SERVICE_ENTRY>(allowed && selector ? enter : denied));
  }
  if (!allowed || !self->scope_.previous()) return nullptr;
  self->loading_ = true;
  PVIRTUALCHANNELENTRY result = nullptr;
  try { result = self->scope_.previous()(name, subsystem, type, flags); } catch (...) {}
  self->loading_ = false;return result;
}
UINT VCAPITYPE Provider::denied(PDEVICE_SERVICE_ENTRY_POINTS) noexcept { return ERROR_INVALID_STATE; }
BOOL VCAPITYPE Provider::legacy_denied(PCHANNEL_ENTRY_POINTS) noexcept { return FALSE; }
BOOL VCAPITYPE Provider::channel_denied(PCHANNEL_ENTRY_POINTS_EX, LPVOID) noexcept { return FALSE; }
BOOL VCAPITYPE Provider::channel_entry(PCHANNEL_ENTRY_POINTS_EX points, LPVOID handle) noexcept {
  auto *self = active_.load();
  if (!self || !self->bound_ || self->thread_ != std::this_thread::get_id() || self->entering_ ||
      self->loading_ || self->channel_attempted_ || !self->gate_ || !self->channel_delegate_ ||
      !self->scope_.active() || !points || points->cbSize != sizeof(CHANNEL_ENTRY_POINTS_FREERDP_EX)) return FALSE;
  self->channel_attempted_ = self->entering_ = true;
  const auto result = self->gate_->install(reinterpret_cast<CHANNEL_ENTRY_POINTS_FREERDP_EX *>(points),
                                           handle, self->channel_delegate_);
  self->entering_ = false;return result;
}
UINT VCAPITYPE Provider::dynamic_denied(IDRDYNVC_ENTRY_POINTS *) noexcept { return ERROR_NOT_SUPPORTED; }
UINT VCAPITYPE Provider::enter(PDEVICE_SERVICE_ENTRY_POINTS points) noexcept {
  auto *self = active_.load();
  if (!self || !self->bound_ || self->thread_ != std::this_thread::get_id() ||
      self->entering_ || self->loading_ || !self->scope_.active()) return ERROR_INVALID_STATE;
  self->entering_ = true;
  const auto result = self->registration_->install(points);
  self->entering_ = false;return result;
}
UINT Provider::close() noexcept {
  if (!bound_) return CHANNEL_RC_OK;
  if (thread_ != std::this_thread::get_id() || entering_ || loading_ ||
      active_.load() != this || !scope_.top()) return ERROR_INVALID_STATE;
  const auto result = scope_.close();
  if (scope_.bound()) return result;
  bound_ = false;registration_ = nullptr;gate_ = nullptr;channel_delegate_ = nullptr;
  active_.store(nullptr);return result;
}
UINT16 ReceiveGuard::resolve_channel(freerdp *instance) { return freerdp_channels_get_id_by_name(instance, "rdpdr"); }
ReceiveGuard::ReceiveGuard(freerdp &instance, pReceiveChannelData delegate, Resolve resolve)
    : instance_(instance), delegate_(delegate), resolve_(resolve) {
  if (!delegate || !resolve) throw std::invalid_argument("Invalid drive receive guard");
}
bool ReceiveGuard::fail() noexcept { failed_ = true;ingress_.close();return false; }
bool ReceiveGuard::poll(std::uint64_t now) noexcept {
  return !failed_ && !closed_ && (ingress_.poll(now) || fail());
}
void ReceiveGuard::close() noexcept { closed_ = true;ingress_.close(); }
bool ReceiveGuard::receive(UINT16 id, const BYTE *data, std::size_t size, UINT32 flags,
                             std::size_t total, std::uint64_t now) noexcept {
  if (busy_ || !poll(now)) return fail();
  busy_ = true;
  struct Joined { bool &busy;~Joined() { busy = false; } } joined{busy_};
  try {
    const auto channel = resolve_(&instance_);
    if (closed_ || (channel_ && channel != channel_)) return fail();
    channel_ = channel;
    if (channel_ && id == channel_) {
      constexpr UINT32 framing = CHANNEL_FLAG_FIRST | CHANNEL_FLAG_LAST;
      constexpr UINT32 notifications = CHANNEL_FLAG_SUSPEND | CHANNEL_FLAG_RESUME;
      constexpr UINT32 metadata = CHANNEL_FLAG_SHOW_PROTOCOL | CHANNEL_FLAG_SHADOW_PERSISTENT;
      if (flags & ~(framing | notifications | metadata)) return fail();
      if (flags & notifications) {
        if ((flags & notifications) == notifications || (flags & framing) || size || total) return fail();
      } else if ((!data && size) || !ingress_.admit(size, total, (flags & CHANNEL_FLAG_FIRST) != 0,
                                                   (flags & CHANNEL_FLAG_LAST) != 0, now)) return fail();
    }
    const auto result = delegate_(&instance_, id, data, size, flags, total);
    return result && !failed_ && !closed_ ? true : fail();
  } catch (...) { return fail(); }
}
} // namespace bridge::files::rdpdr
