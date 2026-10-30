/** Closed vocabularies of the exported data. Every categorical field is one of these literal unions. */
export const CHANNELS = ["answer", "agent_action", "intake_and_route", "agent_prep_human_decision", "human_investigation", "engineering_fix"] as const;
export type Channel = (typeof CHANNELS)[number];

export const RESOLUTIONS = ["knowledge", "account_fix", "defect", "fulfilment", "approval", "routing", "feedback", "other", "out_of_scope"] as const;
export type Resolution = (typeof RESOLUTIONS)[number];

export const ORIGINS = ["River", "SIM-T", "Other"] as const;
export type Origin = (typeof ORIGINS)[number];

export const REGIONS = ["AMER", "EMEA", "APAC", "LATAM"] as const;
export type Region = (typeof REGIONS)[number];

export const BASES = ["intent_default", "root_cause:knowledge", "root_cause:defect", "root_cause:account_fix", "root_cause:feedback"] as const;
export type Basis = (typeof BASES)[number];

export const COVERAGES = ["full", "partial", "none"] as const;
export type Coverage = (typeof COVERAGES)[number];

export const ANSWER_CLASSES = ["doc", "doc_then_form", "doc_then_human", "account", "report", "action"] as const;
export type AnswerClass = (typeof ANSWER_CLASSES)[number];

export const CENSUS_LABELS = ["fact_answer", "self_serve", "answer_then_action", "action", "defect", "feedback", "unclear"] as const;
export type CensusLabel = (typeof CENSUS_LABELS)[number];

/** `YYYY-MM` and `YYYY-MM-DD` strings, validated on load. */
export type Month = string & { readonly __brand: "Month" };
export type IsoDate = string & { readonly __brand: "IsoDate" };

export interface TicketRecord {
  readonly k: number;
  readonly month: Month;
  readonly week: IsoDate;
  readonly region: Region;
  readonly country: string;
  readonly origin: Origin;
  readonly resolution: Resolution;
  readonly tier2plus: boolean;
  readonly third_party: boolean;
  readonly days: number;
  readonly repeat30: boolean;
  readonly not_on_river: boolean;
  /** Channel of the ticket's hardest need. */
  readonly channel: Channel;
  readonly n_intents: number;
  /** River menu topic when the title was picked from the menu; free-text titles are never exported. */
  readonly topic: string | null;
  /** Answerability census label, when census ratings were exported. */
  readonly census: CensusLabel | null;
}

export interface TicketIntentRecord {
  readonly k: number;
  readonly intent: string;
  readonly channel: Channel;
  readonly basis: Basis;
}

export interface IntentRecord {
  readonly intent: string;
  readonly name: string;
  readonly domain: string;
  readonly faq_question: string;
  readonly answer_class: AnswerClass;
  readonly best_channel: Channel;
  readonly agent_capability: string | null;
  readonly coverage: Coverage | null;
  readonly gap: string;
  readonly faq_titles: string;
  readonly faq_available_from: Month | null;
}

export interface TransitionRecord {
  readonly from_intent: string;
  readonly next_intent_30d: string;
  readonly transitions: number;
  readonly same_intent: boolean;
}

export interface Neighbour {
  readonly intent: string;
  readonly sim: number;
}

export interface IntentSpaceRecord {
  readonly intent: string;
  readonly x: number;
  readonly y: number;
  readonly terms: readonly string[];
  readonly nearest: readonly Neighbour[];
}

export interface CensusSummary {
  readonly tickets: number;
  readonly signatures: number;
  readonly answerable: number;
  readonly answerable_share: number;
  readonly strict_answerable: number;
  readonly loose_answerable: number;
  readonly agreement_signatures: number;
  readonly agreement_tickets: number;
  readonly kappa: number;
  readonly adjudicated_signatures: number;
}

export interface Dataset {
  readonly tickets: readonly TicketRecord[];
  readonly ticketIntents: readonly TicketIntentRecord[];
  readonly intents: readonly IntentRecord[];
  readonly transitions: readonly TransitionRecord[];
  readonly space: readonly IntentSpaceRecord[];
  readonly census: CensusSummary | null;
}
