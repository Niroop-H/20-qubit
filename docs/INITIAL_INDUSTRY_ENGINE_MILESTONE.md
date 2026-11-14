# MAH Quantum — first implementation milestone (November 2026)

## Delivered on this branch

1. Both QASM 2/3 parsers lower 11 additional standard composite gates using a shared primitive gate library. Numerically checked controlled phase, controlled rotations, ZZ parity phase, controlled Y/H, Fredkin, CCZ and iSWAP. Per-parser expanded operation ceilings still apply.
2. Browser workspace: a shared 20-run allowance across Studio, the 1000+ Qubit circuit executor and industrial QAOA, using the server network quota endpoint when configured. The 20th launch starts a five-hour cooldown; a new 20-run allowance follows. In offline/deployment-unavailable fallback mode the local browser counter resets when clearing site data. Browser JavaScript never obtains a network identifier.
3. Industrial API: 20 execute credits per observed network address, five-hour cooldown, batch-weight accounting, input and budget preflight before charging, no stored raw IP address (only an ephemeral keyed HMAC counter). Inspect-only requests are free.
4. CI and regression tests cover QASM extensions and local/network allowance math.

## Required next milestones — not part of this implementation

- Replace browser-only access code and counter with server-verified sessions, roles, organization memberships and authorized compute permits.
- Move network/tenant counters to an atomic shared TTL store for multi-instance fairness. If no pseudonymous state may be stored, strict per-network quotas cannot be guaranteed; a different authorization policy will be required.
- Add persistent queued jobs, cancellation, wall-time/memory tracking, quota refunds on pre-execution worker failures, and run-level audit records.
- Build a typed intermediate representation and rigorous OpenQASM 2/3 conformance suite, then reset, mid-circuit measurement, classical branching, custom gate definitions and bounded loops.
- Integrate native optimized CPU and optional GPU engines as distinct validated adapters; benchmark 28+ qubits on specified hardware and disclose peak RAM.
- Integrate specialized stabilizer error-correction backends and structured tensor networks with independent reference comparisons.
- Add customer-approved QPU service adapters and read-only industrial acquisition via controlled edge hosts.
- Complete benchmark reproducibility, licensing evaluation, safety qualification, independent acceptance and commercial support terms.

## Operational limits

Client-side workers execute fully on users' devices: an HTTP network permit for the normal website UI cannot prevent someone directly running the public JavaScript engine offline. When configured, the server route improves browser-reset resistance for normal users, but is not a secure paywall. Without a quota secret, the visible local fallback resets on site-data clearing. A fully enforceable policy requires authenticated server-managed compute jobs and a shared server-side quota ledger. The current API quota is also per-process and insufficient for reliable production-wide metering. Machine safety and identity are separate controls, never inferred from an IP address.
