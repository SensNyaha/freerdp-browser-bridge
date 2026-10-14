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

namespace {
using namespace bridge::ipc;
using Clock = std::chrono::steady_clock;
void checked(napi_status status) {
  if (status != napi_ok)
    throw ProtocolError();
}
struct Pair {
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
  Pair(napi_env environment, std::uint32_t identity) : env(environment), id(identity) {
    if (::socketpair(AF_UNIX, SOCK_SEQPACKET | SOCK_CLOEXEC, 0, fds) != 0)
      throw ProtocolError();
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
  Pair &get(std::uint32_t id) {
    for (auto &pair : pairs)
      if (pair && pair->id == id)
        return *pair;
    throw ProtocolError();
  }
};
struct Call {
  Context *context;
  std::array<napi_value, 2> args{};
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
      auto pair = std::make_unique<Pair>(env, static_cast<std::uint32_t>(context.next++));
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
        pair.reset();
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
void cleanup(void *data) {
  auto *context = static_cast<Context *>(data);
  const auto env = context->env;
  napi_handle_scope scope;
  // Environment hooks run outside a normal N-API callback handle scope.
  if (napi_open_handle_scope(env, &scope) != napi_ok)
    std::terminate();
  delete context;
  if (napi_close_handle_scope(env, scope) != napi_ok)
    std::terminate();
}
napi_value initialize(napi_env env, napi_value exports) {
  return guarded(env, [&] {
    auto context = std::make_unique<Context>(env);
    napi_value schema;
    checked(napi_create_uint32(env, 1, &schema));
    checked(napi_set_named_property(env, exports, "schemaVersion", schema));
    for (const auto &[name, function] :
         std::array<std::pair<const char *, napi_callback>, 7>{{{"create", create},
                                                                {"childFd", child_fd},
                                                                {"closeChild", close_child},
                                                                {"close", close},
                                                                {"read", read},
                                                                {"write", write},
                                                                {"flush", flush}}}) {
      napi_value value;
      checked(napi_create_function(env, name, NAPI_AUTO_LENGTH, function, context.get(), &value));
      checked(napi_set_named_property(env, exports, name, value));
    }
    checked(napi_add_env_cleanup_hook(env, cleanup, context.get()));
    context.release();
    return exports;
  });
}
} // namespace
NAPI_MODULE(NODE_GYP_MODULE_NAME, initialize)
