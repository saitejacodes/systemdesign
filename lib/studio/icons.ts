import { CATALOG } from "./catalog";
import type { NodeKind } from "./types";

/*
 * Design Studio palette icons: small 2:1 isometric drawings in the PhasePath style
 * (components/brand/phase-path-markup.ts). Each returns SVG inner markup for a 64×64 viewBox.
 * Colours are CSS variables only, set through style="" (not presentation attributes) so the
 * markup themes itself and survives the canvas SVG/PNG export, which inlines the tokens.
 *   outline  var(--ink) 1.5     main body  var(--phase-N) from CATALOG[kind].phase
 *   parts    var(--surface)     accent     var(--cobalt), once per icon
 *   side faces get an ink overlay: .16 left, .32 right; cylinders .18 (as PhasePath).
 */

type P = readonly [number, number];

const r2 = (v: number) => String(Math.round(v * 100) / 100);
const pts = (ps: readonly P[]) => ps.map(([x, y]) => `${r2(x)},${r2(y)}`).join(" ");

const INK = "var(--ink)";
const SURFACE = "var(--surface)";
const COBALT = "var(--cobalt)";
const OUTLINE = `stroke:${INK};stroke-width:1.5;stroke-linejoin:round`;
const filled = (fill: string) => `fill:${fill};${OUTLINE}`;
const phaseVar = (phase: number) => `var(--phase-${phase})`;

const polygon = (ps: readonly P[], style: string) => `<polygon points="${pts(ps)}" style="${style}"/>`;
const shade = (ps: readonly P[], opacity: number) => polygon(ps, `fill:${INK};opacity:${opacity}`);
const path = (d: string, style: string) => `<path d="${d}" style="${style}"/>`;
const line = (a: P, b: P, width = 1, color = INK) =>
  `<line x1="${r2(a[0])}" y1="${r2(a[1])}" x2="${r2(b[0])}" y2="${r2(b[1])}" style="stroke:${color};stroke-width:${width};stroke-linecap:round"/>`;
const ellipse = (cx: number, cy: number, rx: number, ry: number, style: string) =>
  `<ellipse cx="${r2(cx)}" cy="${r2(cy)}" rx="${r2(rx)}" ry="${r2(ry)}" style="${style}"/>`;

/** A point on the ground/top plane: u runs right-down (1, .5), v runs left-down (-1, .5). */
const iso = (cx: number, cy: number, u: number, v: number): P => [cx + u - v, cy + (u + v) / 2];
const down = ([x, y]: P, h: number): P => [x, y + h];

/** Iso block whose top face is centred on (cx, cy), half-extents p (along u) and q (along v), height h. */
function box(cx: number, cy: number, p: number, q: number, h: number, fill: string, top = fill): string {
  const L = iso(cx, cy, -p, q), F = iso(cx, cy, p, q), R = iso(cx, cy, p, -q), B = iso(cx, cy, -p, -q);
  const left = [L, F, down(F, h), down(L, h)];
  const right = [F, R, down(R, h), down(F, h)];
  return (
    polygon(left, filled(fill)) + shade(left, 0.16) +
    polygon(right, filled(fill)) + shade(right, 0.32) +
    polygon([B, R, F, L], filled(top))
  );
}

/** A flat shape on the top plane of a block centred on (cx, cy): local [u, v] points projected. */
const onPlane = (cx: number, cy: number, local: readonly P[]) => local.map(([u, v]) => iso(cx, cy, u, v));

/** Upright cylinder, top ellipse centred on (cx, cy), 2:1 ellipses, optional band lines. */
function cyl(cx: number, cy: number, rx: number, h: number, fill: string, bands = 0, top = fill): string {
  const ry = rx / 2;
  const body = `M${r2(cx - rx)},${r2(cy)} L${r2(cx - rx)},${r2(cy + h)} A${r2(rx)},${r2(ry)} 0 0 0 ${r2(cx + rx)},${r2(cy + h)} L${r2(cx + rx)},${r2(cy)}`;
  let bandD = "";
  for (let i = 1; i <= bands; i++) {
    const y = cy + (h * i) / (bands + 1);
    bandD += `M${r2(cx - rx)},${r2(y)} A${r2(rx)},${r2(ry)} 0 0 0 ${r2(cx + rx)},${r2(y)} `;
  }
  return (
    path(body, filled(fill)) +
    path(body, `fill:${INK};opacity:.18`) +
    (bandD ? path(bandD.trim(), `fill:none;stroke:${INK};stroke-width:1`) : "") +
    ellipse(cx, cy, rx, ry, filled(top))
  );
}

