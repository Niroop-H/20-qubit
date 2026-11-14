# MAH Quantum™ Development Studio

Developed by **Devashri S Quantum**. A free-to-use, proprietary-source browser-local quantum circuit simulator with a visual composer, executable OpenQASM editor, and circuit transpiler. No API key, paid service, or backend is required for the studio.

**Current research scope (November 2026):** exact dense statevector simulation through **20 qubits**, selected exact Clifford/separable/partitioned calculations in the **100-qubit Studio**, and a **1,000–4,096 logical-qubit research workspace** for mathematically tractable families. These are classical simulations, **not** access to a physical quantum processor or unrestricted universal thousands-of-qubits computation. See [scalability](docs/SCALABLE_QUANTUM_ENGINE.md), [1000+ tools](docs/1000PLUS_SCIENTIFIC_INDUSTRIAL_WORKBENCH.md), and [validation evidence](docs/TECHNICAL_VALIDATION_20_QUBIT.md).

## Workspace

- **Composer:** edit targets, controls, angles, and measurement destinations; reorder operations; undo/redo. Supports H, X, Y, Z, S, T, I, RX, RY, RZ, U, CX, CZ, SWAP, CCX, barriers, and terminal measurements.
- **Code:** import, edit, compile, and run the supported static OpenQASM 2/3 subset. Circuit and code share one validated program model. Download QASM or export a Qiskit Python script; Python is not executed in the browser.
- **Inspector:** step through ideal evolution, inspect amplitudes and phases, Bloch vectors, reduced-state purity, and Pauli expectation values.
- **Transpiler:** eliminate adjacent inverse/identity gates, fuse rotations, decompose to U + CX, and optionally route to bidirectional nearest-neighbor connectivity. Routing restores logical ordering; equivalence is up to global phase. Preview before applying.
- **Results:** reproducible seeded shot sampling, observed versus ideal histograms, statevector tables, and CSV/JSON downloads. Simulations run in a cancellable Web Worker.
- **Projects and jobs:** local draft autosave, up to 30 saved circuit snapshots and 20 recent jobs, restore/rerun, JSON import/export. Browser storage is device-specific; export backups before clearing it.
- **Examples:** Bell, GHZ, Grover search, Deutsch–Jozsa, phase interference, and Toffoli circuits.
- **Visuals:** MAH Quantum branding, dark gold workspace, optional animated 3D-style quantum core, and reduced-motion support.

## Scope and numerical conventions

The supported **dense statevector** engine executes up to **20 qubits**. The 100-qubit Studio and the separate 1,000–4,096-qubit research workspace switch among exact Clifford stabilizer tableau, exact separable-state, and explicitly bounded partitioned non-Clifford engines as appropriate; unsupported entangled circuits fail visibly. Workload and shot limits vary by workspace/solver. The OpenQASM parser supports a documented static subset of QASM 2/3, not arbitrary QASM 3 control flow. Browser execution has no physical QPU connection, IBM account, mid-circuit measurement, reset, classical branching, loops, pulse scheduling or arbitrary user-defined gates. This is independent classical simulation, not IBM Quantum feature parity.

Bit strings use the highest bit on the left (`q[n-1]…q[0]`, or classical `c[n-1]…c[0]` for explicit measurements). Unmeasured classical bits remain zero. Without explicit measurements, all qubits are sampled. Statevectors and inspector values describe ideal evolution before terminal measurement.

Optional generic noise uses normalized Monte Carlo trajectories for amplitude damping, pure dephasing, stochastic Pauli errors, and asymmetric readout errors. T1, T2, and gate time use the same units; T2 must not exceed 2×T1. This is not a calibrated hardware model. Noisy runs are limited to 16 million shot × operation × state-size work units to keep browser workloads bounded. The displayed statevector remains an explicitly labelled ideal reference; no fabricated fidelity score is shown.

## Development

```bash
npm install
npm run dev:web
```

Use the local URL printed by Vite. A separate backend is unnecessary for browser execution.

```bash
npm test
npm run build:web
npm run build:engine
```

The test suite covers basic quantum math, QASM round trips and diagnostics, measurement mapping, seeded sampling, Bloch vectors, Pauli expectations, Grover search, noise behavior, validation, gate decompositions, and routed state equivalence. Production web assets are emitted to `apps/web/dist`. Existing Vercel configuration is retained.

## Code organization

