#include "../compat/span.hpp"
#include "jpeg.hpp"
#include <turbojpeg.h>

namespace bridge::media {
struct JpegEncoder::State {
  tjhandle handle = nullptr;
  std::vector<std::uint8_t> buffer;
  explicit State(int quality) {
    if (quality < 1 || quality > 100)
      throw ipc::ProtocolError();
    buffer.resize(ipc::max_jpeg_bytes);
    handle = tj3Init(TJINIT_COMPRESS);
    if (!handle)
      throw ipc::ProtocolError();
    if (tj3Set(handle, TJPARAM_NOREALLOC, 1) != 0 ||
        tj3Set(handle, TJPARAM_QUALITY, quality) != 0 ||
        tj3Set(handle, TJPARAM_SUBSAMP, TJSAMP_420) != 0 ||
        tj3Set(handle, TJPARAM_FASTDCT, 1) != 0) {
      tj3Destroy(handle);
      handle = nullptr;
      throw ipc::ProtocolError();
    }
  }
  ~State() { tj3Destroy(handle); }
};
JpegEncoder::JpegEncoder(int quality) : state_(std::make_unique<State>(quality)) {}
JpegEncoder::~JpegEncoder() = default;
::bridge::compat::span<const std::uint8_t> JpegEncoder::encode(::bridge::compat::span<const std::uint8_t> bgra, int width,
                                                  int height, int stride) {
  if (width < 1 || width > 7680 || height < 1 || height > 4320 || stride < width * 4 ||
      bgra.size() < static_cast<std::size_t>(stride) * static_cast<std::size_t>(height))
    throw ipc::ProtocolError();
  auto *output = state_->buffer.data();
  auto size = state_->buffer.size();
  if (tj3Compress8(state_->handle, bgra.data(), width, stride, height, TJPF_BGRA, &output, &size) !=
          0 ||
      output != state_->buffer.data() || size < 4 || size > ipc::max_jpeg_bytes)
    throw ipc::ProtocolError();
  return ::bridge::compat::span(state_->buffer).first(size);
}
} // namespace bridge::media
