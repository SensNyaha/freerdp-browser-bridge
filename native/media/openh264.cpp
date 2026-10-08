#include "video_encoder.hpp"
#include <algorithm>
#include <limits>
#include <wels/codec_api.h>

namespace bridge::media {
using ipc::ProtocolError;
struct SoftwareH264Encoder::State {
  EncoderOptions options;
  std::unique_ptr<ISVCEncoder, decltype(&WelsDestroySVCEncoder)> encoder{nullptr,
                                                                         WelsDestroySVCEncoder};
  AvcPacketizer packetizer;
  std::vector<std::uint8_t> yuv;
  int width = 0, height = 0;
  std::uint64_t last_timestamp = 0, last_idr = 0;
  bool encoded = false;
  explicit State(EncoderOptions value) : options(value) {
    if (value.fps < 1 || value.fps > 60 || value.bitrate < 100000 || value.bitrate > 20000000 ||
        value.keyframe_ms < 1000 || value.keyframe_ms > 2000)
      throw ProtocolError();
  }
  void configure(int w, int h) {
    encoder.reset();
    width = height = 0;
    ISVCEncoder *created = nullptr;
    if (WelsCreateSVCEncoder(&created) != 0 || !created)
      throw ProtocolError();
    encoder.reset(created); // Official destroy also uninitializes partial contexts.
    int quiet = WELS_LOG_QUIET;
    if (encoder->SetOption(ENCODER_OPTION_TRACE_LEVEL, &quiet) != 0)
      throw ProtocolError();
    SEncParamExt parameters{};
    if (encoder->GetDefaultParams(&parameters) != 0)
      throw ProtocolError();
    parameters.iUsageType = SCREEN_CONTENT_REAL_TIME;
    parameters.iPicWidth = w;
    parameters.iPicHeight = h;
    parameters.iTargetBitrate = options.bitrate;
    parameters.iMaxBitrate = options.bitrate;
    parameters.iRCMode = RC_BITRATE_MODE;
    parameters.fMaxFrameRate = static_cast<float>(options.fps);
    parameters.iTemporalLayerNum = parameters.iSpatialLayerNum = 1;
    parameters.iNumRefFrame = 1;
    parameters.iComplexityMode = LOW_COMPLEXITY;
    parameters.uiIntraPeriod = static_cast<unsigned int>(options.fps * options.keyframe_ms / 1000);
    parameters.bEnableFrameSkip = false;
    parameters.bEnableLongTermReference = false;
    parameters.bPrefixNalAddingCtrl = parameters.bEnableSSEI = false;
    parameters.bEnableDenoise = false;
    parameters.bEnableFrameCroppingFlag = true;
    parameters.iEntropyCodingModeFlag = 0; // Baseline CAVLC, no B-frames.
    parameters.eSpsPpsIdStrategy = CONSTANT_ID;
    parameters.iMultipleThreadIdc = 1;
    auto &layer = parameters.sSpatialLayers[0];
    layer.iVideoWidth = w;
    layer.iVideoHeight = h;
    layer.fFrameRate = parameters.fMaxFrameRate;
    layer.iSpatialBitrate = layer.iMaxSpatialBitrate = options.bitrate;
    layer.uiProfileIdc = PRO_BASELINE;
    layer.uiLevelIdc = LEVEL_UNKNOWN; // Provider chooses the conforming level.
    layer.bVideoSignalTypePresent = layer.bColorDescriptionPresent = true;
    layer.uiVideoFormat = 5; // Unspecified source format.
    layer.bFullRange = false;
    layer.uiColorPrimaries = layer.uiTransferCharacteristics = layer.uiColorMatrix = 6; // Rec.601.
    layer.sSliceArgument.uiSliceMode = SM_SINGLE_SLICE;
    if (encoder->InitializeExt(&parameters) != 0)
      throw ProtocolError();
    int format = videoFormatI420;
    if (encoder->SetOption(ENCODER_OPTION_DATAFORMAT, &format) != 0)
      throw ProtocolError();
    yuv.resize(static_cast<std::size_t>(w) * static_cast<std::size_t>(h) * 3 / 2);
    packetizer = AvcPacketizer();
    width = w;
    height = h;
    encoded = false;
  }
  void convert(const VideoFrame &frame) {
    const auto pixels = static_cast<std::size_t>(width) * static_cast<std::size_t>(height);
    auto *y_plane = yuv.data(), *u_plane = y_plane + pixels, *v_plane = u_plane + pixels / 4;
    const auto byte = [](int value) {
      return static_cast<std::uint8_t>(std::clamp(value, 0, 255));
    };
    for (int y = 0; y < height; y += 2) {
      for (int x = 0; x < width; x += 2) {
        int r_sum = 0, g_sum = 0, b_sum = 0;
        for (int dy = 0; dy < 2; ++dy)
          for (int dx = 0; dx < 2; ++dx) {
            const auto source =
                static_cast<std::size_t>(y + dy) * static_cast<std::size_t>(frame.stride) +
                static_cast<std::size_t>(x + dx) * 4;
            const int b = frame.bgra[source], g = frame.bgra[source + 1],
                      r = frame.bgra[source + 2];
            y_plane[static_cast<std::size_t>((y + dy) * width + x + dx)] =
                byte(((66 * r + 129 * g + 25 * b + 128) >> 8) + 16);
            r_sum += r;
            g_sum += g;
            b_sum += b;
          }
        const int r = (r_sum + 2) / 4, g = (g_sum + 2) / 4, b = (b_sum + 2) / 4;
        const auto uv = static_cast<std::size_t>((y / 2) * (width / 2) + x / 2);
        u_plane[uv] = byte(((-38 * r - 74 * g + 112 * b + 128) >> 8) + 128);
        v_plane[uv] = byte(((112 * r - 94 * g - 18 * b + 128) >> 8) + 128);
      }
    }
  }
};
SoftwareH264Encoder::SoftwareH264Encoder(EncoderOptions options)
    : state_(std::make_unique<State>(options)) {}
SoftwareH264Encoder::~SoftwareH264Encoder() = default;
AvcUnit SoftwareH264Encoder::encode(const VideoFrame &frame, bool force_idr) {
  if (frame.width < 16 || frame.width > 3840 || frame.height < 16 || frame.height > 2160 ||
      frame.width % 2 != 0 || frame.height % 2 != 0 || frame.stride < frame.width * 4 ||
      frame.bgra.size() <
          static_cast<std::size_t>(frame.stride) * static_cast<std::size_t>(frame.height) ||
      frame.timestamp_us / 1000 >
          static_cast<std::uint64_t>(std::numeric_limits<long long>::max()) ||
      (state_->encoded && frame.timestamp_us <= state_->last_timestamp))
    throw ProtocolError();
  if (frame.width != state_->width || frame.height != state_->height)
    state_->configure(frame.width, frame.height);
  auto &s = *state_;
  s.convert(frame);
  force_idr =
      force_idr || !s.encoded ||
      frame.timestamp_us - s.last_idr >= static_cast<std::uint64_t>(s.options.keyframe_ms) * 1000;
  if (force_idr && s.encoder->ForceIntraFrame(true) != 0)
    throw ProtocolError();
  const auto pixels = static_cast<std::size_t>(s.width) * static_cast<std::size_t>(s.height);
  SSourcePicture picture{};
  picture.iColorFormat = videoFormatI420;
  picture.iPicWidth = s.width;
  picture.iPicHeight = s.height;
  picture.iStride[0] = s.width;
  picture.iStride[1] = picture.iStride[2] = s.width / 2;
  picture.pData[0] = s.yuv.data();
  picture.pData[1] = picture.pData[0] + pixels;
  picture.pData[2] = picture.pData[1] + pixels / 4;
  picture.uiTimeStamp = static_cast<long long>(frame.timestamp_us / 1000);
  SFrameBSInfo encoded{};
  if (s.encoder->EncodeFrame(&picture, &encoded) != 0 || encoded.iLayerNum < 1 ||
      encoded.iLayerNum > MAX_LAYER_NUM_OF_FRAME || encoded.iFrameSizeInBytes < 1 ||
      encoded.iFrameSizeInBytes > static_cast<int>(max_access_unit_bytes) ||
      (encoded.eFrameType != videoFrameTypeIDR && encoded.eFrameType != videoFrameTypeI &&
       encoded.eFrameType != videoFrameTypeP))
    throw ProtocolError();
  s.packetizer.begin();
  std::size_t total = 0;
  for (int layer_index = 0; layer_index < encoded.iLayerNum; ++layer_index) {
    const auto &layer = encoded.sLayerInfo[layer_index];
    if (!layer.pBsBuf || !layer.pNalLengthInByte || layer.iNalCount < 1 || layer.iNalCount > 1024)
      throw ProtocolError();
    std::size_t offset = 0;
    for (int i = 0; i < layer.iNalCount; ++i) {
      const int length = layer.pNalLengthInByte[i];
      if (length < 1 || static_cast<std::size_t>(length) >
                            static_cast<std::size_t>(encoded.iFrameSizeInBytes) - total)
        throw ProtocolError();
      s.packetizer.append({layer.pBsBuf + offset, static_cast<std::size_t>(length)});
      offset += static_cast<std::size_t>(length);
      total += static_cast<std::size_t>(length);
    }
  }
  if (total != static_cast<std::size_t>(encoded.iFrameSizeInBytes))
    throw ProtocolError();
  const auto unit = s.packetizer.finish();
  if ((force_idr && !unit.keyframe) || unit.keyframe != (encoded.eFrameType == videoFrameTypeIDR))
    throw ProtocolError();
  s.last_timestamp = frame.timestamp_us;
  if (unit.keyframe)
    s.last_idr = frame.timestamp_us;
  s.encoded = true;
  return unit;
}
} // namespace bridge::media
