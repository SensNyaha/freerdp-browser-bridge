"""Explicit owned-lab service fixture; never imported by the shipped service.

Reads approved ignored lab credentials locally. stdout is fixed public lifecycle
records only. SSH keys must already be pinned; no automatic key acceptance.
"""
import base64
import hashlib
import ipaddress
import json
import logging
import posixpath
import re
import secrets
import select
import shlex
import socket
import stat
import sys
import threading
import time
from pathlib import Path

SUDO_PROMPT = b'STANDALONE_LAB_SUDO_PASSWORD:'


def sudo_handshake(channel, write, password, clock=time.monotonic, pause=time.sleep):
    """Send a password only after sudo asks; cached/NOPASSWD stdin stays clean."""
    output, diagnostic = bytearray(), bytearray()
    sent = False
    due = clock() + 30
    while True:
        if channel.recv_stderr_ready():
            diagnostic.extend(channel.recv_stderr(4096))
            if len(diagnostic) > 65536:
                raise ValueError('SUDO_HANDSHAKE_LIMIT')
            prompts = diagnostic.count(SUDO_PROMPT)
            if prompts > 1:
                raise ValueError('SUDO_AUTHENTICATION_REFUSED')
            if prompts and not sent:
                write(password + '\n')
                sent = True
        if channel.recv_ready():
            output.extend(channel.recv(4096))
            if len(output) > 4096:
                raise ValueError('SUDO_HANDSHAKE_LIMIT')
            if output == b'PRIVILEGED_READY\n':
                return
            if b'\n' in output:
                raise ValueError('SUDO_HANDSHAKE_RECORD_INVALID')
        if channel.exit_status_ready() or clock() >= due:
            raise ValueError('SUDO_HANDSHAKE_UNAVAILABLE')
        pause(.02)


ROOT_PROGRAM = r'''
import hashlib,json,os,re,resource,select,signal,subprocess,sys,urllib.request
from pathlib import Path
resource.setrlimit(resource.RLIMIT_CORE,(0,0));os.umask(0o077)
def invoke(args,timeout=90):
 p=subprocess.run(args,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout)
 assert len(p.stdout)+len(p.stderr)<=1048576
 assert p.returncode==0
 return p.stdout.decode('utf8','replace').strip()
assert os.geteuid()==0
print('PRIVILEGED_READY',flush=True)
raw=sys.stdin.buffer.readline(65537);assert 0<len(raw)<=65536
data=json.loads(raw)
astra=data['lab']=='astra';version=data['version']
assert re.fullmatch(r'0\.(?:0|[1-9][0-9]{0,5})\.(?:0|[1-9][0-9]{0,5})',version)
context=Path(__file__).resolve().parent
package=Path(data['package'])
assert os.path.commonpath([str(package.resolve()),str(context.parent)])==str(context.parent)
assert package.is_file() and not package.is_symlink() and package.stat().st_size<=536870912
expected='freerdp-bridge_'+version+'_amd64.deb' if astra else 'freerdp-bridge-'+version+'-1.x86_64.rpm'
assert package.name==expected and hashlib.sha256(package.read_bytes()).hexdigest()==data['sha256']
os_release=Path('/etc/os-release').read_text()
if astra:
 assert re.search(r'^ID=["\']?astra["\']?$',os_release,re.M)
 assert Path('/etc/astra_version').read_text().strip()=='1.7.5'
else:
 assert re.search(r'^ID=["\']?redos["\']?$',os_release,re.M)
 assert re.search(r'^VERSION_ID=["\']?7\.3["\']?$',os_release,re.M)
assert Path('/run/systemd/system').is_dir()
assert not Path('/opt/freerdp-bridge').exists()
assert invoke(['systemctl','show','freerdp-bridge.service','--property=LoadState','--value'])=='not-found'
configuration=Path('/etc/freerdp-bridge/bridge.json')
default={'schemaVersion':1,'listen':{'host':'127.0.0.1','port':8080},'allowedOrigins':[],'targets':[],'limits':{'maxSessions':8,'maxPerPrincipal':2}}
parent=configuration.parent
original=None
if parent.exists():
 assert parent.is_dir() and not parent.is_symlink()
 assert sorted(p.name for p in parent.iterdir())==(['bridge.json'] if astra else ['bridge.json.rpmsave'])
 retained=configuration if astra else Path(str(configuration)+'.rpmsave')
 assert retained.is_file() and not retained.is_symlink() and retained.stat().st_uid==0
 original=retained.read_bytes();assert len(original)<=65536 and json.loads(original)==default
settings=data['configuration']
assert set(settings)=={'schemaVersion','listen','allowedOrigins','targets','limits','auth'}
assert settings['schemaVersion']==1 and settings['listen']=={'host':'127.0.0.1','port':8080}
assert settings['targets']==[data['approvedTarget']]
assert settings['limits']=={'maxSessions':1,'maxPerPrincipal':1}
assert len(settings['allowedOrigins'])==1 and re.fullmatch(r'http://127\.0\.0\.1:[0-9]{4,5}',settings['allowedOrigins'][0])
assert set(settings['auth'])=={'issuer','audience','jwks'} and set(settings['auth']['jwks'])=={'keys'}
assert settings['auth']['issuer']=='https://standalone-lab.example.test' and settings['auth']['audience']=='bridge'
keys=settings['auth']['jwks']['keys'];assert len(keys)==1
assert set(keys[0])=={'kty','n','e','kid','alg','use'} and keys[0]['kty']=='RSA' and keys[0]['alg']=='RS256'
installed=False;clean=False
def interrupted(_signal,_frame): raise SystemExit(2)
for number in (signal.SIGHUP,signal.SIGTERM,signal.SIGINT): signal.signal(number,interrupted)
try:
 invoke(['dpkg','--install',str(package)] if astra else ['rpm','--upgrade',str(package)],120)
 installed=True
 invoke(['systemctl','stop','freerdp-bridge.service'])
 if original is None: original=configuration.read_bytes()
 assert json.loads(original)==default
 configuration.write_text(json.dumps(settings))
 invoke(['systemctl','start','freerdp-bridge.service'])
 due=__import__('time').monotonic()+25
 while True:
  try:
   with urllib.request.urlopen('http://127.0.0.1:8080/rdp/healthz',timeout=1) as response:
    assert response.status==200
   break
  except Exception:
   assert __import__('time').monotonic()<due
   __import__('time').sleep(.1)
 pid=int(invoke(['systemctl','show','freerdp-bridge.service','--property=MainPID','--value']))
 uid=int(re.search(r'^Uid:\s+(\d+)',Path('/proc/'+str(pid)+'/status').read_text(),re.M).group(1))
 assert uid==int(invoke(['id','-u','freerdp-bridge'])) and uid!=0
 print('STANDALONE_READY',flush=True)
 assert select.select([sys.stdin.buffer],[],[],240)[0]
 stop=sys.stdin.buffer.read(1);assert stop in (b'',b'\x01')
 assert list(Path('/run/freerdp-bridge').iterdir())==[]
 clean=True
finally:
 if installed:
  invoke(['systemctl','stop','freerdp-bridge.service'])
  assert invoke(['systemctl','show','freerdp-bridge.service','--property=MainPID','--value'])=='0'
  if original is not None: configuration.write_bytes(original)
  invoke(['dpkg','--remove','freerdp-bridge'] if astra else ['rpm','--erase','freerdp-bridge'],120)
  assert not Path('/opt/freerdp-bridge/node/node').exists()
  retained=configuration if astra else Path(str(configuration)+'.rpmsave')
  if astra or retained.exists(): assert retained.read_bytes()==original
 if clean: print('STANDALONE_LAB_CLEAN',flush=True)
'''


