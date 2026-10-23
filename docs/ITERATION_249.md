# Iteration 249 — isolated Windows FreeRDP source rebuild

2026-10-16. Extends Iteration 247's local source-rebuild acceptance to Windows
x64/MSVC. `native-build.ps1 -Task clean-freerdp` keeps the existing MSVC/tool
environment and temporary ASCII workspace alias alive through local clone,
configure/build/install, public runtime probe and CTest. It invokes the same
`build-freerdp.mjs --clean-local` flow without replacing the ordinary installed
SDK. Existing private dependency/toolchain inputs are reused; no new network,
RDP session, clipboard or device access is involved.

The first new SDK `build/freerdp-source-clean-I1dYMx` compiles all 388 build
steps and installs, but its probe returns exact origin failure 2. Diagnostic
rebuild confirms one function address resolves to the probe EXE's import thunk.
The public WinPR header enables DLL-import declarations only with WINPR_DLL;
the independent probe lacked that definition. Its MSVC target now explicitly
selects the shared WinPR ABI. No FreeRDP/WinPR source, production worker or
test origin requirement is relaxed. The first failed log/fixture is retained.

The complete new-tree repeat `build/freerdp-source-clean-Foc03E` passes clone,
configure, 388-step compilation, installation, positive runtime probe, exact
foreign-prefix refusal 2 and CTest 1/1. FreeRDP and WinPR version APIs both
return 3.32.1. All three canonical loaded module origins are inside the new SDK
prefix. Actual public static client inventory equals the filtered cache's 20
channels; serial/parallel remain OFF as required by the pinned Windows profile.
Both original and new source checkouts are clean at exact
`bf217a504e54cc719880c228e82353382cd7d4fa` before/after.

| New installed artifact | SHA-256 |
| --- | --- |
| freerdp3.dll | `682de5fc84ad11008eb19ee15a46543192017fb766a94ed4f6f68338d872a3db` |
| freerdp-client3.dll | `466ca084abfc74227fd15a843356ba0724a93b74c1fbebf6d07afd10bfd1661b` |
| winpr3.dll | `232647f6afb1ba39a09e5ec13169cc4aa0f1d614e4717f07ee89eeb236bfe05d` |
| filtered feature report | `ecf9385a912fa5422c865ba57c5826b7df6d1389fb201c8b074c7838ff0a3311` |

The new receipt records freerdpRebuilt=true, dependenciesRebuilt=false,
privateModules=3, foreignPrefixRejected=true and nativeTests=1. Logs:
`build/iteration-249-windows-clean-sdk.log` and
`build/iteration-249-windows-clean-sdk-repeat.log`. Paths in this local SDK/cache
receipt use the temporary workspace alias; later consumers must validate the
same prefix relationship, not silently resolve an unrelated installed SDK.

Linux's final shared probe still passes CTest 1/1 and exact foreign-prefix
refusal after the Windows declaration/diagnostic changes. The correctly scoped
Windows linked Node regression's repeat is tracked separately from this SDK
smoke. The retained PCM page-load failures and focused 3/3 repeat from Iteration
247 do not prove their intermittent cause has been fixed.

This accepts the named local Windows/Linux FreeRDP source rebuild and installed
identity/inventory checks. A new Windows project consumer of the rebuilt SDK,
complete fresh dependency/distro/CI, clean-machine packaging/installers, standard
PIE sanitizer and remaining RDP/device/resource gates remain open. Stage 0
remains IN PROGRESS.
