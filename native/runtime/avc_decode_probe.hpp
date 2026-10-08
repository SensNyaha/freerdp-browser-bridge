#pragma once
// Diagnostic decoder used only by native tests and the relocated runtime probe.
#include "avc.hpp"
#include <array>
#include <memory>
#include <wels/codec_api.h>

namespace bridge::diagnostics {
struct DecodedSample {
  int width, height;
  std::array<std::uint8_t, 3> yuv;
};
class AvcDecodeProbe {
  std::unique_ptr<ISVCDecoder, decltype(&WelsDestroyDecoder)> decoder_{nullptr, WelsDestroyDecoder};

public:
  AvcDecodeProbe() {
    ISVCDecoder *created = nullptr;
    if (WelsCreateDecoder(&created) != 0 || !created)
      throw ipc::ProtocolError();
    decoder_.reset(created);
    int quiet = WELS_LOG_QUIET;
    if (decoder_->SetOption(DECODER_OPTION_TRACE_LEVEL, &quiet) != 0)
      throw ipc::ProtocolError();
    SDecodingParam parameters{};
    parameters.eEcActiveIdc = ERROR_CON_DISABLE;
    parameters.sVideoProperty.size = sizeof(SVideoProperty);
    parameters.sVideoProperty.eVideoBsType = VIDEO_BITSTREAM_AVC;
    if (decoder_->Initialize(&parameters) != 0)
      throw ipc::ProtocolError();
  }
  DecodedSample decode(const media::AvcUnit &unit) {
    const auto config = unit.config;
    if (config.size() < 11 || config.size() > 2059 || config[0] != 1 || config[4] != 0xff ||
        config[5] != 0xe1 || unit.bytes.empty() || unit.bytes.size() > media::max_access_unit_bytes)
      throw ipc::ProtocolError();
    std::vector<std::uint8_t> annex;
    const auto add = [&](std::span<const std::uint8_t> nal) {
      annex.insert(annex.end(), {0, 0, 0, 1});
      annex.insert(annex.end(), nal.begin(), nal.end());
    };
    const auto sps = static_cast<std::size_t>(ipc::read_be(config.subspan(6, 2)));
    if (sps < 4 || sps > config.size() - 11 || config[8 + sps] != 1)
      throw ipc::ProtocolError();
    const auto pps = static_cast<std::size_t>(ipc::read_be(config.subspan(9 + sps, 2)));
    if (pps < 2 || pps != config.size() - 11 - sps)
      throw ipc::ProtocolError();
    add(config.subspan(8, sps));
    add(config.subspan(11 + sps, pps));
    for (std::size_t offset = 0; offset < unit.bytes.size();) {
      if (unit.bytes.size() - offset < 4)
        throw ipc::ProtocolError();
      const auto length = static_cast<std::size_t>(ipc::read_be(unit.bytes.subspan(offset, 4)));
      offset += 4;
      if (length < 2 || length > unit.bytes.size() - offset)
        throw ipc::ProtocolError();
      add(unit.bytes.subspan(offset, length));
      offset += length;
    }
    std::array<unsigned char *, 3> output{};
    SBufferInfo info{};
    if (decoder_->DecodeFrameNoDelay(annex.data(), static_cast<int>(annex.size()), output.data(),
                                     &info) != dsErrorFree ||
        info.iBufferStatus != 1 || !output[0] || !output[1] || !output[2])
      throw ipc::ProtocolError();
    return {info.UsrData.sSystemBuffer.iWidth,
            info.UsrData.sSystemBuffer.iHeight,
            {output[0][0], output[1][0], output[2][0]}};
  }
};
} // namespace bridge::diagnostics
