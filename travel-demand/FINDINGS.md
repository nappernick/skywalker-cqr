# Travel support demand: findings

**Cohort.** 7,988 travel-support tickets created 2025-11-04 to 2026-09-30, from the `ATEE_travel_tickets_2026_2025.xlsx` SIM export. This excludes 246 tickets that were internal, test, empty/duplicate, unclear or out of scope.

**Unit.** Ticket. Intents are flat and many-to-many: 8,896 ticket–intent rows across 62 intents, and 10% of tickets carry more than one intent. **Per-intent counts overlap and do not sum to the ticket total.**

**Source limits.** The export has titles, root causes, labels and tags, but no conversation text. Everything below is *observed metadata* or *rule-labelled intent* (about 96% precision on a 100-ticket review; recall not measured). Method and caveats are in [README.md](README.md). All tables are in [`reports/`](reports).

## 1. Demand is concentrated

The top 5 intents make up 38% of intent rows, the top 10 make up 52%, the top 20 make up 71%, and the top 30 make up 83%.

| # | Intent (FAQ unit) | Tickets | Share of tickets | Answer class | Notable |
|--:|---|--:|--:|---|---|
| 1 | Booking tool login / access | 1,355 | 17% | account | 70% resolved as profile/account fixes |
| 2 | BahnCard request | 638 | 8% | doc → human | 95% Germany; 93% need tier-2 support |
| 3 | Rental car accident / damage | 602 | 8% | doc → human | 84% US; median 0 days (Avis auto-close) |
| 4 | Payment method in booking tool | 486 | 6% | account | 17% resolved as knowledge gaps |
| 5 | Booking error in the tool | 327 | 4% | account | 38% tool defects; 33% third-party escalation |
| 6 | Premium economy eligibility (PEA list) | 318 | 4% | doc → human | |
| 7 | Profile activation (new hire / rehire / RIF / transfer) | 252 | 3% | doc → human | 81% escalated to a third party |
| 8 | Using V-Pay | 229 | 3% | doc → form | |
| 9 | Out-of-policy expense approval | 228 | 3% | doc → human | 51% arrived as transfers from the expense team |
| 10 | Air booking / change help | 225 | 3% | account | |
| 11 | V-Pay form access | 223 | 3% | doc → human | median 0 days |
| 12 | Profile data after migration | 215 | 3% | doc → human | |
| 13 | Corporate / long-term housing | 191 | 2% | doc → human | |
| 14 | Legal name on profile | 191 | 2% | doc → human | |

The full table, including burden, geography and resolution mix per intent, is in `reports/01_intents.csv`.

## 2. How much Skywalker could take

| Ticket-level fit | Tickets | Share | Meaning |
|---|--:|--:|---|
| **Full** | 1,850 | 23% | Every intent on the ticket is documentation-answerable, or the resolver classed it as a navigation/how-to gap (713 tickets) |
| **Partial** | 3,428 | 43% | Docs answer the eligibility and process question; a form, approval or fulfilment remains |
| **None** | 2,710 | 34% | Needs account or booking troubleshooting, defect handling or complaint routing |

The **full-fit backlog** is a long list of mid-sized, clearly FAQ-shaped intents, not one big one:

- How to expense a travel cost (130)
- Loyalty and status promotions (129)
- Rental car policy and vendors (123)
- Rental insurance (107)
- Paying for a personal upgrade (106)
- Expensing cancelled flights (84)
- General policy (80)
- Seat fees (78)
- Flight credits (76)
- Business + personal trips (74)
- Trips booked in the old tool (71)
- Booking invoices (69)
- Tool how-to (66)
- Central-bill CVV (65)
- Cost center (62)
- Airlines not bookable in the tool (53)
- Guest / candidate / intern travel (46)

Several of these are resolved as plain knowledge by the resolvers. The share of tickets resolved as knowledge is:

- 86% for Trail code
- 77% for cost center
- 74% for business + personal trips
- 71% for general policy
- 54% for non-employee travel
- 51% for legacy bookings

The **partial** group is where most of the volume sits: BahnCard, car incidents, PEA, V-Pay, exception approvals and housing. Skywalker can answer "am I eligible, which option, what do I submit" and hand off with the right form. Two of these are country-specific, so **answers need jurisdiction metadata**:

- BahnCard: 95% Germany
- SNCF card: 74% France

## 3. The tool migration drove the largest wave

