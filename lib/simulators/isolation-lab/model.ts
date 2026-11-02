import type { SimModel } from "@/lib/sim/engine";

/*
 * A tiny MVCC engine that behaves like PostgreSQL for two sessions.
 * Every UPDATE writes a new row version stamped xmin = writer; the old one gets xmax = writer.
 * A snapshot decides which versions a statement sees: READ COMMITTED takes a new one per
 * statement, REPEATABLE READ and SERIALIZABLE take one at the first statement of the transaction.
 * Writers take row locks; a second writer waits. When the first commits, READ COMMITTED re-checks
 * the newest version and carries on, the other levels fail with 40001 (first updater wins).
 * SERIALIZABLE also tracks read→write dependencies (like Postgres SSI) and aborts the transaction
 * that would complete a cycle.
 */

export type Level = "READ COMMITTED" | "REPEATABLE READ" | "SERIALIZABLE";
export const LEVELS: Level[] = ["READ COMMITTED", "REPEATABLE READ", "SERIALIZABLE"];
export type ScenarioId = "dirty-read" | "non-repeatable" | "phantom" | "lost-update" | "write-skew";
export type Technique = "naive" | "atomic" | "for-update" | "version";
export const TECHNIQUES: { id: Technique; label: string }[] = [
  { id: "naive", label: "Read, then write back" },
  { id: "atomic", label: "Atomic UPDATE likes = likes + 1" },
  { id: "for-update", label: "SELECT … FOR UPDATE" },
  { id: "version", label: "Version column (optimistic)" },
];

type Val = number | string | boolean;
export type Row = Record<string, Val>;
type Mem = Record<string, Val>;
type S = 1 | 2;

type Op =
  | { k: "begin" } | { k: "commit" } | { k: "rollback" }
  | { k: "select"; keys?: string[]; where?: (r: Row) => boolean; count?: boolean; cols?: string[]; forUpdate?: boolean }
  | { k: "update"; key: string; set: (r: Row, m: Mem) => Row; where?: (r: Row, m: Mem) => boolean }
  | { k: "insert"; key: string; data: Row };
export interface Step { s: S; sql: string | ((m: Mem) => string); op: Op }

export interface Version { key: string; data: Row; xmin: number; xmax?: number }
interface Snap { xmax: number; active: number[] }
export interface Tx {
  xid: number; s: S; level: Level;
  status: "active" | "committed" | "aborted" | "failed";
  snap?: Snap; startSeq: number; endSeq?: number;
  readAll: boolean; readKeys: string[]; writes: string[];
}
export interface Line { step: number; sql: string; kind: "ok" | "err" | "wait" | "info"; result: string }
export interface Session { level: Level; xid?: number; queue: number[]; blockedOn?: string; mem: Mem; reads: Val[]; lines: Line[] }

export interface Outcome { anomaly: boolean; title: string; text: string }
export interface IsoState {
  scenario: ScenarioId; technique: Technique; table: string;
  versions: Version[]; txs: Record<number, Tx>; nextXid: number; seq: number;
  locks: Record<string, number>; rw: [number, number][];
  sessions: Record<S, Session>;
  cursor: number; acc: number; waits: number; failures: number;
  outcome?: Outcome;
  /** Every finished run, kept across scenario switches so challenges can add them up. */
  runs: { scenario: ScenarioId; technique: Technique; levels: [Level, Level]; anomaly: boolean }[];
}
export interface IsoConfig { stepSeconds: number }

const RC = (l: Level) => l === "READ COMMITTED";
const ERR_SERIAL = "ERROR 40001: could not serialize access due to concurrent update";
const ERR_SSI = "ERROR 40001: could not serialize access due to read/write dependencies among transactions";
const ERR_ABORTED = "ERROR 25P02: current transaction is aborted, commands ignored until end of transaction block";

// ── Scenarios ───────────────────────────────────────────────────────────────

