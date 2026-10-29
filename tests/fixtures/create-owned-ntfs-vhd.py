# Own regular-file fixture only; never accepts a device path or mounts a disk.
# https://manpages.debian.org/bookworm/ntfs-3g/mkntfs.8.en.html
# https://www.qemu.org/docs/master/interop/qemu-qmp-ref.html
import hashlib
import json
import os
import stat
import struct
import subprocess
import uuid
from pathlib import Path
assert os.name == 'posix' and os.geteuid() != 0
root = Path.cwd().resolve()
build = root / 'build'
build.mkdir(mode=0o700, exist_ok=True)
assert build.is_dir() and not build.is_symlink()
assert build.stat().st_uid == os.geteuid()
assert stat.S_IMODE(build.stat().st_mode) & 0o022 == 0
folder = build / ('owned-ntfs-' + uuid.uuid4().hex)
folder.mkdir(mode=0o700)
assert folder.resolve() == folder and folder.stat().st_uid == os.geteuid()
size = 16 * 1048576
start = 2048
sectors = size // 512 - start
partition = folder / 'partition.raw'
raw = folder / 'disk.raw'
vhd = folder / 'owned-full.vhd'
roundtrip = folder / 'roundtrip.raw'
for path, length in [(partition, sectors * 512), (raw, size)]:
    with path.open('xb') as f:
        f.truncate(length)
    assert path.is_file() and (not path.is_symlink()) and (path.stat().st_nlink == 1) and (path.stat().st_size == length)
log = folder / 'tools.log'

def run(args):
    with log.open('ab') as f:
        r = subprocess.run(args, cwd=folder, stdin=subprocess.DEVNULL, stdout=f, stderr=subprocess.STDOUT, timeout=60)
    assert r.returncode == 0
run(['mkntfs', '--force', '--quick', '--sector-size', '512', '--cluster-size', '4096', '--partition-start', str(start), '--heads', '16', '--sectors-per-track', '63', '--label', 'BRIDGEFULL', '--no-indexing', str(partition)])
with partition.open('rb') as f:
    boot = f.read(512)
assert boot[3:11] == b'NTFS    ' and boot[510:512] == b'U\xaa' and (struct.unpack_from('<H', boot, 11)[0] == 512) and (struct.unpack_from('<I', boot, 28)[0] == start)
mbr = bytearray(512)
mbr[440:444] = struct.pack('<I', int.from_bytes(os.urandom(4), 'little') | 1)
mbr[446:462] = struct.pack('<B3sB3sII', 0, b'\xfe\xff\xff', 7, b'\xfe\xff\xff', start, sectors)
mbr[510:] = b'U\xaa'
with raw.open('r+b') as dst, partition.open('rb') as src:
    dst.write(mbr)
    dst.seek(start * 512)
    for block in iter(lambda: src.read(1048576), b''):
        dst.write(block)
assert not vhd.exists()
run(['qemu-img', 'convert', '-f', 'raw', '-O', 'vpc', '-o', 'subformat=fixed,force_size=on', str(raw), str(vhd)])
assert vhd.is_file() and (not vhd.is_symlink()) and (vhd.stat().st_size == size + 512)
with vhd.open('rb') as f:
    f.seek(size)
    footer = f.read(512)
assert footer[:8] == b'conectix' and struct.unpack_from('>Q', footer, 48)[0] == size and (struct.unpack_from('>I', footer, 60)[0] == 2)
checksum = struct.unpack_from('>I', footer, 64)[0]
zero = bytearray(footer)
zero[64:68] = bytes(4)
assert checksum == ~sum(zero) & 4294967295
run(['qemu-img', 'convert', '-f', 'vpc', '-O', 'raw', str(vhd), str(roundtrip)])

def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda: f.read(1048576), b''):
            h.update(b)
    return h.hexdigest()
assert roundtrip.stat().st_size == size and sha(raw) == sha(roundtrip)
proof = {'schema': 1, 'kind': 'owned-fixed-vhd-ntfs', 'diskBytes': size, 'fileBytes': size + 512, 'partitionStartSector': start, 'partitionSectors': sectors, 'ntfsSerial': boot[72:80].hex(), 'vhdIdentifier': footer[68:84].hex(), 'sha256': sha(vhd), 'rawRoundtripSha256': sha(raw), 'sourceDeviceOpened': False, 'hostMountPerformed': False}
(folder / 'volume.json').write_text(json.dumps(proof, indent=2) + '\n')
for path in [partition, raw, roundtrip]:
    assert path.parent == folder and path.resolve().parent == folder and path.is_file() and (not path.is_symlink())
    path.unlink()
print(json.dumps(dict(proof, folder=str(folder))), flush=True)
