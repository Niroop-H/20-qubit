# MAH Quantum™ Development Studio

Developed by **Devashri S Quantum**. A free, browser-local quantum circuit simulator with a visual composer, executable OpenQASM editor, and circuit transpiler. No API key, paid service, or backend is required for the studio.

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

The studio supports **1–8 qubits**, **256 operations**, and **1–8192 shots** (the UI offers common shot counts). No hardware execution, IBM account integration, Python runtime, mid-circuit measurement, reset, classical control, loops, or user-defined QASM gates are included. Unsupported code produces a diagnostic instead of being silently ignored. This is an independent simulator, not IBM Quantum feature parity.

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
