# Travel support demand: findings

**Cohort.** 8,012 travel-support tickets created 2025-11-04 to 2026-09-30, from the `ATEE_travel_tickets_2026_2025.xlsx` SIM export. This excludes 222 tickets that were internal tracking, test, empty/duplicate, unclear or out of scope.

**Unit.** Ticket. Intents are flat and many-to-many: 8,920 ticket–intent rows across 63 intents, and 10% of tickets carry more than one intent. Every ticket is classified, whether or not it asks a question. **Per-intent counts overlap and do not sum to the ticket total.**

**Source limits.** The export has titles, root causes, labels and tags, but no conversation text. Everything below is *observed metadata* or *rule-labelled intent* (about 96% precision on a 100-ticket review; recall not measured). Method and caveats are in [README.md](README.md). All tables are in [`reports/`](reports).

## 1. All demand, by what would best replace the human

Each intent has a default **replacement channel**. Each ticket then refines it from what the resolver actually did:

- a navigation / how-to root cause becomes `answer`
- a tool defect becomes `engineering_fix`
- an account fix on an "answer" intent becomes `agent_action`

A ticket is only as automatable as its hardest intent.

| Channel | What replaces the human | Tickets (hardest intent) | Share | Cumulative |
|---|---|--:|--:|--:|
| `answer` | Skywalker answers from documentation | 1,614 | 20% | 20% |
| `agent_action` | An agent with system access completes it (grant, provision, book, order, file, retrieve) | 4,571 | 57% | 77% |
| `intake_and_route` | An agent captures a structured report or complaint and routes it | 221 | 3% | 80% |
| `agent_prep_human_decision` | An agent assembles the case; a person approves or decides | 438 | 5% | 85% |
| `human_investigation` | Vendor disputes, booking forensics | 429 | 5% | 91% |
| `engineering_fix` | The tool is broken; only a fix removes the ticket | 739 | 9% | 100% |

**Agent action is the largest pool, but it is concentrated in a few capabilities** (`reports/09_agent_capabilities.csv`):

| Capability | Tickets |
|---|--:|
| Booking-tool profile administration (provisioning / re-sync, reactivation, field and legal-name updates, form of payment) | 1,859 |
| BahnCard calculation + order | 636 |
| Rental-car incident filing | 597 |
| PEA list lookup / add | 308 |
| V-Pay request + form permission | 448 |
| Housing request submission | 190 |
| SNCF card order | 148 |

*Assumption.* `agent_action` means the work is deterministic enough to automate, **not** that APIs or permissions for it exist today. Feasibility per capability is unassessed. Car incidents in the US/Canada are already auto-closed (median 0 days), so that pool is partly automated already.

Per-intent channel splits are in `reports/09_intent_x_channel.csv`.

## 2. The answerable set (focus)

**1,614 tickets (20%) are fully answerable from documentation**, and **1,808 (23%) contain at least one answerable intent**. The 1,964 answerable intent rows come from two sources:

- **1,133** from intents that are documentation questions by nature (policy, how-to, reimbursement rules)
- **831** from intents that *look* like action requests but were resolved by explaining something

The second group is hidden demand. For example, 216 "can't access the tool" tickets and 83 "payment method" tickets were resolved as navigation / how-to.

The answerable set is a long list of mid-sized FAQ units: the top 12 make up 60% (`reports/10_answerable_intents.csv`).

| Intent | Answerable tickets | Share of that intent answerable | Notes |
|---|--:|--:|---|
| Booking tool access (how-to) | 216 | 16% | all via knowledge root cause |
| How to expense a travel cost | 129 | 99% | 39% arrived via the expense team |
| Rental car policy & vendors | 115 | 94% | |
| Rental car insurance | 107 | 99% | 69% AMER |
| Paying for a personal upgrade | 98 | 92% | 35% via the expense team |
| Payment method in tool (how-to) | 83 | 17% | 61% chose a "Not on River" topic |
| Expensing cancelled flights | 82 | 98% | 82% US |
| General travel policy | 77 | 96% | 40% APAC |
| Seat fees | 75 | 96% | 59% via the expense team |
| Business + personal trips | 72 | 97% | |
| Corporate travel card | 67 | 78% | |
| Cost center | 48 | 77% | |
| Out-of-policy approval (process) | 48 | 21% | |
| Air booking (how-to) | 47 | 21% | 60% chose a "Not on River" topic |
| Flight credits | 42 | 55% | |
| Trips booked in the old tool | 42 | 59% | |

