# Quantum laboratory playground

The `/lab` route is a full-page hardware workbench. `/lab/operations` retains the four guided transient laboratory exercises. The global **Quantum Workspace** dropdown switches between computing, laboratory, sensing and communication. Sensing and communication also link to matching hardware bench presets.

## Build, connect, investigate

1. Choose **Photonics bench**, **Quantum sensors**, or **Cold quantum lab**. These replace the current bench; **Undo** restores the previous edit.
2. Add instruments from the searchable, categorized library (maximum 24). Select in the viewport or the inventory strip below it.
3. Use **Inspector → Signal input** to choose a compatible source. Each source and input supports one connection. Reconnecting a source moves its existing connection. Cycles and incompatible ports are rejected.
4. Drag to orbit, scroll to zoom, or switch Perspective / Top / Front views. Shift-drag hardware to move it. Placement controls also set X, Z and rotation. Movement is geometric; it does not implicitly connect hardware or implement collisions.
5. Change parameters and inspect calculated outputs immediately. **Sweep** evaluates 81 evenly spaced samples and exports CSV. Upstream inputs remain fixed; the selected instrument's first observable is plotted.
6. **Record live readings** records the selected first observable every 250 ms (latest 240 samples). Adjust controls while recording. Recording samples deterministic model expectations; it does not itself introduce time dynamics or detector noise. Switching instruments clears the trace.
7. **Results → Capture comparison baseline** retains the current instrument outputs for comparison while changing parameters. Export a JSON result record for reuse.
8. Save/restore projects in browser storage, or export/import versioned JSON. Import validates bounded parameters, instrument count, positions, compatible connections, and acyclic signal flow. File size limit: 1 MB. Parameters and wiring are saved; recording, baseline and view mode are session tools.

**Explore** gives short explanations and guided goals. **Study** adds equations and validity ranges. **Research** adds reproducibility notes and model documentation. These modes change explanation depth, not mathematical accuracy. Five exercises cover photon routing, diamond resonance, SQUID interference, a cold qubit pulse and atom capture. Guided goals are numerical criteria, not qualifications or certification.

## Hardware and physical quantities

| Instrument | Governing model | Outputs and coupling |
|---|---|---|
| Photon source | E = hc/λ, Φ = P/E | Photon flux and wavelength feed one optical device |
| Mach–Zehnder | T₀ = (1 + V cos φ)/2; φ = φcontrol + 2π ΔL/λ | Port 0 flux feeds another optical device; complementary port 1 is reported |
| Photon detector | r = ηΦ + d; robs = r/(1 + rτ) | Efficiency, dark counts, non-paralyzable recovery loss |
| Diamond NV | f± = D(T) ± γB; D = 2870 − 0.074(T−300) MHz; γ = 28 MHz/mT | Two Lorentzian ODMR dips and axial Zeeman splitting |
| Fabry–Pérot | FSR = c/(2L), T = [1 + 4R/(1−R)² sin²(πΔν/FSR)]⁻¹ | Airy transmission, approximate finesse/linewidth, transmitted flux |
| DC SQUID | Ic = 2I₀ abs(cos(πΦ/Φ₀)), Φ₀ = h/(2e) | Critical-current modulation for symmetric negligible-inductance loop |
| Transmon | Charge-basis diagonalization and driven two-level pulse | Frequency, anharmonicity, temperature-adjusted T2 and P(1) |
| Paul trap | Mathieu q and pseudopotential | Ca-40 stability region, secular frequency and well depth |
| Optical tweezer | Far-detuned D2 light shift with Gaussian overlap | Rb-87 depth, scattering, recoil-heating estimate and capture criterion |
| Dilution refrigerator | Q = 84 n₃(Tmix² − Tin²) | Equilibrium temperature can feed one transmon |

