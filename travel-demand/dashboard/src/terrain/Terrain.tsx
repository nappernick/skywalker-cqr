import { interpolateRgb } from "d3";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { CHANNELS } from "../domain/types";
import { COVERAGE_LABEL, fmtInt, pct } from "../ui/format";
import { prefersReducedMotion, useWidth } from "../ui/hooks";
import { channelColor, coverageColor, FONT_FAMILY, useTheme, type Theme } from "../ui/theme";
import { useTooltip, type TipContent } from "../ui/Tooltip";
import { HEIGHT_LABEL, PART_TOP, parts, type ColorBasis, type HeightScale, type LandscapeSeries, type Level, type SeriesIntent, type TerrainData, type TerrainState } from "./data";
import { field, writeContours, GRID, gridToWorld, kernels, maxOf, sample, type Kernels } from "./landscape";
import { HOME_VIEW, Orbit, type FlyTarget, type View } from "./orbit";

const HEIGHT = 580;
/** World height of the tallest hill. */
const TOP = 1.09; // 0.78 raised 40%
const CONTOURS = 9;
const SIGMA = 0.1;
const LEVEL_ZOOM: Readonly<Record<Level, number>> = { 0: 1, 1: 1.35, 2: 3.4 };
/** Height exponent per scale option: deeper roots lift the small hills more. */
const POWER: Readonly<Record<HeightScale, number>> = { linear: 1, sqrt: 1 / 2, root3: 1 / 3, root4: 1 / 4, root5: 1 / 5 };
const TWEEN_MS = 650;
const MONTHS_PER_SECOND = 1 / 1.05;

export type Go = (level: Level, group: string | null, intent: string | null, fly?: boolean) => void;

// ---------- colour groups ----------

interface Grouping {
  readonly groupOf: Int32Array;
  readonly n: number;
  readonly color: (g: number) => string;
}

function grouping(series: LandscapeSeries, mode: ColorBasis, t: Theme): Grouping {
  const ints = series.intents;
  switch (mode) {
    case "group": {
      const inks = [t.text, t.text2, t.rule, t.flag, t.block] as const;
      return { groupOf: Int32Array.from(ints, (d) => d.domainIndex), n: Math.max(1, ...ints.map((d) => d.domainIndex + 1)), color: (g) => inks[g % inks.length] ?? t.text };
    }
    case "coverage": {
      const cov = ["full", "partial", "none"] as const;
      return { groupOf: Int32Array.from(ints, (d) => { const i = cov.findIndex((c) => c === d.meta.coverage); return i < 0 ? 3 : i; }), n: 4,
        color: (g) => { const c = cov[g]; return c === undefined ? t.flag : coverageColor(t, c); } };
    }
    case "channel":
      return { groupOf: Int32Array.from(ints, (d) => (d.channel === null ? CHANNELS.length : CHANNELS.indexOf(d.channel))), n: CHANNELS.length + 1,
        color: (g) => { const c = CHANNELS[g]; return c === undefined ? t.flag : channelColor(t, c); } };
    case "trend":
      return { groupOf: Int32Array.from(ints, (d) => (d.trend > 0.35 ? 0 : d.trend < -0.35 ? 2 : 1)), n: 3,
        color: (g) => (g === 0 ? t.text : g === 2 ? t.text2 : t.flag) };
  }
}

// ---------- animation ----------

interface Anim {
  /** Continuous frame position: 0 = all months, i = month i. */
  t: number;
  series: LandscapeSeries;
  fromWeights: Float64Array | null;
  fromMax: number;
  heightMix: number;
  colorFrom: ColorBasis;
  colorMix: number;
  /** Height exponent: 1 = linear, 0.5 = square root. */
  power: number;
  /** Behind an intent's parts the landscape fades toward the ground (0..1). */
  backdrop: number;
  /** Intent whose parts the landscape morphs into; kept while morphing back out. */
  focusId: string | null;
  labelAlpha: Map<string, number>;
  labelTarget: Map<string, number>;
  /** Sticky label placements, so labels do not hop between frames. */
  placement: Map<string, number>;
}

const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);

/** Weights at continuous time t. Past the last month, playback wraps smoothly back into the first month. */
function weightsAt(series: LandscapeSeries, t: number): Float64Array {
  const last = series.frames.length - 1;
  const i = Math.max(0, Math.min(last, Math.floor(t)));
  const j = i < last ? i + 1 : t > last ? 1 : last;
  const f = Math.max(0, Math.min(1, t - i));
  const a = series.frames[i];
  const b = series.frames[j];
  const out = new Float64Array(series.intents.length);
  if (!a || !b) return out;
  for (let n = 0; n < out.length; n += 1) out[n] = (a[n] ?? 0) * (1 - f) + (b[n] ?? 0) * f;
  return out;
}

