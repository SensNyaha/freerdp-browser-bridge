#pragma once
#include <array>
#include <cstddef>
#include <iterator>
#include <stdexcept>
#include <type_traits>
#include <utility>
#if __has_include(<span>)
#include <span>
#endif

namespace bridge::compat {
#if defined(__cpp_lib_span) && __cpp_lib_span >= 202002L && !defined(BRIDGE_COMPAT_FORCE_FALLBACK)
using std::span;
#else
// The bridge uses dynamic-extent contiguous borrowed views only. No ownership,
// allocation, initializer_list, iterator-pair or ranges dependency is introduced.
// Mutable views cannot be formed from const storage or temporary containers.
template <class T> class span {
  T *data_ = nullptr;
  std::size_t size_ = 0;
  constexpr void require(std::size_t offset, std::size_t count) const {
    if (offset > size_ || count > size_ - offset)
      throw std::out_of_range("Borrowed view bound exceeded");
  }

public:
  using element_type = T;
  using value_type = std::remove_cv_t<T>;
  using size_type = std::size_t;
  using difference_type = std::ptrdiff_t;
  using pointer = T *;
  using reference = T &;
  using iterator = T *;
  using reverse_iterator = std::reverse_iterator<iterator>;
  constexpr span() noexcept = default;
  constexpr span(T *data, std::size_t size) : data_(data), size_(size) {
    if (size && !data)
      throw std::invalid_argument("Borrowed view storage is absent");
  }
  template <class U, std::size_t N,
            std::enable_if_t<std::is_convertible_v<U (*)[], T (*)[]>, int> = 0>
  constexpr span(U (&data)[N]) noexcept : data_(data), size_(N) {}
  template <class U, std::enable_if_t<std::is_convertible_v<U (*)[], T (*)[]>, int> = 0>
  constexpr span(span<U> other) noexcept : data_(other.data()), size_(other.size()) {}
  template <
      class R, class P = decltype(std::data(std::declval<R &>())),
      std::enable_if_t<std::is_convertible_v<std::remove_pointer_t<P> (*)[], T (*)[]>, int> = 0>
  constexpr span(R &range) noexcept : data_(std::data(range)), size_(std::size(range)) {}
  template <class R, class P = decltype(std::data(std::declval<const R &>())),
            std::enable_if_t<std::is_const_v<T> &&
                                 std::is_convertible_v<std::remove_pointer_t<P> (*)[], T (*)[]>, int> = 0>
  constexpr span(const R &range) noexcept : data_(std::data(range)), size_(std::size(range)) {}
  constexpr T *data() const noexcept { return data_; }
  constexpr std::size_t size() const noexcept { return size_; }
  constexpr std::size_t size_bytes() const noexcept { return size_ * sizeof(T); }
  constexpr bool empty() const noexcept { return size_ == 0; }
  constexpr T &operator[](std::size_t index) const {
    require(index, 1);
    return data_[index];
  }
  constexpr T &front() const { return (*this)[0]; }
  constexpr T &back() const {
    require(0, 1);
    return data_[size_ - 1];
  }
  constexpr iterator begin() const noexcept { return data_; }
  constexpr iterator end() const noexcept { return size_ ? data_ + size_ : data_; }
  constexpr reverse_iterator rbegin() const noexcept { return reverse_iterator(end()); }
  constexpr reverse_iterator rend() const noexcept { return reverse_iterator(begin()); }
  constexpr span first(std::size_t count) const { return subspan(0, count); }
  constexpr span last(std::size_t count) const {
    require(0, count);
    return subspan(size_ - count, count);
  }
  constexpr span subspan(std::size_t offset) const {
    require(offset, 0);
    return subspan(offset, size_ - offset);
  }
  constexpr span subspan(std::size_t offset, std::size_t count) const {
    require(offset, count);
    return span(offset ? data_ + offset : data_, count);
  }
};
template <class T> span(T *, std::size_t) -> span<T>;
template <class T, std::size_t N> span(T (&)[N]) -> span<T>;
template <class R>
span(R &) -> span<std::remove_reference_t<decltype(*std::data(std::declval<R &>()))>>;
template <class R>
span(const R &) -> span<std::remove_reference_t<decltype(*std::data(std::declval<const R &>()))>>;
#endif
} // namespace bridge::compat
