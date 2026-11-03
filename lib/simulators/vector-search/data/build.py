"""Builds corpus.json for the vector-search simulator: run `python3 -I build.py` in this folder.

2,000 short support-desk texts for Tallowby (a fictional smart-thermostat company), generated from
per-topic phrase lists and templates. Then real LSA embeddings: TF-IDF (sublinear tf, smoothed idf,
L2 rows) -> truncated SVD to 64 dimensions -> L2-normalised, quantised to int8. Queries are folded in
with the same projection (q . V_k). A 2-D PCA of the 64-d vectors is stored for the scatter plot.
"""
import base64, json, math, random, re
from collections import Counter
from pathlib import Path
import numpy as np

SEED, N, DIM = 27, 2000, 64
rnd = random.Random(SEED)

TOPICS = ["Billing", "Shipping", "Sign-in", "Mobile app", "API", "Outages", "Thermostat", "Privacy"]
SOURCES = ["docs", "forum", "ticket", "changelog"]
SOURCE_W = [0.40, 0.25, 0.25, 0.10]
YEARS = list(range(2019, 2027))
YEAR_W = [10, 10, 12, 12, 14, 15, 15, 12]

# Per topic: nouns (N), problems (P), actions (A). Shared words ("account", "app", "error", "update",
# "order", "schedule") appear in several topics on purpose, so the clusters overlap.
V = {
    "Billing": dict(
        N=["my monthly invoice", "the annual plan price", "a refund for my order", "the card on my account", "the Pro plan charge", "a duplicate payment", "the invoice total", "my billing address", "the tax line on the receipt", "a promo code"],
        P=["shows the wrong amount", "was charged twice", "is still pending after a week", "did not apply the discount", "renewed without a reminder", "failed with a card error", "lists a plan I cancelled", "includes sales tax twice", "was billed in the wrong currency", "never arrived by email"],
        A=["update the card on file", "download past invoices", "cancel the annual plan", "switch to monthly billing", "request a refund", "change the billing email", "add a VAT number", "apply a promo code at checkout", "pause my subscription", "see the next charge date"]),
    "Shipping": dict(
        N=["my thermostat order", "the replacement unit", "the tracking number", "a return label", "the delivery to my flat", "the courier", "a damaged parcel", "the second package", "my exchange", "the order confirmation"],
        P=["is stuck in transit", "was left at the wrong address", "arrived with a cracked box", "has not shipped after ten days", "shows delivered but never came", "was returned to the warehouse", "needs a signature I cannot give", "is missing the wall plate", "was sent to my old address", "has no tracking updates"],
        A=["change the delivery address", "print a return label", "track a parcel", "exchange a faulty unit", "return an unopened order", "ship to a pickup point", "speed up delivery", "report a damaged parcel", "split an order into two shipments", "cancel an order before it ships"]),
    "Sign-in": dict(
        N=["my account password", "the two-factor code", "the login link", "my recovery email", "a new phone for authentication", "the security key", "my shared household account", "the session on my laptop", "an unknown login alert", "single sign-on"],
        P=["never arrives by text", "expires before I can use it", "keeps logging me out", "says the account is locked", "rejects the correct password", "shows a login from another country", "loops back to the sign-in page", "does not accept my security key", "sends the reset email to an old address", "asks for a code I cannot get"],
        A=["reset my password", "turn on two-factor authentication", "remove a lost phone", "sign out of every device", "add a security key", "change my login email", "unlock my account", "invite a family member to the account", "set up single sign-on for the team", "review recent login activity"]),
    "Mobile app": dict(
        N=["the Android app", "the iOS app", "the home screen widget", "app notifications", "the room schedule screen", "the app update", "dark mode in the app", "the energy report tab", "the app on my tablet", "the setup wizard in the app"],
        P=["crashes on launch", "drains the phone battery", "freezes when I open the schedule", "stopped sending notifications", "shows a blank screen after the update", "will not find the thermostat", "logs me out every morning", "displays the wrong temperature unit", "is stuck on the loading spinner", "uses a lot of mobile data"],
        A=["reinstall the app", "turn on push notifications", "add the widget to my home screen", "switch the app to Celsius", "clear the app cache", "edit the weekly schedule in the app", "share the app with my partner", "join the beta version of the app", "export the energy report from the app", "pair the app with a new thermostat"]),
    "API": dict(
        N=["the REST API", "a webhook endpoint", "my API key", "the rate limit", "the temperature events stream", "OAuth token refresh", "the Python client library", "pagination on the devices endpoint", "the API changelog", "webhook signatures"],
        P=["returns 429 too many requests", "times out after thirty seconds", "sends duplicate webhook events", "rejects a valid token", "returns an empty list of devices", "changed its response format", "fails the signature check", "skips events during retries", "returns 500 errors under load", "ignores the page cursor"],
        A=["rotate an API key", "verify a webhook signature", "raise the rate limit", "subscribe to temperature events", "refresh an OAuth token", "page through all devices", "retry failed webhook deliveries", "test webhooks locally", "read the schedule through the API", "migrate to version two of the API"]),
    "Outages": dict(
        N=["the cloud service", "the status page", "remote control of the thermostat", "the dashboard", "schedule sync", "the morning outage", "the incident report", "device connectivity", "the regional data centre", "service in Europe"],
        P=["is down for everyone", "is slow during the evening peak", "was unavailable for two hours", "shows degraded performance", "lost updates during the incident", "recovered but schedules did not sync", "has elevated error rates", "failed over to another region", "keeps timing out", "was not reported on the status page"],
        A=["check the status page", "subscribe to incident updates", "read the incident report", "control the thermostat offline", "report an outage", "see the uptime history", "get credit for downtime", "find out when service will recover", "set up outage alerts", "understand what caused the incident"]),
    "Thermostat": dict(
        N=["the thermostat", "the firmware update", "the wall plate wiring", "the temperature sensor", "the heat pump setting", "the boiler connection", "the display", "the battery", "the room sensor", "the eco schedule"],
        P=["reads three degrees too warm", "will not install the firmware", "keeps the heating on all night", "shows a wiring error on the display", "loses its Wi-Fi connection", "clicks but the boiler does not start", "drains its battery in a week", "ignores the eco schedule", "restarts every few hours", "has a blank display"],
        A=["install the firmware update", "calibrate the temperature sensor", "wire the thermostat to a combi boiler", "set up a heat pump", "replace the battery", "reconnect to Wi-Fi", "factory reset the thermostat", "add a room sensor", "set an eco schedule", "mount the wall plate"]),
    "Privacy": dict(
        N=["my personal data", "the data export", "location history", "usage data sharing", "the privacy policy", "my account deletion request", "cookies on the website", "data kept after cancellation", "energy usage records", "third-party integrations"],
        P=["is shared with partners without asking", "has not finished after a week", "is stored longer than I expected", "includes data I thought was deleted", "cannot be turned off in the app", "changed without notice", "was processed outside the EU", "still shows in my export", "is collected even when I opt out", "lacks a clear retention period"],
        A=["download a copy of my data", "delete my account and data", "turn off location history", "opt out of usage data sharing", "see which integrations have access", "make a data access request", "change cookie settings", "limit how long data is kept", "remove a third-party integration", "read what data the thermostat collects"]),
}
CONTEXTS = ["on the web dashboard", "in the Android app", "in the iOS app", "after the latest update", "since yesterday",
            "for my team account", "for my holiday home", "with the Pro plan", "for customers in Canada", "every Monday morning",
            "on the second floor", "after moving house", "when I am travelling", "for the whole household"]
