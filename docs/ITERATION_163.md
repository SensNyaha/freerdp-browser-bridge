# Iteration 163 — nested backend ABI correction and restored XRDP regression

2026-10-13. Implements SPECIFICATION §3.1/3.3 and ARCHITECTURE §12 after
`20e2915`. The first restored actual XRDP viewer runs activated but failed with
RDP_PROTOCOL_ERROR during rendering. Typed state/error-only helper diagnostics
and temporary fixed scalar tracing localized a dynamic RDPSND OnOpen status 50;
no credentials or raw upstream diagnostics were retained. Temporary tracing and
private-object inspection were removed before verification/commit.

Pinned `client/common/cmdline.c:freerdp_client_load_addins` registers static and
dynamic `rdpsnd,sys:fake` when DeviceRedirection is required and no sound channel
was supplied. This can occur with browser audio off: network autodetect/heartbeat
dependency handling also enables RDPDR. In
`channels/rdpsnd/client/rdpsnd_main.c:rdpsnd_load_device_plugin`, the dynamic
channel loads the fake device backend with FREERDP_ADDIN_CHANNEL_DYNAMIC and a
subsystem selector. The flag alone therefore does not identify a PDVC_PLUGIN_ENTRY.

The scoped provider previously returned a DVC denial entry for that device ABI;
Open called it as a RDPSND device entry and returned unsupported. The provider
now wraps only dynamic requests without subsystem/type selectors, preserving
other ABI requests and all their selectors/flags with the previous scoped
provider. It does not replace the previous backend policy or activate host
capture/audio. Bare invalid/missing/foreign/reentrant DVC requests retain their
nonnull refusal and existing slot/lifetime checks.

Six provider cases / 265 assertions cover the correction, including 40 backend
lookups which do not consume DVC slots, exact selector/flag forwarding and
existing plugin dispatch/refusal/thread cases. Linked DVC suite passes 122 cases /
7,447 assertions. Working-tree bundled CTest 21/21, foundation 9/9,
MSVC /analyze /W4 /WX and full bundled `pnpm check` 498/498 pass, with zero Node
failures/cancellations. The working-tree
bundled CTest includes the next iteration's isolated message-owner fixtures;
that owner is not linked into the production worker yet.

Restored actual H.264 viewer passes 52 1080p frames, 1280×720 resize and 1920×1080
restoration, fresh configs/IDRs, reattachment and cursor replay. It sends one
authorized pointer motion and four resets, no keys/buttons/wheel/text/touch.
Runtime cleanup passes. This is browser regression, not proof of negotiated GFX,
audible output, microphone capture, upstream fake-backend resource bounds or
remote terminal touch release. Broad resource/platform/soak gates remain open.

The actual JPEG fallback also passes 51 1080p frames, both resize generations,
restoration/reattachment/cursor replay, one motion/four resets and empty-runtime
cleanup. No new certificate trust, remote application, physical capture or audio
generation was introduced. Source pin/public ABI/wire/capability remain unchanged.
