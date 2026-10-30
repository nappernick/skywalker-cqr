# Skywalker

Two projects in one bun workspace, plus the design documents behind them.

| Folder | What it is |
|---|---|
| `travel-demand/` | Analysis of 8,012 Amazon Travel support tickets: intent classification, FAQ coverage, an answerability census, and a React dashboard with a 3D intent map. |
| `cqr-bench/` | A TypeScript bench for conversational query rewriting (cache → rewrite model), with a gold eval set and Python SageMaker / data-generation scaffolds. |
| `docs/` | CQR strategy review and implementation plans, the research notes, and the UKB architecture documents. |

## Run

Requires [bun](https://bun.sh). Python 3.11+ is needed only to rerun the analysis.

```bash
bun install
bun run dev          # dashboard on http://localhost:5173
bun run build        # typecheck + production build -> travel-demand/dashboard/dist
bun run preview      # serve the production build
bun test             # domain and bench tests
bun run bench        # CQR bench (simulated model)
```

Rerun the analysis from the raw export (needs `travel-demand/data/`, which is not in git):

```bash
pip install -r travel-demand/requirements.txt
bun run pipeline     # build -> analyze -> coverage -> intent space -> census -> dashboard export
```

## Data and privacy

`travel-demand/data/` (raw tickets, SQLite build, FAQ corpus, census ratings, HMAC key) holds personal data and is gitignored.
Everything in `travel-demand/reports/` is aggregate and de-identified. A missing `hmac.key` is regenerated on the next build; that only changes pseudonymous requester ids, never counts.
