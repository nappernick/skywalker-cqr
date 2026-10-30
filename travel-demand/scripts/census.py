"""Answerability census: prepare rating batches, then aggregate the ratings -> reports/14_*.csv + reports/dashboard/census.json.

  python3 scripts/census.py prepare   # data/census/{signatures,ticket_signature}.csv + data/census/batches/*.txt
  python3 scripts/census.py report    # needs data/census/ratings.csv (columns: signature, tickets, rater_a, rater_b, adjudicated, final)

A signature is a set of tickets with identical rater-visible metadata (normalised title, CTI item, root cause, labels),
so one rating per signature rates every ticket. The rubric is config/census_rubric.md.
Reports are aggregate only: no titles, ticket ids or signatures leave data/.
"""
import json, re, sqlite3, sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "census"
OUT = ROOT / "reports"
LABELS = ["fact_answer", "self_serve", "answer_then_action", "action", "defect", "feedback", "unclear"]
ANSWERABLE = {"fact_answer", "self_serve"}
KEYS = ["title_norm", "item", "root_cause", "labels"]
BATCHES = 36


def norm_title(s):
    return re.sub(r"\s+", " ", re.sub(r"\d{4,}", "#", (s or "").lower())).strip()


def demand(con):
    t = pd.read_sql("select ticket_id, title_text, title_is_template, item, labels, root_cause from demand_ticket", con)
    for k in ["item", "labels", "root_cause"]:
        t[k] = t[k].fillna("")
    t["title_norm"] = t.title_text.map(norm_title)
    return t


def prepare(con):
    t = demand(con)
    sig = (t.groupby(KEYS).agg(title=("title_text", "first"), menu=("title_is_template", "max"), tickets=("ticket_id", "size"))
           .reset_index().sort_values(["item", "title_norm"]).reset_index(drop=True))
    sig["signature"] = [f"g{i:04d}" for i in range(len(sig))]
    DATA.mkdir(parents=True, exist_ok=True)
    t.merge(sig[KEYS + ["signature"]], on=KEYS)[["ticket_id", "signature"]].to_csv(DATA / "ticket_signature.csv", index=False)
    sig.drop(columns="title_norm").to_csv(DATA / "signatures.csv", index=False)
    (DATA / "batches").mkdir(exist_ok=True)
    for b, idx in enumerate(np.array_split(np.arange(len(sig)), BATCHES)):
        lines = [f"{r.signature} | item: {r.item} | root cause: {r.root_cause or '-'} | labels: {r.labels or '-'} | "
                 f"{'menu-picked' if r.menu else 'free text'} | title: {str(r.title).replace(chr(10), ' ')[:200]}" for r in sig.iloc[idx].itertuples()]
        (DATA / "batches" / f"b{b:02d}.txt").write_text("\n".join(lines) + "\n")
    print(f"{len(t)} tickets -> {len(sig)} signatures in {BATCHES} batches under {DATA}")


def kappa(a, b):
    a, b = pd.Series(a).reset_index(drop=True), pd.Series(b).reset_index(drop=True)
    po = (a == b).mean()
    pa, pb = a.value_counts(normalize=True), b.value_counts(normalize=True)
    pe = sum(pa.get(k, 0) * pb.get(k, 0) for k in set(pa.index) | set(pb.index))
    return (po - pe) / (1 - pe) if pe < 1 else 1.0


def report(con):
    r = pd.read_csv(DATA / "ratings.csv", keep_default_na=False)
    ts = pd.read_csv(DATA / "ticket_signature.csv")
    for c in ["rater_a", "rater_b", "final"]:
        bad = set(r[c]) - set(LABELS)
        assert not bad, f"unknown labels in {c}: {bad}"
    t = ts.merge(r[["signature", "final"]], on="signature", how="left")
    assert t.final.notna().all(), "tickets without a rating"
    meta = pd.read_sql("""select d.ticket_id, coalesce(rc.resolution_type, 'other') as resolution_type,
                            min(case when x.channel = 'answer' then 1 else 0 end) as classifier_all_answer
                          from demand_ticket d left join root_cause rc using(root_cause)
                          join ticket_intent x using(ticket_id) group by d.ticket_id""", con)
    t = t.merge(meta, on="ticket_id")
    n = len(t)
    t["answerable"] = t.final.isin(ANSWERABLE)

    lab = t.final.value_counts().reindex(LABELS, fill_value=0)
    pd.DataFrame({"label": lab.index, "tickets": lab.values, "share": (lab.values / n).round(4)}).to_csv(OUT / "14_census_labels.csv", index=False)

    w = r.tickets
    agree = r.rater_a == r.rater_b
    both = r.rater_a.isin(ANSWERABLE) & r.rater_b.isin(ANSWERABLE)
    either = r.rater_a.isin(ANSWERABLE) | r.rater_b.isin(ANSWERABLE)
    summary = {
        "tickets": int(n), "signatures": int(len(r)),
        "answerable": int(t.answerable.sum()), "answerable_share": round(float(t.answerable.mean()), 4),
        "strict_answerable": int(w[both].sum()), "loose_answerable": int(w[either].sum()),
        "agreement_signatures": round(float(agree.mean()), 4),
        "agreement_tickets": round(float(w[agree].sum() / w.sum()), 4),
        "kappa": round(float(kappa(r.rater_a, r.rater_b)), 4),
        "adjudicated_signatures": int((r.adjudicated != "").sum()),
    }
    pd.DataFrame(list(summary.items()), columns=["measure", "value"]).to_csv(OUT / "14_census_agreement.csv", index=False)

    pd.crosstab(t.resolution_type, t.final).reindex(columns=LABELS, fill_value=0).to_csv(OUT / "14_census_by_resolution.csv")
    vs = pd.crosstab(t.answerable.map({True: "census answerable", False: "census not answerable"}),
                     t.classifier_all_answer.map({1: "classifier answerable", 0: "classifier not answerable"}))
    vs.to_csv(OUT / "14_census_vs_classifier.csv")

    ti = pd.read_sql("select x.ticket_id, x.intent_id, i.name from ticket_intent x join intent i using(intent_id) join demand_ticket using(ticket_id)", con)
    ti = ti.merge(t[["ticket_id", "answerable", "final"]], on="ticket_id")
    by = ti.groupby(["intent_id", "name"]).agg(tickets=("ticket_id", "nunique"), census_answerable=("answerable", "mean"),
                                              answer_then_action=("final", lambda s: (s == "answer_then_action").mean())).round(3)
    by.sort_values("tickets", ascending=False).to_csv(OUT / "14_census_by_intent.csv")

    (OUT / "dashboard").mkdir(parents=True, exist_ok=True)
    (OUT / "dashboard" / "census.json").write_text(json.dumps(summary, separators=(",", ":")))
    print(json.dumps(summary, indent=1))


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "report"
    con = sqlite3.connect(sys.argv[2] if len(sys.argv) > 2 else ROOT / "data" / "travel.sqlite")
    {"prepare": prepare, "report": report}[cmd](con)
