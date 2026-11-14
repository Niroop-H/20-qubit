"""Read-only industrial Modbus/TCP adapter for the MAH Quantum edge gateway.

FC03 holding-register *reads only*; no FC05/06/15/16 register/coil writes.
Modbus is plaintext and unauthenticated. Deploy only inside approved isolated
OT networks with a dedicated jump host/firewall and customer safety review.
No auto-network scan or assumption of verified device identity.
"""
from __future__ import annotations

import ipaddress
import math
import secrets
import socket
import struct
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from mah_quantum_hardware import HardwareError, SCHEMA


@dataclass(frozen=True)
class Register:
    label: str
    address: int
    encoding: str = "uint16"
    scale: float = 1.0
    offset: float = 0.0
    unit: str = "raw"

    def __post_init__(self):
        if not isinstance(self.label, str) or not 1 <= len(self.label) <= 64:
            raise ValueError("Register label must be 1–64 characters.")
        if not isinstance(self.address, int) or not 0 <= self.address <= 65535:
            raise ValueError("Invalid Modbus register address.")
        if self.encoding not in {"uint16", "int16", "uint32", "float32"}:
            raise ValueError("Only bounded 16-bit, 32-bit and float32 decodings are supported.")
        if self.address + (2 if self.encoding in {"uint32", "float32"} else 1) > 65536:
            raise ValueError("32-bit register exceeds address range.")
        if not math.isfinite(self.scale) or not math.isfinite(self.offset) or self.scale == 0:
            raise ValueError("Invalid calibration scaling coefficients.")
        if not isinstance(self.unit, str) or not 1 <= len(self.unit) <= 32:
            raise ValueError("Invalid sensor unit label.")


@dataclass(frozen=True)
class ModbusProfile:
    device_id: str
    ip: str
    unit_id: int
    registers: tuple[Register, ...]
    port: int = 502
    enabled: bool = False
    timeout: float = 2.5

    def __post_init__(self):
        import re
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}", self.device_id):
            raise ValueError("Invalid Modbus equipment ID.")
        try:
            address = ipaddress.ip_address(self.ip)
        except ValueError as exc:
            raise ValueError("Instrument must use an explicit local numeric IP.") from exc
        if address.version != 4 or not (address.is_private or address.is_loopback) or address.is_multicast or address.is_unspecified:
            raise ValueError("Only approved private/loopback IPv4 OT addresses are allowed.")
        if type(self.unit_id) is not int or not 1 <= self.unit_id <= 247:
            raise ValueError("Modbus unit ID must be 1–247 (no broadcast).")
        if type(self.port) is not int or not 1 <= self.port <= 65535:
            raise ValueError("Invalid Modbus port.")
        if not 0.2 <= self.timeout <= 5:
            raise ValueError("Modbus timeout must be 0.2–5 seconds.")
        if not 1 <= len(self.registers) <= 16:
            raise ValueError("Only 1–16 explicitly approved telemetry registers may be read.")
        if len({r.label for r in self.registers}) != len(self.registers):
            raise ValueError("Duplicate sensor labels.")


def _receive(sock: socket.socket, n: int) -> bytes:
    result = bytearray()
    while len(result) < n:
        try:
            part = sock.recv(n-len(result))
        except (OSError, TimeoutError) as exc:
            raise HardwareError("Modbus/TCP telemetry response timed out.") from exc
        if not part:
            raise HardwareError("Modbus device disconnected during register response.")
        result.extend(part)
    return bytes(result)


def _decode(raw: bytes, encoding: str) -> float:
    format_for = {
        "uint16": ">H", "int16": ">h",
        "uint32": ">I", "float32": ">f"
    }
    return float(struct.unpack(format_for[encoding], raw)[0])


def read_modbus_snapshot(profile: ModbusProfile) -> dict[str, Any]:
    """Read only explicitly specified holding registers using Modbus FC03."""
    if not profile.enabled:
        raise HardwareError("Modbus equipment is disabled in the local allowlist.")
    measurements=[]
    try:
        with socket.create_connection((profile.ip,profile.port),timeout=profile.timeout) as sock:
            sock.settimeout(profile.timeout)
            for item in profile.registers:
                count=2 if item.encoding in ("uint32", "float32") else 1
                transaction=secrets.randbelow(65536)
                request=struct.pack(">HHHBBHH",transaction,0,6,profile.unit_id,3,item.address,count)
                sock.sendall(request)
                header=_receive(sock,7)
                tx,protocol,length,unit=struct.unpack(">HHHB",header)
                if tx!=transaction or protocol!=0 or unit!=profile.unit_id or not 2<=length<=253:
                    raise HardwareError("Modbus response transaction header or unit identity mismatch.")
                pdu=_receive(sock,length-1)
                if pdu[0]==0x83:
                    raise HardwareError("Modbus device rejected holding-register read.")
                if pdu[0]!=3 or pdu[1]!=2*count or len(pdu)!=(2+2*count):
                    raise HardwareError("Modbus response is malformed or uses an unapproved function.")
                raw=_decode(pdu[2:],item.encoding)
                value=item.scale*raw+item.offset
                if not math.isfinite(value) or abs(value)>1e15:
                    raise HardwareError("Industrial telemetry is not finite or exceeds configured numeric bounds.")
                measurements.append({
                    "channel":item.label,"value":value,"unit":item.unit,
                    "source":"real_modbus_tcp_fc03","register":item.address,
                    "encoding":item.encoding
                })
    except OSError as exc:
        raise HardwareError("Configured Modbus device is unreachable.") from exc
    return{
        "schema":SCHEMA,"recordedAtUtc":datetime.now(timezone.utc).isoformat(),
        "device":{
            "deviceId":profile.device_id,"class":"industrial_telemetry",
            "transport":"modbus_tcp_fc03","configuredAddress":profile.ip,
            "unitId":profile.unit_id,"identityVerified":False
        },
        "measurements":measurements,"hardwareConnected":True,"calibrated":False,
        "limitations":"Read-only unauthenticated Modbus FC03 on isolated OT network; register map and physical unit identity must be validated independently."
    }