function seriesMax(series: LandscapeSeries, k: Kernels): number {
  const one = new Int32Array(series.intents.length);
  return Math.max(1e-9, ...series.frames.map((w) => maxOf(field(k, w, one, 1).values)));
}

// ---------- the WebGL scene ----------

interface Scene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly surface: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  readonly ground: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  readonly lines: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  readonly dots: THREE.InstancedMesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  readonly orbs: THREE.InstancedMesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
}

const MAX_ORBS = PART_TOP + 1;
/** Scratch buffer for the colour blur. */
const blurBuf = new Float32Array(GRID * GRID * 3);
/** Capacity of the reused contour-line buffer, in floats. */
const LINE_FLOATS = 6 * 60000;

function makeScene(canvas: HTMLCanvasElement, w: number, h: number, nIntents: number): Scene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(w, h, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, w / h, 0.05, 50);
  // Soft sky fill plus a low raking sun, so slopes read as relief.
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6f6f6f, 0.95));
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(-2.6, 1.9, 1.2);
  scene.add(sun);

  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(GRID * GRID * 3);
  for (let j = 0; j < GRID; j += 1) {
    for (let i = 0; i < GRID; i += 1) {
      const k = (j * GRID + i) * 3;
      pos[k] = gridToWorld(i);
      pos[k + 2] = gridToWorld(j);
    }
  }
  const index: number[] = [];
  for (let j = 0; j < GRID - 1; j += 1) {
    for (let i = 0; i < GRID - 1; i += 1) {
      const a = j * GRID + i;
      index.push(a, a + GRID, a + 1, a + 1, a + GRID, a + GRID + 1);
    }
  }
  geo.setIndex(index);
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(GRID * GRID * 3), 3));
  const surface = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 }));
  scene.add(surface);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.0015;
  scene.add(ground);

  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(LINE_FLOATS), 3).setUsage(THREE.DynamicDrawUsage));
  const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ transparent: true, opacity: 0.4 }));
  lines.frustumCulled = false;
  scene.add(lines);
  const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0 }), Math.max(1, nIntents));
  const orbs = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 32, 22), new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0 }), MAX_ORBS);
  scene.add(dots, orbs);
  return { renderer, scene, camera, surface, ground, lines, dots, orbs };
}

function disposeScene(s: Scene): void {
  for (const m of [s.surface, s.ground, s.lines, s.dots, s.orbs]) {
    m.geometry.dispose();
    m.material.dispose();
  }
  s.renderer.dispose();
}

function placeCamera(cam: THREE.PerspectiveCamera, v: View): void {
  const r = 3.4 / v.zoom;
  const target = new THREE.Vector3(v.tx, 0.08, v.tz);
  cam.position.set(v.tx + r * Math.cos(v.pitch) * Math.sin(v.yaw), 0.08 + r * Math.sin(v.pitch), v.tz + r * Math.cos(v.pitch) * Math.cos(v.yaw));
  cam.lookAt(target);
  cam.updateMatrixWorld();
}

// ---------- labels and hits ----------

interface Anchor {
  readonly kind: "intent" | "group" | "part";
  readonly id: string;
  readonly value: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  /** Pick radius in px. */
  readonly r: number;
  readonly depth: number;
  readonly weight: number;
  readonly dim: boolean;
  readonly tip: TipContent;
  readonly intent: SeriesIntent | null;
}

interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

interface Live {
  td: TerrainData;
  state: TerrainState;
  theme: Theme;
  anim: Anim;
  kern: Kernels;
  max: number;
  hover: Anchor | null;
  anchors: Anchor[];
  boxes: Map<string, Box>;
  go: Go;
  goUp: () => void;
  onShiftPick: (id: string) => void;
  playing: boolean;
  speed: number;
  onMonth: (month: number) => void;
}

/** Label offsets tried in order (box centre relative to the anchor), so crowded labels move rather than overlap. */
const SPOTS: readonly (readonly [number, number])[] = [[0, -40], [-90, -54], [90, -54], [0, -84], [-140, -22], [140, -22], [-100, -104], [100, -104], [0, -128]];

const rgb = (c: THREE.Color) => [c.r, c.g, c.b] as const;
/** Reused per-vertex surface value, normalised so 1 is the tallest peak. */
const combBuf = new Float64Array(GRID * GRID);
/** Ring of an intent's parts around its peak (world units). */
const PART_RING = 0.21;
const PART_SIGMA = 0.05;
/** Part hills peak at this fraction of the full landscape height, so they stay in view when zoomed in. */
const PART_HEIGHT = 0.14;