const ACCOUNTS: Record<string, Row> = { "1": { id: 1, owner: "alice", balance: 100 }, "2": { id: 2, owner: "bob", balance: 50 } };
const begin = (s: S): Step => ({ s, sql: "BEGIN", op: { k: "begin" } });
const commit = (s: S): Step => ({ s, sql: "COMMIT", op: { k: "commit" } });
const bal = (s: S): Step => ({ s, sql: "SELECT balance FROM accounts WHERE id = 1", op: { k: "select", keys: ["1"], cols: ["balance"] } });
const likes = (s: S, forUpdate = false, version = false): Step => ({
  s, sql: `SELECT likes${version ? ", version" : ""} FROM posts WHERE id = 7${forUpdate ? " FOR UPDATE" : ""}`,
  op: { k: "select", keys: ["7"], cols: version ? ["likes", "version"] : ["likes"], forUpdate },
});
/** The app's value from an earlier SELECT, or a placeholder before it has run. */
const plus1 = (m: Mem, k: string) => (m[k] === undefined ? `:${k} + 1` : String(Number(m[k]) + 1));
const writeBack = (s: S): Step => ({
  s, sql: (m) => `UPDATE posts SET likes = ${plus1(m, "likes")} WHERE id = 7  -- read ${m.likes ?? ":likes"}, +1 in the app`,
  op: { k: "update", key: "7", set: (r, m) => ({ ...r, likes: Number(m.likes) + 1 }) },
});
const casWrite = (s: S): Step => ({
  s, sql: (m) => `UPDATE posts SET likes = ${plus1(m, "likes")}, version = ${plus1(m, "version")} WHERE id = 7 AND version = ${m.version ?? ":version"}`,
  op: { k: "update", key: "7", set: (r, m) => ({ ...r, likes: Number(m.likes) + 1, version: Number(m.version) + 1 }), where: (r, m) => r.version === m.version },
});
const atomic = (s: S): Step => ({ s, sql: "UPDATE posts SET likes = likes + 1 WHERE id = 7", op: { k: "update", key: "7", set: (r) => ({ ...r, likes: Number(r.likes) + 1 }) } });
const onCall = (s: S): Step => ({ s, sql: "SELECT count(*) FROM doctors WHERE on_call", op: { k: "select", where: (r) => r.on_call === true, count: true } });
const goOff = (s: S, name: string): Step => ({
  s, sql: (m) => `UPDATE doctors SET on_call = false WHERE name = '${name}'  -- app saw ${m.count ?? "?"} on call, needs ≥ 2`,
  op: { k: "update", key: name, set: (r) => ({ ...r, on_call: false }), where: (_r, m) => Number(m.count) >= 2 },
});

interface Scenario {
  id: ScenarioId; label: string; table: string; rows: Record<string, Row>; story: string;
  steps(t: Technique): Step[];
  judge(st: IsoState): Outcome;
}

const committedRow = (st: IsoState, key: string) => [...st.versions].reverse().find((v) => v.key === key && st.txs[v.xmin]?.status === "committed")?.data;
const levels = (st: IsoState) => `T1 ${st.sessions[1].level}, T2 ${st.sessions[2].level}`;

