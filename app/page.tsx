import Link from "next/link";
import { PhasePath } from "@/components/brand";
import { LB_PREVIEW_MARKUP } from "@/components/landing/lb-preview-markup";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { CASE_STUDY_COUNT, PHASES, weekLabel } from "@/lib/curriculum";
import { REGISTRY } from "@/lib/simulators/registry";

// Rebuilt from design/landing/landing.html (direction A). Layout classes live in app/styles/landing.css.
// Counts come from PHASES and the registry, which curriculum.test.ts checks against content.
const SECTIONS = PHASES.reduce((n, p) => n + p.sections, 0);
const SIMS = REGISTRY.length;
const CASES = CASE_STUDY_COUNT;

const STEPS = [
  ["Learn", "Read a lesson written for engineers: one idea per section, worked numbers, the tradeoff stated plainly.", "Lessons · quizzes · flashcards"],
  ["Simulate", "Change the load, kill a node, add jitter. Watch latency, errors and queues answer back in real time.", `${SIMS} simulators`],
  ["Design", "Draw your system on the canvas, then run traffic through it. Bottlenecks and single points of failure light up.", "Design Studio · Run mode"],
  ["Defend", "A 45-minute mock interview with a rubric, a timer and follow-up questions that push where you're weakest.", `${CASES} case studies`],
];

const h2 = { margin: 0, fontSize: 80, lineHeight: 0.95, fontWeight: 800, letterSpacing: "-.045em" } as const;
const Arrow = () => <span style={{ fontFamily: "var(--font-mono)" }} aria-hidden>→</span>;
const Fig = ({ a, b, c }: { a: string; b: string; c?: string }) => (
  <div className="mono figcap"><span>{a}</span><span>·</span><b>{b}</b>{c && <><span>·</span><span>{c}</span></>}</div>
);

