# Iteration 301 — current Windows lab scope clarification

2026-10-18. During restored-lab verification, inspecting the already generated
native JPEG reveals a Windows backup/preparation wizard. The user explicitly
confirms that `192.168.21.149` is the Windows lab, then closes the screen
themselves and reports desktop access. No backup/account choice or remote
application action is performed by the agent during this clarification.

[Current lab status](LAB_STATUS.md) separates the new Windows endpoint runs
from preserved historical XRDP evidence. Legacy helper filenames do not
determine server OS. TODO/current development notes now reflect the confirmed
endpoint and the outstanding desktop/audio/device preconditions. No production
code, public protocol, credentials, dependency pins or Release settings change.

The native image is `.local-tests/xrdp-frame.jpg`, already produced by the
authorized helper. It is viewed in place and not copied into Git/build output.
New runs in iterations 297–299 establish only their stated connection/graphics/
inventory/healthy-resource scopes. They do not close application input,
clipboard consumption, audio capture or broader Windows Server gates.

This is documentation-only. Local link and diff checks pass; iteration 300's
build/regression evidence is separate. No additional RDP connection, device
capture, external research or security investigation is needed for this scope
clarification. Continue the separate RDP/function checks with the desktop available.
