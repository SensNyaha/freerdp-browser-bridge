# Iteration 160 — nested graphics ZGFX allocation admission

Started: 2026-10-12; verification completed: 2026-10-13. Implements SPECIFICATION §3.1/3.3 and ARCHITECTURE §11/12 after
`d1efcac`. Public channel-name classification installs allocation-free ZGFX claim
inspection before the actual rdpgfx decoder callback. It preserves borrowed stream
state, complete-message reservation release and independent target retirement.
[Contract, source evidence and remaining gates](GFX_ZGFX_ADMISSION.md).

Six new public/codec cases, one production identity-API case and two actual
rdpgfx/drdynvc/fake-SVC cases pass. Linked DVC suite **120 cases / 7,266 assertions**,
bundled CTest **18/18**, MSVC /analyze /W4 /WX. Valid actual CapsConfirm and large
12 MiB codec output are preserved; malformed/excessive nested claims never reach
the fixture codec callback. No source/pin/ABI/wire/capability changes or new actual
remote graphics acceptance claims. Foundation CTest **7/7** and full bundled
`pnpm check` **498/498**, zero failures/cancellations, pass. A fresh credential-free
TCP check still cannot reach 192.168.21.149:3389 within five seconds; actual lab
regression remains open. Decoder working memory and pool/RSS work continues.