Across the set:

- **The expense flow is a main entry point.** Seat fees, receipt policy, expensing costs and personal upgrades arrive as transfers from the expense team 35–59% of the time.
- **The question exists before the ticket.** People who file directly in SIM ask answerable questions twice as often as River users (33% vs 17% of tickets).
- **Country matters for a few answers.** Rail-class policy is 75% EMEA, general policy is 40% APAC, and cancelled-flight expensing is 82% US.

**Answer-first.** Beyond the answerable set, **3,583 more tickets** carry an action intent whose eligibility or process *is* documentable: BahnCard, PEA, V-Pay, housing, exceptions. Skywalker can answer "am I eligible / which option / what do I submit" before an agent or a person acts. Two are country-specific, so **answers need jurisdiction metadata**:

- BahnCard: 95% Germany
- SNCF card: 74% France

## 3. Demand is concentrated

The top 5 intents make up 38% of intent rows, the top 10 make up 52%, the top 20 make up 71%, and the top 30 make up 83%.

| # | Intent (FAQ unit) | Tickets | Share of tickets | Default channel | Notable |
|--:|---|--:|--:|---|---|
| 1 | Booking tool login / access | 1,355 | 17% | agent action | 70% resolved as profile/account fixes |
| 2 | BahnCard request | 638 | 8% | agent action | 95% Germany; 93% need tier-2 support |
| 3 | Rental car accident / damage | 602 | 8% | agent action | 84% US; median 0 days (Avis auto-close) |
| 4 | Payment method in booking tool | 486 | 6% | agent action | 17% resolved as knowledge gaps |
| 5 | Booking error in the tool | 327 | 4% | human investigation | 38% tool defects; 33% third-party escalation |
| 6 | Premium economy eligibility (PEA list) | 318 | 4% | agent action | |
| 7 | Profile activation (new hire / rehire / RIF / transfer) | 252 | 3% | agent action | 81% escalated to a third party |
| 8 | Using V-Pay | 229 | 3% | agent action | |
| 9 | Out-of-policy expense approval | 228 | 3% | prep for human decision | 51% arrived as transfers from the expense team |
| 10 | Air booking / change help | 225 | 3% | agent action | |
| 11 | V-Pay form access | 223 | 3% | agent action | median 0 days |
| 12 | Profile data after migration | 215 | 3% | agent action | |
| 13 | Corporate / long-term housing | 191 | 2% | agent action | |
| 14 | Legal name on profile | 191 | 2% | agent action | |

The full table, including burden, geography and resolution mix per intent, is in `reports/01_intents.csv`.

## 4. The tool migration drove the largest wave

Tickets whose River topic names the "New Booking Tool / New Travel System" made up:

- 51% of January demand (679 of 1,330)
- 15% by September (100 of 664)

Booking-tool access alone was 37% of January tickets, against 12% in other months. The profile-data, legal-name, legacy-bookings and feedback intents all peak in January too (`reports/03_spikes.csv`).

The access and profile cluster (access, activation, profile data, name) still totals **1,985 tickets (25%)**. It is mostly resolved as account fixes (61–82%), so FAQ content alone won't remove it. But **160 of 1,015 "Access Issues" tickets (16%) were resolved as navigation / how-to**. Skywalker could also handle triage for the known causes (pre-start new hire, RIF, rehire, alias change) and route those with the right detail on the first contact.

*Inferred, not verified.* The migration timing comes from the topic wording and the curve. A launch calendar is needed before stating dates.

## 5. Discoverability problems are visible in the data

- **"Not on River".** 409 River tickets (7% of templated tickets) chose a River topic literally called "…Not Listed on River" or "…Not on River". The requester looked in the help catalog and didn't find their issue. These topics resolve as defects 16–74% of the time, so they are partly real gaps in tool coverage and partly missing content.
- **CVV.** The central-bill CVV is a pure lookup (65 tickets), yet many are "[Workflow Feedback] CVV link not working / no access / file won't open". The answer exists, but the link or its permissions fail. 66% of CVV tickets also carry a payment-method intent.
- **V-Pay, August 2026.** V-Pay tickets jumped to 167 (from 23–55 per month), or 16% of August demand. They arrived under the new *Special Services Desk* CTI, many with Direct origin. Titles cite deprecated / 404 links and "wrong link in help resource". **This is a candidate change point.** It needs confirmation from the V-Pay owners that the form or link changed, and needs separating from the CTI re-routing (see §8).

## 6. Expense-team handoffs are a routing cost

