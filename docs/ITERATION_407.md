# Iteration 407 — GCC 8.3 compiler port and distro preparation

## Requirement and branch

Explicit user instructions require GCC 8.3.0 for Astra Linux 1.7.5 and retain
mandatory RED OS 7.3/GCC 11 support. This supersedes the earlier GCC 12 fallback
decision; historical reports are preserved. Work is on `feature/astra17-gcc83`,
based on shared `4e3ec09`. It is not merged or released. The practical MVP tag
`v0.1.0` remains unchanged.

Verified compiler-foundation checkpoint: **`f9758b5`**
(`native: port foundation compatibility to GCC 8.3`). The build receipts above
were produced from its uncommitted source bytes on the feature branch; they do
not claim binaries rebuilt after assigning the commit ID.

## Implementation

CMake's GNU floor becomes 8.3 and its compile probe checks the facilities actually
used by the bridge. The C++20 language mode, warnings as errors, Node 24,
CMake >=3.24 and exact FreeRDP/dependency pins remain. GCC 8 uses `-std=c++2a`;
this does not imply complete language or standard-library conformance.

`native/compat` uses modern standard facilities when available and supplies the
limited fallback subset in its own namespace. Borrowed dynamic-extent views
preserve contiguous storage, constness and checked subviews without allocation.
Representation copies require trivially copyable equally sized types. Range
wrappers use bounded existing ranges. Joining threads request stop and join
before destruction or replacement; stop callbacks are removed or joined before
captured storage can be released. The fallback allows 64 live registrations per
stop state and refuses excess registrations. No wire contract changes.

The shared-source possibility and fallback registration-capacity controls are
also covered explicitly. Concurrent retirement waits until the retiring thread
has started and observes that destruction cannot complete while the callback
is held, then releases it and joins both threads. Expanded tests pass again on
GCC 8.3, RED OS GCC 11, MSVC and the Astra runtime fixture.

Existing code selects this subset explicitly. Seven value-type comparisons are
spelled out for the older compiler. GNU <9 links `stdc++fs`; shared warning
policy propagates the actual platform thread flags, needed on older glibc.
The PCM monotonic test retains all 65,536 input values and now checks the unity
endpoint explicitly instead of a tautological int16 upper-bound comparison.
Four nested Catch assertions in input tests are moved into named callbacks;
assertions and deadlines are retained.

A separate staged-source audit reproduces the namespace/include substitutions
and seven explicit member comparisons from the base revision and matches all
184 mechanically adapted files byte-for-byte after Git newline normalization.
The two nonmechanical test changes above and the new compatibility code are
reviewed separately.

## Verified foundation controls

| Profile | Result | Scope |
| --- | --- | --- |
| Exact GCC 8.3.0, Debian glibc 2.28-10, CMake 3.31.6 | CTest 20/20 | Source-built foundation, native and fallback compatibility tests |
| Actual RED OS 7.3, GCC 11.4.1, glibc 2.28-15, CMake 3.25.1 | CTest 20/20 | Separate private user build, explicit system GCC |
| MSVC 19.44.35228.0, Ninja, Debug | CTest 19/19; framed lifecycle 16 passed / 1 platform skip | Clean native-source receipt, no prebuilt bridge output |
| Astra ISO unpacked glibc/libstdc++ runtime | CTest 20/20; Node 24.21.0 IPC-only addon 14/14 | GCC 8.3 worker/addon, Docker host kernel, no installed OS claim |

The GCC 8 fixture uses the pinned official image digest
`gcc@sha256:1a0bcc0c30351efce55d76fd419dc74aa4d449204e4d66cf86a0ee9bb95a9d61`,
no network or host mounts, 2 CPUs, 4 GiB and 256 PIDs. Exported source tar SHA-256:
`120d093277b57e8dc7f4d71b0a80696e1bf8a80167f0bfd84ede60c438b9fa6b`.
The source/native receipt is the authority if later documentation changes make
the complete tracked-source export differ.

After extending the tests, the RED source-export SHA-256 is
`d541c4e3ce7c348ff75d74fb527a028c238ed8d58df3b7b9075c901ae393a109`;
RED CTest passes 20/20 in 9.84 s and exact GCC 8.3 passes 20/20 in 11.08 s.
MSVC's new clean receipt binds 358 files / 2,015,854 bytes, native source SHA-256
`e8aa806c0bff1ddabf3a83afe108adb566ecc0bfe6d66124e0e7b8a05b421867`.
Worker SHA-256:
`01f77308d61dacf59baccf40c1f70420de44e435fd381b0e162d34047a007eb6`.
Runtime-directory helper SHA-256:
`e190be1ac60afcfd0e367f941d3cfe9713b4827132ab6b56aa1325785cab909f`.
The compatibility README was added afterward; native code/test bytes are
unchanged from this receipt.

