# Iteration 195 — inherited Linux packet worker activation

2026-10-14. Implements Stage 1 / ARCHITECTURE sections 2–3 by accepting only the
fixed private switch `--ipc-seqpacket-fd=3` on Linux. It selects a connected
AF_UNIX SOCK_SEQPACKET inherited descriptor and reports `unix-seqpacket-rws1`
in the actual HELLO reply. No credentials/configuration/FreeRDP arguments are
accepted on argv. Default worker invocation, CLI and Node supervisor still use
`framed-pipes`; Node primary transport activation remains a required next gate.

The existing Linux priority dispatcher/writer now optionally sends RWS1 chunks
with the tested `af8aacd` endpoint, keeping the same fixed lanes, producer credit,
writer thread, output deadline and finite drain/cancellation policy. A cancelled
packet write is never retried. Receive checks the first inner header before body
allocation and copies borrowed physical chunks into the existing RWI1 parser.
Idle receive polls also observe output failure and the signal-safe parent-loss
flag, allowing owned teardown without new incoming messages. Producers retire
before output drain; private receive scratch and existing secret payload copies
are wiped by their respective owners.

Actual kernel-socket / process fixtures include 100 sequential linked workers,
HELLO/heartbeat/shutdown and removed runtime marker/directory; malformed carrier
and partial EOF; cancellation while idle; paused-parent output/12,000-heartbeat
flood that exits with code 2 before forced-kill fallback; and a stalled maximum
frame whose writer cancels before owner destruction. These are native lifecycle
tests, not actual connected RDP or lost remote input release acceptance.

Verification:

- Linked Release and portable ASan/UBSan packet-worker fixtures: **5 cases /
  929 assertions**, including 100 sequential workers and bounded output flood.
- Full linked Linux CTest **24/24**, portable sanitizer CTest **12/12** using
  the documented local non-PIE workaround.
- Full Linux Node check **453 passed / 75 skipped / zero failures**, 528 cases;
  the existing Node framed-pipe supervisor remains in use.
- Windows foundation CTest **11/11**, linked CTest **23/23**. The first Node
  check selected foundation: **497 passed / 31 linked-only skipped**, no failures.
  The separate linked-worker Node check passes **528/528**, no skips/failures.
- Linux canonical relocation **1/1**, pre-package ELF **33 files / 268 edges**,
  independent UID1000/read-only/no-network/init/cap-drop TGZ smoke passes with
  six private modules, three lifecycle replies and owned cleanup.

Updated TGZ SHA-256:
`2e67d6e1f49f19177e1de72fe3fb018419a06189d323be658131b4c80cc769bf`,
24,754,170 bytes, excluding Node.js. The direct linked fixture initially exited
127 without the SDK library search context. Repeating it with the same scoped
private-prefix LD_LIBRARY_PATH already configured for CTest passes; installed
and independent runtime probes use their own RPATH, without that SDK context.

A temporary IPC-only N-API socketpair probe confirmed that Node 24 `net.Socket`
rejects a packet descriptor with `ERR_INVALID_FD_TYPE`. It resides only in ignored
build files and loads no FreeRDP/WinPR. The required Node transport therefore
needs an IPC-only native adapter, retaining all RDP code in the worker.
Local logs: `build/iteration-195-*`.
