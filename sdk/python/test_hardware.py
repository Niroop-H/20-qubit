"""Real socket I/O contract tests: identity, telemetry, safety, interlocks and audits."""
import json
import math
import socket
import tempfile
import threading
import unittest
from pathlib import Path

from mah_quantum_hardware import (
    ApprovedAction, DeviceProfile, HardwareError, SCPISession,
    authorize_single_sweep, detect_configured, load_profiles,
    run_approved_sweep, snapshot, telemetry_to_parameter_job
)


class FakeInstrument:
    """Tiny local SCPI test instrument, NOT a real hardware certification."""
    def __init__(self, idn="ACME-LAB,SA-001,987,2.3"):
        self.idn = idn
        self.commands = []
        self.running = True
        self._listener = socket.socket()
        self._listener.bind(("127.0.0.1", 0))
        self._listener.listen(5)
        self.port = self._listener.getsockname()[1]
        self._listener.settimeout(.1)
        self.thread = threading.Thread(target=self._serve, daemon=True)
        self.thread.start()

    def _serve(self):
        while self.running:
            try:
                client, addr = self._listener.accept()
            except socket.timeout:
                continue
            except OSError:
                break
            with client:
                client.settimeout(1.0)
                with client.makefile("rb") as incoming:
                    while self.running:
                        try:
                            data = incoming.readline(1024)
                        except (socket.timeout, OSError):
                            break
                        if not data:
                            break
                        instruction = data.decode("ascii").strip()
                        self.commands.append(instruction)
                        response = {
                            "*IDN?": self.idn,
                            "SENS:FREQ:CENT?": "2450000000",
                            "CALC:MARK:Y?": "-23.75",
                            "*STB?": "0",
                            "MEAS:VOLT:DC?": "1.5",
                        }.get(instruction)
                        if response is not None:
                            try:
                                client.sendall((response+"\n").encode())
                            except OSError:
                                break

    def stop(self):
        self.running = False
        self._listener.close()
        self.thread.join(timeout=2.0)


