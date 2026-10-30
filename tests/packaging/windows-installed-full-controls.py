"""Pure admission and owned pipe controls. No MSI, mount, RDP or host helper."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

source = Path(__file__).with_name('windows-installed-files.py')
spec = importlib.util.spec_from_file_location('owned_msi_coordinator', source)
owned = importlib.util.module_from_spec(spec)
spec.loader.exec_module(owned)


class Controls(unittest.TestCase):
    def test_context(self):
        env = {'GITHUB_ACTIONS': 'true', 'RUNNER_OS': 'Windows'}
        owned.require_ci('nt', env)
        for platform, value in [('posix', env), ('nt', {}),
                                ('nt', dict(env, GITHUB_ACTIONS='false')),
                                ('nt', dict(env, RUNNER_OS='Linux'))]:
            with self.assertRaises(owned.Refused):
                owned.require_ci(platform, value)

    def test_environment_excludes_tokens_options_and_credentials(self):
        value = {'PATH': 'tools', 'SystemRoot': 'system', 'GITHUB_ACTIONS': 'true',
                 'RUNNER_OS': 'Windows', 'GITHUB_TOKEN': 'PRIVATE-fixture',
                 'PASSWORD': 'PRIVATE-fixture', 'NODE_OPTIONS': '--inspect',
                 'NPM_TOKEN': 'PRIVATE-fixture'}
        self.assertEqual(owned.child_environment(value), {
            'PATH': 'tools', 'SystemRoot': 'system',
            'GITHUB_ACTIONS': 'true', 'RUNNER_OS': 'Windows'})

    def test_verdict_binds_physical_profile_and_exact_published_bytes(self):
        value = {'event': 'installed-msi-files-verified', 'actualInstalledService': True,
                 'actualRdp': True, 'nativePidExited': True, 'staleLocatorRefused': True,
                 'maxFileQuotaRefused': True, 'syntheticRdp': False, 'http507s': 13,
                 'unicodeRenameBytes': 65599, 'chunkedUploadBytes': 131111,
                 'readOnlyRefusals': 3, 'workerSha256': 'a' * 64,
                 'msiSha256': 'b' * 64, 'nativePackageFilesMatched': 14}
        self.assertEqual(owned.validate_verdict(value, 'b' * 64, 'a' * 64), value)
        extra = dict(value, unexpectedPrivateField='PRIVATE-fixture')
        self.assertNotIn('unexpectedPrivateField', owned.validate_verdict(extra, 'b' * 64, 'a' * 64))
        for change in [{'syntheticRdp': True}, {'actualRdp': False}, {'http507s': 12},
                       {'readOnlyRefusals': 2}, {'workerSha256': 'c' * 64},
                       {'nativePackageFilesMatched': True}, {'nativePackageFilesMatched': 10001},
                       {'maxFileQuotaRefused': False}, {'nativePidExited': False}]:
            with self.assertRaises(owned.Refused):
                owned.validate_verdict(dict(value, **change), 'b' * 64, 'a' * 64)

    def test_public_metadata_bound_and_build_containment(self):
        directory = Path(tempfile.mkdtemp(prefix='bridge-msi-controls-')).resolve()
        self.assertEqual(directory.parent, Path(tempfile.gettempdir()).resolve())
        self.assertTrue(directory.name.startswith('bridge-msi-controls-'))
        file = directory / 'public.json'
        try:
            file.write_text('{"public":true}', encoding='utf8')
            self.assertEqual(owned.public_json(file), {'public': True})
            self.assertEqual(owned.beneath(directory, file), file)
            with self.assertRaises(owned.Refused):
                owned.beneath(directory, directory.parent)
            with self.assertRaises(owned.Refused):
                owned.public_json(file, 3)
        finally:
            file.unlink()
            directory.rmdir()

    def test_owned_private_child_reply_and_join(self):
        code = "import sys,json; value=json.loads(sys.stdin.readline()); print(json.dumps({'ready':len(value['password'])>0}),flush=True)"
        child = owned.OwnedProcess([sys.executable, '-c', code], source.parents[2])
        try:
            child.send({'password': 'PRIVATE-owned-fixture'}, eof=True)
            self.assertEqual(child.next(10), {'ready': True})
            self.assertEqual(child.finish(), 0)
        finally:
            child.stop()
        self.assertIsNotNone(child.process.poll())
        self.assertTrue(child.process.stdin.closed)

    def test_child_protocol_limits_refuse_before_raw_output_is_retained(self):
        for code in ["print('x'*32769,flush=True)", "print('[]',flush=True)"]:
            child = owned.OwnedProcess([sys.executable, '-c', code], source.parents[2])
            try:
                child.process.stdin.close()
                with self.assertRaises(owned.Refused):
                    child.next(10)
            finally:
                child.stop()
            self.assertTrue(child.reader_failed)


if __name__ == '__main__':
    unittest.main()
