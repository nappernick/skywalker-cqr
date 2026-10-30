"""Join intent demand with Skywalker FAQ coverage -> reports/11_*.csv.

Coverage judgments live in config/faq_coverage.csv (one row per intent, reviewed by hand
against every fragment of the corpus). The corpus file stays in data/ (not committed).

Usage: python3 scripts/faq_coverage.py [data/travel.sqlite] [data/corpus/skywalker_faq_corpus.jsonl]
"""
import json, sqlite3, sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "reports"


def main(db, corpus):
    con = sqlite3.connect(db)
    rows = pd.read_sql("select x.ticket_id, x.intent_id, x.channel, i.answer_class, d.create_ts from demand_ticket_intent x "
                       "join intent i using(intent_id) join demand_ticket d using(ticket_id)", con)
    rows["created"] = pd.to_datetime(rows.create_ts, utc=True, format="ISO8601")
    cov = pd.read_csv(ROOT / "config" / "faq_coverage.csv").fillna("")
    faqs = pd.DataFrame([json.loads(l) for l in open(corpus)])
    faqs["title"] = faqs.source_metadata.map(lambda m: m["title"].strip())
    faqs["topic"] = faqs.source_metadata.map(lambda m: (m.get("topics") or [""])[0])
    faqs["certified"] = pd.to_datetime(faqs.source_metadata.map(lambda m: m.get("system_certified-date")), utc=True)
    cert = faqs.set_index("fragment_id").certified
    missing = set(rows.intent_id) - set(cov.intent_id)
    assert not missing, f"intents without a coverage judgment: {missing}"

    # Earliest date any covering FAQ was certified: tickets after it were filed while an answer existed.
    cov["faq_available_from"] = cov.faq_fragment_ids.map(lambda s: min((cert[f] for f in s.split(";") if f), default=pd.NaT))
    rows = rows.merge(cov[["intent_id", "coverage", "faq_available_from"]], on="intent_id")
    rows["after_faq"] = rows.created >= rows.faq_available_from
    rows["answerable"] = rows.channel == "answer"
    rows["answer_first"] = (rows.channel != "answer") & rows.answer_class.str.startswith("doc_then")

    g = rows.groupby("intent_id")
    tab = pd.DataFrame({
        "tickets": g.ticket_id.nunique(),
        "answerable_tickets": g.apply(lambda x: x[x.answerable].ticket_id.nunique()),
        "answer_first_tickets": g.apply(lambda x: x[x.answer_first].ticket_id.nunique()),
        "tickets_after_faq": g.apply(lambda x: x[x.after_faq].ticket_id.nunique()),
        "answerable_after_faq": g.apply(lambda x: x[x.after_faq & x.answerable].ticket_id.nunique()),
    }).reset_index().merge(cov, on="intent_id")
    names = pd.read_sql("select intent_id, name, best_channel from intent", con)
    tab = tab.merge(names, on="intent_id").sort_values("tickets", ascending=False)
    tab["faq_available_from"] = tab.faq_available_from.dt.strftime("%Y-%m-%d")
    tab.to_csv(OUT / "11_faq_coverage.csv", index=False)

    # Demand-weighted coverage of the answerable set and the answer-first set.
    summ = []
    for label, mask in [("answerable needs", rows.answerable), ("answer-first needs", rows.answer_first), ("all needs", rows.intent_id.notna())]:
        sub = rows[mask]
        for c in ["full", "partial", "none"]:
            summ.append((label, c, int((sub.coverage == c).sum()), round((sub.coverage == c).mean(), 3)))
    pd.DataFrame(summ, columns=["set", "coverage", "intent_rows", "share"]).to_csv(OUT / "11_coverage_summary.csv", index=False)

    # Content backlog: gaps ranked by the documentation demand they would serve.
    gaps = tab[tab.coverage != "full"].assign(doc_demand=lambda x: x.answerable_tickets + x.answer_first_tickets)
    gaps = gaps[gaps.doc_demand > 0].sort_values("doc_demand", ascending=False)
    gaps[["intent_id", "name", "coverage", "doc_demand", "answerable_tickets", "answer_first_tickets", "tickets", "gap", "faq_titles"]] \
        .to_csv(OUT / "11_gap_backlog.csv", index=False)

    # Covered but still filed: full coverage, tickets after the FAQ was certified.
    found = tab[(tab.coverage == "full") & (tab.tickets_after_faq > 0)].sort_values("tickets_after_faq", ascending=False)
    found[["intent_id", "name", "faq_available_from", "tickets_after_faq", "answerable_after_faq", "best_channel", "faq_titles"]] \
        .to_csv(OUT / "11_covered_but_filed.csv", index=False)

    # FAQ usage: travel demand each fragment answers (intents can share fragments; tickets overlap).
    use = []
    for _, f in faqs.iterrows():
        ints = cov[cov.faq_fragment_ids.str.contains(f.fragment_id, regex=False)].intent_id.tolist()
        sub = rows[rows.intent_id.isin(ints)]
        use.append((f.title, f.topic, f.certified.strftime("%Y-%m-%d") if pd.notna(f.certified) else "", len(ints),
                    sub.ticket_id.nunique(), sub[sub.answerable].ticket_id.nunique(), ";".join(ints)))
    pd.DataFrame(use, columns=["faq_title", "topic", "certified", "intents", "tickets", "answerable_tickets", "intent_ids"]) \
        .sort_values(["tickets", "topic"], ascending=[False, True]).to_csv(OUT / "11_faq_usage.csv", index=False)

    print(pd.DataFrame(summ, columns=["set", "coverage", "intent_rows", "share"]).to_string(index=False))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else ROOT / "data" / "travel.sqlite",
         sys.argv[2] if len(sys.argv) > 2 else ROOT / "data" / "corpus" / "skywalker_faq_corpus.jsonl")
