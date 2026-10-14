# Iteration 185 — ordinary Linux foundation under a restricted runtime

2026-10-14. Verifies BUILD_AND_DEPLOY §3 and TODO Stage 0/1/10 foundation
runtime conditions after `698cb67`, using the same corrected source as iteration
184. This is not the multi-stage production RDP image.

The ordinary GCC foundation preset has no sanitizer/non-PIE overrides and
passes CTest **8/8**. Under the image's `node` user, UID/GID 1000, the actual
worker integration suite passes **12**, skips one Windows-only case and has
zero failures/cancellations. These tests distinguish real foundation workers
from compiled adversarial/fake-worker fixtures. Real checks include 100
sequential HELLO/heartbeat/shutdown cycles, crash/replacement, build API/CLI
agreement, malformed input and parent-death/runtime cleanup.

The same suite passes **12/one skip** with:

```sh
docker run --rm --init --network none --read-only \
  --tmpfs /tmp:rw,nosuid,nodev,noexec,size=128m \
  --cap-drop ALL --security-opt no-new-privileges \
  --memory 2g --cpus 2 freerdp-bridge-linux-nonroot:e90f95b \
  node --test --test-concurrency=1 tests/integration/worker.test.mjs
```

The tag identifies a local verification image, not a published deployment
artifact. There are no host device/Docker socket mounts or published ports.
Docker's default seccomp profile remains active. Runtime files are in the
bounded writable `/tmp` tmpfs; binaries remain in the read-only image.

## Init/reaper requirement and retained failure

The first read-only run omitted `--init`: **11 passed, one failed, one skipped**.
Parent-death cleanup removed the runtime directory, but `kill(pid, 0)` still
found the orphan worker. The failure criterion was not changed or relaxed.
A separate non-root, no-init diagnostic reproduced `/proc/<owned worker>/stat`
state **Z** with **zero runtime entries** after killing only its own parent.
The worker had exited, but PID 1 had not reaped it. With Docker init, the same
existing test observes process disappearance and empty runtime.

Container deployment must therefore supply an init/subreaper, such as Docker
`--init` or Compose `init: true`, when the service can become PID 1. A supervisor
that actually reaps adopted child processes is also acceptable. This receipt
does not justify treating a zombie as successful process cleanup.

Logs: `build/iteration-185-linux-nonroot.log`, `linux-readonly.log`,
`linux-readonly-init.log` and `linux-reaper-proof.log`. A failed attempt to copy
the diagnostic into an already read-only container produced no diagnostic
evidence; the separate writable diagnostic container provided the state above.

No production code, protocol, capability or secrets changed. Stage 0 remains
open for exact linked Linux FreeRDP/private dependency/fresh-build acceptance;
Stage 1 for primary Linux transport/priority output and abnormal cleanup;
Stage 10 for the actual multi-stage service image, runtime package, service API,
remote media/devices, concurrency/resource/network soak and installers. Default
seccomp execution here is a foundation smoke, not a complete RDP/device profile.
