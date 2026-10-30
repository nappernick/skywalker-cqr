import { contours } from "d3";

/** Grid resolution and world extent of the demand surface (world x and z run from -SPAN to SPAN). */
export const GRID = 128;
export const SPAN = 1.2;
const CELL = (2 * SPAN) / (GRID - 1);
const at = (a: ArrayLike<number>, i: number): number => a[i] ?? 0;

export interface Point {
  readonly x: number;
  readonly z: number;
}

/** World coordinate of grid index i (vertices sit on the grid lines, edge to edge). */
export const gridToWorld = (i: number): number => -SPAN + i * CELL;

/** Per-intent Gaussian footprints on the grid; a footprint's volume equals its weight. */
export interface Kernels {
  readonly cells: readonly Int32Array[];
  readonly values: readonly Float32Array[];
}

export function kernels(points: readonly Point[], sigma: number): Kernels {
  const peak = 1 / (2 * Math.PI * sigma * sigma);
  const reach = Math.ceil((3.2 * sigma) / CELL);
  const cells: Int32Array[] = [];
  const values: Float32Array[] = [];
  for (const p of points) {
    const ci = Math.round((p.x + SPAN) / CELL);
    const cj = Math.round((p.z + SPAN) / CELL);
    const idx: number[] = [];
    const val: number[] = [];
    for (let j = Math.max(0, cj - reach); j <= Math.min(GRID - 1, cj + reach); j += 1) {
      for (let i = Math.max(0, ci - reach); i <= Math.min(GRID - 1, ci + reach); i += 1) {
        const dx = gridToWorld(i) - p.x;
        const dz = gridToWorld(j) - p.z;
        const g = Math.exp(-(dx * dx + dz * dz) / (2 * sigma * sigma));
        if (g < 5e-4) continue;
        idx.push(j * GRID + i);
        val.push(g * peak);
      }
    }
    cells.push(Int32Array.from(idx));
    values.push(Float32Array.from(val));
  }
  return { cells, values };
}

export interface Field {
  readonly values: Float64Array;
  /** One layer per colour group, summing to `values`. */
  readonly groups: readonly Float64Array[];
}

/** Sums weighted footprints into a surface, split into colour-group layers. */
export function field(k: Kernels, weights: ArrayLike<number>, groupOf: ArrayLike<number>, nGroups: number): Field {
  const values = new Float64Array(GRID * GRID);
  const groups = Array.from({ length: nGroups }, () => new Float64Array(GRID * GRID));
  k.cells.forEach((cells, n) => {
    const w = at(weights, n);
    const vals = k.values[n];
    const layer = groups[at(groupOf, n)];
    if (!w || !vals || !layer) return;
    for (let c = 0; c < cells.length; c += 1) {
      const cell = at(cells, c);
      const v = w * at(vals, c);
      values[cell] = at(values, cell) + v;
      layer[cell] = at(layer, cell) + v;
    }
  });
  return { values, groups };
}

export function maxOf(a: ArrayLike<number>): number {
  let m = 0;
  for (let i = 0; i < a.length; i += 1) m = Math.max(m, at(a, i));
  return m;
}

/** Field value at a world point, bilinear between grid vertices. */
export function sample(values: ArrayLike<number>, x: number, z: number): number {
  const gx = Math.max(0, Math.min(GRID - 1.001, (x + SPAN) / CELL));
  const gz = Math.max(0, Math.min(GRID - 1.001, (z + SPAN) / CELL));
  const i = Math.floor(gx);
  const j = Math.floor(gz);
  const fx = gx - i;
  const fz = gz - j;
  const v = (a: number, b: number) => at(values, b * GRID + a);
  return (v(i, j) * (1 - fx) + v(i + 1, j) * fx) * (1 - fz) + (v(i, j + 1) * (1 - fx) + v(i + 1, j + 1) * fx) * fz;
}

const scratch: number[] = new Array<number>(GRID * GRID).fill(0);

/**
 * Writes contour rings at each threshold into `out` as 3D line segments (x, y, z per point, two points per
 * segment) at `heightOf(threshold) + lift`, and returns the number of floats written. Allocates nothing per call
 * beyond d3's own contour output.
 */
export function writeContours(values: Float64Array, thresholds: readonly number[], heightOf: (v: number) => number, lift: number, out: Float32Array): number {
  for (let i = 0; i < values.length; i += 1) scratch[i] = values[i] ?? 0;
  // d3.contours treats each value as a unit pixel; vertex k sits at pixel centre k + 0.5.
  const toWorld = (g: number) => gridToWorld(g - 0.5);
  let q = 0;
  const gen = contours().size([GRID, GRID]);
  thresholds.forEach((thr) => {
    const y = heightOf(thr) + lift;
    for (const poly of gen.contour(scratch, thr).coordinates) {
      for (const ring of poly) {
        for (let e = 0; e < ring.length - 1 && q + 6 <= out.length; e += 1) {
          const a = ring[e];
          const b = ring[e + 1];
          if (!a || !b) continue;
          out[q] = toWorld(a[0] ?? 0); out[q + 1] = y; out[q + 2] = toWorld(a[1] ?? 0);
          out[q + 3] = toWorld(b[0] ?? 0); out[q + 4] = y; out[q + 5] = toWorld(b[1] ?? 0);
          q += 6;
        }
      }
    }
  });
  return q;
}