/** A point on the right face of a block: s across the face (0 at the front edge), t down from its top edge. */
const onRight = (front: P, s: number, t: number): P => [front[0] + s, front[1] - s / 2 + t];
/** A point on the left face: s across from the left corner toward the front edge, t down. */
const onLeft = (left: P, s: number, t: number): P => [left[0] + s, left[1] + s / 2 + t];

type Drawing = (phase: string) => string;

const DRAWINGS: Record<NodeKind, Drawing> = {
  // Laptop: keyboard plate with its screen standing on the back edge.
  client: (ph) => {
    const cx = 35, cy = 41, p = 14, q = 10;
    const L = iso(cx, cy, -p, q), B = iso(cx, cy, -p, -q);
    const lift = (a: P): P => [a[0] - 3, a[1] - 23];
    const screen = [L, B, lift(B), lift(L)];
    const inset = (a: P, b: P, s: number, t: number): P => [a[0] + (b[0] - a[0]) * s - 3 * t, a[1] + (b[1] - a[1]) * s - 23 * t];
    const glass = [inset(L, B, 0.1, 0.15), inset(L, B, 0.9, 0.15), inset(L, B, 0.9, 0.85), inset(L, B, 0.1, 0.85)];
    const keys = onPlane(cx, cy, [[-7, -5], [9, -5], [9, 5], [-7, 5]]);
    return (
      box(cx, cy, p, q, 3, ph) +
      polygon(keys, `fill:${SURFACE};stroke:${INK};stroke-width:1;stroke-linejoin:round`) +
      polygon(screen, filled(ph)) + shade(screen, 0.16) +
      polygon(glass, filled(SURFACE)) +
      line(inset(L, B, 0.25, 0.4), inset(L, B, 0.7, 0.4), 1.5, COBALT) +
      line(inset(L, B, 0.25, 0.6), inset(L, B, 0.55, 0.6), 1)
    );
  },

  // Signpost: names pointing two ways from one plate.
  dns: (ph) => {
    const arrow = (ox: number, oy: number, dir: 1 | -1, len: number) => {
      // Sign in a vertical plane running along (dir, -dir/2) from the pole.
      const at = (s: number, t: number): P => [ox + dir * s, oy - s / 2 + t];
      return [at(0, 0), at(len, 0), at(len + 5, 4), at(len, 8), at(0, 8)];
    };
    const right = arrow(32, 11, 1, 17);
    const left = arrow(32, 24, -1, 15);
    return (
      box(32, 47, 12, 12, 5, ph) +
      line([32, 47], [32, 7], 2) +
      polygon(left, filled(ph)) + shade(left, 0.16) +
      polygon(right, filled(SURFACE)) +
      line([35, 13.5], [45, 8.5], 1.5, COBALT)
    );
  },

  // Globe over an edge plate with points of presence.
  cdn: (ph) => {
    const pop = (u: number, v: number, fill: string) => {
      const [x, y] = iso(32, 46, u, v);
      return box(x, y - 5, 3, 3, 5, fill);
    };
    return (
      box(32, 46, 12, 12, 4, SURFACE) +
      `<circle cx="32" cy="26" r="16" style="${filled(ph)}"/>` +
      path("M32,10 A16,16 0 0 1 32,42 A7,16 0 0 1 32,10 Z", `fill:${INK};opacity:.16`) +
      ellipse(32, 26, 7, 16, `fill:none;stroke:${INK};stroke-width:1`) +
      path("M16.8,21 A16,5 0 0 0 47.2,21 M16,26 A16,6 0 0 0 48,26 M17.6,33 A15,4 0 0 0 46.4,33", `fill:none;stroke:${INK};stroke-width:1`) +
      pop(-8, 8, SURFACE) + pop(8, -8, SURFACE) + pop(8, 8, COBALT)
    );
  },

  // Plate that fans one stream out to three targets.
  "load-balancer": (ph) => {
    const c = (u: number, v: number) => iso(32, 31, u, v);
    const hub = c(-3, -3);
    const targets: P[] = [c(10, -7), c(9, 9), c(-7, 10)];
    const dot = ([x, y]: P) => ellipse(x, y, 3.2, 1.6, filled(SURFACE));
    return (
      box(32, 31, 14, 14, 6, ph) +
      line(c(-12, -12), hub, 1.75) +
      targets.map((t) => line(hub, t, 1.25)).join("") +
      targets.map(dot).join("") +
      ellipse(hub[0], hub[1], 4.2, 2.1, filled(COBALT))
    );
  },

  // Gate: two pillars and a lintel over an entry plate.
  "api-gateway": (ph) => {
    const cx = 32, cy = 41, H = 22;
    const base = (u: number): P => iso(cx, cy, u, 0);
    const pillar = (u: number) => {
      const [x, y] = base(u);
      return box(x, y - H, 3, 3, H, ph);
    };
    const lintelF = iso(cx, cy - H - 5, 14, 3.5);
    const lock = onRight(lintelF, 0, 0);
    return (
      box(cx, cy, 15, 9, 5, SURFACE) +
      line(iso(cx, cy, -4, 8), iso(cx, cy, -4, -8), 1.25) +
      line(iso(cx, cy, 4, 8), iso(cx, cy, 4, -8), 1.25) +
      pillar(-10) + pillar(10) +
      box(cx, cy - H - 5, 14, 3.5, 5, ph) +
      polygon([onRight(lock, 2, 1.2), onRight(lock, 5, 1.2), onRight(lock, 5, 4), onRight(lock, 2, 4)], filled(COBALT))
    );
  },

  // Server: a tall block with rack slots and one live LED.
  service: (ph) => {
    const cx = 32, cy = 21, p = 12, q = 12, h = 23;
    const F = iso(cx, cy, p, q);
    const slot = (t: number) => line(onRight(F, 3, t), onRight(F, 17, t), 1);
    const led = (t: number, fill: string) => {
      const [x, y] = onRight(F, 20.5, t);
      return ellipse(x, y, 1.4, 1.4, `fill:${fill};stroke:${INK};stroke-width:1`);
    };
    return (
      box(cx, cy, p, q, h, ph) +
      slot(6) + slot(12) + slot(18) +
      led(5.5, COBALT) + led(11.5, SURFACE) + led(17.5, SURFACE)
    );
  },

  // Fast block: a bolt on its face and speed lines behind it (one in the accent).
  cache: (ph) => {
    const cx = 34, cy = 25, p = 12, q = 12, h = 17;
    const F = iso(cx, cy, p, q);
    const bolt = ([[13, 1], [6, 9.5], [11, 9.5], [8, 16], [17, 6.5], [12, 6.5], [15, 1]] as const).map(([s, t]) => onRight(F, s, t));
    return (
      line([2, 28], [7, 28], 1.5) + line([0, 35], [7, 35], 1.75, COBALT) + line([3, 42], [8, 42], 1.5) +
      box(cx, cy, p, q, h, ph) +
      polygon(bolt, filled(SURFACE))
    );
  },

  // Relational primary with a smaller read replica.
  "sql-db": (ph) =>
    cyl(27, 17, 15, 30, ph, 2) +
    cyl(50, 39, 8, 13, SURFACE, 1, COBALT),

  // Stacked rings, key/value cells on the top ring.
  "nosql-db": (ph) => {
    const cell = (u: number, v: number, fill: string) =>
      polygon(onPlane(32, 13, [[u, v], [u + 6, v], [u + 6, v + 6], [u, v + 6]]), `fill:${fill};stroke:${INK};stroke-width:1;stroke-linejoin:round`);
    return (
      cyl(32, 41, 17, 7, ph) +
      cyl(32, 27, 17, 7, ph) +
      cyl(32, 13, 17, 7, ph) +
      cell(-6.5, -6.5, SURFACE) + cell(0.5, -6.5, SURFACE) + cell(-6.5, 0.5, SURFACE) + cell(0.5, 0.5, COBALT)
    );
  },

  // Four small shards on one plate.
  "shard-group": (ph) => {
    const shard = (u: number, v: number, fill: string) => {
      const [x, y] = iso(32, 33, u, v);
      return cyl(x, y - 12, 6.5, 12, fill);
    };
    return (
      box(32, 33, 14, 14, 6, ph) +
      shard(-7, -7, SURFACE) + shard(7, -7, SURFACE) + shard(-7, 7, SURFACE) + shard(7, 7, COBALT)
    );
  },

  // Long plate carrying messages in order; the head message is the accent.
  queue: (ph) => {
    const msg = (u: number, fill: string) => {
      const [x, y] = iso(30, 33, u, 0);
      return box(x, y - 7, 3.5, 3.5, 7, fill);
    };
    return (
      box(30, 33, 21, 8, 6, ph) +
      msg(-14, SURFACE) + msg(-5, SURFACE) + msg(4, SURFACE) + msg(13, COBALT)
    );
  },

  // Block with a gear on top: background work.
  worker: (ph) => {
    const cx = 32, cy = 30;
    const gear: P[] = [];
    const N = 8;
    for (let i = 0; i < N; i++) {
      const a = (i * 2 * Math.PI) / N;
      for (const [da, r] of [[-0.42, 6.2], [-0.2, 8.6], [0.2, 8.6], [0.42, 6.2]] as const) {
        gear.push([Math.cos(a + da) * r, Math.sin(a + da) * r]);
      }
    }
    const lifted = (dy: number) => onPlane(cx, cy - dy, gear);
    const side = lifted(1.5).map(([x, y]): P => [x, y + 2.5]);
    return (
      box(cx, cy, 12, 12, 17, ph) +
      polygon(side, filled(SURFACE)) + shade(side, 0.32) +
      polygon(lifted(1.5), filled(SURFACE)) +
      ellipse(cx, cy - 1.5, 3.6, 1.8, filled(COBALT))
    );
  },

  // Bucket with a blob inside.
  "object-storage": (ph) => {
    const body = "M13,20 L19,49 A13,6.5 0 0 0 45,49 L51,20";
    return (
      path(body, filled(ph)) +
      path(body, `fill:${INK};opacity:.18`) +
      path("M16,35 A16,8 0 0 0 48,35", `fill:none;stroke:${INK};stroke-width:1`) +
      ellipse(32, 20, 19, 9.5, filled(ph)) +
      ellipse(32, 20.6, 16, 7.6, filled(SURFACE)) +
      ellipse(32, 20.6, 16, 7.6, `fill:${INK};opacity:.16`) +
      box(28, 16, 4, 4, 5, COBALT) +
      box(39, 19, 3, 3, 3, SURFACE)
    );
  },

  // Index block with rows, a magnifier over it.
  "search-index": (ph) => {
    const cx = 32, cy = 39, p = 12, q = 12;
    const F = iso(cx, cy, p, q);
    const row = (t: number) => line(onRight(F, 3, t), onRight(F, 18, t), 1);
    return (
      box(cx, cy, p, q, 11, ph) +
      row(4) + row(7.5) +
      line([37, 24], [45, 32], 5) +
      line([37, 24], [45, 32], 2.5, COBALT) +
      `<circle cx="30" cy="17" r="9.5" style="${filled(SURFACE)}"/>` +
      path("M24.5,15 A6,6 0 0 1 30,10.6", `fill:none;stroke:${INK};stroke-width:1;stroke-linecap:round`)
    );
  },

  // Cylinder with embedding vectors on its top.
  "vector-db": (ph) => {
    const cx = 32, cy = 20;
    const tips: P[] = [[cx - 11, cy - 2], [cx + 4, cy - 6], [cx + 10, cy + 3.5]];
    return (
      cyl(cx, cy, 17, 26, ph, 1, SURFACE) +
      tips.map((t) => line([cx, cy + 1], t, 1.25)).join("") +
      tips.map(([x, y]) => ellipse(x, y, 2, 2, filled(COBALT))).join("") +
      ellipse(cx, cy + 1, 1.6, 0.9, `fill:${INK}`)
    );
  },

  // Model chip: a flat package with pins and a spark on its die.
  "llm-api": (ph) => {
    const cx = 32, cy = 31, p = 13, q = 13, h = 6;
    const L = down(iso(cx, cy, -p, q), h), F = down(iso(cx, cy, p, q), h);
    const pins: string[] = [];
    for (const s of [5, 11, 17, 23]) {
      const a = onLeft(L, s - 1, 0);
      pins.push(line(a, [a[0] - 1, a[1] + 4], 1.5));
      const b = onRight(F, s - 1, 0);
      pins.push(line(b, [b[0] + 1, b[1] + 4], 1.5));
    }
    const die = onPlane(cx, cy, [[-7, -7], [7, -7], [7, 7], [-7, 7]]);
    const spark = "M32,22 Q32.8,29.2 39,31 Q32.8,32.8 32,40 Q31.2,32.8 25,31 Q31.2,29.2 32,22 Z";
    return (
      pins.join("") +
      box(cx, cy, p, q, h, ph) +
      polygon(die, filled(SURFACE)) +
      path(spark, filled(COBALT))
    );
  },

  // Dashboard plate with rising metric bars.
  monitoring: (ph) => {
    const bar = (u: number, v: number, h: number, fill: string) => {
      const [x, y] = iso(32, 41, u, v);
      return box(x, y - h, 3.5, 3.5, h, fill);
    };
    return (
      box(32, 41, 14, 14, 4, ph) +
      bar(-7, 7, 8, SURFACE) + bar(0, 0, 14, SURFACE) + bar(7, -7, 22, COBALT)
    );
  },

  // A block you plug into but don't own: dashed boundary and a cable.
  "external-api": (ph) => {
    const cx = 38, cy = 27, p = 11, q = 11, h = 17;
    const plugTop = iso(cx, cy, 0, q + 5);
    const boundary = onPlane(cx, cy + h, [[-15, -15], [15, -15], [15, 15], [-15, 15]]);
    return (
      polygon(boundary, `fill:none;stroke:${INK};stroke-width:1;stroke-dasharray:2 3;stroke-linejoin:round`) +
      box(cx, cy, p, q, h, ph) +
      path("M16,50 Q8,50 6,56 T2,62", `fill:none;stroke:${INK};stroke-width:1.75;stroke-linecap:round`) +
      box(plugTop[0], plugTop[1] + 5, 4, 4, 7, COBALT)
    );
  },

  // Region / AZ: a dashed ground boundary with a name tab and members inside.
  frame: (ph) => {
    const cx = 32, cy = 35, p = 15, q = 15;
    const ground = onPlane(cx, cy, [[-p, -p], [p, -p], [p, q], [-p, q]]);
    const L = iso(cx, cy, -p, q), B = iso(cx, cy, -p, -q);
    const along = (s: number): P => [L[0] + (B[0] - L[0]) * s, L[1] + (B[1] - L[1]) * s];
    const tab = [along(0.12), along(0.6), down(along(0.6), -8), down(along(0.12), -8)];
    const member = (u: number, v: number, fill: string) => {
      const [x, y] = iso(cx, cy, u, v);
      return box(x, y - 6, 4, 4, 6, fill);
    };
    return (
      polygon(ground, `fill:${ph};fill-opacity:.22;stroke:${INK};stroke-width:1.5;stroke-dasharray:3 3;stroke-linejoin:round`) +
      polygon(tab, filled(ph)) + shade(tab, 0.16) +
      line([along(0.22)[0], along(0.22)[1] - 4], [along(0.5)[0], along(0.5)[1] - 4], 1.25, SURFACE) +
      member(-3, -7, SURFACE) + member(7, 3, SURFACE) + member(-4, 7, COBALT)
    );
  },

  // Paper note lying flat, corner folded, pinned. No curriculum phase: surface paper only.
  note: () => {
    const cx = 32, cy = 33, p = 15, q = 15, h = 2;
    const paper = onPlane(cx, cy, [[-p, -q], [p, -q], [p, q - 7], [p - 7, q], [-p, q]]);
    const fold = onPlane(cx, cy, [[p, q - 7], [p - 7, q - 7], [p - 7, q]]);
    const L = iso(cx, cy, -p, q), F = iso(cx, cy, p - 7, q);
    const edge = [L, F, down(F, h), down(L, h)];
    const text = (v: number, len: number) => line(iso(cx, cy, -10, v), iso(cx, cy, -10 + len, v), 1.25);
    const pin = iso(cx, cy, -9, -9);
    return (
      polygon(edge, filled(SURFACE)) + shade(edge, 0.16) +
      polygon(paper, filled(SURFACE)) +
      polygon(fold, filled(SURFACE)) + shade(fold, 0.16) +
      text(-2, 20) + text(3, 18) + text(8, 12) +
      ellipse(pin[0], pin[1], 3, 3, filled(COBALT))
    );
  },
};

/** The curriculum phase whose colour fills an icon's main body, or null for notes. */
export function iconPhase(kind: NodeKind): number | null {
  return kind === "note" ? null : CATALOG[kind].phase;
}

/** SVG inner markup (no <svg> wrapper) for a 64×64 viewBox. Pure string, safe to inline in exports. */
export function iconMarkup(kind: NodeKind): string {
  const phase = iconPhase(kind);
  return DRAWINGS[kind](phase === null ? SURFACE : phaseVar(phase));
}
