"""Local TCP protocol-emulator tests for the genuine Modbus FC03 adapter."""
import socket
import struct
import threading
import unittest

from mah_quantum_hardware import HardwareError, telemetry_to_parameter_job, sign_hardware_snapshot
from mah_quantum_modbus import ModbusProfile, Register, read_modbus_snapshot


class ModbusEmulator:
    def __init__(self, wrong_transaction=False):
        self.wrong_transaction=wrong_transaction
        self.calls=[]
        self.listen=socket.socket()
        self.listen.bind(("127.0.0.1",0))
        self.listen.listen(2)
        self.listen.settimeout(.1)
        self.port=self.listen.getsockname()[1]
        self.running=True
        self.thread=threading.Thread(target=self._serve,daemon=True)
        self.thread.start()

    @staticmethod
    def receive(sock,n):
        out=bytearray()
        while len(out)<n:
            part=sock.recv(n-len(out))
            if not part:
                raise ConnectionError("socket closed")
            out.extend(part)
        return bytes(out)

    def _serve(self):
        while self.running:
            try:
                client,_=self.listen.accept()
            except socket.timeout:
                continue
            except OSError:
                return
            with client:
                client.settimeout(1.0)
                while self.running:
                    try:
                        head=self.receive(client,7)
                        tx,proto,length,unit=struct.unpack(">HHHB",head)
                        body=self.receive(client,length-1)
                    except (OSError,ConnectionError):
                        break
                    if len(body)!=5:
                        break
                    fc,address,count=struct.unpack(">BHH",body)
                    self.calls.append((fc,address,count))
                    if address==10:
                        payload=struct.pack(">H",245)
                    elif address==20:
                        payload=struct.pack(">f",21.5)
                    else:
                        payload=b"\x00\x00"*count
                    if len(payload)!=count*2:
                        break
                    pdu=bytes((3,len(payload)))+payload
                    tx=tx+1 if self.wrong_transaction else tx
                    client.sendall(struct.pack(">HHHB",tx & 65535,0,len(pdu)+1,unit)+pdu)

    def stop(self):
        self.running=False
        self.listen.close()
        self.thread.join(timeout=2)


class TestModbusHardware(unittest.TestCase):
    def setUp(self):
        self.emulator=ModbusEmulator()
        self.profile=ModbusProfile(
            device_id="industrial-sensor-01",ip="127.0.0.1",
            unit_id=1,port=self.emulator.port,enabled=True,
            registers=(
                Register("temperature",10,scale=.1,unit="degC"),
                Register("pressure",20,encoding="float32",unit="bar"),
            )
        )

    def tearDown(self):
        self.emulator.stop()

    def test_reads_actual_tcp_register_response_without_any_write_function(self):
        result=read_modbus_snapshot(self.profile)
        self.assertEqual(result["schema"],"MAH-Quantum-Hardware-Snapshot/v1")
        self.assertEqual(result["device"]["transport"],"modbus_tcp_fc03")
        self.assertFalse(result["device"]["identityVerified"])
        self.assertEqual([m["value"] for m in result["measurements"]],[24.5,21.5])
        self.assertEqual(self.emulator.calls,[(3,10,1),(3,20,2)])
        self.assertTrue(all(fc==3 for fc,_,_ in self.emulator.calls))

    def test_telemetry_maps_into_1000q_ideal_research_job_without_plant_writes(self):
        result=sign_hardware_snapshot(read_modbus_snapshot(self.profile),
            "independent-hardware-edge-test-hmac-key-2026")
        job=telemetry_to_parameter_job(
            result,channel="temperature",scale=.01,offset=0,
            job_id="modbus-sensor-pilot",
            attestation_key="independent-hardware-edge-test-hmac-key-2026")
        self.assertEqual(job["kind"],"circuit")
        self.assertIn("ry(0.245",job["source"])
        self.assertEqual(self.emulator.calls,[(3,10,1),(3,20,2)])

    def test_rejects_disabled_and_public_network_config(self):
        inactive=ModbusProfile("inactive","127.0.0.1",1,
           registers=(Register("x",10),),port=self.emulator.port)
        with self.assertRaises(HardwareError):
            read_modbus_snapshot(inactive)
        for address in ["8.8.8.8","localhost","0.0.0.0","224.0.0.1"]:
            with self.subTest(address=address),self.assertRaises(ValueError):
                ModbusProfile("bad",address,1,(Register("x",10),))

    def test_rejects_bad_registers_and_unsafe_unit_id(self):
        with self.assertRaises(ValueError):
            Register("bad",65535,encoding="uint32")
        with self.assertRaises(ValueError):
            Register("x",20,scale=float("nan"))
        for unit in [0,248,256,-1]:
            with self.subTest(unit=unit),self.assertRaises(ValueError):
                ModbusProfile("bad","127.0.0.1",unit,(Register("x",10),))

    def test_wrong_transaction_id_is_detected(self):
        self.emulator.stop()
        self.emulator=ModbusEmulator(wrong_transaction=True)
        profile=ModbusProfile("bad-unit","127.0.0.1",1,
           registers=(Register("x",10),),port=self.emulator.port,enabled=True)
        with self.assertRaisesRegex(HardwareError,"transaction"):
            read_modbus_snapshot(profile)


if __name__=="__main__":
    unittest.main()
