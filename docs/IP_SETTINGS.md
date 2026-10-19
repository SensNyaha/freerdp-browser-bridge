# Target IP-family selection

Implements the existing `target.preferIPv6` / `target.forceIpVersion` fields in
CONFIG_SCHEMA and SPECIFICATION §2.1/2.10; TODO Stage 9 retains broader producer,
dual-stack DNS and actual IPv6 RDP/server acceptance separately.

## Public configuration and compatibility

Only a worker advertising `ipSettings=true` accepts explicitly selected fields.
Old/foundation workers decode false. An explicit false or null is still selected
and refuses with RDP_SETTING_NOT_IMPLEMENTED before CONFIGURE/SECRET on an old
worker. Omitting both fields preserves legacy wire bytes and SDK defaults.

```json
{
  "target": {
    "host": "rdp.example.test",
    "preferIPv6": true,
    "forceIpVersion": 4
  }
}
```

`preferIPv6=true` requests IPv6-first ordering among resolved candidates while
permitting IPv4 fallback. False preserves OS resolver order: it does **not**
force IPv4 or promise IPv4-first ordering. `forceIpVersion=4` / `6` filters to
that family. Null clears the force selection (public SDK value zero). Force
filters apply even when preference is also set; the example above permits only
IPv4. No matching candidate fails connection rather than silently changing
the requested family. Preference affects connection candidate ordering; it does
not constrain DNS queries or add a bridge DNS cache/resolver.

These settings do not change target identity, certificate/SPN policy, auth,
timeouts, Gateway/proxy or reconnect support. There is no arbitrary argv,
alternate target, source-IP selector or system network change. The
[manual form](WEB_CONNECTION_EXAMPLE.md) exposes preference and family controls
with independent capability gating. Its defaults omit both keys; returning to
the default family removes a previous force choice for the next new worker.
Explicit null remains available in the typed public session configuration.
Unknown target settings still refuse.

## Versioned private projection

HELLO schema-1 extension bit 6 (64) advertises `ipSettings`, requiring base
connectCore. Missing bit/suffix means false. Known extension mask is now 127;
unknown bits and inconsistent prerequisites remain errors. Old readers that
reject unknown bits must be upgraded with the worker, as already required by
the [HELLO contract](IPC_FOUNDATION.md).

CONFIGURE schema 12 retains every v11 field and appends three bytes:

| Byte | Meaning | Accepted values |
| ---: | --- | --- |
| 0 | Selection mask | 0..3; flag 1 selects preference, flag 2 selects forced family |
| 1 | Prefer IPv6 | 0 or 1 |
| 2 | Force IP version | 0, 4 or 6 |

Unselected values must be zero; there are twelve canonical combinations,
including the empty no-op. Explicit false is mask 1 / 0 / 0; explicit null is
mask 2 / 0 / 0. A v12 message without appearance selection carries zero/zero
inherited v11 performance bytes. Existing clipboard/flags/media fields and the
2,048-byte settings cap remain. Schemas 1..11 select no IP fields.

The native pre-connect settings owner validates the complete selection and checks
the public setters:
`FreeRDP_PreferIPv6OverIPv4` (BOOL) and `FreeRDP_ForceIPvX` (UINT32). Unselected
settings are untouched. `FreeRDP_IPv6Enabled` is observed client-address metadata,
not a forcing option, and is not used for this mapping. Authority is the pinned
3.32.1 public headers plus its local `libfreerdp/core/tcp.c` candidate ordering /
filtering and `client/common/cmdline.c` public setting selection.

## Verification and authorized lab helper

[Iteration 325](ITERATION_325.md) distinguishes portable wire / synthetic IPC,
public SDK readback, actual Windows native loopback/TLS and actual Windows RDP.
Loopback TLS endpoints do not implement a desktop. IPv6 tests use only ::1 and
skip only when the local listener reports unavailable family/address support.
No external IPv6 destination or DNS infrastructure is used.

```powershell
node scripts/test-rdp-ip-lab.mjs sha256:<approved-session-fingerprint> `
  build/native-clean-EXAMPLE/receipt.json
```

The explicit helper verifies the linked Windows receipt and worker/helper hashes,
then actual version/capability before reading ignored lab credentials. Only the
authorized 192.168.21.149:3389 target is used. Two fixed cases (force IPv4 and
prefer IPv6 with the given IPv4 literal), 5 FPS / 1080p JPEG, heartbeat and joined
PID/runtime cleanup have separate 25-second bounds. Credentials remain private
IPC; JPEG copies are wiped, not saved. No remote application, input, device or
system-setting action is used. Passing preference with an IPv4 literal is not a
measurement of dual-stack DNS ordering or actual IPv6 RDP acceptance.

The separate actual Windows Edge form projection can be checked with:

```powershell
node scripts/test-rdp-performance-form-lab.mjs --ip-test sha256:<approved-session-fingerprint> `
  build/native-clean-EXAMPLE/receipt.json
```

This explicit mode requires both appearance and IP capabilities before reading
credentials. It selects fixed prefer-6 / force-4 fields alongside the existing
appearance overrides, checks exact API/native projection, 1080p JPEG canvas,
heartbeat and form Disconnect. Default helper invocation retains its prior
appearance-only behavior. [Exact scope](ITERATION_326.md).
