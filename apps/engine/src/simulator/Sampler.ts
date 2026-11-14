import { NoiseConfig } from "../types/circuit";
import { NoiseEngine } from "./NoiseEngine";
import { seededRandom } from "../studio/simulate";

/**
 * Sampler performs Monte Carlo projective measurement sampling.
 *
 * Given exact probabilities P(i) = |c_i|² for each computational basis state,
 * builds a cumulative distribution function (CDF) and uses binary search
 * (inverse CDF sampling) to draw N shots from the distribution.
 *
 * Optionally applies readout confusion (SPAM error) to each sampled bitstring.
 */
export class Sampler {
  public static sample(
    probs: Float64Array,
    numQubits: number,
    shots: number,
    noiseConfig?: NoiseConfig,
    seed = 42
  ): { counts: Record<string, number>; measuredProbs: Record<string, number> } {
    if(!Number.isInteger(numQubits)||numQubits<1||numQubits>20||
       probs.length!==2**numQubits||!Number.isInteger(shots)||shots<1||shots>8192||
       !Number.isInteger(seed)||seed<0||seed>4294967295)
      throw Error("Invalid seeded sampling dimensions or shot request.");
    const stateSize = probs.length,rng=seededRandom(seed);
    const total=probs.reduce((a,b)=>a+b,0);
    if(!Number.isFinite(total)||Math.abs(total-1)>1e-8||probs.some(p=>!Number.isFinite(p)||p<0))
      throw Error("Sampling requires a finite normalized probability vector.");

    // Build cumulative distribution for binary search sampling
    const cdf = new Float64Array(stateSize);
    cdf[0] = probs[0];
    for (let i = 1; i < stateSize; i++) {
      cdf[i] = cdf[i - 1] + probs[i];
    }

    const counts: Record<string, number> = {};

    for (let s = 0; s < shots; s++) {
      const r = rng();

      // Binary search to find the sampled state index
      let low = 0;
      let high = stateSize - 1;
      while (low < high) {
        const mid = (low + high) >> 1;
        if (r <= cdf[mid]) {
          high = mid;
        } else {
          low = mid + 1;
        }
      }

      // Convert index to bitstring in computational basis (MSB first)
      let bitstring = low.toString(2).padStart(numQubits, "0");

      // Apply readout confusion if noise is enabled
      if (noiseConfig?.enabled) {
        bitstring = NoiseEngine.applyReadoutConfusion(bitstring, noiseConfig.readoutError,rng);
      }

      counts[bitstring] = (counts[bitstring] || 0) + 1;
    }

    // Compute empirical probabilities from shot counts
    const measuredProbs: Record<string, number> = {};
    for (const [key, count] of Object.entries(counts)) {
      measuredProbs[key] = parseFloat((count / shots).toFixed(6));
    }

    return { counts, measuredProbs };
  }
}
