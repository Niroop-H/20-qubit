"""Offline transport and evidence verification tests for the industry Python SDK."""
import hashlib
import io
import json
import tempfile
import unittest
from pathlib import Path

from mah_quantum import (
    IndustryClient, IndustryAPIError, circuit_job, optimization_job,
    verify_result, save_evidence
)


class _Response:
    def __init__(self, data):
        self._data = json.dumps(data).encode("utf-8")

    def read(self, amount):
        return self._data[:amount]

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class _Opener:
    def __init__(self, reply):
        self.reply = reply
        self.requests = []

    def open(self, request, timeout):
        self.requests.append((request, timeout))
        return _Response(self.reply)


class TestIndustryClient(unittest.TestCase):
    def setUp(self):
        self.client = IndustryClient(
            "https://research.example.org", "test-only-secret-longer-than-32-characters"
        )

    def test_https_and_server_side_credential_required(self):
        for base in ("http://research.example.org", "https://user:pass@company.com",
                     "https://example.org?secret=1"):
            with self.assertRaises(ValueError):
                IndustryClient(base, "a" * 36)
        with self.assertRaises(ValueError):
            IndustryClient("https://company.com", "short")
        local = IndustryClient("http://127.0.0.1:8000", "a" * 36,
                               allow_insecure_localhost=True)
        self.assertTrue(local._base.startswith("http://"))

    def test_capability_discovery_never_sends_server_secret(self):
        fake = _Opener({"schema": "MAH-Quantum-Industry-Capability/v1"})
        self.client._opener = fake
        response = self.client.capabilities()
        self.assertEqual(response["schema"], "MAH-Quantum-Industry-Capability/v1")
        req, timeout = fake.requests[0]
        self.assertEqual(req.get_method(), "GET")
        self.assertIsNone(req.get_header("Authorization"))
        self.assertEqual(timeout, 30)

    def test_execute_sets_authorization_and_serializes_job(self):
        fake = _Opener({"schema": "MAH-Quantum-Industry-Result/v1",
                        "status": "completed"})
        self.client._opener = fake
        job = circuit_job("scientific-001", "OPENQASM 2.0;", shots=128, seed=12)
        response = self.client.execute(job)
        self.assertEqual(response["status"], "completed")
        req, _ = fake.requests[0]
        self.assertEqual(req.get_method(), "POST")
        self.assertTrue(req.get_header("Authorization").startswith("Bearer "))
        self.assertEqual(json.loads(req.data), job)

    def test_sync_batch_explicitly_bounded_job_contract(self):
        fake = _Opener({"schema": "MAH-Quantum-Industry-Batch-Result/v1",
                        "items": []})
        self.client._opener = fake
        jobs = [circuit_job("one", "OPENQASM 2.0;")]
        self.client.batch(jobs)
        req, _ = fake.requests[0]
        payload = json.loads(req.data)
        self.assertEqual(payload["schema"], "MAH-Quantum-Industry-Batch/v1")
        self.assertEqual(payload["jobs"], jobs)

    def test_job_factories_reject_unsafe_names(self):
        with self.assertRaises(ValueError):
            circuit_job("../creds", "OPENQASM 2.0;")
        with self.assertRaises(ValueError):
            optimization_job("", {"name": "bad"})

    def test_source_hash_and_counts_reconcile_and_detect_tampering(self):
        qasm = "OPENQASM 2.0; qreg q[1000]; creg c[1000];"
        job = circuit_job("measure-0001", qasm, shots=128, seed=42)
        source_sha = hashlib.sha256(qasm.encode()).hexdigest()
        canonical = json.dumps({
            "kind": "circuit", "operation": "execute",
            "sourceSha256": source_sha, "shots": 128, "seed": 42
        }, separators=(",", ":"))
        result = {
            "schema": "MAH-Quantum-Industry-Result/v1",
            "jobId": "measure-0001", "physicalQpu": False,
            "calculationFamily": "circuit", "status": "completed",
            "sourceSha256": source_sha, "canonicalInputJson": canonical,
            "inputSha256": hashlib.sha256(canonical.encode()).hexdigest(),
            "samples": {"seed": 42, "counts": {"0" * 1000: 128}}
        }
        self.assertTrue(verify_result(job, result))
        result["samples"]["counts"] = {"0" * 1000: 100}
        with self.assertRaises(ValueError):
            verify_result(job, result)

    def test_python_floats_do_not_break_server_canonical_input_verification(self):
        graph = {"name": "Graph ", "nodes": ["A", "B"],
                 "edges": [{"source": 1, "target": 0, "weight": 1.0}]}
        job = optimization_job("weighted", graph, shots=128, seed=7)
        normalized = {"name": "Graph", "nodes": ["A", "B"],
                      "edges": [{"source": 0, "target": 1, "weight": 1}]}
        canonical = '{"kind":"optimization","graph":{"name":"Graph","nodes":["A","B"],"edges":[{"source":0,"target":1,"weight":1}]},"shots":128,"seed":7}'
        response = {
            "schema": "MAH-Quantum-Industry-Result/v1", "jobId": "weighted",
            "physicalQpu": False, "calculationFamily": "optimization",
            "status": "completed", "canonicalInputJson": canonical,
            "inputSha256": hashlib.sha256(canonical.encode()).hexdigest(),
            "result": {"graph": normalized, "settings": {"shots": 128, "seed": 7},
                       "classical": {"optimum": 1},
                       "quantum": {"expectedScore": .75,
                                   "outcomes": [{"count": 128}]}}
        }
        self.assertTrue(verify_result(job, response))
        response["result"]["quantum"]["expectedScore"] = 1.25
        with self.assertRaises(ValueError):
            verify_result(job, response)

    def test_evidence_export_never_silently_overwrites(self):
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder) / "run.json"
            save_evidence(file, {"schema": "MAH-Quantum-Industry-Result/v1"})
            self.assertTrue(file.is_file())
            with self.assertRaises(FileExistsError):
                save_evidence(file, {"schema": "second"})


if __name__ == "__main__":
    unittest.main()
