"""Place intents in a 2D semantic space -> reports/12_*.csv + reports/dashboard/intent_space.json.

Position means meaning: each intent's vector is
  0.6 x mean sentence embedding of its tickets' (de-identified) titles   - what people actually wrote or picked
  0.4 x sentence embedding of its definition (name + canonical question) - what the intent is
using BAAI/bge-small-en-v1.5 (384-d) via fastembed, run locally. Intents are laid out with UMAP on cosine
distance between those vectors. Size (ticket frequency) and colour (category = domain) are added on the page.

Words shown on the page come from TF-IDF of titles, kept only if used in >= 15 tickets by >= 8 requesters.

Usage: python3 scripts/intent_space.py [data/travel.sqlite]
"""
import json, sqlite3, sys
from pathlib import Path

import numpy as np
import pandas as pd
from fastembed import TextEmbedding
from scipy.spatial import procrustes
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS, TfidfVectorizer
from sklearn.preprocessing import normalize
import umap

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "reports"
MODEL = "BAAI/bge-small-en-v1.5"
W_TITLES, W_DEFINITION = 0.6, 0.4
TERM_MIN_TICKETS, TERM_MIN_REQUESTERS = 15, 8
SEED = 42
# River menu boilerplate that appears across unrelated topics; it says nothing about the need itself.
FILLER = {"river", "new", "tool", "booking", "issue", "issues", "related", "listed", "mentioned", "workflow", "feedback",
          "request", "requests", "system", "travel", "help", "need", "needed", "assistance", "support", "query", "inquiry",
          "email", "rqst", "sn", "re", "fw", "unable", "able", "please", "urgent", "team", "amazon"}


def clean(s):
    return (pd.Series(s).fillna("").str.replace(r"\[alias\]", " ", regex=True).str.replace(r"\[workflow feedback\]\s*-?", " ", regex=True, case=False)
            .str.replace(r"\d{4,}", " ", regex=True).str.replace(r"\s+", " ", regex=True).str.strip())


def main(db):
    con = sqlite3.connect(db)
    rows = pd.read_sql("""select x.intent_id, d.ticket_id, d.title_text, d.requester_key
                          from demand_ticket_intent x join demand_ticket d using(ticket_id)""", con)
    meta = pd.read_sql("select intent_id, name, domain, faq_question from intent", con).set_index("intent_id")
    intents = sorted(rows.intent_id.unique())
    rows["text"] = clean(rows.title_text).to_numpy()

    model = TextEmbedding(MODEL, cache_dir=str(ROOT / "data" / "models"))
    uniq = sorted(set(rows.text) - {""})
    E = dict(zip(uniq, normalize(np.array(list(model.embed(uniq))))))
    defs = [f"{meta.loc[i, 'name']}. {meta.loc[i, 'faq_question']}" for i in intents]
    Ed = normalize(np.array(list(model.embed(defs))))
    V = []
    for k, i in enumerate(intents):
        t = [E[x] for x in rows[rows.intent_id == i].drop_duplicates("ticket_id").text if x in E]
        vt = normalize(np.mean(t, axis=0, keepdims=True))[0] if t else Ed[k]
        V.append(W_TITLES * vt + W_DEFINITION * Ed[k])
    V = normalize(np.array(V))
    S = V @ V.T
    D = np.clip(1 - S, 0, 2)
    np.fill_diagonal(D, 0)

    def layout(seed):
        return umap.UMAP(n_neighbors=8, min_dist=0.4, metric="precomputed", random_state=seed, init="random").fit_transform(D)
    xy = layout(SEED)
    stability = float(np.mean([procrustes(xy, layout(s))[2] for s in (1, 7, 13, 21)]))
    xy = (xy - xy.mean(axis=0)) / np.abs(xy - xy.mean(axis=0)).max()

    # Words safe to show.
    tk = rows.drop_duplicates("ticket_id").reset_index(drop=True)
    vec = TfidfVectorizer(ngram_range=(1, 2), min_df=3, sublinear_tf=True, token_pattern=r"(?u)\b[^\W\d_]{2,}\b",
                          stop_words=list(ENGLISH_STOP_WORDS | FILLER))
    X = vec.fit_transform(tk.text.str.lower())
    vocab = np.array(vec.get_feature_names_out())
    present = (X > 0).tocsc()
    req = tk.requester_key.to_numpy()
    safe = np.array([present[:, j].nnz >= TERM_MIN_TICKETS and len(set(req[present[:, j].indices])) >= TERM_MIN_REQUESTERS for j in range(len(vocab))])
    tix = {t: i for i, t in enumerate(tk.ticket_id)}

    out = []
    for k, i in enumerate(intents):
        ids = [tix[t] for t in rows[rows.intent_id == i].ticket_id.unique()]
        w = np.asarray(X[ids].mean(axis=0)).ravel()
        terms = [vocab[j] for j in np.argsort(-w) if safe[j] and w[j] > 0][:8]
        nn = [j for j in np.argsort(-S[k]) if j != k][:5]
        out.append({"intent": i, "x": round(float(xy[k, 0]), 4), "y": round(float(xy[k, 1]), 4), "terms": terms,
                    "nearest": [{"intent": intents[j], "sim": round(float(S[k, j]), 3)} for j in nn]})
    sp = pd.DataFrame(out)
    (OUT / "dashboard" / "intent_space.json").write_text(json.dumps(out, separators=(",", ":"), ensure_ascii=False))

    dom = meta.domain.reindex(intents).to_numpy()
    same = np.mean([np.mean([dom[j] == dom[k] for j in np.argsort(-S[k])[1:6]]) for k in range(len(intents))])
    sp.assign(name=sp.intent.map(meta.name), domain=sp.intent.map(meta.domain), terms=sp.terms.map(", ".join),
              nearest=sp.nearest.map(lambda v: ", ".join(f"{meta.loc[n['intent'], 'name']} ({n['sim']})" for n in v))) \
        .sort_values(["domain", "name"]).to_csv(OUT / "12_intent_space.csv", index=False)
    q = pd.DataFrame([("intents", len(intents)), ("embedding model", MODEL), ("distinct titles embedded", len(uniq)),
                      ("layout stability: mean Procrustes disparity across 4 seeds (0 = identical)", round(stability, 3)),
                      ("share of each intent's 5 nearest neighbours in the same category", round(float(same), 3))],
                     columns=["measure", "value"])
    q.to_csv(OUT / "12_space_quality.csv", index=False)
    print(q.to_string(index=False))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else ROOT / "data" / "travel.sqlite")
