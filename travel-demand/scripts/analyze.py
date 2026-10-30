"""Aggregate analyses over data/travel.sqlite -> reports/*.csv (no titles, aliases or ticket ids).

Usage: python3 scripts/analyze.py [data/travel.sqlite]
"""
import itertools, sqlite3, sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "reports"
FULL_MONTHS = [f"2026-{m:02d}" for m in range(1, 10)]  # Nov/Dec 2025 creations are partial (carry-over)
FIT = {"doc": "full", "doc_then_form": "partial", "doc_then_human": "partial", "account": "none", "report": "none"}


def pct(s, q):
    return s.quantile(q) if len(s) else None


def main(db):
    OUT.mkdir(exist_ok=True)
    con = sqlite3.connect(db)
    t = pd.read_sql("select * from ticket", con)
    for c in ("title_is_template", "non_ascii_title", "river_helpfinder", "qjump", "requester_is_staff"):
        t[c] = t[c].astype(bool)
    ti = pd.read_sql("select x.*, i.domain, i.name, i.answer_class from ticket_intent x join intent i using(intent_id)", con)
    intents = pd.read_sql("select * from intent", con)
    demand_ids = set(pd.read_sql("select ticket_id from demand_ticket", con).ticket_id)
    t["demand"] = t.ticket_id.isin(demand_ids)
    d = t[t.demand].copy()
    dti = ti[ti.ticket_id.isin(demand_ids)].merge(d, on="ticket_id")
    dti["fit"] = dti.answer_class.map(FIT)

    # Ticket-level Skywalker fit: full only if every intent is doc-answerable, or the resolver says it was a knowledge gap.
    rank = {"full": 0, "partial": 1, "none": 2}
    worst = dti.groupby("ticket_id").fit.agg(lambda s: max(s, key=rank.get))
    d["fit"] = d.ticket_id.map(worst)
    d.loc[d.resolution_type == "knowledge", "fit"] = "full"
    fit_basis = dti.groupby("ticket_id").fit.agg(lambda s: max(s, key=rank.get)).rename("intent_fit")

    # Requester history (pseudonymous): prior ticket by same requester within 7 / 30 days.
    d["create"] = pd.to_datetime(d.create_ts, utc=True, format="ISO8601")
    d = d.sort_values("create")
    d["prev_gap_days"] = d.groupby("requester_key").create.diff().dt.total_seconds() / 86400
    d["repeat_7d"] = d.prev_gap_days <= 7
    d["repeat_30d"] = d.prev_gap_days <= 30
    req_n = d.groupby("requester_key").size()
    d["requester_tickets"] = d.requester_key.map(req_n)
    first_intents = dti.groupby("ticket_id").intent_id.apply(set)
    d["intents"] = d.ticket_id.map(first_intents)
    prev_intents = d.groupby("requester_key").intents.shift()
    d["repeat_same_intent_30d"] = [isinstance(p, set) and bool(c & p) and r for p, c, r in zip(prev_intents, d.intents, d.repeat_30d)]
    dti = dti.merge(d[["ticket_id", "repeat_7d", "repeat_30d", "repeat_same_intent_30d", "requester_tickets"]], on="ticket_id")

    # 1. Coverage / disposition
    disp = pd.DataFrame([
        ("tickets in export (unique)", len(t)),
        ("monthly snapshot rows", int(t.n_snapshots.sum())),
        ("tickets reported in >1 month", int((t.n_snapshots > 1).sum())),
        ("excluded: internal/admin/test", int(t.ticket_id.isin(ti[ti.intent_id == "internal_admin"].ticket_id).sum())),
        ("excluded: no detail/duplicate root cause", int(((t.resolution_type == "junk") & ~t.ticket_id.isin(ti[ti.intent_id == "internal_admin"].ticket_id)).sum())),
        ("excluded: unclear / out of scope", int((~t.demand & ~t.ticket_id.isin(ti[ti.intent_id == "internal_admin"].ticket_id) & (t.resolution_type != "junk")).sum())),
        ("demand tickets", len(d)),
        ("demand tickets with River template title", int(d.title_is_template.sum())),
        ("demand ticket-intent rows", len(dti)),
        ("demand tickets with >1 intent", int((d.n_intents > 1).sum())),
        ("demand tickets filed by a support assignee", int(d.requester_is_staff.sum())),
        ("distinct requesters (pseudonymous)", d.requester_key.nunique()),
    ], columns=["measure", "value"])
    disp.to_csv(OUT / "00_coverage.csv", index=False)
    pd.crosstab(ti.source, ti.ticket_id.isin(demand_ids)).to_csv(OUT / "00_intent_source.csv")

    # 2. Intent demand + burden + fit (each intent counted independently; tickets overlap across intents)
    g = dti.groupby("intent_id")
    tab = pd.DataFrame({
        "tickets": g.ticket_id.nunique(),
        "share_of_demand_tickets": g.ticket_id.nunique() / len(d),
        "multi_intent_share": g.n_intents.apply(lambda s: (s > 1).mean()),
        "via_river_template": g.title_is_template.mean(),
        "origin_river": g.origin.apply(lambda s: (s == "River").mean()),
        "days_to_last_conv_p50": g.days_to_last_conv.median(),
        "days_to_last_conv_p90": g.days_to_last_conv.apply(lambda s: pct(s, .9)),
        "tier2plus_share": g.support_tier.apply(lambda s: (s >= 2).mean()),
        "third_party_share": g.third_party.apply(lambda s: s.notna().mean()),
        "multi_month_share": g.n_snapshots.apply(lambda s: (s > 1).mean()),
        "resolved_as_knowledge": g.resolution_type.apply(lambda s: (s == "knowledge").mean()),
        "resolved_as_account_fix": g.resolution_type.apply(lambda s: (s == "account_fix").mean()),
        "resolved_as_defect": g.resolution_type.apply(lambda s: (s == "defect").mean()),
        "resolved_as_fulfilment_or_approval": g.resolution_type.apply(lambda s: s.isin(["fulfilment", "approval"]).mean()),
        "routed_from_expense": g.resolution_type.apply(lambda s: (s == "routing").mean()),
        "repeat_requester_30d": g.repeat_30d.mean(),
        "repeat_same_intent_30d": g.repeat_same_intent_30d.mean(),
        "top_region": g.region.agg(lambda s: s.value_counts().index[0]),
        "top_region_share": g.region.agg(lambda s: s.value_counts(normalize=True).iloc[0]),
        "top_country": g.country.agg(lambda s: s.value_counts().index[0]),
        "top_country_share": g.country.agg(lambda s: s.value_counts(normalize=True).iloc[0]),
    }).reset_index().merge(intents, on="intent_id").sort_values("tickets", ascending=False)
    tab["skywalker_fit"] = tab.answer_class.map(FIT)
    tab["cum_share_of_intent_rows"] = tab.tickets.cumsum() / tab.tickets.sum()
    cols = ["intent_id", "name", "domain", "faq_question", "answer_class", "skywalker_fit", "tickets",
            "share_of_demand_tickets", "cum_share_of_intent_rows"] + [c for c in tab.columns if c not in
            ("intent_id", "name", "domain", "faq_question", "answer_class", "skywalker_fit", "tickets",
             "share_of_demand_tickets", "cum_share_of_intent_rows")]
    tab[cols].to_csv(OUT / "01_intents.csv", index=False, float_format="%.3f")

    # 3. Skywalker opportunity at ticket level
    opp = (d.groupby("fit").size().rename("tickets").to_frame()
           .assign(share=lambda x: x.tickets / x.tickets.sum()))
    opp["of_which_upgraded_by_knowledge_root_cause"] = d[d.resolution_type == "knowledge"].groupby("fit").size().reindex(opp.index).fillna(0).astype(int)
    opp.loc["full", "of_which_upgraded_by_knowledge_root_cause"] = int(((d.resolution_type == "knowledge") & (d.ticket_id.map(fit_basis) != "full")).sum())
    opp.to_csv(OUT / "02_skywalker_fit.csv", float_format="%.3f")
    pd.crosstab(dti.intent_id, dti.resolution_type).to_csv(OUT / "02_intent_x_resolution.csv")

    # 4. Monthly volume by intent (creation month; full months only for trend claims)
    m = dti.pivot_table(index="intent_id", columns="create_month", values="ticket_id", aggfunc="nunique", fill_value=0)
    m.to_csv(OUT / "03_intent_by_month.csv")
    full = m[[c for c in FULL_MONTHS if c in m.columns]]
    total = d[d.create_month.isin(FULL_MONTHS)].groupby("create_month").size()
    share = full / total
    spikes = []
    for intent, row in share.iterrows():
        if full.loc[intent].sum() < 30:
            continue
        for month in row.index:
            rest = row.drop(month)
            if row[month] > rest.mean() + 3 * rest.std() and full.loc[intent, month] >= 10:
                spikes.append((intent, month, int(full.loc[intent, month]), round(row[month], 3), round(rest.mean(), 3)))
    pd.DataFrame(spikes, columns=["intent_id", "month", "tickets", "share_that_month", "mean_share_other_months"]).to_csv(OUT / "03_spikes.csv", index=False)
    total.rename("demand_tickets").to_csv(OUT / "03_monthly_totals.csv")

    # 5. Within-ticket co-occurrence (distinct tickets; pairs are not ticket counts)
    sets = dti.groupby("ticket_id").intent_id.apply(lambda s: sorted(set(s)))
    n_a = dti.groupby("intent_id").ticket_id.nunique()
    pairs = pd.Series([p for s in sets for p in itertools.combinations(s, 2)]).value_counts()
    co = pd.DataFrame([(a, b, n) for (a, b), n in pairs.items()], columns=["a", "b", "support"])
    co["p_b_given_a"] = co.support / co.a.map(n_a)
    co["p_a_given_b"] = co.support / co.b.map(n_a)
    co["lift"] = co.p_b_given_a / (co.b.map(n_a) / len(d))
    co[co.support >= 5].sort_values("support", ascending=False).to_csv(OUT / "04_cooccurrence.csv", index=False, float_format="%.3f")

    # 6. Cross-ticket sequences: next intent by the same requester within 30 days
    seq = d[["requester_key", "create", "intents"]].copy()
    seq["next_intents"] = seq.groupby("requester_key").intents.shift(-1)
    seq["next_gap"] = (seq.groupby("requester_key").create.shift(-1) - seq.create).dt.total_seconds() / 86400
    seq = seq[seq.next_gap <= 30]
    trans = pd.Series([(a, b) for cur, nxt in zip(seq.intents, seq.next_intents) if isinstance(nxt, set) for a in cur for b in nxt]).value_counts()
    tr = pd.DataFrame([(a, b, n) for (a, b), n in trans.items()], columns=["from_intent", "next_intent_30d", "transitions"])
    tr["same_intent"] = tr.from_intent == tr.next_intent_30d
    tr[tr.transitions >= 3].to_csv(OUT / "05_requester_transitions_30d.csv", index=False)
    rep = pd.DataFrame([
        ("demand tickets", len(d)),
        ("requesters", d.requester_key.nunique()),
        ("requesters with >1 ticket", int((req_n > 1).sum())),
        ("tickets from requesters with >1 ticket", int(d.requester_tickets.gt(1).sum())),
        ("tickets preceded by same requester <=7d", int(d.repeat_7d.sum())),
        ("tickets preceded by same requester <=30d", int(d.repeat_30d.sum())),
        ("...of which share an intent with the prior ticket", int(d.repeat_same_intent_30d.sum())),
        ("tickets from requesters with >=10 tickets (likely arrangers/coordinators)", int(d.requester_tickets.ge(10).sum())),
    ], columns=["measure", "value"])
    rep.to_csv(OUT / "05_repeat_contact.csv", index=False)

    # 7. Geography: intents whose demand is concentrated in one country (site/jurisdiction-specific answers)
    geo = dti.pivot_table(index="intent_id", columns="region", values="ticket_id", aggfunc="nunique", fill_value=0)
    geo.to_csv(OUT / "06_intent_by_region.csv")
    country = dti.groupby(["intent_id", "country"]).ticket_id.nunique().rename("tickets").reset_index()
    country = country[country.tickets >= 5].sort_values(["intent_id", "tickets"], ascending=[True, False])
    country.to_csv(OUT / "06_intent_by_country.csv", index=False)

    # 8. River discoverability: requester picked a River topic that says "not listed / not on River"
    nl = d[d.river_topic.fillna("").str.contains(r"not (?:listed|mentioned)? ?on river|not listed on river", case=False)]
    pd.DataFrame([("tickets whose River topic says 'not on/listed on River'", len(nl)),
                  ("share of River-template demand tickets", round(len(nl) / max(d.title_is_template.sum(), 1), 3))],
                 columns=["measure", "value"]).to_csv(OUT / "07_river_not_listed.csv", index=False)
    rt = d[d.title_is_template].groupby("river_topic").agg(
        tickets=("ticket_id", "size"),
        resolved_as_knowledge=("resolution_type", lambda s: (s == "knowledge").mean()),
        resolved_as_account_fix=("resolution_type", lambda s: (s == "account_fix").mean()),
        resolved_as_defect=("resolution_type", lambda s: (s == "defect").mean()),
        days_p50=("days_to_last_conv", "median"),
    ).query("tickets >= 10").sort_values("tickets", ascending=False)
    rt.to_csv(OUT / "07_river_topics.csv", float_format="%.3f")

    # 9. Effort proxies by domain and origin
    eff = dti.groupby("domain").agg(intent_rows=("ticket_id", "size"), tickets=("ticket_id", "nunique"),
                                    days_p50=("days_to_last_conv", "median"),
                                    tier2plus=("support_tier", lambda s: (s >= 2).mean()),
                                    third_party=("third_party", lambda s: s.notna().mean())).sort_values("tickets", ascending=False)
    eff.to_csv(OUT / "08_domain_effort.csv", float_format="%.3f")
    pd.crosstab(d.origin, d.fit, margins=True).to_csv(OUT / "08_origin_x_fit.csv")
    pd.crosstab(d.error_per_ticket, d.resolution_type).to_csv(OUT / "08_error_per_ticket_x_resolution.csv")
    print(disp.to_string(index=False))
    print(opp.to_string())


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else ROOT / "data" / "travel.sqlite")
