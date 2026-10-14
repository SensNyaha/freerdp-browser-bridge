# Iteration 197 — evented Node packet readiness and async cleanup

2026-10-14. Continues Stage 1 readiness ownership after the prepared IPC primitive
`6bd1284`. Public installed Node24 headers are authoritative for N-API/libuv
signatures. libuv requires polling to stop before descriptor closure; asynchronous
environment teardown must join native handles.
[libuv poll contract](https://docs.libuv.org/en/v1.x/poll.html),
[Node cleanup API](https://nodejs.org/api/n-api.html#napi_add_async_cleanup_hook).

The prepared module adds watch/interest/closed operations without replacing
existing RWI1/carrier fields. Each watched pair has one unreferenced uv_poll
handle and one scoped async callback owner. Read/write interests can be paused;
callbacks carry only OS status/mask. A watched close stops delivery immediately,
wipes pending bytes and retires callback resources, then retains the socket/pair
slot through uv_close completion. Close within a callback defers async-context
destruction until napi_make_callback returns. Async environment cleanup joins
all native handles before releasing its hook/context. A throwing host callback
is sealed once without forwarding exception text or retaining pending output.

Actual Node/kernel/linked-worker fixtures **11/11** pass: seven previous primitive
cases plus paused read/resume, close during callback and observed retirement,
callback fault, maximum-frame writable-event delivery without sender polling,
and thread-environment exit with 32 watchers plus a pinned maximum record.
The first stronger reentrant-close case caught uv_poll_stop on a handle already
closing; deferred retirement now checks that state before stopping and frees
the callback owner after its borrow. No assert/protection was disabled. First
failure is retained in `build/iteration-197-addon-tests-first-failure.log`.

Full Linux check: **464 passed / 75 skipped / zero failures**, 539 cases;
Windows check: **528 passed / 11 Linux-addon skipped / zero failures**. Linked
Linux CTest **24/24**, ELF closure **34 files / 274 edges** and relocation **1/1**
pass. The independent UID1000/read-only/no-network/init/cap-drop artifact smoke
also passes with `ipcPairs:1`, six private modules and three lifecycle replies.
TGZ SHA-256: `9e253cef564141cfe81fe0e96f53c035b536bab76e7811ce859ed3296fedbd5f`,
24,777,928 bytes excluding Node.js. Local logs: `build/iteration-197-*`.

Prepared addon
sanitizer acceptance remains open with the failed Node-only baseline from
iteration 196; passing native parser/socket sanitizer evidence does not cover
the new libuv ownership code. Actual CI is unrun.

Required next block: a bounded Node stream owner couples these readiness callbacks
to single-send credit, paused-read ownership and independent timeout/close
completion, then WorkerProcess selects/inherits this transport. Current ordinary
supervisor/API still use framed pipes. No connected Linux RDP/audio/input release
or platform/resource/soak acceptance is added.
