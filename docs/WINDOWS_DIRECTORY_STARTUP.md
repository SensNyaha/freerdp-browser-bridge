# Private Windows directory startup

2026-10-13. Implements ARCHITECTURE §2/3 and SECURITY §2/6 after `5c75f26`.
WorkerProcess now selects the [colocated native helper](WINDOWS_DIRECTORY_HELPER.md)
before creating its owner marker or spawning the RDP worker. Other platforms
retain their existing mode-0700 directory path.

The Windows candidate has 128 random bits beneath the configured runtime root.
The helper receives only its fixed command and this nonsecret internal path;
SystemRoot/WINDIR and an empty PATH form its environment. It is hidden, has a
five-second process deadline and 128-byte stdout/stderr capture bounds. The
deadline is independent of the later HELLO deadline. No credentials enter the
helper. There is still one RDP worker per session.

Only an exact version-1 receipt with consistent boolean creation and unsigned
Windows error code establishes directory ownership. Successful creation remains
owned if subsequent exit/stderr reports failure, allowing normal cleanup. A
collision or malformed/uncertain receipt grants no deletion authority. Errors
expose fixed bridge codes, never helper output or filesystem/account metadata.
Missing helper fails before worker spawn with RUNTIME_DIRECTORY_UNAVAILABLE;
missing worker with an available helper still fails WORKER_SPAWN_FAILED and
cleans its confirmed directory. No public wire or capability is changed.

Termination during startup prevents later marker/worker publication. close()
after termination joins startup settlement, including a delayed ownership receipt,
before reporting cleanup complete. Normal cancellation waits for the bounded
helper completion rather than interrupting its creation/receipt boundary.
The existing close-during-starting refusal is unchanged.

## Retained acceptance

A killed/timed-out helper or invalid receipt can leave an unconfirmed empty
candidate. It is deliberately not deleted without ownership proof; recovery of
that case, parent-only bootstrap death and simultaneous hard-kill reclamation
remain open. No zero-orphan claim is made for uncertain outcomes.

The root is trusted hosting configuration, not caller-controlled session input.
The creator checks its immediate parent and filesystem ACL support, but ancestor
namespace/root ownership, parent DACL/races, other filesystems, clean machines
and actual second-account/service isolation remain open. Same-account processes
are not separated by these ACLs. Linux transport/isolation acceptance is separate.

Actual Windows helper/worker lifecycle tests are distinguished from synthetic
receipt/fault seams. The latter cannot establish hostile-host or cross-account
acceptance. [Verification](ITERATION_172.md).
