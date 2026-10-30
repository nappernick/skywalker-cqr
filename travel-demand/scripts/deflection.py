"""Ticket-level deflection estimate for a Skywalker Slack app -> reports/13_*.csv.

Inputs:
  config/skywalker_plan.json - per-intent rates and fragment plan (from the reviewed multi-agent assessment)
  data/travel.sqlite         - demand tickets and their needs (ticket x intent rows with channel)

Capability tiers (each includes the previous):
  T1 today      answer needs contained at today_answer_containment (existing 104 fragments)
  T2 +fragments answer needs contained at new_answer_containment (minimum new/revised fragments in place)
  T3 +self-serve non-answer needs the employee completes themselves after Skywalker explains how (self_serve_share)
  T4 +actions   remaining non-answer needs completed end-to-end by Slack-app integrations (slack_action_share)
A ticket leaves the queue only if every one of its needs is handled: P(ticket) = product over its needs (independence).
Adoption (share of would-be tickets where the employee asks Skywalker first) is applied on top: 50%, 70%, 90%.

Usage: python3 scripts/deflection.py
"""
import json, sqlite3
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "reports"
ADOPTION = [0.5, 0.7, 0.9]
FULL_2026 = [f"2026-{m:02d}" for m in range(1, 10)]
TIERS = ["T1_today", "T2_fragments", "T3_self_serve", "T4_actions"]


def need_prob(row, r, tier):
    answer = row.channel == "answer"
    if tier == "T1_today":
        return r["today_answer_containment"] if answer else 0.0
    a = r["new_answer_containment"]
    if answer:
        return a
    if tier == "T2_fragments":
        return 0.0
    s = r["self_serve_share"]
    if tier == "T3_self_serve":
        return s
    return s + (1 - s) * r["slack_action_share"]


def main():
    plan = json.loads((ROOT / "config" / "skywalker_plan.json").read_text())
    rates = {r["intent_id"]: r for r in plan["records"]}
    con = sqlite3.connect(ROOT / "data" / "travel.sqlite")
    rows = pd.read_sql("select x.ticket_id, x.intent_id, x.channel, d.create_month from ticket_intent x join demand_ticket d using(ticket_id)", con)
    missing = set(rows.intent_id) - set(rates)
    assert not missing, f"no rates for {missing}"
    n_tickets = rows.ticket_id.nunique()
    per_year = rows[rows.create_month.isin(FULL_2026)].ticket_id.nunique() * 12 / 9

    for tier in TIERS:
        rows[tier] = [need_prob(x, rates[x.intent_id], tier) for x in rows.itertuples()]
    tick = rows.groupby("ticket_id")[TIERS].prod()  # all needs on a ticket must be handled

    summ = []
    for tier in TIERS:
        cap = tick[tier].mean()
        for a in ADOPTION:
            summ.append({"tier": tier, "adoption": a, "share_of_tickets_removed": round(cap * a, 4),
                         "tickets_removed_in_export": round(cap * a * n_tickets), "tickets_removed_per_year": round(cap * a * per_year)})
        summ.append({"tier": tier, "adoption": 1.0, "share_of_tickets_removed": round(cap, 4),
                     "tickets_removed_in_export": round(cap * n_tickets), "tickets_removed_per_year": round(cap * per_year)})
    pd.DataFrame(summ).to_csv(OUT / "13_deflection_summary.csv", index=False)

    # Where the removable tickets come from (attribute each ticket's probability equally to its intents).
    attr = rows.merge(tick.rename(columns=lambda c: f"{c}_ticket"), left_on="ticket_id", right_index=True)
    k = attr.groupby("ticket_id").intent_id.transform("count")
    by = attr.assign(**{t: attr[f"{t}_ticket"] / k for t in TIERS}).groupby("intent_id")[TIERS].sum().round(1)
    meta = pd.read_sql("select intent_id, name, domain from intent", con).set_index("intent_id")
    by = by.join(meta).join(rows.groupby("intent_id").ticket_id.nunique().rename("tickets"))
    for f in ["today_answer_containment", "new_answer_containment", "self_serve_share", "slack_action_share", "ticket_is_fulfilment_vehicle", "coverage_confirmed"]:
        by[f] = by.index.map(lambda i: rates[i][f])
    by.sort_values("T4_actions", ascending=False).to_csv(OUT / "13_deflection_by_intent.csv")
    print(pd.DataFrame(summ).to_string(index=False))
    print(f"\ndemand tickets {n_tickets}; per-year volume {per_year:.0f}")


if __name__ == "__main__":
    main()