export default function Landing() {
  const weeks = Array.from({ length: 16 }, (_, i) => i + 1);
  const phaseOf = (w: number) => PHASES.find((p) => w >= p.weeks[0] && w <= p.weeks[1])!.n;
  return (
    <div className="landing">
      <header className="wrap" style={{ display: "flex", alignItems: "center", gap: 32, height: 72, borderBottom: "1px solid var(--ink)", flexWrap: "wrap" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <svg viewBox="0 0 28 22" width="28" height="22" aria-hidden="true"><polygon points="14,1 27,7.5 14,14 1,7.5" style={{ fill: "var(--cobalt)", stroke: "var(--ink)", strokeWidth: 1.25 }} /><polygon points="1,11.5 14,18 27,11.5" style={{ fill: "none", stroke: "var(--ink)", strokeWidth: 1.25 }} /><polygon points="1,15 14,21.5 27,15" style={{ fill: "none", stroke: "var(--ink)", strokeWidth: 1.25 }} /></svg>
          <span style={{ fontWeight: 800, fontSize: 19, letterSpacing: "-.03em" }}>SysDesign Lab</span>
        </Link>
        <nav aria-label="Main" className="mono hide-m" style={{ display: "flex", gap: 28 }}>
          <Link href="/plan" style={{ textDecoration: "none" }}><span className="muted">§1 </span>Curriculum</Link>
          <Link href="/simulators" style={{ textDecoration: "none" }}><span className="muted">§2 </span>Simulators</Link>
          <Link href="/studio" style={{ textDecoration: "none" }}><span className="muted">§3 </span>Studio</Link>
          <Link href="/case-studies" style={{ textDecoration: "none" }}><span className="muted">§4 </span>Interviews</Link>
        </nav>
        <span style={{ marginLeft: "auto" }} className="hide-m"><ThemeToggle /></span>
        <Link className="btn pri" href="/today" style={{ height: 40, padding: "0 16px", fontSize: 14 }}>Start week 1 →</Link>
      </header>

      <main>
        <section className="gridbg" style={{ position: "relative", borderBottom: "1px solid var(--ink)" }}>
          <span className="cross" style={{ top: 16, left: 16 }} /><span className="cross" style={{ top: 16, right: 16 }} /><span className="cross hide-m" style={{ bottom: 16, left: 16 }} /><span className="cross hide-m" style={{ bottom: 16, right: 16 }} />
          <div className="wrap g12" style={{ paddingTop: 72, paddingBottom: 88, rowGap: 48, alignItems: "start" }}>
            <div style={{ gridColumn: "1/8", gridRow: 1, display: "flex", flexDirection: "column", gap: 32, position: "relative", zIndex: 1 }}>
              <Fig a="FIG. 0" b="ONE PATH" c="7 PHASES · 16 WEEKS" />
              <h1 style={{ margin: 0, fontSize: 116, lineHeight: 0.9, fontWeight: 800, letterSpacing: "-.05em" }}>You design it.<br />Then you<br /><span className="em">break</span> it.</h1>
              <p style={{ margin: 0, maxWidth: "30em", fontSize: 21, lineHeight: 1.5 }}>Lessons, {SIMS} simulators, a design studio and timed mock interviews. Everything you need for system design, in one place, in the order you should learn it.</p>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <Link className="btn pri" href="/today">Start week 1 <Arrow /></Link>
                <Link className="btn" href="/simulators">Open a simulator</Link>
              </div>
            </div>
            <div className="heroimg" style={{ gridColumn: "7/13", gridRow: 1, position: "relative", marginTop: -24 }}>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}><span className="spec"><span>A-00</span><span>The learning path</span><span className="muted">NTS</span></span></div>
              <PhasePath active={3} />
            </div>
            <div style={{ gridColumn: "1/7" }}>
              <table className="parts">
                <caption>Parts list · Curriculum</caption>
                <thead><tr><th style={{ width: 44 }}>No.</th><th>Phase</th><th>Weeks</th><th className="r">Sections</th></tr></thead>
                <tbody>
                  {PHASES.map((p) => (
                    <tr key={p.n}>
                      <td><span className="sq" style={{ background: `var(--phase-${p.n})`, color: `var(--on-phase-${p.n})` }}>{p.n}</span></td>
                      <td>{p.name}</td><td className="muted">{weekLabel(p.weeks)}</td><td className="r">{p.sections}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="stats3" style={{ gridColumn: "8/13", alignSelf: "end", display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 24, borderTop: "2px solid var(--ink)", paddingTop: 16 }}>
              {[[SECTIONS, "Lessons"], [SIMS, "Simulators"], [CASES, "Case studies"]].map(([n, l]) => (
                <div key={l}><div className="stat">{n}</div><div className="mono muted" style={{ marginTop: 8 }}>{l}</div></div>
              ))}
            </div>
          </div>
        </section>

        <section className="wrap" style={{ paddingTop: 120, paddingBottom: 120 }}>
          <div className="g12" style={{ rowGap: 56 }}>
            <div style={{ gridColumn: "1/5" }}><Fig a="SHEET 02" b="METHOD" /></div>
            <h2 style={{ ...h2, gridColumn: "1/9" }}>Four moves, repeated every week until they&apos;re <span className="em">habit</span>.</h2>
            <div className="steps4" style={{ gridColumn: "1/13", display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 24 }}>
              {STEPS.map(([t, body, foot], i) => (
                <div key={t} style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 20, borderTop: "1px solid var(--ink)", position: "relative" }}>
                  <span className="num" style={{ position: "absolute", top: -16, left: 0 }}>0{i + 1}</span>
                  <h3 style={{ margin: "16px 0 0", fontSize: 32, lineHeight: 1.05, fontWeight: 800, letterSpacing: "-.03em" }}>{t}</h3>
                  <p style={{ margin: 0 }}>{body}</p><span className="mono muted">{foot}</span>
                </div>
              ))}
            </div>
            <div style={{ gridColumn: "1/13" }} className="dim"><span>WEEK 01</span><i /><span>ONE LOOP ≈ 8 HOURS</span><i /><span>WEEK 16</span></div>
          </div>
        </section>

        <section style={{ background: "var(--surface)", borderTop: "1px solid var(--ink)", borderBottom: "1px solid var(--ink)" }}>
          <div className="wrap g12" style={{ paddingTop: 120, paddingBottom: 120, rowGap: 40 }}>
            <div style={{ gridColumn: "1/5", display: "flex", flexDirection: "column", gap: 24 }}>
              <Fig a="SHEET 03" b="SIMULATORS" />
              <h2 style={h2}>Break it on <span className="em">purpose</span>.</h2>
              <p style={{ margin: 0 }}>Every simulator is a working model with a seed, a speed control and a “Break it” menu. Kill a server mid-spike and see which load-balancing algorithm keeps p99 under 300 ms.</p>
              <Link className="btn" href="/simulators/load-balancer" style={{ alignSelf: "flex-start" }}>Open S-03 Load balancer <Arrow /></Link>
            </div>
            <div style={{ gridColumn: "5/13", border: "1.5px solid var(--ink)", background: "var(--paper)", position: "relative" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--ink)", gap: 12, flexWrap: "wrap" }}>
                <span className="spec"><span>S-03</span><span>Load balancer</span><span className="muted">Live</span></span>
                <span className="mono" style={{ display: "flex", gap: 20 }}><span><span className="muted">QPS </span>8,210</span><span><span className="muted">P99 </span>311 MS</span><span><span className="muted">ERR </span>2.4%</span></span>
              </div>
              <div className="gridbg" style={{ padding: "24px 24px 8px" }}>
                <svg viewBox="0 0 800 400" role="img" aria-label="Load balancer simulator: clients send requests through a load balancer to four servers. Server 3 is hot at 86 percent; server 4 is overloaded at 99 percent." style={{ width: "100%", height: "auto", display: "block" }} dangerouslySetInnerHTML={{ __html: LB_PREVIEW_MARKUP }} />
              </div>
              <div style={{ padding: "0 16px 14px" }}><Fig a="FIG. 3.1" b="SERVER 4 OVERLOADED" c="SWITCH TO WEIGHTED ROUND ROBIN" /></div>
            </div>
          </div>
        </section>

        <section className="wrap" style={{ paddingTop: 120, paddingBottom: 140 }}>
          <div className="g12" style={{ rowGap: 48 }}>
            <div style={{ gridColumn: "1/5" }}><Fig a="SHEET 04" b="THE PLAN" /></div>
            <h2 style={{ ...h2, gridColumn: "1/10" }}>Sixteen weeks. Seven phases. One <span className="em">system</span>.</h2>
            <div style={{ gridColumn: "1/13" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(16,minmax(0,1fr))", border: "1.5px solid var(--ink)", borderLeftWidth: 0 }} role="img" aria-label="16 weeks coloured by phase">
                {weeks.map((w) => (
                  <div key={w} style={{ height: 40, background: `var(--phase-${phaseOf(w)})`, borderLeft: "1px solid var(--ink)", display: "flex", alignItems: "flex-end", padding: "4px 6px" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: `var(--on-phase-${phaseOf(w)})` }}>{String(w).padStart(2, "0")}</span>
                  </div>
                ))}
              </div>
              <div className="ruler-l" style={{ display: "grid", gridTemplateColumns: "repeat(16,minmax(0,1fr))" }}>
                {PHASES.map((p) => (
                  <div key={p.n} className="mono" style={{ gridColumn: `${p.weeks[0]}/${p.weeks[1] + 1}`, borderLeft: "1px solid var(--ink)", padding: "10px 6px 0", fontSize: 10.5 }}>
                    <span className="muted">P{p.n} </span>{p.short}
                  </div>
                ))}
              </div>
            </div>
            <p style={{ gridColumn: "1/7", margin: 0 }}>About eight hours a week. The Today page tells you what to do next: flashcards due, the next lesson, the next challenge, and the weak spot you keep missing.</p>
            <div style={{ gridColumn: "8/13", display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
              <Link className="btn pri" href="/today">Start week 1 <Arrow /></Link><span className="mono muted">Free · runs in your browser · no account</span>
            </div>
          </div>
        </section>
      </main>

      <footer className="wrap" style={{ paddingTop: 28, paddingBottom: 28, borderTop: "1px solid var(--ink)", display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <span className="mono">SysDesign Lab · Field Manual edition</span>
        <span className="mono muted">Set in Archivo, Instrument Serif &amp; IBM Plex Mono · Sheet 05 / 05</span>
      </footer>
      <div className="hud mono" role="status"><span className="live">Scroll · the path continues below</span><span><span className="k">QPS</span>0</span><span><span className="k">P99</span>—</span><span><span className="k">T+</span>00:00:00</span><span style={{ marginLeft: "auto" }} className="hide-m"><span className="k">X</span>0080 <span className="k">Y</span>0072</span><span className="hide-m">Sheet 01 / 05</span></div>
    </div>
  );
}
