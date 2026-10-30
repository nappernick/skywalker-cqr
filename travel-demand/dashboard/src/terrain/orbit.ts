/** Camera state for the orbit view: rotation, zoom and the ground point it looks at. */
export interface View {
  yaw: number;
  pitch: number;
  zoom: number;
  tx: number;
  tz: number;
}

export interface Projected {
  readonly x: number;
  readonly y: number;
  readonly depth: number;
  readonly s: number;
}

export interface OrbitHandlers {
  readonly hover?: (e: PointerEvent) => void;
  readonly leave?: () => void;
  readonly click?: (e: PointerEvent) => void;
  readonly dbl?: (e: MouseEvent) => void;
  readonly zoomed?: () => void;
  readonly escape?: () => void;
}

export type FlyTarget = Partial<Pick<View, "tx" | "tz" | "zoom">>;

const FOCAL = 3.4;
const PITCH_MIN = 0.12;
const PITCH_MAX = 1.5;
export const ZOOM_MIN = 0.6;
export const ZOOM_MAX = 9;
export const HOME_VIEW: Readonly<View> = { yaw: 0.65, pitch: 0.62, zoom: 1, tx: 0, tz: 0 };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * A perspective orbit camera over a canvas: drag rotates, shift/right-drag pans, wheel and +/- zoom,
 * arrow keys rotate, Escape calls `handlers.escape`. The caller's `render` draws each frame.
 */
export class Orbit {
  readonly ctx: CanvasRenderingContext2D;
  /** Growth factor for columns during fly-to (0..1). */
  grow = 1;
  readonly #base: number;
  #anim = 0;
  #drag: { x: number; y: number; moved: number; pan: boolean } | null = null;
  readonly #off: (() => void)[] = [];

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly width: number,
    readonly height: number,
    readonly view: View,
    private readonly render: (o: Orbit) => void,
    private readonly handlers: OrbitHandlers,
    private readonly reduceMotion: boolean,
  ) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas is not available");
    this.ctx = ctx;
    ctx.scale(dpr, dpr);
    this.#base = Math.min(width, height * 1.25) * 0.4;
    this.#listen();
    this.paint();
  }

  project(x: number, y: number, z: number): Projected {
    const v = this.view;
    const X = x - v.tx;
    const Z = z - v.tz;
    const cy = Math.cos(v.yaw);
    const sy = Math.sin(v.yaw);
    const cp = Math.cos(v.pitch);
    const sp = Math.sin(v.pitch);
    const x1 = X * cy - Z * sy;
    const z1 = X * sy + Z * cy;
    const y2 = y * cp - z1 * sp;
    const z2 = y * sp + z1 * cp;
    const depth = z2 * v.zoom + FOCAL;
    const s = (this.#base * v.zoom * FOCAL) / Math.max(0.4, depth);
    return { x: this.width / 2 + x1 * s, y: this.height * 0.56 - y2 * s, depth, s };
  }

  paint(): void {
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.render(this);
  }

  flyTo(t: FlyTarget): void {
    const from = { ...this.view };
    const t0 = performance.now();
    const dur = this.reduceMotion ? 0 : 650;
    cancelAnimationFrame(this.#anim);
    const step = (now: number) => {
      if (!this.canvas.isConnected) return;
      const k = dur ? Math.min(1, (now - t0) / dur) : 1;
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      if (t.tx !== undefined) this.view.tx = from.tx + (t.tx - from.tx) * e;
      if (t.tz !== undefined) this.view.tz = from.tz + (t.tz - from.tz) * e;
      if (t.zoom !== undefined) this.view.zoom = from.zoom + (t.zoom - from.zoom) * e;
      this.grow = Math.min(1, k * 1.4);
      this.paint();
      if (k < 1) this.#anim = requestAnimationFrame(step);
    };
    this.#anim = requestAnimationFrame(step);
  }

  destroy(): void {
    cancelAnimationFrame(this.#anim);
    for (const off of this.#off) off();
  }

  #on<K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions): void {
    this.canvas.addEventListener(type, fn, opts);
    this.#off.push(() => this.canvas.removeEventListener(type, fn, opts));
  }

  #zoomBy(f: number): void {
    this.view.zoom = clamp(this.view.zoom * f, ZOOM_MIN, ZOOM_MAX);
    this.paint();
    this.handlers.zoomed?.();
  }

  #listen(): void {
    const c = this.canvas;
    this.#on("pointerdown", (e) => {
      this.#drag = { x: e.clientX, y: e.clientY, moved: 0, pan: e.shiftKey || e.button === 2 };
      c.setPointerCapture(e.pointerId);
      c.style.cursor = "grabbing";
    });
    this.#on("pointermove", (e) => {
      const d = this.#drag;
      if (!d) { this.handlers.hover?.(e); return; }
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      d.moved += Math.abs(dx) + Math.abs(dy);
      d.x = e.clientX;
      d.y = e.clientY;
      const v = this.view;
      if (d.pan) {
        const k = 1 / (this.#base * v.zoom);
        v.tx -= (dx * Math.cos(v.yaw) + dy * Math.sin(v.yaw)) * k;
        v.tz -= (-dx * Math.sin(v.yaw) + dy * Math.cos(v.yaw)) * k;
      } else {
        v.yaw += dx * 0.008;
        v.pitch = clamp(v.pitch + dy * 0.006, PITCH_MIN, PITCH_MAX);
      }
      this.handlers.leave?.();
      this.paint();
    });
    this.#on("pointerup", (e) => {
      if (this.#drag && this.#drag.moved < 4) this.handlers.click?.(e);
      this.#drag = null;
      c.style.cursor = "grab";
    });
    this.#on("pointercancel", () => { this.#drag = null; });
    this.#on("pointerleave", () => this.handlers.leave?.());
    this.#on("contextmenu", (e) => e.preventDefault());
    this.#on("wheel", (e) => { e.preventDefault(); this.#zoomBy(Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    this.#on("dblclick", (e) => this.handlers.dbl?.(e));
    this.#on("keydown", (e) => {
      const rot: Readonly<Record<string, readonly [number, number]>> = { ArrowLeft: [-0.1, 0], ArrowRight: [0.1, 0], ArrowUp: [0, -0.08], ArrowDown: [0, 0.08] };
      const step = rot[e.key];
      if (step) {
        e.preventDefault();
        this.view.yaw += step[0];
        this.view.pitch = clamp(this.view.pitch + step[1], PITCH_MIN, PITCH_MAX);
        this.paint();
      } else if (e.key === "+" || e.key === "=") this.#zoomBy(1.2);
      else if (e.key === "-") this.#zoomBy(1 / 1.2);
      else if (e.key === "Escape") this.handlers.escape?.();
    });
  }
}
