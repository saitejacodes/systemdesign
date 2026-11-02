import type { SimModel } from "@/lib/sim/engine";

export type Track = "indexing" | "modeling" | "transactions";
export interface SqlConfig { track: Track }
export interface SqlState { passed: Record<string, true> }

// ---------- Database access (PGlite in the browser and in tests; nothing here imports it) ----------

type Row = Record<string, unknown>;
interface RawResult { rows: Row[]; fields: { name: string }[]; affectedRows?: number }
/** The slice of PGlite this module uses. */
export interface Db { exec(sql: string): Promise<RawResult[]>; query(sql: string): Promise<RawResult> }

export interface PlanNode { type: string; relation?: string; index?: string; startup: number; total: number; rows: number; actualMs?: number; actualRows?: number; detail?: string; children: PlanNode[] }
export interface QueryResult { sql: string; ok: boolean; error?: string; code?: string; fields: string[]; rows: Row[]; affected?: number; ms: number; plan?: PlanNode }
export interface ProbeResult { rows: Row[]; fields: string[]; error?: string; code?: string }
export type Probe = (sql: string) => Promise<ProbeResult>;

const errInfo = (e: unknown) => ({ error: e instanceof Error ? e.message : String(e), code: (e as { code?: string })?.code });

export const probeWith = (db: Db): Probe => async (sql) => {
  try {
    const r = await db.query(sql);
    return { rows: r.rows, fields: r.fields.map((f) => f.name) };
  } catch (e) {
    return { rows: [], fields: [], ...errInfo(e) };
  }
};

/** A whole input that is one EXPLAIN statement becomes EXPLAIN (…, FORMAT JSON) so it can be drawn as a tree. */
export function toJsonExplain(sql: string): string | null {
  const s = sql.trim().replace(/;\s*$/, "");
  if (s.includes(";")) return null;
  const m = /^explain\s+(?:\(([^)]*)\)\s*)?(analy[sz]e\s+)?(verbose\s+)?([\s\S]+)$/i.exec(s);
  if (!m) return null;
  if (m[1] && /format/i.test(m[1])) return null;
  const opts = [...(m[1] ? m[1].split(",").map((o) => o.trim()).filter(Boolean) : []), ...(m[2] ? ["ANALYZE"] : []), ...(m[3] ? ["VERBOSE"] : []), "FORMAT JSON"];
  return `EXPLAIN (${opts.join(", ")}) ${m[4]}`;
}

interface JsonPlan { "Node Type": string; "Relation Name"?: string; "Index Name"?: string; "Startup Cost": number; "Total Cost": number; "Plan Rows": number; "Actual Total Time"?: number; "Actual Rows"?: number; "Scan Direction"?: string; "Filter"?: string; "Index Cond"?: string; "Sort Key"?: string[]; Plans?: JsonPlan[] }

export function parsePlan(p: JsonPlan): PlanNode {
  const detail = p["Index Cond"] ? `Index Cond: ${p["Index Cond"]}` : p.Filter ? `Filter: ${p.Filter}` : p["Sort Key"] ? `Sort Key: ${p["Sort Key"].join(", ")}` : undefined;
  const type = p["Scan Direction"] === "Backward" ? `${p["Node Type"]} Backward` : p["Node Type"];
  return {
    type, relation: p["Relation Name"], index: p["Index Name"], startup: p["Startup Cost"], total: p["Total Cost"], rows: p["Plan Rows"],
    actualMs: p["Actual Total Time"], actualRows: p["Actual Rows"], detail, children: (p.Plans ?? []).map(parsePlan),
  };
}

export const planNodes = (n: PlanNode, depth = 0): { node: PlanNode; depth: number }[] => [{ node: n, depth }, ...n.children.flatMap((c) => planNodes(c, depth + 1))];
/** Cost a node adds on top of its children: the place to look first. */
export const selfCost = (n: PlanNode) => Math.max(0, n.total - n.children.reduce((a, c) => a + c.total, 0));

const planFromRows = (rows: Row[]): PlanNode | undefined => {
  const raw = rows[0]?.["QUERY PLAN"];
  const json = (typeof raw === "string" ? JSON.parse(raw) : raw) as { Plan: JsonPlan }[] | undefined;
  return json?.[0]?.Plan ? parsePlan(json[0].Plan) : undefined;
};

