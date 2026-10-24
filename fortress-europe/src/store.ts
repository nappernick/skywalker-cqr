import { create } from "zustand";
import SimWorker from "./worker?worker&inline";
import { DEFAULT_PARAMS, PRESETS, cloneAff } from "./model/presets";
import type { Aggregate, Outcome, Params, RunResult, SponsorId } from "./model/types";
import type { FromWorker, RunSummary, ToWorker } from "./protocol";
import { handle } from "./engine";

export type Lever = Exclude<keyof Params, "aff" | "runs" | "seed">;

interface State {
  params: Params;
  preset: string | null;
  running: boolean;
  ms: number;
  agg: Aggregate | null;
  summaries: RunSummary[];
  mode: "avg" | "run";
  runId: number;
  run: RunResult | null;
  outcomeFilter: Outcome | "all";
  t: number;
  playing: boolean;
  speed: number;
  region: number | null;
  setPreset: (id: string) => void;
  setLever: (k: Lever, v: number) => void;
  setAff: (s: SponsorId, g: string, v: number) => void;
  setRuns: (n: number) => void;
  setSeed: (n: number) => void;
  setMode: (m: "avg" | "run") => void;
  pickRun: (id: number) => void;
  randomRun: () => void;
  setFilter: (o: Outcome | "all") => void;
  setT: (t: number) => void;
  setPlaying: (p: boolean) => void;
  setSpeed: (s: number) => void;
  setRegion: (r: number | null) => void;
}

let token = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let worker: Worker | null = null;
let receive: (m: FromWorker) => void = () => {};
// Some hosts block workers (a page opened from disk, for one). Then the batch runs on the main thread instead.
const local = (m: ToWorker) => setTimeout(() => { const out = handle(m); if (out) receive(out.msg); });
let pending: ToWorker | null = null;
try {
  worker = new SimWorker();
  worker.onmessage = (e: MessageEvent<FromWorker>) => receive(e.data);
  worker.onerror = () => { worker = null; if (pending) local(pending); };
} catch {
  worker = null;
}
const send = (m: ToWorker) => { if (m.type === "run") pending = m; if (worker) worker.postMessage(m); else local(m); };

export const useStore = create<State>((set, get) => {
  const schedule = (delay = 350) => {
    clearTimeout(timer);
    set({ running: true });
    timer = setTimeout(() => send({ type: "run", token: ++token, params: get().params }), delay);
  };
  const changed = (params: Params, preset: string | null) => { set({ params, preset }); schedule(); };
  receive = (m) => {
    if (m.token !== token) return;
    if (m.type === "done") {
      pending = null;
      set({ agg: m.agg, summaries: m.summaries, ms: m.ms, running: false });
      const s = get();
      const keep = m.summaries[s.runId] ? s.runId : 0;
      send({ type: "get", token, id: keep });
    } else {
      set({ run: m.run, runId: m.run.id });
    }
  };
  setTimeout(() => schedule(0));
  return {
    params: { ...DEFAULT_PARAMS, aff: cloneAff() },
    preset: "historical",
    running: true,
    ms: 0,
    agg: null,
    summaries: [],
    mode: "avg",
    runId: 0,
    run: null,
    outcomeFilter: "all",
    t: 0,
    playing: false,
    speed: 450,
    region: null,
    setPreset: (id) => {
      const p = PRESETS.find((x) => x.id === id)!;
      const { runs, seed } = get().params;
      changed({ ...DEFAULT_PARAMS, ...p.vals, aff: cloneAff(), runs, seed }, id);
    },
    setLever: (k, v) => changed({ ...get().params, [k]: v }, null),
    setAff: (s, g, v) => {
      const p = get().params;
      changed({ ...p, aff: { ...p.aff, [s]: { ...p.aff[s], [g]: v } } }, get().preset);
    },
    setRuns: (n) => changed({ ...get().params, runs: n }, get().preset),
    setSeed: (n) => changed({ ...get().params, seed: n }, get().preset),
    setMode: (mode) => set({ mode }),
    pickRun: (id) => { set({ mode: "run", runId: id }); send({ type: "get", token, id }); },
    randomRun: () => {
      const s = get();
      const pool = s.summaries.filter((x) => s.outcomeFilter === "all" || x.outcome === s.outcomeFilter);
      if (pool.length) get().pickRun(pool[Math.floor(Math.random() * pool.length)].id);
    },
    setFilter: (o) => set({ outcomeFilter: o }),
    setT: (t) => set({ t }),
    setPlaying: (playing) => set({ playing }),
    setSpeed: (speed) => set({ speed }),
    setRegion: (region) => set({ region }),
  };
});