export const SCENARIOS: Scenario[] = [
  {
    id: "dirty-read", label: "Dirty read", table: "accounts", rows: ACCOUNTS,
    story: "T1 zeroes Alice's balance but then rolls back. Can T2 see the 0 that never really happened?",
    steps: () => [begin(1), { s: 1, sql: "UPDATE accounts SET balance = 0 WHERE id = 1", op: { k: "update", key: "1", set: (r) => ({ ...r, balance: 0 }) } }, begin(2), bal(2), { s: 1, sql: "ROLLBACK", op: { k: "rollback" } }, bal(2), commit(2)],
    judge: (st) => {
      const seen = st.sessions[2].reads;
      const dirty = seen.some((v) => v !== 100);
      return { anomaly: dirty, title: dirty ? "Dirty read" : "No dirty read — Postgres never allows one",
        text: `T2 read ${seen.join(" then ")}. A snapshot only contains committed transactions, so T1's uncommitted version (balance 0, xmin T1) is invisible at every level. Postgres even accepts READ UNCOMMITTED but runs it as READ COMMITTED. The rolled-back version stays in the table as a dead tuple until VACUUM removes it.` };
    },
  },
  {
    id: "non-repeatable", label: "Non-repeatable read", table: "accounts", rows: ACCOUNTS,
    story: "T1 reads Alice's balance twice. In between, T2 withdraws 30 and commits.",
    steps: () => [begin(1), bal(1), begin(2), { s: 2, sql: "UPDATE accounts SET balance = balance - 30 WHERE id = 1", op: { k: "update", key: "1", set: (r) => ({ ...r, balance: Number(r.balance) - 30 }) } }, commit(2), bal(1), commit(1)],
    judge: (st) => {
      const [a, b] = st.sessions[1].reads;
      const bad = a !== b;
      return { anomaly: bad, title: bad ? "Non-repeatable read" : "Repeatable: same answer twice",
        text: bad
          ? `T1 read ${a}, then ${b} in the same transaction. READ COMMITTED takes a fresh snapshot for every statement, so the second SELECT sees T2's commit. Fine for most web requests; wrong for a report that must add up.`
          : `T1 read ${a} both times. ${st.sessions[1].level} takes one snapshot at the first statement and keeps it, so T2's committed update (a newer version) stays invisible to T1 until it ends.` };
    },
  },
  {
    id: "phantom", label: "Phantom", table: "accounts", rows: ACCOUNTS,
    story: "T1 counts accounts with at least 50. T2 inserts a new one (Carol, 75) and commits. T1 counts again.",
    steps: () => [begin(1), { s: 1, sql: "SELECT count(*) FROM accounts WHERE balance >= 50", op: { k: "select", where: (r) => Number(r.balance) >= 50, count: true } }, begin(2), { s: 2, sql: "INSERT INTO accounts VALUES (3, 'carol', 75)", op: { k: "insert", key: "3", data: { id: 3, owner: "carol", balance: 75 } } }, commit(2), { s: 1, sql: "SELECT count(*) FROM accounts WHERE balance >= 50", op: { k: "select", where: (r) => Number(r.balance) >= 50, count: true } }, commit(1)],
    judge: (st) => {
      const [a, b] = st.sessions[1].reads;
      const bad = a !== b;
      return { anomaly: bad, title: bad ? "Phantom row" : "No phantom",
        text: bad
          ? `T1 counted ${a}, then ${b}: a row that matched the WHERE clause appeared mid-transaction. Locking existing rows can't stop this; the row didn't exist yet.`
          : `T1 counted ${a} both times. The SQL standard allows phantoms at REPEATABLE READ, but Postgres's snapshot hides rows inserted after it, so ${st.sessions[1].level} prevents them too. MySQL InnoDB uses gap locks for the same goal.` };
    },
  },
  {
    id: "lost-update", label: "Lost update", table: "posts", rows: { "7": { id: 7, likes: 10, version: 1 } },
    story: "Two users like post 7 at the same moment. Each transaction adds one like. The count must end at 12.",
    steps: (t) => {
      if (t === "atomic") return [begin(1), begin(2), atomic(1), atomic(2), commit(1), commit(2)];
      if (t === "for-update") return [begin(1), begin(2), likes(1, true), likes(2, true), writeBack(1), commit(1), writeBack(2), commit(2)];
      if (t === "version") return [begin(1), begin(2), likes(1, false, true), likes(2, false, true), casWrite(1), casWrite(2), commit(1), commit(2)];
      return [begin(1), begin(2), likes(1), likes(2), writeBack(1), writeBack(2), commit(1), commit(2)];
    },
    judge: (st) => {
      const final = Number(committedRow(st, "7")?.likes);
      const applied = Object.values(st.txs).filter((x) => x.status === "committed" && x.writes.includes("7")).length;
      const lost = final < 10 + applied;
      const failed = st.sessions[2].lines.some((l) => l.result.includes("40001"));
      const zero = st.sessions[2].lines.some((l) => l.result.startsWith("UPDATE 0"));
      const how: Record<Technique, string> = {
        naive: lost
          ? "Both transactions read 10 and wrote back 11. T2's UPDATE waited for T1's row lock, but under READ COMMITTED it then simply overwrote T1's committed value. One like vanished, and nobody got an error."
          : "T2's UPDATE waited for T1's lock; when T1 committed, the row had changed after T2's snapshot, so Postgres raised 40001 (first updater wins). Nothing was lost, but the app must catch 40001 and retry the whole transaction.",
        atomic: "The increment happens inside the UPDATE. T2 waited for T1's lock, then (under READ COMMITTED) re-read the newest committed version, 11, and added one. No read-modify-write gap in the app.",
        "for-update": "SELECT … FOR UPDATE took the row lock at read time, so T2's read waited until T1 committed and then returned the fresh value. The two read-modify-write cycles ran one after the other.",
        version: "Each UPDATE only matches if the version is still the one it read. T2 waited, re-checked the new version (2), matched 0 rows, and the app now knows to re-read and retry. No locks held between read and write.",
      };
      return { anomaly: lost, title: lost ? `Lost update: ${final} likes, expected ${10 + applied}` : `No lost update: ${final} likes`,
        text: `${how[st.technique]}${!lost && st.technique !== "naive" && (failed || zero) ? " The retry would bring the count to 12." : ""}` };
    },
  },
  {
    id: "write-skew", label: "Write skew", table: "doctors", rows: { alice: { name: "alice", on_call: true }, bob: { name: "bob", on_call: true } },
    story: "Rule: at least one doctor must stay on call. Alice and Bob both feel ill and each checks the rota before going off call.",
    steps: () => [begin(1), begin(2), onCall(1), onCall(2), goOff(1, "alice"), goOff(2, "bob"), commit(1), commit(2)],
    judge: (st) => {
      const left = ["alice", "bob"].filter((k) => committedRow(st, k)?.on_call === true).length;
      const bad = left === 0;
      return { anomaly: bad, title: bad ? "Write skew: nobody is on call" : `Rule holds: ${left} on call`,
        text: bad
          ? `Both saw 2 on call, each updated a different row, so there was no row-lock conflict and both committed (${levels(st)}). Snapshots stopped neither: the bug is in a decision based on data the other transaction changed. Fix: SERIALIZABLE for both, or lock the rows you checked (SELECT … FOR UPDATE), or turn the rule into a constraint.`
          : "Under SERIALIZABLE, Postgres records that each transaction read a row the other wrote (two read→write dependencies form a cycle). The first to commit wins and the second gets 40001, so the app retries, sees 1 on call and stays. Postgres only checks this among SERIALIZABLE transactions." };
    },
  },
];
export const scenarioOf = (id: ScenarioId) => SCENARIOS.find((s) => s.id === id)!;
export const stepsOf = (st: IsoState) => scenarioOf(st.scenario).steps(st.technique);
export const sqlOf = (step: Step, m: Mem) => (typeof step.sql === "string" ? step.sql : step.sql(m));

