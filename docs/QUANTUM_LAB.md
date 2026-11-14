# MAH Quantum laboratory

## Pages and architecture

| Route | Page | Workbench |
|---|---|---|
| `/` | MAH Quantum — Devashri S Quantum | Animated chip and cryogenic cutaway; links to each discipline |
| `/studio` | Quantum Computing | Existing circuit composer, code and register calculations |
| `/lab` | Quantum Playground | Configurable hardware bench; see [playground guide](PLAYGROUND.md) |
| `/lab/operations` | Quantum Lab Twin operations | Coupled cryogenics, qubit calibration, optical trapping and environmental controls |
| `/sensing` | Quantum Sensing & Metrology | Ramsey magnetometry, clock offset and atom-interferometer gravimetry |
| `/communication` | Quantum Communication & Cryptography | BB84 exchange, fiber loss and CHSH correlations |

React pages call pure TypeScript models in `apps/engine/src/lab`. Controls update model inputs, models produce telemetry, and telemetry drives charts and the lazy-loaded Three.js laboratory. JSON exports contain model version, inputs and results. No paid API, cloud account or backend is required for these new pages. The existing studio remains independent.

The optional Python WSGI service provides stateless transmon, Rabi, sensing expectation, cryogenic heat-balance and environmental calculations. It is not required by or called by the frontend. It does not duplicate BB84, optical trapping, the complete plant time evolution or existing circuit execution.

## Mathematical models and limits

All units are explicit in the controls. These are reduced-order computational models, not hardware-calibrated predictions or equipment operating procedures. Geometry is procedural WebGL, not an engineering CAD reconstruction.

- **Transmon:** charge basis n = −7…7; diagonal `4 EC (n−ng)^2`, adjacent coupling `−EJ/2`, in GHz. Jacobi diagonalization returns the lowest five eigenenergies, f01 and anharmonicity. Finite charge-basis truncation limits accuracy at large EJ/EC.
- **Driven qubit:** `H/ℏ = (Ω cos φ X + Ω sin φ Y + Δ Z)/2`. The exact constant-pulse two-level unitary determines ideal P(1); an exponential contrast envelope supplies a phenomenological environment-adjusted population. Resonant π duration is `500 / ΩMHz` ns. I/Q controls rotate the drive axis. The leakage indicator `(Ω/|anharmonicity|)^2` is a risk proxy, not a computed three-level population. Existing circuit CNOT operations are available in the studio; no calibrated two-qubit microwave pulse model is claimed.
- **Noise:** thermal occupation `n = 1/(exp(hf/kT)−1)`, `T1 = T1base/(1+2n)`, and `1/T2 = 1/(2T1) + 1/Tφ + drift coefficient`. The magnetic coefficient is illustrative. RF attenuation is reported independently and is not a calibrated gate-error model.
- **Cryogenics:** cold-stage power `Q = 84 n3 (Tmix²−Tin²)` watts, with mol/s circulation and `Tin=8 mK`. Each coax adds an illustrative 8 nW load. Five stages approach gated targets through first-order time constants. This does not solve helium fluid dynamics or detailed material conduction. Condensing pressure is a qualitative flow indicator. Ramp is a training control scaling the time constant, not an enforced measured K/min derivative.
- **Vacuum:** `dP/dt = −(S/V)(P−Peq)` with effective pump rate 0.1/s and outgassing/leak floor; pressure in Torr. Cooling interlock uses 10⁻³ Torr. Fault thresholds for contamination, thermal shock and restricted flow are training rules, not equipment limits.
- **Optical trap:** far-detuned two-level Rb-87 D2 light shift proportional to intensity/detuning, Gaussian transverse and Rayleigh axial overlap, scattering and recoil-heating estimates. Capture is the threshold `depth > 5 kBT`, not atom trajectories. This approximation omits multilevel polarizability, collisions and cooling dynamics.
- **Ion trap:** Ca-40 quadrupole pseudopotential, Mathieu q and the a=0 stability boundary q<0.908. It does not integrate micromotion.
- **Environment:** single-mode isolation transmissibility with 3 Hz resonance, displacement-induced optical phase and Gaussian contrast decay. Shielding scales RF amplitude by `10^(−dB/20)`; magnetic shielding uses an entered attenuation factor. No spatial finite-element field solver is included.
- **Sensing:** Ramsey probability `(1 + C exp(−t/T2) cos(φ+analysisPhase))/2`, with phases `2π γ Bt`, `2π δf t`, or `keff δg t²`. Shot noise is seeded Bernoulli sampling. Uncertainty is the local quadrature projection-noise limit, not a global estimator or absolute instrument specification.
- **Communication:** BB84 includes random bases, optional intercept/resend, loss and bit flips, sifting, and a randomly selected disclosed test sample excluded from candidate bits. Candidate bits are not usable secure keys: authenticated classical exchange, reconciliation, finite-key security and privacy amplification are not implemented. Seeded randomness is reproducible, not cryptographic. The 11% threshold and `1−2h2(QBER)` are ideal asymptotic references only. CHSH samples ±1 products from singlet correlations, not a loophole-free experimental certification.

