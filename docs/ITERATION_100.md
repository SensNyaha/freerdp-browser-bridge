# Iteration 100 — scoped guarded AUDIN plugin

Date: 2026-10-11. Implements SPECIFICATION §2.6 / ARCHITECTURE §5 /
MEDIA_PIPELINE §7 after guarded DVC `b5d8f20`.

AudinRegistration owns the pinned static plugin, listener and guarded channel
through one RDP-thread lifetime. Scoped loading supplies fixed browser-backend
arguments; native retirement precedes delayed host termination. Partial listener
creation and uncertain registration errors retain cleanup ownership. Failed or
throwing DestroyListener retains its handle and allows exactly one retry per
later owner close. Reentrant/foreign notifications cannot destroy borrowed data.
Guarded AUDIN and RDPSND compose in either provider binding order.

Eight new actual linked AUDIN/fake-DVC cases pass **307 assertions**. AUDIN now
has **31 cases / 3,068 assertions**. These fixtures use synthetic PCM/silence,
not a host or browser microphone. Initial test compilation found deprecated
strcpy under warnings-as-errors; bounded std::copy_n replaced it. Final bundled
CTest passes **17/17**, foundation **6/6**; /W4 /WX, MSVC /analyze and formatting
checks pass. Full bundled `pnpm check` passes **276/276**, without skips.

Worker activation/cadence, finite teardown deadlines, same-plugin reopening,
earlier core allocation/lost-write limits, private IPC, browser permission /
capture/resampling/Opus input and actual microphone/LAN acceptance remain open.
Microphone modes still fail explicitly at the worker boundary. No capability or
wire change is claimed. [Ownership contract](AUDIO_AUDIN_PLUGIN.md).
