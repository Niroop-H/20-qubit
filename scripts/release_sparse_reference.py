"""Independent sparse-state 20-qubit oracle for release verification.

Represents only occupied computational basis indices and uses Python complex
numbers, independent of the production JavaScript statevector update loops.
This is a software numerical reference, never a physical-QPU measurement.
"""
import json
import sys
from collections import defaultdict
from independent_reference import single_matrix

def sparse_evolve(p):
    n = p["qubits"]
    if not 1 <= n <= 20:
        raise ValueError("Reference width must be between 1 and 20")
    state = {0: 1+0j}
    for step in p["steps"]:
        gate = step["gate"]
        target = step["targets"]
        control = step.get("controls") or []
        out = defaultdict(complex)
        if gate in ("MEASURE", "BARRIER"):
            continue
        if gate in ("CX", "CZ", "SWAP", "CCX"):
            for index, a in state.items():
                if gate == "CX":
                    new = index ^ (1 << target[0]) if index & (1 << control[0]) else index
                    out[new] += a
                elif gate == "CZ":
                    out[index] += -a if index & (1 << control[0]) and index & (1 << target[0]) else a
                elif gate == "CCX":
                    new = index ^ (1 << target[0]) if all(index & (1 << q) for q in control) else index
                    out[new] += a
                elif gate == "SWAP":
                    m0, m1 = 1 << target[0], 1 << target[1]
                    new = index ^ (m0 | m1) if bool(index & m0) != bool(index & m1) else index
                    out[new] += a
        else:
            matrix = single_matrix(step)
            for index, a in state.items():
                mask = 1 << target[0]
                if index & mask:
                    out[index ^ mask] += matrix[1] * a
                    out[index] += matrix[3] * a
                else:
                    out[index] += matrix[0] * a
                    out[index | mask] += matrix[2] * a
        state = {k:v for k,v in out.items() if abs(v) > 1e-15}
        if len(state) > 32768:
            raise ValueError("Sparse reference exceeded 32768 occupied amplitudes")
    return {
        "qubits": n,
        "occupied": len(state),
        "norm": sum(abs(v)**2 for v in state.values()),
        "amplitudes": [[k, v.real, v.imag] for k,v in sorted(state.items())]
    }

if __name__ == "__main__":
    data = json.load(sys.stdin)
    json.dump(sparse_evolve(data), sys.stdout, separators=(",",":"))
