import { Program, Step, validateProgram } from "./model";
export function optimize(p: Program): Program {
  validateProgram(p);
  const out: Step[] = [];
  for (const s of p.steps) {
    if (s.gate === "I") continue;
    const prev = out[out.length - 1];
    const same =
      prev &&
      (["SWAP","CZ"].includes(s.gate)&&prev.gate===s.gate
       ? [...prev.targets,...(prev.controls??[])].sort((a,b)=>a-b).join(",")===
         [...s.targets,...(s.controls??[])].sort((a,b)=>a-b).join(",")
       : JSON.stringify(prev.targets) === JSON.stringify(s.targets) &&
         JSON.stringify(prev.controls ?? []) === JSON.stringify(s.controls ?? []));
    if (same && prev.gate === s.gate) {
      if (["H", "X", "Y", "Z", "CX", "CZ", "SWAP", "CCX"].includes(s.gate)) {
        out.pop();
        continue;
      }
      if (["RX", "RY", "RZ"].includes(s.gate)) {
        out.pop();
        const theta = prev.params!.theta + s.params!.theta;
        if (Math.abs(theta) > 1e-12) out.push({ ...s, params: { theta } });
        continue;
      }
    }
    out.push({ ...s });
  }
  return { ...p, steps: out };
}
/** Exact U/CX decompositions, up to a physically irrelevant global phase. */
export function transpile(p: Program, linear = false): Program {
  validateProgram(p);
  const steps: Step[] = [];
  const emit = (
    gate: Step["gate"],
    targets: number[],
    controls: number[] = [],
    params?: Record<string, number>,
  ) =>
    steps.push({
      id: `compiled-${steps.length}`,
      gate,
      targets,
      controls,
      params,
    });
  const u = (q: number, t: number, ph: number, l: number) =>
    emit("U", [q], [], { theta: t, phi: ph, lambda: l });
  const rawcx = (a: number, b: number) => emit("CX", [b], [a]);
  const swap = (a: number, b: number) => {
    rawcx(a, b);
    rawcx(b, a);
    rawcx(a, b);
  };
  const cx = (a: number, b: number) => {
    if (!linear || Math.abs(a - b) === 1) {
      rawcx(a, b);
      return;
    }
    const direction = b > a ? 1 : -1;
    const path: number[] = [];
    for (let q = a; Math.abs(q - b) > 1; q += direction) {
      swap(q, q + direction);
      path.push(q);
    }
    rawcx(b - direction, b);
    path.reverse().forEach((q) => swap(q, q + direction));
  };
  const h = (q: number) => u(q, Math.PI / 2, 0, Math.PI),
    t = (q: number, sign = 1) => u(q, 0, 0, (sign * Math.PI) / 4);
  for (const s of p.steps) {
    const q = s.targets[0],
      a = s.controls?.[0],
      b = s.controls?.[1];
    switch (s.gate) {
      case "I":
        break;
      case "H":
        h(q);
        break;
      case "X":
        u(q, Math.PI, 0, Math.PI);
        break;
      case "Y":
        u(q, Math.PI, Math.PI / 2, Math.PI / 2);
        break;
      case "Z":
        u(q, 0, 0, Math.PI);
        break;
      case "S":
        u(q, 0, 0, Math.PI / 2);
        break;
      case "T":
        t(q);
        break;
      case "RX":
        u(q, s.params!.theta, -Math.PI / 2, Math.PI / 2);
        break;
      case "RY":
        u(q, s.params!.theta, 0, 0);
        break;
      case "RZ":
        u(q, 0, 0, s.params!.theta);
        break;
      case "U":
        u(q, s.params!.theta, s.params!.phi, s.params!.lambda);
        break;
      case "CX":
        cx(a!, q);
        break;
      case "CZ":
        h(q);
        cx(a!, q);
        h(q);
        break;
      case "SWAP":
        cx(q, s.targets[1]);
        cx(s.targets[1], q);
        cx(q, s.targets[1]);
        break;
      case "CCX":
        h(q);
        cx(b!, q);
        t(q, -1);
        cx(a!, q);
        t(q);
        cx(b!, q);
        t(q, -1);
        cx(a!, q);
        t(b!);
        t(q);
        h(q);
        cx(a!, b!);
        t(a!);
        t(b!, -1);
        cx(a!, b!);
        break;
      default:
        steps.push({ ...s, id: `compiled-${steps.length}` });
    }
  }
  const result = { ...p, steps };
  validateProgram(result);
  return result;
}
