"""Explicit isolated lab only: real local daemons, virtual readers, no jobs/cards/RDP."""
import hashlib
import json
import os
from pathlib import Path
import signal
import stat
import subprocess
import time


def require(value):
    if not value:
        raise RuntimeError('OWNED_INVENTORY_LAB_REFUSED')


payload = Path('/input')
work = Path('/tmp/bridge-owned-inventory-daemons')
processes = []
logs = []
private_created = False
report = {'accepted': False, 'scope': 'rootless local CUPS and virtual PCSC metadata only',
          'rdp': False, 'printJobs': False, 'cardOperations': False, 'cleanup': []}


def probe():
    environment = {'PATH': '/usr/bin:/bin', 'HOME': str(work), 'LANG': 'C.UTF-8',
                   'LD_LIBRARY_PATH': str(payload / 'lib'),
                   'CUPS_SERVER': '203.0.113.1:631'}
    result = subprocess.run([str(payload / 'artifacts/inventory-probe')],
                            env=environment, stdin=subprocess.DEVNULL,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            timeout=8, check=False)
    require(result.returncode == 0 and len(result.stdout) <= 4096 and len(result.stderr) <= 4096)
    rows = [json.loads(line) for line in result.stdout.decode('utf-8').splitlines()]
    require(len(rows) == 5)
    total = 0
    for number, row in enumerate(rows, 1):
        require(type(row) is dict and set(row) == {'class', 'status', 'count'})
        require(type(row['class']) is int and row['class'] == number)
        require(type(row['status']) is int and 0 <= row['status'] <= 5)
        require(type(row['count']) is int and 0 <= row['count'] <= 16)
        require(row['status'] in (0, 4) or row['count'] == 0)
        total += row['count']
    require(total <= 16)
    return rows


def launch(name, command):
    log = open(work / (name + '.log'), 'xb')
    logs.append(log)
    process = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=log, stderr=log,
                               env={'PATH': '/usr/sbin:/usr/bin:/sbin:/bin',
                                    'HOME': str(work), 'LANG': 'C.UTF-8'})
    processes.append((name, process))
    return process


def await_socket(path, process):
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        require(process.poll() is None)
        if path.exists() and stat.S_ISSOCK(path.stat().st_mode):
            return
        time.sleep(0.05)
    require(False)


def stop_all():
    healthy = True
    while processes:
        name, process = processes.pop()
        forced = False
        try:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    forced = True
                    process.kill()
                    process.wait(timeout=2)
        except Exception:
            healthy = False
        report['cleanup'].append({'daemon': name, 'exited': process.poll() is not None,
                                  'forced': forced, 'code': process.returncode})
        healthy = healthy and not forced and process.returncode in (0, -signal.SIGTERM)
    require(healthy)