- `apps/engine/src/studio/`: shared program validation, safe QASM parser, serializers, simulation, and transpilation.
- `apps/engine/src/math/` and `simulator/QuantumCircuit.ts`: complex matrix and statevector operations.
- `apps/web/src/`: React workspace, local persistence, and simulation worker.
- `api/circuit/simulate.ts`: optional compatibility endpoint using the same simulator and validation.
- `apps/engine/src/server.ts`: optional Express server (`npm run dev:engine`).

The compatibility endpoint accepts `qubits`, optional `bits`, `steps`, `shots`, `seed`, and `noiseModel`. Browser jobs do not call it. Legacy HTML/PDF manuals describe the earlier interface; use the in-app Guide and this README for current behavior.

## License

Proprietary software. Copyright © 2026 MAH Quantum™. See [LICENSE](LICENSE).

## Quantum technology workbenches

Dedicated pages: `/studio` (Quantum Computing), `/lab` (Quantum Lab Twin), `/sensing` (Quantum Sensing & Metrology), and `/communication` (Quantum Communication & Cryptography). The new workbenches compute locally without paid APIs.

See [the laboratory architecture, equations, operator exercises and deployment guide](docs/QUANTUM_LAB.md). Optional stateless Python service configuration is in `render.yaml`; the frontend does not require it.

## Full-page hardware playground

`/lab` now opens the configurable Quantum Playground: ten hardware models, connected optical and thermal signals, Explore/Study/Research modes, five guided goals, parameter sweeps, measurement exports and project save/import. The original four transient exercises are at `/lab/operations`. Read the [playground operator and physics guide](docs/PLAYGROUND.md).


## Scientific/industrial integration status

The **1,000+ Qubit** console includes reproducible large-circuit research models, computed connectivity and measurement graphs, sampled-run comparisons, a searchable **reference-only** equipment atlas, and a **2–10-variable p=1 QAOA/MaxCut** experimental optimization bench with an exhaustive classical optimum.

**Industry Integration Bridge** (controlled pilot): documented `/api/v1/capabilities`, `/api/v1/execute`, and `/api/v1/batch` APIs; strict server-only Bearer key; bounded supported QASM execution and weighted MaxCut; Python client and SHA-256 evidence. Browser-local work remains free, with no server credentials required. See [interoperability contract](docs/INDUSTRY_INTEROPERABILITY_V1.md), [OpenAPI](docs/openapi-industry-v1.yaml) and [Python SDK](sdk/python/README.md). The server API is disabled until a strong private `MAH_QUANTUM_INDUSTRY_API_KEY` is configured on the host. Never put the key in `VITE_` settings or a browser.

**Physical Hardware Bridge** provides *customer-side* read-only SCPI/TCP and Modbus/TCP telemetry gateways and offline unverified browser previews; SCPI single-sweep operation is locally gated by independently qualified operator and safety checks. This is not a certified production controller or a live machine connection from the browser. OPC UA, VISA/USB, general PLC control, arbitrary lab actuation and real QPUs are **not connected**. See [equipment integration and safety requirements](docs/PHYSICAL_EQUIPMENT_INTEGRATION.md).

To run the local test suite and compile the web/engine:

```bash
npm ci
npm test
npm run build:web
npm run build:engine
node scripts/verify_industry_routes.mjs
python -m unittest discover -s sdk/python -p 'test_*.py'
```

Passing offline CI does not establish third-party instrument compatibility, production safety certification, hosted API availability, quantum advantage, or commercial SLA readiness. Commissioning requires qualified vendor/site validation.

## Scientific Hamiltonian and variational diagnostics

The **1000+ Qubit** research console now includes a **Hamiltonian Lab** for statistically rigorous I/Z/ZZ diagonal observables over actual sampled bitstrings, editable and importable Ising coefficients, per-term expectation tables, sampled energy spectrum, Z–Z moment matrix, finite-shot confidence intervals, shot-budget planning, and SHA-256-linked analysis exports. The industrial MaxCut/QAOA bench additionally exports and visualizes all **324 actual multiscale γ/β objective evaluations**.

These are executed *classical numerical experiments*. The Hamiltonian lab is not a general molecular chemistry, VQE, non-diagonal Hamiltonian, hardware calibration, or ground-state solver; the QAOA module uses only 2–10 decision variables, not the 1,000+ circuit engine. View [scientific equations, input contracts and validation](docs/SCIENTIFIC_HAMILTONIAN_ANALYSIS.md). Hardware and commercial operational capabilities remain limited as described above.

### License and release boundary

The hosted browser experience may be used without a subscription, but the source is **UNLICENSED / proprietary**. Free use does not grant open-source modification or redistribution rights. Industrial use of real equipment requires separate vendor/site qualification.
