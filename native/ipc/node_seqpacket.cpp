// IPC-only Node binding. No FreeRDP/WinPR headers or calls belong in this module.
#include "connection_config.hpp"
#include "seqpacket.hpp"
#include <algorithm>
#include <cerrno>
#include <chrono>
#include <cmath>
#include <memory>
#include <node_api.h>
#include <poll.h>
#include <sys/socket.h>
#include <unistd.h>
#include <uv.h>

namespace {
using namespace bridge::ipc;
using Clock = std::chrono::steady_clock;
void checked(napi_status status) {
  if (status != napi_ok)
    throw ProtocolError();
}
struct Context;
struct Pair;
void poll_ready(uv_poll_t *, int, int) noexcept;
void poll_closed(uv_handle_t *) noexcept;
struct Pair {
  Context *context;
  napi_env env;
  int fds[2]{-1, -1};
  std::uint32_t id;
  SeqpacketInspector inspector;
  std::array<std::uint8_t, seqpacket_datagram_bytes> scratch{};
  napi_ref pending = nullptr;
  std::size_t offset = 0;
  std::size_t pending_size = 0;
  std::uint64_t sequence = 1;
  Clock::time_point due{};
  std::optional<Clock::time_point> read_due;
  bool failed = false, eof = false;
  bool polling = false, closing = false;
  bool in_callback = false, listener_retiring = false;
  uv_poll_t poll{};
  napi_ref listener = nullptr;
  napi_async_context async_context = nullptr;
  Pair(Context *owner, napi_env environment, std::uint32_t identity)
      : context(owner), env(environment), id(identity) {
    if (::socketpair(AF_UNIX, SOCK_SEQPACKET | SOCK_CLOEXEC, 0, fds) != 0)
      throw ProtocolError();
  }
  void stop_listener() noexcept {
    if (polling && !uv_is_closing(reinterpret_cast<uv_handle_t *>(&poll)) &&
        uv_poll_stop(&poll) != 0)
      failed = true;
    if (in_callback) {
      listener_retiring = true;
      return;
    }
    listener_retiring = false;
    if (async_context) {
      if (napi_async_destroy(env, async_context) != napi_ok)
        failed = true;
      async_context = nullptr;
    }
    if (listener) {
      if (napi_delete_reference(env, listener) != napi_ok)
        failed = true;
      listener = nullptr;
    }
  }
  void discard() noexcept {
    if (pending) {
      napi_value buffer;
      void *data;
      std::size_t size;
      if (napi_get_reference_value(env, pending, &buffer) == napi_ok &&
          napi_get_buffer_info(env, buffer, &data, &size) == napi_ok)
        wipe({static_cast<std::uint8_t *>(data), size});
      (void)napi_delete_reference(env, pending);
      pending = nullptr;
    }
    wipe(scratch);
  }
  ~Pair() {
    discard();
    for (const auto fd : fds)
      if (fd >= 0 && ::close(fd) != 0 && errno != EINTR)
        std::terminate();
  }
  [[noreturn]] void refuse() {
    failed = true;
    stop_listener();
    discard();
    throw ProtocolError();
  }
  bool flush() {
    if (failed)
      refuse();
    if (!pending)
      return true;
    napi_value buffer;
    void *data;
    std::size_t size;
    checked(napi_get_reference_value(env, pending, &buffer));
    checked(napi_get_buffer_info(env, buffer, &data, &size));
    if (size != pending_size || size < header_bytes || offset >= size)
      refuse();
    const auto *bytes = static_cast<std::uint8_t *>(data);
    // At most 32 physical datagrams per JS call; never wait in Node's thread.
    for (unsigned count = 0; count < 32; ++count) {
      if (Clock::now() >= due)
        refuse();
      const auto length = std::min(seqpacket_chunk_bytes, size - offset);
      const auto prefix = encode_seqpacket_prefix(static_cast<std::uint32_t>(sequence),
                                                  static_cast<std::uint32_t>(size),
                                                  static_cast<std::uint32_t>(offset), length);
      iovec parts[2]{{const_cast<std::uint8_t *>(prefix.data()), prefix.size()},
                     {const_cast<std::uint8_t *>(bytes + offset), length}};
      msghdr message{};
      message.msg_iov = parts;
      message.msg_iovlen = 2;
      const auto sent = ::sendmsg(fds[0], &message, MSG_DONTWAIT | MSG_NOSIGNAL);
      if (sent < 0 && (errno == EAGAIN || errno == EWOULDBLOCK || errno == EINTR))
        return false;
      if (sent != static_cast<ssize_t>(prefix.size() + length))
        refuse();
      offset += length;
      if (offset == size) {
        if (Clock::now() >= due)
          refuse();
        checked(napi_delete_reference(env, pending));
        pending = nullptr;
        offset = 0;
        ++sequence;
        return true;
      }
    }
    return false;
  }
  napi_value read() {
    if (failed)
      refuse();
    if (read_due && Clock::now() >= *read_due)
      refuse();
    napi_value result;
    if (eof) {
      checked(napi_get_undefined(env, &result));
      return result;
    }
    wipe(scratch);
    iovec part{scratch.data(), scratch.size()};
    msghdr message{};
    message.msg_iov = &part;
    message.msg_iovlen = 1;
    const auto received = ::recvmsg(fds[0], &message, MSG_DONTWAIT);
    if (received < 0 && (errno == EAGAIN || errno == EWOULDBLOCK || errno == EINTR)) {
      checked(napi_get_null(env, &result));
      return result;
    }
    if (received < 0 || (message.msg_flags & (MSG_TRUNC | MSG_CTRUNC)))
      refuse();
    if (received == 0) {
      pollfd event{fds[0], POLLRDHUP, 0};
      if (::poll(&event, 1, 0) != 1 || !(event.revents & (POLLRDHUP | POLLHUP)) ||
          !inspector.at_record_boundary())
        refuse();
      eof = true;
      checked(napi_get_undefined(env, &result));
      return result;
    }
    const auto bytes =
        inspector.inspect(std::span(scratch).first(static_cast<std::size_t>(received)));
    if (!bytes)
      refuse();
    if (read_due && Clock::now() >= *read_due)
      refuse();
    if (inspector.at_record_boundary())
      read_due.reset();
    else if (!read_due)
      read_due = Clock::now() + std::chrono::seconds(1);
    checked(napi_create_buffer_copy(env, bytes->size(), bytes->data(), nullptr, &result));
    return result;
  }
};
struct Context {
  const napi_env env;
  explicit Context(napi_env environment) : env(environment) {}
  std::array<std::unique_ptr<Pair>, 32> pairs;
  std::uint64_t next = 1;
  bool cleaning = false;
  napi_async_cleanup_hook_handle cleanup_hook = nullptr;
  Pair &get(std::uint32_t id) {
    for (auto &pair : pairs)
      if (pair && pair->id == id && !pair->closing)
        return *pair;
    throw ProtocolError();
  }
  void close_pair(Pair &pair) {
    if (pair.closing)
      return;
    pair.closing = true;
    pair.stop_listener();
    pair.discard();
    if (pair.polling)
      uv_close(reinterpret_cast<uv_handle_t *>(&pair.poll), poll_closed);
    else
      release(pair);
  }
  void release(Pair &pair) {
    for (auto &slot : pairs)
      if (slot.get() == &pair) {
        slot.reset();
        return;
      }
    std::terminate();
  }
  void finish_cleanup() {
    if (!cleaning)
      return;
    for (const auto &pair : pairs)
      if (pair)
        return;
    if (napi_remove_async_cleanup_hook(cleanup_hook) != napi_ok)
      std::terminate();
    delete this;
  }
};
void poll_closed(uv_handle_t *handle) noexcept {
  auto *pair = static_cast<Pair *>(handle->data);
  auto *context = pair->context;
  context->release(*pair);
  context->finish_cleanup();
}
void poll_ready(uv_poll_t *handle, int status, int events) noexcept {
  auto *pair = static_cast<Pair *>(handle->data);
  if (pair->closing || pair->failed || !pair->listener)
    return;
  napi_handle_scope scope;
  if (napi_open_handle_scope(pair->env, &scope) != napi_ok)
    std::terminate();
  pair->in_callback = true;
  try {
    napi_value callback, receiver, args[2], result;
    checked(napi_get_reference_value(pair->env, pair->listener, &callback));
    checked(napi_get_global(pair->env, &receiver));
    checked(napi_create_int32(pair->env, status, &args[0]));
    checked(napi_create_int32(pair->env, events, &args[1]));
    checked(
        napi_make_callback(pair->env, pair->async_context, receiver, callback, 2, args, &result));
  } catch (...) {
    bool exception = false;
    if (napi_is_exception_pending(pair->env, &exception) != napi_ok)
      std::terminate();
    if (exception) {
      napi_value ignored;
      if (napi_get_and_clear_last_exception(pair->env, &ignored) != napi_ok)
        std::terminate();
    }
    pair->failed = true;
    pair->stop_listener();
    pair->discard();
  }
  pair->in_callback = false;
  if (pair->listener_retiring)
    pair->stop_listener();
  if (napi_close_handle_scope(pair->env, scope) != napi_ok)
    std::terminate();
}
struct Call {
  Context *context;
  std::array<napi_value, 3> args{};
  std::size_t count = args.size();
  Call(napi_env env, napi_callback_info info) {
    void *data;
    checked(napi_get_cb_info(env, info, &count, args.data(), nullptr, &data));
    context = static_cast<Context *>(data);
  }
  std::uint32_t id(napi_env env) {
    if (count < 1)
      throw ProtocolError();
    double number;
    checked(napi_get_value_double(env, args[0], &number));
    if (!std::isfinite(number) || number < 1 || number > UINT32_MAX || std::floor(number) != number)
      throw ProtocolError();
    return static_cast<std::uint32_t>(number);
  }
};
template <class Function> napi_value guarded(napi_env env, Function run) noexcept {
  try {
    return run();
  } catch (...) {
    (void)napi_throw_error(env, "IPC_ADAPTER_FAILURE", "Private packet IPC operation failed");
    return nullptr;
  }
}
napi_value boolean(napi_env env, bool value) {
  napi_value result;
  checked(napi_get_boolean(env, value, &result));
  return result;
}
napi_value create(napi_env env, napi_callback_info info) {
  return guarded(env, [&] {
    Call call(env, info);
    auto &context = *call.context;
    if (call.count != 0 || context.next > UINT32_MAX)
      throw ProtocolError();
    for (auto &slot : context.pairs) {
      if (slot)
        continue;
      auto pair = std::make_unique<Pair>(&context, env, static_cast<std::uint32_t>(context.next++));
      napi_value result;
      checked(napi_create_uint32(env, pair->id, &result));
      slot = std::move(pair);
      return result;
    }
    throw ProtocolError();
  });
}
napi_value child_fd(napi_env env, napi_callback_info info) {
  return guarded(env, [&] {
    Call call(env, info);
    auto &pair = call.context->get(call.id(env));
    if (pair.fds[1] < 0)
      throw ProtocolError();
    napi_value result;
    checked(napi_create_int32(env, pair.fds[1], &result));
    return result;
  });
}
napi_value close_child(napi_env env, napi_callback_info info) {
  return guarded(env, [&] {
    Call call(env, info);
    auto &pair = call.context->get(call.id(env));
    if (pair.fds[1] >= 0) {
      const int fd = pair.fds[1];
      pair.fds[1] = -1;
      if (::close(fd) != 0 && errno != EINTR)
        pair.refuse();
    }
    return boolean(env, true);
  });
}
napi_value close(napi_env env, napi_callback_info info) {
  return guarded(env, [&] {
    Call call(env, info);
    const auto id = call.id(env);
    for (auto &pair : call.context->pairs)
      if (pair && pair->id == id) {
        if (pair->closing)
          return boolean(env, false);
        call.context->close_pair(*pair);
        return boolean(env, true);
      }
    return boolean(env, false); // Stale close must never affect a replacement.
  });
}
napi_value read(napi_env env, napi_callback_info info) {
  return guarded(env, [&] {
    Call call(env, info);
    return call.context->get(call.id(env)).read();
  });
}
napi_value write(napi_env env, napi_callback_info info) {
  return guarded(env, [&] {
    Call call(env, info);
    auto &pair = call.context->get(call.id(env));
    bool is_buffer = false;
    if (call.count != 2 || pair.pending || pair.failed || pair.sequence > UINT32_MAX)
      pair.refuse();
    checked(napi_is_buffer(env, call.args[1], &is_buffer));
    if (!is_buffer)
      pair.refuse();
    void *data;
    std::size_t size;
    checked(napi_get_buffer_info(env, call.args[1], &data, &size));
    if (size < header_bytes || size > max_seqpacket_record_bytes)
      pair.refuse();
    try {
      if (decode_header({static_cast<std::uint8_t *>(data), header_bytes}).length + header_bytes !=
          size)
        pair.refuse();
    } catch (...) {
      pair.refuse();
    }
    checked(napi_create_reference(env, call.args[1], 1, &pair.pending));
    pair.pending_size = size;
    pair.due = Clock::now() + std::chrono::seconds(1);
    return boolean(env, pair.flush());
  });
}
napi_value flush(napi_env env, napi_callback_info info) {
  return guarded(env, [&] {
    Call call(env, info);
    return boolean(env, call.context->get(call.id(env)).flush());
  });
}
void cleanup(napi_async_cleanup_hook_handle handle, void *data) {
  auto *context = static_cast<Context *>(data);
  const auto env = context->env;
  napi_handle_scope scope;
  // Environment hooks run outside a normal N-API callback handle scope.
  if (napi_open_handle_scope(env, &scope) != napi_ok)
    std::terminate();
  context->cleaning = true;
  context->cleanup_hook = handle;
  for (auto &pair : context->pairs)
    if (pair)
      context->close_pair(*pair);
  if (napi_close_handle_scope(env, scope) != napi_ok)
    std::terminate();
  context->finish_cleanup();
}
napi_value watch(napi_env env, napi_callback_info info) {
  return guarded(env, [&] {
    Call call(env, info);
    auto &pair = call.context->get(call.id(env));
    napi_valuetype type;
    if (call.count != 2 || pair.polling || pair.failed)
      throw ProtocolError();
    checked(napi_typeof(env, call.args[1], &type));
    if (type != napi_function)
      throw ProtocolError();
    uv_loop_t *loop;
    checked(napi_get_uv_event_loop(env, &loop));
    if (uv_poll_init(loop, &pair.poll, pair.fds[0]) != 0)
      pair.refuse();
    pair.polling = true;
    pair.poll.data = &pair;
    uv_unref(reinterpret_cast<uv_handle_t *>(&pair.poll));
    try {
      checked(napi_create_reference(env, call.args[1], 1, &pair.listener));
      napi_value name;
      checked(napi_create_string_utf8(env, "BridgePacketIPC", NAPI_AUTO_LENGTH, &name));
      checked(napi_async_init(env, call.args[1], name, &pair.async_context));
    } catch (...) {
      pair.refuse();
    }
    return boolean(env, true);
  });
}
napi_value interest(napi_env env, napi_callback_info info) {
  return guarded(env, [&] {
    Call call(env, info);
    auto &pair = call.context->get(call.id(env));
    double mask;
    if (call.count != 2 || !pair.polling || !pair.listener || pair.failed)
      throw ProtocolError();
    checked(napi_get_value_double(env, call.args[1], &mask));
    if (!std::isfinite(mask) || mask < 0 || mask > 3 || std::floor(mask) != mask)
      throw ProtocolError();
    const auto result = mask == 0 ? uv_poll_stop(&pair.poll)
                                  : uv_poll_start(&pair.poll, static_cast<int>(mask), poll_ready);
    if (result != 0)
      pair.refuse();
    return boolean(env, true);
  });
}
napi_value closed(napi_env env, napi_callback_info info) {
  return guarded(env, [&] {
    Call call(env, info);
    const auto id = call.id(env);
    for (const auto &pair : call.context->pairs)
      if (pair && pair->id == id)
        return boolean(env, false);
    return boolean(env, true);
  });
}
napi_value initialize(napi_env env, napi_value exports) {
  return guarded(env, [&] {
    auto context = std::make_unique<Context>(env);
    napi_value schema;
    checked(napi_create_uint32(env, 1, &schema));
    checked(napi_set_named_property(env, exports, "schemaVersion", schema));
    for (const auto &[name, function] :
         std::array<std::pair<const char *, napi_callback>, 10>{{{"create", create},
                                                                 {"childFd", child_fd},
                                                                 {"closeChild", close_child},
                                                                 {"close", close},
                                                                 {"read", read},
                                                                 {"write", write},
                                                                 {"flush", flush},
                                                                 {"watch", watch},
                                                                 {"interest", interest},
                                                                 {"closed", closed}}}) {
      napi_value value;
      checked(napi_create_function(env, name, NAPI_AUTO_LENGTH, function, context.get(), &value));
      checked(napi_set_named_property(env, exports, name, value));
    }
    checked(napi_add_async_cleanup_hook(env, cleanup, context.get(), &context->cleanup_hook));
    context.release();
    return exports;
  });
}
} // namespace
NAPI_MODULE(NODE_GYP_MODULE_NAME, initialize)
