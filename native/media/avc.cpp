#include "../compat/span.hpp"
#include "avc.hpp"
#include <algorithm>

namespace bridge::media {
using ipc::ProtocolError;
AvcPacketizer::AvcPacketizer() { unit_.reserve(max_access_unit_bytes); }
void AvcPacketizer::begin() {
  unit_.clear();
  vcl_ = keyframe_ = false;
}
void AvcPacketizer::append(::bridge::compat::span<const std::uint8_t> bytes) {
  const std::array<std::uint8_t, 4> prefix4{0, 0, 0, 1};
  const std::array<std::uint8_t, 3> prefix3{0, 0, 1};
  std::size_t prefix = 0;
  if (bytes.size() > 4 && std::equal(prefix4.begin(), prefix4.end(), bytes.begin()))
    prefix = 4;
  else if (bytes.size() > 3 && std::equal(prefix3.begin(), prefix3.end(), bytes.begin()))
    prefix = 3;
  if (!prefix)
    throw ProtocolError();
  const auto nal = bytes.subspan(prefix);
  if (nal.size() < 2 || (nal[0] & 0x80) != 0)
    throw ProtocolError();
  if (std::search(nal.begin(), nal.end(), prefix3.begin(), prefix3.end()) != nal.end())
    throw ProtocolError(); // One provider NAL per append; no embedded start codes.
  const auto type = nal[0] & 0x1f;
  if (type == 7 || type == 8) {
    if (nal.size() > 1024 || (type == 7 && nal.size() < 4))
      throw ProtocolError();
    auto &parameters = type == 7 ? sps_ : pps_;
    parameters.assign(nal.begin(), nal.end());
    return;
  }
  if (type != 1 && type != 5 && type != 6 && type != 9)
    throw ProtocolError(); // No mixed Annex-B/SVC output in this AVC contract.
  if (nal.size() > max_access_unit_bytes - 4 ||
      unit_.size() > max_access_unit_bytes - 4 - nal.size())
    throw ProtocolError();
  ipc::append_be(unit_, nal.size(), 4);
  unit_.insert(unit_.end(), nal.begin(), nal.end());
  vcl_ = vcl_ || type == 1 || type == 5;
  keyframe_ = keyframe_ || type == 5;
}
AvcUnit AvcPacketizer::finish() {
  if (!vcl_ || sps_.size() < 4 || pps_.size() < 2)
    throw ProtocolError();
  config_ = {1, sps_[1], sps_[2], sps_[3], 0xff, 0xe1};
  ipc::append_be(config_, sps_.size(), 2);
  config_.insert(config_.end(), sps_.begin(), sps_.end());
  config_.push_back(1);
  ipc::append_be(config_, pps_.size(), 2);
  config_.insert(config_.end(), pps_.begin(), pps_.end());
  return {config_, unit_, keyframe_};
}
} // namespace bridge::media
