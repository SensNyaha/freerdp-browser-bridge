#include <spng.h>

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

extern "C" int LLVMFuzzerTestOneInput(const std::uint8_t *, std::size_t);

namespace {
std::size_t checks = 0;
void check(bool condition) {
  ++checks;
  if (!condition)
    throw std::runtime_error("PNG regression failed");
}
using Context = std::unique_ptr<spng_ctx, decltype(&spng_ctx_free)>;
Context context(int flags) {
  Context ctx(spng_ctx_new(flags), spng_ctx_free);
  check(ctx != nullptr);
  check(spng_set_image_limits(ctx.get(), 64, 64) == 0);
  check(spng_set_chunk_limits(ctx.get(), 1U << 20, 1U << 20) == 0);
  return ctx;
}
constexpr std::uint32_t width = 32, height = 17;
using Pixels = std::array<std::uint8_t, width * height * 4>;

void roundtrip(bool interlaced, bool progressive_encode, bool progressive_decode) {
  Pixels pixels{};
  for (std::size_t i = 0; i < pixels.size(); ++i)
    pixels[i] = static_cast<std::uint8_t>((i * 37 + i / 19) & 255);
  auto encoder = context(SPNG_CTX_ENCODER);
  check(spng_set_option(encoder.get(), SPNG_ENCODE_TO_BUFFER, 1) == 0);
  spng_ihdr header{};
  header.width = width;
  header.height = height;
  header.bit_depth = 8;
  header.color_type = SPNG_COLOR_TYPE_TRUECOLOR_ALPHA;
  header.interlace_method = interlaced ? SPNG_INTERLACE_ADAM7 : SPNG_INTERLACE_NONE;
  check(spng_set_ihdr(encoder.get(), &header) == 0);
  if (progressive_encode) {
    check(spng_encode_image(encoder.get(), nullptr, 0, SPNG_FMT_PNG,
                            SPNG_ENCODE_PROGRESSIVE | SPNG_ENCODE_FINALIZE) == 0);
    int result = 0;
    for (std::size_t rows = 0; result == 0; ++rows) {
      check(rows < height * 7);
      spng_row_info row{};
      check(spng_get_row_info(encoder.get(), &row) == 0 && row.row_num < height);
      result = spng_encode_row(encoder.get(), pixels.data() + row.row_num * width * 4, width * 4);
    }
    check(result == SPNG_EOI);
  } else {
    check(spng_encode_image(encoder.get(), pixels.data(), pixels.size(), SPNG_FMT_PNG,
                            SPNG_ENCODE_FINALIZE) == 0);
  }
  std::size_t png_size = 0;
  int result = 0;
  std::unique_ptr<void, decltype(&std::free)> png(
      spng_get_png_buffer(encoder.get(), &png_size, &result), std::free);
  check(result == 0 && png && png_size > 32 && png_size <= (1U << 20));
  auto decoder = context(0);
  check(spng_set_png_buffer(decoder.get(), png.get(), png_size) == 0);
  std::size_t decoded_size = 0;
  check(spng_decoded_image_size(decoder.get(), SPNG_FMT_RGBA8, &decoded_size) == 0);
  check(decoded_size == pixels.size());
  Pixels decoded{};
  if (progressive_decode) {
    check(spng_decode_image(decoder.get(), nullptr, 0, SPNG_FMT_RGBA8, SPNG_DECODE_PROGRESSIVE) ==
          0);
    result = 0;
    for (std::size_t rows = 0; result == 0; ++rows) {
      check(rows < height * 7);
      spng_row_info row{};
      check(spng_get_row_info(decoder.get(), &row) == 0 && row.row_num < height);
      result = spng_decode_row(decoder.get(), decoded.data() + row.row_num * width * 4, width * 4);
    }
    check(result == SPNG_EOI);
  } else {
    check(spng_decode_image(decoder.get(), decoded.data(), decoded.size(), SPNG_FMT_RGBA8, 0) == 0);
  }
  check(decoded == pixels);

  auto small_output = context(0);
  check(spng_set_png_buffer(small_output.get(), png.get(), png_size) == 0);
  check(spng_decode_image(small_output.get(), decoded.data(), decoded.size() - 1, SPNG_FMT_RGBA8,
                          0) == SPNG_EBUFSIZ);
  auto small_limit = context(0);
  check(spng_set_image_limits(small_limit.get(), width - 1, height) == 0);
  check(spng_set_png_buffer(small_limit.get(), png.get(), png_size) == 0);
  check(spng_decoded_image_size(small_limit.get(), SPNG_FMT_RGBA8, &decoded_size) != 0);
  auto truncated = context(0);
  check(spng_set_png_buffer(truncated.get(), png.get(), 24) == 0);
  check(spng_decoded_image_size(truncated.get(), SPNG_FMT_RGBA8, &decoded_size) != 0);
}

void replay(const std::vector<std::filesystem::path> &roots) {
  constexpr std::uintmax_t file_limit = 8U << 20, total_limit = 64U << 20;
  std::vector<std::filesystem::path> files;
  std::uintmax_t total = 0;
  for (const auto &root : roots) {
    check(std::filesystem::is_directory(root));
    for (const auto &entry : std::filesystem::directory_iterator(root)) {
      if (entry.path().extension() != ".png")
        continue;
      check(!entry.is_symlink() && entry.is_regular_file());
      check(files.size() < 2048);
      const auto size = entry.file_size();
      check(size > 0 && size <= file_limit && size <= total_limit - total);
      total += size;
      files.push_back(entry.path());
    }
  }
  check(!files.empty());
  std::sort(files.begin(), files.end());
  std::size_t inputs = 0;
  for (const auto &file : files) {
    const auto size = std::filesystem::file_size(file);
    check(size > 0 && size <= file_limit);
    std::vector<std::uint8_t> data(static_cast<std::size_t>(size) + 4);
    std::ifstream stream(file, std::ios::binary);
    check(stream.good());
    stream.read(reinterpret_cast<char *>(data.data()), static_cast<std::streamsize>(size));
    check(stream.gcount() == static_cast<std::streamsize>(size));
    check(stream.peek() == std::char_traits<char>::eof());
    for (const int format : {SPNG_FMT_RGBA8, SPNG_FMT_PNG, SPNG_FMT_RAW}) {
      // Whole buffer, callback stream, progressive callback, progressive FILE.
      for (const std::uint8_t mode : {0, 1, 3, 7}) {
        data[size] = mode;
        data[size + 1] = static_cast<std::uint8_t>(format & 255);
        data[size + 2] = static_cast<std::uint8_t>(format >> 8);
        data[size + 3] = 0;
        check(LLVMFuzzerTestOneInput(data.data(), data.size()) == 0);
        ++inputs;
      }
    }
  }
  std::cout << "Upstream PNG replay: " << files.size() << " files, " << inputs << " inputs\n";
}
} // namespace

int main(int argc, char **argv) {
  try {
    if (argc == 1) {
      for (const bool interlaced : {false, true})
        for (const bool encode : {false, true})
          for (const bool decode : {false, true})
            roundtrip(interlaced, encode, decode);
      std::cout << "PNG RGBA8 roundtrip: 8 encode/decode combinations\n";
    } else {
      check(argc == 3);
      replay({argv[1], argv[2]});
    }
    std::cout << "PNG regression passed: " << checks << " checks\n";
    return 0;
  } catch (const std::exception &error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