505 tickets have the root cause *Transfer from Expense Team* (mean 7.9 days to last conversation). They dominate a specific set of intents. Share of each intent arriving as a transfer:

| Intent | Share transferred |
|---|--:|
| Expense report returned | 56% |
| Seat fees | 56% |
| Receipt policy | 53% |
| Out-of-policy approval | 51% |
| Fare quote | 48% |
| Cabin-upgrade expense | 47% |

These are travel-policy questions raised at **expense time**. They are a clear case for Skywalker answering inside the expense flow, and for fixing routing so they don't bounce between teams.

## 7. Needs that travel together (within one ticket)

`reports/04_cooccurrence.csv` has support, both conditional probabilities and lift for each pair.

| Pair | Tickets | Strength | Content implication |
|---|--:|---|---|
| Car accident + rental insurance | 65 | 61% of insurance tickets; lift 8 | One "rental car incident" page that covers insurance |
| Central-bill CVV + payment method | 43 | 66% of CVV tickets; lift 11 | One "paying in the booking tool" page |
| Cabin exception + PEA eligibility | 20 | 56% of exception tickets; lift 14 | One premium-cabin page |
| Cabin-upgrade expense + seat fees | 18 | lift 14 | One "cabin & seat reimbursement" page |
| V-Pay failure + V-Pay request | 14 | lift 14 | Troubleshooting belongs on the V-Pay how-to page |

## 8. Repeat contact, burden and routing

**Repeat contact.** 798 tickets (10%) came from someone who had filed another ticket in the previous 30 days, and 361 of those share an intent with it. The largest same-intent repeats are:

- Car damage: 58
- Tool access: 42
- Out-of-policy approval: 30
- BahnCard: 27
- V-Pay: 25

Car damage is followed by a car-insurance ticket 30 times (counting both directions), which points to a missing "what happens next" step. Requesters with 10 or more tickets (169 tickets) look like arrangers or coordinators.

**Burden proxies.** These are support tier and escalation, not effort minutes.

- 43% of tickets reached tier 2 or higher.
- The highest tier-2+ shares are BahnCard (93%), hotel no-show (87%), profile activation (85%), agency complaints (83%) and traffic fines (79%).
- The highest median days to last conversation are traffic fines (17), hotel no-show (13) and agency complaints (10).

**Origin.** Direct SIM tickets are more often knowledge questions than River tickets. 33% of direct SIM tickets are fully answerable, against 17% of River tickets. People who skip River tend to ask "how/what" questions.

**CTI reorganization in July 2026.** Six CTI items stopped at the end of June:

- Airline Issues
- Car Rental Issues
- Hotel Issues
- Travel Process Inquiry
- Travel Policy Inquiry
- Rail Inquiry

New ones took over:

- Travel Process
- Post Travel Customer Care
- Car Damage or Violations
- Internal Transfer
- Special Services Desk

**Any trend by CTI breaks at July.** The intents here come from title text and labels, so they are stable across the change.

## 9. What Skywalker's FAQ corpus covers

The Skywalker FAQ index (`faq_evidence`, corpus version 2026-10-28) holds **104 FAQ fragments**:

| Topic | Fragments |
|---|--:|
| Travel booking | 53 |
| Expense reimbursement | 27 |
| Meetings & events | 23 |
| Expense system | 19 |
| Travel risk | 8 |

Fragments can carry more than one topic. I judged every intent against every travel and expense fragment by reading its full text. The judgment and the gap behind it are in `config/faq_coverage.csv`; demand-weighted results are in `reports/11_*.csv`.

**Coverage, weighted by demand (ticket–intent rows):**

| Set | Fully answered | Partly answered | Not covered |
|---|--:|--:|--:|
| Answerable needs (1,964) | 47% | 42% | 12% |
| Answer-first needs (3,728) | 35% | 31% | 35% |

Most answerable demand has *some* page, but more than half of it lacks a page that fully answers it. The eligibility and process questions in front of action requests are where whole topics are missing.

**The content backlog**, ranked by the documentation demand each gap would serve (answerable plus answer-first tickets; `reports/11_gap_backlog.csv`):

