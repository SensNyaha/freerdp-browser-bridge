# Iteration 171 — packaged private-directory helper

2026-10-13. Implements ARCHITECTURE §2 and SECURITY §2/6 after `8aaa379`.
[Command contract, packaging and retained gates](WINDOWS_DIRECTORY_HELPER.md).

The fixed native CLI exposes atomic private-directory creation with scalar,
bounded output. Three actual process cases pass. Foundation CTest 10/10,
bundled 22/22, MSVC /analyze /W4 /WX, clang-format and explicit helper/private
dependency relocation 1/1 pass. No Node startup, cancellation or multi-user
acceptance is inferred from utility execution alone.

Full bundled `pnpm check` passes 501/501 with zero failures or cancellations.
