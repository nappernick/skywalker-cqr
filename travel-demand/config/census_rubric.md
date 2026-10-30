# Answerability census rubric

Used to rate every demand ticket (8,012) for whether factual content alone would resolve it.
Tickets with identical metadata (normalised title, CTI item, root cause, labels) form one *signature*
and get one rating, because a rater sees nothing else: 4,256 signatures cover all tickets.

Each signature was rated by two independent, blind raters (they never saw the intent classifier,
the channel model or the FAQ corpus). Disagreements and omissions went to a third adjudicator.
Ratings live in `data/census/ratings.csv`; `scripts/census.py report` aggregates them.

## Rater brief (verbatim)

CONTEXT. These are Amazon corporate-travel support tickets (employees booking flights, hotels, cars, rail; an
online booking tool called ATO/OBT, vendors such as Spotnana/BCD/Concur; V-Pay = virtual card for hotel payment;
PEA = premium-economy approval list; BC/BahnCard = German rail discount card; SNCF = French rail). We only have
metadata: CTI item, the resolver's root cause (what the ticket turned out to be), resolver labels, whether the
title was picked from an intake menu, and the title. No description. Internal acronyms: judge from the words.

QUESTION. For each line: is this the kind of ticket a reasonably worded question that a factual piece of content
(an FAQ answer, a wiki page, a policy page) would fully resolve, so an answer bot could close it with no staff or
system action? Judge by LOGIC, not by whether such a page exists today: documentation will keep growing. Ask
"could a reasonable, stable page answer this for anyone who asks it?"

LABELS (pick exactly one, the best description of what resolves the ticket):

- `fact_answer`: content fully resolves it. How-to, where-is, policy, eligibility, process, "why does X behave
  like this" when the behaviour is general (a known limitation, a rule, a standard error with a documented
  workaround). Navigation root causes are strong evidence for this.
- `self_serve`: phrased as a request, but the employee can complete it themselves once told how (update own
  profile field, cancel/change own booking in the tool, download own invoice/receipt, apply via a form
  themselves). No staff touch needed.
- `answer_then_action`: there is a content-answerable question, but the case also needs someone with system
  access or authority to act (approve, grant, issue, re-sync, refund, fix a record).
- `action`: a request needing staff/system action with no real question (issue a card, re-sync a profile, pull
  an invoice only staff can get, process a claim/fine, transfer).
- `defect`: a genuine one-off fault needing investigation or an engineering fix, where no general page would help.
- `feedback`: complaint, feedback, enhancement request, or vendor/service report to route.
- `unclear`: not enough information to judge.

Weigh the root cause: it says what the ticket turned out to be (e.g. "Profile Missing or Sync Issue" usually =
action; "Navigation" = fact_answer; "Bug" = defect unless the title describes general behaviour; "Rail Discount
Card Application" = action unless the title is a question about eligibility/process). A menu-picked title is the
employee's chosen topic, so it is real but coarse; when the topic itself is a question topic (e.g. "Travel policy
question", "How to book ...") lean to the answer labels; when it is a request topic lean to action.
confidence: high / medium / low.

## Answerable by content alone

`fact_answer` + `self_serve`. The bounds use the two raters before adjudication: *strict* counts a signature only
if both raters chose an answer label, *loose* if either did.
