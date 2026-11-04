#!/bin/sh
# Runs k6/step.js at increasing arrival rates and prints one row per rate. The knee is the last rate before
# TTFT p95 jumps (queueing starts) or requests start failing (shedding). Defaults take ~8 minutes.
#   ./scripts/find-knee.sh                       uses a local k6 binary
#   K6="docker compose --profile loadtest run --rm k6" ./scripts/find-knee.sh   uses the k6 container
set -eu
RATES="${RATES:-0.25 0.5 1 1.5 2 3 4}"
DURATION="${DURATION:-60s}"
K6="${K6:-k6}"
SCRIPT="${SCRIPT:-k6/step.js}"
case "$K6" in *docker*) SCRIPT=/scripts/step.js ;; esac

printf "%-6s %-8s %-7s %-8s %-10s %-10s %-10s %-10s %-10s\n" rate reqs fail% dropped ttft_p50 ttft_p95 ttft_p99 tpot_p95 out_tok/s
for r in $RATES; do
  line=$($K6 run --quiet -e RATE="$r" -e DURATION="$DURATION" "$SCRIPT" 2>/dev/null | grep '^{"rate"' || true)
  if [ -z "$line" ]; then echo "rate $r: no summary (is the stack up?)"; continue; fi
  echo "$line" | node -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      const x = JSON.parse(s);
      const row = [x.rate, x.requests, x.failed, x.dropped, x.ttft_p50_ms, x.ttft_p95_ms, x.ttft_p99_ms, x.tpot_p95_ms, x.output_tokens_per_s];
      console.log(row.map((v, i) => String(v).padEnd(i < 1 ? 7 : i < 4 ? 8 : 11)).join(""));
    });'
done