A connected optical chain carries flux and source wavelength. The cavity detuning is an independent control relative to its resonance; changing source wavelength does not automatically recompute an absolute cavity mode. An unconnected interferometer/cavity computes transmission but supplies zero photon flux. An unconnected detector uses its explicit fallback flux. A refrigerator supplies an equilibrium stage temperature; transient cooldown, vacuum and failure scenarios remain in **Guided operations**.

The renderer shows idealized procedural equipment and indicator brightness mapped to model output. It does not solve electromagnetic fields, collisions, molecular dynamics, ray tracing, fabrication tolerances or hardware control. GPU WebGL enables orbitable 3D; otherwise an interactive SVG floor plan preserves selection, connections and all physics controls. The full-page layout adapts to narrow screens by stacking the viewport, library and inspector. Browser fullscreen availability depends on the device.

## Model limits

The source is monochromatic and continuous. Interferometry uses balanced lossless splitters and an entered visibility. The detector uses a mean non-paralyzable response, without jitter/afterpulsing or single-shot timing. NV uses an aligned field and two phenomenological Lorentzian dips, neglecting strain, hyperfine splitting, transverse mixing and temperature-dependent contrast. The −74 kHz/K slope is a local approximation near room temperature. Cavity finesse is the high-reflectivity approximation; its accuracy deteriorates at the low-reflectivity end. SQUID omits loop inductance, junction asymmetry and time-dependent phase dynamics. See each instrument's Study/Research notes and [the underlying laboratory guide](QUANTUM_LAB.md) for the other approximations.

These models support exploration and reproducible calculations; professional instrument predictions require measured calibration, uncertainty budgets and validation against experimental data. This is not an NVIDIA integration, an industrial multiphysics engine, or a calibrated digital replica of an actual facility.

## Architecture and extension

- `apps/engine/src/lab/hardware.ts`: typed hardware registry, bounded parameters, deterministic physics, typed connections and project validation. It reuses the existing quantum core.
- `apps/web/src/lab/Playground.tsx`: project editor, learning modes, measurements, sweep/export and browser persistence.
- `apps/web/src/lab/PlaygroundScene.tsx`: procedural Three.js apparatus, picking, placement, camera controls and accessible SVG fallback.
- `apps/web/src/WorkspaceMenu.tsx`: shared keyboard-accessible navigation with Escape and outside-click dismissal.
- `apps/engine/src/test/hardware.test.ts`: physical limits, conservation, connected calculations, import validation and failure cases.

To extend a hardware type, add its bounded parameter schema, calculation and validity notes to the registry, declare compatible signal ports, add physical limit tests and a procedural renderer. Preserve the versioned project contract or add an explicit migration. Numerical jobs currently run synchronously on the browser CPU; instrument count and sweep length are bounded. The GPU handles rendering only. No paid service, AI inference endpoint or backend is required.

## Sources

- Planck constant and photon-energy relation use SI defining constants h = 6.62607015×10⁻³⁴ J·s and c = 299792458 m/s.
- MIT Optics, optical resonators and Fabry–Pérot transmission: https://web.mit.edu/2.710/Fall06/2.710-wk8-a-ho.pdf
- NIST photon detector terminology and nonideal response: https://tsapps.nist.gov/publication/get_pdf.cfm?pub_id=936568
- NIST detector characterization: https://www.nist.gov/publications/simple-autocorrelation-method-thoroughly-characterizing-single-photon-detectors
- Harvard ODMR teaching experiment: https://ciqm.harvard.edu/uploads/2/3/3/4/23349210/zhang-submitted.pdf
- Acosta et al., temperature dependence of the NV ground-state splitting: https://doi.org/10.1103/PhysRevLett.104.070801
- NV spin Hamiltonian and γ: https://pmc.ncbi.nlm.nih.gov/articles/PMC10955911/
- Weizmann SQUID research and flux periodicity: https://www.weizmann.ac.il/condmat/superc/research-activities/squid-tip-sensors
- Additional transmon, Rb-87, sensing and cooling references: [Quantum Lab guide](QUANTUM_LAB.md).
