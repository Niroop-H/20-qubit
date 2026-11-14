"""MAH Quantum controlled laboratory edge gateway.

Real SCPI-over-TCP instrument transport with explicit device allowlisting,
identity verification, bounded telemetry, a fail-closed manual single-sweep
action and auditable output. Not a generic production PLC controller.
No network discovery scanning; only configured devices may be probed.

Safety-critical actions require vendor-specific qualification, independent
hardware interlocks and local operating approvals. Cloud QAOA/AI decisions
NEVER directly dispatch physical control messages.
"""
from __future__ import annotations

import hashlib
import hmac
import ipaddress
import json
import math
import os
import re
import secrets
import socket
import sqlite3
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

SCHEMA = "MAH-Quantum-Hardware-Snapshot/v1"
ACTION_SCHEMA = "MAH-Quantum-Hardware-Action/v1"
MAX_DEVICES = 16
MAX_RESPONSE_BYTES = 16384
SCPI_PORT = 5025
SCPI_TIMEOUT = 2.5
VALID_CLASSES = {"dmm", "oscilloscope", "spectrum_analyzer", "vna", "frequency_counter", "generic_scpi"}
# Curated, no user-provided raw SCPI commands. These can be vendor-dependent.
READ_COMMANDS: dict[str, tuple[str, str, set[str]]] = {
    "dc_voltage_v": ("MEAS:VOLT:DC?", "V", {"dmm"}),
    "frequency_hz": ("MEAS:FREQ?", "Hz", {"frequency_counter", "dmm"}),
    "center_frequency_hz": ("SENS:FREQ:CENT?", "Hz", {"spectrum_analyzer", "vna"}),
    "marker_level": ("CALC:MARK:Y?", "instrument units", {"spectrum_analyzer"}),
    "status_byte": ("*STB?", "integer", VALID_CLASSES),
}
# Physical write operations are deliberately small and not freely extensible.
CONTROL_COMMANDS = {
    "single_sweep": ("INIT:IMM", {"spectrum_analyzer", "vna"}),
}


class HardwareError(RuntimeError):
    """Operator-visible hardware gateway failure, excluding secret content."""


@dataclass(frozen=True)
class DeviceProfile:
    device_id: str
    ip: str
    expected_idn: str
    device_class: str = "generic_scpi"
    port: int = SCPI_PORT
    reads: tuple[str, ...] = ()
    enabled: bool = False
    allow_single_sweep: bool = False

    def __post_init__(self):
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}", self.device_id):
            raise ValueError("Invalid controlled equipment ID.")
        try:
            address = ipaddress.ip_address(self.ip)
        except ValueError as exc:
            raise ValueError("Hardware address must be a literal local IP, not a hostname.") from exc
        if address.version != 4 or not (address.is_private or address.is_loopback):
            raise ValueError("Only local/private IPv4 instrument addresses are accepted.")
        if address.is_multicast or address.is_unspecified or address.is_reserved and not address.is_loopback:
            raise ValueError("Unsafe instrument address.")
        if not isinstance(self.port, int) or not 1 <= self.port <= 65535:
            raise ValueError("Invalid SCPI TCP port.")
        if self.device_class not in VALID_CLASSES:
            raise ValueError("Unknown instrument family.")
        if not isinstance(self.expected_idn, str) or len(self.expected_idn.strip()) < 3 or len(self.expected_idn) > 100:
            raise ValueError("Expected SCPI identity substring is required.")
        if "\n" in self.expected_idn or "\r" in self.expected_idn:
            raise ValueError("Invalid expected instrument identifier.")
        if len(self.reads) > 8 or len(set(self.reads)) != len(self.reads):
            raise ValueError("Duplicate/excessive telemetry channels.")
        for name in self.reads:
            if name not in READ_COMMANDS or self.device_class not in READ_COMMANDS[name][2]:
                raise ValueError("Unsupported telemetry channel for "+self.device_class+": "+str(name))
        if self.allow_single_sweep and self.device_class not in CONTROL_COMMANDS["single_sweep"][1]:
            raise ValueError("Physical single-sweep support requires an explicitly profiled analyzer.")

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "DeviceProfile":
        allowed = {"device_id", "ip", "port", "expected_idn", "device_class",
                   "reads", "enabled", "allow_single_sweep"}
        if not isinstance(raw, dict) or set(raw) - allowed:
            raise ValueError("Unknown or malformed device profile fields.")
        readings = raw.get("reads", [])
        if not isinstance(readings, list) or any(not isinstance(x, str) for x in readings):
            raise ValueError("Read channels must be a string list.")
        if type(raw.get("enabled", False)) is not bool or type(raw.get("allow_single_sweep", False)) is not bool:
            raise ValueError("Enable flags must be booleans.")
        return cls(device_id=raw["device_id"], ip=raw["ip"],
                   expected_idn=raw["expected_idn"],
                   device_class=raw.get("device_class", "generic_scpi"),
                   port=raw.get("port", SCPI_PORT), reads=tuple(readings),
                   enabled=raw.get("enabled", False),
                   allow_single_sweep=raw.get("allow_single_sweep", False))


