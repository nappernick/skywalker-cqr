"""Build the de-identified travel-ticket database from the raw SIM export.

Usage: python3 scripts/build.py <tickets.xlsx> [data/travel.sqlite]

Requester and assignee aliases are replaced with keyed HMAC pseudonyms
(key in data/hmac.key, or SKYWALKER_HMAC_KEY); raw aliases never reach disk.
"""
import csv, hashlib, hmac, os, re, secrets, sqlite3, sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
CFG = ROOT / "config"
SEP = "|"
# aliases that are also ordinary title vocabulary (vendor names, words) are not scrubbed
ALIAS_IS_WORD = {"river", "sixt", "self", "other", "vir"}


def hmac_key(data_dir):
    if os.environ.get("SKYWALKER_HMAC_KEY"):
        return os.environ["SKYWALKER_HMAC_KEY"].encode()
    path = data_dir / "hmac.key"
    if not path.exists():
        path.write_text(secrets.token_hex(32))
        path.chmod(0o600)
    return path.read_text().strip().encode()


def fix_mojibake(s):
    try:
        return s.encode("cp1252").decode("utf8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return s


def load_rules():
    with open(CFG / "text_rules.tsv") as f:
        text = [(r["intent_id"], int(r["tier"]), re.compile(r["pattern"], re.I),
                 re.compile(r["unless"], re.I) if r["unless"] else None)
                for r in csv.DictReader(f, delimiter="\t")]
    with open(CFG / "label_rules.tsv") as f:
        labels = {r["label"].strip(): r["intent_id"] for r in csv.DictReader(f, delimiter="\t")}
    intents = pd.read_csv(CFG / "intents.csv")
    roots = pd.read_csv(CFG / "root_causes.csv")
    roots["root_cause"] = roots.root_cause.str.strip()
    assert roots.root_cause.is_unique, "duplicate root causes"
    known = set(intents.intent_id)
    bad = ({i for i, *_ in text} | set(labels.values()) | set(roots.fallback_intent)) - known
    assert not bad, f"rules reference unknown intents: {bad}"
    return text, labels, intents, roots


def parse_title(title, aliases):
    """Split 'Location | Topic | alias' templates; strip aliases from the rest."""
    t = fix_mojibake(title)
    parts = [p.strip() for p in t.split(SEP)]
    if len(parts) >= 3:
        location, topic, body = parts[0], parts[1], " | ".join(parts[2:-1])
    else:
        location, topic, body = None, None, t
    text = " | ".join(p for p in (topic, body) if p)
    text = re.sub(r"[\w.-]+@?", lambda m: "[alias]" if m.group().rstrip("@").lower() in aliases else m.group(), text)
    return location or None, topic or None, re.sub(r"\s+", " ", text).strip()


def assign_intents(text, labels, rules, label_rules, fallback):
    """All matching specific rules fire; generic tiers only when nothing specific matched."""
    fires = lambda rx, unless: rx.search(text) and not (unless and unless.search(text))
    hits = {}
    for intent, tier, rx, unless in rules:
        if tier == 1 and fires(rx, unless):
            hits.setdefault(intent, "text")
    if "internal_admin" in hits:
        return {"internal_admin": "text"}
    for lab in labels:
        if lab in label_rules:
            hits.setdefault(label_rules[lab], "label")
    for generic_tier in (2, 3):
        if hits:
            break
        for intent, tier, rx, unless in rules:
            if tier == generic_tier and fires(rx, unless):
                hits[intent] = "text_generic"  # generic tiers: first match only (vague title, not several needs)
                break
    return hits or {fallback: "root_cause"}


def main(xlsx, db_path):
    db_path = Path(db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    key = hmac_key(db_path.parent)
    pseudo = lambda a: None if pd.isna(a) else hmac.new(key, a.strip().lower().encode(), hashlib.sha256).hexdigest()[:16]
    rules, label_rules, intents, roots = load_rules()

    raw = pd.read_excel(xlsx, dtype=str)
    for c in ["CreateDate", "LastUpdatedDate", "LastUpdatedConversationDate", "Month"]:
        raw[c] = pd.to_datetime(raw[c], format="mixed", utc=True)
    raw["RootCause"] = raw.RootCause.str.strip()
    raw["Labels"] = raw.Labels.fillna("")
    aliases = {a.lower() for a in set(raw.RequesterIdentity.dropna()) | set(raw.AssigneeIdentity.dropna())
               if len(a) >= 3} - ALIAS_IS_WORD
    staff = set(raw.AssigneeIdentity.dropna())

    snap = raw.sort_values(["ShortId", "Month", "LastUpdatedDate"]).copy()
    snap["snapshot_seq"] = snap.groupby("ShortId").cumcount() + 1
    t = snap.groupby("ShortId").tail(1).copy()
    t["n_snapshots"] = snap.groupby("ShortId").size().reindex(t.ShortId).values
    t["first_status"] = snap.groupby("ShortId").Status.first().reindex(t.ShortId).values

    rc = roots.set_index("root_cause")
    unknown_rc = set(t.RootCause) - set(rc.index)
    assert not unknown_rc, f"unmapped root causes: {unknown_rc}"

    tickets, ti_rows, tag_rows, label_rows = [], [], [], []
    for r in t.itertuples(index=False):
        loc, topic, text = parse_title(r.Title, aliases)
        tags = [x.strip() for x in (r.Tags or "").split(",") if x.strip()]
        labels = [x.strip() for x in r.Labels.split(",") if x.strip()]
        lv = [int(m.group(1)) for x in tags if (m := re.fullmatch(r"lvl(\d)", x, re.I))]
        wf = next((x[len("River-wfss-"):] for x in tags if x.startswith("River-wfss-")), None)
        tp = sorted({x.lower()[2:] for x in tags if re.fullmatch(r"3p\w+", x, re.I)})
        hits = assign_intents(text, labels, rules, label_rules, rc.loc[r.RootCause, "fallback_intent"])
        tickets.append(dict(
            ticket_id=r.ShortId, region=r.Region, country=r.Country, title_location=loc,
            river_topic=topic, title_text=text, title_is_template=topic is not None,
            non_ascii_title=bool(re.search(r"[^\x00-\x7f]", text)),
            item=r.Item, root_cause=r.RootCause, root_cause_norm=rc.loc[r.RootCause, "root_cause_norm"],
            resolution_type=rc.loc[r.RootCause, "resolution_type"], labels=",".join(labels),
            status=r.Status, first_status=r.first_status, n_snapshots=r.n_snapshots,
            severity=int(r.Severity), origin=r.Origin, obt=r.OBT,
            create_ts=r.CreateDate.isoformat(), last_conv_ts=r.LastUpdatedConversationDate.isoformat(),
            last_updated_date=r.LastUpdatedDate.date().isoformat(), report_month=r.Month.strftime("%Y-%m"),
            create_month=r.CreateDate.strftime("%Y-%m"),
            days_to_last_conv=round((r.LastUpdatedConversationDate - r.CreateDate).total_seconds() / 86400, 3),
            days_to_resolve_src=float(r._21), support_tier=max(lv) if lv else None,
            river_workflow=wf, river_helpfinder="River-Helpfinder" in tags,
            business_org=next((x.split("-")[-1] for x in tags if x.startswith("River-BusinessOrg-")), None),
            third_party=",".join(tp) or None, bcd_case=None if pd.isna(r.Cases) or r.Cases == "none" else "y",
            onetouch=None if pd.isna(r.OneTouch) or r.OneTouch == "none" else r.OneTouch,
            isight=None if pd.isna(r.iSight) or r.iSight == "none" else r.iSight,
            error_per_ticket=int(r._28), qjump=r.Qjump == "Y",
            requester_key=pseudo(r.RequesterIdentity), assignee_key=pseudo(r.AssigneeIdentity),
            requester_is_staff=r.RequesterIdentity in staff,
            n_intents=len(hits),
        ))
        ti_rows += [dict(ticket_id=r.ShortId, intent_id=i, source=s) for i, s in hits.items()]
        tag_rows += [dict(ticket_id=r.ShortId, tag=x) for x in tags if not x.startswith("River-wfss-")]
        label_rows += [dict(ticket_id=r.ShortId, label=x) for x in labels]

    snaps = snap.assign(requester_key=snap.RequesterIdentity.map(pseudo), assignee_key=snap.AssigneeIdentity.map(pseudo))
    snaps = snaps[["ShortId", "snapshot_seq", "Month", "Status", "Item", "RootCause", "Labels", "LastUpdatedDate",
                   "Days to Resolve", "Error Per Ticket", "assignee_key"]]
    snaps.columns = ["ticket_id", "snapshot_seq", "report_month", "status", "item", "root_cause", "labels",
                     "last_updated_date", "days_to_resolve_src", "error_per_ticket", "assignee_key"]
    snaps["report_month"] = snaps.report_month.dt.strftime("%Y-%m")
    snaps["last_updated_date"] = snaps.last_updated_date.dt.date.astype(str)

    if db_path.exists():
        db_path.unlink()
    con = sqlite3.connect(db_path)
    pd.DataFrame(tickets).to_sql("ticket", con, index=False)
    pd.DataFrame(ti_rows).to_sql("ticket_intent", con, index=False)
    pd.DataFrame(tag_rows).to_sql("ticket_tag", con, index=False)
    pd.DataFrame(label_rows).to_sql("ticket_label", con, index=False)
    snaps.to_sql("ticket_snapshot", con, index=False)
    intents.to_sql("intent", con, index=False)
    roots.to_sql("root_cause", con, index=False)
    con.executescript("""
        CREATE UNIQUE INDEX ix_ticket ON ticket(ticket_id);
        CREATE UNIQUE INDEX ix_ti ON ticket_intent(ticket_id, intent_id);
        CREATE INDEX ix_ti_intent ON ticket_intent(intent_id);
        CREATE INDEX ix_tag ON ticket_tag(ticket_id);
        -- demand = tickets that represent an employee need (not internal/test/no-detail/out-of-scope)
        CREATE VIEW demand_ticket AS
          SELECT t.* FROM ticket t
          WHERE t.resolution_type NOT IN ('junk','internal')
            AND NOT EXISTS (SELECT 1 FROM ticket_intent x JOIN intent i USING(intent_id)
                            WHERE x.ticket_id = t.ticket_id AND i.answer_class = 'excluded');
        CREATE VIEW demand_ticket_intent AS
          SELECT x.*, i.domain, i.name, i.answer_class FROM ticket_intent x
          JOIN intent i USING(intent_id) JOIN demand_ticket d USING(ticket_id);
    """)
    con.commit()
    n_t, n_ti = len(tickets), len(ti_rows)
    print(f"tickets={n_t} snapshots={len(snaps)} ticket_intents={n_ti} ({n_ti / n_t:.2f}/ticket) -> {db_path}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else ROOT / "data" / "travel.sqlite")
