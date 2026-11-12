import io
import os
import subprocess
import sys
import unittest
from contextlib import redirect_stderr, redirect_stdout
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

import totp  # noqa: E402
from totp import decode_secret, hotp, parse_uri, seconds_left, time_step, verify  # noqa: E402

SCRIPT = os.path.join(os.path.dirname(__file__), "..", "scripts", "totp.py")

# RFC 4226 appendix D and RFC 6238 appendix B: the ASCII secret "1234567890..."
# repeated to the hash's block of 20, 32 or 64 bytes.
KEY = b"12345678901234567890"
KEYS = {"sha1": KEY, "sha256": (KEY * 2)[:32], "sha512": (KEY * 4)[:64]}
KEY_B32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"

RFC4226 = ["755224", "287082", "359152", "969429", "338314",
           "254676", "287922", "162583", "399871", "520489"]

RFC6238 = [  # time, code, algorithm (8 digits, 30 s steps)
    (59, "94287082", "sha1"), (59, "46119246", "sha256"), (59, "90693936", "sha512"),
    (1111111109, "07081804", "sha1"), (1111111109, "68084774", "sha256"), (1111111109, "25091201", "sha512"),
    (1111111111, "14050471", "sha1"), (1111111111, "67062674", "sha256"), (1111111111, "99943326", "sha512"),
    (1234567890, "89005924", "sha1"), (1234567890, "91819424", "sha256"), (1234567890, "93441116", "sha512"),
    (2000000000, "69279037", "sha1"), (2000000000, "90698825", "sha256"), (2000000000, "38618901", "sha512"),
    (20000000000, "65353130", "sha1"), (20000000000, "77737706", "sha256"), (20000000000, "47863826", "sha512"),
]


def call_main(args, stdin="", env=None):
    out, err = io.StringIO(), io.StringIO()
    with redirect_stdout(out), redirect_stderr(err), mock.patch("sys.stdin", io.StringIO(stdin)), \
            mock.patch.dict(os.environ, env or {}):
        try:
            code = totp.main(args)
        except SystemExit as exc:
            code = exc.code
    return code, out.getvalue(), err.getvalue()


class RfcVectorTest(unittest.TestCase):
    def test_rfc4226_hotp_values(self):
        self.assertEqual([hotp(KEY, c) for c in range(10)], RFC4226)

    def test_rfc6238_totp_values(self):
        for at, code, algorithm in RFC6238:
            with self.subTest(at=at, algorithm=algorithm):
                self.assertEqual(totp.totp(KEYS[algorithm], at, digits=8, algorithm=algorithm), code)

    def test_rfc6238_time_steps(self):
        # the T column of the RFC table
        self.assertEqual(time_step(59), 0x1)
        self.assertEqual(time_step(1111111109), 0x23523EC)
        self.assertEqual(time_step(1111111111), 0x23523ED)
        self.assertEqual(time_step(20000000000), 0x27BC86AA)


class HotpTest(unittest.TestCase):
    def test_codes_are_zero_padded(self):
        # counter 2 of RFC 4226 truncates to 137359152: 9 digits, so 10 digits needs a leading 0
        self.assertEqual(hotp(KEY, 2, digits=10), "0137359152")

    def test_digit_limits(self):
        self.assertEqual(len(hotp(KEY, 0, digits=6)), 6)
        self.assertEqual(len(hotp(KEY, 0, digits=10)), 10)
        for bad in (5, 11, 0, True, 6.0):
            with self.subTest(digits=bad), self.assertRaisesRegex(ValueError, "digits"):
                hotp(KEY, 0, digits=bad)

    def test_counter_limits(self):
        hotp(KEY, 2 ** 64 - 1)
        for bad in (-1, 2 ** 64, 1.5, True):
            with self.subTest(counter=bad), self.assertRaisesRegex(ValueError, "counter"):
                hotp(KEY, bad)

    def test_unknown_algorithm(self):
        with self.assertRaisesRegex(ValueError, "algorithm"):
            hotp(KEY, 0, algorithm="md5")


class TimeTest(unittest.TestCase):
    def test_step_boundaries(self):
        self.assertEqual(time_step(0), 0)
        self.assertEqual(time_step(29.999), 0)
        self.assertEqual(time_step(30), 1)
        self.assertEqual(time_step(90, period=60), 1)
        self.assertEqual(time_step(100, t0=40), 2)

    def test_bad_period_and_time(self):
        for bad in (0, -30, 1.5, True):
            with self.subTest(period=bad), self.assertRaisesRegex(ValueError, "period"):
                time_step(100, period=bad)
        with self.assertRaisesRegex(ValueError, "before t0"):
            time_step(10, t0=20)

    def test_now_is_the_default(self):
        with mock.patch("totp.time.time", return_value=59):
            self.assertEqual(totp.totp(KEY, digits=8), "94287082")
            self.assertEqual(seconds_left(), 1)

    def test_seconds_left(self):
        self.assertEqual(seconds_left(0), 30)
        self.assertEqual(seconds_left(29), 1)
        self.assertEqual(seconds_left(29.5), 1)
        self.assertEqual(seconds_left(61, period=60), 59)


