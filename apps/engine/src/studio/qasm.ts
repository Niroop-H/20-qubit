import { readQuantumOperation } from "./qasm-syntax";
import { Program, Step, validateProgram, MAX_STEPS, MAX_QUBITS } from "./model";

/** Recursive-descent arithmetic only; never evaluates JavaScript or Python. */
export function expression(source: string): number {
  if (source.length > 200) throw new Error("Angle expression is too long.");
  const tokens =
    source.match(/(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?|pi|[()+\-*/]/g) ?? [];
  if (tokens.join("") !== source.replace(/\s/g, ""))
    throw new Error("Angles support numbers, pi, +, -, *, / and parentheses.");
  let i = 0;
  const atom = (): number => {
    const t = tokens[i++];
    if (t === "+") return atom();
    if (t === "-") return -atom();
    if (t === "(") {
      const v = sum();
      if (tokens[i++] !== ")") throw new Error("Unclosed angle parentheses.");
      return v;
    }
    if (t === "pi") return Math.PI;
    if (t === undefined || !/^\d|^\./.test(t))
      throw new Error("Expected an angle value.");
    return Number(t);
  };
  const product = (): number => {
    let v = atom();
    while (tokens[i] === "*" || tokens[i] === "/") {
      const op = tokens[i++];
      const b = atom();
      v = op === "*" ? v * b : v / b;
    }
    return v;
  };
  const sum = (): number => {
    let v = product();
    while (tokens[i] === "+" || tokens[i] === "-") {
      const op = tokens[i++];
      const b = product();
      v = op === "+" ? v + b : v - b;
    }
    return v;
  };
  const value = sum();
  if (i !== tokens.length || !Number.isFinite(value))
    throw new Error("Invalid or non-finite angle.");
  return value;
}
export function parseQasm(source: string): Program {
  if (source.length > 100000) throw new Error("Source is limited to 100 KB.");
  const clean = source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, "");
  const statements: { text: string; line: number }[] = [];
  let start=0,line=1,segmentLine=1;
  for(let i=0;i<clean.length;i++){
    if(clean[i]===";"){
      const raw=clean.slice(start,i),leading=raw.search(/\S/);
      if(leading>=0){
        const newlines=raw.slice(0,leading).match(/\n/g)?.length??0;
        statements.push({text:raw.trim(),line:segmentLine+newlines});
      }
      start=i+1;segmentLine=line;
    }
    if(clean[i]==="\n")line++;
  }
  if(clean.slice(start).trim())
    throw new Error("Line "+segmentLine+": statements must end with a semicolon.");
  const p: Program = { qubits: 0, bits: 0, steps: [] };
  let qname = "",
    cname = "",
    version = "";
  let operations = false;
  const add = (
    gate: Step["gate"],
    targets: number[],
    controls: number[] = [],
    params?: Record<string, number>,
    classical?: number,
  ) => {
    p.steps.push({
      id: `qasm-${p.steps.length}`,
      gate,
      targets,
      controls,
      params,
      classical,
    });
    if (p.steps.length > MAX_STEPS)
      throw new Error("Limit of 256 expanded operations exceeded.");
  };
  const operand = (text: string, kind: "q" | "c"): number[] => {
    const m = /^([a-zA-Z_]\w*)(?:\[(\d+)\])?$/.exec(text.trim());
    const name = kind === "q" ? qname : cname;
    const size = kind === "q" ? p.qubits : p.bits;
    if (!m || !name || m[1] !== name)
      throw new Error(
        `Unknown ${kind === "q" ? "quantum" : "classical"} register: ${text}.`,
      );
    if (m[2] !== undefined) {
      const n = Number(m[2]);
      if (n >= size) throw new Error(`Index ${n} is outside register ${name}.`);
      return [n];
    }
    return Array.from({ length: size }, (_, i) => i);
  };
  for (const { text, line } of statements)
    try {
      let m: RegExpExecArray | null;
      if ((m = /^OPENQASM\s+(2\.0|3(?:\.0)?)$/i.exec(text))) {
        if (version || qname || operations)
          throw new Error("Place one OPENQASM version header first.");
        version = m[1];
        continue;
      }
      if (!version)
        throw new Error("Start with OPENQASM 2.0; or OPENQASM 3.0;");
      if ((m = /^include\s+"([^"]+)"$/.exec(text))) {
        if (m[1] !== (version === "2.0" ? "qelib1.inc" : "stdgates.inc"))
          throw new Error("Include must match the OpenQASM version (qelib1.inc for 2.0, stdgates.inc for 3.0).");
        continue;
      }
      if ((m = /^(qreg|creg)\s+([a-zA-Z_]\w*)\[(\d+)\]$/.exec(text))) {
        if (version !== "2.0")
          throw new Error("Use qubit[n] / bit[n] declarations in OpenQASM 3.");
        if (operations) throw new Error("Declare registers before gates.");
        if (m[1] === "qreg") {
          if (qname) throw new Error("Use one quantum register.");
          qname = m[2];
          p.qubits = Number(m[3]);
        } else {
          if (cname) throw new Error("Use one classical register.");
          cname = m[2];
          p.bits = Number(m[3]);
        }
        if (Number(m[3]) < 1 || Number(m[3]) > MAX_QUBITS)
          throw new Error("Registers support 1–" + MAX_QUBITS + " bits.");
        continue;
      }
      if ((m = /^(qubit|bit)\[(\d+)\]\s+([a-zA-Z_]\w*)$/.exec(text))) {
        if (version === "2.0")
          throw new Error("Use qreg / creg declarations in OpenQASM 2.");
        if (operations) throw new Error("Declare registers before gates.");
        if (m[1] === "qubit") {
          if (qname) throw new Error("Use one quantum register.");
          qname = m[3];
          p.qubits = Number(m[2]);
        } else {
          if (cname) throw new Error("Use one classical register.");
          cname = m[3];
          p.bits = Number(m[2]);
        }
        if (Number(m[2]) < 1 || Number(m[2]) > MAX_QUBITS)
          throw new Error("Registers support 1–" + MAX_QUBITS + " bits.");
        continue;
      }
      if (!qname) throw new Error("Declare a quantum register first.");
      operations = true;
      const operation=readQuantumOperation(text);
      if(operation.kind==="arrow"){
        const qs=operand(operation.quantum,"q"),cs=operand(operation.classical,"c");
        if(qs.length!==cs.length)throw Error("Measurement register sizes differ.");
        qs.forEach((q,i)=>add("MEASURE",[q],[],undefined,cs[i]));
        continue;
      }
      if(operation.kind==="assignment"){
        if(version==="2.0")throw Error("Assignment measurement requires OpenQASM 3.");
        const qs=operand(operation.quantum,"q"),cs=operand(operation.classical,"c");
        if(qs.length!==cs.length)throw Error("Measurement register sizes differ.");
        qs.forEach((q,i)=>add("MEASURE",[q],[],undefined,cs[i]));
        continue;
      }
      if(operation.kind==="barrier"){
        add("BARRIER",operation.operands.split(",").flatMap(x=>operand(x,"q")));
        continue;
      }
      const name=operation.name,
        args=operation.angles.map(expression),
        qs=operation.operands.split(",").map(x=>operand(x,"q"));
      const paramsCount: Record<string, number> = {
        id: 0,
        i: 0,
        h: 0,
        x: 0,
        y: 0,
        z: 0,
        s: 0,
        sdg: 0,
        t: 0,
        tdg: 0,
        sx: 0,
        sxdg: 0,
        rx: 1,
        ry: 1,
        rz: 1,
        p: 1,
        u1: 1,
        u2: 2,
        u3: 3,
        u: 3,
        cx: 0,
        cz: 0,
        swap: 0,
        ccx: 0,
      };
      if (!Object.prototype.hasOwnProperty.call(paramsCount,name))
        throw new Error(`Unsupported instruction '${name}'.`);
      if (args.length !== paramsCount[name])
        throw new Error(`${name} expects ${paramsCount[name]} angle(s).`);
      const count =
        name === "ccx" ? 3 : ["cx", "cz", "swap"].includes(name) ? 2 : 1;
      if (qs.length !== count)
        throw new Error(`${name} expects ${count} operand(s).`);
      const width = Math.max(...qs.map((x) => x.length));
      if (qs.some((x) => x.length !== 1 && x.length !== width))
        throw new Error("Incompatible register sizes.");
      for (let i = 0; i < width; i++) {
        const q = qs.map((x) => (x.length === 1 ? x[0] : x[i]));
        if (["p", "u1", "sdg", "tdg"].includes(name)) {
          add("U", [q[0]], [], {
            theta: 0,
            phi: 0,
            lambda:
              name === "sdg"
                ? -Math.PI / 2
                : name === "tdg"
                  ? -Math.PI / 4
                  : args[0],
          });
        } else if (name === "sx" || name === "sxdg") {
          const sign = name === "sx" ? 1 : -1;
          add("U", [q[0]], [], {
            theta: Math.PI / 2,
            phi: (-sign * Math.PI) / 2,
            lambda: (sign * Math.PI) / 2,
          });
        } else if (["u", "u3", "u2"].includes(name)) {
          add("U", [q[0]], [], {
            theta: name === "u2" ? Math.PI / 2 : args[0],
            phi: name === "u2" ? args[0] : args[1],
            lambda: name === "u2" ? args[1] : args[2],
          });
        } else if (["rx", "ry", "rz"].includes(name))
          add(name.toUpperCase() as Step["gate"], q, [], { theta: args[0] });
        else if (name === "cx" || name === "cz")
          add(name.toUpperCase() as Step["gate"], [q[1]], [q[0]]);
        else if (name === "ccx") add("CCX", [q[2]], [q[0], q[1]]);
        else add(name === "id" ? "I" : (name.toUpperCase() as Step["gate"]), q);
      }
    } catch (e) {
      throw new Error(`Line ${line}: ${(e as Error).message}`);
    }
  if (!version) throw new Error("Missing OPENQASM header.");
  if (!p.bits) p.bits = p.qubits;
  validateProgram(p);
  return p;
}
export function toQasm(p: Program, version: 2 | 3 = 2): string {
  validateProgram(p);
  const lines =
    version === 2
      ? [
          "OPENQASM 2.0;",
          'include "qelib1.inc";',
          `qreg q[${p.qubits}];`,
          `creg c[${p.bits}];`,
        ]
      : [
          "OPENQASM 3.0;",
          'include "stdgates.inc";',
          `qubit[${p.qubits}] q;`,
          `bit[${p.bits}] c;`,
        ];
  for (const s of p.steps) {
    const q = (n: number) => `q[${n}]`;
    if (s.gate === "MEASURE") {
      const c = `c[${s.classical ?? s.targets[0]}]`;
      lines.push(
        version === 2
          ? `measure ${q(s.targets[0])} -> ${c};`
          : `${c} = measure ${q(s.targets[0])};`,
      );
      continue;
    }
    let name =
      s.gate === "I"
        ? "id"
        : s.gate === "U"
          ? version === 2
            ? "u3"
            : "U"
          : s.gate.toLowerCase();
    if (s.gate === "U")
      name += `(${s.params!.theta}, ${s.params!.phi}, ${s.params!.lambda})`;
    else if (["RX", "RY", "RZ"].includes(s.gate))
      name += `(${s.params!.theta})`;
    lines.push(
      `${name} ${[...(s.controls ?? []), ...s.targets].map(q).join(", ")};`,
    );
  }
  return lines.join("\n") + "\n";
}
export function toQiskit(p: Program): string {
  validateProgram(p);
  const lines = [
    "# Export for a local Python environment with Qiskit installed.",
    "from qiskit import QuantumCircuit",
    "from qiskit.quantum_info import Statevector",
    `qc = QuantumCircuit(${p.qubits}, ${p.bits})`,
  ];
  for (const s of p.steps) {
    const name =
      s.gate === "I"
        ? "id"
        : s.gate === "MEASURE"
          ? "measure"
          : s.gate.toLowerCase();
    const args =
      s.gate === "U"
        ? [s.params!.theta, s.params!.phi, s.params!.lambda]
        : ["RX", "RY", "RZ"].includes(s.gate)
          ? [s.params!.theta]
          : [];
    args.push(...(s.controls ?? []), ...s.targets);
    if (s.gate === "MEASURE") args.push(s.classical ?? s.targets[0]);
    lines.push(`qc.${name}(${args.join(", ")})`);
  }
  lines.push(
    "print(qc.draw())",
    "# Ideal probabilities before terminal measurement.",
    "state = Statevector.from_instruction(qc.remove_final_measurements(inplace=False))",
    "print(state.probabilities_dict())",
  );
  return lines.join("\n") + "\n";
}
