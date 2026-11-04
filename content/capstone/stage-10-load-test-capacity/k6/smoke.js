// One user, a few requests: does the whole path work before you load it?
//   k6 run k6/smoke.js        (or: docker compose --profile loadtest run --rm k6 run /scripts/smoke.js)
import { check } from "k6";
import { chat } from "./lib.js";

export const options = {
  vus: 1,
  iterations: 5,
  thresholds: {
    checks: ["rate==1"],
    http_req_failed: ["rate==0"],
  },
};

export default function () {
  const res = chat("sk-lab-load-0001", [{ role: "user", content: "Name one benefit of streaming responses, in one sentence." }], 48, {
    name: "smoke",
  });
  check(res, {
    "status 200": (r) => r.status === 200,
    "is an event stream": (r) => (r.headers["Content-Type"] || "").startsWith("text/event-stream"),
    "ends with [DONE]": (r) => typeof r.body === "string" && r.body.trim().endsWith("data: [DONE]"),
  });
}