try:
    require(os.name == 'posix' and os.getuid() == 1000 and Path('/.dockerenv').is_file())
    require(not work.exists() and Path('/run/cups').is_dir() and Path('/run/pcscd').is_dir())
    require(not Path('/run/cups/cups.sock').exists() and not Path('/run/pcscd/pcscd.comm').exists())
    require((payload / 'manifest.json').stat().st_size <= 65536)
    raw = (payload / 'manifest.json').read_bytes()
    require(len(raw) <= 65536)
    manifest = json.loads(raw)
    binary = payload / 'artifacts/inventory-probe'
    require(binary.is_file() and not binary.is_symlink() and binary.stat().st_size <= 2097152)
    require(hashlib.sha256(binary.read_bytes()).hexdigest() == manifest['probeSha256'])
    require(len(manifest['libraries']) <= 90)
    for name, digest in manifest['libraries'].items():
        library = payload / 'lib' / name
        require(library.parent == payload / 'lib' and library.is_file() and not library.is_symlink())
        require(library.stat().st_size <= 67108864)
        require(hashlib.sha256(library.read_bytes()).hexdigest() == digest)
    work.mkdir(mode=0o700)
    private_created = True
    for name in ['conf', 'cache', 'spool', 'temp', 'ssl', 'readers']:
        (work / name).mkdir(mode=0o700)
    report['before'] = probe()
    require(report['before'][0]['status'] == 1 and report['before'][1]['status'] == 1)
    (work / 'conf/printers.conf').write_text('''<Printer BridgeOwnedQueue>
Info BridgeOwnedQueue
DeviceURI ipp://127.0.0.1:9/owned
State Idle
Accepting No
Shared No
JobSheets none none
</Printer>
''', encoding='utf-8')
    (work / 'cups-files.conf').write_text(f'''User bridge-inventory
Group bridge-inventory
SystemGroup lpadmin
LogFileGroup bridge-inventory
ServerRoot {work}/conf
StateDir /run/cups
RequestRoot {work}/spool
CacheDir {work}/cache
TempDir {work}/temp
ServerKeychain {work}/ssl
DataDir /usr/share/cups
ServerBin /usr/lib/cups
AccessLog {work}/access.log
ErrorLog {work}/error.log
PageLog {work}/page.log
''', encoding='utf-8')
    (work / 'cupsd.conf').write_text('''ServerName localhost
Listen /run/cups/cups.sock
Browsing Off
WebInterface No
LogLevel error
MaxLogSize 65536
MaxClients 4
Timeout 3
KeepAlive No
<Location />
Order allow,deny
Allow all
</Location>
''', encoding='utf-8')
    (work / 'readers/vpcd').write_text('''FRIENDLYNAME "Virtual PCD"
DEVICENAME /dev/null:0x8C7B
LIBPATH /usr/lib/pcsc/drivers/serial/libifdvpcd.so
CHANNELID 0x8C7B
''', encoding='utf-8')
    cups = launch('cups', ['/usr/sbin/cupsd', '-f', '-c', str(work / 'cupsd.conf'),
                           '-s', str(work / 'cups-files.conf')])
    pcsc = launch('pcsc', ['/usr/sbin/pcscd', '-f', '-c', str(work / 'readers'),
                          '-t', '4', '-s', '4', '-r', '4', '-S', '-I'])
    await_socket(Path('/run/cups/cups.sock'), cups)
    await_socket(Path('/run/pcscd/pcscd.comm'), pcsc)
    deadline = time.monotonic() + 5
    while True:
        rows = probe()
        if rows[0]['status'] == 0 and rows[0]['count'] == 1 and rows[1]['status'] == 0 and rows[1]['count'] == 2:
            break
        require(time.monotonic() < deadline)
        time.sleep(0.05)
    report['populated'] = rows
    report['repeat'] = probe()
    require(report['repeat'][:2] == rows[:2])
    require(not list((work / 'spool').iterdir()))
    stop_all()
    report['after'] = probe()
    require(report['after'][0]['status'] == 1 and report['after'][1]['status'] == 1)
    report['packages'] = Path('/opt/bridge-inventory-lab/packages.txt').read_text().splitlines()
    report['probeSha256'] = manifest['probeSha256']
    report['runtimeLibraryArchiveSha256'] = manifest['runtimeLibraryArchiveSha256']
    report['accepted'] = True
except Exception:
    report['failure'] = 'OWNED_INVENTORY_LAB_REFUSED'
    # Only fixed, owned daemon diagnostics; never device/card contents or foreign logs.
    for path in ([work / 'cups.log', work / 'pcsc.log', work / 'error.log'] if private_created else []):
        if path.is_file():
            with path.open('rb') as log:
                log.seek(max(0, path.stat().st_size - 4096))
                report[path.name] = log.read(4096).decode('utf-8', errors='replace')
finally:
    try:
        stop_all()
    except Exception:
        report['accepted'] = False
        report['cleanupFailure'] = 'OWNED_INVENTORY_LAB_CLEANUP_REFUSED'
    for log in logs:
        log.close()
    print(json.dumps(report, separators=(',', ':')))
raise SystemExit(0 if report['accepted'] else 1)