/** Runs editor SQL the way the sandbox does: several statements allowed, the last result is shown. */
export async function runSql(db: Db, sql: string, now: () => number = () => performance.now()): Promise<QueryResult> {
  const t0 = now();
  const explain = toJsonExplain(sql);
  try {
    if (explain) {
      const r = await db.query(explain);
      return { sql, ok: true, fields: [], rows: [], ms: now() - t0, plan: planFromRows(r.rows) };
    }
    const all = await db.exec(sql);
    const last = all.at(-1);
    return { sql, ok: true, fields: last?.fields.map((f) => f.name) ?? [], rows: last?.rows ?? [], affected: last?.affectedRows, ms: now() - t0 };
  } catch (e) {
    return { sql, ok: false, fields: [], rows: [], ms: now() - t0, ...errInfo(e) };
  }
}

export async function planOf(probe: Probe, sql: string) {
  const r = await probe(`EXPLAIN (FORMAT JSON) ${sql}`);
  return r.error ? undefined : planFromRows(r.rows);
}
const nodesOf = (p?: PlanNode) => (p ? planNodes(p).map((x) => x.node) : []);
const usesIndexOn = (p: PlanNode | undefined, rel: string) => nodesOf(p).some((n) => /Index/.test(n.type) && (n.relation === rel || !!n.index) && !(n.type.startsWith("Seq") && n.relation === rel));
const seqScanOn = (p: PlanNode | undefined, rel: string) => nodesOf(p).some((n) => n.type === "Seq Scan" && n.relation === rel);
const describe = (p?: PlanNode) => nodesOf(p).map((n) => n.type + (n.relation ? ` on ${n.relation}` : "")).join(" → ");

// ---------- Dataset: deterministic, generated in the database itself ----------

export const SIZES = { users: 50_000, posts: 200_000, follows: 300_000, orders: 100_000, orderItems: 250_000, products: 1_000, accounts: 10 };
export const INITIAL_STOCK_P1 = 11;
export const ACCOUNTS_TOTAL = 9 * 1000 + 50;
export const PAGE1_LAST_ID = SIZES.posts - 19;

/** Schema and data. Only primary keys are indexed, so the indexing track starts from slow plans. User 1 writes 1 post in 40, so their timeline is big enough that sorting it costs more than reading an index in order. */
export const SEED_SQL = `
CREATE TABLE users (id int PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE, country text NOT NULL, created_at timestamptz NOT NULL);
INSERT INTO users SELECT g, 'user' || g, 'user' || g || '@example.com', (ARRAY['IN','US','BR','DE','GB','JP','NG','FR'])[1 + g % 8], timestamptz '2024-01-01' + g * interval '9 minutes' FROM generate_series(1, ${SIZES.users}) g;
CREATE TABLE posts (id int PRIMARY KEY, user_id int NOT NULL REFERENCES users(id), body text NOT NULL, created_at timestamptz NOT NULL);
INSERT INTO posts SELECT g, CASE WHEN g % 40 = 0 THEN 1 ELSE 1 + (g * 7919) % ${SIZES.users} END, 'Post number ' || g, timestamptz '2025-01-01' + g * interval '2 minutes' FROM generate_series(1, ${SIZES.posts}) g;
CREATE TABLE follows (follower_id int NOT NULL REFERENCES users(id), followee_id int NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL, PRIMARY KEY (follower_id, followee_id));
INSERT INTO follows SELECT f, 1 + (f - 1 + 1 + k * 7919) % ${SIZES.users}, timestamptz '2025-01-01' + g * interval '1 minute'
  FROM generate_series(1, ${SIZES.follows}) g, LATERAL (SELECT 1 + (g - 1) % ${SIZES.users} AS f, (g - 1) / ${SIZES.users} AS k) x;
CREATE TABLE products (id int PRIMARY KEY, name text NOT NULL, category text NOT NULL, price_cents int NOT NULL, stock int NOT NULL CHECK (stock >= 0));
INSERT INTO products SELECT g, 'Product ' || g, (ARRAY['books','games','tools','music','garden'])[1 + g % 5], 199 + (g * 389) % 9800, 10 + g % 90 FROM generate_series(1, ${SIZES.products}) g;
CREATE TABLE orders (id int PRIMARY KEY, user_id int NOT NULL REFERENCES users(id), status text NOT NULL, total_cents int NOT NULL, created_at timestamptz NOT NULL);
INSERT INTO orders SELECT g, 1 + (g * 31) % ${SIZES.users}, (ARRAY['paid','shipped','delivered','refunded'])[1 + g % 4], 500 + (g * 7717) % 20000, timestamptz '2025-01-01' + g * interval '5 minutes' FROM generate_series(1, ${SIZES.orders}) g;
CREATE TABLE order_items (id int PRIMARY KEY, order_id int NOT NULL REFERENCES orders(id), product_id int NOT NULL REFERENCES products(id), qty int NOT NULL, price_cents int NOT NULL);
INSERT INTO order_items SELECT g, 1 + (g - 1) % ${SIZES.orders}, 1 + (g * 37 + (g - 1) / ${SIZES.orders} * 101) % ${SIZES.products}, 1 + g % 3, 199 + (g * 389) % 9800 FROM generate_series(1, ${SIZES.orderItems}) g;
CREATE TABLE accounts (id int PRIMARY KEY, owner text NOT NULL, balance int NOT NULL CHECK (balance >= 0));
INSERT INTO accounts SELECT g, 'owner' || g, CASE WHEN g = 3 THEN 50 ELSE 1000 END FROM generate_series(1, ${SIZES.accounts}) g;
CREATE TABLE bookings (id serial PRIMARY KEY, event_id int NOT NULL, seat text NOT NULL, user_id int NOT NULL);
`;