class VerifyTest(unittest.TestCase):
    def test_current_code_is_step_zero(self):
        self.assertEqual(verify(KEY, "94287082", at=59, digits=8), 0)

    def test_neighbouring_steps_inside_the_window(self):
        previous = totp.totp(KEY, 59 - 30, digits=8)
        following = totp.totp(KEY, 59 + 30, digits=8)
        self.assertEqual(verify(KEY, previous, at=59, digits=8), -1)
        self.assertEqual(verify(KEY, following, at=59, digits=8), 1)
        self.assertIsNone(verify(KEY, following, at=59, digits=8, window=0))

    def test_outside_the_window_fails(self):
        later = totp.totp(KEY, 59 + 90, digits=8)
        self.assertIsNone(verify(KEY, later, at=59, digits=8, window=2))
        self.assertEqual(verify(KEY, later, at=59, digits=8, window=3), 3)

    def test_window_never_goes_below_step_zero(self):
        self.assertEqual(verify(KEY, hotp(KEY, 0), at=0, window=5), 0)

    def test_spaces_are_ignored(self):
        self.assertEqual(verify(KEY, "9428 7082", at=59, digits=8), 0)
        self.assertEqual(verify(KEY, " 94287082\n", at=59, digits=8), 0)

    def test_malformed_codes_are_just_wrong(self):
        for bad in ("", "9428708", "942870820", "9428708x", "٩٤٢٨٧٠٨٢", "+4287082"):
            with self.subTest(code=bad):
                self.assertIsNone(verify(KEY, bad, at=59, digits=8))

    def test_every_step_in_the_window_is_compared(self):
        calls = []
        real = totp.hmac.compare_digest

        def spy(a, b):
            calls.append(a)
            return real(a, b)

        with mock.patch("totp.hmac.compare_digest", side_effect=spy):
            self.assertEqual(verify(KEY, "94287082", at=59 + 30, digits=8, window=2), -1)
        self.assertEqual(len(calls), 5)

    def test_bad_window(self):
        for bad in (-1, 1.0, True):
            with self.subTest(window=bad), self.assertRaisesRegex(ValueError, "window"):
                verify(KEY, "123456", at=59, window=bad)


class SecretTest(unittest.TestCase):
    def test_plain_base32(self):
        self.assertEqual(decode_secret(KEY_B32), KEY)

    def test_case_spaces_hyphens_and_padding_are_forgiven(self):
        self.assertEqual(decode_secret("gezd gnbv gy3t qojq gezd gnbv gy3t qojq"), KEY)
        self.assertEqual(decode_secret("GEZD-GNBV-GY3T-QOJQ-GEZD-GNBV-GY3T-QOJQ"), KEY)
        # "JBSWY3DPEE" is 10 characters, normally padded to 16
        self.assertEqual(decode_secret("JBSWY3DPEE"), b"Hello!")
        self.assertEqual(decode_secret("JBSWY3DPEE======"), b"Hello!")

    def test_bad_secrets(self):
        self.assertRaisesRegex(ValueError, "empty", decode_secret, "  ")
        self.assertRaisesRegex(ValueError, "empty", decode_secret, "====")
        self.assertRaisesRegex(ValueError, "not valid base32", decode_secret, "GEZDGNB1")
        self.assertRaisesRegex(ValueError, "not valid base32", decode_secret, "GEZDGNB!")
        for length in (1, 3, 6, 9):
            with self.subTest(length=length):
                self.assertRaisesRegex(ValueError, "impossible", decode_secret, "A" * length)
        self.assertRaises(TypeError, decode_secret, b"GEZDGNBV")


class UriTest(unittest.TestCase):
    def test_typical_uri(self):
        s = parse_uri("otpauth://totp/Example:alice%40example.com?secret=" + KEY_B32
                      + "&issuer=Example&algorithm=SHA256&digits=8&period=60")
        self.assertEqual(s, {"type": "totp", "label": "Example:alice@example.com", "issuer": "Example",
                             "key": KEY, "digits": 8, "algorithm": "sha256", "period": 60, "counter": None})

    def test_defaults(self):
        s = parse_uri("otpauth://totp/x?secret=" + KEY_B32)
        self.assertEqual((s["digits"], s["algorithm"], s["period"], s["issuer"]), (6, "sha1", 30, None))

    def test_hotp_needs_a_counter(self):
        self.assertEqual(parse_uri("otpauth://hotp/x?secret=" + KEY_B32 + "&counter=7")["counter"], 7)
        with self.assertRaisesRegex(ValueError, "no counter"):
            parse_uri("otpauth://hotp/x?secret=" + KEY_B32)

    def test_bad_uris(self):
        cases = [
            ("https://totp/x?secret=" + KEY_B32, "not an otpauth"),
            ("otpauth://motp/x?secret=" + KEY_B32, "unknown OTP type"),
            ("otpauth://totp/x", "no secret"),
            ("otpauth://totp/x?secret=" + KEY_B32 + "&secret=AAAAAAAA", "more than once"),
            ("otpauth://totp/x?secret=" + KEY_B32 + "&digits=eight", "whole number"),
            ("otpauth://totp/x?secret=" + KEY_B32 + "&digits=-6", "whole number"),
            ("otpauth://totp/x?secret=" + KEY_B32 + "&digits=12", "digits"),
            ("otpauth://totp/x?secret=" + KEY_B32 + "&period=0", "period"),
            ("otpauth://totp/x?secret=" + KEY_B32 + "&algorithm=MD5", "algorithm"),
            ("otpauth://totp/x?secret=", "empty"),
        ]
        for uri, message in cases:
            with self.subTest(uri=uri), self.assertRaisesRegex(ValueError, message):
                parse_uri(uri)


