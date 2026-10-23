# Bridge compiler compatibility subset

This internal subset lets bridge sources build with GCC 8.3's stock libstdc++
while retaining the C++20 language mode. It is not a replacement standard
library. Never add declarations to `std` or expose these C++ types in a wire ABI.
Rebuild all native objects and C++ dependencies together when changing compiler
or standard-library profiles.

- `span.hpp`: dynamic-extent contiguous borrowed storage only. Array/container
  constness is preserved; mutable views refuse temporary or const containers.
  Const views can borrow a temporary for its full expression, as `std::span`
  can; retaining such a view outlives the storage. The fallback checks indexing
  and subview bounds and never allocates. No fixed extents or ranges concepts.
- `bit.hpp`: equally sized trivially copyable representations, using the native
  standard facility where present and `memcpy` otherwise. The fallback is not
  a constant-evaluation facility.
- `ranges.hpp`: whole-range `all_of`, `any_of`, `find`, `equal`, `copy` and `fill`
  through existing standard algorithms. No views, projections or concepts.
- `numbers.hpp`: the double-precision `pi` used by the owned Opus test tone,
  with exactly the standard binary64 value. No general math-constant library.
- `thread.hpp`: the joining-thread, stop-source/token and copyable stop-callback
  operations currently used by the bridge. Modern libraries use their standard
  implementation. The fallback shares stop authority, invokes callbacks once,
  joins an in-flight callback at removal, and requests stop/joins at thread
  destruction or replacement. A state has 64 live callback slots; exceeding the
  limit throws `length_error` before registration. This finite fallback policy
  is intentionally narrower than the standard library's allocation policy.

`compat-native-tests` exercises the selected implementation;
`compat-fallback-tests` forces the fallback even with a modern library. Tests
cover borrowed-storage/representation integrity, joined lifetime, shared source
authority, one-shot callback removal and concurrent retirement. The fallback
also checks refusal/reuse at its registration boundary. These tests do not
replace foundation, linked dependency, actual RDP or distro acceptance.
