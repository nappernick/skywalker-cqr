import { useStore, type Lever } from "../store";
import { PRESETS } from "../model/presets";
import { GROUPS } from "../model/groups";
import { SPONSORS } from "../model/sponsors";
import type { SponsorId } from "../model/types";

interface LeverDef { k: Lever; label: string; min: number; max: number; step: number; hint: string; fmt?: (v: number) => string }

const SECTIONS: { title: string; levers: LeverDef[] }[] = [
  {
    title: "Occupation policy",
    levers: [
      { k: "brutality", label: "Brutality", min: 0, max: 1, step: 0.05, hint: "Baseline violence of the occupation, before factions and leaders modify it." },
      { k: "extraction", label: "Extraction", min: 0, max: 1, step: 0.05, hint: "Food and goods requisitioning. With a bad harvest, quotas become famine." },
      { k: "collab", label: "Collaboration", min: 0, max: 1, step: 0.05, hint: "Willingness to rule through local partners and give them real stakes." },
      { k: "labor", label: "Forced labor", min: 0, max: 1, step: 0.05, hint: "Round-ups for work in the Reich. Young men hide, and hiding leads to the forests." },
    ],
  },
  {
    title: "Berlin",
    levers: [
      { k: "pragmatism", label: "Pragmatist weight", min: 0, max: 1, step: 0.05, hint: "Starting power of the Wehrmacht and the technocrats against the SS and the Party." },
    ],
  },
  {
    title: "Outside powers",
    levers: [
      { k: "us", label: "United States", min: 0, max: 1, step: 0.05, hint: "Willingness to arm resistance covertly. Presidents then scale it, as they did in history." },
      { k: "uk", label: "Britain", min: 0, max: 1, step: 0.05, hint: "Bound by the 1940 peace; the governments that follow it scale this." },
      { k: "su", label: "Soviet rump", min: 0, max: 1, step: 0.05, hint: "Support for partisans it expects to control, if the rump survives." },
      { k: "rump", label: "Rump survival", min: 0, max: 1, step: 0.05, hint: "Chance the Soviet state survives beyond the Urals." },
      { k: "westPrag", label: "Arming communists", min: 0, max: 1, step: 0.05, hint: "How far Western sponsors will arm communist-led resistance anyway." },
      { k: "neutral", label: "Neutral nerve", min: 0, max: 1, step: 0.05, hint: "Courage of Sweden, Switzerland, Spain, Portugal and Turkey as conduits." },
      { k: "bombYear", label: "US bomb year", min: 1946, max: 1970, step: 1, hint: "Expected year of an American bomb without a war, ±3 years.", fmt: (v) => String(v) },
    ],
  },
];

function Slider({ d }: { d: LeverDef }) {
  const v = useStore((s) => s.params[d.k]) as number;
  const setLever = useStore((s) => s.setLever);
  const id = `lv-${d.k}`;
  return (
    <div className="ctl">
      <div className="ctl-head">
        <label htmlFor={id}>{d.label}</label>
        <output htmlFor={id}>{d.fmt ? d.fmt(v) : v.toFixed(2)}</output>
      </div>
      <input id={id} type="range" min={d.min} max={d.max} step={d.step} value={v} onChange={(e) => setLever(d.k, Number(e.target.value))} />
      <p className="hint">{d.hint}</p>
    </div>
  );
}

function AffEditor() {
  const aff = useStore((s) => s.params.aff);
  const setAff = useStore((s) => s.setAff);
  return (
    <details className="aff">
      <summary>Sponsor attitudes by group</summary>
      <p className="hint" style={{ marginTop: 8 }}>How willing each sponsor is to back each people, from 0 to 1. The Soviet rump refused nationalists it meant to crush later.</p>
      <div className="afftable">
        <span className="h">Group</span>
        {SPONSORS.map((s) => <span key={s.id} className="h">{s.short}</span>)}
        {GROUPS.filter((g) => g.id !== "vdt").map((g) => (
          <div key={g.id} style={{ display: "contents" }}>
            <span>{g.name}</span>
            {(["us", "uk", "su"] as SponsorId[]).map((s) => (
              <input key={s} id={`aff-${s}-${g.id}`} aria-label={`${s.toUpperCase()} attitude to ${g.name}`} type="number" min={0} max={1} step={0.05}
                value={aff[s][g.id] ?? 0} onChange={(e) => setAff(s, g.id, Math.max(0, Math.min(1, Number(e.target.value))))} />
            ))}
          </div>
        ))}
      </div>
    </details>
  );
}

export function Rail() {
  const preset = useStore((s) => s.preset);
  const setPreset = useStore((s) => s.setPreset);
  const runs = useStore((s) => s.params.runs);
  const seed = useStore((s) => s.params.seed);
  const setRuns = useStore((s) => s.setRuns);
  const setSeed = useStore((s) => s.setSeed);
  const running = useStore((s) => s.running);
  const ms = useStore((s) => s.ms);
  return (
    <aside className="rail">
      <section className="panel" aria-labelledby="presets-h">
        <h3 id="presets-h">Scenario</h3>
        <div className="chips">
          {PRESETS.map((p) => (
            <button key={p.id} className="chip" aria-pressed={preset === p.id} onClick={() => setPreset(p.id)}>{p.label}</button>
          ))}
        </div>
        <div className="row">
          <label className="status" htmlFor="runs">Runs</label>
          <select id="runs" value={runs} onChange={(e) => setRuns(Number(e.target.value))}>
            {[100, 200, 400, 800].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <label className="status" htmlFor="seed">Seed</label>
          <input id="seed" type="number" value={seed} style={{ width: 80 }} onChange={(e) => setSeed(Math.round(Number(e.target.value)) || 0)} />
        </div>
        <p className="status" aria-live="polite">{running ? `Simulating ${runs} histories…` : `${runs} histories in ${(ms / 1000).toFixed(1)} s`}</p>
      </section>
      {SECTIONS.map((sec) => (
        <section key={sec.title} className="panel" aria-label={sec.title}>
          <h3>{sec.title}</h3>
          {sec.levers.map((d) => <Slider key={d.k} d={d} />)}
          {sec.title === "Outside powers" && <AffEditor />}
        </section>
      ))}
    </aside>
  );
}