class MainTest(unittest.TestCase):
    def test_secret_from_stdin(self):
        self.assertEqual(call_main(["--at", "59", "-d", "8"], KEY_B32 + "\n"), (0, "94287082\n", ""))

    def test_secret_from_env(self):
        code, out, _ = call_main(["-e", "MY_OTP", "--at", "59", "-d", "8"], env={"MY_OTP": KEY_B32})
        self.assertEqual((code, out), (0, "94287082\n"))

    def test_missing_env_var(self):
        with mock.patch.dict(os.environ):
            os.environ.pop("NO_SUCH_OTP_VAR", None)
            code, out, err = call_main(["-e", "NO_SUCH_OTP_VAR"])
        self.assertEqual((code, out), (2, ""))
        self.assertIn("NO_SUCH_OTP_VAR is not set", err)

    def test_uri_settings_and_overrides(self):
        uri = "otpauth://totp/x?secret=" + KEY_B32 + "&digits=8\n"
        self.assertEqual(call_main(["--at", "59"], uri)[1], "94287082\n")
        sha256 = "otpauth://totp/x?secret=" + "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZA" + "&digits=8"
        self.assertEqual(call_main(["--at", "59", "-a", "sha256"], sha256)[1], "46119246\n")
        self.assertEqual(call_main(["--at", "59", "-d", "6"], uri)[1], "287082\n")

    def test_verbose_shows_seconds_left(self):
        self.assertEqual(call_main(["--at", "50", "-v"], KEY_B32)[1], "287082 (10s left)\n")

    def test_verify(self):
        self.assertEqual(call_main(["--at", "59", "-d", "8", "--verify", "94287082"], KEY_B32)[:2],
                         (0, "valid (step +0)\n"))
        self.assertEqual(call_main(["--at", "89", "-d", "8", "--verify", "9428 7082"], KEY_B32)[:2],
                         (0, "valid (step -1)\n"))
        self.assertEqual(call_main(["--at", "59", "-d", "8", "--verify", "00000000"], KEY_B32)[:2],
                         (1, "invalid\n"))
        self.assertEqual(call_main(["--at", "119", "-d", "8", "-w", "0", "--verify", "94287082"], KEY_B32)[:2],
                         (1, "invalid\n"))

    def test_hotp_counter(self):
        self.assertEqual(call_main(["--counter", "7"], KEY_B32)[:2], (0, "162583\n"))
        uri = "otpauth://hotp/x?secret=" + KEY_B32 + "&counter=9"
        self.assertEqual(call_main([], uri)[:2], (0, "520489\n"))
        self.assertEqual(call_main(["--counter", "3", "--verify", "969429"], KEY_B32)[:2], (0, "valid\n"))
        self.assertEqual(call_main(["--counter", "3", "--verify", "٩٦٩٤٢٩"], KEY_B32)[:2], (1, "invalid\n"))

    def test_errors_exit_2(self):
        for args, stdin, message in [
            ([], "", "empty"),
            ([], "not base32!", "not valid base32"),
            (["-d", "4"], KEY_B32, "digits"),
            (["-p", "0"], KEY_B32, "period"),
            (["--counter", "-1"], KEY_B32, "counter"),
            (["--at", "-5"], KEY_B32, "before t0"),
            (["-w", "-1", "--verify", "123456"], KEY_B32, "window"),
        ]:
            with self.subTest(args=args):
                code, out, err = call_main(args, stdin)
                self.assertEqual((code, out), (2, ""))
                self.assertIn(message, err)

    def test_the_secret_is_not_an_argument(self):
        code, _, err = call_main([KEY_B32])
        self.assertEqual(code, 2)
        self.assertIn("unrecognized arguments", err)


class CliTest(unittest.TestCase):
    def test_end_to_end(self):
        proc = subprocess.run([sys.executable, SCRIPT, "--at", "1111111109", "-d", "8"], input=KEY_B32 + "\n",
                              capture_output=True, text=True)
        self.assertEqual((proc.returncode, proc.stdout.replace("\r\n", "\n"), proc.stderr), (0, "07081804\n", ""))

    def test_a_secret_in_an_error_is_never_echoed(self):
        secret = "otpauth://totp/x?secret=" + KEY_B32 + "&digits=99"
        proc = subprocess.run([sys.executable, SCRIPT], input=secret, capture_output=True, text=True)
        self.assertEqual(proc.returncode, 2)
        self.assertNotIn(KEY_B32, proc.stderr + proc.stdout)


if __name__ == "__main__":
    unittest.main()