def main():
    if len(sys.argv) != 6:
        raise ValueError('usage')
    lab, package, digest, version, port_text = sys.argv[1:]
    assert lab in ('astra', 'redos')
    assert re.fullmatch(r'[a-f0-9]{64}', digest)
    assert re.fullmatch(r'0\.(?:0|[1-9][0-9]{0,5})\.(?:0|[1-9][0-9]{0,5})', version)
    assert 1024 <= int(port_text) <= 65535
    assert package.startswith('/home/') and '..' not in package.split('/')
    repository = Path(__file__).resolve().parents[2]
    assert Path.cwd().resolve() == repository
    sys.path.insert(0, str(repository / '.tools/linux-ssh-client'))
    import paramiko
    logging.getLogger('paramiko').addHandler(logging.NullHandler())
    logging.getLogger('paramiko').propagate = False
    private = repository / '.local-tests'
    config = json.loads((private / ('astra-ssh.json' if lab == 'astra' else 'linux-host.json')).read_text('utf8'))
    ssh = config if lab == 'astra' else config['ssh']
    assert ipaddress.ip_address(config['host']).is_private
    known = private / ssh['knownHostsFile']
    assert known.resolve().parent == private.resolve()
    fields = known.read_text('ascii').strip().split()
    actual = 'SHA256:' + base64.b64encode(hashlib.sha256(base64.b64decode(fields[2])).digest()).decode().rstrip('=')
    assert actual == ssh['hostKeyFingerprint']
    credential = private / config['credentialFile']
    assert credential.resolve().parent == private.resolve()
    client = paramiko.SSHClient()
    client.get_host_keys().add(config['host'], fields[1], paramiko.PKey.from_type_string(fields[1], base64.b64decode(fields[2])))
    client.set_missing_host_key_policy(paramiko.RejectPolicy())
    credentials = json.loads(credential.read_text('utf8'))
    listener = socket.socket()
    if hasattr(socket, 'SO_EXCLUSIVEADDRUSE'):
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
    else:
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    listener.bind(('127.0.0.1', int(port_text)))
    listener.listen(16)
    listener.settimeout(.5)
    closing = threading.Event()
    slots = threading.BoundedSemaphore(16)
    phase = 'ssh-connect'
    channel = None
    root_input = None
    failed = False
    try:
        client.connect(config['host'], port=int(ssh.get('port', 22)), username=credentials['username'], password=credentials['password'], look_for_keys=False, allow_agent=False, timeout=10, banner_timeout=10, auth_timeout=10)
        sftp = client.open_sftp()
        home = sftp.normalize('.')
        parent = posixpath.join(home, 'freerdp-bridge-tests')
        info = sftp.lstat(parent)
        assert stat.S_ISDIR(info.st_mode) and not info.st_mode & 0o077
        assert package.startswith(parent + '/')
        context = posixpath.join(parent, 'standalone-desktop-' + secrets.token_hex(6))
        sftp.mkdir(context, mode=0o700)
        script = posixpath.join(context, 'service.py')
        with sftp.file(script, 'w') as output:
            output.write(ROOT_PROGRAM)
        sftp.close()
        settings_line = sys.stdin.buffer.readline(65537)
        assert 0 < len(settings_line) <= 65536
        settings = json.loads(settings_line)
        phase = 'service-install'
        root_input, root_output, root_error = client.exec_command("sudo -S -p STANDALONE_LAB_SUDO_PASSWORD: -- /usr/bin/python3 " + shlex.quote(script), timeout=300)
        channel = root_output.channel
        def private_write(value):
            root_input.write(value)
            root_input.flush()
        sudo_handshake(channel, private_write, credentials['password'])
        credentials.pop('password', None)
        def record():
            value = root_output.readline(4097)
            assert len(value) <= 4096 and value
            return value.strip()
        phase = 'service-config-start'
        rdp = json.loads((private / 'astra-xrdp-lab.json').read_text('utf8')) if lab == 'astra' else config
        assert rdp['host'] == config['host']
        approved = {'host': rdp['host'], 'port': int(rdp.get('port', 3389))}
        public = {'lab': lab, 'package': package, 'sha256': digest, 'version': version, 'configuration': settings, 'approvedTarget': approved}
        root_input.write(json.dumps(public) + '\n')
        root_input.flush()
        assert record() == 'STANDALONE_READY'

        def relay(incoming):
            remote = None
            try:
                remote = client.get_transport().open_channel('direct-tcpip', ('127.0.0.1', 8080), incoming.getpeername(), timeout=10)
                while not closing.is_set():
                    readable = select.select([incoming, remote], [], [], .5)[0]
                    for source in readable:
                        block = source.recv(65536)
                        if not block:
                            return
                        (remote if source is incoming else incoming).sendall(block)
            except Exception:
                pass
            finally:
                incoming.close()
                if remote:
                    remote.close()
                slots.release()

        def accept():
            while not closing.is_set():
                try:
                    incoming, _address = listener.accept()
                except socket.timeout:
                    continue
                except OSError:
                    return
                if not slots.acquire(blocking=False):
                    incoming.close()
                    continue
                threading.Thread(target=relay, args=(incoming,), daemon=True).start()

        threading.Thread(target=accept, daemon=True).start()
        phase = 'desktop'
        print(json.dumps({'code': 'STANDALONE_READY', 'serverPlatform': 'linux-x64-gnu'}), flush=True)
        stop = sys.stdin.buffer.read(1)
        assert stop in (b'', b'\x01')
        phase = 'service-retirement'
        root_input.write('\x01')
        root_input.flush()
        root_input.channel.shutdown_write()
        assert record() == 'STANDALONE_LAB_CLEAN'
        assert channel.recv_exit_status() == 0
        print(json.dumps({'code': 'STANDALONE_LAB_CLEAN'}), flush=True)
    except Exception:
        failed = True
        failure = {'code': 'STANDALONE_LAB_FAILED', 'phase': phase}
        if channel and channel.exit_status_ready():
            diagnostic = root_error.read(65537)
            if len(diagnostic) <= 65536:
                lines = re.findall(rb'line ([0-9]{1,4})', diagnostic)
                if lines:
                    failure['rootLine'] = int(lines[0])
        print(json.dumps(failure), flush=True)
        raise
    finally:
        credentials.pop('password', None)
        closing.set()
        listener.close()
        if root_input:
            try:
                root_input.channel.shutdown_write()
            except Exception:
                pass
        # EOF asks the privileged fixture to restore/remove its installation.
        # Keep SSH alive long enough to observe bounded cleanup on client errors.
        if channel and not channel.exit_status_ready():
            deadline = time.monotonic() + 40
            while not channel.exit_status_ready() and time.monotonic() < deadline:
                time.sleep(.1)
        if failed and channel and channel.exit_status_ready():
            diagnostic = root_error.read(65537)
            if len(diagnostic) <= 65536:
                lines = re.findall(rb'line ([0-9]{1,4})', diagnostic)
                if lines:
                    print(json.dumps({'code': 'STANDALONE_LAB_FAILED', 'rootLine': int(lines[0])}), flush=True)
        client.close()


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'code': 'STANDALONE_LAB_FAILED', 'errorType': type(error).__name__}), flush=True)
        sys.exit(1)
