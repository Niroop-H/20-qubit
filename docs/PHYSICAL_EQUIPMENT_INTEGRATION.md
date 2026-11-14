# MAH Quantum — Physical Equipment Gateway v1

**Scope:** Development-ready physical research instrumentation integration in Niroop-H/20-qubit. Real protocol implementations and simulated-hardware socket tests; no customer hardware qualification, equipment safety certification, or general industrial actuation.

## Verified implementation scope

| Protocol | Real transport | Supported measurement | Physical commands |
| --- | --- | --- | --- |
| SCPI over private TCP | Explicit host and port only, vendor/model *IDN? checked | Curated numeric channels for lab instruments: DMM, frequency counter, spectrum analyzer, VNA | One manually gated analyzer INIT:IMM single-sweep action only; disabled by default |
| Modbus TCP | Explicit host, port, unit ID and register map | FC03 holding-register reads; 16-bit signed/unsigned and 32-bit unsigned/float scaling | None: no PLC, coil or register writes |
| OPC UA, USB/VISA, robot, PLC/SCADA, lasers and cryogenics | Not implemented | Not implemented | Not implemented |

The gateway does not scan LANs. SCPI identity checks apply only to approved configured devices. Modbus/TCP lacks authenticated device identity; register interpretation and endpoint authenticity require independent site qualification. Cloud-hosted quantum logic cannot issue physical commands.

## Installation and configuration

Install the Python SDK from the approved repository checkout:

    pip install ./sdk/python

Copy and customize sdk/python/scpi-devices.example.json or sdk/python/modbus-devices.example.json on a customer-controlled OT workstation. They default to enabled: false. Consult the manufacturer's command/register map and obtain site safety authorization before enabling a profile.

Set two distinct high-entropy credentials in the *edge* secret manager:

- MAH_QUANTUM_EDGE_HMAC_KEY: independent hardware snapshot signing key.
- MAH_QUANTUM_INDUSTRY_API_KEY: authenticated cloud research API key.

Never put either secret in the website bundle, source repository, screenshots or browser storage.

### Explicit detection and telemetry capture

    python sdk/python/hardware_cli.py detect-scpi --config scpi-devices.json

    python sdk/python/hardware_cli.py capture-scpi \
      --config scpi-devices.json --device spectrum-1 \
      --output hardware-snapshot.json

    python sdk/python/hardware_cli.py capture-modbus \
      --config modbus-devices.json --device modbus-sensor-1 \
      --output sensor-snapshot.json

Each captured file contains recorded UTC time, source transport, numerical measurements and HMAC-SHA256 signed provenance. No calibration is implied. Read-only commands never change physical setpoints or control registers.

### Scientific parameter mapping

The local edge CLI verifies the signature and timestamp freshness (ten-minute default), checks bounded finite numbers and converts an explicitly selected measurement into an ideal quantum rotation angle:

    theta = scale * measured_value + offset

Example:

    python sdk/python/hardware_cli.py prepare-job \
      --snapshot hardware-snapshot.json --channel marker_level \
      --scale 0.01 --offset 0 --job-id pilot-001 \
      --output research-job.json

    python sdk/python/hardware_cli.py submit \
      --job research-job.json \
      --base-url https://YOUR-APPROVED-DOMAIN.example \
      --output verified-evidence.json

This executes a **bounded classical simulation** of the generated quantum circuit through authenticated HTTPS and stores verified sample counts. There is no feedback actuator path from the cloud. Domain experts must validate the physical interpretation, sensor uncertainty and applicability of the measurement-to-circuit mapping. A quantum rotation is not automatically an industrial optimization algorithm.

### Physical control safety gate

The library implements only a narrow single analyzer sweep operation, which is **not accessible from the web UI or remote API**. It requires all of the following:

1. A local private-network, enabled and precisely defined VNA/spectrum analyzer profile with the single-sweep capability explicitly approved.
2. A short-lived (60 seconds) HMAC-signed action tied to the exact device, action, operator, supervisor and reason.
3. Independent verification of operator identities through a customer-approved authentication callback. Names alone do not establish identity.
4. Independent physical safety/interlock verification through a separately qualified hardware/safety callback.
5. Persistent SQLite nonce reservation before sending the command, with restart-safe replay prevention and audit records.
6. Real-time instrument identity check followed by one static SCPI INIT:IMM dispatch. No arbitrary equipment commands.
7. Site-specific procedures confirming physical safety, calibration and acceptable sweep settings.

The local function refuses to act if either identity or interlock callback is absent. This software does NOT supply certified identity or hardware interlock drivers. A site integrator must implement and qualify them before physically activating this feature. Factory PLC controls, cryogenic safety, laser power changes, process setpoints and other physical actuation are unsupported.

### Scientist-facing UI

The 1000+ Qubit workspace includes a **Hardware Bridge** page with truthful protocol coverage, local edge CLI instructions, imported offline measurement previews and exploratory sensor-to-QASM mapping. The browser cannot verify the edge HMAC and explicitly labels imported files as unverified offline previews. Only the trusted edge CLI can verify the HMAC and generate an attested executable job.

### Industrial acceptance before hardware commissioning

The physical deployment is not commercially certified simply because tests pass. The customer must validate instrument identity, network segmentation, vendor command compatibility, manufacturer limits, calibrated measurement units, fail-safe shutdown, operator roles, independently hardwired interlocks, signed approvals, audit storage, physical disconnection behavior, safe parameter bounds, cybersecurity threats, capacity and failure recovery. For genuine production control, the deterministic hardware control loop and safety PLC must remain independent of the quantum software.

CI tests use actual local TCP sockets connected to SCPI and Modbus emulators. No genuine production hardware or industrial operating license has been tested. OPC UA, VISA/USB, PLC/SCADA, robotics, scheduling, full physical digital twins and multi-tenant hardware governance require further separately validated driver development.

See docs/INDUSTRY_INTEROPERABILITY_V1.md for the bounded quantum API and docs/openapi-industry-v1.yaml for its machine-readable contract.
