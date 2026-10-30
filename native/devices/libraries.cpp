#include "inventory.hpp"
#include <array>
#include <cstdio>
#include <cstring>
#ifdef BRIDGE_INVENTORY_USB
#include <libusb-1.0/libusb.h>
#endif
#if defined(__linux__) && defined(BRIDGE_INVENTORY_PCSC)
#include <winpr/smartcard.h>
#endif
#if defined(__linux__) && defined(BRIDGE_INVENTORY_CUPS)
#include <cups/cups.h>
#include <sys/stat.h>
#endif

namespace bridge::devices {
namespace {
using Bytes = ::bridge::compat::span<const std::uint8_t>;
#if defined(BRIDGE_INVENTORY_USB) || defined(BRIDGE_INVENTORY_PCSC) || defined(BRIDGE_INVENTORY_CUPS)
Bytes bytes(const char *value, std::size_t length) {
  return {reinterpret_cast<const std::uint8_t *>(value), length};
}
#endif
}
wire::Status discover_usb(Snapshot &snapshot) {
#ifdef BRIDGE_INVENTORY_USB
  libusb_context *context = nullptr;
  libusb_init_option option{};
  option.option = LIBUSB_OPTION_LOG_LEVEL;
  option.value.ival = LIBUSB_LOG_LEVEL_NONE;
  const auto initialized = libusb_init_context(&context, &option, 1);
  if (initialized != LIBUSB_SUCCESS)
    return initialized == LIBUSB_ERROR_ACCESS ? wire::Status::denied : wire::Status::unavailable;
  struct Exit { libusb_context *value; ~Exit() { libusb_exit(value); } } exit{context};
  libusb_device **list = nullptr;
  const auto count = libusb_get_device_list(context, &list);
  if (count < 0) return count == LIBUSB_ERROR_ACCESS ? wire::Status::denied : wire::Status::failure;
  struct Free { libusb_device **value; ~Free() { libusb_free_device_list(value, 1); } } free{list};
  if (count > 4096) return wire::Status::limit;
  if (count && !list) return wire::Status::failure;
  for (std::size_t i = 0; i < static_cast<std::size_t>(count); ++i) {
    if (!list[i]) return wire::Status::failure;
    libusb_device_descriptor descriptor{};
    const auto status = libusb_get_device_descriptor(list[i], &descriptor);
    if (status == LIBUSB_ERROR_NO_DEVICE) continue;
    if (status != LIBUSB_SUCCESS) return status == LIBUSB_ERROR_ACCESS ? wire::Status::denied : wire::Status::failure;
    const auto bus = libusb_get_bus_number(list[i]), address = libusb_get_device_address(list[i]);
    std::array<char,32> id{}, name{};
    const auto id_length = std::snprintf(id.data(),id.size(),"usb:%u:%u",static_cast<unsigned>(bus),static_cast<unsigned>(address));
    const auto name_length = std::snprintf(name.data(),name.size(),"USB %04x:%04x",static_cast<unsigned>(descriptor.idVendor),static_cast<unsigned>(descriptor.idProduct));
    if (id_length <= 0 || static_cast<std::size_t>(id_length) >= id.size() || name_length <= 0 ||
        static_cast<std::size_t>(name_length) >= name.size()) return wire::Status::failure;
    // Cached device descriptors only: no open, serial/string queries, claim, detach or transfers.
    if (!snapshot.append({bytes(id.data(),static_cast<std::size_t>(id_length)),bytes(name.data(),static_cast<std::size_t>(name_length)),
                          descriptor.idVendor,descriptor.idProduct,bus,address})) break;
  }
  return wire::Status::available;
#else
  (void)snapshot;
  return wire::Status::unsupported;
#endif
}
wire::Status discover_pcsc(Snapshot &snapshot) {
#if defined(__linux__) && defined(BRIDGE_INVENTORY_PCSC)
  SCARDCONTEXT context = 0;
  const auto established = SCardEstablishContext(SCARD_SCOPE_SYSTEM,nullptr,nullptr,&context);
  if (established != SCARD_S_SUCCESS)
    return established == SCARD_E_NO_SERVICE || established == SCARD_E_SERVICE_STOPPED
        ? wire::Status::unavailable : wire::Status::failure;
  struct Release { SCARDCONTEXT value; ~Release() { (void)SCardReleaseContext(value); } } release{context};
  DWORD length = 0;
  auto status = SCardListReadersA(context,nullptr,nullptr,&length);
  if (status == SCARD_E_NO_READERS_AVAILABLE) return wire::Status::available;
  if (status != SCARD_S_SUCCESS) return wire::Status::failure;
  if (length < 2 || length > 16384) return wire::Status::limit;
  const auto names = std::make_unique<std::array<char,16384>>();
  status = SCardListReadersA(context,nullptr,names->data(),&length);
  if (status == SCARD_E_INSUFFICIENT_BUFFER) return wire::Status::limit;
  if (status == SCARD_E_NO_READERS_AVAILABLE) return wire::Status::available;
  if (status != SCARD_S_SUCCESS || length > names->size()) return wire::Status::failure;
  std::size_t offset = 0;
  while (offset < length && (*names)[offset]) {
    auto end = offset;
    while (end < length && (*names)[end]) ++end;
    if (end == length) return wire::Status::failure;
    const auto value = bytes(names->data()+offset,end-offset);
    if (!snapshot.append({value,value})) break;
    offset = end + 1;
  }
  return wire::Status::available;
#else
  (void)snapshot;
  return wire::Status::unsupported;
#endif
}
#if defined(__linux__) && defined(BRIDGE_INVENTORY_CUPS)
namespace {
struct CupsState { Snapshot &snapshot; bool stopped=false, failed=false; };
const char *no_password(const char *, http_t *, const char *, const char *, void *) { return nullptr; }
int destination(void *user, unsigned flags, cups_dest_t *value) noexcept {
  auto &state=*static_cast<CupsState *>(user);
  if (flags & CUPS_DEST_FLAGS_REMOVED) return 1;
  if ((flags & CUPS_DEST_FLAGS_ERROR) || !value || !value->name) { state.failed=true;return 0; }
  if (value->instance) return 1; // Named queues only; no per-user saved option instances.
  std::size_t length=0;
  while (length <= wire::maximum_text_bytes && value->name[length]) ++length;
  if (!length || length > wire::maximum_text_bytes) { state.failed=true;return 0; }
  try {
    const auto name=bytes(value->name,length);
    state.stopped=!state.snapshot.append({name,name});
    return state.stopped ? 0 : 1;
  } catch (...) { state.failed=true;return 0; }
}
}
#endif
wire::Status discover_cups(Snapshot &snapshot) {
#if defined(__linux__) && defined(BRIDGE_INVENTORY_CUPS)
  struct stat socket{};
  if (::stat("/run/cups/cups.sock",&socket)!=0 || !S_ISSOCK(socket.st_mode)) return wire::Status::unavailable;
  // Isolated process only. Ignore caller/environment server selection and never prompt for credentials.
  cupsSetServer("/run/cups/cups.sock");
  cupsSetPasswordCB2(no_password,nullptr);
  CupsState state{snapshot};
  int cancel=0;
  const auto result=cupsEnumDests(CUPS_DEST_FLAGS_NONE,1000,&cancel,CUPS_PRINTER_LOCAL,
      CUPS_PRINTER_DISCOVERED | CUPS_PRINTER_REMOTE,destination,&state);
  if (state.failed) return wire::Status::failure;
  if (state.stopped) return wire::Status::available; // Collector retains explicit limit/failure.
  if (!result) return cupsLastError()==IPP_STATUS_ERROR_NOT_AUTHORIZED || cupsLastError()==IPP_STATUS_ERROR_FORBIDDEN
      ? wire::Status::denied : wire::Status::unavailable;
  return wire::Status::available;
#else
  (void)snapshot;
  return wire::Status::unsupported;
#endif
}
} // namespace bridge::devices