def load_profiles(path: str | Path) -> tuple[DeviceProfile, ...]:
    file = Path(path)
    if file.stat().st_size > 65536:
        raise ValueError("Equipment profile file exceeds 64 KiB.")
    raw = json.loads(file.read_text(encoding="utf-8"))
    if not isinstance(raw, dict) or set(raw) != {"schema", "devices"} or raw["schema"] != "MAH-Quantum-Equipment-Config/v1":
        raise ValueError("Unsupported equipment configuration schema.")
    if not isinstance(raw["devices"], list) or not 1 <= len(raw["devices"]) <= MAX_DEVICES:
        raise ValueError("Equipment profile list must contain 1–16 devices.")
    profiles = tuple(DeviceProfile.from_dict(x) for x in raw["devices"])
    if len({p.device_id for p in profiles}) != len(profiles):
        raise ValueError("Duplicate device IDs are not allowed.")
    return profiles


class SCPISession:
    """One bounded socket per operation, no scan, no indefinite blocking."""

    def __init__(self, profile: DeviceProfile, timeout: float = SCPI_TIMEOUT):
        self.profile = profile
        self.timeout = timeout
        self.sock: socket.socket | None = None

    def __enter__(self) -> "SCPISession":
        if not self.profile.enabled:
            raise HardwareError("Device is not enabled in the allowlisted local configuration.")
        if not 0.1 <= self.timeout <= 5.0:
            raise HardwareError("SCPI timeout must be between 100 ms and 5 seconds.")
        try:
            self.sock = socket.create_connection(
                (self.profile.ip, self.profile.port), timeout=self.timeout
            )
            self.sock.settimeout(self.timeout)
        except OSError as exc:
            raise HardwareError("Configured SCPI instrument is unreachable.") from exc
        return self

    def __exit__(self, *_args: object):
        if self.sock is not None:
            self.sock.close()
        self.sock = None

    def _send(self, command: str):
        if self.sock is None:
            raise HardwareError("SCPI socket is not connected.")
        if not command or len(command) > 80 or any(x in command for x in "\r\n;"):
            raise HardwareError("Unsafe SCPI instruction.")
        try:
            self.sock.sendall((command + "\n").encode("ascii", "strict"))
        except OSError as exc:
            raise HardwareError("SCPI operation failed.") from exc

    def query(self, command: str) -> str:
        if command not in {"*IDN?"} | {item[0] for item in READ_COMMANDS.values()}:
            raise HardwareError("This SCPI query is not allowlisted.")
        self._send(command)
        if self.sock is None:
            raise HardwareError("SCPI socket unavailable.")
        data = bytearray()
        try:
            while len(data) < MAX_RESPONSE_BYTES:
                part = self.sock.recv(min(1024, MAX_RESPONSE_BYTES - len(data)))
                if not part:
                    break
                data.extend(part)
                if b"\n" in part:
                    break
        except (OSError, TimeoutError) as exc:
            raise HardwareError("SCPI response timed out or disconnected.") from exc
        if not data or len(data) >= MAX_RESPONSE_BYTES or b"\n" not in data:
            raise HardwareError("Instrument response is missing, malformed, or oversized.")
        raw = data.split(b"\n", 1)[0].rstrip(b"\r")
        if any(x < 32 and x != 9 for x in raw):
            raise HardwareError("Unsafe SCPI control character in device response.")
        try:
            return raw.decode("utf-8", "strict").strip()
        except UnicodeError as exc:
            raise HardwareError("Instrument response is not valid UTF-8.") from exc

    def identify(self) -> str:
        idn = self.query("*IDN?")
        if self.profile.expected_idn.casefold() not in idn.casefold():
            raise HardwareError("Connected hardware identity does not match the approved device profile.")
        return idn

    def read(self, channel: str) -> dict[str, Any]:
        if channel not in self.profile.reads or channel not in READ_COMMANDS:
            raise HardwareError("Telemetry channel is not allowed for this device.")
        query, units, supported = READ_COMMANDS[channel]
        if self.profile.device_class not in supported:
            raise HardwareError("Telemetry channel does not match the instrument family.")
        response = self.query(query)
        try:
            value = float(response)
        except ValueError as exc:
            raise HardwareError("Instrument returned a non-numeric measurement.") from exc
        if not math.isfinite(value) or abs(value) > 1e15:
            raise HardwareError("Instrument measurement is outside accepted numeric bounds.")
        return {"channel": channel, "value": value, "unit": units, "source": "real_scpi"}


