import Link from "next/link";
import { Mark } from "@/components/brand";
import { CurrentPhasePath } from "@/components/brand/CurrentPhasePath";
import { LB_PREVIEW_MARKUP } from "@/components/landing/lb-preview-markup";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { getAllSections } from "@/lib/content";
import { CASE_STUDY_COUNT, PHASES, weekLabel } from "@/lib/curriculum";
import { REGISTRY } from "@/lib/simulators/registry";

// Layout classes live in app/styles/landing.css.
// Counts come from PHASES and the registry, which curriculum.test.ts checks against content.
const SECTIONS = PHASES.reduce((n, p) => n + p.sections, 0);
const SIMS = REGISTRY.length;
const CASES = CASE_STUDY_COUNT;
/** Every section in course order, for lighting the learner's current phase on the path. */
const COURSE = getAllSections().map((s) => s.meta).sort((a, b) => a.phase - b.phase || a.order - b.order).map((m) => ({ id: m.id, phase: m.phase }));

// The weekly loop, drawn as a request path: each move is a hop, and the last one feeds back into the first.
const STEPS = [
  ["Learn", "A lesson written for engineers: one idea per section, worked numbers, and the tradeoff stated plainly.", "Lessons, quizzes, flashcards"],
  ["Simulate", "Change the load, kill a node, add jitter. Latency, errors and queue depth answer back in real time.", `${SIMS} simulators`],
  ["Design", "Draw your system, then run traffic through it. Bottlenecks and single points of failure light up.", "Design Studio with run mode"],
  ["Defend", "A 45-minute mock interview with a rubric, a timer and follow-ups that push where you are weakest.", `${CASES} case studies`],
];

const Arrow = () => <span aria-hidden>→</span>;

