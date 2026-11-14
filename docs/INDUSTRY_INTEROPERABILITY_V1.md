# MAH Quantum — Industry Interoperability Contract v1

**Status:** Implemented and CI-qualified in the 20-qubit repository. Cloud production integration requires deployment, a secure server-side token, legal/commercial hosting approval, and customer-specific acceptance. No physical quantum device is present.

## 1. What this adds

The scientific 1000+ Qubit research console now has a seventh tool, **Integration Bridge**, that can build and export valid API job manifests. Customer engineering systems can submit these through server-to-server HTTPS using the bundled dependency-free Python SDK, another approved REST client, or a private integration gateway.

The API runs only supported **classical simulations of quantum circuits and algorithms**. Nothing controls lasers, cryostats, magnets, production machinery, safety interlocks, SCADA, OPC UA, PLCs or quantum processors. All industrial data adapters must run in a customer-approved environment.

Implemented:
- OpenQASM 2.0 and the current parser's recognized QASM 3 subset; inspect-only and executable circuit jobs.
- Exact supported Clifford stabilizer, separable product-state, and bounded partitioned non-Clifford backends.
- Weighted undirected MaxCut/QAOA p=1 research jobs with an **independently exhaustive exact classical optimum** (2–10 variables).
- Explicit deterministic seed, shot limits, complete observed counts and transparent mathematical limitations.
- Versioned SHA-256 provenance; canonical JSON representation for independently verifying the input digest across languages.
- Synchronous 1–3 job batches with budget checks; no queue, long-running scheduling, or persistent state.
- Fail-closed shared server-only Bearer authentication; no permissive CORS; max request size and narrow content types.
- Customer-side Python SDK, server-route integration smoke, numerical acceptance tests, browser acceptance tests, and sample CSV-to-graph adapter.

## 2. Authentication and deployment

Set the environment variable MAH_QUANTUM_INDUSTRY_API_KEY on the **server only**, to a high-entropy randomly generated string of at least 32 characters.

A server administrator can generate a secret, for example:

    python -c "import secrets; print(secrets.token_urlsafe(48))"

Add the value to an approved hosting secret manager. **Never** put it in Git, client-side VITE_ variables, webpages, analytics events, notebook source, or screenshots.

If the variable is absent or too short, executing jobs returns HTTP 503 and performs no computation. Wrong/missing Bearer tokens receive 401. Requests must use HTTPS in production, Authorization: Bearer [secret] and Content-Type: application/json.

This initial key is shared across one controlled pilot. It is **not** tenant identity or account-level authorization. Before offering a paid multi-tenant SaaS, implement separately issued revocable credentials, per-tenant quotas and separation, rate limiting, audit retention, identity, monitoring, backup/incident response, and billing. The current synchronous service cannot promise throughput, a completion deadline, failover, or uptime SLA.

The old anonymous /api/circuit/simulate endpoint is deliberately retired and returns 410. Browser-local quantum workspaces remain available without sending their source to that endpoint.

## 3. Versioned endpoints

| Method | Path | Authentication | Meaning |
|---|---|---|---|
| GET | /api/v1/capabilities | Public, read-only | Advertised formats, budgets and scientific limitations |
| POST | /api/v1/execute | Server-only Bearer | Inspect or execute one bounded quantum/research job |
| POST | /api/v1/batch | Server-only Bearer | Synchronously execute 1–3 bounded jobs |
| GET | /health | Public | Local Express process health; not physical-device health |
| GET | /api/health | Public | Serverless capability overview |
| POST | /api/circuit/simulate | Retired | HTTP 410; use v1 instead |

HTTP failure codes: 400 malformed JSON / bad request content length, 401 unauthorized, 405 wrong method, 413 oversized payload, 415 non-JSON type, 422 invalid model or unsupported numerical workload, 503 API not enabled.

The API does not permit browser CORS wildcard and does not ask for browser-held credentials.

## 4. Capability budgets

| Operation | Supported bound |
|---|---|
| Circuit inspection | Up to 4,096 logical qubits and 8,192 expanded operations |
| Synchronous circuit execution | Up to 2,048 logical qubits and 3,072 expanded operations |
| Executable circuit shots | 1–256 |
| QASM source | Up to 100 KiB UTF-8 |
| Total request | Up to 128 KiB |
| Numerical circuit families | Exact Clifford tableau; separable states; bounded independent entangled components |
| Weighted MaxCut QAOA | 2–10 decision variables; shots 128–1,024; p=1 |
| Batch size | 1–3, conservative aggregate work budget |
| Experimental physical hardware | Unsupported |
| Noise calibration / readout fidelity | Unsupported |
| Universal non-Clifford 2,048Q or 4,096Q simulation | Unsupported |
| Full OpenQASM 3.1 including real-time classical control and pulse programming | Unsupported |

**Important:** Passing parse/budget validation cannot guarantee an individual circuit will complete within a particular serverless runtime or memory limit. Entangled non-Clifford components undergo additional exact resource checks at execution time.

## 5. Circuit job

Inspect without computation:

~~~json
{
  "schema": "MAH-Quantum-Industry-Job/v1",
  "jobId": "pilot-inspect-001",
  "kind": "circuit",
  "operation": "inspect",
  "source": "OPENQASM 2.0; qreg q[4096]; creg c[4096]; h q[0];"
}
~~~

