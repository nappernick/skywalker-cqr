// Story cards: real dilemmas of 1941–45, dealt when the history makes them possible. Every choice works through
// a mechanism the model already has (orders, operations, sponsor attitudes, information), so the engine decides
// what the choice costs. The murder of Europe's Jews is never a variable: cards touch only what becomes known.
import type { Stance } from "../model/types";
import { GROUPS, GROUP_INDEX } from "../model/groups";
import { GF } from "../model/types";
import {
  glob, groupD, groupR, governorOf, homeRegions, leaderOf, regionLost, role, rulerName, year, type Game,
} from "./game";

export interface Choice {
  label: string;
  /** What happens, in one or two sentences. */
  result: string;
  /** Applies the choice to this year's plan or to lasting attitudes; may return a more specific result. */
  apply: (g: Game) => string | void;
}

export interface Card {
  id: string;
  title: string;
  /** The real event the card is drawn from. */
  precedent: string;
  text: string;
  when: (g: Game) => boolean;
  choices: Choice[];
}

const spy = (g: Game) => role(g).kind === "spymaster";
const is = (g: Game, ...ids: string[]) => { const r = role(g); return r.kind === "people" && ids.includes(r.group); };
const mine = (g: Game) => { const r = role(g); return r.kind === "people" ? r.group : null; };
const between = (g: Game, a: number, b: number) => year(g) >= a && year(g) <= b;
const order = (g: Game, ids: string[], s: Stance) => { for (const id of ids) g.orders[id] = s; };
const free = (g: Game, m: Game["plan"]["missions"][number]) => { g.plan.missions.push(m); g.capital += cost(m.kind); };
const cost = (k: string) => ({ assassinate: 6, sabotage: 4, broadcast: 3, protect: 2, train: 3 } as Record<string, number>)[k] ?? 0;
const bump = (g: Game, s: "us" | "uk" | "su", id: string, d: number) => { g.params.aff[s][id] = Math.max(0, Math.min(1, (g.params.aff[s][id] ?? 0) + d)); };
const addInfo = (g: Game, regions: string[], v: number) => {
  for (const r of regions) { const old = g.plan.info[r] ?? 0; g.plan.info[r] = Math.min(0.5, old + v); g.capital += (g.plan.info[r] - old) * 10; }
};

