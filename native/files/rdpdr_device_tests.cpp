#include "rdpdr_device.hpp"
#include "drive_descriptor.hpp"
#include "rdpdr_wire.hpp"
#include "rdpdr_static.hpp"
#include "rdpdr_loader.hpp"
#include <freerdp/client/cmdline.h>
#include "../compat/bit.hpp"
#include <catch2/catch_test_macros.hpp>
#include <algorithm>
#include <chrono>
#include <cstring>
#include <filesystem>
#include <freerdp/client.h>
#include <future>
#include <stdexcept>
#include <winpr/nt.h>
#ifdef _WIN32
#include "../runtime/private_directory.hpp"
#else
#include <sys/stat.h>
#endif

using namespace bridge::files;
namespace {
void put(std::vector<std::uint8_t> &body, std::uint64_t value, unsigned count) {
  for (unsigned i = 0; i < count; ++i) body.push_back(static_cast<std::uint8_t>(value >> (i * 8U)));
}
std::vector<std::uint8_t> create(std::uint32_t rights = 0xc0010080U, std::uint32_t mode = 2) {
  std::vector<std::uint8_t> body;
  put(body, rights, 4);put(body, 0, 8);put(body, FILE_ATTRIBUTE_NORMAL, 4);
  put(body, 7, 4);put(body, mode, 4);put(body, FILE_NON_DIRECTORY_FILE, 4);put(body, 10, 4);
  for (const auto ch : u"file") put(body, ch, 2);
  return body;
}
struct Host : DEVMAN {
  std::vector<DEVICE *> devices;
  bool refuse = false;
  static UINT add(DEVMAN *base, DEVICE *device) {
    auto &self = *static_cast<Host *>(base);
    if (self.refuse) return ERROR_INTERNAL_ERROR;
    device->id = static_cast<UINT32>(17 + self.devices.size());self.devices.push_back(device);
    return CHANNEL_RC_OK;
  }
  void close() {
    for (auto *device : devices) REQUIRE(device->Free(device) == CHANNEL_RC_OK);
    devices.clear();
  }
};
struct Fixture {
  std::filesystem::path root;
  std::optional<Sandbox> storage;
  std::shared_ptr<DriveSession> session;
  std::unique_ptr<rdpContext, decltype(&freerdp_client_context_free)> context{nullptr, freerdp_client_context_free};
  std::unique_ptr<rdpdr::Registration> registration;
  Host host{};
  explicit Fixture(std::vector<std::string> names = {"FILES", "READONLY"}) {
    root = std::filesystem::canonical(std::filesystem::temp_directory_path()) /
        ("bridge-rdpdr-device-" + std::to_string(std::chrono::steady_clock::now().time_since_epoch().count()));
#ifdef _WIN32
    REQUIRE(bridge::runtime::create_private_directory(root.native()) == ERROR_SUCCESS);
#else
    REQUIRE(mkdir(root.c_str(), 0700) == 0);
#endif
    auto opened = SafeRoot::open(root);REQUIRE(opened.first == Status::ok);
    auto owned = Sandbox::create(std::move(opened.second), {{131072, 131072, 8}, 4096});
    REQUIRE(owned.first == StoreStatus::ok);storage.emplace(std::move(owned.second));
    std::vector<ScopedSandbox> scopes;
    for (const auto access : {RootAccess::read_write, RootAccess::read_only}) {
      auto scope = storage->scope(0, access);REQUIRE(scope.first == StoreStatus::ok);
      scopes.push_back(std::move(scope.second));
    }
    session = std::make_shared<DriveSession>(std::move(scopes));
    RDP_CLIENT_ENTRY_POINTS points{};
    points.Size = sizeof(points);points.Version = RDP_CLIENT_INTERFACE_VERSION;
    points.ContextSize = sizeof(rdpClientContext);
    context.reset(freerdp_client_context_new(&points));REQUIRE(context);
    REQUIRE(freerdp_settings_set_bool(context->settings, FreeRDP_SynchronousStaticChannels, TRUE));
    REQUIRE(freerdp_settings_set_bool(context->settings, FreeRDP_AsyncChannels, FALSE));
    REQUIRE(freerdp_settings_set_bool(context->settings, FreeRDP_AsyncUpdate, FALSE));
    REQUIRE(freerdp_settings_set_bool(context->settings, FreeRDP_AutoReconnectionEnabled, FALSE));
    registration = std::make_unique<rdpdr::Registration>(*context, session, std::move(names));
  }
  UINT install(char *name, rdpContext *ctx = nullptr, PDEVICE_SERVICE_ENTRY entry = nullptr) {
    RDPDR_DEVICE descriptor{};descriptor.Type = RDPDR_DTYP_FILESYSTEM;descriptor.Name = name;
    DEVICE_SERVICE_ENTRY_POINTS points{&host, Host::add, &descriptor, ctx ? ctx : context.get()};
    const auto result = entry ? entry(&points) : registration->install(&points);
    if (result == CHANNEL_RC_OK) REQUIRE(descriptor.Id != 0);
    return result;
  }
  ~Fixture() {
    host.close();
    registration.reset();context.reset();
    session->retire();session.reset();
    if (storage->cleanup() != StoreStatus::ok) std::terminate();
    storage.reset();
    std::error_code error;
    if (!std::filesystem::remove(root, error) || error) std::terminate();
  }
};
struct Call : IRP {
  unsigned completed = 0, discarded = 0;
  std::vector<std::uint8_t> result;
  Call(DEVICE &device, Host &host, std::uint32_t major, std::uint32_t key,
         const std::vector<std::uint8_t> &body) : IRP{} {
    this->device = &device;devman = &host;MajorFunction = major;FileId = key;
    input = Stream_New(nullptr, std::max<std::size_t>(1, body.size()));
    output = Stream_New(nullptr, 16);
    if (!input || !output) throw std::bad_alloc{};
    if (!body.empty()) Stream_Write(input, body.data(), body.size());
    Stream_SealLength(input);REQUIRE(Stream_SetPosition(input, 0));
    Stream_Zero(output, 16);Stream_SealLength(output);
    Complete = [](IRP *base) -> UINT {
      auto &self = *static_cast<Call *>(base);++self.completed;
      const auto *begin = Stream_Buffer(self.output);
      self.result.assign(begin + 16, begin + Stream_GetPosition(self.output));return CHANNEL_RC_OK;
    };
    Discard = [](IRP *base) -> UINT { ++static_cast<Call *>(base)->discarded;return CHANNEL_RC_OK; };
  }
  ~Call() { Stream_Free(input, TRUE);Stream_Free(output, TRUE); }
  UINT run() { return device->IRPRequest(device, this); }
  std::uint32_t key() const {
    REQUIRE(result.size() >= 4);
    return std::uint32_t(result[0]) | std::uint32_t(result[1]) << 8U |
           std::uint32_t(result[2]) << 16U | std::uint32_t(result[3]) << 24U;
  }
};
} // namespace
TEST_CASE("Windows zero-length CREATE opens only the managed share root and preserves path terminator checks") {
  Fixture fixture;
  char writable[] = "FILES", readonly[] = "READONLY";
  REQUIRE(fixture.install(writable) == CHANNEL_RC_OK);
  REQUIRE(fixture.install(readonly) == CHANNEL_RC_OK);
  for (auto *device : fixture.host.devices) {
    REQUIRE(device->Init(device) == CHANNEL_RC_OK);
    auto root = create(0x00100080U, 1);
    root.resize(32);
    root[24] = 0x20;root[25] = root[26] = root[27] = 0;
    root[28] = root[29] = root[30] = root[31] = 0;
    for (const bool terminated : {false, true}) {
      auto body = root;
      if (terminated) { body[28] = 2;body.push_back(0);body.push_back(0); }
      Call opened(*device, fixture.host, IRP_MJ_CREATE, 0, body);
      REQUIRE(opened.run() == CHANNEL_RC_OK);
      REQUIRE(opened.IoStatus == STATUS_SUCCESS);
      REQUIRE(opened.key() != 0);
      Call closed(*device, fixture.host, IRP_MJ_CLOSE, opened.key(), std::vector<BYTE>(32));
      REQUIRE(closed.run() == CHANNEL_RC_OK);REQUIRE(closed.IoStatus == STATUS_SUCCESS);
    }
    auto unterminated = root;unterminated[28] = 2;unterminated.push_back('x');unterminated.push_back(0);
    Call refused(*device, fixture.host, IRP_MJ_CREATE, 0, unterminated);
    REQUIRE(refused.run() == CHANNEL_RC_OK);REQUIRE(refused.IoStatus == STATUS_INVALID_PARAMETER);
    auto odd = root;odd[28] = 1;odd.push_back(0);
    Call half(*device, fixture.host, IRP_MJ_CREATE, 0, odd);
    REQUIRE(half.run() == CHANNEL_RC_OK);REQUIRE(half.IoStatus == STATUS_INVALID_PARAMETER);
  }
}
TEST_CASE("Windows ordinary-file no-follow CREATE preserves read-only and delete access checks") {
  static_assert(FILE_OPEN_REPARSE_POINT == 0x00200000U);
  Fixture fixture;
  char writable[] = "FILES", readonly[] = "READONLY";
  REQUIRE(fixture.install(writable) == CHANNEL_RC_OK);
  REQUIRE(fixture.install(readonly) == CHANNEL_RC_OK);
  auto &rw = *fixture.host.devices[0];
  const auto invoke = [&](DEVICE &device, std::uint32_t major, std::uint32_t key,
                          const std::vector<std::uint8_t> &body, NTSTATUS expected) {
    Call call(device, fixture.host, major, key, body);
    REQUIRE(call.run() == CHANNEL_RC_OK);REQUIRE(call.IoStatus == expected);
    return call.result;
  };
  Call seed(rw, fixture.host, IRP_MJ_CREATE, 0, create());
  REQUIRE(seed.run() == CHANNEL_RC_OK);REQUIRE(seed.IoStatus == STATUS_SUCCESS);
  (void)invoke(rw, IRP_MJ_CLOSE, seed.key(), std::vector<std::uint8_t>(32), STATUS_SUCCESS);
  // Actual Windows DeleteFile request, including a no-follow flag. It must
  // not acquire data rights or bypass the independently read-only share.
  auto body = create(0x00010080U, 1);
  body[24] = 0x40;body[25] = 0;body[26] = 0x20;body[27] = 0;
  (void)invoke(*fixture.host.devices[1], IRP_MJ_CREATE, 0, body, STATUS_ACCESS_DENIED);
  Call opened(rw, fixture.host, IRP_MJ_CREATE, 0, body);
  REQUIRE(opened.run() == CHANNEL_RC_OK);REQUIRE(opened.IoStatus == STATUS_SUCCESS);
  const auto key = opened.key();
  std::vector<std::uint8_t> read;put(read, 1, 4);put(read, 0, 8);read.resize(32);
  (void)invoke(rw, IRP_MJ_READ, key, read, STATUS_ACCESS_DENIED);
  std::vector<std::uint8_t> disposition;put(disposition, 13, 4);put(disposition, 1, 4);
  disposition.resize(32);disposition.push_back(1);
  (void)invoke(rw, IRP_MJ_SET_INFORMATION, key, disposition, STATUS_SUCCESS);
  (void)invoke(rw, IRP_MJ_CLOSE, key, std::vector<std::uint8_t>(32), STATUS_SUCCESS);
  (void)invoke(rw, IRP_MJ_CREATE, 0, create(0x80000000U, 1), STATUS_NO_SUCH_FILE);
  body.resize(32);
  const auto escaped = u"..\\outside";
  const auto length = std::char_traits<char16_t>::length(escaped) + 1;
  body[28] = static_cast<std::uint8_t>(length * 2);body[29] = body[30] = body[31] = 0;
  for (std::size_t i = 0; i < length; ++i) put(body, escaped[i], 2);
  (void)invoke(rw, IRP_MJ_CREATE, 0, body, STATUS_INVALID_PARAMETER);
}
TEST_CASE("Windows NO_RECALL reads managed files without granting bypass rights") {
  static_assert(FILE_OPEN_NO_RECALL == 0x00400000U);
  Fixture fixture;
  char writable[] = "FILES", readonly[] = "READONLY";
  REQUIRE(fixture.install(writable) == CHANNEL_RC_OK);
  REQUIRE(fixture.install(readonly) == CHANNEL_RC_OK);
  auto &rw = *fixture.host.devices[0];
  Call seed(rw, fixture.host, IRP_MJ_CREATE, 0, create());
  REQUIRE(seed.run() == CHANNEL_RC_OK);REQUIRE(seed.IoStatus == STATUS_SUCCESS);
  const auto seed_key = seed.key();
  std::vector<std::uint8_t> payload;put(payload, 4, 4);put(payload, 0, 8);payload.resize(32);
  payload.insert(payload.end(), {0, 255, 17, 128});
  Call write(rw, fixture.host, IRP_MJ_WRITE, seed_key, payload);
  REQUIRE(write.run() == CHANNEL_RC_OK);REQUIRE(write.IoStatus == STATUS_SUCCESS);
  const auto invoke = [&](DEVICE &device, std::uint32_t major, std::uint32_t key,
                          const std::vector<std::uint8_t> &body, NTSTATUS expected) {
    Call call(device, fixture.host, major, key, body);
    REQUIRE(call.run() == CHANNEL_RC_OK);REQUIRE(call.IoStatus == expected);
    return call.result;
  };
  (void)invoke(rw, IRP_MJ_CLOSE, seed_key, std::vector<std::uint8_t>(32), STATUS_SUCCESS);
  const auto request = [](std::uint32_t rights, std::uint32_t extra = 0) {
    auto body = create(rights, 1);
    const std::uint32_t options = 0x00400064U | extra;
    for (unsigned i = 0; i < 4; ++i) body[24 + i] = static_cast<std::uint8_t>(options >> (i * 8U));
    return body;
  };
  for (auto *device : fixture.host.devices) {
    // Actual Windows .NET FileStream request: read/control/synchronize,
    // sequential non-directory synchronous open with NO_RECALL.
    Call opened(*device, fixture.host, IRP_MJ_CREATE, 0, request(0x00120089U));
    REQUIRE(opened.run() == CHANNEL_RC_OK);REQUIRE(opened.IoStatus == STATUS_SUCCESS);
    const auto key = opened.key();
    payload.resize(32);
    REQUIRE(invoke(*device, IRP_MJ_READ, key, payload, STATUS_SUCCESS) ==
            std::vector<BYTE>{4, 0, 0, 0, 0, 255, 17, 128});
    (void)invoke(*device, IRP_MJ_CLOSE, key, std::vector<std::uint8_t>(32), STATUS_SUCCESS);
    for (const auto forbidden : {0x2000U, 0x4000U, 0x80000000U})
      (void)invoke(*device, IRP_MJ_CREATE, 0, request(0x00120089U, forbidden), STATUS_NOT_SUPPORTED);
  }
  (void)invoke(*fixture.host.devices[1], IRP_MJ_CREATE, 0, request(0x40000000U), STATUS_ACCESS_DENIED);
}
TEST_CASE("Public RDPDR DEVICE callbacks register bounded names and perform actual native file IO without an RDP server") {
  Fixture fixture;
  char writable[] = "FILES", readonly[] = "READONLY";
  REQUIRE(fixture.install(writable) == CHANNEL_RC_OK);
  REQUIRE(fixture.install(readonly) == CHANNEL_RC_OK);
  REQUIRE_FALSE(fixture.registration->released());
  auto &device = *fixture.host.devices[0];
  REQUIRE(device.type == RDPDR_DTYP_FILESYSTEM);
  REQUIRE(device.Init(&device) == CHANNEL_RC_OK);
  REQUIRE(std::string_view(device.name) == "FILES");
  // This is the pinned SDK's terminated narrow DeviceData representation.
  REQUIRE(Stream_GetPosition(device.data) == 6);
  const std::vector<BYTE> expected_name{'F', 'I', 'L', 'E', 'S', 0};
  REQUIRE(std::vector<BYTE>(Stream_Buffer(device.data),
                           Stream_Buffer(device.data) + Stream_GetPosition(device.data)) == expected_name);
  Call opened(device, fixture.host, IRP_MJ_CREATE, 0, create());
  REQUIRE(opened.run() == CHANNEL_RC_OK);REQUIRE(opened.completed == 1);
  REQUIRE(opened.IoStatus == STATUS_SUCCESS);
  const auto key = opened.key();REQUIRE(key != 0);
  std::vector<std::uint8_t> payload;put(payload, 4, 4);put(payload, 0, 8);payload.resize(32, 0x61);
  payload.insert(payload.end(), {0, 255, 17, 128});
  Call write(device, fixture.host, IRP_MJ_WRITE, key, payload);
  REQUIRE(write.run() == CHANNEL_RC_OK);REQUIRE(write.IoStatus == STATUS_SUCCESS);
  REQUIRE(write.result == std::vector<std::uint8_t>{4, 0, 0, 0, 0});
  payload.resize(32);
  Call read(device, fixture.host, IRP_MJ_READ, key, payload);
  REQUIRE(read.run() == CHANNEL_RC_OK);REQUIRE(read.IoStatus == STATUS_SUCCESS);
  REQUIRE(read.result == std::vector<std::uint8_t>{4, 0, 0, 0, 0, 255, 17, 128});
  auto &ro = *fixture.host.devices[1];
  Call denied(ro, fixture.host, IRP_MJ_CREATE, 0, create(0x40000000U, 1));
  REQUIRE(denied.run() == CHANNEL_RC_OK);REQUIRE(denied.IoStatus == STATUS_ACCESS_DENIED);
  REQUIRE(fixture.install(writable) == ERROR_INVALID_STATE);
}
TEST_CASE("Public RDPDR registration refuses foreign contexts, async callbacks and unselected names before ownership transfer") {
  Fixture fixture;
  char name[] = "FILES", foreign[] = "FOREIGN";
  rdpContext other{};
  REQUIRE(fixture.install(name, &other) == ERROR_INVALID_PARAMETER);
  REQUIRE(fixture.install(foreign) == ERROR_INVALID_STATE);
  REQUIRE(freerdp_settings_set_bool(fixture.context->settings, FreeRDP_AsyncChannels, TRUE));
  REQUIRE(fixture.install(name) == ERROR_INVALID_PARAMETER);
  REQUIRE(fixture.host.devices.empty());REQUIRE(fixture.registration->released());
  REQUIRE(freerdp_settings_set_bool(fixture.context->settings, FreeRDP_AsyncChannels, FALSE));
  fixture.host.refuse = true;
  REQUIRE(fixture.install(name) == ERROR_INTERNAL_ERROR);
  REQUIRE(fixture.registration->released());
  REQUIRE_THROWS_AS(rdpdr::Registration(*fixture.context, fixture.session, {"FILES", "files"}), std::invalid_argument);
  REQUIRE_THROWS_AS(rdpdr::Registration(*fixture.context, fixture.session, {std::string(65, 'A')}), std::invalid_argument);
  REQUIRE_THROWS_AS(rdpdr::Registration(*fixture.context, fixture.session, {"ABCDEFG0", "abcdefg1"}), std::invalid_argument);
}
TEST_CASE("Public RDPDR maximum allowed selects entry rights and never upgrades a reduced handle") {
  static_assert(MAXIMUM_ALLOWED == 0x02000000U);
  Fixture fixture;
  char writable[] = "FILES", readonly[] = "READONLY";
  REQUIRE(fixture.install(writable) == CHANNEL_RC_OK);
  REQUIRE(fixture.install(readonly) == CHANNEL_RC_OK);
  auto &device = *fixture.host.devices[0];auto &ro = *fixture.host.devices[1];
  const auto invoke = [&](DEVICE &target, std::uint32_t major, std::uint32_t key,
                          const std::vector<std::uint8_t> &body, NTSTATUS expected) {
    Call call(target, fixture.host, major, key, body);
    REQUIRE(call.run() == CHANNEL_RC_OK);REQUIRE(call.completed == 1);
    REQUIRE(call.discarded == 0);REQUIRE(call.IoStatus == expected);
    return call.result;
  };
  const auto opened = invoke(device, IRP_MJ_CREATE, 0, create(), STATUS_SUCCESS);
  REQUIRE(opened.size() == 5);
  const auto key = std::uint32_t(opened[0]) | std::uint32_t(opened[1]) << 8U |
                   std::uint32_t(opened[2]) << 16U | std::uint32_t(opened[3]) << 24U;
  std::vector<BYTE> payload;put(payload, 4, 4);put(payload, 0, 8);payload.resize(32, 0);
  payload.insert(payload.end(), {0, 255, 17, 128});
  (void)invoke(device, IRP_MJ_WRITE, key, payload, STATUS_SUCCESS);
  REQUIRE(fixture.session->set_basic(0, key, {{}, file_readonly}) == DriveStatus::ok);
  (void)invoke(device, IRP_MJ_CLOSE, key, std::vector<BYTE>(32), STATUS_SUCCESS);
  const auto maximum = invoke(device, IRP_MJ_CREATE, 0, create(MAXIMUM_ALLOWED, 1), STATUS_SUCCESS);
  REQUIRE(maximum.size() == 5);
  const auto reduced = std::uint32_t(maximum[0]) | std::uint32_t(maximum[1]) << 8U |
                       std::uint32_t(maximum[2]) << 16U | std::uint32_t(maximum[3]) << 24U;
  (void)invoke(device, IRP_MJ_CREATE, 0, create(MAXIMUM_ALLOWED | FILE_WRITE_DATA, 1), STATUS_ACCESS_DENIED);
  (void)invoke(ro, IRP_MJ_CREATE, 0, create(MAXIMUM_ALLOWED | FILE_WRITE_ATTRIBUTES, 1), STATUS_ACCESS_DENIED);
  (void)invoke(device, IRP_MJ_WRITE, reduced, payload, STATUS_ACCESS_DENIED);
  payload.resize(32);
  REQUIRE(invoke(device, IRP_MJ_READ, reduced, payload, STATUS_SUCCESS) ==
          std::vector<BYTE>{4, 0, 0, 0, 0, 255, 17, 128});
  REQUIRE(fixture.session->set_basic(0, reduced, {{}, file_normal}) == DriveStatus::ok);
  payload.insert(payload.end(), {0, 255, 17, 128});
  (void)invoke(device, IRP_MJ_WRITE, reduced, payload, STATUS_ACCESS_DENIED);
  REQUIRE(fixture.session->rename(0, reduced, "other") == DriveStatus::denied);
  REQUIRE(fixture.session->remove_on_close(0, reduced, true) == DriveStatus::denied);
  (void)invoke(device, IRP_MJ_CLOSE, reduced, std::vector<BYTE>(32), STATUS_SUCCESS);
}
TEST_CASE("Managed loader preserves network features without implicit host drives or fake audio") {
  Fixture f;
  auto *s = f.context->settings;
  for (const auto key : {FreeRDP_RedirectDrives, FreeRDP_RedirectHomeDrive, FreeRDP_RedirectClipboard,
                         FreeRDP_RedirectPrinters, FreeRDP_RedirectSerialPorts, FreeRDP_RedirectSmartCards,
                         FreeRDP_SupportDynamicChannels, FreeRDP_SupportDisplayControl,
                         FreeRDP_SupportGraphicsPipeline, FreeRDP_AudioPlayback, FreeRDP_AudioCapture})
    REQUIRE(freerdp_settings_set_bool(s, key, FALSE));
  for (const auto key : {FreeRDP_NetworkAutoDetect, FreeRDP_SupportHeartbeatPdu, FreeRDP_SupportMultitransport})
    REQUIRE(freerdp_settings_set_bool(s, key, TRUE));
  for (const auto *name : {"FILES", "READONLY"}) {
    const char *args[]{name, "."};
    auto *device = freerdp_device_new(RDPDR_DTYP_FILESYSTEM, 2, args);REQUIRE(device);
    if (!freerdp_device_collection_add(s, device)) {
      freerdp_device_free(device);FAIL("Cannot add managed descriptor");
    }
  }
  rdpdr::StaticGate gate(*f.context);
  rdpdr::Provider provider;
  REQUIRE(provider.bind(*f.context, *f.registration, &gate) == CHANNEL_RC_OK);
  struct Disconnect {
    freerdp *instance;
    ~Disconnect() { (void)freerdp_disconnect(instance); }
  } disconnect{f.context->instance};
  SECTION("only selected filesystem devices") {
    REQUIRE(rdpdr::load_managed_channels(*f.context));
    REQUIRE_FALSE(gate.ready_for(*f.context)); // Public SDK entry actually installed.
    REQUIRE(freerdp_settings_get_bool(s, FreeRDP_DeviceRedirection));
    REQUIRE(freerdp_settings_get_uint32(s, FreeRDP_DeviceCount) == 2);
    REQUIRE_FALSE(freerdp_static_channel_collection_find(s, "rdpsnd"));
    REQUIRE_FALSE(freerdp_dynamic_channel_collection_find(s, "rdpsnd"));
    REQUIRE_FALSE(freerdp_settings_get_bool(s, FreeRDP_AudioPlayback));
  }
  SECTION("host enumeration selector refuses before channel registration") {
    REQUIRE(freerdp_settings_set_bool(s, FreeRDP_RedirectDrives, TRUE));
    REQUIRE_FALSE(rdpdr::load_managed_channels(*f.context));
    REQUIRE(gate.ready_for(*f.context));
    REQUIRE(freerdp_settings_get_uint32(s, FreeRDP_DeviceCount) == 2);
  }
  for (const auto key : {FreeRDP_NetworkAutoDetect, FreeRDP_SupportHeartbeatPdu, FreeRDP_SupportMultitransport})
    REQUIRE(freerdp_settings_get_bool(s, key));
  REQUIRE(provider.close() == CHANNEL_RC_OK);
}
TEST_CASE("Public RDPDR callbacks discard malformed frames, latch failure and join final free on another thread") {
  Fixture fixture;
  char name[] = "FILES";
  REQUIRE(fixture.install(name) == CHANNEL_RC_OK);
  auto &device = *fixture.host.devices[0];
  Call foreign(device, fixture.host, IRP_MJ_CREATE, 0, create());
  REQUIRE(std::async(std::launch::async, [&] { return foreign.run(); }).get() == ERROR_INVALID_STATE);
  REQUIRE(foreign.discarded == 1);REQUIRE(fixture.storage->usage().entries == 0);
  Call malformed(device, fixture.host, IRP_MJ_WRITE, 1, {0});
  REQUIRE(malformed.run() == ERROR_INVALID_DATA);REQUIRE(malformed.discarded == 1);
  Call late(device, fixture.host, IRP_MJ_CREATE, 0, create());
  REQUIRE(late.run() == ERROR_INVALID_STATE);REQUIRE(late.discarded == 1);
  REQUIRE(std::async(std::launch::async, [&] { return device.Free(&device); }).get() == CHANNEL_RC_OK);
  REQUIRE(fixture.registration->released());
}
TEST_CASE("Public drive loader intercepts only its context-bound device ABI and restores the previous provider") {
  Fixture fixture;
  const auto previous = freerdp_get_current_addin_provider();
  struct Restore { FREERDP_LOAD_CHANNEL_ADDIN_ENTRY_FN previous;~Restore() { (void)freerdp_register_addin_provider(previous, 0); } } restore{previous};
  rdpdr::Provider provider;
  REQUIRE(provider.bind(*fixture.context, *fixture.registration) == CHANNEL_RC_OK);
  const auto load = freerdp_get_current_addin_provider();REQUIRE(load);
  const auto unguarded = ::bridge::compat::bit_cast<PVIRTUALCHANNELENTRYEX>(
      load("rdpdr", nullptr, nullptr, FREERDP_ADDIN_CHANNEL_STATIC | FREERDP_ADDIN_CHANNEL_ENTRYEX));
  REQUIRE(unguarded);REQUIRE(unguarded(nullptr, nullptr) == FALSE);
  auto entry = ::bridge::compat::bit_cast<PDEVICE_SERVICE_ENTRY>(load("drive", nullptr, "DeviceServiceEntry", 0));
  REQUIRE(entry);
  char name[] = "FILES";
  REQUIRE(fixture.install(name, nullptr, entry) == CHANNEL_RC_OK);
  const auto legacy = load("drive", nullptr, nullptr, FREERDP_ADDIN_CHANNEL_STATIC);
  REQUIRE(legacy);REQUIRE(legacy(nullptr) == FALSE);
  const auto extended = ::bridge::compat::bit_cast<PVIRTUALCHANNELENTRYEX>(
      load("drive", nullptr, nullptr, FREERDP_ADDIN_CHANNEL_STATIC | FREERDP_ADDIN_CHANNEL_ENTRYEX));
  REQUIRE(extended);REQUIRE(extended(nullptr, nullptr) == FALSE);
  const auto dynamic = ::bridge::compat::bit_cast<PDVC_PLUGIN_ENTRY>(
      load("drive", nullptr, nullptr, FREERDP_ADDIN_CHANNEL_DYNAMIC));
  REQUIRE(dynamic);REQUIRE(dynamic(nullptr) == ERROR_NOT_SUPPORTED);
  const auto wrong = ::bridge::compat::bit_cast<PDEVICE_SERVICE_ENTRY>(
      load("drive", "unexpected", "DeviceServiceEntry", 0));
  REQUIRE(wrong);REQUIRE(wrong(nullptr) == ERROR_INVALID_STATE);
  REQUIRE(std::async(std::launch::async, [&] {
    const auto denied = ::bridge::compat::bit_cast<PDEVICE_SERVICE_ENTRY>(load("drive", nullptr, "DeviceServiceEntry", 0));
    return denied ? denied(nullptr) : 0U;
  }).get() == ERROR_INVALID_STATE);
  REQUIRE(provider.close() == CHANNEL_RC_OK);
  REQUIRE(freerdp_get_current_addin_provider() == previous);
  REQUIRE(entry(nullptr) == ERROR_INVALID_STATE); // Saved entry cannot revive the retired scope.
  REQUIRE(fixture.host.devices[0]->Init(fixture.host.devices[0]) == CHANNEL_RC_OK); // DEVICE lifetime is independent.
}
namespace {
struct Receiver : freerdp {
  unsigned calls = 0;
  std::size_t advertised = 0;
  UINT16 id = 41;
  static UINT16 resolve(freerdp *instance) { return static_cast<Receiver *>(instance)->id; }
  static BOOL receive(freerdp *instance, UINT16 channel, const BYTE *, std::size_t,
                        UINT32 flags, std::size_t total) {
    auto &self = *static_cast<Receiver *>(instance);++self.calls;
    if (channel == self.id && (flags & CHANNEL_FLAG_FIRST)) self.advertised = total;
    return TRUE;
  }
};
} // namespace
TEST_CASE("Public RDPDR receive guard refuses SDK allocation before delegation and preserves the partial deadline") {
  const std::array<BYTE, 4> bytes{0x72, 0x44, 0x49, 0x52};
  Receiver oversized{};
  rdpdr::ReceiveGuard rejected(oversized, Receiver::receive, Receiver::resolve);
  REQUIRE_FALSE(rejected.receive(41, bytes.data(), bytes.size(), CHANNEL_FLAG_FIRST,
                                  rdpdr::maximum_request_bytes + 25, 1));
  REQUIRE(oversized.calls == 0);REQUIRE(oversized.advertised == 0);
  Receiver receiver{};
  rdpdr::ReceiveGuard guard(receiver, Receiver::receive, Receiver::resolve);
  REQUIRE(guard.receive(41, bytes.data(), 2, CHANNEL_FLAG_FIRST, 4, 1));
  REQUIRE(guard.receive(41, nullptr, 0, CHANNEL_FLAG_SUSPEND, 0, 2));
  REQUIRE(guard.receive(42, bytes.data(), 4, CHANNEL_FLAG_FIRST | CHANNEL_FLAG_LAST, 4, 3));
  REQUIRE(receiver.calls == 3);
  REQUIRE_FALSE(guard.poll(10001));
  REQUIRE_FALSE(guard.receive(41, bytes.data(), 2, CHANNEL_FLAG_LAST, 4, 10002));
  REQUIRE(receiver.calls == 3);
  Receiver migrated{};
  rdpdr::ReceiveGuard generation(migrated, Receiver::receive, Receiver::resolve);
  REQUIRE(generation.receive(41, bytes.data(), 4, CHANNEL_FLAG_FIRST | CHANNEL_FLAG_LAST, 4, 1));
  migrated.id = 43;
  REQUIRE_FALSE(generation.receive(43, bytes.data(), 4, CHANNEL_FLAG_FIRST | CHANNEL_FLAG_LAST, 4, 2));
}
namespace {
struct ChannelHost {
  struct Write { LPVOID ticket;UINT bytes; };
  CHANNEL_ENTRY_POINTS_FREERDP_EX points{};
  LPVOID user = nullptr;
  PCHANNEL_INIT_EVENT_EX_FN init = nullptr;
  PCHANNEL_OPEN_EVENT_EX_FN opened = nullptr;
  std::vector<Write> pending;
  std::vector<std::vector<BYTE>> packets;
  unsigned calls = 0, closes = 0;
  bool inline_completion = false, complete_then_error = false, throw_after_handoff = false;
  unsigned close_failures = 0;
  rdpdr::StaticGate *nested_retire = nullptr;
  UINT nested_retire_result = CHANNEL_RC_OK;
  bool terminated = false;
  UINT write_result = CHANNEL_RC_OK;
  UINT init_result = CHANNEL_RC_OK;
  bool throw_after_init = false;
  explicit ChannelHost(rdpContext &context) {
    points.cbSize = sizeof(points);points.protocolVersion = VIRTUAL_CHANNEL_VERSION_WIN2000;
    points.MagicNumber = FREERDP_CHANNEL_MAGIC_NUMBER;points.context = &context;
    points.pVirtualChannelInitEx = [](LPVOID user, LPVOID, LPVOID handle, PCHANNEL_DEF channels,
                                      INT count, ULONG, PCHANNEL_INIT_EVENT_EX_FN callback) -> UINT {
      if (!handle || !user || count != 1 || !channels || std::strcmp(channels->name, "rdpdr")) return ERROR_INVALID_PARAMETER;
      auto &self = *static_cast<ChannelHost *>(handle);
      if (self.init_result != CHANNEL_RC_OK) return self.init_result;
      self.user = user;self.init = callback;
      if (self.throw_after_init) throw std::runtime_error("Synthetic unknown registration handoff");
      return CHANNEL_RC_OK;
    };
    points.pVirtualChannelOpenEx = [](LPVOID handle, LPDWORD result, PCHAR name, PCHANNEL_OPEN_EVENT_EX_FN callback) -> UINT {
      auto &self = *static_cast<ChannelHost *>(handle);
      if (!result || !name || std::strcmp(name, "rdpdr") || !callback) return ERROR_INVALID_PARAMETER;
      self.opened = callback;*result = 19;return CHANNEL_RC_OK;
    };
    points.pVirtualChannelCloseEx = [](LPVOID handle, DWORD channel) -> UINT {
      if (channel != 19) return ERROR_INVALID_HANDLE;
      auto &self = *static_cast<ChannelHost *>(handle);++self.closes;
      if (self.close_failures) { --self.close_failures;return ERROR_ACCESS_DENIED; }
      return CHANNEL_RC_OK;
    };
    points.pVirtualChannelWriteEx = [](LPVOID handle, DWORD channel, LPVOID data, ULONG size, LPVOID ticket) -> UINT {
      auto &self = *static_cast<ChannelHost *>(handle);++self.calls;
      if (channel != 19 || !data || !ticket || !size) return ERROR_INVALID_PARAMETER;
      if (self.nested_retire) self.nested_retire_result = self.nested_retire->retire();
      if (self.write_result != CHANNEL_RC_OK && !self.complete_then_error) return self.write_result;
      const auto *bytes = static_cast<BYTE *>(data);self.packets.emplace_back(bytes, bytes + size);
      if (self.inline_completion || self.complete_then_error)
        self.opened(self.user, channel, CHANNEL_EVENT_WRITE_COMPLETE, ticket, size, size, 0);
      else self.pending.push_back({ticket, size});
      if (self.throw_after_handoff) throw std::runtime_error("Synthetic unknown channel handoff");
      return self.complete_then_error ? ERROR_ACCESS_DENIED : CHANNEL_RC_OK;
    };
  }
  void load(PVIRTUALCHANNELENTRYEX entry) {
    REQUIRE(entry);REQUIRE(entry(reinterpret_cast<PCHANNEL_ENTRY_POINTS_EX>(&points), this));
    REQUIRE(user);REQUIRE(init);
  }
  void connect() {
    init(user, this, CHANNEL_EVENT_INITIALIZED, nullptr, 0);
    init(user, this, CHANNEL_EVENT_CONNECTED, nullptr, 0);REQUIRE(opened);
  }
  void drain(UINT event = CHANNEL_EVENT_WRITE_COMPLETE) {
    while (!pending.empty()) {
      const auto item = pending.back();pending.pop_back();
      opened(user, 19, event, item.ticket, item.bytes, item.bytes, 0);
    }
  }
  void send(const std::vector<BYTE> &packet, UINT total = 0, UINT flags = CHANNEL_FLAG_ONLY) {
    opened(user, 19, CHANNEL_EVENT_DATA_RECEIVED, const_cast<BYTE *>(packet.data()),
             static_cast<UINT>(packet.size()), total ? total : static_cast<UINT>(packet.size()), flags);
  }
  void finish(bool acknowledge = true) {
    if (!user || terminated) return;
    if (acknowledge) drain();else pending.clear(); // Final host join, no later pointer use.
    init(user, this, CHANNEL_EVENT_DISCONNECTED, nullptr, 0);
    init(user, this, CHANNEL_EVENT_TERMINATED, nullptr, 0);terminated = true;
  }
  ~ChannelHost() { finish(); }
};
struct SyntheticChannel {
  struct Buffer : wStream { std::vector<BYTE> bytes;bool active = false;Buffer() : wStream{} {} };
  static thread_local SyntheticChannel *selected;
  CHANNEL_ENTRY_POINTS_FREERDP_EX api{};
  LPVOID handle = nullptr;
  DWORD channel = 0;
  std::array<Buffer, 65> buffers;
  unsigned releases = 0, duplicate_releases = 0, not_wiped = 0, terminations = 0, received = 0;
  static BOOL VCAPITYPE entry(PCHANNEL_ENTRY_POINTS_EX points, LPVOID handle) {
    auto *self = selected;if (!self) return FALSE;
    self->api = *reinterpret_cast<CHANNEL_ENTRY_POINTS_FREERDP_EX *>(points);self->handle = handle;
    CHANNEL_DEF definition{};std::memcpy(definition.name, "rdpdr", 6);
    return self->api.pVirtualChannelInitEx(self, self, handle, &definition, 1,
        VIRTUAL_CHANNEL_VERSION_WIN2000, init) == CHANNEL_RC_OK;
  }
  static void VCAPITYPE init(LPVOID user, LPVOID, UINT event, LPVOID, UINT) {
    auto &self = *static_cast<SyntheticChannel *>(user);
    if (event == CHANNEL_EVENT_CONNECTED) {
      char name[] = "rdpdr";
      (void)self.api.pVirtualChannelOpenEx(self.handle, &self.channel, name, open);
    } else if (event == CHANNEL_EVENT_DISCONNECTED && self.channel) {
      (void)self.api.pVirtualChannelCloseEx(self.handle, self.channel);self.channel = 0;
    } else if (event == CHANNEL_EVENT_TERMINATED) ++self.terminations;
  }
  static void VCAPITYPE open(LPVOID user, DWORD, UINT event, LPVOID data, UINT, UINT, UINT) {
    auto &self = *static_cast<SyntheticChannel *>(user);
    if (event == CHANNEL_EVENT_DATA_RECEIVED) { ++self.received;return; }
    if (event != CHANNEL_EVENT_WRITE_COMPLETE && event != CHANNEL_EVENT_WRITE_CANCELLED) return;
    auto &buffer = *static_cast<Buffer *>(static_cast<wStream *>(data));
    if (!buffer.active) { ++self.duplicate_releases;return; }
    if (std::any_of(buffer.bytes.begin(), buffer.bytes.end(), [](BYTE value) { return value != 0; })) ++self.not_wiped;
    buffer.active = false;std::vector<BYTE>().swap(buffer.bytes);++self.releases;
  }
  UINT send(std::size_t slot, std::size_t size, std::size_t capacity = 0) {
    auto &buffer = buffers.at(slot);REQUIRE_FALSE(buffer.active);
    if (!capacity) capacity = size;
    REQUIRE(capacity >= size);buffer.bytes.assign(capacity, 0xa5);buffer.active = true;
    static_cast<wStream &>(buffer) = Stream_Init();
    buffer.buffer = buffer.bytes.data();buffer.pointer = buffer.buffer + size;
    buffer.capacity = buffer.length = capacity;buffer.count = 1;
    const auto result = api.pVirtualChannelWriteEx(handle, channel, buffer.bytes.data(),
                                                    static_cast<ULONG>(size), static_cast<wStream *>(&buffer));
    if (result != CHANNEL_RC_OK) { buffer.active = false;std::vector<BYTE>().swap(buffer.bytes); }
    return result;
  }
};
thread_local SyntheticChannel *SyntheticChannel::selected = nullptr;
thread_local std::uint64_t channel_now = 1;
struct SyntheticFixture {
  Fixture fixture;
  rdpdr::StaticGate gate{*fixture.context, [] { return channel_now; }};
  SyntheticChannel plugin;
  ChannelHost host{*fixture.context};
  SyntheticFixture() {
    channel_now = 1;SyntheticChannel::selected = &plugin;
    REQUIRE(gate.install(&host.points, &host, SyntheticChannel::entry));host.connect();
  }
  ~SyntheticFixture() { host.finish();SyntheticChannel::selected = nullptr; }
};
std::uint32_t packet_u32(const std::vector<BYTE> &bytes, std::size_t at) {
  REQUIRE(at <= bytes.size());REQUIRE(bytes.size() - at >= 4);
  return std::uint32_t(bytes[at]) | std::uint32_t(bytes[at + 1]) << 8U |
         std::uint32_t(bytes[at + 2]) << 16U | std::uint32_t(bytes[at + 3]) << 24U;
}
} // namespace
TEST_CASE("Public RDPDR SVC gate refuses SDK queue growth by count and bytes and joins every borrowed buffer") {
  SyntheticFixture f;
  SECTION("count") {
    for (unsigned i = 0; i < 64; ++i) REQUIRE(f.plugin.send(i, 1) == CHANNEL_RC_OK);
    REQUIRE(f.plugin.send(64, 1) == ERROR_NOT_ENOUGH_MEMORY);
    REQUIRE(f.host.calls == 64);REQUIRE(f.gate.stats()->budget.pending == 64);
  }
  SECTION("bytes") {
    for (unsigned i = 0; i < 8; ++i) REQUIRE(f.plugin.send(i, rdpdr::maximum_packet_bytes) == CHANNEL_RC_OK);
    REQUIRE(f.plugin.send(8, 1) == ERROR_NOT_ENOUGH_MEMORY);
    REQUIRE(f.host.calls == 8);REQUIRE(f.gate.stats()->budget.bytes == rdpdr::maximum_pending_bytes);
  }
  SECTION("individual packet") {
    REQUIRE(f.plugin.send(0, rdpdr::maximum_packet_bytes + 1) == ERROR_NOT_ENOUGH_MEMORY);
    REQUIRE(f.host.calls == 0);REQUIRE(f.gate.stats()->budget.pending == 0);
  }
  SECTION("allocated capacity of short reused payloads") {
    for (unsigned i = 0; i < 8; ++i) REQUIRE(f.plugin.send(i, 1, rdpdr::maximum_packet_bytes) == CHANNEL_RC_OK);
    REQUIRE(f.plugin.send(8, 1) == ERROR_NOT_ENOUGH_MEMORY);
    REQUIRE(f.host.calls == 8);REQUIRE(f.gate.stats()->budget.bytes == rdpdr::maximum_pending_bytes);
  }
  f.host.drain(CHANNEL_EVENT_WRITE_CANCELLED);
  REQUIRE(f.gate.stats()->budget.pending == 0);REQUIRE(f.gate.stats()->budget.bytes == 0);
  REQUIRE(f.plugin.not_wiped == 0);REQUIRE(f.plugin.duplicate_releases == 0);
}
TEST_CASE("Public RDPDR SVC tickets reject old callbacks after upstream buffer reuse without refunding the new borrow") {
  SyntheticFixture f;
  REQUIRE(f.plugin.send(0, 4) == CHANNEL_RC_OK);
  const auto first = f.host.pending.back();f.host.drain();
  REQUIRE(f.plugin.send(0, 4) == CHANNEL_RC_OK);
  REQUIRE(f.host.pending.back().ticket != first.ticket);
  f.host.opened(f.host.user, 19, CHANNEL_EVENT_WRITE_COMPLETE, first.ticket, 4, 4, 0);
  REQUIRE(f.gate.stats()->failed);REQUIRE(f.gate.stats()->budget.pending == 1);
  REQUIRE(f.plugin.releases == 1);
  f.host.drain();REQUIRE(f.plugin.releases == 2);REQUIRE(f.plugin.duplicate_releases == 0);
}
TEST_CASE("Public RDPDR SVC definitive refusal, inline completion and uncertain exceptions preserve single ownership") {
  SyntheticFixture f;
  SECTION("definitive refusal") {
    f.host.write_result = ERROR_ACCESS_DENIED;
    REQUIRE(f.plugin.send(0, 4) == ERROR_ACCESS_DENIED);
    REQUIRE(f.gate.stats()->budget.pending == 0);REQUIRE(f.plugin.releases == 0);
  }
  SECTION("inline completion followed by host failure") {
    f.host.complete_then_error = true;
    REQUIRE(f.plugin.send(0, 4) == CHANNEL_RC_OK);
    REQUIRE(f.plugin.releases == 1);REQUIRE(f.gate.stats()->budget.pending == 0);
  }
  SECTION("unknown handoff retains debt until final joined cancellation") {
    f.host.throw_after_handoff = true;
    REQUIRE(f.plugin.send(0, 4) == CHANNEL_RC_OK);
    REQUIRE(f.gate.stats()->budget.pending == 1);
    REQUIRE(f.gate.retire() == ERROR_IO_PENDING);
    f.host.finish(false);
    REQUIRE(f.gate.stats()->budget.pending == 0);REQUIRE(f.plugin.releases == 1);
    REQUIRE(f.plugin.terminations == 1);
  }
  REQUIRE(f.plugin.duplicate_releases == 0);REQUIRE(f.plugin.not_wiped == 0);
}
TEST_CASE("Public RDPDR SVC bounds ingress before SDK allocation and keeps the oldest send deadline") {
  SyntheticFixture f;
  SECTION("oversized ingress never delegates") {
    f.host.send({1, 2, 3, 4}, static_cast<UINT>(rdpdr::maximum_request_bytes + 25), CHANNEL_FLAG_FIRST);
    REQUIRE(f.plugin.received == 0);REQUIRE(f.gate.stats()->failed);
  }
  SECTION("partial input deadline survives unrelated progress") {
    f.host.send({1, 2}, 4, CHANNEL_FLAG_FIRST);
    channel_now = 10000;REQUIRE(f.gate.poll());
    channel_now = 10001;REQUIRE_FALSE(f.gate.poll());
    f.host.send({3, 4}, 4, CHANNEL_FLAG_LAST);REQUIRE(f.plugin.received == 1);
  }
  SECTION("outbound absolute deadline retains credit") {
    REQUIRE(f.plugin.send(0, 4) == CHANNEL_RC_OK);
    channel_now = 10001;REQUIRE_FALSE(f.gate.poll());
    REQUIRE(f.gate.stats()->budget.pending == 1);
    f.host.drain();REQUIRE(f.gate.stats()->budget.pending == 0);REQUIRE(f.plugin.releases == 1);
  }
  SECTION("bounded SDK dispatch batch before an idle pool trim") {
    for (unsigned i = 0; i < 64; ++i) f.host.send({1, 2, 3, 4});
    REQUIRE(f.plugin.received == 64);
    f.host.send({1, 2, 3, 4});REQUIRE(f.plugin.received == 64);REQUIRE(f.gate.stats()->failed);
  }
}
TEST_CASE("RDPDR polling and callbacks share one clock domain and clock failure refuses safely") {
  SECTION("an injected arbitrary epoch covers poll, send and completion") {
    SyntheticFixture f;
    channel_now = 900000000000ULL;
    REQUIRE(f.gate.poll());
    REQUIRE(f.plugin.send(0, 16) == CHANNEL_RC_OK);
    ++channel_now;
    REQUIRE(f.gate.poll());
    f.host.drain();
    REQUIRE(f.gate.poll());
    REQUIRE_FALSE(f.gate.stats()->failed);
    REQUIRE(f.gate.stats()->budget.pending == 0);
    REQUIRE(f.plugin.releases == 1);
  }
  SECTION("throwing clock is a terminal refusal, not noexcept termination") {
    Fixture f;
    rdpdr::StaticGate gate(*f.context, []() -> std::uint64_t {
      throw std::runtime_error("Synthetic unavailable monotonic clock");
    });
    REQUIRE_FALSE(gate.poll());
    REQUIRE(gate.stats()->failed);
    REQUIRE(getChannelError(f.context.get()) == ERROR_INVALID_DATA);
  }
}
TEST_CASE("Public RDPDR SVC metadata mismatch retains credit and final host join cancels it once") {
  SyntheticFixture f;REQUIRE(f.plugin.send(0, 4) == CHANNEL_RC_OK);
  const auto item = f.host.pending.back();
  SECTION("wrong length") { f.host.opened(f.host.user, 19, CHANNEL_EVENT_WRITE_COMPLETE, item.ticket, 3, 4, 0); }
  SECTION("wrong channel") { f.host.opened(f.host.user, 20, CHANNEL_EVENT_WRITE_COMPLETE, item.ticket, 4, 4, 0); }
  SECTION("unexpected flags") { f.host.opened(f.host.user, 19, CHANNEL_EVENT_WRITE_COMPLETE, item.ticket, 4, 4, 1); }
  REQUIRE(f.gate.stats()->failed);REQUIRE(f.gate.stats()->budget.pending == 1);
  f.host.finish(false);REQUIRE(f.gate.stats()->terminated);
  REQUIRE(f.plugin.releases == 1);REQUIRE(f.plugin.not_wiped == 0);
}
TEST_CASE("Public RDPDR SVC retirement joins pending writes and retries a refused close without repeating SDK disconnect") {
  SyntheticFixture f;REQUIRE(f.plugin.send(0, 4) == CHANNEL_RC_OK);
  f.host.close_failures = 2;
  REQUIRE(f.gate.retire() == ERROR_IO_PENDING);REQUIRE(f.host.closes == 1);
  REQUIRE(f.gate.stats()->budget.pending == 1);
  REQUIRE(f.plugin.send(1, 4) == ERROR_INVALID_STATE);
  f.host.drain();REQUIRE(f.gate.retire() == ERROR_ACCESS_DENIED);REQUIRE(f.host.closes == 2);
  REQUIRE(f.gate.retire() == CHANNEL_RC_OK);REQUIRE(f.host.closes == 3);
  REQUIRE(f.gate.stats()->retired);REQUIRE(f.plugin.terminations == 0);
  // Wrapper, upstream plugin and callback storage remain alive until host join.
  f.host.finish();REQUIRE(f.plugin.terminations == 1);REQUIRE(f.plugin.releases == 1);
}
TEST_CASE("Public RDPDR SVC refuses reentrant retirement and foreign writes then permits joined final termination") {
  SyntheticFixture f;f.host.nested_retire = &f.gate;f.host.inline_completion = true;
  REQUIRE(f.plugin.send(0, 4) == CHANNEL_RC_OK);
  REQUIRE(f.host.nested_retire_result == ERROR_INVALID_STATE);
  REQUIRE_FALSE(f.gate.stats()->retired);REQUIRE_FALSE(f.gate.stats()->failed);
  std::array<BYTE, 4> bytes{};
  REQUIRE(std::async(std::launch::async, [&] {
    return f.plugin.api.pVirtualChannelWriteEx(f.plugin.handle, f.plugin.channel, bytes.data(), 4, bytes.data());
  }).get() == ERROR_INVALID_STATE);
  REQUIRE(f.host.calls == 1);REQUIRE(f.gate.retire() == CHANNEL_RC_OK);
  std::async(std::launch::async, [&] {
    f.host.init(f.host.user, &f.host, CHANNEL_EVENT_TERMINATED, nullptr, 0);f.host.terminated = true;
  }).get();
  REQUIRE(f.gate.stats()->terminated);REQUIRE(f.plugin.terminations == 1);
}
TEST_CASE("Public RDPDR SVC refuses asynchronous, reconnecting or mixed device profiles before SDK registration") {
  Fixture f;rdpdr::StaticGate gate(*f.context);SyntheticChannel plugin;ChannelHost host(*f.context);
  struct Selection {
    explicit Selection(SyntheticChannel &value) { SyntheticChannel::selected = &value; }
    ~Selection() { SyntheticChannel::selected = nullptr; }
  } selection(plugin);
  SECTION("asynchronous channels") { REQUIRE(freerdp_settings_set_bool(f.context->settings, FreeRDP_AsyncChannels, TRUE)); }
  SECTION("automatic reconnect") { REQUIRE(freerdp_settings_set_bool(f.context->settings, FreeRDP_AutoReconnectionEnabled, TRUE)); }
  SECTION("non-drive service") {
    const char *args[]{"SCARD"};auto *device = freerdp_device_new(RDPDR_DTYP_SMARTCARD, 1, args);REQUIRE(device);
    REQUIRE(freerdp_device_collection_add(f.context->settings, device));
  }
  SECTION("dynamic drive") {
    const char *args[]{"FILES", "*"};auto *device = freerdp_device_new(RDPDR_DTYP_FILESYSTEM, 2, args);REQUIRE(device);
    REQUIRE(freerdp_device_collection_add(f.context->settings, device));
  }
  REQUIRE_FALSE(gate.install(&host.points, &host, SyntheticChannel::entry));
  REQUIRE_FALSE(host.user);REQUIRE(host.calls == 0);
}
TEST_CASE("Public RDPDR SVC preserves an uncertain Init handoff until the host's final acknowledgement") {
  Fixture f;rdpdr::StaticGate gate(*f.context);SyntheticChannel plugin;ChannelHost host(*f.context);
  struct Selection {
    explicit Selection(SyntheticChannel &value) { SyntheticChannel::selected = &value; }
    ~Selection() { SyntheticChannel::selected = nullptr; }
  } selection(plugin);
  SECTION("definitive refusal does not transfer callback ownership") {
    host.init_result = ERROR_ACCESS_DENIED;
    REQUIRE_FALSE(gate.install(&host.points, &host, SyntheticChannel::entry));REQUIRE_FALSE(host.user);
  }
  SECTION("throw after handoff retains the plugin") {
    host.throw_after_init = true;
    REQUIRE_FALSE(gate.install(&host.points, &host, SyntheticChannel::entry));REQUIRE(host.user);
    REQUIRE(gate.stats()->failed);host.finish();REQUIRE(gate.stats()->terminated);
    REQUIRE(plugin.terminations == 1);
  }
}
TEST_CASE("Actual pinned RDPDR SVC and managed DEVICE perform bounded file IRPs through the public loader") {
  const std::string longest_name(64, 'r');
  Fixture f({"FILES", longest_name});
  for (const auto &name : std::vector<std::string>{"FILES", longest_name}) {
    const char *args[]{name.c_str(), "/bridge-fixture-path-must-never-be-opened"};
    auto *device = freerdp_device_new(RDPDR_DTYP_FILESYSTEM, 2, args);REQUIRE(device);
    if (!freerdp_device_collection_add(f.context->settings, device)) {
      freerdp_device_free(device);FAIL("Cannot add owned drive descriptor");
    }
  }
  rdpdr::StaticGate gate(*f.context);
  rdpdr::Provider provider;ChannelHost host(*f.context);
  REQUIRE(provider.bind(*f.context, *f.registration, &gate) == CHANNEL_RC_OK);
  const auto entry = freerdp_load_channel_addin_entry("rdpdr", nullptr, nullptr,
      FREERDP_ADDIN_CHANNEL_STATIC | FREERDP_ADDIN_CHANNEL_ENTRYEX);
  host.load(::bridge::compat::bit_cast<PVIRTUALCHANNELENTRYEX>(entry));host.connect();
  REQUIRE_FALSE(f.registration->released());
  std::vector<BYTE> announce;put(announce, RDPDR_CTYP_CORE, 2);put(announce, PAKID_CORE_SERVER_ANNOUNCE, 2);
  put(announce, 1, 2);put(announce, 12, 2);put(announce, 42, 4);host.send(announce);host.drain();
  REQUIRE(getChannelError(f.context.get()) == CHANNEL_RC_OK);
  std::vector<BYTE> caps;put(caps, RDPDR_CTYP_CORE, 2);put(caps, PAKID_CORE_SERVER_CAPABILITY, 2);
  put(caps, 2, 2);put(caps, 0, 2);put(caps, CAP_GENERAL_TYPE, 2);put(caps, 44, 2);put(caps, 2, 4);
  put(caps, 0, 4);put(caps, 0, 4);put(caps, 1, 2);put(caps, 12, 2);
  put(caps, 0xffff, 4);put(caps, 0, 4);put(caps, 7, 4);put(caps, 1, 4);put(caps, 0, 4);put(caps, 0, 4);
  put(caps, CAP_DRIVE_TYPE, 2);put(caps, 8, 2);put(caps, 2, 4);host.send(caps);host.drain();
  const auto found_caps = std::find_if(host.packets.begin(), host.packets.end(), [](const auto &packet) {
    return packet.size() >= 52 && packet[2] == 0x50 && packet[3] == 0x43;
  });
  REQUIRE(found_caps != host.packets.end());
  REQUIRE(packet_u32(*found_caps, 28) == rdpdr::managed_io_mask);
  REQUIRE(packet_u32(*found_caps, 32) == 0);REQUIRE(packet_u32(*found_caps, 40) == 0);
  announce[2] = static_cast<BYTE>(PAKID_CORE_CLIENTID_CONFIRM & 255);
  announce[3] = static_cast<BYTE>(PAKID_CORE_CLIENTID_CONFIRM >> 8);host.send(announce);host.drain();
  REQUIRE(getChannelError(f.context.get()) == CHANNEL_RC_OK);
  std::vector<BYTE> logged_on;
  put(logged_on, RDPDR_CTYP_CORE, 2);put(logged_on, PAKID_CORE_USER_LOGGEDON, 2);
  host.send(logged_on);host.drain();
  REQUIRE(getChannelError(f.context.get()) == CHANNEL_RC_OK);
  const auto announcement = std::find_if(host.packets.rbegin(), host.packets.rend(), [](const auto &packet) {
    return packet.size() >= 8 && packet[2] == 0x41 && packet[3] == 0x44;
  });
  REQUIRE(announcement != host.packets.rend());
  REQUIRE(packet_u32(*announcement, 4) == 2);
  std::size_t at = 8;
  std::vector<std::string> announced_names;
  for (unsigned n = 0; n < 2; ++n) {
    REQUIRE(announcement->size() - at >= 20);
    REQUIRE(packet_u32(*announcement, at) == RDPDR_DTYP_FILESYSTEM);
    REQUIRE((*announcement)[at + 15] == 0);
    const auto length = packet_u32(*announcement, at + 16);
    REQUIRE(length >= 2);REQUIRE(length <= maximum_drive_name + 1);
    at += 20;REQUIRE(length <= announcement->size() - at);
    std::string name;
    for (std::size_t i = 0; i + 1 < length; ++i) {
      REQUIRE((*announcement)[at + i] > 0);
      name.push_back(static_cast<char>((*announcement)[at + i]));
    }
    REQUIRE((*announcement)[at + length - 1] == 0);
    announced_names.push_back(std::move(name));at += length;
  }
  REQUIRE(at == announcement->size());
  std::sort(announced_names.begin(), announced_names.end());
  REQUIRE(announced_names == std::vector<std::string>{"FILES", longest_name});
  const auto *device = freerdp_device_collection_find(f.context->settings, "FILES");REQUIRE(device);
  REQUIRE(device->Id != 0);
  auto request = [&](UINT major, UINT key, UINT correlation, const std::vector<BYTE> &body) {
    std::vector<BYTE> packet;put(packet, RDPDR_CTYP_CORE, 2);put(packet, PAKID_CORE_DEVICE_IOREQUEST, 2);
    put(packet, device->Id, 4);put(packet, key, 4);put(packet, correlation, 4);put(packet, major, 4);put(packet, 0, 4);
    packet.insert(packet.end(), body.begin(), body.end());
    const auto before = host.packets.size();host.send(packet);
    REQUIRE(host.packets.size() == before + 1);
    const auto reply = host.packets.back();REQUIRE(packet_u32(reply, 8) == correlation);
    REQUIRE(packet_u32(reply, 12) == static_cast<UINT32>(STATUS_SUCCESS));host.drain();return reply;
  };
  const auto opened = request(IRP_MJ_CREATE, 0, 100, create());
  const auto key = packet_u32(opened, 16);REQUIRE(key != 0);
  std::vector<BYTE> write;put(write, 4, 4);put(write, 0, 8);write.resize(32, 0);
  write.insert(write.end(), {0, 255, 17, 128});
  REQUIRE(packet_u32(request(IRP_MJ_WRITE, key, 101, write), 16) == 4);
  write.resize(32);const auto read = request(IRP_MJ_READ, key, 102, write);
  REQUIRE(read.size() == 24);REQUIRE(std::vector<BYTE>(read.begin() + 20, read.end()) == std::vector<BYTE>{0, 255, 17, 128});
  const auto trims = gate.stats()->pool_trims;
  for (UINT i = 0; i < 10; ++i) {
    const auto size = 65536U + i;
    std::vector<BYTE> payload;put(payload, size, 4);put(payload, 0, 8);payload.resize(32, 0);
    payload.resize(32 + size, 0x5a);
    REQUIRE(packet_u32(request(IRP_MJ_WRITE, key, 110 + i, payload), 16) == size);
    REQUIRE(gate.stats()->dispatches_since_idle == 0);
  }
  REQUIRE(gate.stats()->pool_trims > trims);
  std::vector<BYTE> basic;
  for (const auto value : {132000000000000001ULL, 132000000000000002ULL,
                           132000000000000003ULL, 132000000000000004ULL}) put(basic, value, 8);
  put(basic, file_hidden | file_archive, 4);
  std::vector<BYTE> update;put(update, FileBasicInformation, 4);put(update, basic.size(), 4);update.resize(32, 0);
  update.insert(update.end(), basic.begin(), basic.end());(void)request(IRP_MJ_SET_INFORMATION, key, 130, update);
  std::vector<BYTE> query;put(query, FileBasicInformation, 4);query.resize(32, 0);
  const auto metadata = request(IRP_MJ_QUERY_INFORMATION, key, 131, query);
  REQUIRE(metadata.size() == 56);REQUIRE(std::equal(basic.begin(), basic.end(), metadata.begin() + 20));
  (void)request(IRP_MJ_CLOSE, key, 103, std::vector<BYTE>(32));
  REQUIRE(gate.stats()->budget.pending == 0);REQUIRE_FALSE(gate.stats()->failed);
  REQUIRE(provider.close() == CHANNEL_RC_OK); // Loader detach does not invalidate SDK callbacks.
  REQUIRE_FALSE(::bridge::compat::bit_cast<PVIRTUALCHANNELENTRYEX>(entry)(nullptr, nullptr));
  host.finish();REQUIRE(gate.stats()->terminated);REQUIRE(f.registration->released());
}
