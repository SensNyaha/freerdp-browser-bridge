# Optional Linux container device mappings

This is an operator configuration reference for Stage 10. The default service
container mounts no host devices or PC/SC socket. These optional arguments do
not activate redirection: the packaged backend, explicit administrator policy,
session capability and the device-specific acceptance test must all support it.

Current public configuration validation rejects non-empty USB, serial,
parallel and smartcard selections and host printer selections. Compiled FreeRDP
channels are build diagnostics, not accepted device capabilities. The mappings
below have not been executed against physical devices; Stage 8 remains open.

## Mapping reference

Choose only the row needed by the deployment and retain the non-root runtime,
init, read-only root, bounded private runtime tmpfs, dropped capabilities and
no-new-privileges from [the service baseline](CONTAINER_RUNTIME.md).
`--device` paths and mount sources are administrator-owned deployment inputs.

| Access | Example Docker argument | Prerequisites and acceptance boundary |
| --- | --- | --- |
| One USB device | `--device=/dev/bus/usb/001/002:/dev/bus/usb/001/002:rw` | Allowlisted libusb/URBDRC selection, matching host permissions and actual remote enumeration. Bus/address and node can change after reconnect; repeat explicit selection/mapping and unplug/replug acceptance. |
| One DRI render node | `--device=/dev/dri/renderD128:/dev/dri/renderD128:rw` | An implemented backend that requires this node, host permissions and measured codec/resource acceptance. The current software OpenH264 profile needs no DRI mapping and has no accepted GPU capability. |
| One serial port | `--device=/dev/ttyUSB0:/dev/ttyUSB0:rw` | Administrator allowlist mapping a logical COM name to the container path, host permissions, compiled Linux serial client and pseudo-TTY/device loopback acceptance. |
| Host PC/SC daemon | `--mount=type=bind,source=/run/pcscd,target=/run/pcscd,readonly` | An existing dedicated daemon socket directory, compatible PC/SC client/backend, matching configured socket path and socket permissions. Reader selection, PIN flow and card/emulator integration remain required. The example directory is host-specific. |

Use the host device/socket's numeric access group when supplementary group
membership is required. `--group-add=<numeric-host-gid>` augments the service's
UID1000 identity; the host's ordinary device/socket permissions still apply.
The USB/serial/DRI examples request read/write access to an existing node and
grant no device-node creation permission.

A read-only PC/SC directory mount controls filesystem changes in that mount;
the daemon protocol can still perform card operations. Reader and operation
policy remains necessary. Mount the dedicated socket directory so daemon socket
replacement is visible, and verify reconnect behavior for the actual deployment.

## Serial deployment example

The following Linux shell example illustrates one optional serial mapping
after its backend/policy/acceptance prerequisites are met. Replace the device
path with the administrator-selected node. It is a reference command, not a
verified serial feature or an instruction to enable a currently refused API
setting. Keep the application-owned authentication bootstrap from the service
baseline when protected API routes are required.

```sh
host_device=/dev/ttyUSB0
host_device_gid=$(stat -c '%g' -- "$host_device")
docker run --rm --init --read-only --user 1000:1000 --cap-drop ALL \
  --security-opt no-new-privileges \
  --tmpfs /run/freerdp-bridge:rw,noexec,nosuid,nodev,size=16m,uid=1000,gid=1000,mode=700 \
  --group-add "$host_device_gid" \
  --device="$host_device:$host_device:rw" \
  -p 127.0.0.1:8080:8080 freerdp-bridge-service
```

Container mappings apply to the container's processes. Per-session selection,
ownership and multi-user isolation require the worker policy/device lifecycle
implementation; mounting a node does not provide those properties. Keep PINs
and RDP credentials on private session IPC, as required by
[SECURITY](../SECURITY.md), never in these deployment arguments or environment.

Browser audio uses the virtual RDPSND/AUDIN backends and needs no host sound
device mapping. Browser-host physical USB, serial and smartcards follow the
separate companion design in [DEVICE_REDIRECTION](../DEVICE_REDIRECTION.md).
This document adds no companion implementation.

The per-device [test matrix](../TEST_PLAN.md) remains the acceptance authority.
No mapping here closes device integration, hotplug, resource/soak or isolation
gates. The release Dockerfile, image, presets and dependency versions are
unchanged. Documentation verification is recorded in [iteration 290](ITERATION_290.md).
