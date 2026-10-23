# FreeRDP Bridge portable web service

Extract the complete archive to a directory you own. Keep `node/`, `service/`
and the platform launcher together. No globally installed Node.js/npm/FreeRDP is
used. This is a web service with a browser interface, not a desktop GUI.

The shipped `config/bridge.json` listens on loopback port 8080 and denies new
sessions until public identity verification keys and approved RDP targets are
configured. It accepts public deployment settings only; never save JWTs, RDP
passwords or private signing keys in that file. Restart after configuration/key
changes. Place an existing HTTPS ingress in front for remote access, preserve
WebSocket upgrades and exclude credentials/attach queries from proxy logs.

Windows x64, from PowerShell:

```powershell
./start.ps1
./start.ps1 -Configuration C:\bridge-config\bridge.json -RuntimeRoot C:\bridge-runtime\portable
```

Custom paths must be fully qualified drive paths, as in the example above.
The default runtime is private per-user LocalAppData. A custom runtime's parent
must already exist. The launcher creates a private directory when absent and
refuses a reparse point, foreign owner or permissive existing ACL. It never
rewrites an existing directory's permissions. Use Ctrl+C for joined shutdown.

Linux x64/glibc, as an ordinary user:

```sh
./start.sh
./start.sh --config /absolute/bridge.json --runtime-root /absolute/private-runtime
```

The default runtime is a per-user 0700 directory under XDG_RUNTIME_DIR or /tmp.
Custom runtime parents must already exist. Root, symlinks, foreign ownership and
permissions other than 0700 are refused. SIGTERM/Ctrl+C joins worker shutdown.

Open `http://127.0.0.1:8080/viewer/` locally. Apply an application JWT, then enter
the approved RDP destination and credentials separately. Session credentials
remain in memory/private IPC. Image/input/resize/audio/text clipboard depend on
the runtime's capability report and the accepted RDP profile. VM/user provisioning,
recording, shared viewing and arbitrary browser USB/smartcards are not provided.

Replace the program directory with a new verified complete archive while the
service is stopped. Keep a public configuration outside it if it should survive
replacement. To uninstall, stop the service and remove only this extracted
program directory and your own empty runtime; no system service is registered.
The MSI/DEB/RPM variants provide OS service integration instead.

See `THIRD_PARTY.md`, Node's LICENSE and individual npm/native inventories.
Native corresponding-source companions accompany the final release.