def snapshot(profile: DeviceProfile, *, timeout: float = SCPI_TIMEOUT) -> dict[str, Any]:
    """Detect and read only a previously approved instrument endpoint."""
    with SCPISession(profile, timeout) as scpi:
        firmware_identity = scpi.identify()
        measurements = [scpi.read(ch) for ch in profile.reads]
    return {
        "schema": SCHEMA,
        "recordedAtUtc": datetime.now(timezone.utc).isoformat(),
        "device": {"deviceId": profile.device_id, "class": profile.device_class,
                   "transport": "scpi_tcp", "configuredAddress": profile.ip,
                   "idn": firmware_identity, "identityVerified": True},
        "measurements": measurements,
        "hardwareConnected": True,
        "calibrated": False,
        "limitations": "Live instrument telemetry; no traceable calibration, uncertainty budget, or safety qualification implied."
    }


def detect_configured(profiles: tuple[DeviceProfile, ...]) -> list[dict[str, Any]]:
    """Probe ONLY configured, enabled endpoints; never discover network ranges."""
    records = []
    for profile in profiles:
        if not profile.enabled:
            records.append({"deviceId": profile.device_id, "status": "disabled"})
            continue
        try:
            with SCPISession(profile) as scpi:
                identity = scpi.identify()
            records.append({"deviceId": profile.device_id, "status": "connected_identity_verified",
                            "idn": identity, "class": profile.device_class})
        except HardwareError as exc:
            records.append({"deviceId": profile.device_id, "status": "unavailable",
                            "reason": str(exc)})
    return records


@dataclass(frozen=True)
class ApprovedAction:
    """Short-lived operator/supervisor authorization; never issued by the cloud AI."""
    schema: str
    device_id: str
    action: str
    operator: str
    supervisor: str
    reason: str
    issued_at: int
    expires_at: int
    nonce: str
    signature: str


def _signed_message(fields: dict[str, Any]) -> bytes:
    return json.dumps(fields, separators=(",", ":"), sort_keys=True).encode("utf-8")


def authorize_single_sweep(profile: DeviceProfile, *,
                           operator: str, supervisor: str, reason: str,
                           secret: str, now: int | None = None) -> ApprovedAction:
    """Two named human approvals must have happened outside this software.

    This function creates a short-lived signed authorization record; passing
    names does NOT verify real identities or grant external safety certification.
    """
    if not profile.enabled or not profile.allow_single_sweep:
        raise HardwareError("Physical control is not approved in this device profile.")
    if not all(isinstance(v, str) and 3 <= len(v.strip()) <= 120
               for v in (operator, supervisor, reason)):
        raise HardwareError("Two human approvers and a reason are required.")
    if operator.strip().casefold() == supervisor.strip().casefold():
        raise HardwareError("Operator and supervisor must be different.")
    if not isinstance(secret, str) or len(secret) < 32:
        raise HardwareError("Hardware authorization secret must be at least 32 characters.")
    timestamp = int(time.time() if now is None else now)
    fields: dict[str, Any] = {
        "schema": ACTION_SCHEMA, "device_id": profile.device_id,
        "action": "single_sweep", "operator": operator.strip(),
        "supervisor": supervisor.strip(), "reason": reason.strip(),
        "issued_at": timestamp, "expires_at": timestamp + 60,
        "nonce": secrets.token_hex(16)
    }
    signature = hmac.new(secret.encode(), _signed_message(fields), hashlib.sha256).hexdigest()
    return ApprovedAction(**fields, signature=signature)


