# Iteration 259 — independent Ubuntu 24.04 native archive runtime

2026-10-16. Implements a named Stage 0 / BUILD_AND_DEPLOY §1 Ubuntu baseline
runtime check after iteration 258. The new verification-only Dockerfile pins
Ubuntu 24.04 image digest
`534baea6a22c03a63003dbc8dbe78fe34bc0d7e595d9a9dc9834884ff530eb55`
(actual `/etc/os-release`: Ubuntu 24.04.5 LTS). It copies only the Node 24.21.0
binary from the existing pinned Node image, the tested native TGZ and the
independent probe. No package installation or SDK/workspace copy is used.
The two known system libudev fallback files are removed only inside this
disposable image; system FreeRDP is absent.

The exact iteration 258 archive
`f550c9790f6c313ff6449d5921ebc9ac8cccaf53692615890636046808bb86f5`
builds and runs in `freerdp-bridge-native-ubuntu-check:259`. Build steps have
network disabled. Actual execution uses UID/GID 1000, no network, init, read-only
root, dropped capabilities, no-new-privileges and the same bounded private tmpfs
as the Bookworm fixture. It passes FreeRDP 3.32.1, six canonical private loaded
modules, codec/libudev-context roundtrips, worker/addon pairing hashes and RWS1
record, three HELLO/heartbeat/shutdown acknowledgements and joined empty-runtime
cleanup. No RDP host or device is contacted.

The Bookworm-built native archive now has independent Bookworm and Ubuntu 24.04
runtime evidence. This does not establish Ubuntu source compilation, all distro
profiles, the full Node API/service image, physical device/RDP acceptance or CI.
Stage 0 stays IN PROGRESS. Logs:
`build/iteration-259-ubuntu-runtime-image.log`,
`build/iteration-259-ubuntu-runtime.log`.

Reproduce after preparing the desired native archive context:

```sh
node scripts/prepare-native-runtime-check.mjs build/ACTUAL/native-linux.tar.gz
docker build --network none -f docker/native-runtime-ubuntu-check.Dockerfile \
  -t freerdp-bridge-native-ubuntu-check build/native-runtime-check
docker run --rm --network none --init --read-only --cap-drop ALL \
  --security-opt no-new-privileges \
  --tmpfs /run/rdp-bridge-tests:rw,noexec,nosuid,nodev,size=16m,uid=1000,gid=1000,mode=700 \
  freerdp-bridge-native-ubuntu-check
```

Use the actual archive path from the new package receipt. The first local build
used an equivalent dedicated whitelist context with this Dockerfile copied as
`Dockerfile`; it did not replace the historical release image or archive.