Logs retained locally under ignored `build/`: `iteration-407-gcc83-final-build.log`,
`iteration-407-gcc83-final-ctest.log`, `iteration-407-redos73-foundation5.log`,
`iteration-407-windows-foundation3.log`,
`iteration-407-gcc83-compat-extended-{build,ctest}.log`. The private RED host build uses the
user-confirmed SSH key and private directories; credentials are absent from
source, argv, environment and logs. The separately installed user Node 24.21.0
and pnpm 10.11.0 execute on RED OS; this alone is not product acceptance.

Earlier failed controls are retained: missing stop-source possibility tracking,
const temporary-array view conversion, GCC 8's int16 tautology warning and old
glibc thread linkage; GCC 11's nested Catch macro warnings; initial Windows
lifecycle missing TypeScript `dist`; initial full Node run without an explicit
foundation binary directory. No warning policy or test deadline was relaxed.

Full Windows `pnpm check` passes version agreement, TypeScript build, lint,
format and **849 passed / 112 profile-platform skips / 961 total**, zero failures.
It uses the earlier clean MSVC foundation worker from `native-clean-uWYBWe`
(source `88b6395cd70026588dd62ad7e2db3965c3edb93134f340b3b4513568096da9dd`;
worker `693ae02d3563fdf01250fb9de753081770ff77082d0c18388c9adeb47a7dd94c`).
The later native changes extend compatibility tests only; production native
code remains identical. The initial full run lacked the binary-dir setting,
failed with ENOENT and was stopped; its log is retained. Corrected full log:
`build/iteration-407-node-check2.log`, exit 0. This foundation skip count does
not claim execution of linked FreeRDP or audio/clipboard RDP cases.

## Astra ISO and remaining acceptance

The supplied `installation-1.7.5.16-06.02.24_14.21.iso` is 5,117,478,912 bytes,
SHA-256 `91236b4f3373773681da7d89982053ee76bcaba41467178f26a7678c0abaf7ed`.
It identifies as Astra 1.7 x86-64 and contains `astra-version` 8.1.41+v1.7.5.16,
glibc 2.28-10+deb10u2+ci202309131632+astra7 and libstdc++ 8.3.0-6. Seventeen
selected runtime packages have their sizes/SHA-256 checked against the ISO's
package index. A `FROM scratch` image contains only these unpacked packages,
the GCC 8.3 foundation binaries, prepared CMake/CTest and the official Node
24.21.0 archive. With no network, all capabilities dropped, no-new-privileges,
2 CPUs / 2 GiB / 128 PIDs, Node executes and CTest passes **20/20** in 8.46 s.
The original failed shell quoting and guessed installed-version path controls
are retained; the corrected script reads the version from the unpacked package.
Log: `build/iteration-407-astra-runtime-check3.log`; package/hash receipt:
`build/iteration-407-astra-packages.json`.

The GCC 8.3 IPC-only Node addon also builds separately with matching Node 24
public headers. Actual loader output in the Astra fixture selects the ISO's
glibc, libstdc++ and libgcc, without a newer compiler runtime. All **14/14**
unchanged packet-addon tests pass: actual inherited worker handshake, bounded
pair/record limits, malformed and detached-buffer refusal, original deadlines,
readiness, Worker environment retirement and repeated joined descriptor/runtime
cleanup. Expanded CTest then passes **20/20** again in 8.37 s. This addon does
not link or load FreeRDP. Logs: `iteration-407-gcc83-addon.log` and
`iteration-407-astra-addon-check.log`. JS is the current TypeScript build output
copied with its package metadata; no third-party npm modules are needed for this
focused suite.

This fixture does not execute installation scripts or substitute for an
installed OS/kernel/security profile. The host Docker kernel supplies syscalls;
no installed Astra, mandatory access control or certified configuration result
is claimed. The official Node 24 Linux binary has a glibc 2.28 baseline; building
Node itself from source has a newer compiler requirement and is outside the
bridge's GCC 8.3 source floor. [Node 24 upstream migration guidance](https://nodejs.org/en/blog/migrations/v22-to-v24).

The separate offline, binary-cache-disabled private dependency source build
has passed Zlib and OpenSSL and is compiling ICU. Its prepared vcpkg checkout
and exact FreeRDP source commits match the lockfile; there is no completed
dependency-closure or FreeRDP acceptance yet.

Still required: linked FreeRDP and all private dependency rebuilds on the target compiler/runtime;
loader origin/symbol closure; actual installed Astra and RED OS product checks;
actual RDP/input/audio/clipboard regression and CI. The managed-files branch is
separate and unmerged; its kernel-specific safe-open backend also needs actual
Astra kernel coverage. No Stage 0 or distro-support checkbox is accepted here.