export default function Landing() {
  const weeks = Array.from({ length: 16 }, (_, i) => i + 1);
  const phaseOf = (w: number) => PHASES.find((p) => w >= p.weeks[0] && w <= p.weeks[1])!.n;
  return (
    <div className="landing">
      <header className="wrap top">
        <Link href="/" className="brand"><Mark size={26} /><span>SysDesign Lab</span></Link>
        <nav aria-label="Main" className="hide-m">
          <Link href="/plan">Curriculum</Link>
          <Link href="/simulators">Simulators</Link>
          <Link href="/studio">Studio</Link>
          <Link href="/case-studies">Interviews</Link>
        </nav>
        <span className="hide-m" style={{ marginLeft: "auto" }}><ThemeToggle /></span>
        <Link className="btn pri sm" href="/today">Start week 1 <Arrow /></Link>
      </header>

      <main>
        <section className="gridbg hero">
          <div className="wrap g12" style={{ paddingTop: 80, paddingBottom: 88, rowGap: 56, alignItems: "start" }}>
            <div style={{ gridColumn: "1/8", gridRow: 1, display: "flex", flexDirection: "column", gap: 28, position: "relative", zIndex: 1 }}>
              <h1>Design it,<br />then break it</h1>
              <p className="lede">Lessons, {SIMS} simulators, a design studio and timed mock interviews. Everything you need for system design, in one place, in the order you should learn it.</p>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <Link className="btn pri" href="/today">Start week 1 <Arrow /></Link>
                <Link className="btn" href="/simulators">Open a simulator</Link>
              </div>
            </div>
            <div className="heroimg" style={{ gridColumn: "7/13", gridRow: 1, position: "relative", marginTop: -16 }}>
              <CurrentPhasePath sections={COURSE} />
            </div>
            <div style={{ gridColumn: "1/7" }}>
              <table className="parts">
                <caption>The curriculum</caption>
                <thead><tr><th style={{ width: 44 }}><span className="sr-only">Phase number</span></th><th>Phase</th><th>Weeks</th><th className="r">Lessons</th></tr></thead>
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
            <dl className="stats3" style={{ gridColumn: "8/13", alignSelf: "end" }}>
              {[[SECTIONS, "lessons"], [SIMS, "simulators"], [CASES, "case studies"]].map(([n, l]) => (
                <div key={l}><dt className="sr-only">{l}</dt><dd className="stat">{n}</dd><dd className="muted" aria-hidden>{l}</dd></div>
              ))}
            </dl>
          </div>
        </section>

        <section className="wrap" style={{ paddingTop: 128, paddingBottom: 128 }}>
          <div className="g12" style={{ rowGap: 64 }}>
            <h2 style={{ gridColumn: "1/9" }}>Four moves, every week, until they are habit</h2>
            <ol className="loop" style={{ gridColumn: "1/13" }}>
              {STEPS.map(([t, body, foot]) => (
                <li key={t}>
                  <h3>{t}</h3>
                  <p>{body}</p>
                  <span className="muted small">{foot}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="band">
          <div className="wrap g12" style={{ paddingTop: 128, paddingBottom: 128, rowGap: 40 }}>
            <div style={{ gridColumn: "1/5", display: "flex", flexDirection: "column", gap: 24 }}>
              <h2>Break it on purpose</h2>
              <p style={{ margin: 0 }}>Every simulator is a working model with a seed, a speed control and a Break it menu. Kill a server mid-spike and see which load-balancing algorithm keeps p99 under 300 ms.</p>
              <Link className="btn" href="/simulators/load-balancer" style={{ alignSelf: "flex-start" }}>Open the load balancer <Arrow /></Link>
            </div>
            <figure className="preview" style={{ gridColumn: "5/13" }}>
              <div className="preview-head">
                <span className="small"><span className="sdl-live" aria-hidden /> Load balancer · least connections</span>
                <span className="metrics"><span>8,210 <i>req/s</i></span><span>311 <i>ms p99</i></span><span className="over">2.4% <i>errors</i></span></span>
              </div>
              <div className="gridbg" style={{ padding: "24px 24px 8px" }}>
                <svg viewBox="0 0 800 400" role="img" aria-label="Load balancer simulator: clients send requests through a load balancer to four servers. Server 3 is hot at 86 percent; server 4 is overloaded at 99 percent." style={{ width: "100%", height: "auto", display: "block" }} dangerouslySetInnerHTML={{ __html: LB_PREVIEW_MARKUP }} />
              </div>
              <figcaption className="small muted">Server 4 is overloaded. Try weighted round robin.</figcaption>
            </figure>
          </div>
        </section>

        <section className="wrap" style={{ paddingTop: 128, paddingBottom: 144 }}>
          <div className="g12" style={{ rowGap: 48 }}>
            <h2 style={{ gridColumn: "1/10" }}>Sixteen weeks, seven phases, one system</h2>
            <div style={{ gridColumn: "1/13" }}>
              <div className="weeks" role="img" aria-label="16 weeks coloured by phase">
                {weeks.map((w) => (
                  <div key={w} style={{ background: `var(--phase-${phaseOf(w)})`, color: `var(--on-phase-${phaseOf(w)})` }}><span>{w}</span></div>
                ))}
              </div>
              <div className="ruler-l" style={{ display: "grid", gridTemplateColumns: "repeat(16,minmax(0,1fr))" }}>
                {PHASES.map((p) => (
                  <div key={p.n} style={{ gridColumn: `${p.weeks[0]}/${p.weeks[1] + 1}` }}>{p.short}</div>
                ))}
              </div>
            </div>
            <p style={{ gridColumn: "1/7", margin: 0 }}>About eight hours a week. The Today page tells you what to do next: flashcards due, the next lesson, the next challenge, and the weak spot you keep missing.</p>
            <div style={{ gridColumn: "8/13", display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
              <Link className="btn pri" href="/today">Start week 1 <Arrow /></Link><span className="muted small">Free, runs in your browser, no account</span>
            </div>
          </div>
        </section>
      </main>

      <footer className="wrap foot">
        <span className="brand small"><Mark size={18} /> SysDesign Lab</span>
        <span className="muted small">Your progress stays in this browser.</span>
      </footer>
    </div>
  );
}