// ── MVCC engine ─────────────────────────────────────────────────────────────

const fresh = (scenario: ScenarioId, technique: Technique, lv: [Level, Level], runs: IsoState["runs"]): IsoState => {
  const sc = scenarioOf(scenario);
  const session = (level: Level): Session => ({ level, queue: [], mem: {}, reads: [], lines: [] });
  return {
    scenario, technique, table: sc.table,
    // xid 0 is the setup transaction that loaded the table; it committed long ago.
    versions: Object.entries(sc.rows).map(([key, data]) => ({ key, data, xmin: 0 })),
    txs: { 0: { xid: 0, s: 1, level: "READ COMMITTED", status: "committed", startSeq: 0, endSeq: 0, readAll: false, readKeys: [], writes: [] } },
    nextXid: 1, seq: 1, locks: {}, rw: [], sessions: { 1: session(lv[0]), 2: session(lv[1]) },
    cursor: 0, acc: 0, waits: 0, failures: 0, runs,
  };
};

const snapNow = (st: IsoState): Snap => ({ xmax: st.nextXid, active: Object.values(st.txs).filter((x) => x.status === "active" || x.status === "failed").map((x) => x.xid) });
/** Does this transaction, through this snapshot, see the effects of xid? */
const sees = (st: IsoState, tx: Tx, snap: Snap, xid: number) =>
  xid === tx.xid || (st.txs[xid]?.status === "committed" && xid < snap.xmax && !snap.active.includes(xid));
