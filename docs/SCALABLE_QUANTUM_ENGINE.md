# Quantum Computing — 100 qubits / 1000+ Qubit research workspace

**Status:** exact software simulators for specified circuit families. Not physical quantum hardware and not a universal 4,096-qubit dense statevector simulator.

## Mathematical backends
A general n-qubit pure state has 2^n complex amplitudes. The dense double-precision engine retains its 20-qubit maximum (16 MiB of raw amplitudes at n=20).

The 100-qubit Studio routes by structure:
1. 1–20 qubits: existing exact dense statevector for the supported full gate set.
2. 21–100, Clifford: exact signed stabilizer tableau with H/S/X/Y/Z/CX/CZ/SWAP, I, barriers and terminal measurement.
3. 21–100, separable: exact per-qubit complex amplitudes, arbitrary supported one-qubit gates (including T, RX, RY, RZ, U) and SWAP.
4. 21–100, partitioned exact statevector: non-Clifford entangled circuits including CCX when every independent interaction component contains at most 18 qubits and the sum of component basis states is at most 2^20. Oversize connected workloads fail explicitly.

The separate 1000+ Qubit page accepts 1,000–4,096 logical qubits through the exact Clifford, separable and bounded partitioned-statevector representations. Maximum 8,192 expanded operations and 1,024 shots. Strict static OpenQASM subset only. Calculations use cancellable browser workers.

## Stabilizer support and probabilities

Store n signed Pauli stabilizer generators as packed X/Z bitsets. Conjugate the generators under Clifford gates. Gaussian-eliminate the X components; zero-X rows yield linear Z-parity constraints, determining one reference basis string b. Independent X rows, projected to classical measurement bits, define binary support directions v_j. The exact joint Z-basis measurement outcomes are

    x = b XOR (t_1 v_1) XOR ... XOR (t_k v_k),  t_j in {0,1}.

Every allowed classical bitstring has ideal probability 2^(-k), and no other string occurs. Sample independent uniform t_j rather than allocating 2^n complex amplitudes. At large k, report 2^(-k) symbolically to avoid floating-point underflow.

For separable states store a normalized two-component complex vector per qubit, apply the 2×2 gate matrices, and sample independent measured qubits. This approach is not valid for an arbitrary entangled non-Clifford state.

For partitioned non-Clifford circuits, construct a union-find interaction graph from all entangling gates. Each independent component evolves using the original double-precision statevector algorithm. After state evolution, compute exact Z-basis marginals of the measured qubits in that component and sample their tensor-product distribution. The largest supported component contains 18 logical qubits and the aggregate 2^20-amplitude limit is checked before any statevector allocation. Cross-component entanglement that merges more than 18 qubits is refused rather than approximated.

## Explicit boundaries

- Exactly supported mathematical families, not unrestricted universal circuits.
- No 1000-qubit physical processor, quantum speedup or calibrated noise claim.
- No high-qubit noisy trajectories, mid-circuit feedback, arbitrary QASM or industrial SLA. Oversized entangled non-Clifford components are rejected. Exactness applies only to the stated circuit classes within floating-point tolerance.
- Web Workers keep the UI responsive and computations cancellable; no guaranteed real-time turnaround.
- Browser-side execution ships algorithm code to clients; proprietary deployments requiring confidentiality need protected server execution.
- Amplitude tables are not available for scalable backends; reported probabilities and samples remain explicitly scoped.

## Reproducible engineering acceptance

The Node unit suite cross-checks random Clifford, separable and partitioned non-Clifford circuits against the dense reference at small widths, including partial measurement marginals and CCX. It verifies 100/1000-qubit entangled clusters, 2048-qubit Hadamard circuits, phase/sign correctness, measurement mapping and resource-budget rejection. The production-browser acceptance suite runs 100- and 1000-plus-qubit workloads through the workers.

Historical 20-qubit numerical acceptance scripts remain part of the release suite. Use the actual final workflow results as evidence; no acceptance result should be claimed without a green CI outcome.

## Research roadmap (not yet shipped)

- Matrix-product-state solver with explicit truncation error bounds.
- Adaptive algorithm selection and independent performance profiling.
- External cross-validation against other mature quantum simulators.
- Protected server-side execution for proprietary or higher-assurance production applications.
