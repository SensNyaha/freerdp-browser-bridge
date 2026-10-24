// Test-only faults inside the Node process; this module is never installed.
#include <array>
#include <cstdint>
#include <cstdlib>
#include <limits>
#include <memory>
#include <node_api.h>
#include <string_view>

namespace {
void *volatile leaked = nullptr;

napi_value fail(napi_env env) {
  (void)napi_throw_error(env, "SANITIZER_PROBE_INVALID", "Invalid sanitizer probe invocation");
  return nullptr;
}

napi_value run(napi_env env, napi_callback_info info) {
  std::size_t count = 1, size = 0;
  napi_value argument;
  std::array<char, 16> text{};
  if (napi_get_cb_info(env, info, &count, &argument, nullptr, nullptr) != napi_ok || count != 1 ||
      napi_get_value_string_utf8(env, argument, text.data(), text.size(), &size) != napi_ok ||
      size >= text.size())
    return fail(env);
  const std::string_view mode(text.data(), size);
  if (mode == "undefined") {
    volatile int maximum = std::numeric_limits<int>::max();
    volatile int overflow = maximum + 1;
    (void)overflow;
  } else if (mode == "address") {
    auto storage = std::make_unique<std::uint8_t[]>(8);
    volatile std::size_t beyond = 8;
    volatile std::uint8_t *bytes = storage.get();
    bytes[beyond] = 1;
  } else if (mode == "leak") {
    leaked = std::malloc(128);
    if (!leaked)
      return fail(env);
    leaked = nullptr;
  } else {
    return fail(env);
  }
  napi_value result;
  return napi_get_undefined(env, &result) == napi_ok ? result : fail(env);
}

napi_value initialize(napi_env env, napi_value exports) {
  napi_value callback;
  if (napi_create_function(env, "run", NAPI_AUTO_LENGTH, run, nullptr, &callback) != napi_ok ||
      napi_set_named_property(env, exports, "run", callback) != napi_ok)
    return fail(env);
  return exports;
}
} // namespace

NAPI_MODULE(NODE_GYP_MODULE_NAME, initialize)
