"use client";
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getAdapter } from "@/lib/db/adapter";
import { saveSettings, useSettings } from "@/lib/db/hooks";
import { useAiConfig, useAiRequest } from "@/components/ai/useAi";
import { RequestCost } from "@/components/ai/AiParts";
import { formatCost } from "@/lib/ai/pricing";
import { listModels } from "@/lib/ai/client";
import { connectAllowed } from "@/lib/security/csp";
import { DEFAULT_MODEL, PRESETS, PROVIDERS, PROVIDER_LABEL, describeError, isProvider, type Provider } from "@/lib/ai/types";
import { monthKey } from "@/lib/ai/usage";

/** Settings → AI: provider, key, model, connection test and this month's usage. */
export function AiSettings() {
  const s = useSettings();
  const provider: Provider = isProvider(s.aiProvider) ? s.aiProvider : "anthropic";
  const preset = PRESETS[provider];
  const cfg = useAiConfig();
  const test = useAiRequest(cfg);
  const [ok, setOk] = useState(false);
  const [show, setShow] = useState(false);
  const usage = useLiveQuery(() => getAdapter().get("aiUsage", monthKey()), []);
  const [models, setModels] = useState<{ provider: Provider; ids: string[] } | null>(null);
  const [modelsBusy, setModelsBusy] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const ids = models?.provider === provider ? models.ids : [];

  const loadModels = async () => {
    setModelsBusy(true); setModelsError(null);
    try {
      setModels({ provider, ids: await listModels({ provider, apiKey: (s.apiKey ?? "").trim(), baseUrl: s.aiBaseUrl }) });
    } catch (e) {
      setModelsError(describeError(e, provider));
    } finally {
      setModelsBusy(false);
    }
  };

  const runTest = async () => {
    setOk(false);
    const r = await test.run({ system: "You are a connection test.", messages: [{ role: "user", content: "Reply with the single word OK." }], maxTokens: 512, effort: "low" });
    if (r) setOk(true);
  };

  return (
    <section className="fm-card" aria-label="AI" id="ai">
      <h2 className="fm-card__head">AI (optional)</h2>
      <div className="fm-card__body grid gap-5">
        <p className="text-ink-muted">
          Adds the AI Tutor, the AI interviewer and Explain-my-design. Everything else works without a key. Requests go straight from this browser to the provider you choose, on your account and at your cost.
        </p>
        <p role="note" className="border-l-2 pl-3 text-[15px]" style={{ borderColor: "var(--status-hot)" }}>
          <strong>Your key is stored in this browser (IndexedDB), not encrypted.</strong> Anyone with access to this browser profile, or any script running on this site, could read it. It is sent only to the provider below and is never included in Export all data. Use a key with a spending limit, on a machine you trust, and remove it when you are done.
        </p>
        <div className="flex flex-wrap gap-5">
          <div className="fm-field">
            <label htmlFor="ai-provider">Provider</label>
            <select id="ai-provider" className="fm-input" value={provider} onChange={(e) => { setOk(false); setModelsError(null); saveSettings({ aiProvider: e.target.value, aiModel: "" }); }}>
              {PROVIDERS.map((p) => <option key={p} value={p}>{PROVIDER_LABEL[p]}</option>)}
            </select>
          </div>
          <div className="fm-field">
            <label htmlFor="ai-model">Model</label>
            <div className="flex gap-2">
              <input id="ai-model" list="ai-model-list" className="fm-input fm-input--mono min-w-0 flex-1" value={s.aiModel ?? ""} placeholder={DEFAULT_MODEL[provider] || "pick or type a model id"} onChange={(e) => { setOk(false); saveSettings({ aiModel: e.target.value }); }} autoComplete="off" spellCheck={false} />
              <button type="button" className="fm-btn fm-btn--tool" disabled={!s.apiKey?.trim() || modelsBusy} onClick={loadModels}>{modelsBusy ? "Loading…" : "Load models"}</button>
            </div>
            <datalist id="ai-model-list">{ids.map((m) => <option key={m} value={m} />)}</datalist>
            {provider === "anthropic"
              ? <span className="fm-help">Blank uses {DEFAULT_MODEL.anthropic}.</span>
              : <span className="fm-help">Add your key, then Load models to pick from what your key can use.</span>}
            {ids.length > 0 && <span className="fm-help" role="status">{ids.length} models available. Click the model box to choose one.</span>}
            {modelsError && <span className="fm-help is-error" role="alert">{modelsError}</span>}
          </div>
        </div>
        {preset && (
          <p className="fm-help">
            Get a key at <a className="fm-link" href={preset.keysUrl} target="_blank" rel="noreferrer">{new URL(preset.keysUrl).host}</a> · <a className="fm-link" href={preset.modelsUrl} target="_blank" rel="noreferrer">{PROVIDER_LABEL[provider]} models</a>. Requests go to <code>{preset.baseUrl}</code>, which accepts browser requests, so no proxy is needed.
          </p>
        )}
        {provider === "openai-compatible" && (
          <div className="fm-field">
            <label htmlFor="ai-base">Base URL</label>
            <input id="ai-base" className="fm-input fm-input--mono" value={s.aiBaseUrl ?? ""} placeholder="http://localhost:11434/v1" onChange={(e) => { setOk(false); saveSettings({ aiBaseUrl: e.target.value }); }} autoComplete="off" spellCheck={false} />
            <span className="fm-help">The root that /chat/completions hangs off. Some endpoints refuse requests from a web page (CORS). If the test says it can&apos;t reach the endpoint, run the tiny local proxy in <code>scripts/ai-proxy</code> and put <code>http://127.0.0.1:8787</code> here.</span>
            {/^https?:\/\/./.test((s.aiBaseUrl ?? "").trim()) && !connectAllowed((s.aiBaseUrl ?? "").trim()) && (
              <span role="alert" className="fm-help is-error">This site&apos;s security policy only allows the listed providers and localhost, so requests to {hostOf(s.aiBaseUrl ?? "")} will be blocked. Use the local proxy above.</span>
            )}
          </div>
        )}
        {provider === "anthropic" && <p className="fm-help">Anthropic allows browser requests when the client opts in, which this site does, so no proxy is needed.</p>}
        <div className="fm-field">
          <label htmlFor="ai-key">API key</label>
          <div className="flex gap-2">
            <input id="ai-key" type={show ? "text" : "password"} className="fm-input fm-input--mono min-w-0 flex-1" value={s.apiKey ?? ""} onChange={(e) => { setOk(false); saveSettings({ apiKey: e.target.value }); }} autoComplete="off" spellCheck={false} />
            <button type="button" className="fm-btn fm-btn--tool" aria-pressed={show} onClick={() => setShow((v) => !v)}>{show ? "Hide" : "Show"}</button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="fm-btn fm-btn--primary" disabled={!cfg || test.busy} onClick={runTest}>{test.busy ? "Testing…" : "Test connection"}</button>
          {s.apiKey && <button type="button" className="fm-btn fm-btn--danger" onClick={() => { setOk(false); saveSettings({ apiKey: "" }); }}>Remove key</button>}
          {!cfg && <span className="fm-help">Add a key{provider === "anthropic" ? "" : " and a model"} to test.</span>}
        </div>
        {ok && <p role="status" className="fm-help">Connected. The provider answered.</p>}
        {test.error && <p role="alert" className="fm-help is-error">{test.error}</p>}
        {ok && test.meta && <RequestCost meta={test.meta} />}
        <p className="fm-cap tabular-nums" data-testid="ai-usage">
          This month · {usage?.requests ?? 0} requests · {(usage?.inputTokens ?? 0).toLocaleString()} in · {(usage?.outputTokens ?? 0).toLocaleString()} out · ≈ {formatCost(usage?.estimatedCost ?? 0)}
        </p>
        <p className="fm-help">Costs are estimates from list prices; your provider&apos;s bill is the real number. Models without a known price count tokens only.</p>
      </div>
    </section>
  );
}

const hostOf = (url: string) => { try { return new URL(url.trim()).host; } catch { return url; } };