const visible = (st: IsoState, tx: Tx, snap: Snap, v: Version) => sees(st, tx, snap, v.xmin) && !(v.xmax !== undefined && sees(st, tx, snap, v.xmax));
/** Newest version that is committed or our own: what a writer would update. */
const latest = (st: IsoState, tx: Tx, key: string) =>
  [...st.versions].reverse().find((v) => v.key === key && (v.xmin === tx.xid || st.txs[v.xmin]?.status === "committed"));

function statementSnap(st: IsoState, tx: Tx) {
  if (RC(tx.level) || !tx.snap) tx.snap = snapNow(st);
  return tx.snap;
}

const isSer = (tx: Tx) => tx.level === "SERIALIZABLE";
const addEdge = (st: IsoState, from: number, to: number) => { if (from !== to && !st.rw.some(([a, b]) => a === from && b === to)) st.rw.push([from, to]); };
/** Overlapping lifetimes: neither ended before the other started. */
const concurrent = (a: Tx, b: Tx) => (a.endSeq ?? Infinity) > b.startSeq && (b.endSeq ?? Infinity) > a.startSeq;

function trackRead(st: IsoState, tx: Tx, snap: Snap, keys: string[] | undefined) {
  if (!isSer(tx)) return;
  if (keys) keys.forEach((k) => { if (!tx.readKeys.includes(k)) tx.readKeys.push(k); }); else tx.readAll = true;
  // Reading around a concurrent write we can't see: we come "before" that writer.
  for (const w of Object.values(st.txs)) {
    if (w.xid === tx.xid || !isSer(w) || w.status === "aborted" || sees(st, tx, snap, w.xid)) continue;
    if (w.writes.some((k) => !keys || keys.includes(k))) addEdge(st, tx.xid, w.xid);
  }
}
function trackWrite(st: IsoState, tx: Tx, key: string) {
  if (!tx.writes.includes(key)) tx.writes.push(key);
  if (!isSer(tx)) return;
  for (const r of Object.values(st.txs)) {
    if (r.xid === tx.xid || !isSer(r) || r.status === "aborted" || !concurrent(r, tx)) continue;
    if (r.readAll || r.readKeys.includes(key)) addEdge(st, r.xid, tx.xid);
  }
}
/** Postgres SSI's "dangerous structure": we are the pivot of in → us → out, and out already committed. */
const ssiConflict = (st: IsoState, tx: Tx) =>
  isSer(tx) && st.rw.some(([a, b]) => b === tx.xid && st.txs[a].status !== "aborted") && st.rw.some(([a, b]) => a === tx.xid && st.txs[b].status === "committed");

type Res = { kind: Line["kind"]; result: string } | { wait: string };

/** Take the row lock or report who holds it. */
function lock(st: IsoState, tx: Tx, key: string): number | undefined {
  const holder = st.locks[key];
  if (holder !== undefined && holder !== tx.xid && st.txs[holder].status !== "committed" && st.txs[holder].status !== "aborted") return holder;
  st.locks[key] = tx.xid;
}

function fail(st: IsoState, tx: Tx, msg: string): Res {
  tx.status = "failed";
  st.failures++;
  return { kind: "err", result: msg };
}

function end(st: IsoState, tx: Tx, status: "committed" | "aborted") {
  tx.status = status;
  tx.endSeq = st.seq++;
  for (const k of Object.keys(st.locks)) if (st.locks[k] === tx.xid) delete st.locks[k];
  st.sessions[tx.s].xid = undefined;
}

