# Standalone distribution license inventory

The independent bridge service code is MIT; see the installed root `LICENSE`.
Bundling does not relicense its dependencies under MIT.

The RPM label `LicenseRef-NodejsBundled` refers to the complete unmodified
`node/LICENSE` delivered with the private official Node runtime. It contains
Node's license and notices for the components included in that binary.

`LicenseRef-FreeRDPBridgeNativeBundled` refers to the platform runtime's shipped
license, dependency/SBOM inventory and upstream notices below
`service/node_modules/@freerdp-bridge/runtime-<platform>/`. Its corresponding
source companions must accompany the final release. This identifier is a
reference to that inventory, not a new license grant or a claim that every
native component has the same license.

`LicenseRef-FreeRDPBridgeJsBundled` refers to the production JavaScript
dependencies, each retaining its own package license below
`service/node_modules/`. The Windows installer additionally embeds the
unmodified WiX Util service-recovery action; its MS-RL notice is under `notices/`.
The Linux packages do not embed that action.
