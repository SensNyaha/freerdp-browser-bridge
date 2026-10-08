# Requirements traceability matrix

| Requirement | Design document | Primary stage |
|---|---|---:|
| Node.js bridge API | ARCHITECTURE, PROTOCOL | 2 |
| Native FreeRDP worker | ARCHITECTURE, FREERDP_MAPPING | 1–3 |
| Browser image | MEDIA_PIPELINE | 4 |
| Browser cursor | MEDIA_PIPELINE | 4 |
| Keyboard/mouse/touch | SPECIFICATION, FREERDP_MAPPING | 5 |
| RDP audio output | MEDIA_PIPELINE | 6 |
| Microphone | MEDIA_PIPELINE | 6 |
| Clipboard | DEVICE_REDIRECTION | 7 |
| Drives/thinclient drives | DEVICE_REDIRECTION | 7 |
| Printers | DEVICE_REDIRECTION | 8 |
| Smartcard | DEVICE_REDIRECTION | 8 |
| Serial/parallel | DEVICE_REDIRECTION | 8 |
| USB/URBDRC | DEVICE_REDIRECTION | 8 |
| Gateway/proxy/security | CONFIG_SCHEMA, FREERDP_MAPPING | 9 |
| Dynamic resolution/multimon | CONFIG_SCHEMA, MEDIA_PIPELINE | 9 |
| Remmina-like settings | CONFIG_SCHEMA, FREERDP_MAPPING | 9 |
| Camera/WebAuthn optional | DEVICE_REDIRECTION | 11 |
| Crash isolation | ARCHITECTURE, SECURITY | 1–2 |
| Backpressure | ARCHITECTURE, PERFORMANCE | 4, 6 |
| Container deployment | BUILD_AND_DEPLOY | 10 |
| Security hardening | SECURITY | every stage + 10 |
| Performance gates | PERFORMANCE | 4, 6, 10 |
