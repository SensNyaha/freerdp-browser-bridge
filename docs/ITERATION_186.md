# Iteration 186 — private Linux prerequisites and reboot checkpoint

2026-10-14. Implements ADR-010 and TODO Stage 0 Linux dependency preparation
after `ae6efab`. Work stops at the user's requested logical boundary for a PC
reboot; no complete linked Linux FreeRDP/worker/package gate is claimed.

The existing pinned manifest builds its Linux ZLIB 1.3.2, OpenSSL 3.6.5, libusb
1.0.30, libjpeg-turbo 3.2.0, libspng 0.7.4, OpenH264 2.6.0 and Opus 1.6.1
into `.deps/installed/x64-linux-bundled`. The initial successful installation
took about three minutes. Default libusb udev support is retained.

Actual FreeRDP 3.32.1 configuration then required Kerberos and ICU. The manifest
now adds **krb5 1.22.2** and **ICU 78.3** on Linux only, from the existing pinned
vcpkg registry. Windows selection is unchanged. Both compile/install successfully;
ICU includes its required host tools and the shared release target. Source SHA-512
checks pass against the registry portfiles. No Kerberos or Unicode feature was
disabled to satisfy configuration.

The build helper selects the private `krb5-config`, bounds its queries and checks
its include/library flags. FreeRDP's actual configure log confirms MIT Kerberos
1.22.2 and private prefix paths. The helper also requires exact private tool
selection and local ICU include/library cache entries after successful CMake
configuration; those final cache checks remain pending because configuration
currently stops at CUPS. Linux dependency metadata and license installation now
include krb5/ICU. This does not establish completed package/relocation acceptance.

The initial Kerberos make failed with `yacc: No such file or directory`. Adding
standard builder Bison resolved the failure; the bundled Linux CI prerequisite
list is corrected. CI itself has not run.

## Reproducibility and retained failures

Clean public FreeRDP/vcpkg Git objects and source archives were exported from
their verified exact commits; Git configuration/hooks and ignored workspace
content were excluded. A first FreeRDP restore failed the clean-tree check because
`git archive` honors its `export-ignore` rules for `.gitattributes`, `.gitignore`
and `.github`. Restoring HEAD from original Git objects inside the fresh build-only
repository fixes that discrepancy. Both source pins and clean status then pass.

Linux vcpkg tool, CMake 4.4.3 and Ninja 1.13.2 are verified against pinned SHA-512
metadata. Public dependency archives were transferred using verified downloads
and the existing local cache. A large CMake download exceeded the first 60-second
deadline; a bounded 180-second retry succeeds. GNU's primary Automake endpoint
timed out; its registry-listed HTTPS mirror succeeds with the same expected hash.
No general Windows CA store or lab credentials were copied into the images.

Windows foundation CTest passes **10/10**, bundled CTest **22/22**. Full
`pnpm check` executes build/lint/format/test, with **521 passed / one failed**
out of 522: a synthetic Opus permission-denial Edge fixture received random
loopback port **2049**, and Edge rejected it with `ERR_UNSAFE_PORT`. An unchanged
focused repeat of all six Edge/socket microphone cases passes **6/6**. Final
changed-script ESLint/Prettier checks pass. There is no claim of a new green full
suite; bounded browser-safe fixture port selection remains follow-up work.

The last FreeRDP configure now finds private Kerberos/ICU and stops at missing
**CUPS >=2.0** for the enabled printer client. Printing remains required and
enabled; adding its private dependency is the immediate next build task.

## Saved state and next work

- Committed code covers Linux-only manifest prerequisites, private discovery,
  metadata/licenses and builder Bison; no protocol or session-secret path changes.
- Local builder image `freerdp-bridge-linux-icu-dependencies:ae6efab` preserves the
  successful prefix and checked public sources, plus this working block's source
  overrides. It is a development cache, not a production image or installer.
- Ignored `build/linux-builder-context/` contains explicit Dockerfiles, checked
  public downloads, sanitized Git restore helper and source overrides. It contains
  no lab credentials/CA bundle. Existing images and logs survive a normal reboot.
- Logs: `build/iteration-186-*`, including retained failures, Windows checks,
  Edge repeat, successful dependency builds and the final CUPS refusal.

Resume with CUPS/private runtime dependency closure, complete pinned FreeRDP
build, linked bridge CTest/Node/relocation and then actual Linux RDP acceptance.
The libusb host libudev dependency and generated Kerberos linker RPATH require
private runtime closure/relocation review; dependency installation alone is not
that gate. Browser-safe fixture ports and a fresh full Node repeat remain open.
No further stage was started after the user's stop request.
