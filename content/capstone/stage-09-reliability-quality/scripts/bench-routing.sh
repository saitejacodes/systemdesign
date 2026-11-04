#!/bin/sh
# Sends REQUESTS chat requests, CONCURRENCY at a time, spread over 3 different long system prompts, then prints
# each gateway's per-replica routing stats. Run it once per ROUTER_POLICY and compare prefixHitRatio and TTFT.
#   ROUTER_POLICY=round_robin docker compose up -d && ./scripts/bench-routing.sh
set -eu
REQUESTS="${REQUESTS:-60}"
CONCURRENCY="${CONCURRENCY:-6}"
URL="${URL:-http://localhost:8080}"
KEY="${KEY:-sk-lab-acme-0001}"

# A ~400-token system prompt per "product": the shared prefix the replica's KV cache can reuse.
policy() {
  i=0; out="You are the support assistant for product $1. Follow these rules."
  while [ $i -lt 40 ]; do out="$out Rule $i: answer in one short sentence and never invent facts about product $1."; i=$((i + 1)); done
  printf '%s' "$out"
}

for p in 0 1 2; do policy "$p" > /tmp/bench-sys-$p.txt; done

seq 1 "$REQUESTS" | xargs -P "$CONCURRENCY" -I{} sh -c '
  n={}; p=$((n % 3))
  sys=$(cat /tmp/bench-sys-$p.txt)
  curl -s -o /dev/null -w "%{time_starttransfer} %{http_code}\n" "'"$URL"'/v1/chat/completions" \
    -H "authorization: Bearer '"$KEY"'" -H "content-type: application/json" \
    -d "{\"stream\":true,\"max_tokens\":16,\"temperature\":0,\"messages\":[{\"role\":\"system\",\"content\":\"$sys\"},{\"role\":\"user\",\"content\":\"Question number $n: what is your name?\"}]}"
' > /tmp/bench-results.txt

echo "time-to-first-byte (= TTFT, the gateway sends headers with the first token), seconds:"
sort -n /tmp/bench-results.txt | awk '{ a[NR] = $1; if ($2 != "200") bad++ } END {
  printf "  n=%d  p50=%.3f  p95=%.3f  max=%.3f  non-200=%d\n", NR, a[int(NR*0.5)+1], a[int(NR*0.95)+1], a[NR], bad }'
for port in 8091 8092; do echo "gateway on :$port"; curl -s "http://localhost:$port/admin/replicas"; echo; done