/** VACUUM can't run inside the implicit transaction of a multi-statement exec, so it runs on its own. */
export async function seed(db: Db) {
  await db.exec(SEED_SQL);
  await db.exec("VACUUM ANALYZE");
}

// ---------- Exercises ----------

export interface Verdict { pass: boolean; msg: string }
export interface Exercise { id: string; track: Track; title: string; goal: string; starter: string; hint: string; solution: string; check(last: QueryResult | null, probe: Probe): Promise<Verdict> }

const ok = (msg: string): Verdict => ({ pass: true, msg });
const no = (msg: string): Verdict => ({ pass: false, msg });
const needRun = no("Run a query first (Ctrl/Cmd + Enter).");
const count = async (probe: Probe, sql: string) => Number((await probe(sql)).rows[0]?.n ?? -1);
const hasColumns = async (probe: Probe, table: string, cols: string[]) => {
  const r = await probe(`SELECT column_name FROM information_schema.columns WHERE table_name = '${table}'`);
  const have = new Set(r.rows.map((x) => String(x.column_name)));
  return cols.filter((c) => !have.has(c));
};

/** Runs probe inserts inside a transaction that is always rolled back. Returns each statement's error code ("" for success). */
async function tryInserts(probe: Probe, stmts: string[]) {
  const codes: string[] = [];
  await probe("BEGIN");
  try {
    for (const [i, s] of stmts.entries()) {
      await probe(`SAVEPOINT p${i}`);
      const r = await probe(s);
      codes.push(r.error ? (r.code ?? "error") : "");
      if (r.error) await probe(`ROLLBACK TO SAVEPOINT p${i}`);
    }
  } finally {
    await probe("ROLLBACK");
  }
  return codes;
}

const ids = (rows: Row[], key = "id") => rows.map((r) => Number(r[key]));
const sameList = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

const FEED_REF = "SELECT p.id FROM posts p JOIN follows f ON f.followee_id = p.user_id WHERE f.follower_id = 1 ORDER BY p.created_at DESC LIMIT 20";
const N1_REF = "SELECT p.id, u.name FROM (SELECT * FROM posts ORDER BY created_at DESC LIMIT 20) p JOIN users u ON u.id = p.user_id ORDER BY p.created_at DESC";