function exec(st: IsoState, sess: Session, s: S, op: Op): Res {
  if (op.k === "begin") {
    const tx: Tx = { xid: st.nextXid++, s, level: sess.level, status: "active", startSeq: st.seq++, readAll: false, readKeys: [], writes: [] };
    st.txs[tx.xid] = tx;
    sess.xid = tx.xid;
    return { kind: "info", result: `BEGIN · T${s} is xid ${tx.xid} · ${sess.level}` };
  }
  const tx = sess.xid !== undefined ? st.txs[sess.xid] : undefined;
  if (!tx) return { kind: "err", result: "WARNING: there is no transaction in progress" };
  if (op.k === "rollback") { end(st, tx, "aborted"); return { kind: "info", result: "ROLLBACK" }; }
  if (op.k === "commit") {
    if (tx.status === "failed") { end(st, tx, "aborted"); return { kind: "err", result: "ROLLBACK (the transaction had failed)" }; }
    if (ssiConflict(st, tx)) { fail(st, tx, ERR_SSI); end(st, tx, "aborted"); return { kind: "err", result: ERR_SSI }; }
    end(st, tx, "committed");
    return { kind: "ok", result: "COMMIT" };
  }
  if (tx.status === "failed") return { kind: "err", result: ERR_ABORTED };

  if (op.k === "select") {
    // The snapshot is taken when the statement starts, before any lock wait.
    if (op.forUpdate) for (const k of op.keys ?? []) {
      const snap = statementSnap(st, tx);
      const holder = lock(st, tx, k);
      if (holder !== undefined) return { wait: `waiting for row lock on ${k} held by xid ${holder}` };
      const vis = st.versions.find((v) => v.key === k && visible(st, tx, snap, v));
      if (!RC(tx.level) && vis !== latest(st, tx, k)) return fail(st, tx, ERR_SERIAL);
    }
    const snap = statementSnap(st, tx);
    trackRead(st, tx, snap, op.keys);
    const rows = st.versions.filter((v) => visible(st, tx, snap, v) && (!op.keys || op.keys.includes(v.key)) && (!op.where || op.where(v.data))).map((v) => v.data);
    if (op.count) { sess.mem.count = rows.length; sess.reads.push(rows.length); return { kind: "ok", result: `count = ${rows.length}` }; }
    const r = rows[0];
    if (!r) return { kind: "ok", result: "(0 rows)" };
    for (const c of op.cols ?? []) sess.mem[c] = r[c];
    sess.reads.push(r[(op.cols ?? [])[0]]);
    return { kind: "ok", result: (op.cols ?? []).map((c) => `${c} = ${r[c]}`).join(", ") };
  }

  if (op.k === "insert") {
    st.versions.push({ key: op.key, data: op.data, xmin: tx.xid });
    st.locks[op.key] = tx.xid;
    trackWrite(st, tx, op.key);
    return { kind: "ok", result: "INSERT 0 1" };
  }

  // UPDATE: find the row in our snapshot, take its lock, then check nobody committed a newer version.
  const snap = statementSnap(st, tx);
  const vis = st.versions.find((v) => v.key === op.key && visible(st, tx, snap, v));
  if (!vis) return { kind: "ok", result: "UPDATE 0" };
  const holder = lock(st, tx, op.key);
  if (holder !== undefined) return { wait: `waiting for row lock on ${op.key} held by xid ${holder}` };
  const cur = latest(st, tx, op.key)!;
  if (cur !== vis && !RC(tx.level)) return fail(st, tx, ERR_SERIAL);
  trackRead(st, tx, snap, [op.key]);
  // READ COMMITTED re-checks the WHERE clause against the newest committed version (EvalPlanQual).
  if (op.where && !op.where(cur.data, sess.mem)) return { kind: "ok", result: "UPDATE 0" };
  cur.xmax = tx.xid;
  st.versions.push({ key: op.key, data: op.set(cur.data, sess.mem), xmin: tx.xid });
  trackWrite(st, tx, op.key);
  return { kind: "ok", result: cur !== vis ? "UPDATE 1 (re-checked the newer version)" : "UPDATE 1" };
}

/** Runs a session's queued statements until one blocks. Waking up another session may cascade. */
function drain(st: IsoState, s: S) {
  const sess = st.sessions[s];
  const steps = stepsOf(st);
  while (sess.queue.length) {
    const i = sess.queue[0];
    const step = steps[i];
    const res = exec(st, sess, s, step.op);
    if ("wait" in res) {
      if (!sess.blockedOn) { sess.blockedOn = res.wait; st.waits++; sess.lines.push({ step: i, sql: sqlOf(step, sess.mem), kind: "wait", result: res.wait }); }
      return;
    }
    const resumed = !!sess.blockedOn;
    sess.blockedOn = undefined;
    sess.queue.shift();
    const line = { step: i, sql: sqlOf(step, sess.mem), kind: res.kind, result: resumed ? `${res.result} (after waiting)` : res.result };
    if (resumed) sess.lines[sess.lines.length - 1] = line; else sess.lines.push(line);
    const other: S = s === 1 ? 2 : 1;
    if ((step.op.k === "commit" || step.op.k === "rollback" || res.kind === "err") && st.sessions[other].blockedOn) drain(st, other);
  }
}

