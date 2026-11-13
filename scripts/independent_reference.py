"""Independent, dependency-free five-qubit gate reference.

Uses Python complex arrays, not the production TypeScript matrices or code.
Receives a JSON {qubits, steps} program on stdin and writes amplitudes to stdout.
Reference is intentionally capped at 6 qubits for exhaustive comparison.
"""
import cmath
import json
import math
import sys

def single_matrix(step):
    name = step["gate"]
    p = step.get("params") or {}
    if name == "I":
        return [1+0j, 0j, 0j, 1+0j]
    if name == "H":
        r = 1 / math.sqrt(2)
        return [r, r, r, -r]
    if name == "X": return [0j, 1+0j, 1+0j, 0j]
    if name == "Y": return [0j, -1j, 1j, 0j]
    if name == "Z": return [1+0j, 0j, 0j, -1+0j]
    if name == "S": return [1+0j, 0j, 0j, 1j]
    if name == "T": return [1+0j, 0j, 0j, cmath.exp(1j * math.pi / 4)]
    theta = p.get("theta", 0)
    c = math.cos(theta / 2)
    s = math.sin(theta / 2)
    if name == "RX": return [c, -1j*s, -1j*s, c]
    if name == "RY": return [c, -s, s, c]
    if name == "RZ": return [cmath.exp(-1j*theta/2), 0j, 0j, cmath.exp(1j*theta/2)]
    if name == "U":
        ph = p["phi"]
        lam = p["lambda"]
        return [c, -cmath.exp(1j*lam)*s, cmath.exp(1j*ph)*s, cmath.exp(1j*(ph+lam))*c]
    raise ValueError("Unknown reference gate: " + name)

def reference(program):
    n = program["qubits"]
    if n < 1 or n > 6: raise ValueError("Independent reference limited to 1–6 qubits")
    size = 1 << n
    state = [0j] * size
    state[0] = 1+0j
    for step in program["steps"]:
        gate = step["gate"]
        targets = step["targets"]
        ctrl = step.get("controls") or []
        out = [0j] * size
        if gate in ("MEASURE", "BARRIER"):
            continue
        if gate in ("CX", "CZ", "SWAP", "CCX"):
            for i, a in enumerate(state):
                if gate == "CX":
                    j = (i ^ (1 << targets[0])) if (i >> ctrl[0]) & 1 else i
                    out[j] += a
                elif gate == "CZ":
                    out[i] += -a if ((i >> ctrl[0]) & 1) and ((i >> targets[0]) & 1) else a
                elif gate == "SWAP":
                    m0, m1 = 1 << targets[0], 1 << targets[1]
                    j = i ^ (m0 | m1) if bool(i & m0) != bool(i & m1) else i
                    out[j] += a
                else:
                    j = i ^ (1 << targets[0]) if all((i >> q) & 1 for q in ctrl) else i
                    out[j] += a
        else:
            m = single_matrix(step)
            bit = 1 << targets[0]
            for i, a in enumerate(state):
                if i & bit:
                    out[i ^ bit] += m[1] * a
                    out[i] += m[3] * a
                else:
                    out[i] += m[0] * a
                    out[i | bit] += m[2] * a
        state = out
    return [[v.real, v.imag] for v in state]

if __name__ == "__main__":
    result = reference(json.load(sys.stdin))
    json.dump(result, sys.stdout)