Execute an exact supported ideal circuit:

~~~json
{
  "schema": "MAH-Quantum-Industry-Job/v1",
  "jobId": "pilot-qasm-001",
  "kind": "circuit",
  "operation": "execute",
  "source": "OPENQASM 2.0; qreg q[1000]; creg c[1000]; h q[0]; cx q[0],q[999];",
  "shots": 128,
  "seed": 29
}
~~~

The response contains schema MAH-Quantum-Industry-Result/v1, status, jobId, inputSha256, canonicalInputJson, sourceSha256, method/limits, sample counts and frequencies (for execution), seed, completed shots, and explicit physicalQpu:false. Canonical input is included so Python and JavaScript implementations can hash the **exact same UTF-8 serialization**. This is an integrity checksum, not a digital signature or independent hardware attestation.

## 6. Weighted optimization job

~~~json
{
  "schema": "MAH-Quantum-Industry-Job/v1",
  "jobId": "pilot-separation-001",
  "kind": "optimization",
  "operation": "execute",
  "graph": {
    "name": "Synthetic manufacturing separation",
    "nodes": ["Cutting", "Welding", "Inspection"],
    "edges": [
      {"source": 0, "target": 1, "weight": 7},
      {"source": 1, "target": 2, "weight": 4},
      {"source": 0, "target": 2, "weight": 3}
    ]
  },
  "shots": 256,
  "seed": 2026
}
~~~

The objective is **maximize the sum of weights crossing a two-way partition**. The server independently enumerates all assignments for the exact optimum, reports the ideal QAOA expected score, sampled candidates, all observed shot counts and parameters. It does not model capacity, process sequence, maintenance, physical plant interactions, current flow, safety constraints, or resource allocation. A domain specialist must derive and validate the real weighted graph from engineering data.

## 7. Synchronous batch and reproducibility

~~~json
{
  "schema": "MAH-Quantum-Industry-Batch/v1",
  "jobs": [
    {"schema":"MAH-Quantum-Industry-Job/v1","jobId":"trial-1","kind":"circuit",
     "operation":"execute","source":"OPENQASM 2.0; qreg q[1000]; creg c[1000]; h q[0];",
     "shots":64,"seed":11},
    {"schema":"MAH-Quantum-Industry-Job/v1","jobId":"trial-2","kind":"circuit",
     "operation":"execute","source":"OPENQASM 2.0; qreg q[1000]; creg c[1000]; h q[0];",
     "shots":64,"seed":12}
  ]
}
~~~

Submit to /api/v1/batch. All job IDs must be unique and all inputs validated before execution. This is a **single synchronous request**, not an asynchronous queue or persistent job ledger. It is not atomic for external side effects (none are implemented), and it has no automatic retries, cancellation API, or durable status polling.

## 8. Python SDK and edge-list import

Inside sdk/python, the bundled mah_quantum.py client requires no third-party dependencies. Deploy it to a **customer-controlled server** with the secret supplied from environment. Example:

~~~python
import json
import os
from mah_quantum import IndustryClient, circuit_job, verify_result, save_evidence
from mah_quantum_adapters import graph_from_csv

client = IndustryClient(
    "https://YOUR-APPROVED-DOMAIN.example",
    os.environ["MAH_QUANTUM_INDUSTRY_API_KEY"]
)
print(client.capabilities())
qasm = "OPENQASM 2.0; qreg q[1000]; creg c[1000]; h q[0];"
request = circuit_job("research-001", qasm, shots=128, seed=2026)
answer = client.execute(request)
assert verify_result(request, answer)
save_evidence("research-001-evidence.json", answer)

# Transform an approved customer edge-list CSV into a bounded MaxCut graph:
graph = graph_from_csv(
    "source,target,weight\nCutting,Welding,7\nWelding,Inspection,4\n"
)
~~~

For local development only, the client can explicitly permit http://127.0.0.1 with allow_insecure_localhost=True. Remote production HTTP is rejected to prevent credential exposure.

An industrial system can convert its approved **pairwise separation model** to a graph and submit it. OPC UA, PLC, historian, SCADA, ERP, MES, or scientific-instrument data must be acquired and mapped by a separately approved customer-side adapter. This repository currently **does not provide those vendor connectors or any command path into physical machinery**.

## 9. Validating this implementation

CI includes:
- TypeScript engine and scientific numerical tests;
- real bundled serverless route checks for token-disabled, unauthorized, correct runtime math, batch, retired legacy, and malformed payloads;
- browser checks for the Integration Bridge, QASM and MaxCut manifest exports, unsupported remote job limits and 390px layout;
- Python SDK unit tests and bounded CSV adapter unit tests.

The results verify tested input classes, not every future algorithm or external industrial system. Validate the actual hosted function on your chosen deployment with an approved test credential before announcing a customer production API.

**Do not market as:** universal 4096-qubit quantum computer, commercially certified industrial equipment, physically calibrated quantum digital twin, quantum speedup, safe autonomous machine control, or fully integrated multi-tenant SaaS.

**Appropriate market positioning:** a versioned scientific and industrial research simulation API with bounded exact quantum circuit families, small-variable ideal QAOA comparisons, reproducible evidence and a documented Python interoperability layer.
