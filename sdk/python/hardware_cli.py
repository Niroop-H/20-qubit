"""MAH Quantum local OT edge command-line gateway.

Execute on an approved engineering workstation or trusted OT jump host only.
The CLI offers configured-device detection, read-only acquisition, signed
telemetry-to-quantum job conversion, and approved research API submission.
No direct physical actuation command is exposed through this CLI.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

from mah_quantum import IndustryClient, verify_result, save_evidence
from mah_quantum_hardware import (
    detect_configured, load_profiles, snapshot, sign_hardware_snapshot,
    telemetry_to_parameter_job
)
from mah_quantum_modbus import ModbusProfile, Register, read_modbus_snapshot


def _load_file(path: Path, *, max_bytes: int = 65536) -> dict[str, Any]:
    if path.stat().st_size>max_bytes:
        raise ValueError("Edge JSON input exceeds the configured bounded size.")
    data=json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data,dict):
        raise ValueError("Expected a configuration object.")
    return data


def _modbus_profiles(path: Path) -> tuple[ModbusProfile,...]:
    raw=_load_file(path)
    if raw.get("schema")!="MAH-Quantum-Modbus-Config/v1" or set(raw)!={"schema","devices"}:
        raise ValueError("Unsupported Modbus edge configuration.")
    devices=raw["devices"]
    if not isinstance(devices,list) or not 1<=len(devices)<=16:
        raise ValueError("Modbus configuration requires 1–16 explicit devices.")
    profiles=[]
    for item in devices:
        if not isinstance(item,dict):
            raise ValueError("Malformed Modbus device profile.")
        if set(item)-{"device_id","ip","unit_id","port","enabled","timeout","registers"}:
            raise ValueError("Unexpected device profile field.")
        registers=item.get("registers",[])
        if not isinstance(registers,list):
            raise ValueError("Register list is required.")
        fields=[]
        for reg in registers:
            if not isinstance(reg,dict) or set(reg)-{"label","address","encoding","scale","offset","unit"}:
                raise ValueError("Unrecognized register field.")
            fields.append(Register(**reg))
        profiles.append(ModbusProfile(
            device_id=item["device_id"], ip=item["ip"], unit_id=item["unit_id"],
            registers=tuple(fields),port=item.get("port",502),
            enabled=item.get("enabled",False),
            timeout=item.get("timeout",2.5)))
    if len({p.device_id for p in profiles})!=len(profiles):
        raise ValueError("Duplicate Modbus device ID.")
    return tuple(profiles)


def _device(profiles:list|tuple,device_id:str):
    matches=[p for p in profiles if p.device_id==device_id]
    if len(matches)!=1:
        raise ValueError("Device ID not explicitly allowlisted or duplicated.")
    return matches[0]


def _save_new(path:Path,payload:dict[str,Any]):
    if path.exists():
        raise FileExistsError("Refusing to overwrite an existing scientific evidence file.")
    path.write_text(json.dumps(payload,ensure_ascii=False,indent=2,allow_nan=False)+"\n",
                    encoding="utf-8")


def run(argv:list[str]|None=None)->int:
    parser=argparse.ArgumentParser(description="MAH Quantum secure OT equipment research edge")
    subs=parser.add_subparsers(dest="command",required=True)
    detect=subs.add_parser("detect-scpi",help="Probe only explicitly configured SCPI instruments")
    detect.add_argument("--config",type=Path,required=True)
    capture=subs.add_parser("capture-scpi",help="Read real SCPI telemetry and sign snapshot")
    capture.add_argument("--config",type=Path,required=True)
    capture.add_argument("--device",required=True)
    capture.add_argument("--output",type=Path,required=True)
    capture_modbus=subs.add_parser("capture-modbus",help="Read only configured Modbus FC03 registers")
    capture_modbus.add_argument("--config",type=Path,required=True)
    capture_modbus.add_argument("--device",required=True)
    capture_modbus.add_argument("--output",type=Path,required=True)
    prepare=subs.add_parser("prepare-job",help="Convert signed hardware telemetry into ideal QASM job")
    prepare.add_argument("--snapshot",type=Path,required=True)
    prepare.add_argument("--channel",required=True)
    prepare.add_argument("--scale",type=float,required=True)
    prepare.add_argument("--offset",type=float,required=True)
    prepare.add_argument("--job-id",required=True)
    prepare.add_argument("--shots",type=int,default=128)
    prepare.add_argument("--seed",type=int,default=42)
    prepare.add_argument("--logical-qubits",type=int,default=1000)
    prepare.add_argument("--output",type=Path,required=True)
    submit=subs.add_parser("submit",help="Send a prepared research job via HTTPS API from edge server")
    submit.add_argument("--job",type=Path,required=True)
    submit.add_argument("--base-url",required=True)
    submit.add_argument("--output",type=Path,required=True)
    args=parser.parse_args(argv)
    if args.command=="detect-scpi":
        profiles=load_profiles(args.config)
        print(json.dumps({"schema":"MAH-Quantum-Hardware-Detection/v1",
                          "devices":detect_configured(profiles)},indent=2))
    elif args.command in ("capture-scpi","capture-modbus"):
        key=os.environ.get("MAH_QUANTUM_EDGE_HMAC_KEY","")
        if len(key)<32:
            raise RuntimeError("Configure MAH_QUANTUM_EDGE_HMAC_KEY only on the trusted edge host.")
        if args.command=="capture-scpi":
            result=snapshot(_device(load_profiles(args.config),args.device))
        else:
            result=read_modbus_snapshot(_device(_modbus_profiles(args.config),args.device))
        _save_new(args.output,sign_hardware_snapshot(result,key))
        print("Hardware snapshot captured and signed locally: "+str(args.output))
    elif args.command=="prepare-job":
        key=os.environ.get("MAH_QUANTUM_EDGE_HMAC_KEY","")
        if len(key)<32:
            raise RuntimeError("Configure MAH_QUANTUM_EDGE_HMAC_KEY only on the trusted edge host.")
        reading=_load_file(args.snapshot)
        job=telemetry_to_parameter_job(
            reading,channel=args.channel,scale=args.scale,offset=args.offset,
            job_id=args.job_id,shots=args.shots,seed=args.seed,
            logical_qubits=args.logical_qubits,attestation_key=key)
        _save_new(args.output,job)
        print("Bounded quantum research job generated: "+str(args.output))
    elif args.command=="submit":
        key=os.environ.get("MAH_QUANTUM_INDUSTRY_API_KEY","")
        if len(key)<32:
            raise RuntimeError("Industry API secret must be configured on the customer edge server.")
        job=_load_file(args.job,max_bytes=131072)
        client=IndustryClient(args.base_url,key)
        result=client.execute(job)
        if not verify_result(job,result):
            raise RuntimeError("Quantum engine result did not pass provenance checks.")
        save_evidence(args.output,result)
        print("Completed research result verified and saved: "+str(args.output))
    return 0


if __name__=="__main__":
    raise SystemExit(run())