| Gap | Coverage | Tickets served | What is missing |
|---|---|--:|---|
| BahnCard request | none | 638 | Eligibility, which card and class, how to request |
| V-Pay (using it, form access) | none | 452 | No V-Pay content at all |
| Profile activation (rehire, RIF, transfer) | partial | 252 | Only new hires are covered |
| Out-of-policy expense approval | partial | 228 | How to get an out-of-policy expense approved |
| Booking-tool login troubleshooting | partial | 216 | Only "open a Travel RIVER ticket"; no common causes or fixes |
| Profile data after migration | partial | 215 | Fixing manager, passport and accommodation fields |
| Corporate / long-term housing | partial | 191 | Policy exists; how to request does not |
| SNCF discount card | none | 152 | Nothing |
| Cabin upgrade flagged on expense report | partial | 133 | What documentation the report needs |
| Hotel not available in the tool | partial | 132 | What to do when a hotel shows no availability or isn't listed |
| Expensing cancelled flights | none | 82 | Nothing beyond a policy section reference |
| Economy fare quote for reimbursement | none | 75 | Nothing |
| Unused flight credits | none | 42 | Nothing |
| Trips booked in the old tool | none | 42 | Nothing |

**Covered, but people still filed.** For each fully covered intent, I counted tickets created on or after the date its FAQ was first certified. 415 answerable tickets fall in that window (`reports/11_covered_but_filed.csv`):

| Intent | Answerable tickets after the FAQ existed |
|---|--:|
| Rental insurance | 57 |
| How to expense a travel cost | 56 |
| Rental car policy | 48 |
| General policy | 45 |
| Personal upgrades | 42 |
| Business + personal trips | 40 |
| Seat fees | 25 |
| Hotel policy | 16 |
| Trail code | 15 |

Answerable tickets on fully covered intents also **did not fall** after most FAQs were certified in May 2026. They averaged 9.8% of monthly tickets in January–April and 12.9% in June–September. *Inferred, not verified.* Certification is not proof that Skywalker was live or that employees could reach it. Without a launch date and usage logs, this shows **no visible deflection yet**, not a retrieval failure.

**Corpus quality notes:**
- **CVV.** The central-bill CVV answer is only a link to a SharePoint PDF. The tickets about it are mostly that link failing or access being denied.
- **Thin pointers.** Several expense answers ("What expenses are reimbursable?" and most receipt pages) send the reader to a guide or policy without answering in the text.
- **No structured links.** `policy_links` and `followup_fragment_ids` are empty on all 104 fragments, so the bundles in §7 can't yet be served as linked follow-ups.
- **Out of scope by design.** Skywalker's own description says it cannot book, submit, approve or check status. That puts the 57% agent-action channel outside its scope by design.
- **No travel demand.** 28 fragments map to no travel-ticket demand: 20 meetings & events pages, plus meals/per diem, mobile phone and travel-risk pages. That is expected, since this export holds only travel tickets.

## Limits

- **No conversation text.** We can't count questions per ticket, measure time to first useful answer, judge closure quality, or see needs the title doesn't name. Multi-intent rates are therefore a floor.
- **Days to last conversation is not a resolution time.** It includes requester silence and fulfilment time (for example, BahnCard delivery).
- **Root cause is a resolver judgment,** applied with varying consistency. About 17% of tickets use the older, coarser vocabulary (`Hotel`, `Profile`, `Airline`, `FOP` and similar).
- **Only one window (~11 months).** It cannot separate seasonality from launches.
- **`Error Per Ticket`'s meaning is unknown.** Value 2 is over-represented on expense-team transfers (`reports/08_error_per_ticket_x_resolution.csv`), so it may count handoffs. It needs confirming before use.

## Next steps (in priority order)

The ticket export is the complete ticket data available. Recall and questions-per-ticket can't be measured, so the work goes into content and evaluation.

1. **Write the missing pages, in backlog order (§9):**
   - BahnCard and SNCF eligibility pages, tagged by country
   - one V-Pay page (eligibility, form access, how to request, what to do when it fails)
   - profile lifecycle (rehire, RIF, transfer)
   - out-of-policy expense approval
   - booking-tool login troubleshooting
   - housing request process
   - cancelled-flight expensing, fare quotes and flight credits
2. **Fix the thin answers people already hit:** the CVV link and access, and receipt and reimbursable-expense pages that only point elsewhere. Then populate `followup_fragment_ids` for the bundles in §7.
3. **Build an evaluation set** from the answerable intents' canonical questions, written the way employees phrase them in the River topics and titles. Run it against the `faq_evidence` index to separate retrieval misses from content gaps.
4. **Confirm with owners:**
   - Skywalker's launch date and usage
   - Spotnana migration dates
   - the V-Pay form or link change in August
   - the meaning of `Error Per Ticket`
   - the July CTI remap
