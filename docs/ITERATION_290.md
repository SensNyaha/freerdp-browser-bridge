# Iteration 290 — optional container device mapping reference

2026-10-18. Implements the existing Stage 10 item "Optional USB/DRI/serial/PCSC
device mappings documented", tracing to SPECIFICATION §2.9/3.2,
DEVICE_REDIRECTION §5–7 and the existing SECURITY worker/device policy.
This is an independent documentation task after `911bb21`; the remaining
Stage 0/8/runtime gates are preserved.

## Documentation scope

The new container mapping reference documents one explicit USB node, DRI render
node, serial node and dedicated PC/SC socket-directory mount, with prerequisite
backend/policy/capability/device tests. A serial shell example retains UID1000,
init, read-only root, dropped capabilities, no-new-privileges and bounded
private runtime tmpfs. Numeric supplementary groups preserve ordinary host
permissions. Container-wide access is distinguished from required per-session
device selection and ownership. Credentials/PINs retain private IPC delivery.

The reference states that current public validation refuses USB, serial,
parallel, smartcard and host-printer selections, and that a compiled channel or
container mapping is not device acceptance. Current software OpenH264 requires
no DRI mapping. Browser audio and the separate browser-host companion design
retain their existing boundaries.

The build/deployment, device-design and service-runtime documents link to the
new reference. Existing normative documentation and historical acceptance are
preserved. No Dockerfile, image, Release configuration, dependency version,
runtime source or public wire contract changes.

## Verification

All **31 local document links** across the five touched/reference documents
resolve to regular files. The extracted serial shell example passes `bash -n`
in the existing network-disabled local container; the shell commands are not
executed. The installed local Docker CLI help confirms the documented option
names. Current public refusal, compiled-channel distinction and software codec
profile were checked against the existing project source and contracts.

`git diff --check` and staged checks pass. The same-turn common controls from
iteration 289 remain Linux CTest **16/16**, Windows CTest **15/15**, full Linux
`pnpm check` **578 / 147 skips** and full Windows **632 / 90 skips**, all without
failures. They are not rerun for this Markdown-only change. The focused
verification is retained in `build/iteration-290-verification.log` and its
runner `build/iteration-290-verify.cjs`.

No host device, card, PC/SC daemon, RDP endpoint or external system is contacted.
No new security research or runtime policy changes are performed. Device
redirection, hotplug, isolation and resource/soak acceptance remain open.
