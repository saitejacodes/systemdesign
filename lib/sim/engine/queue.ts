/** Min-heap of events by time; equal times pop in insertion order, so runs stay deterministic. */
export class EventQueue<E> {
  private heap: { t: number; seq: number; e: E }[] = [];
  private seq = 0;

  get size() { return this.heap.length; }
  peekTime(): number | undefined { return this.heap[0]?.t; }

  push(t: number, e: E) {
    const h = this.heap;
    h.push({ t, seq: this.seq++, e });
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      [h[i], h[p]] = [h[p], h[i]];
      i = p;
    }
  }

  pop(): { t: number; e: E } | undefined {
    const h = this.heap;
    if (!h.length) return undefined;
    const top = h[0];
    const last = h.pop()!;
    if (h.length) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < h.length && this.less(l, m)) m = l;
        if (r < h.length && this.less(r, m)) m = r;
        if (m === i) break;
        [h[i], h[m]] = [h[m], h[i]];
        i = m;
      }
    }
    return { t: top.t, e: top.e };
  }

  /** Pops every event with time ≤ t, in order. */
  *drain(t: number) {
    while (this.heap.length && this.heap[0].t <= t) yield this.pop()!;
  }

  clear() { this.heap = []; }

  private less(a: number, b: number) {
    const x = this.heap[a];
    const y = this.heap[b];
    return x.t < y.t || (x.t === y.t && x.seq < y.seq);
  }
}
