"""Builds corpus.json for the rag-pipeline simulator. Run: python3 -I build.py (from any directory).

LSA word vectors: TF-IDF over handbook paragraphs (log tf x idf, rows L2-normalised), then a truncated
SVD A = U S V^T. The word vectors are the rows of V_k S_k. The browser embeds any chunk or query as the
TF-IDF-weighted sum of its word vectors, L2-normalised (LSA "fold-in" up to scale), so chunking can
change at runtime without a model. Tokeniser and stemmer must match tokenize() in model.ts.
"""
import base64, json, math, pathlib, re
import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
DIM = 32
STOP = sorted(set("""a an and are as at be by can for from has have if in into is it its of on or our that the their
them then there these this to was we were will with you your not do does any all may must should would could than
which who what when where how also only such each per so up out about after before over under other more most no
i me my am being been he she they his her us one""".split()))
STOPSET = set(STOP)


def stem(w):
    # Plural folding only; mirrored exactly in model.ts.
    if len(w) > 4 and w.endswith("ies"): return w[:-3] + "y"
    if len(w) > 4 and w.endswith(("ses", "xes", "zes", "ches", "shes")): return w[:-2]
    if len(w) > 3 and w.endswith("s") and not w.endswith(("ss", "us", "is")): return w[:-1]
    return w


def tokenize(text):
    return [stem(w) for w in re.findall(r"[a-z0-9]+", text.lower()) if w not in STOPSET]


docs = []
for p in sorted((HERE / "handbook").glob("*.md")):
    text = p.read_text().strip() + "\n"
    title = text.splitlines()[0].lstrip("# ").strip()
    docs.append({"id": p.stem, "title": title, "text": text})

src = json.loads((HERE / "questions.json").read_text())
for q in src["questions"]:
    hits = [d["id"] for d in docs for g in q["gold"] if g in d["text"]]
    assert len(hits) == len(q["gold"]), f"{q['id']}: gold passage not found verbatim"
    q["doc"] = hits[0]
for r in src["revisions"]:
    d = next(d for d in docs if d["id"] == r["doc"])
    assert d["text"].count(r["current"]) == 1, r

# Paragraphs (with their section heading) are the LSA training "documents"; eval questions are never used.
paras = []
for d in docs:
    head = ""
    for block in re.split(r"\n\s*\n", d["text"]):
        b = block.strip()
        if b.startswith("#"):
            head = b.lstrip("# ") if b.startswith("## ") else ""
            continue
        paras.append(tokenize(f"{d['title']} {head} {b}"))

vocab = sorted({t for p in paras for t in p})
ix = {t: i for i, t in enumerate(vocab)}
n = len(paras)
df = np.zeros(len(vocab))
for p in paras:
    for t in set(p): df[ix[t]] += 1
idf = np.log(n / df) + 1.0
A = np.zeros((n, len(vocab)))
for r, p in enumerate(paras):
    for t in p: A[r, ix[t]] += 1
A = np.where(A > 0, 1 + np.log(np.maximum(A, 1)), 0) * idf
A /= np.linalg.norm(A, axis=1, keepdims=True)
_, S, Vt = np.linalg.svd(A, full_matrices=False)
W = (Vt[:DIM].T * S[:DIM])  # terms x DIM

# int8 per-row quantisation keeps the file small; cosine error is far below ranking noise.
scale = np.abs(W).max(axis=1) + 1e-12
q8 = np.round(W / scale[:, None] * 127).astype(np.int8)

out = {
    "dim": DIM, "stop": STOP, "docs": docs,
    "questions": src["questions"], "revisions": src["revisions"],
    "vocab": vocab, "idf": [round(float(x), 4) for x in idf],
    "scale": [float(f"{x:.4g}") for x in scale],
    "vectors": base64.b64encode(q8.tobytes()).decode(),
    "stats": {"paragraphs": n, "words": sum(len(re.findall(r"\S+", d["text"])) for d in docs),
              "explained": round(float((S[:DIM] ** 2).sum() / (S ** 2).sum()), 3)},
}
(HERE / "corpus.json").write_text(json.dumps(out, separators=(",", ":")))
print(f"{len(docs)} docs, {out['stats']['words']} words, {n} paragraphs, {len(vocab)} terms, "
      f"{DIM}-d explains {out['stats']['explained']:.0%} of variance, "
      f"{(HERE / 'corpus.json').stat().st_size // 1024} KB")
