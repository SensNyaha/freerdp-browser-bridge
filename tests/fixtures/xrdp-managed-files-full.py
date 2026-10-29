"""Explicit owned XRDP resource probe; only the two supplied test shares."""
import errno
import hashlib
import json
import os
import re
import sys
import time
from pathlib import Path


def main():
    raw = sys.stdin.buffer.readline(4097)
    assert 0 < len(raw) <= 4096 and raw.endswith(b'\n')
    data = json.loads(raw)
    assert set(data) == {'id', 'rw', 'ro', 'seedSha', 'phase'}
    assert re.fullmatch('[0-9a-f]{32}', data['id'])
    assert re.fullmatch('[0-9a-f]{64}', data['seedSha'])
    assert data['phase'] in ('fill', 'clean')
    assert data['rw'] == 'RW' + data['id'][:5]
    assert data['ro'] == 'RO' + data['id'][:5]
    base = Path.home() / 'thinclient_drives'
    deadline = time.monotonic() + 25
    while not (os.path.ismount(str(base)) and (base / data['rw']).is_dir()
               and (base / data['ro']).is_dir()):
        assert time.monotonic() < deadline
        time.sleep(.1)
    assert not base.is_symlink()
    share = base / data['rw']
    for name in (data['rw'], data['ro']):
        seed = base / name / 'seed.bin'
        assert not seed.is_symlink() and seed.stat().st_size <= 512
        assert hashlib.sha256(seed.read_bytes()).hexdigest() == data['seedSha']
    path = share / 'owned-resource-full.bin'
    block = bytes((i * 17 + 83) & 255 for i in range(65536))
    if data['phase'] == 'fill':
        assert {p.name for p in share.iterdir()} == {'seed.bin'}
        accepted = 0
        failure = None
        try:
            # A fixed 2 MiB maximum inside the verified owned test share.
            with path.open('xb', buffering=0) as stream:
                while accepted < 2097152:
                    offset = accepted % len(block)
                    chunk = (block[offset:] + block[:offset])[:2097152 - accepted]
                    count = stream.write(chunk)
                    assert count and count <= len(chunk)
                    accepted += count
        except OSError as error:
            # XRDP versions may map a failed RDPDR write to generic EIO. The
            # client must independently prove its private tmpfs is exhausted.
            assert error.errno in (errno.ENOSPC, errno.EIO)
            failure = error.errno
        assert failure is not None and path.is_file() and not path.is_symlink()
        print(json.dumps({'event': 'remote-drive-full', 'errno': failure,
                          'writeAcceptedBytes': accepted,
                          'rdpReportedBytes': path.stat().st_size}), flush=True)
    else:
        assert {p.name for p in share.iterdir()} == {'seed.bin', path.name}
        assert path.is_file() and not path.is_symlink()
        size = 0
        with path.open('rb', buffering=0) as stream:
            while True:
                value = stream.read(65536)
                if not value:
                    break
                offset = size % len(block)
                expected = block[offset:] + block[:offset]
                assert value == expected[:len(value)]
                size += len(value)
                assert size <= 1048576
        assert size > 0
        path.unlink()
        assert {p.name for p in share.iterdir()} == {'seed.bin'}
        print(json.dumps({'event': 'remote-drive-full-cleaned', 'bytes': size}), flush=True)


try:
    main()
except Exception as error:
    print(json.dumps({'event': 'failed', 'phase': 'owned-drive-full',
                      'kind': type(error).__name__,
                      'errno': getattr(error, 'errno', None)}), flush=True)
    sys.exit(1)