export const CARDS: Card[] = [
  {
    id: "kragujevac", title: "A hundred for one",
    precedent: "Kraljevo and Kragujevac, October 1941",
    text: "The German command has set the price of resistance: a hundred hostages shot for every soldier killed, fifty for every one wounded. At Kragujevac they shot about 2,800 men and boys, a class of schoolboys among them. Yesterday your fighters ambushed a column on the Morava road.",
    when: (g) => between(g, 1941, 1943) && (spy(g) || is(g, "ser", "mon")),
    choices: [
      { label: "Keep fighting", result: "The war goes on, and so do the executions. Villages that lose their men send their sons to the hills.", apply: (g) => { order(g, ["ser", "mon"], "rise"); g.reprisals += 2; } },
      { label: "Stand down and wait", result: "Mihailović's choice: preserve the nation until a liberator comes. The reprisals ease; so does the movement.", apply: (g) => order(g, ["ser"], "wait") },
      { label: "Take the fighters into the Bosnian mountains", result: "Fewer targets near the towns, and a hard school in the mountains for those who survive the march.", apply: (g) => { free(g, { kind: "train", group: "ser" }); free(g, { kind: "protect", group: "ser" }); } },
    ],
  },
  {
    id: "anthropoid", title: "The Hangman of Prague",
    precedent: "Operation Anthropoid, May 1942",
    text: "Reinhard Heydrich governs the Protectorate with terror for the elites and extra rations for the workers, and it is working. Two Czech soldiers trained in Britain are ready to parachute in. Even with Britain at peace, the exile government can still send them. Everyone knows what the reprisals will be.",
    when: (g) => between(g, 1942, 1944) && spy(g) && governorOf(g, "prot") === "Reinhard Heydrich",
    choices: [
      { label: "Authorize the operation", result: "If it succeeds, the Protectorate loses its most capable governor. Villages like Lidice will pay for it.", apply: (g) => { free(g, { kind: "assassinate", zone: "prot" }); g.reprisals += 2; } },
      { label: "Call it off", result: "London is relieved. Heydrich's quiet, efficient terror continues, and so does his career.", apply: (g) => { g.capital += 3; } },
    ],
  },
  {
    id: "vemork", title: "Heavy water",
    precedent: "Operations Grouse and Gunnerside, 1942–43; the Hydro ferry, 1944",
    text: "The Vemork plant in Telemark makes the heavy water a German reactor needs. A glider raid failed with every man lost. Norwegian commandos trained abroad say they can do it on skis. The other way is to sink the ferry that carries the stock, with its civilian passengers.",
    when: (g) => between(g, 1942, 1950) && spy(g) && !regionLost(g, "nor") && glob(g, GF.DEB) < 0.5,
    choices: [
      { label: "Send the commandos", result: "If they reach the plant, Germany's atomic program loses its moderator for years.", apply: (g) => free(g, { kind: "sabotage", region: "nor" }) },
      { label: "Sink the ferry", result: "Surer, and crueler: the stock goes to the bottom of Lake Tinn, and so do Norwegian passengers.", apply: (g) => { free(g, { kind: "sabotage", region: "nor" }); g.reprisals += 1; } },
      { label: "Leave it", result: "Germany keeps its heavy water. Whether that matters depends on its scientists.", apply: () => {} },
    ],
  },
  {
    id: "karski", title: "The courier's report",
    precedent: "Jan Karski's reports to London and Washington, 1942–43",
    text: "A courier has crossed Europe with eyewitness testimony from the ghetto and a transit camp. The killing is no longer rumor. The listeners in London and Washington believe him and doubt him at once. The networks that carried him will be exposed if the report is broadcast.",
    when: (g) => between(g, 1942, 1950),
    choices: [
      { label: "Broadcast it", result: "What could be hidden is now known everywhere. Neighbors understand what the empty streets mean, and the peoples marked for removal understand they are next.", apply: (g) => { free(g, { kind: "broadcast" }); } },
      { label: "Protect the couriers", result: "The networks survive. The silence holds a while longer, until the absences speak for themselves.", apply: (g) => { const m = mine(g) ?? "pol"; free(g, { kind: "protect", group: m }); } },
    ],
  },
  {
    id: "communists", title: "Whoever kills the most Germans",
    precedent: "Britain switches from Mihailović to Tito, 1943",
    text: "Your liaison officers report that the communists are doing most of the fighting while the nationalists wait. Arming them wins the war you are in and shapes the peace after it.",
    when: (g) => spy(g) && GROUPS.some((x) => x.comm >= 0.5 && groupR(g, x.id) >= 0.25),
    choices: [
      { label: "Arm whoever fights", result: "Western arms now reach communist bands too. Their rivals feel betrayed, and say so.", apply: (g) => { g.params.westPrag = Math.min(1, g.params.westPrag + 0.25); } },
      { label: "Only those who will be our friends after", result: "The arms go to nationalists. Communist movements look to Moscow alone, and infighting gets worse.", apply: (g) => { g.params.westPrag = Math.max(0, g.params.westPrag - 0.15); } },
    ],
  },
  {
    id: "moscow", title: "Moscow's offer",
    precedent: "The Home Army and the Red Army, 1944",
    text: "An emissary from beyond the Urals offers arms, radios and instructors. The price is unstated, and everyone knows it: Moscow arms only those it expects to control, and it crushed the Home Army's commanders once it no longer needed them.",
    when: (g) => { const m = mine(g); return !!m && GROUPS[GROUP_INDEX[m]].comm < 0.5 && glob(g, GF.K) >= 0.2; },
    choices: [
      { label: "Take the arms", result: "Soviet supply begins to arrive. London and Washington cool toward a movement that has chosen its patron.", apply: (g) => { const m = mine(g)!; bump(g, "su", m, 0.3); bump(g, "us", m, -0.1); bump(g, "uk", m, -0.1); } },
      { label: "Refuse", result: "You stay your own movement. The Western sponsors notice, a little.", apply: (g) => { const m = mine(g)!; bump(g, "uk", m, 0.05); bump(g, "us", m, 0.05); } },
    ],
  },
  {
    id: "warsaw", title: "The hour of the rising",
    precedent: "Operation Tempest and the Warsaw Uprising, 1944",
    text: "The underground army has waited for years, hiding arms and training officers for the day a liberator comes close. No liberator is coming. Some commanders argue that rising alone is suicide; others that waiting forever is surrender.",
    when: (g) => between(g, 1943, 1968) && (spy(g) || is(g, "pol")) && groupR(g, "pol") >= 0.2,
    choices: [
      { label: "Rise now", result: "The city rises. Without a liberator at the gates, the occupier can bring everything it has. Warsaw in 1944 lost about 150,000 to 200,000 civilians.", apply: (g) => { order(g, ["pol"], "rise"); g.reprisals += 3; } },
      { label: "Keep waiting", result: "The underground state survives, armed and intact, and waits for a day that may never come.", apply: (g) => order(g, ["pol"], "wait") },
    ],
  },
  {
    id: "volhynia", title: "Volhynia",
    precedent: "The Volhynian massacres, 1943",
    text: "In the villages of Volhynia, Ukrainian and Polish neighbors are killing each other. Nationalist bands burn Polish villages; Polish self-defense and reprisal units answer. Each massacre recruits for the other side.",
    when: (g) => between(g, 1942, 1960) && (spy(g) || is(g, "wuk", "pol")) && Math.max(groupR(g, "wuk"), groupR(g, "pol")) >= 0.15,
    choices: [
      { label: "Order a truce between the camps", result: "The killing slows where your orders reach. Fewer villages burn; some fighters call it treason.", apply: (g) => order(g, spy(g) ? ["wuk", "pol"] : [mine(g)!], "truce") },
      { label: "Let it run its course", result: "The land is cleared by fire. Both peoples arm faster, and against each other.", apply: () => {} },
    ],
  },
  {
    id: "defectors", title: "Police with rifles",
    precedent: "Ukrainian auxiliary police desert to the UPA, spring 1943",
    text: "Thousands of men the Germans armed as auxiliary police are ready to desert, with their rifles, if your movement will take them. Some of them took part in the occupier's worst crimes.",
    when: (g) => { const m = mine(g); return !!m && GROUPS[GROUP_INDEX[m]].collabP >= 0.4 && groupD(g, m) >= 0.55; },
    choices: [
      { label: "Take them in, with their weapons", result: "Trained men with rifles join overnight. Their pasts come with them.", apply: (g) => free(g, { kind: "train", group: mine(g)! }) },
      { label: "Turn them away", result: "Your movement stays clean, and smaller.", apply: () => {} },
    ],
  },
  {
    id: "churchwar", title: "The war on the churches",
    precedent: "Bormann: the churches' power 'must absolutely and finally be broken', 1941",
    text: "With the war won, Berlin has turned on the churches. Priests are arrested, monasteries closed, schools taken. Parishes that kept their heads down for years are angry, and they are everywhere.",
    when: (g) => glob(g, GF.CHURCH) > 0.05,
    choices: [
      { label: "Make the parishes your network", result: "Pulpits carry news; sacristies hide radios. Information spreads where the faithful are.", apply: (g) => addInfo(g, mine(g) ? homeRegions(mine(g)!).slice(0, 2) : ["pol", "svk", "hrv"], 0.2) },
      { label: "Stay out of it", result: "You keep the movement secular. The clergy fight their own war.", apply: () => {} },
    ],
  },
  {
    id: "gpo", title: "The settlers are coming",
    precedent: "The Zamość expulsions, 1942–43",
    text: "SS resettlement teams are emptying villages for German settlers: the able-bodied to labor camps, children taken for 'Germanization', the rest worse. At Zamość in 1942–43 about 110,000 Poles were driven out.",
    when: (g) => glob(g, GF.GPO) > 0.35 && (spy(g) || is(g, "pol", "bel", "wuk", "euk", "rus", "lit", "lat", "cze")),
    choices: [
      { label: "Fight for the villages", result: "The resettlement columns meet rifles. The SS answers with burning and deportation.", apply: (g) => { order(g, mine(g) ? [mine(g)!] : ["pol", "bel"], "rise"); g.reprisals += 2; } },
      { label: "Hide people in the forests", result: "Families vanish ahead of the columns. Fewer die in the open; the forests fill.", apply: (g) => { const m = mine(g) ?? "pol"; free(g, { kind: "protect", group: m }); order(g, [m], "wait"); } },
    ],
  },
  {
    id: "leader", title: "A leader emerges",
    precedent: "Tito, Kovpak, and many who did not survive",
    text: "Someone exceptional has risen at the head of your movement. Leaders like this are rare. Every security service in the occupation knows the name.",
    when: (g) => { const m = mine(g); return !!m && !!leaderOf(g, m); },
    choices: [
      { label: "Keep the leader hidden", result: "Safe houses, false papers, couriers instead of speeches. The leader lives to lead.", apply: (g) => free(g, { kind: "protect", group: mine(g)! }) },
      { label: "Put the leader at the head of the fighters", result: "The bands become an army. The leader becomes a target.", apply: (g) => free(g, { kind: "train", group: mine(g)! }) },
    ],
  },
  {
    id: "thaw", title: "A softer voice in Berlin",
    precedent: "Khrushchev's thaw, 1956; Gorbachev, 1985",
    text: "Berlin's new master speaks of order instead of struggle. Reprisals have eased; some prisoners have come home. Nobody knows whether this is weakness or a trap.",
    when: (g) => between(g, 1945, 1970) && !["Hitler", "Himmler", "Heydrich", "Bormann", "Goebbels"].includes(rulerName(g)) && glob(g, GF.BRUT) < 0.6,
    choices: [
      { label: "Strike and petition", result: "General strikes and open letters, not bombs. A regime that will not shoot crowds may have to concede.", apply: (g) => order(g, mine(g) ? [mine(g)!] : ["fre", "dut", "cze", "pol"], "nonviolent") },
      { label: "Press the attack", result: "Weakness is an opportunity. It may also convince Berlin's hardliners they were right.", apply: (g) => order(g, mine(g) ? [mine(g)!] : ["pol", "ser"], "rise") },
    ],
  },
  {
    id: "redarmy", title: "The Red Army stirs",
    precedent: "Partisan coordination with Operation Bagration, 1944",
    text: "Beyond the Urals the rebuilt Red Army is massing. Its liaison officers ask partisans in Belarus and Ukraine to rise together with its offensive.",
    when: (g) => glob(g, GF.K) > 0.65 && (spy(g) || is(g, "bel", "rus", "euk")),
    choices: [
      { label: "Rise with the offensive", result: "Rail lines cut across the east in a single night. If the offensive stalls, the partisans stand alone.", apply: (g) => { order(g, mine(g) ? [mine(g)!] : ["bel", "rus", "euk"], "rise"); g.reprisals += 1; } },
      { label: "Keep your distance", result: "You will not be Moscow's spearhead. Washington approves.", apply: (g) => { g.capital += 2; } },
    ],
  },
  {
    id: "ustase", title: "The envoy who looks away",
    precedent: "German generals protest Ustaše massacres, 1941–42",
    text: "The Ustaše are massacring Serbs across Croatia and Bosnia, and every massacre fills the partisan bands. German generals in the Balkans protest to Berlin. The German envoy to Zagreb backs the Ustaše whatever they do.",
    when: (g) => between(g, 1941, 1955) && (spy(g) || is(g, "ser", "cro", "bos")) && !regionLost(g, "hrv"),
    choices: [
      { label: "Kill the envoy", result: "If he dies, Berlin may send someone who listens to the generals. It will certainly send reprisals.", apply: (g) => { free(g, { kind: "assassinate", zone: "env" }); g.reprisals += 1; } },
      { label: "Document the massacres", result: "Photographs and testimony reach German officers and the world. Knowledge spreads through Croatia and Bosnia.", apply: (g) => addInfo(g, ["hrv", "bih"], 0.25) },
    ],
  },
  {
    id: "slovak", title: "The officers' plot",
    precedent: "The Slovak National Uprising, August 1944",
    text: "Officers of the Slovak army are planning to turn their units on the Germans. Their plan depends on the Red Army arriving in time. In 1944 it did not, and the rising was crushed in two months.",
    when: (g) => (spy(g) || is(g, "slk")) && glob(g, GF.K) >= 0.35 && !regionLost(g, "svk"),
    choices: [
      { label: "Back the plotters", result: "Arms and liaison officers go to the conspirators. Moscow is asked to help, and promises.", apply: (g) => { order(g, ["slk"], "rise"); bump(g, "su", "slk", 0.2); g.reprisals += 1; } },
      { label: "Tell them to wait", result: "The army stays in its barracks for now. The plot lives on in the officers' mess.", apply: (g) => order(g, ["slk"], "wait") },
    ],
  },
  {
    id: "bomb", title: "America has the bomb",
    precedent: "The Eisenhower years: covert action without open war",
    text: "The United States has tested an atomic bomb. Germany cannot match it yet. In Washington, some want covert operations to grow bolder; others fear that a crisis could become a war.",
    when: (g) => spy(g) && glob(g, GF.USB) > 0.5,
    choices: [
      { label: "Press for bolder covert action", result: "Your budget and your risks both grow. A crisis with Berlin is more likely.", apply: (g) => { g.params.us = Math.min(1, g.params.us + 0.1); } },
      { label: "Advise restraint", result: "Washington keeps covert help steady. Your standing for caution earns you a little more room.", apply: (g) => { g.capital += 2; } },
    ],
  },
  {
    id: "churchill", title: "Churchill returns",
    precedent: "Churchill's second government, 1951",
    text: "The old man is back in Downing Street, and he wants to know what the networks need. He will not risk war. Short of that, he will give a great deal.",
    when: (g) => spy(g) && year(g) === 1951 && g.params.uk > 0.1,
    choices: [
      { label: "Arms and money", result: "London opens its stores to your network this year.", apply: (g) => { g.capital += 5; } },
      { label: "Agents and radios", result: "Trained operators and transmitters go to Norway, Poland and France.", apply: (g) => addInfo(g, ["nor", "pol", "fra"], 0.2) },
    ],
  },
  {
    id: "transistors", title: "Radios in every pocket",
    precedent: "Radio Free Europe, from 1950; the transistor radio, from 1954",
    text: "Transistor radios are cheap enough to smuggle by the crate, and they can hear foreign stations in any kitchen. Where should the first crates go?",
    when: (g) => spy(g) && year(g) >= 1955,
    choices: [
      { label: "The East", result: "Poland, the Protectorate and Ukraine hear the outside world.", apply: (g) => addInfo(g, ["pol", "cze", "ukr"], 0.3) },
      { label: "The West", result: "France, the Netherlands and Belgium hear the outside world.", apply: (g) => addInfo(g, ["fra", "nld", "bel"], 0.3) },
    ],
  },
];