class TestRealHardwareGateway(unittest.TestCase):
    def setUp(self):
        self.instrument = FakeInstrument()
        self.profile = DeviceProfile(
            device_id="spectrum-1", ip="127.0.0.1",
            port=self.instrument.port, enabled=True,
            expected_idn="ACME-LAB,SA-001", device_class="spectrum_analyzer",
            reads=("center_frequency_hz", "marker_level"),
            allow_single_sweep=True
        )

    def tearDown(self):
        self.instrument.stop()

    def test_discovery_scans_only_approved_device_and_identifies_real_socket(self):
        records = detect_configured((self.profile,))
        self.assertEqual(records[0]["status"], "connected_identity_verified")
        self.assertIn("ACME-LAB", records[0]["idn"])
        self.assertEqual(self.instrument.commands, ["*IDN?"])

    def test_scpi_tcp_reads_real_instrument_measurements_and_identity(self):
        measurement = snapshot(self.profile)
        self.assertEqual(measurement["schema"], "MAH-Quantum-Hardware-Snapshot/v1")
        self.assertTrue(measurement["hardwareConnected"])
        self.assertFalse(measurement["calibrated"])
        self.assertEqual(measurement["measurements"][0]["value"], 2450000000.0)
        self.assertEqual(measurement["measurements"][1]["value"], -23.75)
        self.assertEqual(self.instrument.commands,
                         ["*IDN?", "SENS:FREQ:CENT?", "CALC:MARK:Y?"])

    def test_identity_mismatch_fails_before_any_telemetry_or_physical_action(self):
        wrong = DeviceProfile(device_id="x", ip="127.0.0.1",
                              port=self.instrument.port, enabled=True,
                              expected_idn="SOME-OTHER-MODEL",
                              device_class="spectrum_analyzer",
                              reads=("center_frequency_hz",))
        with self.assertRaisesRegex(HardwareError, "identity"):
            snapshot(wrong)
        self.assertEqual(self.instrument.commands, ["*IDN?"])

    def test_unallowlisted_commands_and_disabled_profile_are_rejected(self):
        with SCPISession(self.profile) as session:
            with self.assertRaisesRegex(HardwareError, "not allowlisted"):
                session.query("OUTP ON")
            with self.assertRaisesRegex(HardwareError, "Unsafe"):
                session._send("OUTP ON;SYST:RESET")
        disabled = DeviceProfile(
            device_id="disabled", ip="127.0.0.1",
            port=self.instrument.port, expected_idn="ACME-LAB")
        with self.assertRaisesRegex(HardwareError, "not enabled"):
            snapshot(disabled)

    def test_real_hardware_control_is_fail_closed_without_interlock_and_approval(self):
        secret = "test-hardware-only-local-secret-32-bytes-minimum"
        approval = authorize_single_sweep(self.profile, operator="Operator Alice",
                                          supervisor="Supervisor Bob",
                                          reason="Approved isolated analyzer measurement",
                                          secret=secret)
        with tempfile.TemporaryDirectory() as tmp:
            log = Path(tmp)/"audit.log"
            with self.assertRaisesRegex(HardwareError, "interlock"):
                run_approved_sweep(self.profile, approval, secret=secret,
                                   independent_interlock=None, operator_identity_authorized=lambda _: True, audit_path=log)
            self.assertNotIn("INIT:IMM", self.instrument.commands)
            with self.assertRaisesRegex(HardwareError, "signature"):
                run_approved_sweep(self.profile, approval, secret=secret+"tampered",
                                   independent_interlock=lambda _: True, audit_path=log)
            self.assertNotIn("INIT:IMM", self.instrument.commands)

    def test_one_explicitly_signed_approved_sweep_and_audit_never_replay(self):
        secret = "signed-local-edge-authorization-not-cloud-2026"
        approval = authorize_single_sweep(
            self.profile, operator="Engineer Ada",
            supervisor="Shift Lead Ben", reason="Isolated spectrum analyzer single sweep",
            secret=secret)
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)/"equipment-audit.jsonl"
            result = run_approved_sweep(
                self.profile, approval, secret=secret, audit_path=path,
                independent_interlock=lambda _: True,
                operator_identity_authorized=lambda _: True)
            self.assertEqual(result["status"], "dispatched_not_calibrated")
            self.assertIn("INIT:IMM", self.instrument.commands)
            record = json.loads(path.read_text().strip())
            self.assertEqual(record["status"], "dispatched")
            self.assertNotIn("signed-local-edge-authorization", path.read_text())
            with self.assertRaisesRegex(HardwareError, "replayed"):
                run_approved_sweep(self.profile, approval, secret=secret,
                                   audit_path=path, independent_interlock=lambda _: True,
                                   operator_identity_authorized=lambda _: True)
            self.assertEqual(self.instrument.commands.count("INIT:IMM"), 1)

    def test_names_and_signature_do_not_replace_external_human_authorization(self):
        secret = "signed-local-edge-authorization-not-cloud-2026"
        approval = authorize_single_sweep(
            self.profile, operator="Engineer Ada", supervisor="Shift Lead Ben",
            reason="Approved measurement", secret=secret)
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(HardwareError, "identity approval"):
                run_approved_sweep(self.profile, approval, secret=secret,
                                   audit_path=Path(tmp)/"audit.jsonl",
                                   independent_interlock=lambda _: True)
        self.assertNotIn("INIT:IMM", self.instrument.commands)

    def test_expired_and_cross_device_approval_fails_closed(self):
        secret = "signed-local-edge-authorization-not-cloud-2026"
        approval = authorize_single_sweep(
            self.profile, operator="Engineer Ada", supervisor="Shift Lead Ben",
            reason="Approved measurement", secret=secret, now=100)
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(HardwareError, "expired"):
                run_approved_sweep(self.profile, approval, secret=secret,
                                   now=200, independent_interlock=lambda _: True,
                                   audit_path=Path(tmp)/"audit.jsonl")
        self.assertNotIn("INIT:IMM", self.instrument.commands)

    def test_approved_telemetry_can_feed_real_quantum_engine_job_without_device_writes(self):
        reading = snapshot(self.profile)
        job = telemetry_to_parameter_job(reading,
             channel="marker_level", scale=.01, offset=0, job_id="pilot-telemetry",
             shots=128, seed=42)
        self.assertEqual(job["schema"], "MAH-Quantum-Industry-Job/v1")
        self.assertEqual(job["kind"], "circuit")
        self.assertIn("ry(-0.2375)", job["source"])
        self.assertEqual(job["seed"], 42)
        self.assertNotIn("INIT:IMM", self.instrument.commands)

    def test_profile_file_validation_rejects_public_addresses_and_unknown_reads(self):
        for ip in ("8.8.8.8", "localhost", "224.0.0.1", "0.0.0.0"):
            with self.subTest(ip=ip), self.assertRaises(ValueError):
                DeviceProfile("invalid", ip, "ACME-IDN")
        with self.assertRaises(ValueError):
            DeviceProfile("bad", "127.0.0.1", "ACME-IDN",
                          device_class="generic_scpi", reads=("dc_voltage_v",))
        with tempfile.TemporaryDirectory() as tmp:
            file = Path(tmp)/"profiles.json"
            file.write_text(json.dumps({
                "schema":"MAH-Quantum-Equipment-Config/v1",
                "devices":[{
                    "device_id":"spectrum-1", "ip":"127.0.0.1",
                    "port":self.instrument.port,
                    "expected_idn":"ACME-LAB,SA-001",
                    "device_class":"spectrum_analyzer",
                    "reads":["marker_level"], "enabled":True
                }]
            }))
            profiles = load_profiles(file)
            self.assertEqual(len(profiles), 1)
            self.assertEqual(profiles[0].device_class, "spectrum_analyzer")


if __name__ == "__main__":
    unittest.main()