# Free-form details that any topic can carry: they add lexical noise, as real tickets do.
FILLERS = ["I have tried twice already", "my neighbour has the same problem", "this started last Tuesday", "the support chat closed before answering",
           "we have three of your thermostats", "please reply in the forum", "it worked fine in winter", "my partner set this up",
           "nothing in the help centre covers it", "I am on a slow rural connection", "the error code was E42", "it only happens at night",
           "we rent the flat", "I bought it as a gift", "screenshots are attached", "the reply came in Spanish", "it happened during the storm",
           "I need this fixed before Friday", "the local installer is not sure", "my old thermostat never did this", "the kids keep changing it",
           "this is the third ticket", "a friend recommended you", "I read the release notes", "the guide on your site is out of date",
           "it is a new build house", "my landlord wants a receipt", "the phone runs the latest version", "we switched energy supplier",
           "I am happy otherwise", "it seems random", "this costs us money every day"]
TEMPLATES = [
    "{N} {P} {C}.",
    "{N} {P}. {F}.",
    "{N} {P} {C}. {F}, and {F2}.",
    "How do I {A} {C}?",
    "Can't {A}: {N} {P}.",
    "{N} {P} when I try to {A2}.",
    "Guide: how to {A} and what to do if {N} {P}.",
    "{N} {P} again {C}; I already tried to {A2}.",
    "{F}. {N} {P}, so I want to {A2}.",
]