export const EXERCISES: Exercise[] = [
  // Indexing
  {
    id: "idx-explain", track: "indexing", title: "Find the slow scan",
    goal: "This query finds one user's posts. Prefix it with EXPLAIN ANALYZE and run it. Find the node that reads the whole posts table.",
    starter: "SELECT * FROM posts WHERE user_id = 42;",
    hint: "Write EXPLAIN ANALYZE in front of the SELECT. Look for a Seq Scan with a Filter and lots of rows removed.",
    solution: "EXPLAIN ANALYZE SELECT * FROM posts WHERE user_id = 42;",
    async check(last) {
      if (!last) return needRun;
      if (!last.plan) return no("That wasn't an EXPLAIN. Put EXPLAIN ANALYZE in front of the query.");
      return seqScanOn(last.plan, "posts") ? ok("Found it: a Seq Scan reads all 200,000 posts to return a handful. That's what an index fixes.") : no(`The plan is ${describe(last.plan)}. Run it on the original query, before adding indexes.`);
    },
  },
  {
    id: "idx-add", track: "indexing", title: "Add the index",
    goal: "Create an index so `SELECT * FROM posts WHERE user_id = 42` uses an index instead of a sequential scan. Then EXPLAIN it again.",
    starter: "CREATE INDEX ...;\nEXPLAIN ANALYZE SELECT * FROM posts WHERE user_id = 42;",
    hint: "CREATE INDEX posts_user_id_idx ON posts (user_id);",
    solution: "CREATE INDEX posts_user_id_idx ON posts (user_id);",
    async check(_l, probe) {
      const p = await planOf(probe, "SELECT * FROM posts WHERE user_id = 42");
      return usesIndexOn(p, "posts") && !seqScanOn(p, "posts") ? ok(`The plan is now ${describe(p)}: a few page reads instead of 200,000 rows.`) : no(`The plan is still ${describe(p)}. Create an index on the column in the WHERE clause.`);
    },
  },
  {
    id: "idx-composite", track: "indexing", title: "Composite index order",
    goal: "User 1 has about 5,000 posts. Make `SELECT * FROM posts WHERE user_id = 1 ORDER BY created_at DESC LIMIT 20` run without a Sort node.",
    starter: "EXPLAIN ANALYZE SELECT * FROM posts WHERE user_id = 1 ORDER BY created_at DESC LIMIT 20;",
    hint: "Equality column first, then the sort column: CREATE INDEX ON posts (user_id, created_at). The planner can read it backwards for DESC.",
    solution: "CREATE INDEX posts_user_created_idx ON posts (user_id, created_at);",
    async check(_l, probe) {
      const p = await planOf(probe, "SELECT * FROM posts WHERE user_id = 1 ORDER BY created_at DESC LIMIT 20");
      const sorts = nodesOf(p).some((n) => n.type === "Sort");
      if (!usesIndexOn(p, "posts")) return no(`The plan is ${describe(p)}. Add an index that starts with user_id.`);
      return sorts ? no(`Still sorting: ${describe(p)}. The index needs created_at as its second column so rows come out in order.`) : ok(`${describe(p)}: rows come out of the index already in order, so there's nothing to sort.`);
    },
  },
  {
    id: "idx-covering", track: "indexing", title: "Covering index",
    goal: "Make `SELECT user_id, total_cents FROM orders WHERE user_id = 7` an Index Only Scan, so it never reads the table.",
    starter: "EXPLAIN ANALYZE SELECT user_id, total_cents FROM orders WHERE user_id = 7;",
    hint: "The index must contain every column the query reads: CREATE INDEX ON orders (user_id) INCLUDE (total_cents).",
    solution: "CREATE INDEX orders_user_cover_idx ON orders (user_id) INCLUDE (total_cents);",
    async check(_l, probe) {
      const p = await planOf(probe, "SELECT user_id, total_cents FROM orders WHERE user_id = 7");
      return nodesOf(p).some((n) => n.type === "Index Only Scan") ? ok("Index Only Scan: every column came from the index, so no table pages were read.") : no(`The plan is ${describe(p)}. An index on user_id alone still needs a trip to the table for total_cents.`);
    },
  },
  {
    id: "idx-bulk", track: "indexing", title: "Indexes slow bulk inserts",
    goal: "Create bulk_plain (no indexes) and bulk_indexed (3 or more indexes) with the same columns, insert 50,000 rows from posts into each, and compare the timings shown under the results.",
    starter: "CREATE TABLE bulk_plain (id int, user_id int, body text, created_at timestamptz);\nINSERT INTO bulk_plain SELECT * FROM posts LIMIT 50000;\n-- now bulk_indexed, with indexes created BEFORE the insert",
    hint: "CREATE TABLE bulk_indexed (LIKE bulk_plain); then CREATE INDEX on id, user_id and created_at; then INSERT … SELECT. Every row now updates 3 B-trees as well as the table.",
    solution: "CREATE TABLE bulk_plain (id int, user_id int, body text, created_at timestamptz);\nINSERT INTO bulk_plain SELECT * FROM posts LIMIT 50000;\nCREATE TABLE bulk_indexed (LIKE bulk_plain);\nCREATE INDEX ON bulk_indexed (id);\nCREATE INDEX ON bulk_indexed (user_id);\nCREATE INDEX ON bulk_indexed (created_at);\nINSERT INTO bulk_indexed SELECT * FROM posts LIMIT 50000;",
    async check(_l, probe) {
      const rows = (t: string) => count(probe, `SELECT count(*) AS n FROM ${t}`);
      const idx = (t: string) => count(probe, `SELECT count(*) AS n FROM pg_indexes WHERE tablename = '${t}'`);
      const [rp, ri, ip, ii] = await Promise.all([rows("bulk_plain"), rows("bulk_indexed"), idx("bulk_plain"), idx("bulk_indexed")]);
      if (rp < 50_000 || ri < 50_000) return no(`Need 50,000 rows in each table; found ${Math.max(rp, 0)} in bulk_plain and ${Math.max(ri, 0)} in bulk_indexed.`);
      if (ip !== 0) return no("bulk_plain should have no indexes, so it shows the baseline.");
      if (ii < 3) return no(`bulk_indexed has ${ii} indexes. Give it at least 3.`);
      return ok("Compare the two INSERT timings: each index is another structure updated per row. That's write amplification.");
    },
  },
  // Modeling
  {
    id: "mod-feed", track: "modeling", title: "Write the feed query",
    goal: "Return the 20 newest posts written by people user 1 follows, newest first, with the post id as a column named id.",
    starter: "SELECT p.id, p.user_id, p.created_at\nFROM posts p\n-- join follows here\nORDER BY p.created_at DESC\nLIMIT 20;",
    hint: "JOIN follows f ON f.followee_id = p.user_id WHERE f.follower_id = 1.",
    solution: FEED_REF + ";",
    async check(last, probe) {
      if (!last?.ok) return last ? no(`The query failed: ${last.error}`) : needRun;
      if (!last.fields.includes("id")) return no("Return the post id in a column named id.");
      const ref = ids((await probe(FEED_REF)).rows);
      return sameList(ids(last.rows), ref) ? ok("That's the feed. At scale it's built ahead of time (fan-out on write), but this query is the definition.") : no(`Got ${last.rows.length} rows that don't match the expected feed. Check the join direction: you want posts by people user 1 follows.`);
    },
  },
  {
    id: "mod-counter", track: "modeling", title: "Denormalise a counter",
    goal: "Add users.follower_count and fill it from follows, so profile pages read one integer instead of counting rows.",
    starter: "ALTER TABLE users ADD COLUMN follower_count int NOT NULL DEFAULT 0;\n-- now fill it",
    hint: "UPDATE users u SET follower_count = c.n FROM (SELECT followee_id, count(*) AS n FROM follows GROUP BY followee_id) c WHERE c.followee_id = u.id;",
    solution: "ALTER TABLE users ADD COLUMN follower_count int NOT NULL DEFAULT 0;\nUPDATE users u SET follower_count = c.n FROM (SELECT followee_id, count(*) AS n FROM follows GROUP BY followee_id) c WHERE c.followee_id = u.id;",
    async check(_l, probe) {
      if ((await hasColumns(probe, "users", ["follower_count"])).length) return no("users has no follower_count column yet.");
      const wrong = await count(probe, "SELECT count(*) AS n FROM users u LEFT JOIN (SELECT followee_id, count(*) AS c FROM follows GROUP BY 1) f ON f.followee_id = u.id WHERE u.follower_count IS DISTINCT FROM coalesce(f.c, 0)");
      return wrong === 0 ? ok("Every count matches. Now every new follow must also increment it, ideally in the same transaction.") : no(`${wrong} users have a count that doesn't match follows.`);
    },
  },
  {
    id: "mod-keyset", track: "modeling", title: "Keyset pagination",
    goal: `Page 1 of the global feed (ORDER BY created_at DESC, id DESC LIMIT 20) ended at post ${PAGE1_LAST_ID}. Return page 2 without OFFSET.`,
    starter: "SELECT id, created_at FROM posts\nORDER BY created_at DESC, id DESC\nLIMIT 20 OFFSET 20;",
    hint: `WHERE (created_at, id) < (SELECT created_at, id FROM posts WHERE id = ${PAGE1_LAST_ID}). The database seeks straight to the cursor instead of reading and discarding OFFSET rows.`,
    solution: `SELECT id, created_at FROM posts WHERE (created_at, id) < (SELECT created_at, id FROM posts WHERE id = ${PAGE1_LAST_ID}) ORDER BY created_at DESC, id DESC LIMIT 20;`,
    async check(last) {
      if (!last?.ok) return last ? no(`The query failed: ${last.error}`) : needRun;
      const want = Array.from({ length: 20 }, (_, i) => PAGE1_LAST_ID - 1 - i);
      if (!sameList(ids(last.rows), want)) return no("That isn't page 2. Expect the 20 posts just older than the cursor, newest first.");
      return /\boffset\b/i.test(last.sql) ? no("Right rows, but OFFSET 20 reads and throws away 20 rows; on page 5,000 it throws away 100,000. Use a WHERE on the cursor instead.") : ok("Keyset pagination: page 5,000 costs the same as page 2.");
    },
  },
  {
    id: "mod-n1", track: "modeling", title: "Fix the N+1",
    goal: "The app loads the 20 newest posts, then runs one `SELECT name FROM users WHERE id = ?` per post: 21 queries. Write one query returning each post's id and its author's name (column name).",
    starter: "SELECT id, user_id FROM posts ORDER BY created_at DESC LIMIT 20;\n-- then, for each row:\nSELECT name FROM users WHERE id = 1;",
    hint: "Join users on posts.user_id and return p.id, u.name.",
    solution: N1_REF + ";",
    async check(last, probe) {
      if (!last?.ok) return last ? no(`The query failed: ${last.error}`) : needRun;
      if (!last.fields.includes("id") || !last.fields.includes("name")) return no("Return columns named id and name.");
      const key = (rows: Row[]) => rows.map((r) => `${r.id}:${r.name}`).sort().join();
      return last.rows.length === 20 && key(last.rows) === key((await probe(N1_REF)).rows) ? ok("21 round trips became 1. In an ORM this is eager loading or a DataLoader-style batch.") : no("Expected the 20 newest posts, each with its author's name.");
    },
  },
  {
    id: "mod-schema", track: "modeling", title: "Design a reviews table",
    goal: "Create reviews so a user can review a product at most once, the rating must be 1–5, and the product must exist. Columns user_id, product_id and rating; anything else must be optional.",
    starter: "CREATE TABLE reviews (\n  user_id int,\n  product_id int,\n  rating int\n);",
    hint: "PRIMARY KEY (user_id, product_id), CHECK (rating BETWEEN 1 AND 5), product_id REFERENCES products(id).",
    solution: "CREATE TABLE reviews (user_id int NOT NULL REFERENCES users(id), product_id int NOT NULL REFERENCES products(id), rating int NOT NULL CHECK (rating BETWEEN 1 AND 5), body text, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, product_id));",
    async check(_l, probe) {
      const missing = await hasColumns(probe, "reviews", ["user_id", "product_id", "rating"]);
      if (missing.length) return no(`reviews is missing: ${missing.join(", ")}.`);
      const [first, dup, badRating, noProduct] = await tryInserts(probe, [
        "INSERT INTO reviews (user_id, product_id, rating) VALUES (1, 1, 5)",
        "INSERT INTO reviews (user_id, product_id, rating) VALUES (1, 1, 4)",
        "INSERT INTO reviews (user_id, product_id, rating) VALUES (2, 1, 6)",
        "INSERT INTO reviews (user_id, product_id, rating) VALUES (3, 999999, 4)",
      ]);
      if (first) return no(`A valid review was rejected (${first}). Give extra columns a default or allow NULL.`);
      if (dup !== "23505") return no("A second review by the same user for the same product was accepted. Add a primary key or unique constraint on (user_id, product_id).");
      if (badRating !== "23514") return no("A rating of 6 was accepted. Add a CHECK constraint.");
      if (noProduct !== "23503") return no("A review for a product that doesn't exist was accepted. Add a foreign key.");
      return ok("The database itself now refuses duplicates, bad ratings and orphans, whatever the app code does.");
    },
  },
  // Transactions
  {
    id: "tx-transfer", track: "transactions", title: "BEGIN, COMMIT, ROLLBACK",
    goal: "Move 100 from account 1 to account 2 in one transaction and COMMIT. Then try moving 100 from account 3 (balance 50) to account 4: when the CHECK fails, ROLLBACK so account 4 isn't credited.",
    starter: "BEGIN;\nUPDATE accounts SET balance = balance - 100 WHERE id = 1;\n-- credit account 2, then COMMIT",
    hint: "Credit account 4 first, then debit 3: the debit violates CHECK (balance >= 0), the transaction is aborted, and ROLLBACK undoes the credit. If you already ran a transfer twice, press Reset database.",
    solution: "BEGIN; UPDATE accounts SET balance = balance - 100 WHERE id = 1; UPDATE accounts SET balance = balance + 100 WHERE id = 2; COMMIT;",
    async check(_l, probe) {
      const r = await probe("SELECT id, balance FROM accounts ORDER BY id");
      if (r.error) return no(r.code === "25P02" ? "Your transaction is aborted after an error. Run ROLLBACK." : r.error);
      const b = Object.fromEntries(r.rows.map((x) => [Number(x.id), Number(x.balance)]));
      const total = r.rows.reduce((a, x) => a + Number(x.balance), 0);
      if (total !== ACCOUNTS_TOTAL) return no(`Money was created or destroyed: total is ${total}, expected ${ACCOUNTS_TOTAL}. Press Reset database and try again.`);
      if (b[1] !== 900 || b[2] !== 1100) return no(`Account 1 has ${b[1]} and account 2 has ${b[2]}; expected 900 and 1100. (Reset database if you ran it twice.)`);
      if (b[3] !== 50 || b[4] !== 1000) return no(`Account 3 has ${b[3]} and account 4 has ${b[4]}; the failed transfer should leave them at 50 and 1000.`);
      return ok("The first transfer committed whole; the failed one left no trace. That's atomicity.");
    },
  },
  {
    id: "tx-for-update", track: "transactions", title: "SELECT … FOR UPDATE",
    goal: "Sell one unit of product 1 safely: in a transaction, lock its row with SELECT … FOR UPDATE, check the stock, decrement it, and COMMIT.",
    starter: "BEGIN;\nSELECT stock FROM products WHERE id = 1;\nUPDATE products SET stock = stock - 1 WHERE id = 1;\nCOMMIT;",
    hint: "Add FOR UPDATE to the SELECT. A second transaction doing the same now waits until you commit, so two buyers can't both see the last unit.",
    solution: "BEGIN; SELECT stock FROM products WHERE id = 1 FOR UPDATE; UPDATE products SET stock = stock - 1 WHERE id = 1 AND stock > 0; COMMIT;",
    async check(last, probe) {
      if (!last) return needRun;
      const stock = await count(probe, "SELECT stock AS n FROM products WHERE id = 1");
      if (!/for\s+update/i.test(last.sql)) return no("Lock the row with SELECT … FOR UPDATE before deciding.");
      return stock < INITIAL_STOCK_P1 ? ok(`Stock is now ${stock}. The lock made read-check-write a single safe step.`) : no("The stock didn't change. Did the transaction COMMIT?");
    },
  },
  {
    id: "tx-optimistic", track: "transactions", title: "Optimistic locking",
    goal: "Add a version column to products (default 1). Change product 2's price only if its version is still 1, bumping the version in the same UPDATE.",
    starter: "ALTER TABLE products ADD COLUMN version int NOT NULL DEFAULT 1;\nUPDATE products SET price_cents = price_cents + 100 WHERE id = 2;",
    hint: "UPDATE … SET price_cents = …, version = version + 1 WHERE id = 2 AND version = 1. Zero rows updated means someone else saved first.",
    solution: "ALTER TABLE products ADD COLUMN version int NOT NULL DEFAULT 1;\nUPDATE products SET price_cents = price_cents + 100, version = version + 1 WHERE id = 2 AND version = 1;",
    async check(last, probe) {
      if (!last) return needRun;
      if ((await hasColumns(probe, "products", ["version"])).length) return no("products has no version column yet.");
      if (!/where[\s\S]*\bversion\s*=\s*\d+/i.test(last.sql) || !/version\s*=\s*version\s*\+\s*1/i.test(last.sql)) return no("The UPDATE must check the version in WHERE and set version = version + 1.");
      const v = await count(probe, "SELECT version AS n FROM products WHERE id = 2");
      return v >= 2 ? ok("Version bumped. A second writer still holding version 1 now updates 0 rows and knows to reload.") : no("Product 2's version is still 1, so the update didn't match. Check the WHERE clause.");
    },
  },
  {
    id: "tx-unique", track: "transactions", title: "A constraint as the guard",
    goal: "Two people must never book the same seat for the same event. Add a constraint to bookings so the database rejects the second booking, whatever isolation level the app uses.",
    starter: "INSERT INTO bookings (event_id, seat, user_id) VALUES (1, 'A1', 10);\nINSERT INTO bookings (event_id, seat, user_id) VALUES (1, 'A1', 11); -- this should fail",
    hint: "ALTER TABLE bookings ADD CONSTRAINT one_booking_per_seat UNIQUE (event_id, seat); (delete duplicate rows first if you inserted some).",
    solution: "ALTER TABLE bookings ADD CONSTRAINT one_booking_per_seat UNIQUE (event_id, seat);",
    async check(_l, probe) {
      const [first, second] = await tryInserts(probe, [
        "INSERT INTO bookings (event_id, seat, user_id) VALUES (99, 'Z9', 1)",
        "INSERT INTO bookings (event_id, seat, user_id) VALUES (99, 'Z9', 2)",
      ]);
      if (first) return no(`A valid booking was rejected (${first}).`);
      return second === "23505" ? ok("The second booking fails with a unique violation. No race in app code can get past it.") : no("The second booking for the same seat was accepted. Add a UNIQUE constraint on (event_id, seat).");
    },
  },
  {
    id: "tx-idempotency", track: "transactions", title: "Idempotency-key table",
    goal: "Create idempotency_keys with user_id, key and a response column (nullable until the request finishes). The same key may be used once per user, but two users may use the same key.",
    starter: "CREATE TABLE idempotency_keys (\n  key text PRIMARY KEY,\n  response_body jsonb\n);",
    hint: "Scope keys per client: PRIMARY KEY (user_id, key). Add request_hash, response_code and created_at as in the lesson.",
    solution: "CREATE TABLE idempotency_keys (user_id int NOT NULL, key text NOT NULL, request_hash text, response_code int, response_body jsonb, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, key));",
    async check(_l, probe) {
      const r = await probe("SELECT column_name FROM information_schema.columns WHERE table_name = 'idempotency_keys'");
      const cols = r.rows.map((x) => String(x.column_name));
      if (!cols.includes("user_id") || !cols.includes("key")) return no("idempotency_keys needs user_id and key columns.");
      if (!cols.some((c) => c.startsWith("response"))) return no("Add a column for the stored response (e.g. response_body).");
      const [first, dup, otherUser] = await tryInserts(probe, [
        "INSERT INTO idempotency_keys (user_id, key) VALUES (1, 'k-1')",
        "INSERT INTO idempotency_keys (user_id, key) VALUES (1, 'k-1')",
        "INSERT INTO idempotency_keys (user_id, key) VALUES (2, 'k-1')",
      ]);
      if (first) return no(`Claiming a new key failed (${first}). The response columns must allow NULL.`);
      if (dup !== "23505") return no("The same user claimed the same key twice. Add a unique constraint or primary key.");
      if (otherUser) return no("A different user couldn't use the same key. Scope the key per user: PRIMARY KEY (user_id, key).");
      return ok("Retries with the same key now hit the constraint, and the stored response can be returned instead of charging twice.");
    },
  },
];

export const TRACKS: { id: Track; label: string }[] = [{ id: "indexing", label: "Indexing" }, { id: "modeling", label: "Modeling" }, { id: "transactions", label: "Transactions" }];
export const trackDone = (s: SqlState, t: Track) => EXERCISES.filter((e) => e.track === t && s.passed[e.id]).length;

export const sqlModel: SimModel<SqlConfig, SqlState> = {
  init: () => ({ passed: {} }),
  tick: (s) => s,
  actions: {
    pass: (s, id) => (EXERCISES.some((e) => e.id === id) ? { passed: { ...s.passed, [id as string]: true } } : s),
  },
  faults: [],
  metrics: (s) => ({ indexing: trackDone(s, "indexing"), modeling: trackDone(s, "modeling"), transactions: trackDone(s, "transactions"), total: Object.keys(s.passed).length }),
};