Tickets whose River topic names the "New Booking Tool / New Travel System" made up:

- 51% of January demand (679 of 1,330)
- 15% by September (100 of 664)

Booking-tool access alone was 37% of January tickets, against 12% in other months. The profile-data, legal-name, legacy-bookings and feedback intents all peak in January too (`reports/03_spikes.csv`).

The access and profile cluster (access, activation, profile data, name) still totals **1,985 tickets (25%)**. It is mostly resolved as account fixes (61–82%), so FAQ content alone won't remove it. But **160 of 1,015 "Access Issues" tickets (16%) were resolved as navigation / how-to**. Skywalker could also handle triage for the known causes (pre-start new hire, RIF, rehire, alias change) and route those with the right detail on the first contact.

*Inferred, not verified.* The migration timing comes from the topic wording and the curve. A launch calendar is needed before stating dates.

## 4. Discoverability problems are visible in the data

- **"Not on River".** 409 River tickets (7% of templated tickets) chose a River topic literally called "…Not Listed on River" or "…Not on River". The requester looked in the help catalog and didn't find their issue. These topics resolve as defects 16–74% of the time, so they are partly real gaps in tool coverage and partly missing content.
- **CVV.** The central-bill CVV is a pure lookup (65 tickets), yet many are "[Workflow Feedback] CVV link not working / no access / file won't open". The answer exists, but the link or its permissions fail. 66% of CVV tickets also carry a payment-method intent.
- **V-Pay, August 2026.** V-Pay tickets jumped to 167 (from 23–55 per month), or 16% of August demand. They arrived under the new *Special Services Desk* CTI, many with Direct origin. Titles cite deprecated / 404 links and "wrong link in help resource". **This is a candidate change point.** It needs confirmation from the V-Pay owners that the form or link changed, and needs separating from the CTI re-routing (see §7).

## 5. Expense-team handoffs are a routing cost

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

## 6. Needs that travel together (within one ticket)

`reports/04_cooccurrence.csv` has support, both conditional probabilities and lift for each pair.

| Pair | Tickets | Strength | Content implication |
|---|--:|---|---|
| Car accident + rental insurance | 65 | 61% of insurance tickets; lift 8 | One "rental car incident" page that covers insurance |
| Central-bill CVV + payment method | 43 | 66% of CVV tickets; lift 11 | One "paying in the booking tool" page |
| Cabin exception + PEA eligibility | 20 | 56% of exception tickets; lift 14 | One premium-cabin page |
| Cabin-upgrade expense + seat fees | 18 | lift 14 | One "cabin & seat reimbursement" page |
| V-Pay failure + V-Pay request | 14 | lift 14 | Troubleshooting belongs on the V-Pay how-to page |

## 7. Repeat contact, burden and routing

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

**Origin.** Direct SIM tickets are more often knowledge questions than River tickets. 38% of direct SIM tickets are full fit, against 20% of River tickets. People who skip River tend to ask "how/what" questions.

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

## Limits

- **No conversation text.** We can't count questions per ticket, measure time to first useful answer, judge closure quality, or see needs the title doesn't name. Multi-intent rates are therefore a floor.
- **Days to last conversation is not a resolution time.** It includes requester silence and fulfilment time (for example, BahnCard delivery).
- **Root cause is a resolver judgment,** applied with varying consistency. About 17% of tickets use the older, coarser vocabulary (`Hotel`, `Profile`, `Airline`, `FOP` and similar).
- **Only one window (~11 months).** It cannot separate seasonality from launches.
- **`Error Per Ticket`'s meaning is unknown.** Value 2 is over-represented on expense-team transfers (`reports/08_error_per_ticket_x_resolution.csv`), so it may count handoffs. It needs confirming before use.

## Next steps (in priority order)

1. **Pull descriptions and first comments** for a stratified sample (about 30 per top-30 intent). This measures recall and the real number of questions per ticket, and confirms the answerability calls.
2. **Get the River HelpFinder catalog and the current FAQ / wiki pages**, then test coverage for the full-fit intents. That splits each one into a knowledge gap (no page), a discoverability gap (page exists, users don't find it) or a retrieval gap (Skywalker misses it).
3. **Confirm with owners:**
   - Spotnana migration dates
   - the V-Pay form or link change in August
   - the meaning of `Error Per Ticket`
   - the July CTI remap
4. **Draft FAQ content for the five bundles in §6,** plus BahnCard and SNCF eligibility pages tagged by country.
