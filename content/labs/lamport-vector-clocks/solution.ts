export type Order = "before" | "after" | "equal" | "concurrent";

export class LamportClock {
  time = 0;

  /** A local event. */
  tick(): number { return ++this.time; }

  /** Sending is an event too; the returned timestamp travels with the message. */
  send(): number { return this.tick(); }

  /** Jump past the sender's timestamp so the receive is ordered after the send. */
  receive(t: number): number { this.time = Math.max(this.time, t) + 1; return this.time; }
}

function check(a: readonly number[], b: readonly number[]): void {
  if (a.length !== b.length) throw new RangeError(`vector lengths differ: ${a.length} vs ${b.length}`);
}

/** Element-wise maximum: everything either side has seen. Inputs are not modified. */
export function merge(a: readonly number[], b: readonly number[]): number[] {
  check(a, b);
  return a.map((x, i) => Math.max(x, b[i]));
}

export function compare(a: readonly number[], b: readonly number[]): Order {
  check(a, b);
  const aLeB = a.every((x, i) => x <= b[i]);
  const bLeA = a.every((x, i) => b[i] <= x);
  if (aLeB && bLeA) return "equal";
  if (aLeB) return "before"; // a happened before b
  if (bLeA) return "after";
  return "concurrent";       // each has seen something the other has not
}

export class VectorClock {
  private v: number[];

  constructor(private pid: number, n: number) { this.v = new Array<number>(n).fill(0); }

  value(): number[] { return [...this.v]; } // a copy, so callers can't mutate our state

  /** A local event: bump only our own entry. */
  increment(): number[] { this.v[this.pid]++; return this.value(); }

  send(): number[] { return this.increment(); }

  receive(other: readonly number[]): number[] { this.v = merge(this.v, other); return this.increment(); }
}
