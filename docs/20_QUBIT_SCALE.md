# 20-qubit Quantum Studio — scope and resource limits

The Quantum Studio accepts **1–20 logical qubits**, **1–20 classical bits**, up to **256 expanded operations**, and **1–8,192 shots** for exact ideal execution. This is a local statevector simulator, not access to a 20-qubit physical quantum processor.

## Why changing an 8 to a 20 was not enough

A dense 20-qubit state contains 1,048,576 complex amplitudes, requiring 16 MiB in the two Float64Array buffers alone. The original code built a JavaScript object for every basis state, placed up to 2^n entries into a histogram, and drew each shot by scanning 2^n probabilities. Those operations made 20-qubit execution impractical.

* Ideal gate evolution stays in dense typed arrays; no full 2^n × 2^n matrix is allocated.
* Ideal shots use one cumulative distribution followed by binary search per shot.
* Exact ideal measurement marginals use a bounded Float64Array indexed by classical output, avoiding a million string keys.
* Results include all *sampled* labels plus up to 64 high-probability ideal labels. The statevector table shows up to 128 largest nonzero amplitudes with explicit truncation metadata. The histogram renders at most 32 bars.
* State inspection moves to a Web Worker, recalculates only on circuit/step changes, and reuses the full state for Pauli expectation queries. Scrubbing cancels the prior worker.
* A circuit containing H on all 20 qubits has a million non-zero amplitudes; displaying 128 of them does not imply that there are only 128 physical amplitudes. For uniform states, ranking ties are arbitrary.
* Large saved job results may not survive browser reload if their serialized content exceeds 90 KB. Download JSON to archive them.
* Noisy Kraus trajectory execution remains subject to a strict work budget of 16 million amplitude-step operations; large 20-qubit noisy experiments may be rejected rather than freezing the tab or silently replacing the noise model with an approximation.
* The laboratory pages implement separate reduced-order educational physics models and do not claim that 20 hardware qubits have been calibrated.

## Verification

Run `npm ci && npm test && npm run build:web`. The 20-qubit regression tests cover long-range entanglement, all-register Hadamard states, classical bit 19 measurement, execution request validation, deterministic seeded measurement, and noisy workload rejection. Physical correctness should additionally be assessed against independently implemented quantum computing packages, not by unit tests alone.

## Performance and limitations

Actual time depends on browser, CPU, system RAM, number of gates and shots. The UI remains responsive because heavy execution and inspection use separate workers. A 20-qubit ideal statevector can still be slow for circuits with 256 operations; this upgrade does not guarantee real-time simulation of arbitrary circuits. Result summaries deliberately exclude negligible or lower-ranked states; they must not be interpreted as a complete exported wavefunction.
