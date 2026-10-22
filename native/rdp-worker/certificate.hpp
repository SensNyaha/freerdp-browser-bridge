#pragma once
#include "../compat/span.hpp"
#include <array>
#include <cstddef>
#include <cstdint>
#include <string>
namespace bridge {
struct CertificateCheck {
  std::array<std::uint8_t, 32> fingerprint{};
  std::uint16_t flags = 0; // bit 0 untrusted chain, bit 1 hostname mismatch
};
CertificateCheck check_certificate(::bridge::compat::span<const std::uint8_t> pem, const std::string &host);
} // namespace bridge