export const isDone = (st: IsoState) => st.cursor >= stepsOf(st).length && !st.sessions[1].queue.length && !st.sessions[2].queue.length;

export function stepOnce(st: IsoState): IsoState {
  const steps = stepsOf(st);
  if (st.cursor >= steps.length) return st;
  const i = st.cursor++;
  st.sessions[steps[i].s].queue.push(i);
  drain(st, steps[i].s);
  if (isDone(st) && !st.outcome) {
    st.outcome = scenarioOf(st.scenario).judge(st);
    st.runs.push({ scenario: st.scenario, technique: st.technique, levels: [st.sessions[1].level, st.sessions[2].level], anomaly: st.outcome.anomaly });
  }
  return st;
}
export const runAll = (st: IsoState) => { while (st.cursor < stepsOf(st).length) stepOnce(st); return st; };

/** What each session would see right now if it ran a plain SELECT: for the version table. */
export function seenBy(st: IsoState, s: S, v: Version) {
  const xid = st.sessions[s].xid;
  const tx = xid !== undefined ? st.txs[xid] : undefined;
  const probe: Tx = tx ?? { xid: -1, s, level: "READ COMMITTED", status: "active", startSeq: st.seq, readAll: false, readKeys: [], writes: [] };
  const snap = tx?.snap && !RC(tx.level) ? tx.snap : snapNow(st);
  return visible(st, probe, snap, v);
}

// ── Challenges' view of progress ────────────────────────────────────────────

/** Techniques that ran the lost-update scenario to the end without losing a like. "isolation" = naive SQL saved by REPEATABLE READ or SERIALIZABLE. */
export const lostUpdateFixes = (st: IsoState) =>
  [...new Set(st.runs.filter((r) => r.scenario === "lost-update" && !r.anomaly).map((r) => (r.technique === "naive" ? "isolation" : r.technique)))];
export const scenariosSeen = (st: IsoState) => [...new Set(st.runs.map((r) => r.scenario))];
export const writeSkewStopped = (st: IsoState) => st.runs.some((r) => r.scenario === "write-skew" && !r.anomaly);

// ── SimModel ────────────────────────────────────────────────────────────────

interface LoadPayload { scenario?: ScenarioId; technique?: Technique; level1?: Level; level2?: Level }

export const isoModel: SimModel<IsoConfig, IsoState> = {
  init: () => fresh("lost-update", "naive", ["READ COMMITTED", "READ COMMITTED"], []),
  tick(st, ctx) {
    if (isDone(st)) return st;
    st.acc += ctx.dt;
    if (st.acc < ctx.config.stepSeconds * 1000) return st;
    st.acc = 0;
    const steps = stepsOf(st);
    const before = st.cursor;
    stepOnce(st);
    const s = steps[before].s;
    const line = st.sessions[s].lines.at(-1);
    if (line) ctx.log(line.kind === "err" ? "error" : line.kind === "wait" ? "warn" : "info", `T${s}: ${line.sql} → ${line.result}`);
    return st;
  },
  // Actions return a copy so a paused view re-renders; state is plain data (scenario closures live in SCENARIOS).
  actions: {
    step: (st) => stepOnce(structuredClone(st)),
    run: (st) => runAll(structuredClone(st)),
    /** Switch scenario, technique or levels; always restarts the run but keeps finished-run history. */
    load: (st, p) => {
      const q = (p ?? {}) as LoadPayload;
      return fresh(q.scenario ?? st.scenario, q.technique ?? st.technique, [q.level1 ?? st.sessions[1].level, q.level2 ?? st.sessions[2].level], st.runs);
    },
  },
  faults: [],
  metrics: (st) => ({
    step: st.cursor,
    waits: st.waits,
    failures: st.failures,
    anomalies: st.runs.filter((r) => r.anomaly).length,
    fixes: lostUpdateFixes(st).length,
    seen: scenariosSeen(st).length,
  }),
};
