import { format, utcFormat, utcParse } from "d3";
import type { CensusLabel, Channel, Coverage, Month, Origin, Resolution } from "../domain/types";

export const fmtInt = format(",");
export const pct = format(".0%");
export const pct1 = format(".1%");
export const dec1 = format(".1f");
export const dec2 = format(".2f");

const parseMonth = utcParse("%Y-%m");
const monthFmt = utcFormat("%b %y");
export const monthDate = (m: Month): Date => parseMonth(m) ?? new Date(Number.NaN);
export const fmtMonth = (m: Month): string => monthFmt(monthDate(m));

export const CHANNEL_LABEL: Readonly<Record<Channel, string>> = {
  answer: "Answer from docs", agent_action: "Agent action", intake_and_route: "Agent intake & route",
  agent_prep_human_decision: "Agent preps, human decides", human_investigation: "Human investigation", engineering_fix: "Engineering fix",
};
export const RESOLUTION_LABEL: Readonly<Record<Resolution, string>> = {
  knowledge: "Knowledge", account_fix: "Account fix", defect: "Tool defect", fulfilment: "Fulfilment", approval: "Approval",
  routing: "Transfer", feedback: "Feedback", other: "Other", out_of_scope: "Out of scope",
};
export const ORIGIN_LABEL: Readonly<Record<Origin, string>> = { River: "River help menu", "SIM-T": "Direct in SIM", Other: "Email, Slack, templates" };
export const COVERAGE_LABEL: Readonly<Record<Coverage, string>> = { full: "Fully answered", partial: "Partly answered", none: "Not covered" };
export const CENSUS_LABEL: Readonly<Record<CensusLabel, string>> = {
  fact_answer: "Content fully answers it", self_serve: "Self-serve once told how", answer_then_action: "Question, then an action",
  action: "Staff or system action", defect: "Genuine fault", feedback: "Feedback or complaint", unclear: "Not enough information",
};
