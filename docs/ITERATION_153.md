# Iteration 153 — pinned public listener failure-output normalization

Date: 2026-10-12. Implements SPECIFICATION §3.1 / ARCHITECTURE §12 after public
registry `67f8c1d`. A nonowning public manager facade returns stable local fallback
on failed/invalid CreateListener output, preserving pinned generic Initialize's
error dereference and delayed fallback DestroyListener. Successful handles/flags/
callbacks retain their identity; delegation uses the original manager argument.
Production registration remains open.

Five new public-ABI/generic-addin cases and one actual drdynvc/fake-SVC case pass.
Linked suite **67 cases / 6,365 assertions**, bundled CTest **18/18**, foundation
**7/7** pass with /analyze /W4 /WX. Dangling failed output is emulated after source
audit; actual native HashTable OOM is not injected. No dependency source/pin/ABI/
wire/capability changes or private SDK casts.
[Contract, lifetime preconditions and remaining placement](PINNED_DVC_MANAGER.md).

Full bundled `pnpm check` passes **498/498**, zero failures/cancellations.
