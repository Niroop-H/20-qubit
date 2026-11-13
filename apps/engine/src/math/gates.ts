import { ComplexMatrix2x2, createComplex2x2 } from "./complex";

const INV_SQRT2 = 1.0 / Math.SQRT2;

export const GATES: Record<string, ComplexMatrix2x2> = {
  I: createComplex2x2(
    1, 0,
    0, 1,
    0, 0, 0, 0
  ),
  H: createComplex2x2(
    INV_SQRT2,  INV_SQRT2,
    INV_SQRT2, -INV_SQRT2,
    0, 0, 0, 0
  ),
  X: createComplex2x2(
    0, 1,
    1, 0,
    0, 0, 0, 0
  ),
  Y: createComplex2x2(
    0, 0,
    0, 0,
    0, -1,
    1, 0
  ),
  Z: createComplex2x2(
    1,  0,
    0, -1,
    0, 0, 0, 0
  ),
  S: createComplex2x2(
    1, 0,
    0, 0,
    0, 0,
    0, 1
  ),
  T: createComplex2x2(
    1, 0,
    0, INV_SQRT2,
    0, 0,
    0, INV_SQRT2
  )
};

export function createRxGate(theta: number): ComplexMatrix2x2 {
  const half = theta / 2.0;
  const cosH = Math.cos(half);
  const sinH = Math.sin(half);
  return createComplex2x2(
    cosH, 0,
    0, cosH,
    0, -sinH,
    -sinH, 0
  );
}

export function createRyGate(theta: number): ComplexMatrix2x2 {
  const half = theta / 2.0;
  const cosH = Math.cos(half);
  const sinH = Math.sin(half);
  return createComplex2x2(
    cosH, -sinH,
    sinH,  cosH,
    0, 0, 0, 0
  );
}

export function createRzGate(lambda: number): ComplexMatrix2x2 {
  const half = lambda / 2.0;
  const cosH = Math.cos(half);
  const sinH = Math.sin(half);
  return createComplex2x2(
    cosH, 0,
    0, cosH,
    -sinH, 0,
    0, sinH
  );
}

export function createUGate(theta: number, phi: number, lambda: number): ComplexMatrix2x2 {
  const cosT = Math.cos(theta / 2.0);
  const sinT = Math.sin(theta / 2.0);

  // U(θ,φ,λ) = [[cos(θ/2), -e^{iλ}sin(θ/2)],
  //              [e^{iφ}sin(θ/2), e^{i(φ+λ)}cos(θ/2)]]
  return createComplex2x2(
    cosT,
    -sinT * Math.cos(lambda),
    sinT * Math.cos(phi),
    cosT * Math.cos(phi + lambda),
    0,
    -sinT * Math.sin(lambda),
    sinT * Math.sin(phi),
    cosT * Math.sin(phi + lambda)
  );
}
