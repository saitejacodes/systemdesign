Read CLAUDE.md. Task: add optional AI features. Everything must work without a key and
degrade gracefully.

1. Settings → AI: provider selector (Anthropic, OpenAI-compatible endpoint), API key
   (stored only in IndexedDB in Settings.apiKey; never sent anywhere except the chosen
   provider; never included in "Export all data"; clear warning text about storing keys
   in the browser), model name, "Test connection".
   /lib/ai/client.ts: provider-agnostic interface with streaming, timeout (60s),
   one retry with backoff, clear error messages (invalid key, rate limit, network).
   Check each provider's current docs for direct browser access (some require an
   explicit opt-in header, others block browser requests with CORS). If a provider
   blocks browser requests, explain that in the UI and document an optional tiny local
   proxy script in /scripts/ai-proxy.
2. AI Tutor (RightPanel tab): context-aware chat. System prompt includes the current page
   title, section topics and (trimmed) lesson text. Modes: "Explain simpler",
   "Give me an example", "Quiz me on this page", "Check my understanding" (learner explains,
   tutor critiques). Streamed responses with markdown. Conversation stored per page in
   the TutorConversation table (CLAUDE.md §4).
3. AI Interviewer (Interview Mode): when enabled, the interviewer
   - answers clarifying questions in character (grounded in meta.json clarifying answers),
   - asks follow-up deep-dive questions based on the learner's current design
     (send a compact text serialization of the graph + panels),
   - after submission, scores against rubric.json with a justification per criterion
     and 3 specific improvements, saved in InterviewAttempt.aiFeedback. Show AI scores
     next to self-scores (never replace them).
4. Explain-my-design button in Design Studio: identifies bottlenecks, SPOFs and missing
   pieces, referencing Run Mode metrics.
5. Token/cost display per request (estimated) and a monthly usage counter stored in the
   AiUsage table (CLAUDE.md §4).
6. All AI output is labeled "AI-generated: may contain mistakes".

Definition of Done: CLAUDE.md §8; with no key, all AI entry points show a friendly
"Add an API key in Settings" message; unit tests for the graph serializer, prompt
builders, and that exports never contain the key.
