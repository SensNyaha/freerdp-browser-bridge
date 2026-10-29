# Managed files

Managed files and redirected sandbox drives are published in **0.6.0** for
all four Node adapters and the standalone server. Ten exact npm packages,
eight fresh public registry projects, final installers and actual public
DEB/RPM HTTP/RDPDR transfers pass their named acceptance. The dedicated
Windows application and Linux RWS1/framed profiles retain exact native bytes.
[Public delivery, profiles and limits](RELEASE_0_6_0.md#public-delivery).

The wider resource/quota/soak and arbitrary server/device matrices remain
open. Managed storage and HTTP transfer do not implement OS file clipboard.
The original source checkpoints below retain their historical test scope.

## File clipboard is deferred

The Node HTTP API explicitly returns **`clipboardFiles: false`** in
`GET /v1/capabilities`. This marks the later file-clipboard capability from
SPECIFICATION 2.7 as deferred. Clients must hide or disable file copy/paste when
this flag is false or absent. It is a public API capability, not a new native
HELLO bit or CLI claim.

Copying files with Ctrl+C in the local file manager and Ctrl+V in the RDP file
manager, or the reverse, is **not implemented**. Selecting `clipboard.files:
true` in any enabled clipboard direction returns HTTP 501
`RDP_SETTING_NOT_IMPLEMENTED` before backend start or transfer of the connection
configuration to that backend. Direct `NativeSessionWorker` selection refuses
before starting the worker. It does not silently select another transport.

Use the authenticated streaming file API and configured redirected drives for
the managed-file workflow described below. Their availability does not enable
CLIPRDR file descriptors/content requests. Text, HTML and PNG clipboard retain
their own capability and direction gates. Future file clipboard still requires
sandbox-backed streaming, policy, bounds and actual bidirectional file-manager
acceptance; this explicit deferral does not remove that requirement.

## Enable from a Node.js application

Enable files only in trusted server configuration. Session JSON cannot set a
host path or enlarge these reservations. The host authentication hook must
return the application's stable principal identifier.

```ts
import { rdpBridgePlugin } from '@freerdp-bridge/api/fastify';

await app.register(rdpBridgePlugin, {
  prefix: '/rdp',
  worker: { workerPath, runtimeRoot },
  authenticate: authenticateApplicationRequest,
  sessions: {
    files: {
      maxTotalBytes: 268435456,
      maxFileBytes: 67108864,
      maxEntries: 1024,
      xrdpLegacyDelete: false,
      transferTimeoutMs: 600000,
      progressTimeoutMs: 30000,
      nativeTimeoutMs: 8000,
    },
  },
});
```

These are the defaults when `files: {}` is selected. Omission disables files.
Byte limits are nonnegative safe integers up to 1 TiB, with file size no greater
than total size. Entry count is 0–65536. Timeouts are 10–600000 ms, with native
timeout at most 30000 ms and `native ≤ progress ≤ transfer`. A zero reservation
does not bypass the corresponding quota.
The worker must advertise the private `fileService` capability. Selection on an
older worker fails before connection credentials are sent. File support reserves
at least 131072 bytes in the worker's IPC write budget. The worker alone owns
the sandbox and the quota ledger; Node forwards blocks of at most 64 KiB.

Configure the host HTTP server and reverse proxy to permit the transfer budget.
Request timeout should exceed `transferTimeoutMs + nativeTimeoutMs + 1000`;
socket idle timeout should exceed `progressTimeoutMs + nativeTimeoutMs + 1000`.
The embedded plugin leaves host timeout settings unchanged. The standalone
server and direct `createSessionServer` apply these budgets when files are
enabled. Disable proxy request buffering and response transformations for these
routes. Mount HTTP/Express/Nest adapters before middleware that consumes request
bodies; verify the application's own middleware and proxy configuration.

The standalone schema also accepts an optional top-level `files` object with
the same numeric fields and optional `xrdpLegacyDelete` boolean. Authentication, target allowlists and session limits remain
required independently. Local Windows/Linux portable candidates now verify
trusted file-policy startup, actual native sandbox initialization, JWT owner
isolation, refusal before certificate approval and joined cleanup. New local
portable candidates also pass complete JWT/HTTP/RDPDR file roundtrips against
Astra and RED OS with their private Node, read-only shares, quotas and joined
launcher cleanup. [Connected-file evidence and transport limits](DEVELOPMENT.md#portable-connected-file-check-and-early-refusal)
remain separate from future public-release acceptance. New local DEB/RPM
candidates also pass the same real file workflow through the installed systemd
service on Astra 1.7.5 and RED OS 7.3, including service-account permissions,
private Node/runtime, configuration restoration and uninstall.
[Installed scope and remaining gates](DEVELOPMENT.md#installed-linux-managed-files-and-program-permissions).

Use the same `sessions.files` policy with every supported Node adapter:

| Application | Trusted configuration | Placement |
| --- | --- | --- |
| [Node HTTP/HTTPS](NODE_HTTP_USAGE.md) | `createRdpBridgeHttp(server, options)` | Dispatch owned requests before the host reads their bodies. |
| [Express](EXPRESS_USAGE.md) | `createRdpBridgeExpress(server, options)` | Mount its middleware at the root before JSON/binary parsers and URL rewrites. |
| [Fastify](FASTIFY_USAGE.md) | `app.register(rdpBridgePlugin, options)` | Use a dedicated prefix; the bridge keeps its own binary stream parser. |
| [NestJS with Express or Fastify](NESTJS_USAGE.md) | `RdpBridgeModule.forRoot(options)` or `forRootAsync(...)` | Let the module install the owned raw-body path before Nest's parsers. |

For each adapter, `options.sessions.files` is the object shown above. Keep the
existing worker, authentication, prefix/origin and session-limit configuration
from its guide. The same relative REST routes and opaque IDs apply beneath the
chosen prefix. The saved native-file integration test covers all five variants,
including the host's independent JSON endpoint. It withholds the rest of a
chunked upload until the first native write is dispatched, so a whole-body
buffering host parser cannot pass as streaming. These are source-checkout
results; use the versioned packaged acceptance when deploying an npm release.

## Requests

Use an application bearer identity for every request, including downloads.
WebSocket attachment tokens and cookies do not authorize this API. The examples
show request shapes; the application supplies its own authentication header.
All paths below are relative to the bridge mount, such as `/rdp`.

| Method and path | Input | Success |
| --- | --- | --- |
| `GET /v1/sessions/:id/files` | Optional `parentId`, `cursor`, `limit` query parameters | `200` page |
| `POST /v1/sessions/:id/files?name=...` | Optional `parentId`; binary body | `201` file |
| `GET /v1/sessions/:id/files/:fileId` | No Range requests | `200` binary attachment |
| `POST /v1/sessions/:id/files/directories` | JSON `{ "name": "reports", "parentId": "..." }`; omit `parentId` for root | `201` directory |
| `DELETE /v1/sessions/:id/files/:fileId` | File or empty directory | `204` |

An entry has exactly these public fields:

```json
{
  "fileId": "6dc67105a85ca27ab0eb8608f169da25",
  "name": "report.bin",
  "kind": "file",
  "size": 1024
}
```

Directories have `kind: "directory"` and size zero. A page is
`{ "entries": [...] }`, with an optional opaque `nextCursor`. Pass that cursor
and the same parent on the next request. `limit` is a decimal string from 1 to
64; the default is 64. Root is represented by omitting `parentId`.

IDs are random, session-scoped locators. They disclose neither a host path nor
the worker's numeric identifier. They confer no authority without the session
owner's identity. The registry holds at most `maxEntries` locators and evicts
the least recently used. A stale locator returns 404; refresh the directory
listing. Do not persist locators as durable application records. Pagination is
not a filesystem snapshot: concurrent changes can affect subsequent pages.

Names are one UTF-8 component of at most 255 bytes. Unicode is supported;
separators, traversal, control characters, Windows device/stream names and
trailing dots/spaces are refused. There is no browser-selected absolute path,
recursive deletion or implicit overwrite. Remove an existing file explicitly
before uploading a replacement with the same name.

## Stream a file

Send `Content-Type: application/octet-stream`. `Content-Encoding` must be absent
or `identity`; multipart, JSON and compressed uploads are refused. URL-encode
the name and parent query values. `Content-Length` is optional; a declared
length must match the actual body. HTTP chunked transfer is supported and is
subject to the same cumulative size and native quota checks.

For example, an application can pass a file stream directly to Node.js fetch:

```ts
import { createReadStream } from 'node:fs';

const query = new URLSearchParams({ name: 'report.bin' });
const response = await fetch(`${base}/v1/sessions/${sessionId}/files?${query}`, {
  method: 'POST',
  headers: {
    authorization: applicationAuthorization,
    'content-type': 'application/octet-stream',
  },
  body: createReadStream(localFile),
  duplex: 'half',
});
if (response.status !== 201) throw new Error('Upload failed');
const file = await response.json();
```

Use a streaming HTTP client on Java, Python, Go or .NET in the same way. Avoid
reading the entire file into a JSON field or byte array. Stream the download
response directly to the application's destination with backpressure. Downloads
carry verified `Content-Length`, `application/octet-stream`, `nosniff` and an
attachment filename with UTF-8 encoding. Range and automatic HEAD downloads
are not implemented. Treat an interrupted download as incomplete.

Only one public file transaction runs per session. Another operation receives
429; use bounded application retries. Uploads stay hidden until their verified
length is committed atomically. Peer disconnect, length/size failure, deadline
or session close cancels an unpublished upload and waits for native cleanup.
Download handles pin file contents until completion/cancellation. Upload
responses close their HTTP connection, including early rejection of an
unconsumed body.

If the file was committed but the response was lost, it remains discoverable
through listing. Blindly retrying the same name can return 409. Unknown native
completion retires the file authority and fails the session; it never grants a
new operation using an uncertain lease or quota refund.

## Errors and current acceptance

Errors use the existing fixed `{ code, message, retryable }` envelope. They do
not echo filenames, paths, credentials or native diagnostics. Principal mismatch
returns session-not-found 404. Important file failures are:

| Status | Codes |
| --- | --- |
| 400 | `FILE_INVALID`, `FILE_SIZE_MISMATCH`; schema failures use `INVALID_SESSION_CONFIG` |
| 403 | `FILE_DENIED` |
| 404 | `FILE_NOT_FOUND` |
| 408 | `FILE_TIMEOUT` |
| 409 | `FILE_EXISTS`, `FILE_NOT_EMPTY`, `FILES_NOT_CONNECTED`, `FILE_UNAVAILABLE` |
| 413 | `FILE_QUOTA_EXCEEDED` |
| 415 | `FILE_CONTENT_TYPE` |
| 429 | `FILE_BUSY` |
| 501 | `FILES_NOT_IMPLEMENTED` |
| 502 | `FILE_FAILED` |
| 507 | `FILE_DISK_FULL` |

For an upload refused during header admission, the API discards a
declared body of at most 4 MiB for at most 250 ms before returning its original
error. It never buffers that body, creates a native upload or expands a quota.
`Connection: close` remains set. This bounded discard reduces the TCP reset
race in which closing over an incoming body loses the last error response
([RFC 9112, section 9.6](https://www.rfc-editor.org/rfc/rfc9112.html#section-9.6)).
Unknown/chunked framing, larger declarations, `Expect`, completed/disconnected
requests and expiration retain immediate refusal; a clean error envelope is
not guaranteed when the peer continues sending after that bounded refusal.
Clients must handle transport failure as well as HTTP errors and must not
blindly repeat a possibly committed upload. Normal admitted uploads retain
their independent streaming/native quota and transfer deadlines.

Tests distinguish synthetic backend faults, actual native filesystem/IPC and
actual RDP. `tests/unit/managed-files.test.mjs` covers ownership, bounds,
deadlines, late completion and cleanup races with synthetic backends.
`tests/integration/files-api.test.mjs` exercises actual HTTP and native file
operations when `BRIDGE_FILE_TEST_BINARY_DIR` selects a matching worker; only
its connected RDP state is synthetic. The tests include peer cancellation,
stalled upload, session close and Fastify parser encapsulation. Existing native
tests cover real bounded disk-full handling; the HTTP 507 mapping currently has
synthetic fault coverage. Real RDPDR, HTTP disk-full and packaged product
acceptance remain separate gates.

Current component checks pass MSVC CTest **25/25**, the focused Windows
file/config tests **27/27**, and the Linux file/protocol/config subset **35/35**.
Linux runs as UID 1000 without capabilities or network; its HTTP tests exercise
framed IPC and RWS1. The retained first Linux run fails only because the isolated
test fixture lacked a `build` temporary directory; the final run uses identical
application/test inputs with that directory created. Logs, input hashes and
scope are recorded in `build/current-validation/managed-files-api-*`.
The final complete Windows `pnpm check` passes **1260 / 71 skips / 1331 total**,
with no failures or cancellations. Its existing linked-RDP regression uses the
accepted 0.5.0 worker; the file tests select the fresh foundation worker
separately. This result does not establish current linked-RDP file acceptance.

## Installed npm consumer checks

After building the bundled native stage and JavaScript packages, run from the
repository root with Node.js 24:

```sh
node scripts/test-managed-files-packages.mjs build/native-stage
```

This packs a fresh local native runtime and installs separate HTTP, Express,
Fastify and NestJS projects from local npm archives. Each project compiles its
own strict TypeScript example with `skipLibCheck: false`. The native file
scenario loads the selected adapter and worker from that project's
`node_modules`, checks a chunked Unicode-named upload before producer EOF,
compares downloaded bytes and headers, refuses another principal, exercises
the host JSON parser, deletes its entries and verifies worker PID exit and an
empty runtime root. NestJS exercises both Express and Fastify; Linux exercises
both framed pipes and RWS1. These are actual native file/IPC checks with
**synthetic RDP state**, separate from real remote-application acceptance.

The four existing `scripts/test-<adapter>-package.mjs` commands also accept
`--managed-files` alongside `--runtime-archive` or `--archives`. This mode is
mandatory by default from product version 0.6.0; historical 0.5.0 checks retain
their original default. Missing native file support fails the selected check.
For a pre-release development candidate whose source metadata still says
0.5.0, select the mode explicitly and supply its own local native archive.
Published 0.5.0 remains unchanged and does not gain managed files.

The bundled-runtime CI workflow now invokes the complete command on Windows
and Linux. Local results and pending release gates are recorded in
[development](DEVELOPMENT.md#installed-package-checks). Configuring the workflow
does not establish a successful hosted CI run or published-artifact acceptance.

## Actual HTTP and Astra RDP composition

The unchanged production Fastify server, authenticated REST routes,
`NativeSessionWorker` and managed RDPDR provider now pass one complete named
Astra XRDP/FUSE scenario with a Windows worker and with the GCC 8.3 Linux worker
through both RWS1 and framed IPC. The trusted host enables the documented
`xrdpLegacyDelete` policy. A real control WebSocket accepts only the previously
approved certificate fingerprint; RDP state and file replies are not synthetic.

The scenario uploads seed files through HTTP, reads them through redirected
shares on Astra, creates/writes/truncates/renames a **65599-byte Unicode file**
on the remote side and downloads it through its HTTP opaque ID. The download
verifies exact binary bytes and attachment/content-length/type/nosniff headers.
A **131111-byte chunked HTTP upload** is then read on Astra. Remote file and
directory removal is visible in subsequent HTTP listing; downloading a deleted
file's cached locator returns fixed `FILE_NOT_FOUND`. A different authenticated
principal receives session-not-found, and an unauthenticated request receives
401. Three remote mutation attempts through the read-only share fail while its
seed stays intact. HTTP session deletion joins worker/runtime cleanup and the
unique remote shares disappear.

These are real loopback HTTP and network RDP checks, not browser file-selection
or installed-product acceptance. They add no production source/binary changes
after `d6df964`. Logs, helper inputs and binary/source bindings are in
`build/current-validation/managed-files-http-rdp-acceptance.json`. Windows-server,
complete resource/isolation and packaged npm/standalone matrices
remain open. The earlier synthetic-RDP HTTP tests above retain their original
scope and continue covering cancellation, deadlines and backend faults.

## Windows namespace deletion

The Windows deletion implementation uses `FileDispositionInfoEx` with POSIX
semantics on an already verified DELETE handle. Closing it removes the name;
an independent shared-delete reader can retain its existing data handle.
[Microsoft's disposition contract](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/ntddk/ns-ntddk-_file_disposition_information_ex).
The worker's own IO/anchor sharing and sandbox download/drive pins still deny
unauthorized deletion. Readonly is not ignored and the mapped-image check is
retained. Only an unsupported extended selector falls back to the legacy class;
denied, busy and IO failures do not select a weaker operation.

A named Windows HTTP stress observed system error 145 (`ERROR_DIR_NOT_EMPTY`)
after successful POSIX file disposition, with zero visible logical children
and no test file in an immediate physical snapshot. For this directory-only
case, the candidate inspects the same held directory using the existing bounded
enumerator. If it is empty, it can yield and attempt disposition again, at most
**eight additional attempts**, checking a **2 ms monotonic deadline** before
each further attempt. A visible child, malformed/failed enumeration, another
error or an expired bound stops completion and preserves the failure. Kernel
IO itself remains subject to the existing native operation/retirement deadline.
There is no pathname reopen, recursive/child deletion, HTTP transfer retry,
quota refund before success or timeout extension.

The shared-delete regression passes **22 assertions / 1 case**; pure controls
for visible/unknown children, failure classes, files and exhausted attempt/time
bounds pass **67 / 3**. The original 80 Fastify sequences and five server
adapter cases pass **85/85** without HTTP deletion retries. The saved adapter
test streams **131111 bytes** in chunks, verifies exact download bytes/headers,
Unicode names and opaque IDs, rejects a foreign principal, exercises the host's
own JSON parser and joins session/runtime cleanup. Linux runs all five adapters
through both IPC transports; its broader named subset passes **100 / 4 skips /
104 total**. Only RDP connection state is synthetic in these adapter tests.
The subsequent test-only first-chunk barrier and explicit PID-exit assertions
pass Windows **5/5** and Linux **10/10**; other production/native inputs are
unchanged from the broader check above.

Windows native CTest passes **25/25 + 42/42**, GCC 8.3 **25/25 + 43/43** and
ASan/UBSan **4/4**. Full Windows workspace check passes **1285 / 73 skips /
1358 total**. Earlier failures and temporary kernel diagnostics remain as local
evidence; the diagnostic code is removed. These local results do not establish
the pending Astra/RED OS component, actual RDP-server or packaged feature
matrix. The candidate remains on `fix/windows-managed-delete` until those
required checks can run.

## Two-server session isolation

A named production HTTP/RDP scenario now connects two sessions simultaneously
to Astra 1.7.5 and RED OS 7.3. Windows framed IPC and GCC 8.3 Linux framed/RWS1
each pass. Separate application principals own separate workers, sandboxes,
opaque IDs and **262144-byte quotas**. Admission of a third session returns
`SESSION_LIMIT` without starting another worker. The host explicitly enables
`xrdpLegacyDelete`; this does not change the strict default.

Session A performs remote Unicode/binary CRUD and HTTP readback. After holding
196710 bytes of test payload, its next 196608-byte upload receives actual
native quota refusal and HTTP `FILE_QUOTA_EXCEEDED`; existing content remains
readable and the failed upload is absent. Session B still accepts its own
196608-byte file. Those payload counts exclude the small seed files. Each
foreign principal receives session-not-found; copying a file ID into the other
session returns file-not-found.

The helper then kills only A's worker after verifying a native 32768-byte write
to an unfinished HTTP upload. The upload terminates with **502 `FILE_FAILED`**,
and A reports `WORKER_FAILED`. Joined native cleanup removes A's runtime and
redirected shares, revokes its old file authority and returns session capacity.
The live Node server admits a replacement **actual RDP connection** while B
remains connected. B's exact binary content is read through its real remote
drive before the crash, after it and after replacement. Final HTTP close joins
all three worker lifetimes and verifies empty runtime storage and disappearance
of all unique redirected shares.

Both connections use real certificate prompts with exact fingerprint matching.
Astra uses the previously user-approved pin. RED OS's public certificate was
read over its previously approved, pinned SSH host key; its SHA256 fingerprint
is then pinned for RDP. No private key, accept-all certificate policy, synthetic
RDP state or direct file-command shortcut is used. SSH performs only test-owned
file operations through the existing redirected drives; it does not replace
HTTP or RDP transfer.

The final profiles cover **9 actual connections**, two concurrent per profile;
an earlier passing Windows run is retained separately. No production/native
change follows `346b040` / `f641efd`. Source, built-client/archive, binaries,
helper inputs, terminal records and cleanup bindings are in
`build/current-validation/managed-files-isolation-acceptance.json`.
This establishes the named quota/namespace/crash/replacement scenario, not
Windows RDP-server, complete share-policy/resource, CPU/RSS/latency, file
clipboard or packaged npm/standalone acceptance. Windows here names the worker
OS; both RDP servers in this checkpoint are Linux.

## Bounded HTTP disk-full acceptance

`tests/integration/files-disk-full.test.mjs` adds real Linux HTTP/native ENOSPC
coverage through framed IPC and RWS1. It requires an explicitly provisioned,
disposable tmpfs of **128 KiB to 1 MiB**, selected by
`BRIDGE_FILE_TEST_FULL_ROOT`, and a matching worker selected by
`BRIDGE_FILE_TEST_BINARY_DIR`. Missing opt-in skips the cases. A different
filesystem, a larger mount, a symlink or a noncanonical/relative root refuses
before creating a runtime directory. The test never creates mounts, changes
permissions or fills the ordinary temporary directory.

For example, inside an isolated Linux test container with a fresh 1 MiB tmpfs
mounted at `/diskfull` and the current native binary directory at `/native`:

```sh
BRIDGE_FILE_TEST_BINARY_DIR=/native BRIDGE_FILE_TEST_FULL_ROOT=/diskfull \
  node --test --test-concurrency=1 tests/integration/files-disk-full.test.mjs
```

The Linux foundation CI jobs provision that bounded private tmpfs and run both
cases after the ordinary checks, then unmount it. This wiring is configured;
the current acceptance below is the local isolated GCC 8.3 run, not a claim
that the changed hosted workflow has already executed.

Each transport attempts twelve 2 MiB uploads against a real 1 MiB tmpfs, with
an 8 MiB native total quota and 4 MiB file quota. Every attempt receives an
actual native disk-full result while measured free space is exhausted, followed
by HTTP **507 `FILE_DISK_FULL`** and joined abort. Listings and staging stay
empty and free space returns. Confirmed successful native writes across those
failed transfers exceed the total quota; repeated physical failures therefore
cannot silently consume quota. A fresh 64 KiB upload/download/delete, heartbeat
and joined empty-runtime session close then pass. RDP state is explicitly
synthetic; this is separate from the real-server scenario above.

Both cases pass on the actual GCC 8.3 Linux worker. The ordinary Linux
file/HTTP/runtime subset passes **71 / 3 skips / 74 total**; two skips are these
opt-in cases. Windows HTTP regression passes **8 / 2 skips / 10 total** using
the shared unchanged native file fixture. Negative configuration control
confirms that a non-tmpfs root is refused without changing its entries.
Production/native sources and binaries remain those accepted at `f641efd`;
the earlier full `pnpm check` retains its original scope. Exact test source,
client archive, binary and log bindings use
`build/current-validation/managed-files-http-full-acceptance.json`.
Windows disk-full, actual connected-RDP disk-full and packaged acceptance remain
separate gates.

## Native drive backend in development

`ScopedSandbox` and `DriveSession` now implement the native storage backend for
the upcoming RDPDR adapter. They use the same `FileService` owner and quota as
HTTP. They are internal C++ interfaces; no new public capability, session JSON
selection or redirected disk is enabled by this component alone.

A share pins its logical root directory. It cannot resolve or mutate another
subtree, remove/rename its own root or upgrade read-only policy. Every final
operation rechecks membership while holding the sandbox mutex: an ID resolved
before another authorized operation moves it outside the share is refused.
Unpublished HTTP uploads remain hidden. Share pins and directory/file views
consume the existing bounded native view budget and must close before cleanup.
Owner retirement refuses further operations, including through retained scopes.

`DriveSession` reserves at most 128 open handles across at most 32 shares. It
keeps access/share modes and delete-pending state common to all aliases of a
native file. Handles are monotonic and device-bound. Creation, opening,
overwrite, binary read/write, resize, bounded listing, rename and deletion on
the last close use the scoped owner. Rename refuses conflicting live views;
it closes/reopens its own view around the native atomic namespace operation.
Recursive/root deletion is refused. An HTTP download pin blocks drive writes
and resize until its stable download closes.

A pending deletion retains the share that authorized it. If an existing
read-only alias is the last closer, the backend applies that earlier writable
grant; it does not elevate the read-only alias's own permissions. Native
refusal preserves the known entry and charge. Retirement closes outstanding
handles/pins without guessing that a pending physical deletion succeeded.

Actual filesystem component tests pass **3096 assertions / 42 cases** on MSVC,
and **2640 / 44** on GCC 8.3, Astra 1.7.5/kernel 6.1.50 and RED OS 7.3/kernel
6.1.180. RED OS compiles with its native GCC 11.4.1; Astra runs the exact GCC 8.3
SDK-built binary. Full native CTest passes **25/25** on MSVC and GCC 8.3;
ASan/UBSan file and IPC checks pass **2/2**. Native tests include concurrent
HTTP/drive quota growth and alias writes. Logs/source hashes are retained under
`build/current-validation/managed-drives-backend-*`. These results do not prove
FreeRDP device registration, wire IRPs, remote application CRUD or installed
product behavior; those remain required before Stage 7 acceptance.

The final Windows workspace check also passes **1260 / 71 skips / 1331 total**.
Existing linked-RDP regression uses accepted 0.5.0; fresh foundation file tests
are selected separately. The rebuilt Linux worker/packet-adapter pair passes
the unchanged HTTP/file/protocol/config subset **35/35**, including both
transports. Completed platform payloads are removed through exact owner/hash
inventories; logs and receipts remain local. Source/binary/log bindings are in
`build/current-validation/managed-drives-backend-acceptance.json`.

## RDPDR codec and public SDK adapter in development

The next internal component implements a bounded RDPDR request codec and a
`DEVICE`/`IRP` adapter against the pinned FreeRDP 3.32.1 public headers. It is
now installed by `Connection` when explicitly selected through the private
managed-drive capability and initialized file owner. The public `drives`
capability remains false pending remote application acceptance.

### Runtime selection in this development branch

The trusted host must enable `sessions.files` (or the native adapter's `files`
policy). A session can then select only relative paths inside its own managed
file namespace:

```json
{
  "redirection": {
    "drives": [
      {
        "name": "Documents",
        "source": { "kind": "session-sandbox", "subdir": "documents" },
        "readOnly": false
      }
    ],
    "thinclientDrives": [
      { "name": "ReadOnly", "subdir": "readonly", "readOnly": true }
    ]
  }
}
```

Both selections share the same owner, quotas and handle registry; the alias
does not introduce another protocol. Setup creates missing logical directories
within the reserved entry quota. Names are ASCII, at most 64 bytes; their
case-insensitive seven-byte DOS prefixes must be unique; the eighth
PreferredDosName byte is the required NUL terminator. The full configured
ASCII name is retained separately in terminated DeviceData, matching the
pinned FreeRDP drive plugin.
Use names of at most seven ASCII bytes for a portable UNC alias across
servers that expose only PreferredDosName. Subdirectories use
portable ASCII components, at most 253 bytes / 31 levels. File names inside
the shares retain Unicode support. Host-path sources and other device types
are refused by this runtime selection.

The managed loader leaves `RedirectDrives` false: the generic SDK flag would
otherwise add an implicit host-media drive. It suppresses generic-loader
side effects from network-feature flags only during loading, then restores
their original values. A selected drive also loads guarded `rdpsnd`: Windows
requires that channel before it communicates on RDPDR
([MS-RDPEFS Appendix A, note 1](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-rdpefs/fd28bfd9-dae2-4a78-abe1-b4efa208b7aa)).
With output audio off, this companion offers zero audio formats and owns no
sample queue, codec or IPC publisher. It opens no host sound backend. With
selected audio, the existing guarded capture owner supplies the dependency.
No implicit `sys:fake` audio channel is added. Real SDK loader,
strict-TLS rejection and cancellation checks use synthetic server fixtures;
they do not establish actual RDP file CRUD or installed-product acceptance.

The Windows compatibility candidate accepts a zero-length CREATE path only
as the exact managed root, retaining terminated-path validation for nonempty
names. It also accepts `FILE_OPEN_NO_RECALL` on ordinary private managed
files: no offline-storage/virtualization recall provider exists in this
backend. This grants no rights and does not enable backup or by-ID opens.
Windows DeleteFile uses `FILE_OPEN_REPARSE_POINT` (`0x00200040` with
non-directory selection); this is accepted for ordinary managed entries.
The retained-root resolver still refuses actual symlink/junction/reparse
objects and traversal. Delete access and read-only policy remain independently
enforced. The captured Windows .NET read uses CreateOptions `0x00400064`;
its regression fails before this change and checks RW/RO reads plus retained
bypass refusals. A separate DeleteFile regression proves RO denial, RW
delete-on-close, no implicit data-read grant and traversal refusal.

Device-name compatibility is distinct from Unicode file-content/path support.
The pinned SDK publishes narrow DeviceData for drives. An experimental
UTF-16LE announcement failed Windows UNC name resolution and is not retained.
The current [MS-RDPEFS v2 Unicode-name wording](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-rdpefs/d8b2bc1c-0207-4c15-abe3-62eaa2afcaf1)
and that SDK representation are a recorded conformance gap, not a claim of
arbitrary-server/name compatibility. Configured share labels remain bounded
ASCII; names of files inside the shares retain Unicode support.

### Actual XRDP interoperability checkpoint

The Windows worker now reaches the actual Astra XRDP/FUSE mount
(`xrdp 0.10.6-0astra2b1`) and verifies
owned binary/Unicode creation, read/write, truncate, rename, directory creation
and both native-file-service transfer directions. The test writes 131111 bytes,
truncates to 65599 and verifies the resulting bytes through the native download
path. Read-only creation, writable open and removal are refused. Worker shutdown
removes its owned runtime and the two uniquely named remote shares.

This exposed two client issues now corrected. SVC polling must use its own
callback clock: mixing Windows `GetTickCount64` with `steady_clock` can appear
to move backwards and terminate the channel. `StaticGate::poll()` now obtains
time from the same injected clock as callbacks. A failed clock refuses safely.
XRDP's ordinary CREATE mask `0x0016019f` includes `WRITE_DAC`; this hint is now
recognized, like `READ_CONTROL`, without granting file data or basic metadata
mutation through that bit. Host ACLs remain fixed, security IRPs unsupported,
and `WRITE_OWNER` / SACL privilege requests refused.

Full remote CRUD is **not accepted yet**. The observed XRDP removal sequence
opens with `0x00100080` (read attributes and synchronize), then requests delete
disposition without `DELETE`. The same sequence is present in
[upstream XRDP 0.10.6.1](https://github.com/neutrinolabs/xrdp/blob/v0.10.6.1/sesman/chansrv/devredir.c#L1644).
The strict managed profile correctly refuses it and preserves the file. Any
interoperability mode must be an explicit trusted-host policy, retain all
read-only/scope/sharing/quota/download-pin checks, and pass its own acceptance;
it must not silently grant delete rights to all attribute-only handles.
That policy and full application/delete acceptance remain to be implemented.

The codec handles create/open, close, binary read/write, directory enumeration,
query information/volume, rename, resize and delete disposition through the
same scoped `DriveSession`. UTF-16 paths are checked before native resolution;
one device-relative root separator is accepted, while UNC paths, drive letters,
traversal, malformed Unicode and alternate streams are refused. Requests and
replies are bounded to a 1 MiB transfer plus fixed protocol overhead. A read
fills the requested bounded size or reaches an actual EOF/error; native IO
still uses blocks of at most 64 KiB. Append-only handles append atomically under
the shared owner mutex and do not gain read/truncate access. Metadata-only
handles do not gain file data access. Capacity exhaustion is distinguished from
quota/disk-full refusal.

Directory responses use the packed RDPDR layouts, including the 93-byte
`FileBothDirectoryInformation` header. Rename uses the six-byte RDPDR prefix.
Continuation queries ignore their unused path fields. Enumeration owns a fixed
128-slot table and scans bounded native pages; `*` and `?` match Unicode scalars
with the backend's case policy. DOS wildcard expressions are not implemented.
The request layouts follow Microsoft's [create request], [directory query] and
[rename information] definitions, checked against the pinned SDK headers.

The SDK adapter binds registration to one context and serialized RDP thread,
requires synchronous channels, and owns callback storage through the SDK's
final `DEVICE::Free`. Its loader override supplies a typed refusal for invalid
drive selectors instead of falling back to an arbitrary drive plugin. The
receive guard validates fragment size/count and a nonrenewable ten-second
assembly deadline before delegation to SDK reassembly. Its integration point
must be installed before SDK allocation and polled by the runtime event loop;
that runtime wiring is still pending.

The outbound SVC wrapper is now implemented as a separate component
([details below](#bounded-rdpdr-svc-component)). Remaining requirements before
activation include private configuration/capability wiring,
managed-content orphan recovery and actual remote application CRUD. Basic
timestamp/attribute handling is now implemented in the session VFS
([details below](#session-file-metadata)). Write-through/no-buffering flags,
locks and notifications currently return unsupported.
These limitations require implementation or explicit product-level acceptance
before the complete redirected filesystem can be claimed. They are not hidden
behind successful replies.

[create request]: https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-rdpefs/5f71f6d2-d9ff-40c2-bdb5-a739447d3c3e
[directory query]: https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-rdpefs/458019d2-5d5a-4fd4-92ef-8c05f8d7acb1
[rename information]: https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-rdpefs/ae902739-950b-4549-8a11-ce0f487b3c14

## Bounded RDPDR SVC component

`StaticGate` wraps the pinned public static-channel ABI before
`VirtualChannelWriteEx` can enqueue a message in the SDK. It requires one
serialized owner, synchronous channels, no automatic RDP reconnect and a static
drive-only device collection. It refuses mixed device services and dynamic
drive enumeration. The managed provider refuses the RDPDR static addin unless
this gate is supplied; the `drive` device factory remains context-bound.
No arbitrary addin arguments are forwarded.

The fixed write ledger admits at most **64** outstanding writes and
**8 × (1 MiB + 20 bytes)** of their allocated stream capacity. A single packet
can contain at most **1 MiB + 20 bytes**. The larger capacity of a reused SDK
stream is charged even when its current payload is shorter; each stream's
capacity also has an independent hard bound. This budget describes queued
stream storage, not total worker RSS or the filesystem quota.

Host completion tickets increase monotonically and never reuse an upstream
stream address. The gate checks the channel, ticket, size, total and flags before
returning credit. Old/duplicate or malformed callbacks cannot release another
write. A ten-second absolute deadline belongs to each outstanding write; later
traffic does not extend it. Failure and retirement stop new admission while
retaining existing debt. Known completions/cancellations still join after a
failure. The complete borrowed allocation is wiped before the SDK releases it.

A definitive host refusal returns the buffer to its caller. An exception after
an unknown handoff retains the buffer and reports a terminal channel fault;
returning a second-free error would be unsafe. Final host `Terminated`, after
the pinned host queue has joined, cancels any remaining uncertain borrows before
releasing the SDK plugin/pool. Closing the loader does not end these callback
lifetimes. A refused channel close can be retried without repeating the SDK's
disconnect cleanup. Final termination may run on the joined context-destruction
thread.

Ingress validates fragment count/length and the assembly deadline before SDK
allocation or growth. The wrapper clears the SDK's returned stream cache only
when its public used count is zero, no write remains borrowed and no callback
is active. At most 64 complete inbound messages may be delegated between such
idle points, so control packets without replies cannot grow that cache without
bound. It uses public WinPR stream/pool APIs, without the private RDPDR plugin
layout. These limits also require periodic runtime `poll`; that event-loop
wiring remains pending.

Component tests cover ledger overflow, reused stream addresses, bad completion
metadata, late deadlines, inline completion followed by failure, uncertain
handoffs, close retry, reentry, profile refusal and joined final termination.
The linked test also runs the **actual pinned RDPDR plugin**, its handshake,
managed device factory and create/write/read/close IRPs against real owned
storage, including repeated varying-size writes and pool trimming. Its host SVC
and server packets are synthetic. It does not prove a network RDP session or
installed product. IO capability filtering and basic metadata support are now
implemented as described below. Runtime selection, orphan recovery and remote
application acceptance remain open.

## Session file metadata

Basic file metadata is **session-owned VFS state**. It is shared by HTTP-backed
file views and all managed-drive aliases, keyed by the same verified entry ID.
Creation initializes four UTC FILETIME values. A nonempty read updates access
time; a completed or partial write updates write/change time and archive state.
Resize updates these values if the actual length changes. Namespace changes
update directory write/change time and rename preserves the entry's creation,
access and write values. Explicit setters preserve the exact admitted ticks.
Readback, file queries and packed directory listings use this common state.

The fields follow Microsoft's [basic information] and [FILETIME convention].
Zero setters preserve their fields. The `-1` and `-2` controls disable and resume
automatic updates for the requesting drive handle; other handles retain their
own behavior. Invalid negative values are refused before any metadata changes.
Both the 36-byte RDPDR body and a 40-byte body with an ignored reserved field
are bounded and validated. This changes no private file IPC layout or public
HTTP response schema.

Supported [DOS attributes] are read-only, hidden, system, directory, archive,
normal and temporary. Directory kind cannot be changed by an attribute setter;
normal clears the optional bits and an existing directory retains its kind.
Reparse, sparse, compressed, encrypted and other unsupported flags are refused.
Only `FILE_WRITE_ATTRIBUTES`, generic-write/all or the writable share's maximum
allowed access can set basic information. `WRITE_EA`, `DELETE_CHILD`, read
attributes and delete access alone do not confer this permission. Read-only
shares cannot mutate metadata. A download pin blocks metadata changes until it
closes.
`MAXIMUM_ALLOWED` is selected by the drive backend after resolving the entry,
not from share policy alone. A read-only share grants data read only. For an
existing read-only entry on a writable share, it grants data read and virtual
basic-metadata write, without data write/append, rename or delete authority.
That metadata permission may clear the virtual read-only flag, but the handle's
original reduced grant remains fixed; a fresh open is required to obtain write
access. Explicitly requested forbidden rights still refuse the open even when
combined with `MAXIMUM_ALLOWED`. Sharing checks use the actual selected grant.

This follows the distinction between maximum and explicitly requested rights
in Microsoft's [existing-file access algorithm][maximum access], limited to the
bridge's supported virtual rights. It is not a host ACL implementation. The
bridge's separate protection of a read-only entry against rename/deletion stays
stricter: maximum access cannot confer that authority while the flag is set.
Download pins still block metadata changes. A read-only directory's own grant
does not prohibit a separately authorized child creation through a writable
share; read-only shares continue to deny every mutation.

Two wire regressions fail against the preceding backend and pass after the
change, including unchanged quota, overwrite/delete-on-close refusal, sharing,
download pins and immutable rights after metadata changes. A separate public
FreeRDP DEVICE/IRP case exercises the same file IO and refusal boundary. These
are component tests; the subsequent actual Astra HTTP/RDP runs verify general
regression, not that XRDP generated `MAXIMUM_ALLOWED`. Windows-server and
packaged read-only acceptance remain required before the feature gate closes.
[maximum access]: https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-fsa/82b364ce-6d7b-422f-8d88-4db32eea809a

A read-only file refuses data mutation even through a writer opened earlier,
and cannot be renamed, deleted or replaced through a drive or the native HTTP
owner. An authorized metadata handle can clear that flag. A directory's
read-only flag protects the directory entry; it does not prohibit creating
children. Hidden/system/temporary are descriptive flags for the remote client,
not authorization or a promise of a host storage/cache mode. Verified owner
cleanup can reclaim known read-only entries after all producers and views join.

These timestamps/flags intentionally describe the virtual session filesystem.
They do not set host `chmod`, Windows ACLs/attributes or host atime/mtime/ctime.
They remain in the bounded in-memory namespace while its owner is alive. They
are not a persistent metadata store, backup format or crash recovery journal.
The unaccepted orphan-recovery path continues to retain unknown contents; it
does not reconstruct or silently discard this metadata.

The SVC wrapper now narrows the SDK's generated GENERAL capability set to
create, close, read, write, query information, set information, query volume
and directory control, intersected with the SDK/server-selected bits. It clears
reserved operation fields and pipelined asynchronous IO, validates the whole
GENERAL/DRIVE capability record before changing it, and adds no unsupported
operation. This does not activate the public `drives` capability.

[basic information]: https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-fscc/16023025-8a78-492f-8b96-c873b042ac50
[FILETIME convention]: https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-fscc/a69cc039-d288-4673-9598-772b6083f8bf
[DOS attributes]: https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-fscc/ca28ec38-f155-4768-81d6-4bfeb8586fc9


## XRDP legacy delete policy

Some XRDP servers use metadata-only handles for unlink/rmdir, omitting DELETE
access, and abandon the successful mkdir handle without sending CLOSE. The
strict default refuses the first sequence and retains live handles for the
second. These behaviors were observed on Astra's XRDP 0.10.6-0astra2b1 and are
also visible in the [XRDP 0.10.6.1 implementation](https://raw.githubusercontent.com/neutrinolabs/xrdp/v0.10.6.1/sesman/chansrv/devredir.c).

For this peer profile, trusted application configuration can set
`sessions.files.xrdpLegacyDelete: true`; standalone uses top-level
`files.xrdpLegacyDelete`. It defaults to false, must be a boolean and cannot be
selected by session JSON. The worker must advertise private HELLO extension
4096 in addition to the managed-drive prerequisites. Unsupported workers fail
before file initialization and credentials. The native file owner captures
this policy once; subsequent sessions/requests cannot change it.

The unlink exception requires desired access `0x00100080`, options `0x20`,
OPEN disposition, shared read/write/delete, zero allocation and zero attributes
on a writable share. The handle remains metadata-only: it gains no data,
resize, basic metadata, rename or security operation. Only disposition can
use this compatibility grant, with the existing root, read-only file/share,
nonempty-directory, sharing and native pin checks still enforced.

After a successful nonzero legacy disposition, this device may join a
never-used handle for the same entry from the exact XRDP mkdir sequence:
desired access `0x0016019f`, directory/synchronous options `0x21`, CREATE,
zero allocation, shared read/write/delete, and directory attributes with an
optional read-only flag. Any subsequent request using that creator's FileId
makes it an ordinary live handle, even when the request is refused. Other
selectors, devices/aliases and active handles retain normal last-close
ownership. The removed creator FileId becomes invalid and is never reused;
this is an explicit peer compatibility rule. The deleting handle remains open
until the peer sends its real CLOSE. This prevents the abandoned mkdir handle
from keeping an otherwise deleted directory permanently pending. The total
128-handle reservation remains binding; no unbounded tombstone table is added.

Wildcard directory scans return a virtual self entry `.` after their children,
including for an empty directory. No parent entry, native file, extra handle
or quota charge is created; HTTP listings remain unchanged. Initial filters
with no match still return NO_SUCH_FILE, and exhausted continuations return
NO_MORE_FILES. Paths containing traversal remain refused.

The current Windows worker and Linux worker (RWS1 and framed IPC) pass owned
real RDP/FUSE CRUD on Astra with this policy: Unicode file creation, 131111-byte binary write/read, truncate to
65599 bytes, rename into a newly created directory, native download, native
131111-byte upload read back through RDP, file/directory deletion, empty final
listing and an intact read-only seed. The same binary separately passes the
strict-default refusal control and joined cleanup; both unique shares vanish
from the remote mount. Evidence is retained in
`build/current-validation/managed-drives-legacy-delete-astra-final.log` and
`managed-drives-legacy-delete-strict-final.log`. Linux evidence is in
`managed-drives-legacy-delete-linux-rws1-astra-final.log` and
`managed-drives-legacy-delete-linux-framed-astra-final.log`; source/binary
bindings are in `managed-drives-legacy-delete-acceptance.json`.
The first Linux harness attempts lacked Docker init and correctly failed the
worker's PID-1/parent-death guard before connection; final runs use `--init`
and retain the same source and binaries. Windows-server, full HTTP/RDP
composition, orphan recovery, installed product and file clipboard acceptance
remain open.


## Dead-owner managed-file recovery

The native service now declares its disposable `.data`/`.uploads` trees using
private, directory-identity-bound metadata outside the logical file namespace.
The verified recovery helper can reclaim those trees after both owner and
worker leases are absent. It rejects unknown runtime siblings before any
managed-file deletion, and revalidates a complete bounded inventory before
applying it. A missing declaration never authorizes importing or deleting an
older nonempty container. Graceful shutdown removes the declaration with its
known contents; parent-only death retains native self-cleanup.

This is deletion of expired session content, not restoration of sessions,
opaque IDs or VFS basic metadata. The [recovery contract](RUNTIME_RECOVERY.md#claimed-managed-file-trees-unreleased)
defines the format, limits, lease checks, partial states and current tests.
Automatic live-Node retirement now joins that helper after worker/IPC/probe and
session-endpoint closure, revalidating the startup cohort. Actual registry tests
confirm capacity stays held past manager deadlines until native cleanup joins;
unknown content and mismatched helpers retain files and the slot. HTTP lost
completion tests use actual native files with synthetic RDP state. Separate
Windows/Linux-worker to Astra XRDP connected-crash runs confirm reclamation,
old authority refusal, Node survival and disappearance of owned remote shares.
[Retirement contract and limits](RUNTIME_RECOVERY.md#automatic-worker-retirement-with-a-live-node-server).
Full HTTP/real-RDP, Windows-server and packaged feature acceptance remain open.
