import { useStore } from "../store";
import { GROUPS } from "../model/groups";
import { REGIONS } from "../model/regions";
import { SPONSORS, NEUTRALS, DEFAULT_AFF } from "../model/sponsors";
import { HITLER, HEIRS, ZONES, INITIAL_GOVERNORS, ALLY_RULERS, FACTION_LABEL } from "../model/people";
import { US_GOVS, UK_GOVS, SU_GOVS } from "../model/world";
import { REGION_RESOURCES, RESOURCE_LABEL, RESOURCE_NOTES, CORE, NEUTRAL_TRADE, type ResourceId } from "../model/resources";
import { GROUP_TARGETS, HOLD_TARGETS } from "../model/targets";
import { GROUP_INDEX } from "../model/groups";
import { pct } from "./format";

const f = (x: number) => x.toFixed(2).replace(/^0\./, ".");
const range = ([lo, hi]: [number, number]) => `${Math.round(lo * 100)}–${Math.round(hi * 100)}%`;

function Groups() {
  return (
    <section className="panel" id="groups">
      <h2>The peoples</h2>
      <div className="prose">
        <p>Everyone in the model lives under the same regime for decades, so what decides behavior is who people are: their nation, faith, history and enemies. Psychology lives on the identity group. Geography, logistics and garrisons live on the region.</p>
      </div>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Group</th><th>Nazi classification</th><th>Identity</th><th>Threshold</th><th>Communist share</th><th>Exile backing</th><th>US</th><th>UK</th><th>USSR</th><th>Notes</th></tr></thead>
          <tbody>
            {GROUPS.map((g) => (
              <tr key={g.id}>
                <td><strong>{g.name}</strong></td>
                <td>{g.classLabel}</td>
                <td className="num">{f(g.ident)}</td>
                <td className="num">{f(g.theta)}</td>
                <td className="num">{f(g.comm)}</td>
                <td>{g.exileName}</td>
                {(["us", "uk", "su"] as const).map((s) => <td key={s} className="num">{DEFAULT_AFF[s][g.id] !== undefined ? f(DEFAULT_AFF[s][g.id]) : "–"}</td>)}
                <td>{g.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">Threshold is how much evidence of success people need before they defy openly; lower means sooner. Sponsor columns are default attitudes, editable in the rail.</p>
    </section>
  );
}

function Berlin() {
  return (
    <section className="panel" id="berlin">
      <h2>Berlin's people</h2>
      <div className="prose">
        <p>The Nazi leadership held brilliant people and fools, true believers and careerists. Competence and alignment are separate traits: intelligence makes terror more effective, not milder. Hitler's health (a tremor from the 1930s, amphetamine dependence, a poor family history) puts his median death in the mid-1950s. Heirs can die, be purged or be assassinated first.</p>
        <p>Successions usually change direction rather than end the regime. Kendall-Taylor and Frantz found that about 92% of autocracies survive a dictator dying in office. Later candidates are drawn from the factions in proportion to their power, with competence from each faction's bench. Generated figures are described, never given invented names.</p>
      </div>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Figure</th><th>Born</th><th>Base</th><th>Force</th><th>Competence</th><th>Ideology</th><th>Merit</th><th>How they rule</th></tr></thead>
          <tbody>
            {[HITLER, ...HEIRS].map((h) => (
              <tr key={h.key}>
                <td><strong>{h.name}</strong></td><td className="num">{h.born}</td><td>{FACTION_LABEL[h.faction]}</td>
                <td className="num">{f(h.force)}</td><td className="num">{f(h.competence)}</td><td className="num">{f(h.ideology)}</td><td className="num">{f(h.merit)}</td>
                <td>{h.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Starting governors</h3>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Zone</th><th>Governor</th><th>Faction</th><th>Competence</th><th>Zeal</th><th>Record</th></tr></thead>
          <tbody>
            {ZONES.map((z) => { const g = INITIAL_GOVERNORS[z.id]; return (
              <tr key={z.id}><td>{z.name}</td><td><strong>{g.name}</strong></td><td>{FACTION_LABEL[g.faction]}{g.oldFighter ? ", old fighter" : ""}</td><td className="num">{f(g.competence)}</td><td className="num">{f(g.zeal)}</td><td>{g.note}</td></tr>
            ); })}
          </tbody>
        </table>
      </div>
      <p className="hint">Governors who fail are fired in proportion to the ruler's regard for merit, unless personal loyalty protects them. Allied rulers ({ALLY_RULERS.map((a) => a.name).join(", ")}) age and die; successors are usually less committed to Germany.</p>
    </section>
  );
}

function Supply() {
  const govRow = (label: string, list: typeof US_GOVS) => (
    <tr><td><strong>{label}</strong></td><td>{list.map((g) => `${g.name} ${g.from}–${Math.min(g.to, 1970)} (×${g.mult})`).join(" · ")}</td></tr>
  );
  return (
    <section className="panel" id="supply">
      <h2>Supply and neutrals</h2>
      <div className="two">
        {SPONSORS.map((s) => <div key={s.id} className="prose"><h3>{s.name}</h3><p>{s.stance}</p></div>)}
      </div>
      <div className="prose">
        <p>The world outside German Europe follows history. American presidents, Soviet leaders and the British leaders who were actually available each scale their country's willingness to arm resistance. Britain is the exception: the 1940 peace changes its politics, so it follows a plausible path through real figures.</p>
      </div>
      <div className="tablewrap"><table><tbody>{govRow("United States", US_GOVS)}{govRow("Britain", UK_GOVS)}{govRow("Soviet rump", SU_GOVS)}</tbody></table></div>
      <div className="prose">
        <p>Without a supplier, fighters are capped by the weapons they can capture or bring over when police and militia defect. Western sponsors are reluctant to arm communists. German interdiction scales every delivery down with German strength. Neutrals are the back doors, and they open wider as fear of Germany fades:</p>
      </div>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Neutral</th><th>Courage</th><th>Stance</th><th>Routes into</th></tr></thead>
          <tbody>
            {NEUTRALS.map((n) => (
              <tr key={n.id}><td><strong>{n.name}</strong></td><td className="num">{f(n.courage)}</td><td>{n.stance}</td>
                <td>{REGIONS.filter((r) => r.conduits.some(([c]) => c === n.id)).map((r) => r.name).join(", ") || "–"}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Psychology() {
  return (
    <section className="panel" id="psychology">
      <h2>Why people rise, and when</h2>
      <div className="prose">
        <p><strong>Private and public.</strong> Each people has a private dissent, what it really thinks, and a public defiance, what it dares to show. Timur Kuran called the gap preference falsification. It explains why regimes that look solid fall suddenly: once a few people see that others share their views, outward compliance can collapse within months.</p>
        <p><strong>Thresholds.</strong> Mark Granovetter's threshold model sets when that happens. Defiance rises sharply once perceived odds and desperation outweigh fear plus a group's own threshold. Odds come from armed strength, outside supply, information from abroad, and doubt that German rule is permanent.</p>
        <p><strong>Desperation.</strong> Stathis Kalyvas showed that indiscriminate violence removes the safety of staying passive. When villages burn anyway, joining fighters in rough country becomes the safer choice. Atrocities, hunger, labor round-ups, victimization by rival groups' collaborators and, for peoples marked for removal, the realization that they are next, all feed it.</p>
        <p><strong>Selective terror.</strong> A competent governor suppresses resistance with fewer atrocities. That is the Heydrich effect: intelligence makes terror work, it does not soften it. Divide and rule turns neighbors into enforcers, as when Ustaše Croats massacred Serbs.</p>
      </div>
    </section>
  );
}

function Leaders() {
  return (
    <section className="panel" id="leaders">
      <h2>Leadership and exceptional people</h2>
      <div className="prose">
        <p>Personality can force institutions; Hitler is the proof. Exceptional people appear on every side, rarely, with any combination of talent and alignment: a Tito, a Gandhi, a brilliant temperate reformer, a brilliant believer in extreme violence. An exceptional person has high force and competence, one or two spiking skills, and violence and ideology drawn anywhere from 0 to 1.</p>
        <p>In Berlin, about 4% of succession candidates are exceptional, 2% of new governors and 3% of allied successors. Resistance leaders appear only when exceptional, more often in crisis. A forceful pragmatist who rejects violence opens a thaw that lowers fear and can unravel the system, which is what happened when the Politburo chose Gorbachev as an energetic orthodox younger man.</p>
      </div>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Skill</th><th>In Berlin</th><th>As governor</th><th>Leading resistance</th></tr></thead>
          <tbody>
            <tr><td><strong>Oratory</strong></td><td>Fervor and cohesion</td><td>Slightly lowers dissent</td><td>Lowers the threshold for mobilizing</td></tr>
            <tr><td><strong>Diplomacy</strong></td><td>Ally loyalty, neutral fear, deters sponsors</td><td>More collaboration</td><td>More supply from every sponsor, less infighting</td></tr>
            <tr><td><strong>Generalship</strong></td><td>The Soviet front, suppression</td><td>Suppression</td><td>Growth and survival</td></tr>
            <tr><td><strong>Administration</strong></td><td>Material strength, bench quality, the German bomb</td><td>–</td><td>–</td></tr>
            <tr><td><strong>Low violence</strong></td><td>A thaw, with low ideology</td><td>–</td><td>Nonviolent mass refusal</td></tr>
            <tr><td><strong>High violence</strong></td><td>Brutality</td><td>Zeal</td><td>Atrocities against rival peoples</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Resources() {
  const ids = Object.keys(RESOURCE_LABEL) as ResourceId[];
  return (
    <section className="panel" id="resources">
      <h2>Resources</h2>
      <div className="prose">
        <p>For an ideological regime, "economy is power" is the wrong frame. The economy enters in two places only: material strength, meaning oil, coal, ore, food and metals measured against need, and domestic loyalty, because the regime bought Germans off with plunder and welfare (Götz Aly's thesis). A region yields less as its resistance and strikes grow, and nothing once lost.</p>
      </div>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Source</th>{ids.map((k) => <th key={k}>{RESOURCE_LABEL[k]}</th>)}<th>What it is</th></tr></thead>
          <tbody>
            <tr><td><strong>Germany and Austria</strong></td>{ids.map((k) => <td key={k} className="num">{f(CORE[k])}</td>)}<td>Synthetic fuel from coal grows over time.</td></tr>
            {Object.entries(REGION_RESOURCES).map(([rid, res]) => (
              <tr key={rid}><td>{REGIONS.find((r) => r.id === rid)!.name}</td>{ids.map((k) => <td key={k} className="num">{res[k] ? f(res[k]!) : ""}</td>)}<td>{RESOURCE_NOTES[rid] ?? ""}</td></tr>
            ))}
            {Object.entries(NEUTRAL_TRADE).map(([nid, res]) => (
              <tr key={nid}><td>{NEUTRALS.find((n) => n.id === nid)!.name} (trade)</td>{ids.map((k) => <td key={k} className="num">{res[k] ? f(res[k]!) : ""}</td>)}<td>Flows while the neutral fears Germany.</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">Values are shares of German need. Swedish ore needs Norway, because of the Narvik route. Czech uranium and Norwegian heavy water are the inputs to a German bomb.</p>
    </section>
  );
}

function Genocide() {
  return (
    <section className="panel" id="genocide">
      <h2>The murder of Europe's Jews</h2>
      <div className="caveat">
        <p>The Holocaust is a fact of every run, not a variable. The model does not treat its victims, or the Roma, as a resistance movement, and it does not ask whether they could have been saved by a different German policy. In nearly every plausible victory scenario, what varied was the method.</p>
        <p>Policy moved from forced emigration to expulsion schemes (Nisko in 1939, the Madagascar Plan in 1940), then mass shootings from June 1941, including women and children by August, then the decision to murder all of Europe's Jews in the autumn of 1941. Christopher Browning argues those decisions came in the euphoria of victory. In this scenario the Royal Navy, the obstacle to the Madagascar Plan, is gone with the peace. Ian Kershaw called that plan genocide by another method.</p>
        <p>What the model represents is visibility. The killing was concealed, and neighbors learned of it only once the absences became undeniable. A people's awareness rises with the visible emptiness of its own towns, its own losses, and information leaking from abroad. Awareness adds to dissent everywhere, and adds desperation for the peoples Generalplan Ost marked for removal, who understand that they are next.</p>
      </div>
    </section>
  );
}

function Calibration() {
  const agg = useStore((s) => s.agg);
  const preset = useStore((s) => s.preset);
  const live = agg && preset === "historical";
  return (
    <section className="panel" id="calibration">
      <h2>Calibration and limits</h2>
      <div className="prose">
        <p>This is a thinking tool, not a prediction. Every number in it is a judgment, and the point is to make those judgments explicit, inspectable and adjustable. There is no ground truth after 1945, so the psychology and force constants were tuned against judgment ranges grounded in how each people behaved from 1941 to 1945, plus scenario totals: with Nazi policy as it was, Germany holds Europe in {range(HOLD_TARGETS.historical)} of runs; with resistance abandoned, in at least {Math.round(HOLD_TARGETS.isolated[0] * 100)}%; with a pragmatic occupier, in at least {Math.round(HOLD_TARGETS.pragmatic[0] * 100)}%; with Cold War backing, in at most {Math.round(HOLD_TARGETS.coldwar[1] * 100)}%.</p>
        <p>If tuning cannot reach a target, the mechanism is wrong, and the fix belongs in the mechanism. Deliberately left out: the Pacific, decolonization, epidemics and climate cycles, each of which would add parameters with nothing to check them against.</p>
      </div>
      <div className="prose">
        <p>1941–45 is the only period with real data, so each people with a historical record has a target for whether it became a major force by 1945, adjusted for how this scenario differs from history. Where history shows a rising that was broken, there is also a target for 1950. Calibration scores the timing, not just whether a people ever peaked. A target is never lowered because the model produces less; each adjustment below names the scenario difference behind it.</p>
      </div>
      <div className="tablewrap">
        <table>
          <thead><tr><th>People</th><th>By 1945</th><th>In 1950</th><th>Ever</th><th>Why</th></tr></thead>
          <tbody>
            {Object.entries(GROUP_TARGETS).map(([g, tg]) => {
              const k = GROUP_INDEX[g];
              const cell = (r: [number, number] | undefined, v: number | null) => {
                if (!r) return <td className="num">–</td>;
                const ok = v !== null && v >= r[0] - 0.005 && v <= r[1] + 0.005;
                return <td className="num">{range(r)}{v !== null && <> <span className={`pill ${ok ? "held" : "lost"}`}>{pct(v)}</span></>}</td>;
              };
              return (
                <tr key={g}>
                  <td><strong>{GROUPS[k].name}</strong></td>
                  {cell(tg.by1945, live ? agg!.groupBy1945[k] : null)}
                  {cell(tg.in1950, live ? agg!.groupIn1950[k] : null)}
                  {cell(tg.ever, live ? agg!.groupMajor[k] : null)}
                  <td>{tg.why}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="hint">Major force means armed strength of 0.5 or more in any region where the people lives. In 1950 counts only runs where the regime still stands. {live ? "Pills show this batch: green inside the target, red outside." : "Switch to the historical preset to compare this batch with the targets."}</p>
    </section>
  );
}

function Sources() {
  const S: [string, string?][] = [
    ["Kuran, T. (1991). “Now Out of Never: The Element of Surprise in the East European Revolution of 1989.” World Politics 44(1)."],
    ["Granovetter, M. (1978). “Threshold Models of Collective Behavior.” American Journal of Sociology 83(6)."],
    ["Kalyvas, S. (2006). The Logic of Violence in Civil War. Cambridge University Press."],
    ["Kendall-Taylor, A. and Frantz, E. (2016). “When Dictators Die.” Journal of Democracy.", "https://www.journalofdemocracy.org/articles/when-dictators-die/"],
    ["Kershaw, I. “Working Towards the Führer.”", "https://pages.uoregon.edu/dluebke/NaziGermany443/410WorkingTowardstheFuehrer.html"],
    ["Wildt, M. An Uncompromising Generation: The Nazi Leadership of the Reich Security Main Office.", "https://www.harvard.com/book/9780299234645"],
    ["Aly, G. Hitler's Beneficiaries.", "https://www.versobooks.com/products/2011-hitler-s-beneficiaries"],
    ["Kirchenkampf and post-war plans for the churches", "https://en.wikipedia.org/wiki/Kirchenkampf"],
    ["Generalplan Ost", "https://en.wikipedia.org/wiki/Generalplan_Ost"],
    ["Hunger Plan", "https://en.wikipedia.org/wiki/Hunger_Plan"],
    ["Madagascar Plan", "https://en.wikipedia.org/wiki/Madagascar_Plan"],
    ["Great Famine in Greece, 1941–44", "https://en.wikipedia.org/wiki/Great_Famine_(Greece)"],
    ["Soviet famine of 1946–47", "https://en.wikipedia.org/wiki/Soviet_famine_of_1946%E2%80%931947"],
    ["Forced labor in the Reich (Deutsches Historisches Museum)", "https://www.dhm.de/lemo/kapitel/zweiter-weltkrieg/kriegsverlauf/zwangsarbeit"],
    ["Browning on October 1941", "https://ww2history.com/experts/Christopher_Browning/The_importance_of_October_41"],
    ["USHMM, Kamenets-Podolsk", "https://encyclopedia.ushmm.org/content/en/article/kamenets-podolsk"],
    ["Radio Londres", "https://en.wikipedia.org/wiki/Radio_Londres"],
    ["Gorbachev's rise (RFE/RL)", "https://www.rferl.org/a/1980816.html"],
  ];
  return (
    <section className="panel" id="sources">
      <h2>Sources</h2>
      <ul className="sources">{S.map(([t, u]) => <li key={t}>{u ? <a href={u} target="_blank" rel="noreferrer">{t}</a> : t}</li>)}</ul>
    </section>
  );
}

export function Explainer() {
  return (
    <div className="explain">
      <Groups />
      <Berlin />
      <Supply />
      <Psychology />
      <Leaders />
      <Resources />
      <Genocide />
      <Calibration />
      <Sources />
    </div>
  );
}
