"""Pure transport-fixture checks; no SSH, credentials, files or OS service writes."""
import runpy
import unittest
from pathlib import Path

module = runpy.run_path(str(Path(__file__).resolve().parents[2] / 'scripts/standalone/rdp-lab-server.py'))
handshake, prompt = module['sudo_handshake'], module['SUDO_PROMPT']
validate_files = module['validate_managed_files']


class Channel:
    def __init__(self, output=(), diagnostic=()):
        self.output, self.diagnostic, self.writes = list(output), list(diagnostic), []

    def recv_ready(self): return bool(self.output)
    def recv_stderr_ready(self): return bool(self.diagnostic)
    def recv(self, _maximum): return self.output.pop(0)
    def recv_stderr(self, _maximum): return self.diagnostic.pop(0)
    def exit_status_ready(self): return False

    def write(self, value):
        self.writes.append(value)
        self.output.append(b'PRIVILEGED_READY\n')


class FullVolumeAdmission(unittest.TestCase):
    def test_full_volume_requires_explicit_managed_files_and_boolean_flags(self):
        check = module['validate_full_volume']
        for enabled, managed in [(False, False), (False, True), (True, True)]:
            check(enabled, managed)
        for enabled, managed in [(True, False), (1, True), (True, 1), ('true', True)]:
            with self.assertRaises(AssertionError):
                check(enabled, managed)

    def test_mount_identity_rejects_parent_foreign_large_or_shared_volumes(self):
        check = module['validate_full_mount']
        source = 'bridge-owned-full-0123456789ab'
        line = '100 90 0:40 / /run/freerdp-bridge rw,nosuid,nodev,noexec - tmpfs '+source+' rw'
        info = {'uid': 999, 'gid': 998, 'mode': 0o700, 'bytes': 1048576,
                'blockBytes': 4096, 'freeBytes': 1048576}
        check(line, source, 999, 998, info)
        check(line, source, 999, 998, {**info, 'freeBytes': 0})
        for records, value in [(line+'\n'+line, info), ('', info),
            (line.replace('/run/freerdp-bridge', '/run'), info),
            (line.replace(' - tmpfs ', ' - ext4 '), info),
            (line.replace(source, 'foreign'), info),
            (line.replace(',noexec', ''), info), (line, {**info, 'bytes': 2097152}),
            (line, {**info, 'mode': 0o777}), (line, {**info, 'uid': 0}),
            (line, {**info, 'freeBytes': -1}), (line, {**info, 'bytes': True}),
            (line, {**info, 'extra': '/foreign'})]:
            with self.assertRaises(AssertionError):
                check(records, source, 999, 998, value)

class Protocol(unittest.TestCase):
    def test_file_policy_requires_explicit_selection_and_exact_bounded_values(self):
        policy = {'maxTotalBytes': 4194304, 'maxFileBytes': 2097152,
                  'maxEntries': 64, 'xrdpLegacyDelete': True}
        validate_files({}, False)
        validate_files({'files': policy}, True)
        for settings, enabled in [({'files': policy}, False), ({}, True),
                                  ({'files': {}}, True), ({}, 1),
                                  ({'files': {**policy, 'maxEntries': True}}, True),
                                  ({'files': {**policy, 'maxTotalBytes': 4194305}}, True),
                                  ({'files': {**policy, 'hostPath': '/private'}}, True)]:
            with self.assertRaises(AssertionError):
                validate_files(settings, enabled)

    def test_root_fixture_uses_the_same_file_policy_validator(self):
        namespace = {}
        source = module['ROOT_PROGRAM'].split('import hashlib,json,os,re,resource,select,signal,subprocess,sys,urllib.request')[0]
        exec(source, namespace)
        with self.assertRaises(AssertionError):
            namespace['validate_managed_files']({'files': {}}, True)
        namespace['validate_managed_files']({}, False)

    def test_cached_or_nopasswd_never_receives_a_password(self):
        channel = Channel(output=[b'PRIVILEGED_', b'READY\n'])
        handshake(channel, channel.write, 'synthetic-memory-only', pause=lambda _: None)
        self.assertEqual(channel.writes, [])

    def test_fragmented_prompt_receives_exactly_one_private_line(self):
        channel = Channel(diagnostic=[prompt[:7], prompt[7:]])
        handshake(channel, channel.write, 'synthetic-memory-only', pause=lambda _: None)
        self.assertEqual(channel.writes, ['synthetic-memory-only\n'])

    def test_repeated_prompt_does_not_replay_a_password(self):
        channel = Channel(diagnostic=[prompt + prompt])
        with self.assertRaisesRegex(ValueError, 'SUDO_AUTHENTICATION_REFUSED'):
            handshake(channel, channel.write, 'synthetic-memory-only', pause=lambda _: None)
        self.assertEqual(channel.writes, [])

    def test_stalled_handshake_has_a_fixed_deadline(self):
        channel = Channel()
        ticks = iter([0, 31])
        with self.assertRaisesRegex(ValueError, 'SUDO_HANDSHAKE_UNAVAILABLE'):
            handshake(channel, channel.write, 'synthetic-memory-only', clock=lambda: next(ticks), pause=lambda _: None)
        self.assertEqual(channel.writes, [])

    def test_malformed_ready_record_never_receives_a_password(self):
        channel = Channel(output=[b'UNEXPECTED\n'])
        with self.assertRaisesRegex(ValueError, 'SUDO_HANDSHAKE_RECORD_INVALID'):
            handshake(channel, channel.write, 'synthetic-memory-only', pause=lambda _: None)
        self.assertEqual(channel.writes, [])

    def test_diagnostic_growth_is_bounded_before_password_dispatch(self):
        channel = Channel(diagnostic=[b'x' * 4096] * 17)
        with self.assertRaisesRegex(ValueError, 'SUDO_HANDSHAKE_LIMIT'):
            handshake(channel, channel.write, 'synthetic-memory-only', pause=lambda _: None)
        self.assertEqual(channel.writes, [])


if __name__ == '__main__':
    unittest.main()
