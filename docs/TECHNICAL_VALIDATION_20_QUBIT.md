# MAH Quantum / Devashri S Quantum
# Technical Verification & Validation Report — 20-Qubit Quantum Studio

**Report ID:** MQ-DSQ-QS-VV-020  
**Issue:** 1.0 — 13 November 2026  
**Repository:** [Niroop-H/20-qubit](https://github.com/Niroop-H/20-qubit)  
**Reference CI commit:** `47a4c75084a45f5ae912051d48c09336701f0284`  
**Evidence CI:** [GitHub Actions, run 43445776335](https://github.com/Niroop-H/20-qubit/actions/runs/43445776335)  
**Machine-readable evidence:** GitHub Actions artifact `quantum-20-validation`, containing `quantum-20-validation.json`  
**Claim classification:** *Verified software-based ideal statevector simulator for up to 20 logical qubits, within the specified API and workload limitations.*  
**Industrial qualification:** *NOT certified or qualified as an industrial control system or physical QPU.*

## 1. Executive decision

**Result: PASS for the defined 20-logical-qubit ideal statevector acceptance scope.**

The software simulates a complex-valued **1,048,576-amplitude** statevector (`2^20`) in 64-bit floating-point components, executes supported 1-, 2-, and 3-qubit gates, applies supported QASM 2/QASM 3 statements, runs seeded projective sampling, and preserves supported classical measurement assignments to bit 19. The interactive editor exposes up to 20 qubits. The exact state is held in numerical typed arrays; the UI transfers a bounded, clearly labeled summary rather than fabricating a complete million-row result table.

The verification evidence includes full-width analytical tests, an independent Python complex-amplitude reference at 5 qubits, 20-qubit long-range linear-topology compilation, shot-count conservation, and a repeatable benchmark. **The report does not establish quantum-hardware fidelity, QPU connectivity, quantum advantage, industrial safety certification, general quantum algorithm equivalence, or accuracy on untested target hardware.**

## 2. System identity and requirements

| Requirement | Implementation / acceptance statement | Result |
| --- | --- | --- |
| Register width | 1 to 20 quantum bits, 1 to 20 classical bits | PASS |
| State size | `2^20 = 1,048,576` complex amplitudes | PASS |
| Ideal complex state | Two `Float64Array` buffers, 16 MiB of raw amplitude storage at 20 bits | PASS |
| Supported operations | I, H, X, Y, Z, S, T, RX, RY, RZ, U, CX, CZ, SWAP, CCX, terminal MEASURE, BARRIER | PASS within syntax scope |
| Execution | Exact ideal statevector propagation followed by seeded projective sampling | PASS |
| Shots | 1 to 8,192 per job; total observed counts equals selected shots | PASS |
| Circuit depth/input | Up to 256 expanded operations; compiler output must also fit limit | PASS within limit |
| Classical output | 20-bit labels, terminal measurement routing, deterministic sample replay | PASS |
| Compilation | U/CX decomposition and optional nearest-neighbor linear routing | PASS on tested 20-qubit route |
| Browser scale | Worker execution, no million-row charts, bounded transfer and render | PASS in build and automated tests |
| Noise | Per-shot stochastic Kraus/Pauli and readout model with explicit workload guard | LIMITED; NOT 20-qubit unrestricted |
| Physical QPU | Not connected to or validated on physical quantum hardware | NOT CLAIMED |

**Core numerical method:** pure-state Schrödinger evolution with local-unitary amplitude updates, not a full `2^n × 2^n` matrix allocation.

## 3. Numerical verification design

### 3.1 Independent complex-amplitude oracle

A standalone Python 3 standard-library implementation constructs complex gate matrices and evolves a five-qubit reference vector. Its code does not import or execute production TypeScript gate matrices. The acceptance harness supplies a 27-operation circuit covering Hadamard, rotations, U, Pauli/phase gates, controlled gates, SWAP and CCX. It compares **every real and imaginary component**, not only output measurement probabilities.

* Maximum absolute amplitude-component difference: **1.1102230246251565 × 10^-16**.
* Numerical acceptance tolerance: **5 × 10^-12**.
* Result: **PASS**.

This cross-check is independent at **5 qubits**, not a claim that an independent quantum package has cross-validated every arbitrary 20-qubit circuit.

### 3.2 20-qubit GHZ witness

Prepared state:

`|GHZ_20> = (|00000000000000000000> + |11111111111111111111>) / sqrt(2)`

Circuit: `H(q0)` followed by 19 chained CX operations. Expected exact computational-basis probabilities are 0.5 and 0.5, zero for all other states.

* State width: **1,048,576** basis indices.
* Supported operations: **20**.
* Shots: **4,096**; observed counts: `0^20: 2039`, `1^20: 2057`.
* Maximum absolute ideal-probability error: **1.1102230246251565 × 10^-16**.
* Statevector normalization error: **2.220446049250313 × 10^-16**.
* Result: **PASS**.

Shot counts are stochastic; exactly 2,048 each is not expected or required.

### 3.3 20-qubit dense superposition

Applying `H` to every qubit yields theoretical `P(x) = 1/1,048,576` for every basis label.

* Ideal probability maximum absolute error on reported labels: **2.964615315390051 × 10^-21**.
* Numerically non-zero basis states: **1,048,576**.
* Sampled shots: **512**; observed outcome labels: **512** in this seeded execution.
* Statevector view: **128** top-ranked entries; retained mass **0.00012207031249999989**.
* Summary histogram omitted ideal probability mass: **0.99945068359375**.
* Result: **PASS**, with **explicit truncation**.

A top-ranked summary is **not** a complete vector dump. In particular, the large omitted fraction is an honest representation of how diffuse a 20-qubit uniform distribution is.

### 3.4 20-qubit interferometric phase witness

Circuit `H(q0) -> CX(q0,q19) -> RZ(q19, θ) -> CX(q0,q19) -> H(q0)`, with `θ = 0.731` rad.

Independent analytic value: `P(q0=1) = sin²(θ/2) = 0.12774641988307925`.

* Computed exact value: **0.12774641988307922**.
* Absolute error: **2.7755575615628914 × 10^-17**.
* Result: **PASS**.

This verifies meaningful relative phase and interference beyond merely checking sample histograms.

### 3.5 20-qubit transpiler/topology equivalence

Tested 20-qubit circuit: Hadamard on q0 and controlled-NOT from q0 to q19. Compiled to nearest-neighbor CX plus U, with a linear q0—q19 chain and restoration of logical qubit ordering.

* Original operations: **2**; compiled operations: **110**.
* Full complex-state overlap fidelity `|<ψ_original|ψ_compiled>|²`: **0.9999999999999998**.
* Difference from unity: **2.220446049250313 × 10^-16**.
* Result: **PASS**.

The acceptance statement covers this routed witness, not arbitrary topology synthesis beyond the supported compiler cap.

### 3.6 Classical-bit mapping and replay

State `X(q19)`, terminal `measure q[19] -> c[0]`: all 128 shots land on the low classical bit in the 20-bit output label. Repeating the job with identical seed and parameters reproduces the same counts.

* Result: **PASS**.

## 4. Automated regression and build evidence

[Workflow source](../.github/workflows/quantum-ci.yml)

| Workflow stage | Evidence from 13 November 2026 | Result |
| --- | --- | --- |
| TypeScript compile + Node engine tests | 70 tests, 70 pass, 0 fail | PASS |
| Frontend production bundle | Vite production build completed | PASS |
| Independent + analytical acceptance harness | 6 scenarios, 6 pass | PASS |
| Python backend reference tests | 6 tests pass | PASS |
| Artifact upload | `quantum-20-validation.json` via GitHub Actions | PASS |

**Reproduction commands from repository root:**

```bash
npm ci
npm test
npm run build:web
node scripts/verify-20.mjs
python -m unittest discover -s backend -p 'test_*.py'
```

The Node acceptance harness writes `artifacts/quantum-20-validation.json` with per-test metrics and Git SHA. CI captures it as a GitHub Actions artifact. The complete regression suite, JSON artifact and workflow logs form the primary source evidence; numbers copied into this report are snapshots of the referenced run.

## 5. Performance measurements and capacity

These measurements were collected on the **GitHub-hosted Ubuntu CI runner**, using Node.js and the harness. They are **observations**, not bounded latency SLAs, end-user browser benchmarks, hardware-independent throughput claims, or per-simulation peak allocation guarantees.

| Validation workload | Elapsed | Node process RSS observed at checkpoint |
| --- | ---: | ---: |
| Independent 5-qubit reference | 20.510 ms | 49.09 MiB |
| 20-qubit GHZ + 4096 shots and explicit norm calculation | 196.522 ms | 107.02 MiB |
| 20-qubit dense H^20, 512 shots | 161.499 ms | 93.82 MiB |
| 20-qubit phase interference | 119.199 ms | 98.40 MiB |
| 20-qubit long-range linear compilation + full-state overlap | 243.007 ms | 130.40 MiB |
| 20-bit measurement routing + repeatability | 185.886 ms | 182.90 MiB |

RSS includes the whole Node process, runtime, JIT, temporary arrays and garbage collection; values need not increase monotonically and are **not** equivalent to isolated core statevector allocation.

**Scaling characteristics.** For `n=20`, two `Float64Array(2^20)` buffers consume **16 MiB** raw for complex amplitudes. Ideal sampling builds a numerical CDF once and then takes `O(log(2^n))` binary search per shot, replacing `O(shots × 2^n)` linear scans. Full state evolution for each dense local gate remains `O(2^n)` in time. A 20-qubit job involving many hundreds of gates can be much slower on real browsers.

## 6. Risk register and limitations

| Risk / boundary | Mitigation or current status | Industrial significance |
| --- | --- | --- |
| Statistical uncertainty | Seeded shot simulation, exact ideal probabilities distinguished from observed frequencies | Shot frequencies are estimates; cannot be treated as exact wavefunction values |
| Finite precision | Double-precision complex amplitudes, normalization tests and independent reference comparison | Error can accumulate on longer/unusual circuits; validated tolerances are scenario-specific |
| 20-qubit UI overload | Bounded chart/table transfer, background workers, truncation and omitted-mass reporting | Full state is computed but only a summary is displayed |
| Noisy large jobs | Explicit 16-million amplitude-operation budget rejects expensive trajectories | No claim of unrestricted 20-qubit noisy simulation |
| Physical fidelity | No device calibration / pulse model / quantum processor backend | No hardware fidelity or industrial hardware performance claim |
| Compiler output cap | 256 expanded steps, including transpiler output | Very long or routed circuits may be rejected |
| Unsupported semantics | Terminal measurements only; no reset, loops, dynamic conditionals, custom gate definitions or pulse-level control | Not a complete OpenQASM interpreter or quantum runtime |
| Model training / lab exercises | Separate reduced-order models, not physical digital-twin calibration | Not validated manufacturing control or quantum hardware training data |
| Browser/cross-device benchmarking | Not run on target industrial workstations or mobile profiles | Requires acceptance on intended deployment environment |
| Security and availability | No security certification, audit against industry controls, or real deployment availability test | Must be completed before high-assurance industrial operation |

## 7. Release interpretation

**Engineering acceptance:** The claim **“the Devashri S Quantum Studio operates as a 20-logical-qubit exact ideal statevector simulator for supported circuits”** is supported by the tests and calculations above.

**Industrial release qualification:** **Conditional / not established.** Production qualification needs target-browser acceptance and profiling, security assessment, independent toolchain crosschecks for representative customer workloads (e.g. IBM Qiskit Aer), reproducible performance baselines on deployment hardware, documented known-issue review, and signoff against the relevant domain-specific industrial safety and compliance requirements. The simulation must never be positioned as a physically realized 20-qubit chip or a hardware-calibrated noise predictor.

**Deployment:** No Vercel deployment is required for these tests and no Vercel project is configured by this report. Users can later deploy the GitHub `main` branch from their preferred account.

## 8. Traceability and audit procedure

1. Open the CI run linked at the top; confirm the workflow commit SHA and green `npm test`, `build:web`, `verify-20`, and Python stages.
2. Download the `quantum-20-validation` artifact; compare its per-case numeric evidence to Sections 3 and 5.
3. Review `scripts/independent_reference.py` and `scripts/verify-20.mjs`, together with `apps/engine/src/studio`, `apps/engine/src/simulator/QuantumCircuit.ts` and the `scale20.test.ts` suite.
4. Rerun the commands in Section 4 on an isolated checkout. Record hardware, Node version and SHA.
5. Revalidate the final merge SHA on `main`; a CI rerun is required if program code changes after the evidence snapshot.

**End of technical report.**
