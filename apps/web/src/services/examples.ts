import { parseQasm } from "../../../engine/src/studio/qasm";
const code = (n: number, body: string) =>
  `OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[${n}];\ncreg c[${n}];\n${body}\n`;
export const examples = [
  {
    name: "Bell state",
    description: "Two maximally entangled qubits. Expect 00 and 11.",
    source: code(2, "h q[0];\ncx q[0], q[1];"),
  },
  {
    name: "GHZ state",
    description: "Three-way entanglement. Expect 000 and 111.",
    source: code(3, "h q[0];\ncx q[0], q[1];\ncx q[1], q[2];"),
  },
  {
    name: "Grover search",
    description: "One amplification iteration finds marked state 11.",
    source: code(
      2,
      "h q;\ncz q[0], q[1];\nh q;\nx q;\ncz q[0], q[1];\nx q;\nh q;",
    ),
  },
  {
    name: "Deutsch–Jozsa",
    description: "A balanced parity oracle. Input register resolves to 11.",
    source: code(
      3,
      "x q[2];\nh q;\ncx q[0], q[2];\ncx q[1], q[2];\nh q[0];\nh q[1];\nmeasure q[0] -> c[0];\nmeasure q[1] -> c[1];",
    ),
  },
  {
    name: "Phase interference",
    description: "Phase rotation converted to a measurable probability.",
    source: code(1, "h q[0];\np(pi/3) q[0];\nh q[0];"),
  },
  {
    name: "Toffoli logic",
    description: "Two active controls flip the third qubit to 111.",
    source: code(3, "x q[0];\nx q[1];\nccx q[0], q[1], q[2];"),
  },
];
export const initialProgram = () => parseQasm(examples[0].source);
