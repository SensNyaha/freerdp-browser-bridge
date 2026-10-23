"""Pure transport-fixture checks; no SSH, credentials, files or OS service writes."""
import runpy
import unittest
from pathlib import Path

module = runpy.run_path(str(Path(__file__).resolve().parents[2] / 'scripts/standalone/rdp-lab-server.py'))
handshake, prompt = module['sudo_handshake'], module['SUDO_PROMPT']


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


class Protocol(unittest.TestCase):
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
