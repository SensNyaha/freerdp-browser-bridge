#pragma once
#include <thread>
#if __has_include(<stop_token>)
#include <stop_token>
#endif
#include <array>
#include <condition_variable>
#include <functional>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <tuple>
#include <type_traits>
#include <utility>

namespace bridge::compat {
#if defined(__cpp_lib_jthread) && __cpp_lib_jthread >= 201911L &&                                  \
    !defined(BRIDGE_COMPAT_FORCE_FALLBACK)
using std::jthread;
using std::stop_callback;
using std::stop_source;
using std::stop_token;
#else
namespace detail {
struct Callback {
  std::mutex mutex;
  std::condition_variable completed;
  std::function<void()> function;
  std::thread::id executing;
  bool active = true, running = false;
  explicit Callback(std::function<void()> fn) : function(std::move(fn)) {}
  void invoke() noexcept {
    {
      std::lock_guard<std::mutex> lock(mutex);
      if (!active)
        return;
      running = true;
      executing = std::this_thread::get_id();
    }
    try {
      function();
    } catch (...) {
      std::terminate();
    }
    {
      std::lock_guard<std::mutex> lock(mutex);
      running = false;
      executing = {};
    }
    completed.notify_all();
  }
  void retire() noexcept {
    std::unique_lock<std::mutex> lock(mutex);
    active = false;
    if (executing != std::this_thread::get_id())
      completed.wait(lock, [&] { return !running; });
  }
};
struct StopState {
  std::mutex mutex;
  bool requested = false;
  std::size_t sources = 1;
  // Explicit finite registrations; only the fixture currently registers one.
  std::array<std::weak_ptr<Callback>, 64> callbacks;
};
} // namespace detail
class stop_source;
template <class F> class stop_callback;
class stop_token {
  std::shared_ptr<detail::StopState> state_;
  explicit stop_token(std::shared_ptr<detail::StopState> state) : state_(std::move(state)) {}
  friend class stop_source;
  template <class F> friend class stop_callback;

public:
  stop_token() noexcept = default;
  bool stop_possible() const noexcept {
    if (!state_) return false;
    std::lock_guard<std::mutex> lock(state_->mutex);
    return state_->requested || state_->sources != 0;
  }
  bool stop_requested() const noexcept {
    if (!state_)
      return false;
    std::lock_guard<std::mutex> lock(state_->mutex);
    return state_->requested;
  }
};
class stop_source {
  std::shared_ptr<detail::StopState> state_ = std::make_shared<detail::StopState>();
  void release() noexcept {
    if (state_) { std::lock_guard<std::mutex> lock(state_->mutex); --state_->sources; }
  }
  void retain() noexcept {
    if (state_) { std::lock_guard<std::mutex> lock(state_->mutex); ++state_->sources; }
  }

public:
  stop_source() = default;
  stop_source(const stop_source &other) noexcept : state_(other.state_) { retain(); }
  stop_source(stop_source &&) noexcept = default;
  stop_source &operator=(const stop_source &other) noexcept {
    if (this != &other) { release(); state_ = other.state_; retain(); }
    return *this;
  }
  stop_source &operator=(stop_source &&other) noexcept {
    if (this != &other) { release(); state_ = std::move(other.state_); }
    return *this;
  }
  ~stop_source() { release(); }
  stop_token get_token() const noexcept { return stop_token(state_); }
  bool request_stop() noexcept {
    if (!state_)
      return false;
    std::array<std::shared_ptr<detail::Callback>, 64> callbacks{};
    {
      std::lock_guard<std::mutex> lock(state_->mutex);
      if (state_->requested)
        return false;
      state_->requested = true;
      for (std::size_t i = 0; i < callbacks.size(); ++i)
        callbacks[i] = state_->callbacks[i].lock();
    }
    for (auto &callback : callbacks)
      if (callback)
        callback->invoke();
    return true;
  }
};
template <class F> class stop_callback {
  std::shared_ptr<detail::Callback> callback_;

public:
  stop_callback(stop_token token, F callback) {
    if (!token.state_)
      return;
    callback_ = std::make_shared<detail::Callback>(std::function<void()>(std::move(callback)));
    bool immediate = false, registered = false;
    {
      std::lock_guard<std::mutex> lock(token.state_->mutex);
      immediate = token.state_->requested;
      if (!immediate)
        for (auto &slot : token.state_->callbacks)
          if (slot.expired()) {
            slot = callback_;
            registered = true;
            break;
          }
    }
    if (immediate)
      callback_->invoke();
    else if (!registered)
      throw std::length_error("Stop callback capacity exceeded");
  }
  stop_callback(const stop_callback &) = delete;
  stop_callback &operator=(const stop_callback &) = delete;
  ~stop_callback() {
    if (callback_)
      callback_->retire();
  }
};
template <class F> stop_callback(stop_token, F) -> stop_callback<F>;
class jthread {
  stop_source source_;
  std::thread thread_;
  void retire() noexcept {
    if (thread_.joinable()) {
      source_.request_stop();
      thread_.join();
    }
  }

public:
  jthread() = default;
  template <class F, class... A,
            std::enable_if_t<!std::is_same_v<std::decay_t<F>, jthread>, int> = 0>
  explicit jthread(F &&function, A &&...args) {
    const auto token = source_.get_token();
    thread_ = std::thread([token, fn = std::decay_t<F>(std::forward<F>(function)),
                           values = std::make_tuple(std::forward<A>(args)...)]() mutable {
      std::apply(
          [&](auto &&...unpacked) {
            if constexpr (std::is_invocable_v<std::decay_t<F>, stop_token, std::decay_t<A>...>)
              std::invoke(std::move(fn), token, std::move(unpacked)...);
            else
              std::invoke(std::move(fn), std::move(unpacked)...);
          },
          values);
    });
  }
  jthread(jthread &&) noexcept = default;
  jthread &operator=(jthread &&other) noexcept {
    if (this != &other) {
      retire();
      source_ = std::move(other.source_);
      thread_ = std::move(other.thread_);
    }
    return *this;
  }
  jthread(const jthread &) = delete;
  jthread &operator=(const jthread &) = delete;
  ~jthread() { retire(); }
  bool joinable() const noexcept { return thread_.joinable(); }
  bool request_stop() noexcept { return source_.request_stop(); }
  stop_token get_stop_token() const noexcept { return source_.get_token(); }
  void join() { thread_.join(); }
};
#endif
} // namespace bridge::compat
