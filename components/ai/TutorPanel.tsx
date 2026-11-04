"use client";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Send, Square, Trash2 } from "lucide-react";
import { getAdapter } from "@/lib/db/adapter";
import type { TutorConversation } from "@/lib/db/types";
import { TUTOR_MODES, tutorMessages, tutorSystem, type PageContext } from "@/lib/ai/prompts";
import type { ChatMessage } from "@/lib/ai/types";
import { useTutorTopics } from "@/lib/ui-store";
import { AddKeyNotice, AiError, AiText, RequestCost } from "./AiParts";
import { useAiConfig, useAiRequest } from "./useAi";

/** What the tutor knows about the page: its heading, the lesson topics (lesson pages) and the visible text of <main>. */
function pageContext(url: string, topics: string[]): PageContext {
  const main = document.getElementById("main");
  const title = main?.querySelector("h1")?.textContent?.trim() || document.title;
  return { url, title, topics, text: main?.innerText ?? "" };
}

/** AI Tutor tab of the right panel: a context-aware chat per page, stored in tutorConversations (id = page path). */
export function TutorPanel() {
  const pageId = usePathname();
  const cfg = useAiConfig();
  const convo = useLiveQuery(() => getAdapter().get("tutorConversations", pageId).then((c) => c ?? null), [pageId]);
  if (!cfg) return <AddKeyNotice feature="The AI Tutor" />;
  if (convo === undefined) return <p className="fm-cap">Loading…</p>;
  return <Chat key={pageId} pageId={pageId} initial={convo?.messages ?? []} />;
}

function Chat({ pageId, initial }: { pageId: string; initial: ChatMessage[] }) {
  const cfg = useAiConfig();
  const ai = useAiRequest(cfg);
  const topics = useTutorTopics((s) => s.topics);
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const [draft, setDraft] = useState("");
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [messages.length, ai.text]);

  const save = (m: ChatMessage[]) => {
    const row: TutorConversation = { id: pageId, pageId, messages: m, updatedAt: new Date().toISOString() };
    return m.length ? getAdapter().put("tutorConversations", row) : getAdapter().delete("tutorConversations", pageId);
  };

  const send = async (content: string) => {
    const text = content.trim();
    if (!text || ai.busy) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setDraft("");
    await save(next);
    const r = await ai.run({ system: tutorSystem(pageContext(pageId, topics)), messages: tutorMessages(next), effort: "low" });
    if (r) {
      const done: ChatMessage[] = [...next, { role: "assistant", content: r.text }];
      setMessages(done);
      await save(done);
    }
  };

  const reset = async () => { ai.stop(); ai.clear(); setMessages([]); await save([]); };

  return (
    <div className="grid gap-3" data-testid="tutor">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tutor modes">
        {TUTOR_MODES.map((m) => (
          <button key={m.id} type="button" className="fm-btn fm-btn--tool" disabled={ai.busy} onClick={() => send(m.prompt)}>{m.label}</button>
        ))}
      </div>
      <ol className="grid gap-3" aria-label="Conversation" aria-live="polite">
        {messages.map((m, i) => (
          <li key={i} className={m.role === "user" ? "border-l-2 border-line pl-3 text-[15px]" : ""}>
            {m.role === "user" ? <><span className="fm-cap">You · </span>{m.content}</> : <AiText text={m.content} />}
          </li>
        ))}
        {ai.busy && <li><AiText text={ai.text} busy /></li>}
      </ol>
      {ai.error && <AiError message={ai.error} />}
      {ai.meta && <RequestCost meta={ai.meta} />}
      <div ref={end} />
      <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); void send(draft); }}>
        <label htmlFor="tutor-input" className="sr-only">Ask the tutor about this page</label>
        <textarea id="tutor-input" rows={3} className="fm-input" value={draft} placeholder="Ask about this page…" onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(draft); } }} />
        <div className="flex gap-2">
          {ai.busy
            ? <button type="button" className="fm-btn" onClick={ai.stop}><Square size={14} aria-hidden /> Stop</button>
            : <button type="submit" className="fm-btn fm-btn--primary" disabled={!draft.trim()}><Send size={14} aria-hidden /> Send</button>}
          {messages.length > 0 && <button type="button" className="fm-btn fm-btn--tool ml-auto" onClick={reset}><Trash2 size={14} aria-hidden /> Clear chat</button>}
        </div>
      </form>
    </div>
  );
}