function render(o: Orbit, S: Scene, L: Live, overlay: CanvasRenderingContext2D): void {
  const { theme: t, state: st, anim: A, kern } = L;
  const W = o.width;
  const H = o.height;

  // Weights now, blended across a size-basis tween.
  let w = weightsAt(A.series, A.t);
  const hk = ease(A.heightMix);
  if (A.fromWeights && hk < 1) {
    const from = A.fromWeights;
    w = w.map((v, n) => (from[n] ?? 0) * (1 - hk) + v * hk);
  }
  const vmax = A.fromWeights && hk < 1 ? A.fromMax * (1 - hk) + L.max * hk : L.max;
  const heightN = (n: number) => TOP * Math.min(1, Math.max(0, n)) ** A.power;
  const gNew = grouping(A.series, st.color, t);
  const ck = ease(A.colorMix);
  const gOld = ck < 1 ? grouping(A.series, A.colorFrom, t) : null;
  const fNew = field(kern, w, gNew.groupOf, gNew.n);
  const fOld = gOld ? field(kern, w, gOld.groupOf, gOld.n) : null;

  // Zooming into an intent morphs the landscape into its parts: one small hill per part, ringed round the
  // intent's peak, sized by its share of the intent. The morph runs on the same clock as the camera.
  if (st.level === 2 && st.intent !== null) A.focusId = st.intent;
  const pf = A.backdrop > 0.001 && A.focusId !== null ? L.td.byId.get(A.focusId) : undefined;
  const pb = pf ? ease(A.backdrop) : 0;
  const pps = pf ? parts(pf, st.part) : [];
  const ppts = pps.map((_, i) => {
    const a = (i / pps.length) * Math.PI * 2 - Math.PI / 2;
    const rr = PART_RING * (st.part === "month" ? 1 : 0.55 + 0.45 * Math.sqrt(i / pps.length));
    return { x: (pf?.x ?? 0) + Math.cos(a) * rr, z: (pf?.z ?? 0) + Math.sin(a) * rr };
  });
  const pField = pf && pps.length ? field(kernels(ppts, PART_SIGMA), Float64Array.from(pps, (p) => Math.sqrt(p.n)), Int32Array.from(pps, (_, i) => i), pps.length) : null;
  const pMax = pField ? Math.max(1e-9, maxOf(pField.values)) : 1;
  const inks = [t.text, t.text2, t.rule, t.flag, t.block] as const;
  const cPart = pps.map((p, i) => rgb(new THREE.Color(st.part === "channel" && p.channel !== null ? channelColor(t, p.channel) : (inks[i % inks.length] ?? t.text))));
  for (let k = 0; k < GRID * GRID; k += 1) combBuf[k] = ((fNew.values[k] ?? 0) / vmax) * (1 - pb) + (pField ? (PART_HEIGHT * (pField.values[k] ?? 0)) / pMax : 0) * pb;

  // Surface heights and colours. Colour is the dominant group's, faded into the ground at the foothills and
  // where groups mix, so colour always means "most of the demand here is this".
  const groundCol = new THREE.Color(t.frame);
  const [gr, gg, gb] = rgb(groundCol);
  const cNew = Array.from({ length: gNew.n }, (_, g) => rgb(new THREE.Color(gNew.color(g))));
  const cOld = gOld ? Array.from({ length: gOld.n }, (_, g) => rgb(new THREE.Color(gOld.color(g)))) : [];
  const pos = S.surface.geometry.getAttribute("position");
  const col = S.surface.geometry.getAttribute("color");
  const posArr = pos.array;
  const colArr = col.array;
  const fadeTo = 1 - A.backdrop * 0.7;
  // Colour at a point is the blend of group colours weighted by their share there (sharpened, so the leading
  // group dominates but boundaries fade rather than snap), faded into the ground at the foothills.
  const mixed = [0, 0, 0];
  const blend = (groups: readonly Float64Array[], palette: readonly (readonly [number, number, number])[], k: number, v: number, norm: number, fade: number) => {
    let sw = 0; let r = 0; let g = 0; let b = 0; let top = 0;
    for (let gi = 0; gi < groups.length; gi += 1) {
      const share = v > 0 ? (groups[gi]?.[k] ?? 0) / v : 0;
      if (share <= 0) continue;
      top = Math.max(top, share);
      const wgt = share * share * share;
      const c = palette[gi];
      if (!c) continue;
      sw += wgt; r += c[0] * wgt; g += c[1] * wgt; b += c[2] * wgt;
    }
    const strength = sw > 0 ? Math.max(0, Math.min(1, (top - 0.25) / 0.35)) * Math.min(1, (norm / 0.05) ** 0.8) * fade : 0;
    mixed[0] = gr + ((sw ? r / sw : gr) - gr) * strength;
    mixed[1] = gg + ((sw ? g / sw : gg) - gg) * strength;
    mixed[2] = gb + ((sw ? b / sw : gb) - gb) * strength;
  };
  for (let k = 0; k < GRID * GRID; k += 1) {
    const v = fNew.values[k] ?? 0;
    if (posArr instanceof Float32Array) posArr[k * 3 + 1] = heightN(combBuf[k] ?? 0);
    blend(fNew.groups, cNew, k, v, v / vmax, fadeTo);
    let r = mixed[0] ?? gr;
    let g = mixed[1] ?? gg;
    let bl = mixed[2] ?? gb;
    if (fOld && ck < 1) {
      blend(fOld.groups, cOld, k, v, v / vmax, fadeTo);
      const ro = mixed[0] ?? gr;
      const go2 = mixed[1] ?? gg;
      const bo = mixed[2] ?? gb;
      r = ro + (r - ro) * ck; g = go2 + (g - go2) * ck; bl = bo + (bl - bo) * ck;
    }
    if (pField && pb > 0) {
      const vp = pField.values[k] ?? 0;
      blend(pField.groups, cPart, k, vp, vp / pMax, 1);
      r += ((mixed[0] ?? gr) - r) * pb; g += ((mixed[1] ?? gg) - g) * pb; bl += ((mixed[2] ?? gb) - bl) * pb;
    }
    if (colArr instanceof Float32Array) { colArr[k * 3] = r; colArr[k * 3 + 1] = g; colArr[k * 3 + 2] = bl; }
  }
  // Two passes of a separable box blur on the colours, so boundaries between groups are soft, not sawtoothed.
  if (colArr instanceof Float32Array) {
    for (let pass = 0; pass < 2; pass += 1) {
      for (const horizontal of [true, false]) {
        blurBuf.set(colArr);
        for (let j = 0; j < GRID; j += 1) {
          for (let i = 0; i < GRID; i += 1) {
            const k = j * GRID + i;
            const a = horizontal ? (i > 0 ? k - 1 : k) : (j > 0 ? k - GRID : k);
            const b = horizontal ? (i < GRID - 1 ? k + 1 : k) : (j < GRID - 1 ? k + GRID : k);
            for (let ch = 0; ch < 3; ch += 1) colArr[k * 3 + ch] = ((blurBuf[a * 3 + ch] ?? 0) + (blurBuf[k * 3 + ch] ?? 0) * 2 + (blurBuf[b * 3 + ch] ?? 0)) / 4;
          }
        }
      }
    }
  }
  pos.needsUpdate = true;
  col.needsUpdate = true;
  S.surface.geometry.computeVertexNormals();
  S.surface.geometry.computeBoundingSphere();
  S.ground.material.color.copy(groundCol);

  // Contour rings, lifted a hair above the surface.
  const thresholds = Array.from({ length: CONTOURS }, (_, k) => ((k + 1) / (CONTOURS + 1)) ** (1 / A.power));
  const lineAttr = S.lines.geometry.getAttribute("position");
  if (lineAttr.array instanceof Float32Array) {
    const n = writeContours(combBuf, thresholds, heightN, 0.0025, lineAttr.array);
    S.lines.geometry.setDrawRange(0, n / 3);
    lineAttr.needsUpdate = true;
  }
  S.lines.material.color.set(t.text);
  S.lines.material.opacity = 0.32;

  // Intent markers (level 1+) and part spheres (level 2).
  const ints = A.series.intents;
  const maxW = Math.max(1e-9, ...w);
  const m4 = new THREE.Matrix4();
  const tmp = new THREE.Color();
  const surfaceY = (x: number, z: number) => heightN(sample(combBuf, x, z));
  ints.forEach((d, n) => {
    const v = w[n] ?? 0;
    const show = st.level >= 1 && v > 0;
    const r = show ? 0.007 + 0.016 * Math.sqrt(v / maxW) : 0;
    m4.makeScale(r, r, r).setPosition(d.x, surfaceY(d.x, d.z) + r * 0.6, d.z);
    S.dots.setMatrixAt(n, m4);
    const dim = st.group !== null && d.domain !== st.group;
    S.dots.setColorAt(n, tmp.set(gNew.color(gNew.groupOf[n] ?? 0)).lerp(groundCol, dim ? 0.75 : 0));
  });
  // Only the instances in use are drawn; unused slots would otherwise render as unit spheres.
  S.dots.count = 0; // markers are drawn as label leader dots on the overlay, not as 3D spheres
  S.dots.instanceMatrix.needsUpdate = true;
  if (S.dots.instanceColor) S.dots.instanceColor.needsUpdate = true;

  const focus = st.level === 2 && st.intent !== null ? L.td.byId.get(st.intent) : undefined;
  const ps = focus ? parts(focus, st.part) : [];
  const pmax = Math.max(1, ...ps.map((p) => p.n));
  const partAt = ps.map((p, i) => {
    const pt = ppts[i] ?? { x: focus?.x ?? 0, z: focus?.z ?? 0 };
    const r = 0.012 + 0.03 * Math.sqrt(p.n / pmax);
    return { p, x: pt.x, z: pt.z, r, y: surfaceY(pt.x, pt.z) };
  });
  const parentColor = focus ? gNew.color(gNew.groupOf[ints.findIndex((d) => d.id === focus.id)] ?? 0) : t.muted;
  for (let i = 0; i < MAX_ORBS; i += 1) {
    const it = partAt[i];
    if (it) {
      m4.makeScale(it.r, it.r, it.r).setPosition(it.x, it.y, it.z);
      S.orbs.setColorAt(i, tmp.set(st.part === "channel" && it.p.channel !== null ? channelColor(t, it.p.channel) : interpolateRgb(parentColor, t.muted)(i / (PART_TOP + 2))));
    } else m4.makeScale(0, 0, 0);
    S.orbs.setMatrixAt(i, m4);
  }
  S.orbs.count = 0;
  S.orbs.instanceMatrix.needsUpdate = true;
  if (S.orbs.instanceColor) S.orbs.instanceColor.needsUpdate = true;

  placeCamera(S.camera, o.view);
  S.renderer.render(S.scene, S.camera);

  // ---------- anchors for labels, tooltips and picking ----------
  const v3 = new THREE.Vector3();
  const toScreen = (x: number, y: number, z: number) => {
    v3.set(x, y, z).project(S.camera);
    return { x: (v3.x * 0.5 + 0.5) * W, y: (-v3.y * 0.5 + 0.5) * H, depth: v3.z };
  };
  const per = HEIGHT_LABEL[st.height];
  const anchors: Anchor[] = [];
  if (st.level === 0) {
    // One label per category, on its highest point.
    const best = new Map<string, { d: SeriesIntent; h: number; share: number; n: number }>();
    ints.forEach((d, n) => {
      const h = surfaceY(d.x, d.z);
      const cur = best.get(d.domain);
      const share = (cur?.share ?? 0) + (w[n] ?? 0);
      best.set(d.domain, { d: cur && cur.h >= h ? cur.d : d, h: Math.max(h, cur?.h ?? 0), share, n: (cur?.n ?? 0) + 1 });
    });
    for (const [dom, b] of best) {
      if (b.share <= 0) continue;
      const p = toScreen(b.d.x, b.h, b.d.z);
      anchors.push({ kind: "group", id: dom, value: pct(b.share), name: dom, x: p.x, y: p.y, r: 18, depth: p.depth, weight: b.share, dim: false, intent: null,
        tip: { title: dom, lines: [`${pct(b.share)} ${per}`, `${b.n} intents`, "Click to zoom in"] } });
    }
  } else {
    ints.forEach((d, n) => {
      const v = w[n] ?? 0;
      if (v <= 0) return;
      const p = toScreen(d.x, surfaceY(d.x, d.z), d.z);
      const td = L.td.byId.get(d.id);
      anchors.push({ kind: "intent", id: d.id, value: pct(v), name: d.label, x: p.x, y: p.y, r: 8, depth: p.depth, weight: v,
        dim: st.group !== null && d.domain !== st.group, intent: d,
        tip: { title: d.label, lines: [
          `${pct(v)} ${per}${td ? ` · #${td.rank} of ${L.td.intents.length}` : ""}`, `Category: ${d.domain}`,
          ...(td ? [`Trend: ${pct(td.shareFirst)} in Jan–Mar → ${pct(td.shareLast)} in Jul–Sep`] : []),
          `FAQ coverage: ${d.meta.coverage === null ? "—" : COVERAGE_LABEL[d.meta.coverage]}`, "Click to zoom into its parts; shift-click to filter"] } });
    });
  }
  for (const it of partAt) {
    if (!focus) break;
    if (it.p.n / focus.n < 0.01) continue; // too small to label
    const p = toScreen(it.x, it.y, it.z);
    anchors.push({ kind: "part", id: `${focus.id}:${it.p.label}`, value: pct(it.p.n / focus.n), name: it.p.label, x: p.x, y: p.y, r: 12, depth: p.depth,
      weight: 1 + it.p.n / focus.n, dim: false, intent: null, tip: { title: it.p.label, lines: [`${pct(it.p.n / focus.n)} of ${focus.label}`, `${fmtInt(it.p.n)} needs`] } });
  }
  L.anchors = anchors;

  // ---------- labels: priority order, sticky non-overlapping placement, fade ----------
  const ctx = overlay;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const font = (size: number, weight: number) => `${weight} ${size}px ${FONT_FAMILY}`;
  const budget = st.level === 0 ? 20 : st.level === 1 ? (st.group !== null ? 24 : 12) : 16;
  const pinned = new Set([L.hover?.id, st.intent].filter((x): x is string => typeof x === "string"));
  const order = anchors.filter((a) => !a.dim && (st.level < 2 || a.kind === "part" || pinned.has(a.id)))
    .sort((a, b) => Number(pinned.has(b.id)) - Number(pinned.has(a.id)) || b.weight - a.weight);
  const placed: Box[] = [];
  const marks: Box[] = anchors.map((a) => ({ x: a.x - 5, y: a.y - 5, w: 10, h: 10 }));
  const overlaps = (b: Box, list: readonly Box[]) => list.some((o2) => b.x < o2.x + o2.w && b.x + b.w > o2.x && b.y < o2.y + o2.h && b.y + b.h > o2.y);
  const boxes = new Map<string, Box>();
  const target = new Map<string, number>();
  for (const a of order) {
    if (boxes.size >= budget && !pinned.has(a.id)) break;
    ctx.font = font(15, 500);
    const nameW = ctx.measureText(a.name.length > 38 ? `${a.name.slice(0, 37)}…` : a.name).width;
    ctx.font = font(16, 800);
    const bw = Math.max(nameW, ctx.measureText(a.value).width) + 22;
    const bh = 46;
    const prev = A.placement.get(a.id);
    const tries = prev === undefined ? SPOTS.map((_, i) => i) : [prev, ...SPOTS.map((_, i) => i).filter((i) => i !== prev)];
    for (const si of tries) {
      const [dx, dy] = SPOTS[si] ?? [0, -34];
      const b = { x: Math.max(4, Math.min(W - bw - 4, a.x + dx - bw / 2)), y: Math.max(4, Math.min(H - bh - 4, a.y + dy - bh / 2)), w: bw, h: bh };
      if (overlaps(b, placed) || overlaps(b, marks.filter((m) => !(m.x + 5 === a.x && m.y + 5 === a.y)))) continue;
      placed.push(b);
      boxes.set(a.id, b);
      A.placement.set(a.id, si);
      target.set(a.id, 1);
      break;
    }
  }
  for (const a of anchors) if (!target.has(a.id)) target.set(a.id, 0);
  A.labelTarget = target;
  L.boxes = boxes;
  for (const a of anchors) {
    const alpha = A.labelAlpha.get(a.id) ?? 0;
    const b = boxes.get(a.id);
    if (alpha < 0.02 || !b) continue;
    ctx.globalAlpha = alpha;
    // Leader from the box to the point it names.
    const lx = Math.max(b.x + 6, Math.min(b.x + b.w - 6, a.x));
    const ly = a.y < b.y ? b.y : b.y + b.h;
    ctx.strokeStyle = t.text2;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(a.x, a.y); ctx.stroke();
    ctx.fillStyle = t.text2;
    ctx.beginPath(); ctx.arc(a.x, a.y, 2.2, 0, Math.PI * 2); ctx.fill();
    const hot = pinned.has(a.id);
    ctx.fillStyle = hot ? t.text : t.frame;
    ctx.globalAlpha = alpha * (hot ? 0.96 : 0.86);
    ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, 3); ctx.fill();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = hot ? t.text : t.text2;
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = hot ? t.frame : t.text;
    ctx.font = font(16, 800);
    ctx.fillText(a.value, b.x + b.w / 2, b.y + 19);
    ctx.fillStyle = hot ? t.frame : t.text2;
    ctx.font = font(15, 500);
    ctx.fillText(a.name.length > 38 ? `${a.name.slice(0, 37)}…` : a.name, b.x + b.w / 2, b.y + 38);
  }
  ctx.globalAlpha = 1;
}

