# External implementation references

Research date: 2026-10-07.

Use these as upstream references; pinned FreeRDP source/header files are authoritative during implementation.

## FreeRDP

- FreeRDP releases (3.32.1 current at research time): https://github.com/FreeRDP/FreeRDP/releases
- FreeRDP ChangeLog: https://github.com/FreeRDP/FreeRDP/blob/master/ChangeLog
- FreeRDP wiki home/reference links: https://github.com/FreeRDP/FreeRDP/wiki
- Compilation/dependencies and optional libraries: https://github.com/FreeRDP/FreeRDP/wiki/Compilation
- Current command-line options/source reference: https://github.com/FreeRDP/FreeRDP/blob/master/client/common/cmdline.h
- Channel/QA protocol mapping: https://github.com/FreeRDP/FreeRDP/wiki/Quality-Assurance-%28QA%29
- Client interface API: https://pub.freerdp.com/api/include_2freerdp_2client_8h_source.html
- Update callbacks API: https://pub.freerdp.com/api/include_2freerdp_2update_8h_source.html
- Sample client: https://github.com/FreeRDP/FreeRDP/blob/master/client/Sample/tf_freerdp.c
- Build notes incl. smartcard/USB dependencies: https://github.com/FreeRDP/FreeRDP/blob/master/docs/README.building

## Remmina behavior reference

- Remmina RDP plugin source: https://gitlab.com/Remmina/Remmina/-/blob/master/plugins/rdp/rdp_plugin.c

Use Remmina only to understand useful settings and mappings; do not copy its UI or make it a runtime dependency.

## Microsoft protocol names relevant to channel tests

Protocol identifiers referenced by FreeRDP QA/reference documentation include MS-RDPEFS/RDPDR, MS-RDPECLIP, MS-RDPEA, MS-RDPEAI, MS-RDPEGFX, MS-RDPEDISP, MS-RDPEUSB, MS-RDPESC, MS-RDPESP and related RDP extensions. Link to the current Microsoft Open Specifications from test/docs when implementing each channel rather than embedding stale protocol text in this repository.
