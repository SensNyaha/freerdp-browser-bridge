# Test strategy

## 1. Test pyramid

### Unit

Node:

- schema validation;
- authorization/session ownership hooks;
- attach-token lifetime;
- control protocol validation;
- queue/backpressure policy;
- file sandbox path resolution;
- secret redaction.

Native:

- IPC parser/serializer;
- dirty-region merge;
- frame scheduler;
- cursor conversion;
- H.264 packet format conversion;
- audio ring/jitter buffer;
- input state/stuck-key release;
- config mapping to FreeRDP settings;
- device descriptor validation.

### Fuzz

- worker IPC envelope and each payload decoder;
- cursor image conversion;
- browser control message parser after schema-to-native translation;
- custom printer spool metadata parser.

### Integration

Use at least:

- Windows 11/Server target with NLA;
- XRDP on Linux;
- RDP Gateway lab when available;
- deliberately invalid/changed certificate target;
- high-latency/loss network emulation (`tc netem`) in CI/lab.

## 2. Browser harness tests

Playwright test page is not a product UI. It must provide enough controls to prove:

- connect and first frame;
- keyboard/mouse/wheel;
- dynamic resize;
- cursor shape/position;
- audio playback;
- microphone permission/input;
- clipboard text both ways;
- managed drive upload/read/write/download;
- reconnect and decoder reset;
- media backpressure recovery.

Run on Chromium in CI. Firefox/Safari compatibility is a release matrix/manual or platform CI where available.

## 3. Device tests

| Feature | Test |
|---|---|
| Drive | create/read/modify/delete remote file in sandbox; read-only denial |
| Printer | print test page to allowlisted host printer or spool capture |
| Smartcard | enumerate reader, auth/sign test with test card/emulator |
| Serial | loopback or pseudo-TTY echo test |
| Parallel | capability/attach smoke where hardware/virtual device exists |
| USB | redirect selected test USB device and verify remote enumeration |
| Audio out | remote playback tone, browser receives continuous packets |
| Microphone | browser test tone reaches remote recorder/app |
| Clipboard | Unicode/HTML/image size boundaries |
| Camera | only mark supported after remote camera application E2E |
| WebAuthn | only mark supported after remote WebAuthn workflow E2E |

## 4. Failure tests

Must cover:

- kill worker mid-session;
- kill Node parent;
- malformed IPC length;
- browser disconnect/reconnect;
- remote RDP disconnect;
- certificate prompt timeout;
- wrong credentials then retry;
- encoder crash/failure initialization;
- resize while frame queued;
- huge clipboard/file offer;
- disk full in session sandbox/spool;
- USB unplug;
- smartcard removed;
- gateway unreachable;
- 5–10% packet loss/100–200 ms RTT simulation.

## 5. Security tests

- path traversal and symlink escape;
- unauthorized session attach;
- replay expired attach token;
- WS Origin mismatch;
- secret redaction snapshot tests;
- raw host path attempt by unprivileged config;
- custom VC/DVC not on allowlist;
- huge media/control payload rejection;
- command injection strings in every textual config field;
- certificate mismatch cannot auto-accept.

## 6. Acceptance gates by stage

Every TODO stage must end with:

1. unit tests green;
2. relevant integration tests green;
3. no new sanitizer finding in touched native code;
4. docs/API schema updated;
5. one or more focused commits;
6. explicit checkbox update in `TODO.md`.
