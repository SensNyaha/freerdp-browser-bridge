# Standalone third-party notices

Windows MSI embeds the unmodified WiX Util 4.0.6 service-recovery custom action.
Ship `WIX-UTIL-LICENSE.txt` under the installed payload's `notices/` directory.
The license is copied unchanged from WiX commit
`73c897383236ddbbbc6ba257634013c1269ceec2`, SHA-256
`dfdf2048787635215a6baf3b9d461dee89a2904d246787258a44f072a98d4786`.
Official tool packages are pinned separately; WiX is a build dependency and the
Util action is an embedded installer component. This does not apply a WiX
license to the independent bridge source.

Private Node ships its upstream `node/LICENSE`, including bundled dependency
notices. Production npm dependencies retain their package licenses. The native
runtime retains its dependency/license/SBOM inventory and corresponding source
companions. Final standalone releases must provide those companions alongside
the installers; an installer build alone does not prove license/source delivery.