/** Steps every tween toward its target; returns true while anything is still moving. */
function step(L: Live, dt: number, reduce: boolean): boolean {
  const A = L.anim;
  const st = L.state;
  const months = A.series.frames.length - 1;
  if (L.playing && months > 0) {
    // One continuous clock through the year: month 1 → month N → wraps back into month 1, forever.
    A.t += dt * MONTHS_PER_SECOND * L.speed * (reduce ? 0.5 : 1);
    if (A.t < 1) A.t = Math.max(A.t, 0);
    if (A.t >= months + 1) A.t -= months;
    const shown = Math.min(months, Math.max(1, Math.round(A.t > months + 0.5 ? 1 : A.t)));
    if (shown !== st.month) L.onMonth(shown);
  }
  const power = POWER[st.scale];
  const backdrop = st.level === 2 ? 1 : 0;
  if (reduce && !L.playing) {
    A.t = st.month; A.power = power; A.backdrop = backdrop; A.heightMix = 1; A.colorMix = 1;
    A.labelAlpha = new Map(A.labelTarget);
    return false;
  }
  let moving = L.playing;
  const d = L.playing ? 0 : st.month - A.t;
  if (L.playing) { /* the clock above drives time */ } else if (Math.abs(d) > 1e-3) {
    A.t += Math.sign(d) * Math.min(Math.abs(d), MONTHS_PER_SECOND * Math.max(1, Math.abs(d)) * dt);
    moving = true;
  } else A.t = st.month;
  const toward = (cur: number, tgt: number, rate: number) => {
    if (Math.abs(tgt - cur) < 1e-3) return tgt;
    moving = true;
    return cur + Math.sign(tgt - cur) * Math.min(Math.abs(tgt - cur), rate * dt);
  };
  A.heightMix = toward(A.heightMix, 1, 1000 / TWEEN_MS);
  A.colorMix = toward(A.colorMix, 1, 1000 / TWEEN_MS);
  A.power = toward(A.power, power, 1000 / TWEEN_MS);
  A.backdrop = toward(A.backdrop, backdrop, 1000 / TWEEN_MS);
  for (const [id, tgt] of A.labelTarget) A.labelAlpha.set(id, toward(A.labelAlpha.get(id) ?? 0, tgt, 4));
  return moving;
}

