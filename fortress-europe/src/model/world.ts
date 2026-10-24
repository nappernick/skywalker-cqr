/**
 * The world outside German Europe follows history. Each government's willingness to back European
 * resistance is a multiplier on the sponsor's slider, set from that government's known record.
 */
export interface Government {
  from: number;
  to: number;
  name: string;
  /** Multiplier on covert support. */
  mult: number;
  note: string;
}

export const US_GOVS: Government[] = [
  { from: 1941, to: 1945, name: "Roosevelt", mult: 1, note: "Aid short of war, as with Lend-Lease." },
  { from: 1945, to: 1953, name: "Truman", mult: 1.1, note: "Creates a peacetime intelligence service in 1947 and backs covert action." },
  { from: 1953, to: 1961, name: "Eisenhower", mult: 1.3, note: "Relies heavily on covert action but refuses open intervention, as in Hungary in 1956." },
  { from: 1961, to: 1963, name: "Kennedy", mult: 1.2, note: "Favors counterinsurgency and covert operations." },
  { from: 1963, to: 1969, name: "Johnson", mult: 1, note: "Attention pulled elsewhere." },
  { from: 1969, to: 1971, name: "Nixon", mult: 0.8, note: "Pursues détente with rival powers." },
];

/** Britain after a 1940 compromise peace: the peace government first, then the post-war field of leaders. */
export const UK_GOVS: Government[] = [
  { from: 1941, to: 1945, name: "Halifax", mult: 0.4, note: "The peace government restrains clandestine operations so as not to give Germany a reason for war." },
  { from: 1945, to: 1951, name: "Attlee", mult: 0.6, note: "A Labour government focused on recovery at home, wary but anti-fascist." },
  { from: 1951, to: 1955, name: "Churchill", mult: 1.1, note: "Returns to office and is far more willing to quietly arm resistance." },
  { from: 1955, to: 1957, name: "Eden", mult: 0.9, note: "Interventionist instincts, chastened by crisis." },
  { from: 1957, to: 1964, name: "Macmillan and Douglas-Home", mult: 0.7, note: "Managing decline and keeping the peace." },
  { from: 1964, to: 1971, name: "Wilson", mult: 0.6, note: "Shrinking commitments abroad." },
];

/** Leaders of the Soviet rump state, if it survives. */
export const SU_GOVS: Government[] = [
  { from: 1941, to: 1953, name: "Stalin", mult: 1, note: "Arms only partisans he expects to control." },
  { from: 1953, to: 1964, name: "Khrushchev", mult: 1.15, note: "More adventurous in backing national liberation movements." },
  { from: 1964, to: 1971, name: "Brezhnev", mult: 0.9, note: "Cautious and conservative." },
];

export const govAt = (list: Government[], y: number): Government => list.find((g) => y >= g.from && y < g.to) ?? list[list.length - 1];
