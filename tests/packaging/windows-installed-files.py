"""Owned Windows CI only: exact public MSI, private account, bounded NTFS/RDP.

Passwords are generated in RAM and sent only over child stdin. Host stdout is
parsed privately; evidence contains selected public scalar fields, never raw IO.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import queue
import re
import secrets
import shutil
import subprocess
import threading
import time


class Refused(Exception):
    pass


def require(condition):
    if not condition:
        raise Refused('OWNED_INSTALLED_COORDINATOR_REFUSED')


def require_ci(platform, environment):
    require(platform == 'nt' and environment.get('GITHUB_ACTIONS') == 'true'
            and environment.get('RUNNER_OS') == 'Windows')


def child_environment(environment):
    allowed = {'PATH', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP',
               'PROGRAMFILES', 'PROGRAMDATA', 'COMPUTERNAME', 'GITHUB_ACTIONS',
               'RUNNER_OS', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA'}
    return {key: value for key, value in environment.items() if key.upper() in allowed}


def public_json(path, maximum=32768):
    require(not path.is_symlink() and path.is_file() and path.stat().st_size <= maximum)
    return json.loads(path.read_text(encoding='utf-8-sig'))


def beneath(build, path):
    resolved = Path(path).resolve(strict=True)
    require(build in resolved.parents)
    return resolved


class OwnedProcess:
    def __init__(self, command, root):
        self.process = subprocess.Popen(
            command, cwd=root, env=child_environment(os.environ),
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        self.lines = queue.Queue(maxsize=4)
        self.stderr_bytes = 0
        self.endpoint_protection_refused = False
        self.reader_failed = False
        self.reader_failure = None
        self.threads = [threading.Thread(target=self._stdout, daemon=True),
                        threading.Thread(target=self._stderr, daemon=True)]
        for thread in self.threads:
            thread.start()

    def _put(self, item):
        try:
            self.lines.put(item, timeout=2)
        except queue.Full:
            self.reader_failed = True
            if self.process.poll() is None:
                self.process.kill()

    def _stdout(self):
        stage = 'line-bound'
        try:
            count = 0
            while True:
                data = self.process.stdout.readline(32769)
                if not data:
                    self._put(None)
                    return
                require(len(data) <= 32768 and data.endswith(b'\n'))
                count += 1
                require(count <= 64)
                stage = 'json-decode'
                value = json.loads(data.decode('utf8'))
                stage = 'record-shape'
                require(type(value) is dict)
                self._put(value)
                stage = 'line-bound'
        except Exception:
            self.reader_failed = True
            self.reader_failure = stage
            self._put(None)
            if self.process.poll() is None:
                self.process.kill()

    def _stderr(self):
        tail = b''
        for data in iter(lambda: self.process.stderr.read(4096), b''):
            self.stderr_bytes += len(data)
            self.endpoint_protection_refused |= b'ScriptContainedMaliciousContent' in tail + data
            tail = data[-64:]
            if self.stderr_bytes > 65536:
                self.reader_failed = True
                if self.process.poll() is None:
                    self.process.kill()
                return

    def send(self, value, eof=False):
        data = bytearray((json.dumps(value, ensure_ascii=True) + '\n').encode('utf8'))
        try:
            require(len(data) <= 32768)
            self.process.stdin.write(data)
            self.process.stdin.flush()
            if eof:
                self.process.stdin.close()
        finally:
            data[:] = b'\0' * len(data)

    def next(self, timeout=60):
        value = self.lines.get(timeout=timeout)
        require(value is not None and not self.reader_failed)
        return value

    def finish(self):
        code = self.process.wait(timeout=15)
        for thread in self.threads:
            thread.join(timeout=3)
            require(not thread.is_alive())
        require(not self.reader_failed and self.stderr_bytes == 0)
        return code

    def stop(self):
        if self.process.poll() is None:
            self.process.kill()
        self.process.wait(timeout=15)
        for thread in self.threads:
            thread.join(timeout=3)
        for stream in [self.process.stdin, self.process.stdout, self.process.stderr]:
            if not stream.closed:
                try:
                    stream.close()
                except OSError:
                    pass


def validate_verdict(event, msi_sha, worker_sha):
    require(event.get('event') == 'installed-msi-files-verified')
    for name in ['actualInstalledService', 'actualRdp', 'nativePidExited',
                 'staleLocatorRefused', 'maxFileQuotaRefused']:
        require(event.get(name) is True)
    require(event.get('syntheticRdp') is False)
    require(event.get('http507s') == 13 and event.get('unicodeRenameBytes') == 65599
            and event.get('chunkedUploadBytes') == 131111 and event.get('readOnlyRefusals') == 3)
    require(event.get('workerSha256') == worker_sha and event.get('msiSha256') == msi_sha)
    count = event.get('nativePackageFilesMatched')
    require(type(count) is int and 1 <= count <= 10000)
    return {name: event[name] for name in ['event', 'actualInstalledService', 'actualRdp',
            'syntheticRdp', 'http507s', 'workerSha256', 'msiSha256', 'nativePackageFilesMatched',
            'unicodeRenameBytes', 'chunkedUploadBytes', 'readOnlyRefusals', 'nativePidExited',
            'staleLocatorRefused', 'maxFileQuotaRefused']}


def main():
    require_ci(os.name, os.environ)
    parser = argparse.ArgumentParser()
    parser.add_argument('--owned-windows-msi-full', action='store_true', required=True)
    parser.add_argument('--image-directory', required=True)
    parser.add_argument('--inputs', required=True)
    parser.add_argument('--runtime-inputs', required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    build = (root / 'build').resolve(strict=True)
    inputs_path = beneath(build, args.inputs)
    descriptor = public_json(inputs_path)
    runtime_inputs = public_json(beneath(build, args.runtime_inputs))
    require(descriptor.get('publicStableRelease') is True and descriptor.get('schema') == 1)
    version = descriptor.get('version')
    require(type(version) is str and re.fullmatch(r'\d+\.\d+\.\d+', version))
    msi = beneath(build, descriptor['output'])
    require(msi.stat().st_size == descriptor['bytes'] and msi.stat().st_size <= 536870912)
    require(hashlib.sha256(msi.read_bytes()).hexdigest() == descriptor['sha256'])
    require(msi.name == 'freerdp-bridge-' + version + '-win32-x64.msi')
    require(runtime_inputs['version'] == version)
    archive = beneath(build, runtime_inputs['archive'])
    package_root = beneath(build, runtime_inputs['packageRoot'])
    lock = public_json(root / 'packaging/standalone/locks/win32-x64.json', 4194304)
    locked = lock['packages']['node_modules/@freerdp-bridge/runtime-win32-x64']
    require(locked['version'] == version and locked['integrity'] == runtime_inputs['integrity'])
    require(archive.stat().st_size <= 67108864)
    integrity = 'sha512-' + base64.b64encode(hashlib.sha512(archive.read_bytes()).digest()).decode()
    require(integrity == locked['integrity'])
    worker = package_root / 'runtime/bin/rdp-worker.exe'
    require(worker.is_file() and not worker.is_symlink() and worker.stat().st_size <= 67108864)
    worker_sha = hashlib.sha256(worker.read_bytes()).hexdigest()
    image_directory = beneath(build, args.image_directory)
    ident = secrets.token_hex(16)
    context = build / ('windows-msi-run-' + ident)
    require(not context.exists())
    base = {'id': ident, 'coordinatorPid': os.getpid()}
    host_failures = []
    powershell = str(Path(os.environ['SystemRoot']) / 'System32/WindowsPowerShell/v1.0/powershell.exe')
    helper = root / 'tests/fixtures/windows-installed-full-host.ps1'

    def host(action, **values):
        child = OwnedProcess([powershell, '-NoProfile', '-NonInteractive', '-File',
                              str(helper), '-Action', action], root)
        try:
            child.send(dict(base, **values), eof=True)
            result = child.next(timeout=155)
            code = child.finish()
            if not (code == 0 and result.get('ok') is True and result.get('action') == action):
                host_failures.append({'action': action, 'exitCode': code,
                    'lines': [v for v in result.get('lines', []) if type(v) is int and 0 < v < 10000][:6]})
                raise Refused('OWNED_INSTALLED_HOST_ACTION_REFUSED')
            require(type(result.get('result')) is dict)
            return result['result']
        finally:
            child.stop()
            if child.reader_failed or child.stderr_bytes:
                host_failures.append({'action': action, 'readerFailure': child.reader_failure,
                                      'stderrBytes': child.stderr_bytes})
            if child.endpoint_protection_refused:
                host_failures.append({'action': action, 'endpointProtectionRefused': True})

    accepted = False
    installation_observed = False
    client = None
    retired = False
    events = []
    cleanup = {}
    phase = 'mount'
    try:
        mounted = host('mount', imageDirectory=str(image_directory))
        require(Path(mounted['context']).resolve() == context)
        phase = 'rdp-state'
        host('rdp-state')
        phase = 'rdp-start'
        host('rdp-start')
        phase = 'account'
        password = 'Aa1!' + secrets.token_urlsafe(48)
        account = host('account', password=password)
        phase = 'certificate'
        certificate = host('certificate')
        require(certificate['derivedFromLocalListener'] is True)
        require(re.fullmatch('sha256:[0-9a-f]{64}', certificate['fingerprint']))
        phase = 'install'
        installed = host('install', inputs=str(inputs_path))
        require(installed['installed'] is True and installed['msiSha256'] == descriptor['sha256'])
        installation_observed = True
        phase = 'client'
        node = shutil.which('node')
        require(node is not None)
        client = OwnedProcess([node, str(root / 'tests/fixtures/windows-installed-files-client.mjs'),
                               '--owned-windows-msi-full'], root)
        boot = dict(id=ident, version=version, credentials={
            'username': account['name'], 'domain': account['domain'], 'password': password},
            userSid=account['sid'], fingerprint=certificate['fingerprint'],
            msiSha256=descriptor['sha256'], workerSha256=worker_sha,
            root=mounted['root'], proofPath=mounted['proofPath'],
            runtimePackageRoot=str(package_root), runtimeArchivePath=str(archive))
        client.send(boot)
        del boot['credentials']['password']
        password = None
        verdict = None
        due = time.monotonic() + 300
        while True:
            require(time.monotonic() < due)
            event = client.next(timeout=min(90, max(1, due - time.monotonic())))
            name = event.get('event')
            require(type(name) is str)
            phase = name if name in ['service-configuration', 'native-identity-requested',
                'owned-ci-task-requested', 'service-stop-requested'] else phase
            if name == 'service-configuration':
                ready = host('configure', configuration=event['configuration'])
                client.send(dict(command='service-ready', **ready))
            elif name == 'native-identity-requested':
                identity = host('identity')
                require(identity['workerSha256'] == worker_sha)
                client.send(dict(command='native-identity', **identity))
            elif name == 'installed-connected-http-full-verified':
                require(event.get('attempts') == 12 and event.get('httpStatus') == 507)
                require(type(event.get('confirmedBeforeProducerEofBytes')) is int
                        and 4194304 < event['confirmedBeforeProducerEofBytes'] <= 12582912)
                events.append({key: event[key] for key in ['event', 'attempts', 'httpStatus',
                              'confirmedBeforeProducerEofBytes']})
            elif name == 'owned-ci-task-requested':
                require(event.get('id') == ident)
                expected = hashlib.sha256((root / 'tests/fixtures/windows-managed-files.ps1').read_bytes()).hexdigest()
                require(event.get('scriptSha256') == expected)
                task = host('task', scriptSha256=expected)
                require(task['started'] is True and task['passwordStored'] is False)
                client.send({'command': 'owned-ci-task-started'})
            elif name == 'installed-windows-drive-full-verified':
                require(event.get('actualRdp') is True and event.get('physicalFreeBytes') == 0
                        and event.get('remoteErrno') in (39, 112) and event.get('crossHttpStatus') == 507)
                for key in ['acknowledgedBytes', 'partialBytes']:
                    require(type(event.get(key)) is int and 0 < event[key] <= 1048576)
                events.append({key: event[key] for key in ['event', 'physicalFreeBytes',
                              'remoteErrno', 'acknowledgedBytes', 'partialBytes', 'crossHttpStatus']})
            elif name == 'installed-msi-files-verified':
                verdict = validate_verdict(event, descriptor['sha256'], worker_sha)
                events.append(verdict)
            elif name == 'service-stop-requested':
                cleanup['installed'] = host('retire')
                retired = True
                client.send(dict(command='service-stopped', **cleanup['installed']))
            elif name == 'failed':
                # Never persist unvalidated child error strings or input objects.
                client_phase = event.get('phase')
                if client_phase in ['admission', 'service-configure', 'session-create',
                    'rdp-connect', 'bounded-pressure', 'connected-http-full', 'owned-ci-task',
                    'windows-drive-full', 'remote-created', 'remote-clean', 'max-file-quota',
                    'session-close']:
                    phase = 'client-' + client_phase
                events.append({'event': 'client-refused', 'sourceLine': event.get('sourceLine')
                               if type(event.get('sourceLine')) is int else 0})
            elif name == 'closed':
                require(event.get('clean') is True)
                require(client.finish() == 0 and verdict is not None and retired)
                require(len(events) == 3)
                accepted = True
                break
            else:
                raise Refused('OWNED_INSTALLED_CLIENT_EVENT_REFUSED')
    finally:
        if client is not None:
            client.stop()
        for marker, action, key in [('install.json', 'retire', 'installed'),
                                    ('rdp-state.json', 'rdp-retire', 'rdp'),
                                    ('mount-intent.json', 'unmount', 'volume')]:
            if (context / marker).exists() and not (action == 'retire' and retired):
                try:
                    cleanup[key] = host(action)
                except Exception:
                    cleanup[key] = {'failed': True}
                    accepted = False
        report = {'schema': 1, 'accepted': accepted, 'version': version, 'phase': phase,
                  'actualInstalledService': installation_observed, 'syntheticRdp': False,
                  'msiSha256': descriptor['sha256'], 'workerSha256': worker_sha,
                  'runtimeIntegrity': integrity, 'publicSourceCommit': descriptor['sourceCommit'],
                  'events': events, 'cleanup': cleanup, 'hostFailures': host_failures}
        if accepted:
            accepted = (cleanup['installed'].get('uninstalled') is True
                    and cleanup['rdp'].get('accountRemoved') is True
                    and cleanup['rdp'].get('rdpStateRestored') is True
                    and all(cleanup['volume'].get(key) is True for key in
                            ['detached', 'rootEmpty', 'sourceImagePreserved']))
        report['accepted'] = accepted
        if context.exists():
            (context / 'acceptance.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf8')
        (build / ('windows-msi-controller-' + ident + '.json')).write_text(
            json.dumps(report, indent=2) + '\n', encoding='utf8')
        print(json.dumps({'event': 'installed-windows-full-result', 'accepted': accepted,
                          'phase': phase, 'msiSha256': descriptor['sha256']}), flush=True)
    require(accepted)


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('{"event":"installed-windows-full-refused","code":"OWNED_INSTALLED_COORDINATOR_REFUSED"}', flush=True)
        raise SystemExit(1)
