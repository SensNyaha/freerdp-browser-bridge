# Iteration 170 — isolated Windows private-directory creation

2026-10-13. Implements ARCHITECTURE §2 and SECURITY §2/6 after `ebc2d99`.
[Ownership, creation and retained acceptance](WINDOWS_PRIVATE_DIRECTORY.md).

The isolated native creator installs current-user/LocalSystem protected ACLs
atomically and refuses existing objects without repair. Five actual Windows
filesystem cases / 91 assertions, foundation CTest 10/10, bundled 22/22,
MSVC /analyze /W4 /WX, clang-format and git diff checks pass. Handle-based volume
query fixes the initial substituted-drive failure. No production startup,
wire/capability, second-account or service isolation acceptance is claimed.

Full bundled `pnpm check` passes 498/498 with zero failures or cancellations.
