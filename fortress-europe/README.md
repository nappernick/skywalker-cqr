# Fortress Europe Model

A Monte Carlo simulation of a counterfactual: **could Nazi Germany have held Europe from 1941 to 1970?**

The premise:
- Britain signs a compromise peace in 1940, not a surrender.
- The USSR does not evacuate its industry east, so the 1941–42 campaign destroys it as a great power. It may survive as a rump state beyond the Volga and Urals.
- The United States stays out of the war but never stops sending aid.

The model asks whether, under those conditions, the occupied and allied peoples of Europe would have worn the empire down, and how.

This is a thinking tool, not a prediction. Every number in it is a judgment, and the point is to make those judgments explicit, inspectable and adjustable.

---

## 0. Status at handoff (read this first)

| Piece | State |
|---|---|
| Data: 32 identity groups, 29 regions, 17 rivalries, 3 sponsors, 5 neutrals, resources, governors, rulers, outside-world governments | **Done**, in `src/model/*.ts` |
| Simulation engine (`src/model/simulate.ts`) | **Done and running**: about 7 ms per run, about 1.5 s for 200 runs |
| Aggregation (`src/model/aggregate.ts`) | **Done** |
| Tests (`bun test`) | **11 passing**: data integrity, determinism, value ranges, scenario ordering |
| Report script (`scripts/report.ts`) | **Done** |
| Calibration script (`scripts/calibrate.ts`) | **Done and working**, but **not yet run to convergence**. The `TUNE` constants in `simulate.ts` are still hand-set. |
| Calibration itself | **Not done.** The historical preset currently collapses far too often (see §9). |
| React UI: worker, store, map, playback, run picker, explainer | **Not started.** The build config, `index.html` and dependencies are in place, but `src/main.tsx` does not exist yet, so `bun run build` fails until it is written. |
| Post-build step that strips the HTML wrapper for publishing as a claude.ai artifact | **Not started** (spec in §11) |
| v1 single-file simulator | Kept for reference at `legacy/fortress-europe-v1.html`, published at https://claude.ai/artifact/KaZyoH5tjLwvudStQRn4pv |

**Next steps, in order:**
1. Run calibration properly: `bun scripts/calibrate.ts 400 120`. Paste the best `TUNE` into `simulate.ts`. Then fix the structural problems in §9 that tuning can't fix.
2. Build the UI (§10).
3. Add the post-build strip step and publish (§11).

---

## 1. Quick start

**Tooling rule: use bun, never npm or npx.** This is the project owner's standing requirement.

```bash
cd app
bun install                    # restores node_modules from bun.lock
bun test                       # 11 tests
bun scripts/report.ts          # all four presets, 200 runs each
bun scripts/report.ts historical 400
bun scripts/calibrate.ts 400 120   # random search over TUNE (minutes)
bun scripts/tables.ts          # prints the data tables used in this README
bun x tsc --noEmit -p .        # typecheck (src only; scripts are run directly by bun)
bun run dev                    # Vite dev server, once src/main.tsx exists
bun run build                  # typecheck + Vite single-file build, once the UI exists
```

The bun binary used during development was 1.4.4 at `~/.bun/bin/bun`.

---

## 2. Design principles (the owner's, binding)

1. **Simplicity, robustness, conciseness, feature completeness.**
2. **Identity groups, not states.** Everyone lives under the Nazi Party for years, so what decides behavior is who people are: their nation, faith, history and enemies. Psychology lives on the group; geography, logistics and garrisons live on the region.
3. **The Nazi leadership included brilliant people and fools.** Many were careerists, not true believers. They would not overthrow a victorious system, but some might temper its worst excesses. Intelligence does not imply moderation: brilliance can make terror more effective. Competence and alignment are separate traits.
4. **Resources and geography decide material strength, not power.** "Economy is power" is the wrong frame for an ideological regime. The economy enters in two places only: material strength (oil, fuel, ore, food) and domestic loyalty (Germans bought off with plunder).
5. **Governors get replaced if they fail badly, or sometimes don't.** It depends on the leadership's style and loyalties.
6. **Personality can force institutions.** Hitler is the proof. Exceptional people appear on every side, rarely, with any combination of talent and alignment: Hitler, Gandhi, Tito, a brilliant temperate reformer, a brilliant believer in extreme violence.
7. **The world outside German Europe follows history.** US presidents, Soviet leaders and the British leaders who were actually available. Britain is the exception, because the 1940 peace changes its politics. It follows a plausible path through real figures.
8. **Genocide is a fact of the scenario, not a variable, and it was hidden.** Neighbors learn of it only once the absences become undeniable.
9. **Production code only.** No placeholders or pseudocode.

---

## 3. Project layout

```
app/
  package.json          bun scripts; dependencies (React 18.3.1, Vite 5.4.11, d3-geo, topojson, zustand…)
  bun.lock
  tsconfig.json         strict, noUnused*, bundler resolution, types: vite/client + bun-types
  vite.config.ts        React + vite-plugin-singlefile (inlines everything into one HTML), ES workers
  index.html            page shell for the UI (title, fonts, claude:viewport-fit-sides meta)
  legacy/fortress-europe-v1.html   the earlier single-file version (6 regions, no identity groups)
  scripts/
    report.ts           scenario summary: outcomes, control, group and region results
    calibrate.ts        random search over TUNE against all targets at once
    tables.ts           prints data tables as Markdown
  src/model/
    types.ts            every type, plus the Float32Array field layouts (CF, RF, GF)
    regions.ts          29 regions: geography, reach, conduits, garrison priority, START/END
    groups.ts           32 identity groups, plus rivalries
    cells.ts            group × region cells, rivals per cell, Jewish population shares, GPO targets, harvest zones
    sponsors.ts         US/UK/USSR stances and per-group affinities; neutral countries
    resources.ts        where oil, coal, iron, food and metals come from
    people.ts           governors, zones, archetypes, Hitler and heirs, cohort labels, allied rulers, mortality
    world.ts            historical US, UK and Soviet governments and their support multipliers
    presets.ts          default parameters and the four scenarios
    simulate.ts         the engine
    aggregate.ts        batch statistics
    simulate.test.ts    tests
```

---

## 4. The scenario levers (`Params`)

