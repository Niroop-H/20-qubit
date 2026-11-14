# 20-Qubit: 34-point security and correctness remediation

Date: 14 November 2026. **Repository scope: Niroop-H/20-qubit ONLY.** No other repository was modified. This document distinguishes code remediation from unverified external deployment and physical equipment.

## Itemized outcomes

| Finding | Remediation / disposition |
| --- | --- |
| 1. Catastrophic QASM regex | Linear-time syntax splitter in both parsers; malicious whitespace tests. |
| 2. Dense classical-width allocation crash | Reject dense simulator widths above 20 quantum or classical bits before allocation; tested 21–100. |
| 3. Low-level invalid qubit indices | Direct validation of indices, controls, arity and finite parameters in QuantumCircuit; tests for NaN prevention. |
| 4. Legacy noise physically incorrect | Normalized seeded amplitude-damping jump/no-jump, corrected dephasing probability, Pauli and readout models; measured Monte Carlo regression. |
| 5. Silent probability renormalization | Reject non-finite or unnormalized state rather than disguising a numerical bug; tests. |
| 6. Batch work budget undercount | Single and batch real-algorithm work estimation, exponential cost for connected partition components, bounded synchronous operation. |
| 7. Noisy-work budget | Include multiple full statevector passes per gate/qubit, fail before expensive computation. |
| 8. QAOA noninteger gamma period | Three inverse-weight gamma scales, bounded multiscale search and 324 actual measured numerical grid points. No global optimality claim. |
| 9. Inverse commuting operands | Adjacent reverse-CZ and reverse-SWAP cancellations with regression. |
| 10. CCX misclassified | Separate 3-qubit gate count. |
| 11. Misnamed logical depth | Explicit exact unit-cost gate depth label; no hardware timing claim. |
| 12. Research comparison | 8192 shots accepted for <=100 qubits, 1024 for larger; validate every outcome width. |
| 13. CHSH seed and tweezer wavelength | Validate seeded integer CHSH requests; Rayleigh range uses detuning-derived laser wavelength. |
| 14. Transmon Ω label | Rabi rate Ω/2π rather than carrier drive frequency. |
| 15. Missing device params crashes | Explicit malformed device/parameter/link errors. |
| 16. Large QASM subset drift | Added i/p/u1/u2/sx/sxdg; consistent measurement/barrier handling and true line numbers. |
| 17. Quadratic QASM line scanning | Incremental line count with statement-local offsets. |
| 18. Duplicated physics | Independent Python and TypeScript implementations retained; 13 cross-runtime CI physics parity cases now fail on drift. No false claim of source deduplication. |
| 19. Wilson interval misnamed | Renamed to wilson95 everywhere. |
| 20. Version-mismatched includes | QASM2 accepts qelib1.inc, QASM3 accepts stdgates.inc. |
| 21. Cryogenic 10mK floor | Explicitly document distinct 10mK output-model floor and 8mK inlet reference. This is a model assumption, not a certified physical limit. |
| 22. npm disables TLS / mirror | Official npm registry, strict SSL, 353 lockfile resolved URLs migrated; existing advisory gate. |
| 23. No rate limiting and unused CORS | Removed CORS and types; 60-per-minute/client Express throttle. Distributed edge-level rate limiting remains a deployment requirement. |
| 24. All errors HTTP422 and error leakage | Preserve typed 4xx inputs; genuine unexpected faults generic HTTP500. |
| 25. Bearer scheme case | Case-insensitive scheme and constant-time hash comparison. |
| 26. WSGI body/media/deep JSON | Exact media type; 411 for unknown unbounded lengths; bounded chunked input when server provides terminator, catch recursion/Unicode failures; tests. |
| 27. HMAC and SQLite | Reject non-ASCII or malformed hexadecimal signature before digest comparison; close SQLite connections explicitly after commit/rollback; tests. |
| 28. Health shape | Aligned Vercel and Express public health shape and truthful auth-required field. |
| 29. Dead legacy web API client | Removed unused caller of deliberately retired HTTP410 endpoint. |
| 30. Unused digest | Removed helper. |
| 31. Unsafe stored/project JSON | Reject null project and invalid stored container types; existing caller-level individual item validation. |
| 32. Access test dormant | Add workspace access policy tests to CI, using the real built policy engine. Browser-local access is not server-side authorization. |
| 33. Generated evidence not ignored | Added artifacts/ to Git ignore. |
| 34. Free/proprietary ambiguity | README distinguishes free-to-use hosted experience from UNLICENSED proprietary source. |

## Validated CI release gates

- npm ci; npm audit production dependencies; npm test (engine mathematical suites and adversarial audit regressions); npm run build:web.
- Real Python/TypeScript reduced-order physics parity with 13 scenarios: Rabi, transmon, sensing, cryogenics and environment.
- Industrial Vercel API and local Express tests, engine numerical independent tests, browser Chromium desktop/mobile scientific release gate and access-code policy tests.
- Python backend WSGI boundary tests and customer edge SDK tests, including fake-network SCPI/Modbus, hardware authorization replay protection, signature rejection and snapshot integrity.

## Not guaranteed by passing CI

This is **classical** ideal/numerically bounded quantum simulation, not a physical QPU, universal high-qubit simulation, hardware noise calibration or site-certified machine actuation.

The per-process Express rate limiter is not a globally consistent control across Vercel/Render instances. For operational deployment configure shared edge rate limiting, request concurrency quotas, durable job queues and private production monitoring. Qualification of actual industrial sensors, machine safety, communication protocols, vendor interlocks and deployment infrastructure requires separate tests and approvals.

The independent TypeScript and Python reduced-order physics implementations are kept in parity by regression tests but are not yet a single implementation. The 10mK refrigerator model floor is a documented numerical assumption, not a claim about real equipment. No quantified runtime SLA, hardware fidelity or quantum computational advantage is certified.

**GitHub Actions success does not mean the updated version is deployed**. Verify production hosting quota, the target project, its environment secrets, and live endpoints separately.
