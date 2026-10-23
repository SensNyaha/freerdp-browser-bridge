#pragma once
#include <algorithm>
#include <iterator>
namespace bridge::compat::ranges {
// Only the non-projecting, whole-range operations actually used by bridge tests.
template <class R, class F> bool all_of(R &&r, F f) {
  return std::all_of(std::begin(r), std::end(r), f);
}
template <class R, class F> bool any_of(R &&r, F f) {
  return std::any_of(std::begin(r), std::end(r), f);
}
template <class R, class V> auto find(R &&r, const V &v) {
  return std::find(std::begin(r), std::end(r), v);
}
template <class A, class B> bool equal(A &&a, B &&b) {
  return std::equal(std::begin(a), std::end(a), std::begin(b), std::end(b));
}
template <class R, class I> I copy(R &&r, I output) {
  return std::copy(std::begin(r), std::end(r), output);
}
template <class R, class V> void fill(R &&r, const V &v) {
  std::fill(std::begin(r), std::end(r), v);
}
} // namespace bridge::compat::ranges