def run_approved_sweep(profile: DeviceProfile, approval: ApprovedAction, *,
                       secret: str,
                       independent_interlock: Callable[[DeviceProfile], bool] | None = None,
                       operator_identity_authorized: Callable[[ApprovedAction], bool] | None = None,
                       audit_path: Path,
                       now: int | None = None) -> dict[str, Any]:
    """Issue one configured analyzer sweep, with multiple independent gates.

    This is NOT a substitute for a hardware-enforced safety interlock, local
    certified interlocks or an identity provider. Neither a user-entered name
    nor the signed record independently proves that two humans approved.
    Default operator identity and physical interlock checks are FAIL CLOSED.

    A persistent SQLite nonce journal atomically reserves every authorization
    BEFORE a device command so a process restart cannot replay an old token.
    """
    timestamp = int(time.time() if now is None else now)
    if not profile.enabled or not profile.allow_single_sweep or profile.device_class not in CONTROL_COMMANDS["single_sweep"][1]:
        raise HardwareError("Physical action not enabled for this instrument profile.")
    if not isinstance(secret, str) or len(secret) < 32:
        raise HardwareError("Strong server-only hardware authorization secret is required.")
    fields = {k: getattr(approval, k) for k in ("schema","device_id","action",
             "operator","supervisor","reason","issued_at","expires_at","nonce")}
    computed = hmac.new(secret.encode(), _signed_message(fields), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(computed, approval.signature):
        raise HardwareError("Physical command authorization signature is invalid.")
    if approval.schema != ACTION_SCHEMA or approval.device_id != profile.device_id or approval.action != "single_sweep":
        raise HardwareError("Authorization does not match requested physical command.")
    if not approval.issued_at <= timestamp <= approval.expires_at or approval.expires_at - approval.issued_at > 60:
        raise HardwareError("Physical command authorization has expired.")
    if operator_identity_authorized is None or operator_identity_authorized(approval) is not True:
        raise HardwareError("External operator and supervisor identity approval was not verified.")
    if independent_interlock is None or independent_interlock(profile) is not True:
        raise HardwareError("Independent physical equipment safety interlock was not confirmed.")
    if approval.nonce in _USED_ACTION_NONCES:
        raise HardwareError("Physical authorization cannot be replayed.")

    nonce_hash = hashlib.sha256(approval.nonce.encode()).hexdigest()
    audit_path.parent.mkdir(parents=True, exist_ok=True)
    db_path = audit_path.with_name(audit_path.name+".sqlite3")
    try:
        with sqlite3.connect(db_path, timeout=5.0) as db:
            db.execute("CREATE TABLE IF NOT EXISTS used_actions("
                       "nonce_sha256 TEXT PRIMARY KEY, device_id TEXT NOT NULL,"
                       "created_at INTEGER NOT NULL, status TEXT NOT NULL)")
            # Unique constraint serializes concurrent processes, not just threads.
            db.execute("INSERT INTO used_actions(nonce_sha256,device_id,created_at,status)"
                       " VALUES (?,?,?,?)",
                       (nonce_hash,profile.device_id,timestamp,"reserved"))
            db.commit()
    except sqlite3.IntegrityError as exc:
        raise HardwareError("Physical command authorization cannot be replayed.") from exc
    except (sqlite3.Error, OSError) as exc:
        raise HardwareError("Persistent edge audit authorization journal is unavailable.") from exc

    _USED_ACTION_NONCES.add(approval.nonce)
    status = "failed"
    try:
        with SCPISession(profile) as scpi:
            identity = scpi.identify()
            # Strict static command, never an arbitrary cloud or model-provided
            # SCPI command string. Device acts only after independent checks.
            scpi._send("INIT:IMM")
        status = "dispatched"
        return {"schema": ACTION_SCHEMA, "deviceId": profile.device_id,
                "operator": approval.operator, "supervisor": approval.supervisor,
                "action": "single_sweep", "status": "dispatched_not_calibrated",
                "identityVerified": identity,
                "recordedAtUtc": datetime.now(timezone.utc).isoformat()}
    finally:
        # Persistent status is updated even if network command send raises.
        try:
            with sqlite3.connect(db_path, timeout=5.0) as db:
                db.execute("UPDATE used_actions SET status=? WHERE nonce_sha256=?",
                           (status,nonce_hash))
                db.commit()
        except sqlite3.Error:
            pass  # Reserved nonce still blocks replay; report JSONL best effort.
        record = {"schema": "MAH-Quantum-Hardware-Audit/v1", "at": timestamp,
                  "deviceId": profile.device_id, "action": "single_sweep",
                  "operator": approval.operator, "supervisor": approval.supervisor,
                  "nonceSha256": nonce_hash, "status": status}
        line = json.dumps(record, separators=(",", ":"))+"\n"
        flags = os.O_WRONLY | os.O_APPEND | os.O_CREAT
        if hasattr(os, "O_NOFOLLOW"):
            flags |= os.O_NOFOLLOW
        fd = os.open(audit_path, flags, 0o600)
        try:
            os.write(fd, line.encode("utf-8"))
            os.fsync(fd)
        finally:
            os.close(fd)


_USED_ACTION_NONCES: set[str] = set()


def sign_hardware_snapshot(reading: dict[str, Any], secret: str) -> dict[str, Any]:
    """Local edge HMAC integrity attestation, not device-vendor certification.

    The signing secret must stay in the isolated OT edge service. Never use
    the ordinary cloud API key as the hardware snapshot signing secret.
    """
    if not isinstance(secret, str) or len(secret) < 32:
        raise ValueError("An independent strong edge HMAC key is required.")
    if reading.get("schema") != SCHEMA or reading.get("hardwareConnected") is not True:
        raise ValueError("Only an instrument gateway snapshot may be attested.")
    if "attestation" in reading:
        raise ValueError("Refusing to sign an already-attested snapshot.")
    payload = _signed_message(reading)
    digest = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()
    return {**reading, "attestation": {
        "algorithm": "HMAC-SHA256",
        "digest": digest,
        "scope": "configured-MAH-Quantum-edge-gateway"
    }}


def verify_hardware_snapshot(reading: dict[str, Any], secret: str,
                             *, max_age_seconds: int = 600) -> bool:
    """Check edge HMAC, timestamp freshness and complete telemetry structure.

    This integrity signal authenticates the holder of the edge key, not the
    physical sensor calibration, device identity on Modbus or an external lab.
    """
    if not isinstance(secret, str) or len(secret) < 32:
        raise ValueError("Strong edge attestation secret is required.")
    if reading.get("schema") != SCHEMA or reading.get("hardwareConnected") is not True:
        raise ValueError("Snapshot is not a completed physical acquisition.")
    stamp = reading.get("recordedAtUtc")
    try:
        instant = datetime.fromisoformat(stamp)
        age = (datetime.now(timezone.utc) - instant.astimezone(timezone.utc)).total_seconds()
    except (ValueError, TypeError, AttributeError) as exc:
        raise ValueError("Snapshot timestamp is missing or malformed.") from exc
    if instant.tzinfo is None or not 0 <= age <= max_age_seconds or max_age_seconds > 3600:
        raise ValueError("Snapshot is expired, from the future or has no timezone.")
    auth = reading.get("attestation")
    if not isinstance(auth, dict) or set(auth) != {"algorithm","digest","scope"} or auth.get("algorithm") != "HMAC-SHA256":
        raise ValueError("Missing or invalid edge HMAC attestation.")
    unsigned = {k:v for k,v in reading.items() if k != "attestation"}
    signature = hmac.new(secret.encode("utf-8"), _signed_message(unsigned), hashlib.sha256).hexdigest()
    if not isinstance(auth.get("digest"),str) or not hmac.compare_digest(auth["digest"],signature):
        raise ValueError("Hardware snapshot integrity verification failed.")
    if not isinstance(reading.get("device"),dict) or not isinstance(reading.get("measurements"),list):
        raise ValueError("Hardware snapshot structure is invalid.")
    return True


def telemetry_to_parameter_job(reading: dict[str, Any], *,
                               channel: str, scale: float,
                               offset: float, job_id: str,
                               shots: int = 128, seed: int = 42,
                               logical_qubits: int = 1000,
                               attestation_key: str | None = None) -> dict[str, Any]:
    """Explicit linear calibration map from approved telemetry to RY angle.

    The map is purely illustrative without a domain-certified calibration and
    does not feed commands or quantum results back into the physical device.
    """
    from mah_quantum import circuit_job
    verify_hardware_snapshot(reading, attestation_key or "")
    measurements = [x for x in reading.get("measurements", []) if x.get("channel") == channel]
    if len(measurements) != 1 or not all(math.isfinite(x) for x in (scale, offset)):
        raise ValueError("Missing unique telemetry channel or invalid calibration coefficients.")
    value = measurements[0].get("value")
    if not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError("Telemetry measurement is not finite.")
    theta = scale*value+offset
    if not math.isfinite(theta) or abs(theta) > 2*math.pi:
        raise ValueError("Mapped quantum rotation lies outside the specified ±2π pilot range.")
    if not isinstance(logical_qubits, int) or not 1000 <= logical_qubits <= 2048:
        raise ValueError("Remote quantum circuit register must be 1000–2048 qubits.")
    source = ("OPENQASM 2.0;\nqreg q["+str(logical_qubits)+"];\ncreg c["+
              str(logical_qubits)+"];\nry("+format(theta, ".17g")+") q[0];\n")
    return circuit_job(job_id, source, shots=shots, seed=seed)
