export interface ComplexMatrix2x2 {
  real: [[number, number], [number, number]];
  imag: [[number, number], [number, number]];
}

export function createComplex2x2(
  r00: number, r01: number,
  r10: number, r11: number,
  i00: number, i01: number,
  i10: number, i11: number
): ComplexMatrix2x2 {
  return {
    real: [[r00, r01], [r10, r11]],
    imag: [[i00, i01], [i10, i11]]
  };
}
