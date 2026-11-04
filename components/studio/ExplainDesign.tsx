"use client";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { AddKeyNotice, AiError, AiText, RequestCost } from "@/components/ai/AiParts";
import { useAiConfig, useAiRequest } from "@/components/ai/useAi";
import { EXPLAIN_SYSTEM, explainDesignPrompt } from "@/lib/ai/prompts";
import type { TrafficProfile } from "@/lib/studio/sim/types";
import type { StudioGraph } from "@/lib/studio/types";

/** "Explain my design": the AI reviews the graph with its Run Mode numbers (average and peak) for bottlenecks, SPOFs and gaps. */
export function ExplainDesign({ open, onOpenChange, graph, profile, title }: { open: boolean; onOpenChange: (o: boolean) => void; graph: StudioGraph; profile: TrafficProfile; title: string }) {
  const cfg = useAiConfig();
  const ai = useAiRequest(cfg);
  const empty = !graph.nodes.some((n) => n.kind !== "note" && n.kind !== "frame");
  const go = () => void ai.run({ system: EXPLAIN_SYSTEM, messages: [{ role: "user", content: explainDesignPrompt(graph, profile, title) }], effort: "medium", maxTokens: 16_000 });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) ai.stop(); onOpenChange(o); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogTitle className="fm-h4">Explain my design</DialogTitle>
        <DialogDescription>Bottlenecks, single points of failure and missing pieces, using this design&apos;s Run Mode numbers at average and peak traffic ({profile.qps.toLocaleString()} QPS, peak ×{profile.peakMultiplier}).</DialogDescription>
        <div className="grid gap-3 pt-2">
          {!cfg ? <AddKeyNotice feature="Explain my design" /> : empty ? <p className="text-ink-muted">Add some components first: there is nothing to review yet.</p> : (
            <>
              <div className="flex gap-2">
                <button type="button" className="fm-btn fm-btn--primary" disabled={ai.busy} onClick={go}>{ai.busy ? "Reviewing…" : ai.text ? "Review again" : "Review my design"}</button>
                {ai.busy && <button type="button" className="fm-btn" onClick={ai.stop}>Stop</button>}
              </div>
              {(ai.busy || ai.text) && <AiText text={ai.text} busy={ai.busy} />}
              {ai.error && <AiError message={ai.error} />}
              {ai.meta && <RequestCost meta={ai.meta} />}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