def make_text(t):
    v = V[t]
    other = V[rnd.choice([x for x in TOPICS if x != t])]
    cross = rnd.random() < 0.35  # second clause borrowed from another topic
    mixed = rnd.random() < 0.15  # the symptom itself belongs to another topic (an app crash during a billing step)
    return rnd.choice(TEMPLATES).format(N=rnd.choice(v["N"]), P=rnd.choice((other if mixed else v)["P"]), A=rnd.choice(v["A"]),
                                        A2=rnd.choice((other if cross else v)["A"]), C=rnd.choice(CONTEXTS), F=cap(rnd.choice(FILLERS)), F2=rnd.choice(FILLERS))


def cap(s):
    return s[0].upper() + s[1:]


docs, seen = [], set()
while len(docs) < N:
    t = TOPICS[len(docs) % len(TOPICS)]
    s = cap(make_text(t))
    if s in seen:
        continue
    seen.add(s)
    docs.append(dict(text=s, topic=TOPICS.index(t), source=rnd.choices(range(4), SOURCE_W)[0], year=rnd.choices(YEARS, YEAR_W)[0]))
rnd.shuffle(docs)

QUERIES = [
    "I was charged twice for one order",
    "Parcel says delivered but nothing arrived",
    "Two-factor text message never comes",
    "App crashes as soon as I open it",
    "Webhook keeps returning 429 rate limit errors",
    "Is the service down right now?",
    "Firmware update fails on my thermostat",
    "How do I delete all my personal data?",
    "Thermostat offline after the outage, schedule not synced",
    "Refund for a returned damaged unit",
    "API token expired and the app logs me out",
    "Energy report export from the app",
]

STOP = set("a an and the to of in on for my i is it be was at by with what do how can t if again already when try "
           "not after every all from that this as or are me but out up".split())


def tokens(s):
    return [w for w in re.findall(r"[a-z0-9]+", s.lower()) if w not in STOP]


toks = [tokens(d["text"]) for d in docs]
vocab = sorted({w for ts in toks for w in ts})
ix = {w: i for i, w in enumerate(vocab)}
df = Counter(w for ts in toks for w in set(ts))
idf = np.array([math.log((1 + N) / (1 + df[w])) + 1 for w in vocab])


def tfidf(ts):
    x = np.zeros(len(vocab))
    for w, c in Counter(ts).items():
        if w in ix:
            x[ix[w]] = (1 + math.log(c)) * idf[ix[w]]
    n = np.linalg.norm(x)
    return x / n if n else x


X = np.stack([tfidf(ts) for ts in toks])
U, S, Vt = np.linalg.svd(X, full_matrices=False)
Vk = Vt[:DIM].T  # vocab x 64; doc embedding = X . Vk = U_k S_k (LSA, Deerwester et al. 1990)


def unit(m):
    return m / np.maximum(np.linalg.norm(m, axis=-1, keepdims=True), 1e-12)


E = unit(X @ Vk)
Q = unit(np.stack([tfidf(tokens(q)) for q in QUERIES]) @ Vk)
mu = E.mean(axis=0)
_, _, Pt = np.linalg.svd(E - mu, full_matrices=False)
P2 = Pt[:2].T
xy, qxy = (E - mu) @ P2, (Q - mu) @ P2
scale = np.abs(xy).max()


def b64(a):
    return base64.b64encode(np.clip(np.round(a * 127), -127, 127).astype(np.int8).tobytes()).decode()


out = dict(
    company="Tallowby (fictional)", dim=DIM, topics=TOPICS, sources=SOURCES,
    texts=[d["text"] for d in docs], topic=[d["topic"] for d in docs], source=[d["source"] for d in docs], year=[d["year"] for d in docs],
    vec=b64(E), xy=b64(xy / scale),
    queries=QUERIES, qvec=b64(Q), qxy=b64(np.clip(qxy / scale, -1, 1)),
    note=f"LSA: TF-IDF over {len(vocab)} terms, SVD to {DIM} dims ({(S[:DIM] ** 2).sum() / (S ** 2).sum():.0%} of variance), int8",
)
p = Path(__file__).with_name("corpus.json")
p.write_text(json.dumps(out, separators=(",", ":")))
print(f"{p.name}: {p.stat().st_size / 1024:.0f} KB, {len(vocab)} terms, {out['note']}")
