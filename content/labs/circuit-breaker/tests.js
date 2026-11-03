const ok = () => "ok";
const boom = () => { throw new Error("dependency down"); };
function make(m, { threshold = 3, cooldown = 30, trials = 1 } = {}) {
  const clock = { t: 0 };
  const b = new m.CircuitBreaker({ failureThreshold: threshold, resetTimeout: cooldown, halfOpenMaxCalls: trials, now: () => clock.t });
  return [b, clock];
}
function fail(b, n = 1) { for (let i = 0; i < n; i++) { try { b.call(boom); } catch { /* expected */ } } }

test("starts closed and passes calls through", "threshold 3; call(ok)", (m) => {
  const [b] = make(m);
  return [[b.state(), b.call(ok), b.state()], ["closed", "ok", "closed"]];
});

test("stays closed below the threshold", "threshold 3; 2 failures", (m) => { const [b] = make(m); fail(b, 2); return [b.state(), "closed"]; });

test("opens after N consecutive failures", "threshold 3; 3 failures", (m) => { const [b] = make(m); fail(b, 3); return [b.state(), "open"]; });

test("a success resets the consecutive-failure count", "threshold 3; fail, fail, ok, fail, fail", (m) => {
  const [b] = make(m); fail(b, 2); b.call(ok); fail(b, 2);
  return [b.state(), "closed"];
});

test("the caller sees the dependency's own exception", "call(fn throwing TypeError) while closed", (m) => {
  const [b] = make(m);
  return [() => b.call(() => { throw new TypeError("x"); }), raises("TypeError")];
});

test("an open breaker fails fast with CircuitOpenError", "tripped; call(fn)", (m) => {
  const [b] = make(m); fail(b, 3);
  return [() => b.call(ok), raises("CircuitOpenError")];
});

test("while open, the dependency is never called", "tripped; 5 calls at t = 1..5 s", (m) => {
  const [b, clock] = make(m); fail(b, 3);
  let calls = 0, rejected = 0;
  for (let t = 1; t <= 5; t++) {
    clock.t = t;
    try { b.call(() => { calls++; }); } catch (e) { if (e.name === "CircuitOpenError") rejected++; }
  }
  return [[calls, rejected], [0, 5]];
});

test("stays open until the cooldown has fully elapsed", "opened at t=0, cooldown 30 s; check t=29.9 and t=30", (m) => {
  const [b, clock] = make(m); fail(b, 3);
  clock.t = 29.9; const before = b.state();
  clock.t = 30;
  return [[before, b.state()], ["open", "half_open"]];
});

test("a successful trial call closes the breaker and resets the count", "half-open; call(ok); then 2 failures", (m) => {
  const [b, clock] = make(m); fail(b, 3);
  clock.t = 30;
  const out = b.call(ok), afterOk = b.state();
  fail(b, 2);
  return [[out, afterOk, b.state()], ["ok", "closed", "closed"]];
});

test("a failed trial call reopens and restarts the cooldown", "half-open at t=30; trial fails; check t=59 and t=60", (m) => {
  const [b, clock] = make(m); fail(b, 3);
  clock.t = 30; fail(b);
  const reopened = b.state();
  clock.t = 59; const still = b.state();
  clock.t = 60;
  return [[reopened, still, b.state()], ["open", "open", "half_open"]];
});

test("half-open admits only halfOpenMaxCalls trials", "trials 2; allowRequest x3 before any result", (m) => {
  const [b, clock] = make(m, { trials: 2 }); fail(b, 3);
  clock.t = 30; b.allowRequest(); b.allowRequest();
  return [() => b.allowRequest(), raises("CircuitOpenError")];
});

test("with 2 trials, both must succeed to close", "trials 2; success, then (a) success or (b) failure", (m) => {
  const [a, ca] = make(m, { trials: 2 }); fail(a, 3); ca.t = 30;
  a.call(ok); const mid = a.state(); a.call(ok);
  const [b, cb] = make(m, { trials: 2 }); fail(b, 3); cb.t = 30;
  b.call(ok); fail(b);
  return [[mid, a.state(), b.state()], ["half_open", "closed", "open"]];
});

test("threshold 1 trips on the first failure", "threshold 1; one failure", (m) => { const [b] = make(m, { threshold: 1 }); fail(b); return [b.state(), "open"]; });
