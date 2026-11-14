# Scientific Ising and variational optimization analysis

This research workbench is part of the **Niroop-H/20-qubit** repository only. It does not alter or operate any other repository or physical production equipment.

## Scope

The scientific console has nine modules. The **Hamiltonian Lab** computes actual finite-shot statistics of diagonal I/Z/ZZ Hamiltonians applied to completed local quantum-circuit simulation samples. The **Industrial Optimization** module now exposes and exports the actual QAOA parameter grid that its ideal p=1 statevector algorithm evaluated.

These tools work on **classical simulations of ideal quantum circuit models**, not on a physical processor. Neither tool claims unrestricted thousand-qubit universal quantum simulation, industrial certification, quantum advantage, calibrated device errors, exact physical measurements, or production machine control.

## Diagonal Ising Hamiltonian

Given observed classical output bitstring c with the rightmost position denoted c0, define z_i(c) = +1 for c_i=0 and −1 for c_i=1.

The user-supplied model is:

    E(c) = offset + Σ_i h_i z_i(c) + Σ_(i,j) J_(i,j) z_i(c) z_j(c)

It is a **diagonal operator** and cannot represent noncommuting X/Y operators, arbitrary electronic-structure Hamiltonians or non-Z-basis measurement tomography.

Import/export schema:

~~~json
{
  "schema": "MAH-Quantum-Diagonal-Ising/v1",
  "name": "Synthetic three-spin example",
  "offset": 0,
  "fields": [{"bit": 0, "weight": 0.5}],
  "couplings": [
    {"a": 0, "b": 1, "weight": -1},
    {"a": 1, "b": 2, "weight": 0.7}
  ]
}
~~~

Validation limits are 1–4096 measured classical bits, up to 64 distinct Z terms and 128 distinct undirected ZZ terms, no repeated bit or pair, no self-couplings, and finite bounded coefficients. Indices refer to **classical measurement destinations**, not always to the same-index qubit if the QASM explicitly maps measurement destinations. No units, plant calibration, or model validity are inferred from a coefficient: supply those externally.

### Computed statistics

For counts n_c and total shots N = Σ_c n_c:

- Sample energy mean = Σ_c n_c E(c) / N.
- Unbiased sample variance (N > 1) = Σ_c n_c(E(c) − mean)² / (N−1).
- Standard error = sqrt(sample variance / N).
- Approximate two-sided 95% normal confidence interval = mean ± 1.9599639845 × standard error.
- Per-term contribution = coefficient × empirical Z or ZZ expectation.
- Energy histogram = a bounded, complete partition of observed energy ranges, preserving **all shots**.
- Observed energy extrema = lowest and highest energies actually seen in this sample, **not** theoretical ground or maximal eigenenergies.
- Z–Z moment matrix = empirically measured E[Z_iZ_j] for the first eight model-participating bits. It is not covariance and not an entanglement witness.

If only one shot is present, variance, standard error and confidence bounds are explicitly unavailable. Constant samples may produce zero measured variance; this is not a hardware certainty claim.

### Shot-budget planner

The planner projects the observed **normal-approximation** 95% half-width at 128/256/512/1024 future shots, using the currently observed sample variance. Estimated shot count for requested half-width δ is:

    ceil(1.9599639845² × s² / δ²)

The projection assumes identically distributed independent ideal samples and stable observed variance. It is not a guarantee; it excludes measurement bias, drift, correlated noise, sensor calibration uncertainty, and model misspecification.

### Evidence exports

The JSON report includes source OpenQASM, a SHA-256 fingerprint where the browser supports crypto.subtle, backend method, seed, requested/completed shot counts, every sampled observed bitstring count, the complete bounded Hamiltonian model and all calculated statistics. Term CSV includes every term, coefficient, observed expectation and energy contribution.

A hash is an integrity checksum, not a signed hardware attestation. Do not upload proprietary industrial data to unapproved services or assume browser localStorage is encrypted/durable.

## Actual QAOA γ–β parameter landscape

The weighted-graph p=1 QAOA solver already evaluates a fixed coarse grid of **three 12 gamma × 9 beta scales = 324** candidate angles using a real bounded ideal statevector computation. The interface now records and renders **the actual computed expectation at each of those pairs**, and exports all 324 exact tuples as CSV. The displayed grid is not an interpolation, synthetic heatmap, empirical hardware calibration, or objective-value extrapolation.

The solver also performs two local refinement passes; final reported angles may differ from the grid samples. The independently enumerated classical MaxCut optimum remains the ground-truth reference for 2–10-variable weighted problems. The grid visualizes a numerical research objective, not a physically optimized industrial machine schedule.

## How to validate

Run:

~~~bash
npm ci
npm test
npm run build:web
node scripts/verify-20.mjs
node scripts/extended-validation.mjs
node scripts/browser_release_gate.mjs
~~~

For the Chromium release gate, first install the Playwright development toolchain as in .github/workflows/quantum-ci.yml. The tests execute 1000-qubit supported GHZ circuits in real browser workers; independently recalculate exported Ising mean and term sums from counts, verify shot count and model rejection, check the scientific interface at 390px, and assert that the QAOA grid exports all 324 numerical points.

### Not implemented

The platform does **not** implement non-diagonal Hamiltonian measurement-grouping circuits, full VQE or QPE for arbitrary molecular systems, real hardware SDK-backed quantum jobs, certified instrument-control interlocks, device-calibrated noisy quantum sensing, customer tenant accounts, or live high-availability HPC job scheduling. These require separate modeling, specialized infrastructure and customer/site acceptance.


### Why gamma uses multiple scales
For non-integer and incommensurate weighted MaxCut edges, gamma generally lacks a simple common period. Scanning only 2π/maxWeight can miss structure from smaller edge weights. The bounded optimizer therefore samples three 12-point gamma windows proportional to inverse maximum, median and minimum positive edge weights, capped at a dynamic range of 1024 relative to the maximum-weight scale. All 324 evaluated (gamma,beta,score) triples are retained; two subsequent local refinements use the scale of the best grid candidate. This is not a proof of globally optimal variational parameters.