export function targetView(td: TerrainData, st: TerrainState): FlyTarget {
  const d = st.intent === null ? undefined : td.byId.get(st.intent);
  if (st.level === 2 && d) return { tx: d.x, tz: d.z, zoom: LEVEL_ZOOM[2] };
  const g = st.group === null ? undefined : td.groupById.get(st.group);
  if (st.level === 1 && g) return { tx: g.x, tz: g.z, zoom: Math.max(1.6, Math.min(3, 0.9 / g.rad)) };
  return { tx: 0, tz: 0, zoom: LEVEL_ZOOM[st.level] };
}

export interface TerrainProps {
  readonly td: TerrainData;
  readonly series: LandscapeSeries;
  readonly state: TerrainState;
  readonly go: Go;
  readonly goUp: () => void;
  readonly onShiftPick: (id: string) => void;
  /** Incremented by the parent whenever navigation should animate the camera to the new level. */
  readonly flyKey: number;
  /** While true the landscape plays the year continuously and loops; `onMonth` reports the month in view. */
  readonly playing: boolean;
  /** Playback speed multiplier (1 = about one month per second). */
  readonly speed: number;
  readonly onMonth: (month: number) => void;
}

/** The demand landscape: a lit surface whose hills are where demand concentrates in meaning space. */
export function Terrain(props: TerrainProps) {
  const theme = useTheme();
  const [ref, w] = useWidth<HTMLDivElement>(300);
  const tip = useTooltip(ref);
  const glRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<View>({ ...HOME_VIEW, pitch: 0.55 });
  const orbitRef = useRef<Orbit | null>(null);
  const rafRef = useRef(0);
  const { series, state } = props;
  const kern = useMemo(() => kernels(series.intents, SIGMA), [series.intents]);
  const max = useMemo(() => seriesMax(series, kern), [series, kern]);
  const reduce = useMemo(prefersReducedMotion, []);
  const live = useRef<Live | null>(null);
  if (live.current === null) {
    live.current = {
      ...props, theme, kern, max, hover: null, anchors: [], boxes: new Map(),
      anim: { t: state.month, series, fromWeights: null, fromMax: max, heightMix: 1, colorFrom: state.color, colorMix: 1,
        power: POWER[state.scale], backdrop: state.level === 2 ? 1 : 0, focusId: state.intent, labelAlpha: new Map(), labelTarget: new Map(), placement: new Map() },
    };
  }
  const L = live.current;
  if (L.anim.series !== series) {
    L.anim.fromWeights = weightsAt(L.anim.series, L.anim.t);
    L.anim.fromMax = L.max;
    L.anim.series = series;
    L.anim.heightMix = 0;
  }
  if (L.state.color !== state.color) {
    L.anim.colorFrom = L.state.color;
    L.anim.colorMix = 0;
  }
  Object.assign(L, { td: props.td, state, go: props.go, goUp: props.goUp, onShiftPick: props.onShiftPick, playing: props.playing, speed: props.speed, onMonth: props.onMonth, theme, kern, max });
  const { show: showTip, hide: hideTip } = tip;

  const kickRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    const gl = glRef.current;
    const ov = overlayRef.current;
    const ctx = ov?.getContext("2d");
    const lv0 = live.current;
    if (!gl || !ov || !ctx || !lv0) return undefined;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    ov.width = Math.round(w * dpr);
    ov.height = Math.round(HEIGHT * dpr);
    let S: Scene;
    try {
      S = makeScene(gl, w, HEIGHT, lv0.anim.series.intents.length + 64);
    } catch {
      ctx.fillStyle = lv0.theme.text;
      ctx.fillText("WebGL is not available in this browser.", 16, 24);
      return undefined;
    }
    const pick = (e: { readonly clientX: number; readonly clientY: number }): Anchor | null => {
      const lv = live.current;
      if (!lv) return null;
      const r = ov.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      let best: Anchor | null = null;
      for (const a of lv.anchors) {
        if (a.dim) continue;
        const b = lv.boxes.get(a.id);
        const onBox = b !== undefined && (lv.anim.labelAlpha.get(a.id) ?? 0) > 0.5 && px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h;
        if ((onBox || Math.hypot(a.x - px, a.y - py) <= a.r + 4) && (best === null || a.depth < best.depth)) best = a;
      }
      return best;
    };
    const kick = () => {
      if (rafRef.current) return;
      let last = performance.now();
      const tick = (now: number) => {
        const lv = live.current;
        const orbit = orbitRef.current;
        if (!lv || !orbit) { rafRef.current = 0; return; }
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        const moving = step(lv, dt, reduce);
        orbit.paint();
        rafRef.current = moving ? requestAnimationFrame(tick) : 0;
      };
      rafRef.current = requestAnimationFrame(tick);
    };
    kickRef.current = kick;
    S.camera.aspect = w / HEIGHT;
    S.camera.updateProjectionMatrix();
    const orbit = new Orbit(ov, w, HEIGHT, viewRef.current, (o) => { const lv = live.current; if (lv) render(o, S, lv, ctx); }, {
      hover: (e) => {
        const lv = live.current;
        if (!lv) return;
        const a = pick(e);
        if ((a?.id ?? null) !== (lv.hover?.id ?? null)) { lv.hover = a; kick(); }
        ov.style.cursor = a ? "pointer" : "grab";
        if (a) showTip(e, a.tip);
        else hideTip();
      },
      leave: () => { hideTip(); if (live.current?.hover) { live.current.hover = null; kick(); } },
      click: (e) => {
        const lv = live.current;
        if (!lv) return;
        const a = pick(e);
        if (!a) { if (lv.state.level === 1 && lv.state.group !== null) lv.go(1, null, null); return; }
        if (a.kind === "intent" && a.intent) {
          if (e.shiftKey) lv.onShiftPick(a.id);
          else lv.go(2, a.intent.domain, a.id);
        } else if (a.kind === "group") lv.go(1, a.id, null);
      },
      dbl: (e) => { if (!pick(e)) live.current?.goUp(); },
      escape: () => live.current?.goUp(),
      zoomed: () => {
        const lv = live.current;
        if (!lv) return;
        const z = orbit.view.zoom;
        const st = lv.state;
        if (st.level === 0 && z > 1.55) lv.go(1, null, null, false);
        else if (st.level === 1 && st.group === null && z < 1.1) lv.go(0, null, null, false);
        else if (st.level === 1 && z > 3.2) {
          let best: { d: SeriesIntent; dd: number } | null = null;
          for (const a of lv.anchors) {
            if (!a.intent) continue;
            const dd = Math.hypot(a.x - orbit.width / 2, a.y - HEIGHT * 0.5);
            if (best === null || dd < best.dd) best = { d: a.intent, dd };
          }
          if (best) { orbit.view.tx = best.d.x; orbit.view.tz = best.d.z; lv.go(2, best.d.domain, best.d.id, false); }
        } else if (st.level === 2 && z < 2.2) lv.go(1, st.group, null, false);
        kick();
      },
    }, reduce);
    orbitRef.current = orbit;
    kick();
    return () => { cancelAnimationFrame(rafRef.current); rafRef.current = 0; orbit.destroy(); orbitRef.current = null; disposeScene(S); };
  }, [w, showTip, hideTip, reduce]);

  // Any change of data, settings or theme restarts the loop; it stops itself once everything settles.
  useEffect(() => { kickRef.current(); });
  useEffect(() => {
    const lv = live.current;
    if (props.flyKey > 0 && lv) { orbitRef.current?.flyTo(targetView(lv.td, lv.state)); kickRef.current(); }
  }, [props.flyKey]);

  return (
    <div className="chart terrain" ref={ref} style={{ height: HEIGHT }}>
      <canvas ref={glRef} style={{ position: "absolute", inset: 0, width: "100%", height: HEIGHT, display: "block" }} />
      <canvas ref={overlayRef} tabIndex={0} style={{ position: "absolute", inset: 0, width: "100%", height: HEIGHT, display: "block", touchAction: "none", cursor: "grab" }}
        aria-label="Demand landscape. Drag to rotate, shift-drag to pan, scroll or plus and minus to zoom, Escape to zoom out a level." />
      {tip.node}
    </div>
  );
}

