# MAH Quantum Industry Python SDK

A **server-side**, dependency-free Python 3.10+ client for the versioned,
synchronous MAH Quantum research API. Not a physical quantum hardware driver.

## Installation from your approved source checkout

    pip install ./sdk/python

This SDK has zero runtime third-party Python dependencies.

## Example

Set MAH_QUANTUM_INDUSTRY_API_KEY in your **server-only** environment before running:

~~~python
import os
from mah_quantum import IndustryClient, circuit_job, verify_result, save_evidence

client = IndustryClient(
    "https://YOUR-APPROVED-DOMAIN.example",
    os.environ["MAH_QUANTUM_INDUSTRY_API_KEY"]
)
job = circuit_job(
    "research-run-001",
    "OPENQASM 2.0; qreg q[1000]; creg c[1000]; h q[0]; cx q[0],q[1];",
    shots=128, seed=42
)
capabilities = client.capabilities()
result = client.execute(job)
assert verify_result(job, result)
save_evidence("research-run-001.json", result)
~~~

The server supports a strict OpenQASM 2 / recognized QASM 3 subset; remote
execution is bounded to 2,048 logical qubits, 3,072 expanded gates and 256
shots. Arbitrary universal thousand-qubit circuits cannot execute.

## Weighted industrial model from CSV

~~~python
from mah_quantum_adapters import graph_from_csv
from mah_quantum import optimization_job

graph = graph_from_csv(
    "source,target,weight\nCutting,Welding,7\nWelding,Inspection,4\n",
    name="Synthetic manufacturing separation"
)
request = optimization_job("pilot-graph", graph, shots=256, seed=42)
result = client.execute(request)
assert verify_result(request, result)
~~~

This is weighted pairwise MaxCut only. Real engineering inputs require a
validated optimization objective and explicit domain restrictions.
The SDK does **not** integrate with plant controls or issue hardware commands.

## Security and verification

Use HTTPS and keep the bearer secret in a server-only secret manager.
The SDK refuses ordinary remote HTTP and refuses cross-host redirects. It
verifies the SHA-256 of the canonical server-provided input serialization,
the job identifier and the completed sample counts. SHA-256 is not a digital
signature or independent quantum-correctness proof.

Requests are synchronous, with no retries and no durable job IDs on the
service. Customer deployments need their own identity, rate-limits, quotas,
observability, contracts and production qualification.

Full API documentation: ../../docs/INDUSTRY_INTEROPERABILITY_V1.md
OpenAPI specification: ../../docs/openapi-industry-v1.yaml
