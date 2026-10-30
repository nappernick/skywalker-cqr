# Travel support demand: dataset and intent analysis

This folder analyzes 8,234 Amazon Travel tickets from SIM (the `ATEE_travel_tickets_2026_2025.xlsx` export, created Nov 2025 to Sep 2026). The goal is to find which travel-support needs Skywalker could answer from documentation, how often each need comes up, and what each costs.

This is the **travel** domain that both earlier playbooks could not read (meetings & events made up 99%+ of their data). It complements them rather than replacing them.

## What the source does and does not contain

The export is **ticket metadata only**. It has the title, CTI item, resolver root cause, labels, River tags, dates, status, region and country. It has **no description and no conversation**. As a result:

- The unit is the **ticket**, not the question. We cannot extract questions, measure back-and-forth, or time a first answer.
- 74% of titles follow the River template `Location | requester-chosen topic | alias`. The middle segment is the requester's own description of their need, so it is the strongest intent signal. The other 26% are free text.
- The resolver's **root cause** says what the ticket turned out to be: a knowledge gap, an account fix, a tool defect, fulfilment, approval or routing. Comparing "what was asked" (title) with "what it was" (root cause) gives an answerability signal per ticket.
- `Days to Resolve` in the source is *last conversation minus creation* (it matches for 95% of rows). It is not a resolution time.
- `Error Per Ticket` has unknown meaning. It is kept and cross-tabulated, but not interpreted.

## Intents

**Definition.** One intent is one need that a single FAQ question-and-answer pair or one coherent wiki page could fully answer.

**Flat, many-to-many.** A ticket can carry several intents. Each intent is counted on its own, with no parent/child rollup. `domain` is a filter attribute, not a hierarchy level. Per-intent ticket counts overlap, so they do **not** sum to the ticket total.

Each intent has an `answer_class`:

| answer_class | meaning | documentation role |
|---|---|---|
| `doc` | Documentation fully answers it | full |
| `doc_then_form` | Docs explain it; a self-service form completes it | partial |
| `doc_then_human` | Docs explain eligibility and process; a person must approve, grant or fulfil | partial |
| `account` | Needs someone to look at an account or booking (troubleshooting) | none |
| `report` | A bug, feedback or complaint that needs routing | none |
| `action` | A pure request with no question (e.g. add me to an access group) | none |

Every intent also has a **`best_channel`**: what would best replace the human for it. It also has an **`agent_capability`**: the system access an agent would need. The answerable set (`channel = answer`) is the main focus. The other channels give a high-level picture of all demand.

| best_channel | replaces the human with |
|---|---|
| `answer` | Skywalker answering from documentation |
| `agent_action` | An agent with system access doing it end to end (grant, provision, book, order, file, retrieve) |
| `intake_and_route` | An agent capturing a structured report or complaint and routing it |
| `agent_prep_human_decision` | An agent assembling the case; a person approves or decides |
| `human_investigation` | Nothing yet: vendor disputes, booking forensics |
| `engineering_fix` | Fixing the tool |

**Per ticket, the channel is refined by the resolver's root cause:**

- A navigation / how-to root cause makes it `answer`. The person needed an explanation, whatever they asked for.
- A tool defect makes it `engineering_fix`.
- Feedback makes it `intake_and_route`.
- An account fix on an `answer` intent makes it `agent_action`.

`channel_basis` records whether the default or a root-cause override applied. **A ticket's channel is its hardest intent's channel.** `agent_action` means the work is deterministic enough to automate. It does not mean the API or permission exists today.

### Assignment (deterministic, config-as-data)

1. `config/text_rules.tsv` holds ordered regexes run over the topic plus free-text title. Location and alias are removed first.
   - **Tier 1** (specific): every matching rule fires. A rule's `unless` regex blocks known collisions, such as "training" matching rail.
   - **Tier 2/3** (generic): used only if no specific rule or label matched. The first match wins, because several generic hits on a vague title means ambiguity, not several needs.
2. `config/label_rules.tsv` adds intents from resolver labels that name a specific need, such as `PEALIst` or `Traffic Fines`. Labels that tag a workflow or a traveller segment are deliberately not used, such as `VPay Failure` (it sits on most V-Pay tickets) or `SN - EA/L8+/L10`.
3. `config/root_causes.csv` gives the fallback intent when no text or label rule matched (3% of tickets). It also maps each root cause to a `resolution_type`.
4. `test_ticket`, `internal_tracking` (queue-jump trackers, hotel reviews, CTI notices) and `team_membership_request` are whole-ticket intents. When one matches, it is the only intent on the ticket. Only `team_membership_request` counts as employee demand.

**Precision check.** I reviewed 100 random tickets (seed 2026) against their full assignment, before the last rule fixes. 93 were fully correct, 3 had a correct intent plus a spurious extra, and 4 were wrong. That is about 96% precision per assigned intent. All four errors had clear causes and were fixed. **Recall has not been measured**: a ticket can carry a need its title doesn't show, and only the description would reveal it.

## Data structure (`data/travel.sqlite`, gitignored)

| table / view | grain | notes |
|---|---|---|
| `ticket` | 1 row per ticket (latest monthly snapshot) | parsed title parts, root cause and `resolution_type`, support tier (`lvl0-3` tag), third-party escalation (`3p*` tags), River workflow, origin, timing, `requester_key` / `assignee_key` |
| `ticket_snapshot` | 1 row per ticket per report month | 17 tickets appear in two months (re-resolved) |
| `ticket_intent` | ticket × intent | `source` = `text` / `label` / `text_generic` / `root_cause`; `channel`, `channel_basis` |
| `ticket_tag`, `ticket_label` | ticket × tag / label | River workflow UUID kept on `ticket` |
| `intent`, `root_cause` | dimensions | loaded from `config/` |
| `demand_ticket`, `demand_ticket_intent` | views | excludes internal/test, no-detail/duplicate root causes, unclear and out-of-scope tickets |

**Privacy.** Requester and assignee aliases are replaced in memory with keyed HMAC-SHA256 pseudonyms. The key lives in `data/hmac.key` or `SKYWALKER_HMAC_KEY`, never in git. Aliases found in titles are replaced with `[alias]`. Titles can still contain free-text personal names, so the database and the raw export stay out of git. Everything in `reports/` is aggregate: no titles, no ticket IDs, no keys.

## Run

```bash
python3 scripts/build.py data/tickets.xlsx    # -> data/travel.sqlite
```

```bash
python3 scripts/analyze.py                    # -> reports/*.csv
```

Requires `pandas` and `openpyxl`. Findings are in [`FINDINGS.md`](FINDINGS.md).

## Dashboard

`dashboard/index.html` and `dashboard/app.js` are the page of the private **Travel Support Demand** dashboard artifact. It reads four de-identified JSON files from `scripts/export_dashboard.py` (`reports/dashboard/`). Those files hold no titles, ticket IDs, aliases or requester keys. Cross-ticket journeys ship only as an aggregate. Every filter is applied in the browser.

```bash
python3 scripts/export_dashboard.py           # -> reports/dashboard/*.json
```
