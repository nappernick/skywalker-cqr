import { useState } from "react";
import { useStore } from "../../store";
import { GROUPS, GROUP_INDEX } from "../../model/groups";
import { REGIONS, REGION_INDEX } from "../../model/regions";
import { ZONES } from "../../model/people";
import type { Mission, Stance } from "../../model/types";
import {
  COST, MISSION_LABEL, addMission, appeal, available, choose, commandable, homeRegions, removeMission, role, setInfo, setOrder, setSupply, type Game,
} from "../../game/game";
import { CHAPTERS } from "../../game/chapters";

const STANCES: [Stance | "", string, string][] = [
  ["", "No order", "The movement follows its own instincts."],
  ["rise", "Rise", "Fight in the open now. Grows fast; invites crushing and reprisals."],
  ["wait", "Wait", "Hide arms and organize for the day a liberator comes."],
  ["truce", "Truce with rivals", "Stop the killing between neighbors, and the recruiting it does for both sides."],
  ["nonviolent", "Strike and refuse", "Strikes and mass refusal instead of guns. Works on an occupier unwilling to shoot crowds."],
];
const name = (id: string) => GROUPS[GROUP_INDEX[id]].name;
const rname = (id: string) => REGIONS[REGION_INDEX[id]].name;

function Cards({ g }: { g: Game }) {
  const act = useStore((s) => s.act);
  if (!g.pending.length) return null;
  return (
    <section className="g-sec" aria-label="Decisions">
      <h2 className="g-h">{g.pending.length === 1 ? "A decision" : `${g.pending.length} decisions`}</h2>
      {g.pending.map((c) => (
        <article key={c.id} className="g-card">
          <h3>{c.title}</h3>
          <p className="g-prec">{c.precedent}</p>
          <p>{c.text}</p>
          <div className="g-choices">
            {c.choices.map((ch, k) => (
              <button key={k} className="g-choice" onClick={() => act((x) => choose(x, c.id, k))}>
                <strong>{ch.label}</strong>
                <span>{ch.result}</span>
              </button>
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}

function Chapter({ g }: { g: Game }) {
  if (g.mode !== "campaign") return null;
  const ch = CHAPTERS[g.chapter];
  if (!ch) return null;
  return (
    <section className="g-sec g-chapter" aria-label="Chapter">
      <p className="g-kicker">Chapter {g.chapter + 1} of {CHAPTERS.length} · {ch.from === ch.to ? ch.from : `${ch.from}–${ch.to}`}</p>
      <h2 className="g-h">{ch.title}</h2>
      <p className="g-role">{ch.role}</p>
      <p>{ch.brief}</p>
      <p className="g-goal"><strong>Goal.</strong> {ch.goal}</p>
    </section>
  );
}

function Orders({ g }: { g: Game }) {
  const act = useStore((s) => s.act);
  const ids = commandable(g);
  return (
    <section className="g-sec" aria-label="Orders">
      <h2 className="g-h">Orders</h2>
      {!ids.length && <p className="g-note">Peoples take orders from whoever arms them. Send at least 0.2 in arms to a people to give it orders.</p>}
      {ids.map((id) => (
        <div key={id} className="g-row">
          <label htmlFor={`ord-${id}`}>{name(id)}</label>
          <select id={`ord-${id}`} value={g.orders[id] ?? ""} onChange={(e) => act((x) => setOrder(x, id, (e.target.value || null) as Stance | null))}>
            {STANCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      ))}
      {ids.length > 0 && <p className="g-note">{STANCES.find(([v]) => v === (g.orders[ids[0]] ?? ""))![2]}</p>}
    </section>
  );
}

function Stepper({ label, value, max, onChange, id }: { label: string; value: number; max: number; onChange: (v: number) => void; id: string }) {
  return (
    <div className="g-row">
      <span id={id}>{label}</span>
      <span className="g-step" role="group" aria-labelledby={id}>
        <button aria-label={`Less for ${label}`} onClick={() => onChange(value - 0.1)} disabled={value <= 0}>−</button>
        <output>{value.toFixed(1)}</output>
        <button aria-label={`More for ${label}`} onClick={() => onChange(value + 0.1)} disabled={value >= max}>+</button>
      </span>
    </div>
  );
}

function Spend({ g }: { g: Game }) {
  const act = useStore((s) => s.act);
  const r = role(g);
  const spy = r.kind === "spymaster";
  const [armPick, setArmPick] = useState("");
  const [radioPick, setRadioPick] = useState("");
  const [opKind, setOpKind] = useState<Mission["kind"]>("sabotage");
  const [opTarget, setOpTarget] = useState("");
  const myRegions = r.kind === "people" ? [...new Set(homeRegions(r.group))] : REGIONS.map((x) => x.id);
  const myZones = ZONES.filter((z) => z.regions.some((rid) => myRegions.includes(rid)));
  const peoples = r.kind === "people" ? [r.group] : GROUPS.filter((x) => x.id !== "vdt").map((x) => x.id);
  const targets: [string, string][] = opKind === "assassinate" ? myZones.map((z) => [z.id, z.name])
    : opKind === "sabotage" ? myRegions.map((id) => [id, rname(id)])
    : opKind === "broadcast" ? [] : peoples.map((id) => [id, name(id)]);
  const target = targets.some(([v]) => v === opTarget) ? opTarget : targets[0]?.[0] ?? "";
  const plan = (): Mission => opKind === "assassinate" ? { kind: "assassinate", zone: target } : opKind === "sabotage" ? { kind: "sabotage", region: target }
    : opKind === "broadcast" ? { kind: "broadcast" } : { kind: opKind, group: target };
  const missionText = (m: Mission) => `${MISSION_LABEL[m.kind]}${"zone" in m ? `: ${ZONES.find((z) => z.id === m.zone)!.name}` : "region" in m ? `: ${rname(m.region)}` : "group" in m ? `: ${name(m.group)}` : ""}`;
  return (
    <section className="g-sec" aria-label="Spending">
      <h2 className="g-h">Spending</h2>
      {spy && (
        <div className="g-block">
          <h3>Arms drops <small>{COST.arms} per 0.1</small></h3>
          {Object.entries(g.plan.supply).map(([id, v]) => <Stepper key={id} id={`arm-${id}`} label={name(id)} value={v} max={0.6} onChange={(x) => act((gg) => setSupply(gg, id, x))} />)}
          <div className="g-row">
            <select aria-label="Choose a people to arm" value={armPick} onChange={(e) => setArmPick(e.target.value)}>
              <option value="">Arm a people…</option>
              {peoples.filter((id) => !(id in g.plan.supply)).map((id) => <option key={id} value={id}>{name(id)}</option>)}
            </select>
            <button className="g-small" disabled={!armPick || available(g) < COST.arms} onClick={() => { act((gg) => setSupply(gg, armPick, 0.1)); setArmPick(""); }}>Add</button>
          </div>
        </div>
      )}
      <div className="g-block">
        <h3>Radios and couriers <small>{COST.radio} per 0.1</small></h3>
        {Object.entries(g.plan.info).map(([id, v]) => <Stepper key={id} id={`rad-${id}`} label={rname(id)} value={v} max={0.5} onChange={(x) => act((gg) => setInfo(gg, id, x))} />)}
        <div className="g-row">
          <select aria-label="Choose a region for radios" value={radioPick} onChange={(e) => setRadioPick(e.target.value)}>
            <option value="">Send radios to…</option>
            {[...new Set(myRegions)].filter((id) => !(id in g.plan.info)).map((id) => <option key={id} value={id}>{rname(id)}</option>)}
          </select>
          <button className="g-small" disabled={!radioPick || available(g) < COST.radio} onClick={() => { act((gg) => setInfo(gg, radioPick, 0.1)); setRadioPick(""); }}>Add</button>
        </div>
      </div>
      <div className="g-block">
        <h3>Operations</h3>
        {g.plan.missions.map((m, k) => (
          <div key={k} className="g-row"><span>{missionText(m)}</span><button className="g-small" onClick={() => act((gg) => removeMission(gg, k))}>Cancel</button></div>
        ))}
        <div className="g-row g-flow">
          <select aria-label="Operation" value={opKind} onChange={(e) => setOpKind(e.target.value as Mission["kind"])}>
            {(Object.keys(MISSION_LABEL) as Mission["kind"][]).map((k) => <option key={k} value={k}>{MISSION_LABEL[k]} ({COST[k]})</option>)}
          </select>
          {targets.length > 0 && (
            <select aria-label="Target" value={target} onChange={(e) => setOpTarget(e.target.value)}>
              {targets.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          )}
          <button className="g-small" disabled={available(g) < COST[opKind] || (targets.length > 0 && !target)} onClick={() => act((gg) => addMission(gg, plan()))}>Plan it</button>
        </div>
        <p className="g-note">Assassinations and sabotage bring reprisals. A broadcast makes known what the occupier hides. Hiding a leader cuts the risk to them; instructors make fighters better.</p>
      </div>
      {r.kind === "people" && (
        <div className="g-block">
          <h3>Appeal to a sponsor <small>{COST.appeal} each</small></h3>
          <div className="g-row g-flow">
            {([["us", "Washington"], ["uk", "London"], ["su", "Moscow"]] as const).map(([s, l]) => (
              <button key={s} className="g-small" disabled={available(g) < COST.appeal} onClick={() => act((gg) => appeal(gg, s))}>
                {l} ({Math.round((g.params.aff[s][r.group] ?? 0) * 100)})
              </button>
            ))}
          </div>
          <p className="g-note">Standing with each sponsor, out of 100. Supply follows standing and reach.</p>
        </div>
      )}
    </section>
  );
}

export function Decide({ g }: { g: Game }) {
  return (
    <div className="g-decide">
      <Chapter g={g} />
      <Cards g={g} />
      <Orders g={g} />
      <Spend g={g} />
    </div>
  );
}

