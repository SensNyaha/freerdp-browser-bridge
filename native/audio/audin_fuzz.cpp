#include "audin_ingress.hpp"
extern "C" int LLVMFuzzerTestOneInput(const std::uint8_t *data, std::size_t size) {
  using bridge::audio::AudinIngress;
  const std::uint8_t version[]{1, 2, 0, 0, 0};
  const std::uint8_t formats[]{2,    1, 0, 0, 0,    27, 0, 0, 0, 1,  0, 2, 0, 0x80,
                               0xbb, 0, 0, 0, 0xee, 2,  0, 4, 0, 16, 0, 0, 0};
  const std::uint8_t open[]{3,    0xc0, 3, 0, 0,    0, 0, 0, 0, 1,  0, 2, 0, 0x80,
                            0xbb, 0,    0, 0, 0xee, 2, 0, 4, 0, 16, 0, 0, 0};
  for (const auto profile : {bridge::audio::AudinCaptureProfile::compatibility,
                             bridge::audio::AudinCaptureProfile::worker})
    for (unsigned phase = 0; phase < 5; ++phase) {
      AudinIngress parser(profile);
      if (phase > 0)
        (void)parser.inspect(version);
      if (phase > 1)
        (void)parser.inspect(formats);
      if (phase == 3)
        (void)parser.inspect(open);
      if (phase == 4) {
        auto refused = std::to_array(open);
        refused[1] = 1;
        refused[2] = 0;
        (void)parser.inspect(refused);
      }
      (void)parser.inspect({data, size});
    }
  return 0;
}
