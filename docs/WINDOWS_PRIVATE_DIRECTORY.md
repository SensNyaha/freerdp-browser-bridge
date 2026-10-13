# Windows private-directory foundation

2026-10-13. Implements ARCHITECTURE §2 and SECURITY §2/6 after `ebc2d99`.
This isolated component is not yet selected by WorkerProcess startup. The
existing Windows runtime-directory/multi-user acceptance gate remains open.

`create_private_directory` accepts a bounded drive-absolute UTF-16 path under
a caller-trusted parent. It opens that parent without following an immediate
reparse point, requires an ordinary directory, and checks persistent ACL support
through its handle. This supports the build's substituted drive alias; the
initial volume-name query failed with ERROR_DIR_NOT_ROOT for that alias.
Ancestor namespace ownership/races, UNC/extended namespaces and helper/startup
placement are separate work, not established by this function.

Creation supplies a protected security descriptor directly to CreateDirectoryW.
Its owner is the current process token's user SID. Its DACL grants inheritable
FILE_ALL_ACCESS only to that SID and LocalSystem, collapsing identical SIDs.
There is no interval in which a newly created directory has a default inherited
DACL. Existing objects are refused without changing their security. The
component performs no recursive creation, repair, deletion, impersonation,
privilege enablement, network access or logging. Path length is checked before
string allocation; token/SID/ACL storage is fixed. Return values are checked and
errors remain scalar Windows codes.

Five actual Windows filesystem cases / 91 assertions verify protected ownership,
exact principals, child-file/directory inheritance, unchanged existing descriptors,
invalid names and a file parent. UTF-16 directory names are exercised. Foundation
CTest 10/10 and bundled 22/22 pass with MSVC /analyze /W4 /WX and clang-format.
Test cleanup removes only its known direct children, without recursive traversal.

Atomic Node placement before owner-marker creation/spawn, cancellation/cleanup,
trusted parent validation, packaging/helper discovery, other filesystems and
actual second-account/service isolation remain open. ACLs alone do not establish
per-session isolation between processes using the same Windows account.

API authority: Microsoft documents [creation-time file/directory security](https://learn.microsoft.com/en-us/windows/win32/fileio/file-security-and-access-rights),
[protected DACL control](https://learn.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-setsecuritydescriptorcontrol)
and [handle-based persistent ACL capability](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getvolumeinformationbyhandlew).
