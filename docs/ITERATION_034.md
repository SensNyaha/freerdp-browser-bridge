# Iteration 34 — international physical keyboard positions

Date: 2026-10-10. Implements SPECIFICATION §2.5's layout-independent physical
mapping and Stage 5 under ADR-008 / ADR-009 / ADR-011.
Implementation commit: `e9c12fb`.

The browser and strict control normalizer now recognize IntlRo, IntlYen, KanaMode,
Convert, NonConvert, Lang1, Lang2 and NumpadComma. The eight set-1 positions are
verified against Chromium's Windows mapping and pinned FreeRDP public constants;
the native worker has a compile-time check. No locale characters, text translation,
arbitrary flags, new wire layout or remote keyboard-layout selection is introduced.

Verification:

- Narrow Node/Edge **2/2**: independent numeric/hex vectors, strict code aliases,
  actual Edge synthetic international KeyboardEvents through fake control, down/up
  ordering independent of visible symbols, composition suppression and blur reset.
- Native portable IPC/input **26 cases / 531 assertions**, including an eight-key
  independent record/reset test. All held positions release once and reset is
  idempotent. Bundled CTest **10/10**, foundation **4/4**, /W4 /WX /analyze passed.
- Bundled pnpm check **141/141**, no skipped/cancelled tests, **113.29 s**;
  strict TypeScript, lint/format and native/fake/Edge lifecycle regressions passed.

Logs: ignored build/iteration-034-*.log. This is physical-position implementation,
not actual Japanese/Korean/Brazilian keyboard hardware or remote IME/text acceptance.
Pause, remaining special codes, layout selection, other Stage 5/device/platform
and soak requirements remain open. See [input contract](INPUT.md#international-physical-positions).
