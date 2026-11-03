export type Order = "before" | "after" | "equal" | "concurrent";

export class LamportClock {
  time = 0;

  tick(): number {
    // TODO: a local event increments the counter; return it
    return this.time;
  }

  send(): number {
    // TODO: sending is an event: tick and return the timestamp to attach
    return this.time;
  }

  receive(t: number): number {
    // TODO: counter = max(counter, t) + 1; return it
    return this.time;
  }
}

export function merge(a: readonly number[], b: readonly number[]): number[] {
  // TODO: element-wise max as a NEW array; RangeError if the lengths differ
  return [...a];
}

export function compare(a: readonly number[], b: readonly number[]): Order {
  // TODO: "equal", "before" (a <= b everywhere), "after", or "concurrent";
  // RangeError if the lengths differ
  return "equal";
}

export class VectorClock {
  private v: number[];

  constructor(private pid: number, n: number) { this.v = new Array<number>(n).fill(0); }

  value(): number[] { return [...this.v]; }

  increment(): number[] {
    // TODO: bump only this process's entry; return a copy
    return this.value();
  }

  send(): number[] {
    // TODO: an increment whose copy travels with the message
    return this.value();
  }

  receive(other: readonly number[]): number[] {
    // TODO: merge with the received vector, then increment; return a copy
    return this.value();
  }
}