## Operator exercises

### 1. Cryogenic cooldown
1. Open `/lab/operations`, **Cryogenic cool-down**.
2. Enable **Vacuum pump**, then click **Advance 60 s** three times; confirm pressure below 10⁻³ Torr.
3. Enable **Helium compressor**. Leave valve 50%, flow 400 µmol/s, purity 99.99%, ramp 5.
4. Start **Run accelerated clock**. The five plates cool sequentially; each clock tick is 60 model seconds. Pause when the cold-stage objective is reached.
5. Raise heat load or coax count; watch equilibrium temperature rise. Set flow above 700 and valve below 15 to trigger a latched vapor-lock training fault. **Reset plant** restores initial conditions.

### 2. Optical tweezer alignment
1. Select **Optical tweezer** and click **Align to reference**.
2. Adjust power and atom temperature until the capture indicator reads **Trapped**.
3. Move X/Y away from zero or increase SLM phase error. Effective depth drops and the rendered atom array disappears when capture fails.
4. Compare scattering/heating while changing red detuning. Environmental residual motion also shifts the effective alignment.

### 3. Qubit calibration
1. Select **Qubit calibration**; choose superconducting transmon, trapped ion or neutral atom.
2. Set Rabi frequency to 10 MHz, detuning to zero and duration to 50 ns, or click **Set resonant π pulse**.
3. Verify ideal P(1)=100%; compare warm/cold environmental response. Inspect the complex unitary, I/Q values and sweep.
4. For transmons, change EJ/EC and examine eigenlevels and leakage-risk proxy. For ions, vary trap RF controls and inspect stability.

### 4. Seismic emergency
1. Select **Seismic response**, start the experiment and trigger the seismic event.
2. Within the four-second training response window, enable active isolation or **Pause & save telemetry**.
3. If contrast stays below 10%, state loss latches. Isolation cannot recover the lost run; reset the experiment.
4. Saved snapshots are model parameters and classical telemetry, not stored physical quantum states. Restore restores cryogenic state and controls only. Export captures the complete displayed experiment record.

On `/sensing`, choose a discipline, adjust signal and interrogation time, then run the seeded measurement and export. On `/communication`, compare BB84 with/without Eve, apply a fiber-link loss to the exchange, and inspect CHSH results. A different seed represents a new reproducible sample.

## Local development and tests

```sh
npm ci
npm run dev:web
npm test
npm run build:web
python -m unittest discover -s backend -p 'test_*.py'
python backend/app.py
```

The Python development server listens at `127.0.0.1:4001`. Example:

```sh
curl http://localhost:4001/health
curl -X POST http://localhost:4001/api/lab/rabi \
  -H 'Content-Type: application/json' \
  -d '{"omegaMHz":10,"detuningMHz":0,"durationNs":50}'
```

The service accepts JSON objects up to 16 KB and rejects non-finite or out-of-range inputs. See `backend/physics.py` for each endpoint's named inputs and defaults. Browser origins are an explicit comma-separated `ALLOWED_ORIGINS` list; CORS is not authentication or rate limiting. The API performs bounded public calculations and stores no user data.

## Deployment

**Vercel:** use the existing root `vercel.json`; install `npm ci`, build `npm run build:web`, output `apps/web/dist`. Dedicated route copies are generated for static hosting and route rewrites support direct links. Three.js loads only on the Lab Twin page. A WebGL-unavailable fallback keeps controls available.

**Render (optional):** use root `render.yaml` to create the free Python service. Set `ALLOWED_ORIGINS` to the exact HTTPS frontend origin, with no trailing slash. The blueprint starts Gunicorn and checks `/health`. No database or persistent disk is needed. This configuration is provided; the service has not been deployed. The frontend continues working without it.

There are no paid runtime API dependencies. Hosting remains subject to provider eligibility and quotas: Vercel Hobby is for personal/non-commercial use; Render free services sleep after inactivity and have cold starts. Do not upgrade plans or add paid resources to use these pages.

## References

- Koch et al., transmon: https://arxiv.org/abs/cond-mat/0703002
- Degen et al., quantum sensing: https://arxiv.org/abs/1611.02427
- Rb-87 constants: https://steck.us/alkalidata/rubidium87numbers.pdf
- Dilution refrigeration notes: https://fy.chalmers.se/~delsing/LowTemp/LectureNotes/LectureNotes16.PDF
- BB84: https://quantum.cloud.ibm.com/learning/en/modules/computer-science/quantum-key-distribution
- Three.js: https://threejs.org/docs/
- Hosting: https://render.com/docs/free and https://vercel.com/docs/plans/hobby

### Cryogenic model lower bound

The reduced-order steady-state heat balance assumes a numerical model output floor of **0.010 K (10 mK)** while its helium-3 inlet reference term is **0.008 K (8 mK)**. These are different quantities: the model floor is an artificial lower bound, not a physical minimum base temperature, guaranteed cooling limit, or sensor calibration. Real applications require equipment/vendor curves, thermal loads, measured sensor behavior and independent interlocks.
