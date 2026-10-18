#include <libusb.h>

#include <algorithm>
#include <array>
#include <cstdint>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <vector>

extern "C" int DescriptorInput(const std::uint8_t *, std::size_t);
extern "C" int BosInput(const std::uint8_t *, std::size_t);

namespace {
std::size_t checks = 0, inputs = 0;
void check(bool condition) {
  ++checks;
  if (!condition)
    throw std::runtime_error("USB descriptor regression failed");
}
using Capability = std::unique_ptr<libusb_bos_dev_capability_descriptor, decltype(&std::free)>;
Capability capability(std::uint8_t type, std::size_t payload) {
  check(payload <= 252);
  Capability result(static_cast<libusb_bos_dev_capability_descriptor *>(
                        std::calloc(1, sizeof(libusb_bos_dev_capability_descriptor) + payload)),
                    std::free);
  check(result != nullptr);
  result->bLength = static_cast<std::uint8_t>(3 + payload);
  result->bDescriptorType = LIBUSB_DT_DEVICE_CAPABILITY;
  result->bDevCapabilityType = type;
  return result;
}
void values() {
  auto ext = capability(LIBUSB_BT_USB_2_0_EXTENSION, 4);
  std::copy_n(std::array<std::uint8_t, 4>{0x12, 0x34, 0x56, 0x78}.begin(), 4,
              ext->dev_capability_data);
  libusb_usb_2_0_extension_descriptor *e = nullptr;
  check(libusb_get_usb_2_0_extension_descriptor(nullptr, ext.get(), &e) == 0);
  std::unique_ptr<libusb_usb_2_0_extension_descriptor,
                  decltype(&libusb_free_usb_2_0_extension_descriptor)>
      extension(e, libusb_free_usb_2_0_extension_descriptor);
  check(extension && extension->bmAttributes == 0x78563412);
  for (std::uint8_t length = 0; length < LIBUSB_BT_USB_2_0_EXTENSION_SIZE; ++length) {
    ext->bLength = length;
    e = nullptr;
    check(libusb_get_usb_2_0_extension_descriptor(nullptr, ext.get(), &e) == LIBUSB_ERROR_IO);
    check(e == nullptr);
  }
  ext->bLength = LIBUSB_BT_USB_2_0_EXTENSION_SIZE;
  ext->bDevCapabilityType = LIBUSB_BT_CONTAINER_ID;
  check(libusb_get_usb_2_0_extension_descriptor(nullptr, ext.get(), &e) ==
        LIBUSB_ERROR_INVALID_PARAM);
  check(e == nullptr);

  auto ss = capability(LIBUSB_BT_SS_USB_DEVICE_CAPABILITY, 7);
  const std::array<std::uint8_t, 7> fields{0x42, 0x34, 0x12, 3, 4, 0x78, 0x56};
  std::copy(fields.begin(), fields.end(), ss->dev_capability_data);
  libusb_ss_usb_device_capability_descriptor *s = nullptr;
  check(libusb_get_ss_usb_device_capability_descriptor(nullptr, ss.get(), &s) == 0);
  std::unique_ptr<libusb_ss_usb_device_capability_descriptor,
                  decltype(&libusb_free_ss_usb_device_capability_descriptor)>
      superspeed(s, libusb_free_ss_usb_device_capability_descriptor);
  check(superspeed && superspeed->bmAttributes == 0x42 && superspeed->wSpeedSupported == 0x1234 &&
        superspeed->bFunctionalitySupport == 3 && superspeed->bU1DevExitLat == 4 &&
        superspeed->bU2DevExitLat == 0x5678);
  for (std::uint8_t length = 0; length < LIBUSB_BT_SS_USB_DEVICE_CAPABILITY_SIZE; ++length) {
    ss->bLength = length;
    s = nullptr;
    check(libusb_get_ss_usb_device_capability_descriptor(nullptr, ss.get(), &s) == LIBUSB_ERROR_IO);
    check(s == nullptr);
  }

  auto cid = capability(LIBUSB_BT_CONTAINER_ID, 17);
  for (std::size_t i = 0; i < 17; ++i)
    cid->dev_capability_data[i] = static_cast<std::uint8_t>(i);
  libusb_container_id_descriptor *c = nullptr;
  check(libusb_get_container_id_descriptor(nullptr, cid.get(), &c) == 0);
  std::unique_ptr<libusb_container_id_descriptor, decltype(&libusb_free_container_id_descriptor)>
      container(c, libusb_free_container_id_descriptor);
  check(container != nullptr);
  for (std::size_t i = 0; i < 16; ++i)
    check(container->ContainerID[i] == i + 1);
  for (std::uint8_t length = 0; length < LIBUSB_BT_CONTAINER_ID_SIZE; ++length) {
    cid->bLength = length;
    c = nullptr;
    check(libusb_get_container_id_descriptor(nullptr, cid.get(), &c) == LIBUSB_ERROR_IO);
    check(c == nullptr);
  }
  libusb_free_usb_2_0_extension_descriptor(nullptr);
  libusb_free_ss_usb_device_capability_descriptor(nullptr);
  libusb_free_container_id_descriptor(nullptr);
}
void input(const std::vector<std::uint8_t> &bytes) {
  // Even zero-byte inputs get a non-null address for the upstream BOS harness.
  const std::uint8_t empty = 0;
  const auto *data = bytes.empty() ? &empty : bytes.data();
  check(DescriptorInput(data, bytes.size()) == 0);
  check(BosInput(data, bytes.size()) == 0);
  ++inputs;
}
void corpus(const std::filesystem::path &root) {
  // Fixed local corpus only; no recursive traversal or arbitrary file discovery.
  for (const auto *name : {"bos/min.bos", "descriptor_parsers/min_valid_config.bin",
                           "descriptor_parsers/regression_bug_a_endpoint_null.bin",
                           "descriptor_parsers/regression_bug_b_iad_oob.bin"}) {
    const auto path = root / name;
    check(!std::filesystem::is_symlink(path) && std::filesystem::is_regular_file(path));
    const auto size = std::filesystem::file_size(path);
    check(size > 0 && size <= 8192);
    std::vector<std::uint8_t> bytes(static_cast<std::size_t>(size));
    std::ifstream file(path, std::ios::binary);
    check(file.read(reinterpret_cast<char *>(bytes.data()), static_cast<std::streamsize>(size))
              .good());
    check(file.peek() == std::char_traits<char>::eof());
    input(bytes);
    for (std::size_t length = 0; length <= bytes.size(); ++length)
      input(std::vector<std::uint8_t>(bytes.begin(),
                                      bytes.begin() + static_cast<std::ptrdiff_t>(length)));
    for (std::size_t i = 0; i < bytes.size(); ++i) {
      auto changed = bytes;
      changed[i] ^= 0xff;
      input(changed);
    }
  }
  for (const std::size_t length : {0, 1, 8, 9, 10, 252, 253, 255, 256, 8191, 8192, 8193})
    for (const std::uint8_t fill : {0, 255})
      input(std::vector<std::uint8_t>(length, fill));
}
} // namespace

int main(int argc, char **argv) {
  try {
    check(argc == 1 || argc == 2);
    if (argc == 1)
      values();
    else
      corpus(argv[1]);
    std::cout << "USB descriptor checks=" << checks << " inputs=" << inputs << '\n';
    return 0;
  } catch (const std::exception &error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
