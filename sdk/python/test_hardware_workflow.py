"""Full local instrument -> signed snapshot -> bounded quantum request CLI test."""
import hashlib
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from hardware_cli import run
from test_hardware import FakeInstrument
from mah_quantum import IndustryClient


class TestHardwareResearchWorkflow(unittest.TestCase):
    def test_instrument_capture_and_trusted_job_preparation_rejects_tampering(self):
        instrument=FakeInstrument()
        try:
            with tempfile.TemporaryDirectory() as root:
                folder=Path(root)
                config=folder/"devices.json"
                snapshot=folder/"snapshot.json"
                job=folder/"job.json"
                config.write_text(json.dumps({
                    "schema":"MAH-Quantum-Equipment-Config/v1",
                    "devices":[{
                        "device_id":"pilot-analyzer","ip":"127.0.0.1",
                        "port":instrument.port,"expected_idn":"ACME-LAB,SA-001",
                        "device_class":"spectrum_analyzer","enabled":True,
                        "reads":["marker_level"],"allow_single_sweep":False
                    }]
                }))
                edge_key="separate-tested-hardware-signing-key-for-internal-ot"
                with patch.dict(os.environ,{"MAH_QUANTUM_EDGE_HMAC_KEY":edge_key}):
                    self.assertEqual(run([
                        "capture-scpi","--config",str(config),
                        "--device","pilot-analyzer","--output",str(snapshot)
                    ]),0)
                    record=json.loads(snapshot.read_text())
                    self.assertEqual(record["measurements"][0]["value"],-23.75)
                    self.assertEqual(record["attestation"]["algorithm"],"HMAC-SHA256")
                    self.assertEqual(run([
                        "prepare-job","--snapshot",str(snapshot),
                        "--channel","marker_level","--scale","0.01",
                        "--offset","0","--job-id","edge-pilot-001",
                        "--output",str(job)
                    ]),0)
                    request=json.loads(job.read_text())
                    self.assertEqual(request["kind"],"circuit")
                    self.assertIn("qreg q[1000]",request["source"])
                    theta=float(request["source"].split("ry(")[1].split(")")[0])
                    self.assertAlmostEqual(theta,-.2375,places=12)
                    self.assertEqual(request["shots"],128)
                    self.assertNotIn("INIT:IMM",instrument.commands)
                    record["measurements"][0]["value"]=9999
                    snapshot.write_text(json.dumps(record))
                    with self.assertRaisesRegex(ValueError,"integrity"):
                        run(["prepare-job","--snapshot",str(snapshot),
                             "--channel","marker_level","--scale","0.01",
                             "--offset","0","--job-id","tampered",
                             "--output",str(folder/"tampered.json")])
                    self.assertFalse((folder/"tampered.json").exists())
                    self.assertEqual(instrument.commands.count("*IDN?"),1)
                    self.assertEqual(instrument.commands.count("CALC:MARK:Y?"),1)
        finally:
            instrument.stop()


if __name__=="__main__":
    unittest.main()
