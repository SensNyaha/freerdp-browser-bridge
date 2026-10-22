# Iteration 415 — real Astra Linux 1.7.5 RDP

2026-10-22. The user adds a separate Astra XRDP host, reports
`cat /etc/astra_version` as **1.7.5** and explicitly confirms its presented
RDP certificate fingerprint. The version is user-reported evidence; this run
does not independently inventory an installed Astra release or security profile.
Local endpoint/credentials are separate Git-ignored lab profiles. No credentials
enter argv, environment, reports, Git, runtime packages or build artifacts.

The producer is the exact final GCC 8.3 package from [411](ITERATION_411.md),
running in the checked Astra-library container from [412](ITERATION_412.md).
Package SHA-256:
`666c2f203c30161858f664d1365f19c857845a25654751d886ac03aa22cd7a89`.
Worker SHA-256:
`eb3c7b13b51dc8d6d6ed98ebbfe55f6babcbb2928722706e13005bbb099d15eb`.
The client container uses the Docker host kernel, independently of the actual
remote Astra server. No server software/settings are installed or changed.

An initial certificate inventory deliberately denies the prompt and observes
`RDP_CERTIFICATE_REJECTED`, no activation, heartbeat and empty joined cleanup.
This is prompt-refusal inventory, not a strict-default-policy test. Subsequent
connections accept only the exact fingerprint explicitly confirmed by the user;
no persistent trust or production verification policy changes.

The final native test passes actual connection activation, JPEG and H.264 IDR,
ten seconds connected without application input, a fresh 1920×1080 JPEG,
heartbeat and joined cleanup. Display control is negotiated. The initial frame
alone is not treated as a fully settled desktop observation.

Independent real Edge headless/public HTTP-WebSocket runs pass for **both H.264
and JPEG**: nonuniform rendered canvas at 1920×1080, resize to 1280×720,
restoration to 1920×1080, viewer reattachment with fresh tokens and joined
session/runtime cleanup. They run without `LD_LIBRARY_PATH`, using the installed
package's private closure. H.264 records four configurations/seven keyframes at
the first resize and six/ten at restoration; JPEG records three/four configurations.

The first native adapter attempts fail when printing their report: an attached
display object contains a BigInt generation that ordinary `JSON.stringify`
cannot serialize. A bounded uncaught-error diagnostic identifies TypeError at
the report serialization line without printing messages or arbitrary stack data.
The final adapter emits only selected scalar display fields and string generation;
the unchanged RDP checks then pass. Earlier empty/failed logs remain retained.
An automatic approval-review usage-limit failure temporarily prevents one Docker
inspection; that action is not executed or bypassed, and later reviewed calls
work again.

Local evidence: `iteration-415-astra-certificate.log`,
`iteration-415-astra-direct{,2,3,4}.log`,
`iteration-415-astra-browser-h264.log` and
`iteration-415-astra-browser-jpeg.log`. No remote application text or images
are retained in these reports. No application input/clipboard, audible audio,
devices, security profiles or longer soak is accepted by this observation.
Mandatory actual RED OS RDP acceptance and the 0.2.0 release remain open.
