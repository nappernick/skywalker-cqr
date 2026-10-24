// Calibration targets. 1941–45 is the only period with real data, so every group with a historical record gets a
// "by 1945" target, adjusted for how this scenario differs from history. A target is never lowered because the model
// produces less; every adjustment states the scenario difference behind it.

export type Range = [number, number];

/** Share of runs in which Germany still holds Europe (hegemony or fraying) in 1970, per preset. */
export const HOLD_TARGETS: Record<string, Range> = {
  historical: [0.45, 0.65], pragmatic: [0.88, 1], isolated: [0.93, 1], coldwar: [0, 0.3],
};

/**
 * Historical preset, share of runs in which a group is a major force (armed strength 0.5 or more in any region):
 * - by1945: at some point from 1941 to 1945;
 * - in1950: in 1950, among runs where the regime is still standing;
 * - ever: at any point to 1970.
 */
export interface GroupTarget { by1945?: Range; in1950?: Range; ever?: Range; why: string }

const QUIET = "Flat, densely garrisoned country. Resistance meant strikes, hiding people and intelligence, not armed bands.";
const BALTIC = "Under German rule the Baltic resistance was mostly passive; the forest brothers' war was against the returning Soviets after 1944.";
const ALLY = "Romania, Bulgaria and Finland left the war in 1944 and Hungary tried to, each as the Red Army reached it. Here a Soviet rump that reaches their borders is rare.";

export const GROUP_TARGETS: Record<string, GroupTarget> = {
  ser: { by1945: [0.8, 0.95], in1950: [0.25, 0.5],
    why: "About 81,000 Partisans by late 1941, mostly Serbs, plus the Chetniks, armed from the occupiers' own stocks until British supply arrived in 1944. The trigger (the Ustaše massacres and the summer 1941 rising) happens here too. Germany retook the Užice republic in November 1941; with no other front it has far more divisions for the Balkans, so staying power is below history's." },
  mon: { by1945: [0.6, 0.9], in1950: [0.1, 0.35],
    why: "The July 1941 rising against Italy put tens of thousands under arms within weeks in Europe's wildest terrain. It was broken in the open within months and the survivors went to Bosnia. A Reich with no other front can garrison the mountains longer." },
  gre: { by1945: [0.2, 0.45],
    why: "ELAS reached tens of thousands by 1944, but much of its arms came from the Italian capitulation in September 1943 and from British drops. Neither happens here: Italy stays in, and the peace mutes the SOE." },
  bel: { by1945: [0.3, 0.55],
    why: "Soviet partisans held about 60% of Belarus by the end of 1943, with Soviet supply and an approaching front. Here the Soviet rump survives in only half the runs and never brings the front back." },
  rus: { by1945: [0.2, 0.45],
    why: "Soviet-loyal partisans in the occupied west depended on supply and orders from Moscow. Here the rump survives in only half the runs." },
  euk: { by1945: [0.1, 0.3],
    why: "Soviet partisans in eastern Ukraine were weaker than in Belarus: open steppe, less forest. The same discount for a rump that survives in half the runs." },
  wuk: { by1945: [0.15, 0.4], ever: [0.15, 0.4],
    why: "The UPA had no outside aid. It armed itself from its enemies and from defecting auxiliary police, and reached 25,000–40,000 fighters by 1944 (German intelligence claimed 200,000). It fought the Soviets until 1949 and its underground until 1954. The police defections and the war with the Poles in Volhynia happen here too." },
  pol: { by1945: [0.1, 0.3],
    why: "The Home Army was huge but waited for a liberator before rising; the Warsaw Uprising came with the Red Army on the Vistula. No front approaches here, so the general rising mostly does not come." },
  slv: { by1945: [0.15, 0.4],
    why: "The Liberation Front fought from 1941 in rough country, but grew most after Italy's capitulation in 1943, which does not happen here." },
  alb: { by1945: [0.1, 0.3],
    why: "The Albanian Partisans and the Balli Kombëtar grew mainly after Italy's 1943 capitulation, which does not happen here." },
  cro: { by1945: [0.05, 0.15],
    why: "Croats were 21.5% of Partisans in Croatia in late 1941 and 34% by September 1943, and became the majority only in October 1943, after Italy capitulated. With no Allied invasion of Italy, that flood does not happen here." },
  bos: { by1945: [0.03, 0.15],
    why: "Bosnian Muslims drifted to the Partisans late, after Chetnik massacres and disillusion with the Ustaše, mostly from 1943." },
  mac: { by1945: [0.03, 0.15],
    why: "Macedonian Partisans grew in 1943–44, as Bulgarization bred resentment and Bulgaria began to waver." },
  fre: { by1945: [0.03, 0.15],
    why: "The maquis grew in 1943–44 on draft evasion from forced labor, Allied supply and the coming landing. The draft evasion happens here; British supply and the landing do not." },
  nor: { by1945: [0, 0.05], ever: [0.03, 0.15],
    why: "Milorg reached about 40,000 men by 1945 but never fought as an army or held ground." },
  cze: { by1945: [0, 0.05], ever: [0.02, 0.12],
    why: "Czech armed resistance stayed small after the Heydrich reprisals; the Prague uprising came only in May 1945, with the war already lost." },
  dut: { by1945: [0, 0.05], ever: [0, 0.05], why: QUIET },
  dan: { by1945: [0, 0.05], ever: [0, 0.05], why: QUIET },
  fle: { by1945: [0, 0.05], ever: [0, 0.05], why: QUIET },
  lux: { by1945: [0, 0.05], ever: [0, 0.05], why: "Annexed and conscripted. Its answer was the 1942 general strike, not armed bands." },
  als: { by1945: [0, 0.05], ever: [0, 0.05], why: "Annexed and conscripted. The malgré-nous served against their will; there was no armed rising." },
  wal: { by1945: [0, 0.08], ever: [0.02, 0.1], why: "The Walloon industrial basin had a communist armed underground, small and urban." },
  slk: { by1945: [0.03, 0.15], ever: [0.05, 0.2],
    why: "The 1944 uprising was mostly an army defection: 18,000 soldiers rising to 47,000–60,000, against 2,000–18,000 partisans. It came right after Romania switched sides and was planned around the Soviet advance. In most runs of this scenario no Red Army is coming." },
  lit: { by1945: [0, 0.1], ever: [0.05, 0.25], why: BALTIC },
  lat: { by1945: [0, 0.1], ever: [0.05, 0.25], why: BALTIC },
  est: { by1945: [0, 0.1], ever: [0.05, 0.25], why: BALTIC },
  ita: { by1945: [0, 0.05], ever: [0.05, 0.3],
    why: "Italian armed resistance began after the 1943 armistice and the German occupation. With no Allied invasion, Italy stays in the war." },
  hun: { by1945: [0, 0.1], ever: [0.05, 0.3], why: ALLY },
  rom: { by1945: [0, 0.1], ever: [0.05, 0.3], why: ALLY },
  bul: { by1945: [0, 0.1], ever: [0.05, 0.3], why: ALLY },
  fin: { by1945: [0, 0.1], ever: [0.05, 0.3], why: ALLY },
};

/** Share of historical runs in which each region is lost. Norway's resistance never held territory; the Low Countries had no terrain to try. */
export const REGION_TARGETS: Record<string, Range> = {
  nor: [0, 0.2], den: [0, 0.05], nld: [0, 0.05], bel: [0, 0.05], lux: [0, 0.05],
};
