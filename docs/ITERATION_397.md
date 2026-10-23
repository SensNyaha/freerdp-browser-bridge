# Iteration 397 — owned XRDP desktop and connected resource failures

2026-10-21. Implements the user's explicit request for a Linux RDP container to
verify the current MVP XRDP path. No personal VMware machine or external RDP
server is changed. [Reproducible setup](OWNED_XRDP_LAB.md).

The owned Debian/XRDP/Xorg/Openbox/Tk fixture has no host mounts and publishes
only `127.0.0.1:3391`, with two CPUs / 2 GiB / 256 PIDs, init and
no-new-privileges. A random fixture password reaches `chpasswd` on stdin and is
stored only in the authorized ignored local-development directory. A two-day
self-signed certificate is generated inside the container; its exact public
fingerprint is recorded without persisting Bridge trust. Existing setup files
are refused. This writable service fixture is separate from production runtime
hardening acceptance.

The current linked Windows Release worker and headed Edge, through the public
Node API, pass actual JPEG and H.264 1920×1080 rendering, cursor motion/shape
replay, 1280×720 resize/restoration with fresh configurations (H.264 keyframes),
fresh-token viewer reattachment and joined cleanup. Logs:
`build/iteration-397-xrdp-jpeg-repeat2.log`, `iteration-397-xrdp-h264.log`.
Initial uniform-window and shell-CRLF startup failures remain retained; the
prepared desktop now starts after Openbox, with explicit initial geometry and
LF shell normalization. No Bridge production change is needed for these fixes.

The tracked setup helper then creates the current fixture successfully:
image `sha256:3572ed329ab4c0af94420cdc2dc188ae742a332350de5dd968f04be4759ef54a`,
XRDP `0.9.21.1-1+deb12u3`, xorgxrdp `1:0.9.19-1`, Openbox `3.6.1-10`.
Its actual connected public resource scenarios pass:

- RSS: one sample above the explicit one-byte test cap, nine JPEG frames,
  exactly one `WORKER_MEMORY_LIMIT` event and both terminal channel closes.
- CPU: two connected CPU samples, 2,140,625 µs cumulative growth under bounded
  native ping load, twelve JPEG frames and exact `WORKER_CPU_LIMIT` at the
  explicit 1% test cap. This is policy-failure acceptance, not normal CPU-budget
  performance acceptance.
- Both: failed HTTP snapshot, denied new attachment (409), retired token (401),
  overflow refusal before factory, joined native close, empty query owners,
  retired PID and empty runtime. Logs: `iteration-397-owned-rss.log`,
  `iteration-397-owned-cpu.log`.
- Strict default rejects the new certificate with `RDP_CERTIFICATE_REJECTED`,
  zero prompts and empty runtime: `iteration-397-owned-strict.log`.

The fixed nonsecret lab selector preserves default Windows files and refuses
unknown profiles, foreign endpoints or credential aliases. Selector/receipt
focus passes 7/7; relevant scripts pass ESLint/Prettier/syntax checks. The full
Windows baseline [396](ITERATION_396.md) includes its two selector unit cases.
The setup helper's existing-file refusal and actual fresh setup are separately
observed. No project dependency pin, Release profile, production/native source,
protocol or security mechanism changes.

Two prepared pointer attempts on the prototype fail before sending any input:
CLIPRDR never becomes ready, with zero reads/writes/keys and empty runtime.
Clean desktop startup does not resolve it. The channel/application cause is
unverified; actual Linux content-scroll/input readbacks are not accepted.
Logs: `iteration-397-xrdp-pointer.log`, `iteration-397-xrdp-pointer-repeat.log`.
Windows actual pointer evidence [396](ITERATION_396.md) keeps its scope.

The current fixture's one-Hz visible marker exercises changing pixels for the
separate active 30-minute observation. That running observation is not a pass
until its full duration, sampled limits, resize/replay and final cleanup pass.
It uses the unchanged 256 MiB worker RSS limit, with audio and Clipboard off.