| Lever | Default | Meaning |
|---|---|---|
| `brutality` | 0.9 | Baseline Nazi occupation violence, before factions and leaders modify it |
| `extraction` | 0.75 | Food and goods requisitioning |
| `collab` | 0.2 | Willingness to rule through local collaborators and give them real stakes |
| `labor` | 0.7 | Forced-labor round-ups (France's STO and its equivalents) |
| `rump` | 0.5 | Probability the Soviet state survives as a rump beyond the Urals |
| `pragmatism` | 0.3 | Starting weight of the Wehrmacht and technocrat factions in Berlin |
| `bombYear` | 1958 | Expected US atomic bomb year without a war (±3 years of noise). A US bomb was not certain without the war. |
| `us`, `uk`, `su` | .35, .25, .8 | Each sponsor's overall willingness to arm resistance |
| `westPrag` | 0.4 | How willing Western sponsors are to arm communists anyway |
| `neutral` | 0.4 | Nerve of the neutral countries (Sweden, Switzerland, Spain, Portugal, Turkey) |
| `aff` | see tables | Each sponsor's attitude to each identity group, 0–1. Editable per group. |
| `runs`, `seed` | 400, 1940 | Monte Carlo size; the seeded RNG (mulberry32) makes runs reproducible |

Presets (`presets.ts`):
- **historical**: Nazi policy as it was.
- **pragmatic**: brutality .35, extraction .4, collab .6, pragmatism .5, labor .35.
- **isolated**: no sponsors, no rump, bomb year 1965.
- **coldwar**: US .8, UK .5, USSR .9, rump .7, westPrag .6, neutral .6, bomb year 1950.

---

## 5. How a run works (one year at a time, 1941–1970)

Each run is a single draw of history, and each step below happens every year. The code follows the same numbering, steps 1–16 in `simulate.ts`.

### 5.1 Weather (harvests)
Harvests share weather across three zones (northwest, east, south), plus a common European shock. There is a 5% chance per zone per year of a drought (−30%). This isn't modeling climate cycles; it's here because the regime's food plan, the Hunger Plan, was to feed Germany by starving the East, so a bad harvest turns quotas into famine.
- The 1946 drought cut Soviet grain and potato yields by more than 60% and killed roughly 0.5–2 million people.
- The Greek famine of 1941–42 killed about 300,000 with no crop failure at all, from requisitions plus blockade.

### 5.2 Rulers in Berlin: death, assassination, succession
- **Mortality:** a Gompertz curve, `exp(-9.6 + 0.085·age) × health`. Hitler (born 1889) has health ×3: a Parkinsonian tremor from the 1930s, amphetamine dependence from about 1942, and a poor family history. His median death falls in the mid-1950s.
- **Heirs** can die before any succession: Göring, Himmler, Heydrich, Goebbels, Bormann, Speer.
- **Heydrich:** assassinated in 1942 with probability `0.1 + 0.4·uk`. Anthropoid was a British-trained exile operation, so the peace makes it less likely. If he dies, K. H. Frank takes the Protectorate and Lidice-style reprisals follow.
- **Ruler assassination:**
  - An internal army plot, more likely with a strong Wehrmacht, low cohesion and recent losses. A plot succeeds 35% of the time. A failed plot purges the army's influence (20 July 1944).
  - A rare foreign-backed attempt.
- **Succession:**
  - **Candidates:** surviving heirs plus two or three generated figures from later cohorts.
  - **Weight:** `(faction share + 0.04) × force^1.5 × √competence`. Göring gets ×2.5 as designated heir when the founder dies.
  - **Cohort figures** are born about 47–56 years before the succession and drawn from a faction in proportion to its power. Their competence comes from that faction's **bench** (see §5.3). Members of the Hitler Youth generation (born 1918 or later) are slightly more ideological. Fading regime fervor makes successors less ideological.
  - **Exceptional draw:** 4% per cohort candidate (§5.15).
  - **Shock to cohesion** depends on how contested the succession is. Kendall-Taylor and Frantz found about 92% of regimes survive a dictator dying in office (79 cases, 1946–2014), so successions usually change direction rather than end the regime.
  - **Purges:** a ruler with high violence and low loyalty may purge rival heirs. Governors from factions the new ruler disfavors may be swept out.
  - **Names:** generated rulers get descriptions ("a Gauleiter (born 1912)", "a brilliant commander, General Staff officer"), never invented personal names.

### 5.3 Factions, fervor and policy
- **Factions:** SS, Party, Wehrmacht, Technocrats and the Göring network, with shares that sum to 1.
- **Each year, factions drift:**
  - Toward the ruler's preferred factions, at a rate set by the ruler's force. Institutions bend to a forceful person.
  - When costs mount: toward the pragmatists under a non-ideological ruler, or toward the ideologues under an ideological one, so the regime escalates rather than learns.
  - Göring's network decays after 1945 unless he rules.
  - Plus noise.
- **Bench quality** per faction improves under merit-based rulers and degrades under loyalty-based ones. That is how one leadership shapes who is available to succeed it.
- **Fervor** decays about 1.2% a year, Weber's routinization of charisma. Forceful ideological orators and crises renew it.
- **Thaw:** `force × (1 − violence) × (1 − ideology)` for any non-founder ruler. A forceful pragmatist who rejects violence lowers fear and raises odds, and also erodes cohesion. This is the Gorbachev risk: Gorbachev was picked by the Politburo as an orthodox, energetic younger man and then broke the system that chose him.
- **Effective policy** comes from the levers, modified by factions, fervor and the ruler's alignment:
  - `brutEff` rises with ideologue share, fervor and ruler violence, and falls with thaw.
  - `colEff` rises with pragmatist share, low ruler ideology and ruler diplomacy.
  - `extrEff` rises with Göring and Party share, falls with technocrat share, and rises when Germany's own food runs short.

### 5.4 Atomic programs
- **US bomb:** `bombYear ± 3`. It boosts US covert support by ×1.3.
- **German bomb:** possible from 1947, and only while Czech uranium and Norwegian heavy water are held. Its odds scale with strength, cohesion, technocrat share and the ruler's administrative skill. A German-only bomb halves outside support.
- **War with the US:** possible only during a US monopoly, driven by brutality and US involvement, and dampened by a diplomatic German ruler. If it happens, Germany capitulates.

### 5.5 Strategic resources (strength `S`)
Each resource is measured against need:
- **Oil** (weight .30): core synthetic fuel plus Ploiești and a little elsewhere. Synthetic fuel grows over time.
- **Coal** (.25), **iron ore** (.20) and **food** (.15, scaled by harvests and needed at 1.2).
- **Strategic metals** (.10): Petsamo nickel, Bor copper, Trepča lead and zinc, Turkish chrome and so on.

How much a region contributes falls with its resistance strength and non-cooperation, and depends on extraction. Lost regions give nothing. Neutral trade (Swedish ore, Turkish and Iberian metals) flows more when neutrals fear Germany; Swedish ore needs Norway, because of the Narvik route. A ruler's administrative skill scales `S`.

`S` drives garrison mobility through oil, interdiction of resistance supply, neutral fear, Soviet-front pressure and the German bomb. **It does not drive cohesion directly**; that goes through the home front (§5.14).

### 5.6 The Soviet rump
If it survives, its strength `K` grows with Soviet and US support and shrinks under German strength, cohesion and a ruler who is a good general. It drains German manpower (`frontDrain = 0.12 + 0.25·K`). Below 0.1 it may disintegrate. Above 0.7 it may mount a counteroffensive that links up with the partisans. Leaders follow history: Stalin until 1953, then Khrushchev, then Brezhnev.

### 5.7 Garrisons and auxiliaries
- **Manpower** = `garScale × (1 − frontDrain) × cohesion factor × oil factor`.
- **Allocation:** manpower goes to regions by resistance strength, defiance, strategic priority and value. Allies get ×0.25 of the weight and puppets ×0.6.
- **Auxiliaries:** groups whose members actively collaborate (ethnic Germans, Ustaše Croats and others) add local auxiliaries to their region's garrison.
- **Helicopters** reduce the terrain advantage from 1955, if strength allows.

### 5.8 Information from outside
Radio penetration grows over time, with a jump once transistor radios spread after 1955. The source mix matters: with Britain at peace, the BBC is muted, so most of it comes from the US. Information lowers the ceiling on belief in German permanence (`X`). It also helps people see that others share their views, which is what breaks preference falsification.

### 5.9 Labor, the church war, Generalplan Ost
- **Labor demand** is `labor` until 1945 and ×0.75 after that; the economy still needs foreign workers. There were more than 7.5 million foreign workers in Germany by the end of 1944.
- **Church war (Kirchenkampf):** possible from 1946. Hitler meant to deal with the churches after the war, and Bormann's 1942 memo said their power "must absolutely and finally be broken." The odds depend on the ruler (Bormann ×2.5, Himmler ×2, Goebbels and Heydrich ×1.5, Hitler ×1.2, Göring ×0.5, Speer ×0.2) and on ideologue share and fervor. It hits dissent in proportion to each group's religiosity, including German Catholics (cohesion −0.05) and Catholic allies. It fades faster under non-ideological rulers.
- **Generalplan Ost depopulation:**
  - **Intensity:** from SS and Party power, ruler ideology and fervor. It is cut by labor demand and capped by settler supply. The planners themselves doubted enough Germans would settle the East.
  - **Timing:** full from 1946; before that, the Hunger Plan component applies.
  - **Who is targeted:** shares from the plan's own targets. Poles .8, Belarusians .75, Ukrainians .65, Russians .9, Lithuanians .85, Latvians .5, Czechs .5.
  - **Settlers:** ethnic German population in those regions grows as settlers arrive.

### 5.10 The murder of Europe's Jews
This is a fact of every run, not a variable. The victims are **not** modeled as a resistance movement.

- **Occupied regions:** the Jewish population is destroyed from 1941 in the East and 1942 in the West, at a pace set by SS power.
- **Allied states:** each year there is a chance an ally yields and hands over its Jews. The odds rise with ideologue share and fall with that ally's independence (Finland 1, Italy .8, Bulgaria .8, Hungary .6, Romania .4).
- **What the model does with it:** only *visibility*. The killing was concealed, so a group's **awareness** rises with:
  - visible absence in its region, as a threshold: `(missing share × 4)^1.5`. Murder in secret is possible; empty streets are not;
  - its own losses;
  - information leaking from outside.
- **Effects:** awareness only rises. It adds modestly to dissent everywhere and adds desperation for peoples slated for removal: they realize they are next.

Historical basis:
- Policy moved from forced emigration (1933–39) to expulsion schemes (Nisko 1939; the Madagascar Plan, June–August 1940), then mass shootings from June 1941, including women and children by August (Kamenets-Podolsk, 23,600 people, 26–28 August 1941), then the decision to murder all of Europe's Jews in autumn 1941.
- Browning argues those decisions came in the "euphoria of victory," not desperation. Gerlach dates the decision to December 1941, after the US entered the war; historians disagree.
- In this scenario, Browning's conditions are stronger than they were historically. The Madagascar Plan's obstacle, the Royal Navy, disappears with the peace. Kershaw calls that plan "genocide by an alternative method."

### 5.11 Cells: identity-group psychology (the heart of the model)
For each group in each region:

- **Local policy:**
  - `brutLocal` = effective brutality, shifted by governor zeal; ×0.25 in allied states; ×0.4 for a puppet state's titular group.
  - The **indiscriminate** share of that violence is `brutLocal × (1 − 0.6·competence)`. Competent governors use selective terror, which suppresses resistance while generating fewer atrocities. That is the Heydrich effect: intelligence makes terror more effective, not milder.
  - `colLocal` rises with competent, low-zeal governors, diplomatic governors and titular status.
- **Victimization** comes from rival groups' active collaborators in the same region: divide and rule turns neighbors into enforcers. For example, Ustaše Croats against Serbs at strength .95.
- **Hunger** = quotas × group severity × German food pressure − harvest surplus, plus the Hunger Plan for marked peoples (1941–43). Above 0.5 it causes famine deaths and an event.
- **Round-ups** scale with labor demand and group severity (bm), and are lower in allied (×0.1) and puppet (×0.5) states and where collaboration protects people.
- **Supply by sponsor:**
  - `sUS = us × US government multiplier × A-bomb multiplier × aff × westReach × westIdeo × deter`
  - `sUK = uk × UK government multiplier × aff × westReach × westIdeo × deter`
  - `sEX = exile strength × max(US, UK) × reach × 0.6`
  - `sSU` = Soviet support × rump strength × aff × Soviet reach × communist share, and only if the rump survives.
  - `sNE` = sum over conduits of neutral courage × nerve × (1 − neutral fear).
  - `westIdeo = 1 − comm × (1 − westPrag)` captures Western reluctance to arm communists. German interdiction scales the total down with `S`.
- **Private dissent `D`** moves toward a target made of:
  - identity strength; local brutality × racial classification; extraction; hunger; round-ups; atrocity memory; victimization; church war × religiosity; awareness;
  - minus co-optation, belief in German permanence (for groups rated "Germanic") and the titular discount;
  - plus generational drift after 1955 (accommodation for lightly treated groups, hardening for brutalized ones);
  - plus, for allies, war-weariness and their ruler's succession shock.
- **Fear** rises with brutality × classification and garrison density, falls with existing armed strength, and drops during a thaw.
- **Odds** = armed strength + (1 − X) + supply + information × regional defiance + thaw.
- **Desperation** (Kalyvas) = atrocities, indiscriminate violence, hunger, victimization, genocide awareness for marked peoples, round-ups and depopulation. It is scaled by terrain and needs an armed group to join. When villages burn anyway, joining fighters in rough country becomes the safer choice.
- **Public defiance `A`** = `D × aMax × sigmoid((odds + desperation − θ − fearW·fear + aOffset)/0.08)`. This is Granovetter's threshold model on top of Kuran's private and public preferences. A jump logs a cascade event.
- **Non-cooperation `NC`** = `A × (0.25 + 0.65 × nonviolence)`. A nonviolent exceptional leader turns defiance into strikes and refusal rather than arms. What happens next depends on who rules:
  - a zealous regime (`brutLocal × ruler ideology > 0.5`) answers with massacres, which raise atrocity memory across the region, and may kill the leader;
  - a pragmatic one concedes.
  - NC reduces control and resource yield.
- **Infighting** between communist and nationalist camps is worst with an even split and two rival sponsors. A diplomatic leader damps it.
- **Armed strength `R`** follows logistic growth up to an **arms ceiling**: without a supplier, fighters are limited to captured weapons. Growth rises with defiance above a threshold, terrain, learning, a leader's generalship, supply, and draft evasion (round-ups × dissent × terrain). Nonviolence and infighting reduce it.
- **Suppression** = garrison × suppW × terrain (eased by helicopters) × brutality × governor competence × governor and ruler generalship × German counterinsurgency learning × (1 − supply), and is weakened by a resistance general.
- **Atrocity memory** accumulates from indiscriminate violence and decays slowly. Heavy indiscriminate pressure erodes the arms ceiling.
- **Allied states** do not grow guerrillas the same way: their `R` tracks defiance, and they leave by **defection** instead.
- **Ethnic Germans** never resist. They supply auxiliaries, and their numbers grow with settlement.

### 5.12 Regions
A region's `R`, `A` and `NC` are population-weighted averages of its cells, excluding ethnic Germans. Population changes with famine and depopulation.
- **Occupied, annexed and puppet regions** are **lost** after two years with `R ≥ 0.6`, and **retaken** if `R` falls below 0.35.
- **Allies defect** when loyalty falls below 0.3 and there is an opening. Loyalty is made of belief in permanence, cohesion, the ruler's commitment, defiance, the church war, the succession shock and the German ruler's diplomacy. An opening means outside supply, low German cohesion, a strong nearby Soviet rump, or a diplomatic genius in charge of the ally.

### 5.13 Allied and puppet rulers
Mussolini, Horthy, Antonescu, Boris III, Ryti's government, Tiso, Pavelić and the Albanian cabinet each age and can die. A successor is usually less committed (×0.4–0.9). 3% are exceptional, with any commitment. A succession shocks loyalty for a year.

### 5.14 Governors
Each German zone has a governor with faction, competence, zeal and old-fighter status, plus a talent profile. The starting governors are the historical ones (table below).
- **Assassination:** odds rise with the zone's resistance strength, trained outside teams and low governor competence. Reprisals add atrocities.
- **Replacement:**
  - **Failure** = rise in resistance strength + its level + regions lost.
  - **Protection** = ruler loyalty × (old fighter 0.9, otherwise 0.4) + 0.5 × the ruler's preference for the governor's faction.
  - `pFire = (failure − 0.08) × 2 × (0.3 + ruler merit) × (1 − protection) + 2% routine rotation`.
  - When a failing governor survives because he's protected, an event says so: "X keeps his post. Hitler protects his own."
- **Appointees** come from factions weighted by power and ruler preference. Their competence comes from the faction's bench and the ruler's competence. 2% are exceptional.

### 5.15 Exceptional people (every side)
`drawTalent`: an ordinary person varies around their background. An exceptional one has:
- force .85–1 and competence .75–1;
- one or two spiking skills, from **oratory, diplomacy, generalship and administration**;
- **violence and ideology each drawn uniformly from 0 to 1**, so anything is possible.

Rates:
- 4% of Berlin cohort candidates;
- 2% of governor appointments;
- 3% of allied-ruler successors;
- resistance leaders, who are only generated when exceptional: each group, each year, `0.001 + 0.006 × max defiance`, so crisis produces leaders.

What each skill does:

| Skill | In Berlin | Governor | Resistance leader |
|---|---|---|---|
| Oratory | fervor, cohesion | lowers dissent slightly | lowers the mobilization threshold |
| Diplomacy | ally loyalty, neutral fear, deters sponsors, more collaboration | more collaboration | more supply from every sponsor, less infighting |
| Generalship | Soviet front, suppression | suppression | growth, survival, weaker suppression |
| Administration | strength S, bench quality, German bomb | – | – |
| Violence < .25 | thaw (if also low ideology) | – | nonviolent mass non-cooperation |
| Violence > .75 | brutality | zeal | atrocities against rival groups |

Resistance leaders die each year at about 4%, plus a risk from suppression, or are killed in massacres after nonviolent campaigns.

### 5.16 Cohesion, home front, expectations, end states
- **Cohesion** moves toward `0.78 + home front + fervor + ruler oratory`. The home front is Aly's thesis: the regime bought German loyalty with plunder and welfare, so food and strength above need raise it. Cohesion falls with new losses, the number of regions lost and thaw.
- **`X`** is the shared belief that German rule is permanent. It rises in quiet years toward a ceiling that information lowers, falls with each loss, and recovers a little with each region retaken.
- **German counterinsurgency learning** rises with the number of active insurgencies.
- **End states:**
  - `uswar`: war with a nuclear-armed US, ending in capitulation;
  - `collapse`: cohesion below 0.12 (with a separate text when it was a thaw that unraveled);
  - at 1970 the run is classified: `hegemony` (at least 80% of value held and cohesion above 0.4), `fraying` (at least 50% held) or `rollback`.
  - After an early end, the final state is carried forward with all regions freed.

---

## 6. Outputs and data layouts

`RunResult`:
- `cells: Float32Array`: `[year][cell][CF field]`. Fields: R, A, D, FEAR, VICT, S_US, S_UK, S_EX, S_SU, S_NE, HUNG, POP, NC, AWARE.
- `regions: Float32Array`: `[year][region][RF field]`. Fields: LOST, R, A, GOV (index into `govs`), GAR.
- `glob: Float32Array`: `[year][GF field]`. Fields: S, COH, X, CTRL (control %), K (−1 if no rump), ENDED, USB, DEB, BRUT, COL, EXTR, SS, PARTY, WEHR, TECH, GOR, FERV, INFO, OIL, FOOD, CHURCH, GPO, LEAD (index into `rulers`, −1 after the end).
- `govs`, `rulers`, `resLeaders` (with tenure and fate), `events` (`{y, kind, text, region?}`), `lostByResistance`, `groupPeak`, `heydrichAlive`, `outcome`, `endYear`.

Event kinds: start, regime, loss, gain, nuke, psych, faction, ethnic, sponsor, governor, berlin, famine, church, genocide, labor, ally, end.

`Aggregate`: outcome counts; control and strength bands (median, p10, p90); `cellMed` (the medians of every cell field, used by the UI's "watch average" mode); `regionR`; `heldShare`; `lostShare`; `groupMajor` (share of runs where the group's armed strength reaches 0.5 somewhere); and per-year shares for founder gone, church war, US bomb, German bomb, rump alive, ended and new generation in power; plus `globMed`.

Cells are built from group presence entries with share > 0.02: 56 cells. Index tables are in `cells.ts`.

---

## 7. Assumptions (all judgment calls; change them openly)

**Scenario**
- Britain is at peace from 1940. Its broadcasting and secret services are constrained, which mutes the BBC and lowers the odds of Heydrich's assassination.
- The US is not at war and its aid continues. A peacetime intelligence service from 1947 adds ×1.15.
- The US bomb is not certain: expected 1958 ± 3 by default.
- The Soviet rump survives with probability `rump`.

**Outside governments (history-fixed, `world.ts`)**
- US: Roosevelt 1.0, Truman 1.1, Eisenhower 1.3, Kennedy 1.2, Johnson 1.0, Nixon 0.8.
- UK: Halifax's peace government 0.4 (1941–45), Attlee 0.6, Churchill's return 1.1 (1951–55), Eden 0.9, Macmillan and Douglas-Home 0.7, Wilson 0.6. This path is an assumption: the peace changes British politics, so it uses real figures on a plausible sequence.
- USSR rump: Stalin 1.0 until 1953, Khrushchev 1.15, Brezhnev 0.9.

**People**
- Starting governors and the known figures' traits are scored from their records (tables below).
- Generated successors and appointees never get invented names.
- Mortality is Gompertz with health multipliers.

**Groups and regions**
- Every attribute in the tables is a judgment from the historical record.
- Region `value` sums to 1 and stands for the region's weight in "control of Europe." It is not GDP.
- Region shares of groups do not always sum to 1. The gap is people not modeled as groups, chiefly the murdered Jewish population, plus Roma and small minorities. Region averages are normalized over modeled groups.

**Approximations flagged in code**
- Jewish population shares in `cells.ts` are approximate pre-war figures, used only for visibility.
- Resource shares in `resources.ts` are judgment-based, anchored to the best-known source of each material.
- Generalplan Ost targets follow the plan's published figures where available (Lithuanians 85%, Belarusians 75%, Latvians and Czechs 50%, Poles 80–85%). Ukrainians (.65) and Russians (.9) are judgment, based on the plan's deportation scheme.

**Not modeled, deliberately**
- The Pacific, decolonization and epidemics. Each adds parameters with nothing to check them against.
- The victims of the Holocaust and the Roma genocide as a "movement."
- Climate cycles. Harvest shocks are modeled instead.

---

## 8. Calibration

There is no ground truth after 1945, so calibration targets are judgment ranges grounded in 1941–45 behavior:
- **Scenario totals:** share of runs Germany holds (hegemony or fraying) is 45–65% for historical, at least 93% for isolated, at least 88% for pragmatic and at most 30% for coldwar.
- **Group targets:** the share of historical runs in which each group's armed resistance becomes a major force. For example, Serbs and Montenegrins 40–60%, Greeks 30–50%, Belarusians 35–60%, Poles 10–35%, French 5–20%, Norwegians 3–15%, Dutch and Danes 0–5%. The full list is `GROUP_TARGETS` in `scripts/calibrate.ts`.

Method: random global search, then local search over the `TUNE` constants: aOffset, aMax, fearW, despAtro, despBrut, growthThr, suppW, garScale and dBase. Several presets and targets are scored at once, so no single region dominates the fit.

**Rule:** if tuning can't reach a target, the problem is structural, so fix the mechanism rather than over-tune. §9 lists the ones already visible.

---

## 9. Current results (uncalibrated, 200 runs, seed 1940) and known problems

| Preset | Hegemony | Fraying | Collapse | US war | Held |
|---|---|---|---|---|---|
| historical | 1% | 17% | 78% | 4% | **18%** (target 45–65%) |
| pragmatic | 55% | 16% | 26% | 4% | 71% (target ≥ 88%) |
| isolated | 96% | 2% | 0% | 3% | 97% ✓ |
| coldwar | 0% | 0% | 91% | 9% | 0% ✓ |

On the historical preset, the founder is gone by 1950 in 28% of runs, by 1960 in 80% and by 1970 in 97%. A church war has started by 1970 in 56% of runs.

A three-iteration smoke test of the calibration script cut the error from 6.74 to 1.85 (held: historical .70, isolated .97, coldwar .17, pragmatic 1.00). The search does find better regions of parameter space. It needs a real run.

**Structural problems to fix (tuning won't):**
1. **Allies defect far too often** (Italy 67%, Bulgaria 75%, Finland 60%, Hungary 58%). The `opening` condition is too easy to meet. The loyalty formula needs a stronger weight on `X` and on the regime's actual record.
2. **Collapse is too common.** Cohesion takes repeated hits from ally defections, which count as losses. Consider weighting cohesion hits by region value and treating allied defection separately.
3. **Minority insurgencies can't take a region.** Serbs in Croatia and Bosnia stay at 0% lost, and Croats and Bosniaks at 0% as a major force, because region strength is population-weighted. Consider a "contested territory" state for when any cell reaches 0.6.
4. **Some targets sit at 0% that shouldn't:** Western Ukrainians (OUN and UPA), Slovaks (the 1944 uprising), Croats. The puppet titular discount is too strong, and no sponsor backs the Western Ukrainians.
5. **Norway is too high** (lost in 68% of runs, target well under 20%). Check the UK and exile supply path after the 1951 Churchill multiplier, and the terrain weight.
6. **Exceptional resistance leaders are too common**, about 2 per run. The owner asked for a "small percentage"; reduce the base rate.
7. `tsconfig` typechecks `src` only. Scripts run under bun without typecheck.
8. `/home/claude/fortress/init` is a leftover empty scaffold outside the app; delete it.

---

## 10. UI to build (React, not started)

Stack is already installed: React 18.3.1, zustand, d3-geo, d3-scale, d3-shape, topojson-client, world-atlas (countries-50m).

1. **`src/worker.ts`:** runs `runBatch` and `aggregate` off the main thread. Import it as `import SimWorker from "./worker?worker&inline"` so the single-file build inlines it. Transfer the Float32Array buffers.
2. **`src/store.ts` (zustand):** params, preset, runs, aggregate, selected run or "average," year, playing, speed, selected region.
3. **Header and rail:**
   - preset buttons and policy levers (including `labor`);
   - Berlin levers;
   - outside powers (US, UK, USSR, westPrag, neutral nerve);
   - a collapsible per-group sponsor attitude editor, 32 groups × 3 sponsors.
4. **Verdict:** a stacked bar of outcomes.
5. **Watch section:**
   - mode toggle: **average** (uses `cellMed`, `regionR`, `heldShare`) or **single run**;
   - run picker: outcome filter, a select over all runs, a random button;
   - play/pause, year slider, speed control.
6. **Map:**
   - projection: d3-geo conic conformal, Europe;
   - data: world-atlas 50m, matched by `REGIONS[].countries` names. Kosovo has no numeric id in world-atlas, so match it by name;
   - colors: by control/R; the Reich core (Germany, Austria, Liechtenstein) dark; neutrals gray; the Soviet rump by K; lost regions marked.
7. **Year panel:**
   - control, strength (with oil and food), cohesion, X, fervor;
   - the ruler with talent bars;
   - a faction share bar;
   - bomb status and church war;
   - events for that year.
8. **Region detail on click:**
   - the governor (name, faction, talent);
   - garrison;
   - each group's D, A, fear, R, hunger, awareness, population and non-cooperation bars;
   - supply broken down by sponsor;
   - rivalries;
   - any resistance leader.
9. **Charts:** a control chart with p10–p90 band, small multiples of group movement, and a chronicle synced to the year.
10. **Explainer sections:**
    - the identity-groups table;
    - Berlin's people;
    - supply and neutrals;
    - psychology (Kuran, Granovetter, Kalyvas);
    - leadership and exceptional people;
    - resources;
    - the genocide note (treated soberly);
    - calibration and limits;
    - sources.

**Design tokens from v1** (fonts: Big Shoulders Display, Source Serif 4, IBM Plex Mono):

| Token | Light | Dark |
|---|---|---|
| `--paper` | #e9ece7 | #111418 |
| `--surface` | #f5f6f2 | #191e24 |
| `--ink` | #1b2128 | #e2e6e9 |
| `--muted` | #59636d | #98a3ad |
| `--rule` | #c5cbc4 | #2b333b |
| `--accent` | #2b5874 | #7eb0cf |
| `--reich` | #66704f | #a9b08a |
| `--resist` | #a8701a | #e2a64a |
| `--danger` | #a23a2e | #e47566 |
| `--war` | #6f5594 | #b59cdb |

Theming rules:
- Put the tokens on a bare `:root`.
- Dark mode goes under `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {…} }` and again under `:root[data-theme="dark"]`.
- It must work at phone width with no horizontal scroll, and side padding `max(16px, env(safe-area-inset-*))`.

## 11. Publishing as a claude.ai artifact

`bun run build` makes a single `dist/index.html` (vite-plugin-singlefile). The artifact platform wraps pages itself, so add a bun post-build script that:
- strips the `<!doctype>`, `<html>`, `<head>` and `<body>` tags;
- keeps `<title>`, the metas (including `<meta name="claude:viewport-fit-sides" content="cover">`), the Google Fonts links, `<style>`, `<script>` and `<div id="root">`.

Fonts may load only from Google Fonts. Publish to the v1 URL (read it first) or as a new artifact.

---

## 12. Sources

Psychology and mechanisms:
- Kuran, T. (1991). "Now Out of Never: The Element of Surprise in the East European Revolution of 1989." *World Politics* 44(1). On preference falsification.
- Granovetter, M. (1978). "Threshold Models of Collective Behavior." *American Journal of Sociology* 83(6).
- Kalyvas, S. (2006). *The Logic of Violence in Civil War*. Cambridge University Press.
- Kendall-Taylor, A. & Frantz, E. (2016). "When Dictators Die." *Journal of Democracy*. https://www.journalofdemocracy.org/articles/when-dictators-die/ and summary: https://foreignpolicy.com/2015/09/10/when-dictators-die/
- Kershaw, I. "Working Towards the Führer." https://pages.uoregon.edu/dluebke/NaziGermany443/410WorkingTowardstheFuehrer.html
- Weber, M. On the routinization of charisma.

Regime and people:
- Wildt, M. *An Uncompromising Generation: The Nazi Leadership of the Reich Security Main Office*. https://www.harvard.com/book/9780299234645
- Aly, G. *Hitler's Beneficiaries*. https://www.versobooks.com/products/2011-hitler-s-beneficiaries
- Kirchenkampf and postwar plans for the churches: https://en.wikipedia.org/wiki/Kirchenkampf
- Hitler's health: https://www.historyanswers.co.uk/people-politics/how-much-longer-might-hitler-have-lived/

Plans, famine and labor:
- Generalplan Ost: https://en.wikipedia.org/wiki/Generalplan_Ost
- Hunger Plan: https://en.wikipedia.org/wiki/Hunger_Plan
- Madagascar Plan: https://en.wikipedia.org/wiki/Madagascar_Plan
- Greek famine: https://en.wikipedia.org/wiki/Great_Famine_(Greece)
- Soviet famine of 1946–47: https://en.wikipedia.org/wiki/Soviet_famine_of_1946%E2%80%931947
- STO and the maquis: https://museevoulgre.fr/?p=2136
- Forced labor (DHM): https://www.dhm.de/lemo/kapitel/zweiter-weltkrieg/kriegsverlauf/zwangsarbeit

Genocide and resistance:
- Browning on October 1941: https://ww2history.com/experts/Christopher_Browning/The_importance_of_October_41
- Browning on December 1941: https://ww2history.com/experts/Christopher_Browning/December_and_the_Final_Solution
- USHMM, Kamenets-Podolsk: https://encyclopedia.ushmm.org/content/en/article/kamenets-podolsk
- Radio Londres: https://en.wikipedia.org/wiki/Radio_Londres
- Gorbachev's rise: https://www.rferl.org/a/1980816.html

---

## Appendix: data tables (generated by `bun scripts/tables.ts`)

Column key for groups:
- `bm`: severity of Nazi racial classification.
- `ident`: national identity strength.
- `collabP`: collaborator pool.
- `theta`: mobilization threshold.
- `comm`: communist share of the resistance.
- `polar`: communist–nationalist hostility.
- `rel`: religiosity.
- `exile`: exile government strength.
- US, UK, USSR: default sponsor affinity.

### Identity groups

| id | Group | Nazi classification | bm | ident | collabP | theta | comm | polar | rel | exile | Lives in (region: share) | US | UK | USSR |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| nor | Norwegians | Germanic | .30 | .80 | .12 | .36 | .15 | .15 | .40 | .80 | nor 1.00 | .75 | .90 | .25 |
| dan | Danes | Germanic | .25 | .70 | .40 | .50 | .20 | .15 | .30 | .40 | den 1.00 | .65 | .80 | .20 |
| dut | Dutch | Germanic | .35 | .70 | .30 | .45 | .20 | .20 | .60 | .70 | nld 1.00 | .75 | .90 | .20 |
| fle | Flemings | Germanic | .30 | .60 | .50 | .50 | .15 | .20 | .70 | .50 | bel .55 | .60 | .75 | .15 |
| wal | Walloons | Latin | .50 | .65 | .25 | .40 | .40 | .25 | .50 | .60 | bel .45 | .65 | .80 | .35 |
| lux | Luxembourgers | Germanic | .30 | .80 | .20 | .45 | .10 | .10 | .70 | .60 | lux 1.00 | .60 | .70 | .10 |
| fre | French | Latin | .50 | .85 | .35 | .42 | .45 | .35 | .45 | .90 | fra .95 | .85 | .85 | .50 |
| als | Alsatians | Germanic | .30 | .55 | .25 | .55 | .10 | .10 | .60 | .30 | fra .05 | .50 | .50 | .10 |
| pol | Poles | Slav, to be destroyed as a nation | 1.00 | .95 | .02 | .22 | .15 | .70 | .95 | .90 | pol .85, ltu .12, blr .06, ukr .03 | .60 | .80 | .15 |
| cze | Czechs | Slav, partly 'Germanizable' | .75 | .75 | .15 | .48 | .45 | .20 | .35 | .80 | cze .97 | .50 | .65 | .70 |
| slk | Slovaks | Allied Slavs | .20 | .60 | .55 | .40 | .45 | .30 | .85 | .30 | svk .85 | .35 | .45 | .60 |
| lit | Lithuanians | Baltic | .65 | .85 | .45 | .30 | .10 | .40 | .85 | .30 | ltu .80 | .35 | .25 | .05 |
| lat | Latvians | Baltic | .60 | .80 | .50 | .35 | .20 | .40 | .50 | .30 | lva .85 | .30 | .25 | .10 |
| est | Estonians | Finnic, rated 'racially valuable' | .50 | .80 | .50 | .35 | .10 | .40 | .30 | .30 | est .90 | .30 | .25 | .05 |
| bel | Belarusians | Slav, to be removed | 1.00 | .45 | .25 | .32 | .85 | .30 | .40 | .05 | blr .82 | .10 | .05 | .95 |
| wuk | Western Ukrainians | Slav, to be removed | .95 | .80 | .50 | .28 | .05 | .30 | .85 | .40 | ukr .22 | .25 | .10 | .05 |
| euk | Eastern Ukrainians | Slav, to be removed | 1.00 | .55 | .35 | .38 | .70 | .50 | .40 | .10 | ukr .60 | .15 | .05 | .80 |
| rus | Russians in the occupied west | Slav, to be removed | 1.00 | .60 | .20 | .30 | .85 | .20 | .35 | .05 | ukr .10, blr .06, lva .10, est .06 | .10 | .05 | .95 |
| slv | Slovenes | Slav, partly 'Germanizable' | .75 | .75 | .20 | .30 | .70 | .70 | .75 | .30 | svn 1.00 | .45 | .55 | .70 |
| cro | Croats | Allies ('Gothic' myth) | .20 | .70 | .55 | .45 | .55 | .50 | .85 | .20 | hrv .70, bih .22 | .35 | .45 | .60 |
| ser | Serbs | Slav enemies | .80 | .80 | .20 | .25 | .50 | .90 | .70 | .50 | srb .80, hrv .20, bih .35, mne .25, kos .10 | .50 | .70 | .75 |
| bos | Bosnian Muslims | Courted for SS recruitment | .35 | .55 | .45 | .45 | .55 | .40 | .80 | .10 | bih .40 | .25 | .35 | .50 |
| mon | Montenegrins | Slav | .60 | .75 | .25 | .20 | .70 | .60 | .60 | .20 | mne .70 | .35 | .50 | .80 |
| mac | Macedonians | Under Bulgarian rule | .50 | .50 | .30 | .40 | .60 | .30 | .60 | .10 | mkd .70 | .25 | .35 | .60 |
| alb | Albanians | Courted as allies | .35 | .65 | .55 | .30 | .50 | .70 | .50 | .20 | alb .95, kos .85, mkd .25 | .35 | .50 | .40 |
| gre | Greeks | Occupied | .70 | .85 | .12 | .28 | .60 | .75 | .80 | .70 | grc .95 | .75 | .90 | .55 |
| ita | Italians | Senior ally | .15 | .65 | .55 | .40 | .50 | .40 | .80 | .30 | ita 1.00 | .75 | .45 | .45 |
| hun | Hungarians | Ally | .15 | .70 | .55 | .48 | .30 | .30 | .70 | .20 | hun .95, svk .10, rom .07, srb .04 | .30 | .25 | .30 |
| rom | Romanians | Ally | .15 | .65 | .50 | .45 | .15 | .30 | .75 | .20 | rom .85, mda .65 | .30 | .35 | .35 |
| bul | Bulgarians | Ally | .15 | .65 | .45 | .38 | .65 | .30 | .50 | .10 | bgr .90 | .20 | .20 | .90 |
| fin | Finns | Co-belligerent | .15 | .85 | .60 | .50 | .10 | .20 | .60 | .10 | fin 1.00 | .40 | .40 | .05 |
| vdt | Ethnic Germans | Volksdeutsche, the 'master race' abroad | .00 | .80 | .90 | .95 | .02 | .10 | .60 | .00 | pol .04, cze .03, svk .03, hun .05, rom .04, srb .06, hrv .03, ukr .02, lva .03, est .02, ltu .02 | – | – | – |

Group notes:

- **Norwegians** (nor): Classed as fellow 'Nordic' people. A popular exiled king; Quisling's party never won real support. Exile backing: King Haakon's government in London.
- **Danes** (dan): Ruled as a 'model protectorate' with its own king and parliament. Comfortable accommodation; resistance came late. Exile backing: Free Danes abroad.
- **Dutch** (dut): Slated for absorption as Germanic. A local Nazi movement existed; the February 1941 strike showed early defiance. Exile backing: Queen Wilhelmina's government in London.
- **Flemings** (fle): Flemish nationalists hoped Germany would free them from Francophone dominance and supplied many collaborators. Exile backing: the Belgian government in London.
- **Walloons** (wal): Industrial and more left-wing, with a strong communist presence among miners. Rex fascists were a minority. Exile backing: the Belgian government in London.
- **Luxembourgers** (lux): Annexed outright and conscripted into the Wehrmacht, which provoked a general strike in 1942. Exile backing: Grand Duchess Charlotte in exile.
- **French** (fre): A great power humiliated. Vichy gave the right a collaborationist home; many waited to see who would win (attentisme). Exile backing: de Gaulle's Free French.
- **Alsatians** (als): Annexed de facto and forcibly conscripted; the 'malgré-nous' served against their will. Exile backing: French networks.
- **Poles** (pol): Built a full underground state. The Home Army's strategy was to wait for a liberator, then rise. Exile backing: the Polish government in London.
- **Czechs** (cze): Kept working at decent rations as an industrial prize while elites were terrorized. Exile backing: Beneš's government in London.
- **Slovaks** (slk): Got their first state from Hitler. Support faded with time and ended in the 1944 national uprising. Exile backing: Czechoslovak exiles.
- **Lithuanians** (lit): Soviet deportations in 1941 made many welcome the Germans. Forest-brother traditions, hostile to Moscow. Exile backing: Lithuanian diaspora and legations.
- **Latvians** (lat): Similar to Lithuania: anti-Soviet goodwill at first, draining as Germany treats the region as a colony. Exile backing: Latvian diaspora and legations.
- **Estonians** (est): Close ties to Finland and Sweden; thousands fled across the water rather than serve. Exile backing: exiles in Sweden and Finland.
- **Belarusians** (bel): Weak national identity but forests and marshes. Soviet partisans held about 60% of Belarus by the end of 1943. Exile backing: almost none.
- **Western Ukrainians** (wuk): Galicia and Volhynia, formerly Polish. The nationalist OUN and UPA fought Germans, Poles and Soviets in turn. Exile backing: the Ukrainian diaspora.
- **Eastern Ukrainians** (euk): Some greeted the Germans after the 1932–33 famine. Starvation and labor round-ups reversed that within a year. Exile backing: almost none.
- **Russians in the occupied west** (rus): Mostly Soviet-loyal; a few anti-Soviet experiments like the Lokot autonomy existed. Exile backing: almost none.
- **Slovenes** (slv): Partitioned and targeted for Germanization. The communist-led Liberation Front fought the Catholic Home Guard. Exile backing: Yugoslav exiles.
- **Croats** (cro): The Ustaše regime claimed to speak for them; many Croats later joined Tito's Partisans. Exile backing: small exile circles.
- **Serbs** (ser): A guerrilla tradition and brutal reprisals (100 hostages per German killed). Royalist Chetniks and communist Partisans fought each other. Exile backing: the royal Yugoslav government in London.
- **Bosnian Muslims** (bos): Caught between Ustaše and Chetniks. Some joined the SS Handschar division, more drifted to the Partisans. Exile backing: almost none.
- **Montenegrins** (mon): A clan-based warrior culture in the wildest terrain in Europe; rose against Italy in July 1941. Exile backing: royalist exiles.
- **Macedonians** (mac): Some welcomed Bulgarian rule at first; forced Bulgarization turned many toward the Partisans. Exile backing: almost none.
- **Albanians** (alb): The Axis created a Greater Albania including Kosovo. Communists and the nationalist Balli Kombëtar fought each other. Exile backing: small exile circles.
- **Greeks** (gre): Famine killed hundreds of thousands in 1941–42. ELAS and EDES fought each other, then a civil war after liberation. Exile backing: the Greek government in exile.
- **Italians** (ita): Thin enthusiasm for the alliance; the king and generals deposed Mussolini when the war turned in 1943. Exile backing: anti-fascist exiles.
- **Hungarians** (hun): Allied mainly to recover lost territory. The regent tried to leave the war in 1944. Exile backing: small exile circles.
- **Romanians** (rom): Fought the USSR to regain Bessarabia, then switched sides in August 1944. Exile backing: small exile circles.
- **Bulgarians** (bul): Refused to declare war on the USSR out of pan-Slavic sympathy. A communist-led Fatherland Front had real roots. Exile backing: almost none.
- **Finns** (fin): Fought their own war against the USSR after the Winter War, kept their democracy, and made a separate peace in 1944. Exile backing: almost none.
- **Ethnic Germans** (vdt): German minorities from the Baltic to the Banat. The core of collaboration, the auxiliary militias and the settler program. Their numbers in the East grow only as fast as Germans can be found to settle there. Exile backing: none.

### Rivalries

| Groups | Strength | Why |
|---|---|---|
| vdt vs pol | .60 | Ethnic German self-defense militias took part in the 1939 killings and later the settler expulsions. |
| vdt vs ser | .45 | Banat Germans formed the core of the Prinz Eugen SS division used against Serb villages. |
| vdt vs cze | .40 | Sudeten and Protectorate Germans ran much of the occupation apparatus. |
| cro vs ser | .95 | Ustaše massacres of Serbs drove survivors to the Chetniks and Partisans. |
| pol vs wuk | .85 | The 1943 Volhynia massacres and Polish reprisals. |
| bos vs ser | .70 | Chetnik massacres of Muslims and Ustaše violence against Serbs. |
| alb vs ser | .70 | Kosovo, annexed to Greater Albania, saw expulsions of Serb settlers. |
| hun vs rom | .60 | The 1940 partition of Transylvania. |
| pol vs lit | .50 | The dispute over Vilnius. |
| mon vs alb | .50 | Border feuds in the Montenegro–Kosovo highlands. |
| wuk vs rus | .50 | The UPA and Soviet partisans hunted each other. |
| lat vs rus | .45 | Memories of the 1940–41 Soviet occupation. |
| hun vs slk | .45 | Hungary annexed southern Slovakia in 1938. |
| mac vs alb | .40 | Competing claims in western Macedonia. |
| est vs rus | .40 | Memories of the 1940–41 Soviet occupation. |
| fle vs wal | .30 | Language politics that Germany exploited by favoring Flemings. |
| cro vs bos | .30 | Rival claims inside the Ustaše state. |

### Regions

| id | Region | Kind | Value | Terrain | West reach | Soviet reach | Neutral conduits | Priority | Regime / titular group | Resources |
|---|---|---|---|---|---|---|---|---|---|---|
| nor | Norway | occupied | .03 | .65 | .70 | .10 | se .70 | 1.6 | – | iron .02, metals .08 (Molybdenum, the Narvik route for Swedish ore, and Vemork heavy water) |
| den | Denmark | occupied | .03 | .10 | .50 | .05 | se .65 | 1 | – | food .06 (Dairy, meat and bacon) |
| nld | Netherlands | occupied | .05 | .10 | .70 | .05 | – | 1 | – | coal .02, food .04 |
| bel | Belgium | occupied | .04 | .15 | .70 | .05 | – | 1 | – | coal .05 |
| lux | Luxembourg | annexed | .01 | .30 | .50 | .05 | – | 0.8 | – | – |
| fra | France | occupied | .18 | .35 | .80 | .05 | ch .40, es .30 | 1.2 | – | coal .07, iron .25, food .10, metals .05 (Lorraine iron ore, northern coal and farmland) |
| pol | Poland | occupied | .06 | .40 | .25 | .50 | – | 1.2 | – | coal .15, food .08 (Upper Silesian coal) |
| cze | Bohemia & Moravia | occupied | .07 | .45 | .30 | .30 | – | 1.2 | – | coal .06, iron .03, metals .03 (Škoda arms works, coal, and Joachimsthal uranium) |
| svk | Slovakia | puppet | .01 | .65 | .25 | .45 | – | 1 | Tiso's clerical-fascist state / slk | iron .02, metals .03 |
| ltu | Lithuania | occupied | .01 | .45 | .30 | .55 | se .20 | 1 | – | – |
| lva | Latvia | occupied | .01 | .50 | .30 | .55 | se .25 | 1 | – | – |
| est | Estonia | occupied | .01 | .50 | .35 | .55 | se .40 | 1 | – | – |
| blr | Belarus | occupied | .02 | .80 | .05 | .90 | – | 1 | – | – |
| ukr | Ukraine | occupied | .10 | .45 | .05 | .90 | – | 1.3 | – | oil .04, coal .12, iron .15, food .30, metals .12 (Donbas coal, Krivoy Rog iron, Nikopol manganese and the grain belt) |
| mda | Bessarabia | ally | .01 | .30 | .10 | .60 | tr .10 | 0.8 | Romanian administration | – |
| svn | Slovenia | annexed | .01 | .75 | .50 | .20 | ch .10 | 1 | – | metals .03 (Idrija mercury) |
| hrv | Croatia | puppet | .02 | .70 | .55 | .25 | – | 1 | Pavelić's Ustaše state / cro | metals .04 |
| bih | Bosnia | puppet | .01 | .90 | .50 | .25 | – | 1 | Pavelić's Ustaše state / cro | metals .04 |
| srb | Serbia | occupied | .03 | .70 | .40 | .35 | – | 1 | – | food .04, metals .14 (Bor copper) |
| mne | Montenegro | occupied | .00 | .95 | .60 | .25 | – | 0.9 | – | – |
| mkd | Macedonia | occupied | .00 | .80 | .40 | .30 | tr .20 | 0.9 | – | metals .04 |
| kos | Kosovo | puppet | .00 | .75 | .45 | .25 | – | 0.9 | Greater Albania under Axis protection / alb | metals .06 (Trepča lead and zinc) |
| alb | Albania | puppet | .01 | .90 | .65 | .20 | – | 0.9 | an Axis protectorate government / alb | oil .02, metals .03 |
| grc | Greece | occupied | .01 | .80 | .65 | .15 | tr .50 | 1.1 | – | metals .05 |
| ita | Italy | ally | .11 | .55 | .60 | .05 | ch .35 | 1 | Mussolini's Fascist regime | – |
| hun | Hungary | ally | .04 | .30 | .20 | .40 | – | 1 | Horthy's regency | oil .05, food .10, metals .10 (Bauxite, grain and a little oil) |
| rom | Romania | ally | .07 | .50 | .20 | .50 | tr .20 | 1.2 | Antonescu's dictatorship | oil .35, food .10 (Ploiești oilfields, Germany's main natural oil supply) |
| bgr | Bulgaria | ally | .03 | .60 | .25 | .35 | tr .40 | 1 | Tsar Boris III's monarchy | food .03 |
| fin | Finland | ally | .03 | .70 | .30 | .50 | se .60 | 1 | Finland's elected government, a co-belligerent rather than a satellite | metals .15 (Petsamo nickel) |

### Neutrals

| id | Country | Courage | Stance |
|---|---|---|---|
| se | Sweden | .50 | Traded with Germany and let troops transit, but sheltered Norwegian and Danish refugees and became bolder as risk fell. |
| ch | Switzerland | .35 | Armed, strict neutrality. A hub for intelligence and escape lines, and very cautious about anything more. |
| es | Spain | .15 | Franco leaned toward the Axis but stayed out of the war. Escape lines crossed the Pyrenees despite the regime. |
| pt | Portugal | .30 | Britain's oldest ally and Europe's main exit port, reachable only through Spain. |
| tr | Turkey | .40 | Balanced between both camps; its border and coast were the back door into the Balkans. |

### German administrative zones and starting governors

| Zone | Regions | Oversight | Governor | Faction | Competence | Zeal | Old fighter | Note |
|---|---|---|---|---|---|---|---|---|
| Reichskommissariat Norway | nor | 0.5 | Josef Terboven | party | 0.5 | 0.85 | yes | A Gauleiter who ruled Norway by terror and despised Quisling. |
| Plenipotentiary for Denmark | den | 0.8 | Werner Best | ss | 0.9 | 0.35 | no | A brilliant SS lawyer who ran Denmark with a light touch because it worked. |
| Reichskommissariat Netherlands | nld | 0.8 | Arthur Seyss-Inquart | party | 0.7 | 0.7 | no | Capable and committed; oversaw deportations and, late in the war, the Hunger Winter. |
| Military Administration Belgium | bel | 0.8 | Alexander von Falkenhausen | wehr | 0.75 | 0.15 | no | An old-school general who restrained the SS and later joined the anti-Hitler opposition. |
| Military Administration France | fra | 0.7 | Carl-Heinrich von Stülpnagel | wehr | 0.7 | 0.2 | no | Military governor of France and a July 1944 conspirator. |
| Gau Moselland (annexed Luxembourg) | lux | 0.9 | Gustav Simon | party | 0.4 | 0.85 | yes | Forced Germanization and conscription, which triggered a general strike. |
| General Government | pol | 0.7 | Hans Frank | party | 0.45 | 0.9 | yes | Hitler's old lawyer, presiding over plunder and murder in occupied Poland. |
| Protectorate of Bohemia and Moravia | cze | 0.9 | Reinhard Heydrich | ss | 0.95 | 0.9 | no | Brilliant and ruthless: terror for elites, extra rations for workers. Assassinated in 1942 by a British-trained team in our history. |
| Reichskommissariat Ostland | ltu, lva, est, blr | 0.35 | Hinrich Lohse | party | 0.3 | 0.7 | yes | An old Gauleiter out of his depth, feuding with the SS and Rosenberg's ministry. |
| Reichskommissariat Ukraine | ukr | 0.3 | Erich Koch | party | 0.25 | 0.95 | yes | Treated Ukrainians as slaves and squandered early goodwill. Protected by Hitler and Bormann throughout. |
| Annexed Slovenian districts | svn | 0.85 | Friedrich Rainer | party | 0.45 | 0.8 | yes | Gauleiter overseeing the Germanization of annexed Slovenia. |
| Military Commander Southeast | srb, grc, mne, mkd | 0.45 | Alexander Löhr | wehr | 0.6 | 0.5 | no | A capable commander who still presided over savage reprisal policy in the Balkans. |
| German envoys to the puppet states | svk, hrv, bih, alb, kos | 0.5 | Siegfried Kasche | party | 0.35 | 0.7 | yes | An SA man as envoy to Croatia who backed the Ustaše whatever they did. |

### Berlin: founder and known heirs

| Name | Born | Health × | Faction | Force | Competence | Ideology | Loyalty | Merit | Note |
|---|---|---|---|---|---|---|---|---|---|
| Hitler | 1889 | 3 | party | 1 | 0.55 | 1 | 0.75 | 0.25 | Rules by setting rivals against each other and protects old comrades whatever their record. |
| Göring | 1893 | 2.5 | goring | 0.6 | 0.35 | 0.5 | 0.6 | 0.15 | The designated heir. Once capable, now corrupt and addicted, governing through cronies and rival fiefdoms. |
| Himmler | 1900 | 1.2 | ss | 0.35 | 0.65 | 1 | 0.4 | 0.45 | A bureaucratic zealot. SS men replace Party governors and racial resettlement accelerates. |
| Heydrich | 1904 | 1 | ss | 0.8 | 0.95 | 0.85 | 0.15 | 0.85 | Ruthless, intelligent and efficient: terror becomes targeted, and failures are fired. |
| Goebbels | 1897 | 1.3 | party | 0.85 | 0.8 | 0.95 | 0.55 | 0.4 | The regime's great orator after Hitler. Mobilizes the Party rank and file and renews the faith. |
| Bormann | 1900 | 1 | party | 0.35 | 0.75 | 0.9 | 0.65 | 0.35 | A master of bureaucratic infighting who rules through the Gauleiters and wants the churches broken. |
| Speer | 1905 | 0.9 | tech | 0.5 | 0.9 | 0.35 | 0.2 | 0.8 | The armaments minister. Runs the empire as a production problem and has no taste for the racial mission. |

### Allied and puppet rulers

| Ruler | Born | Regions | Commitment |
|---|---|---|---|
| Mussolini | 1883 | ita | 0.7 |
| Horthy | 1868 | hun | 0.45 |
| Antonescu | 1882 | rom, mda | 0.7 |
| Tsar Boris III | 1894 | bgr | 0.45 |
| Ryti's government | 1889 | fin | 0.4 |
| Tiso | 1887 | svk | 0.7 |
| Pavelić | 1889 | hrv, bih | 0.85 |
| the Albanian collaborationist cabinet | 1890 | alb, kos | 0.5 |
