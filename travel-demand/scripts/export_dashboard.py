"""Export de-identified dashboard data from data/travel.sqlite -> reports/dashboard/*.json.

No titles, ticket ids, aliases or pseudonymous keys leave the database: tickets get a
row number, and cross-ticket transitions ship only as an aggregate. When census ratings
exist (data/census, see scripts/census.py) each ticket also carries its census label.

Usage: python3 scripts/export_dashboard.py [data/travel.sqlite]
"""
import json, sqlite3, sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "reports" / "dashboard"
CHANNELS = ["answer", "agent_action", "intake_and_route", "agent_prep_human_decision", "human_investigation", "engineering_fix"]


def write(name, rows):
    (OUT / name).write_text(json.dumps(rows, separators=(",", ":"), ensure_ascii=False))
    print(f"{name}: {len(rows)} rows, {(OUT / name).stat().st_size / 1024:.0f} KB")


def main(db):
    OUT.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(db)
    t = pd.read_sql("select * from demand_ticket", con).sort_values("create_ts").reset_index(drop=True)
    ti = pd.read_sql("select x.ticket_id, x.intent_id, x.channel, x.channel_basis from ticket_intent x "
                     "join demand_ticket using(ticket_id)", con)
    order = {c: k for k, c in enumerate(CHANNELS)}
    hardest = ti.groupby("ticket_id").channel.agg(lambda s: max(s, key=order.get))

    t["create"] = pd.to_datetime(t.create_ts, utc=True, format="ISO8601")
    gap = t.groupby("requester_key").create.diff().dt.total_seconds() / 86400
    key = {tid: k for k, tid in enumerate(t.ticket_id)}
    tickets = pd.DataFrame({
        "k": t.index,
        "month": t.create_month,
        "week": (t.create.dt.tz_localize(None).dt.normalize() - pd.to_timedelta(t.create.dt.weekday, unit="D")).dt.strftime("%Y-%m-%d"),
        "region": t.region,
        "country": t.country,
        "origin": t.origin.where(t.origin.isin(["River", "SIM-T"]), "Other"),
        "resolution": t.resolution_type,
        "tier2plus": (t.support_tier >= 2).astype(int),
        "third_party": t.third_party.notna().astype(int),
        "days": t.days_to_last_conv.clip(lower=0).round(1),
        "repeat30": (gap <= 30).astype(int),
        "not_on_river": t.river_topic.fillna("").str.contains(r"not (?:listed|mentioned)? ?on river", case=False).astype(int),
        "channel": t.ticket_id.map(hardest),
        "n_intents": t.n_intents,
        # River menu topic the requester picked (template text, no personal data); free-text titles are not shipped.
        "topic": t.river_topic.where(t.title_is_template.astype(bool)).str.replace(r"\s+", " ", regex=True).str.strip().astype(object),
    })
    tickets["topic"] = tickets.topic.where(tickets.topic.notna(), None)
    census = ROOT / "data" / "census"
    if (census / "ratings.csv").exists():
        label = pd.read_csv(census / "ticket_signature.csv").merge(pd.read_csv(census / "ratings.csv")[["signature", "final"]], on="signature")
        tickets["census"] = t.ticket_id.map(label.set_index("ticket_id").final)
        assert tickets.census.notna().all(), "census ratings do not cover every demand ticket"
    else:
        tickets["census"] = None
    write("tickets.json", tickets.to_dict("records"))
    ti = ti.assign(k=ti.ticket_id.map(key)).drop(columns="ticket_id").rename(columns={"intent_id": "intent", "channel_basis": "basis"})
    write("ticket_intents.json", ti[["k", "intent", "channel", "basis"]].to_dict("records"))
    intents = pd.read_sql("select intent_id as intent, name, domain, faq_question, answer_class, best_channel, agent_capability from intent", con)
    cov = pd.read_csv(ROOT / "reports" / "11_faq_coverage.csv")[["intent_id", "coverage", "gap", "faq_titles", "faq_available_from"]]
    intents = intents.merge(cov.rename(columns={"intent_id": "intent"}), on="intent", how="left")
    write("intents.json", intents[intents.domain != "Excluded"].fillna("").to_dict("records"))
    tr = pd.read_csv(ROOT / "reports" / "05_requester_transitions_30d.csv")
    write("transitions.json", tr.to_dict("records"))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else ROOT / "data" / "travel.sqlite")
