# AI proxy (optional)

SysDesign Lab calls AI providers straight from your browser. Anthropic allows that (the site sends the opt-in header), and so do the built-in Gemini, Groq, OpenRouter and OpenAI presets, so most people never need this. Some other OpenAI-compatible endpoints don't send CORS headers, so the browser blocks the reply, and the AI features say they "could not reach the endpoint".

This proxy runs on your own machine, listens on `127.0.0.1` only, forwards requests to the endpoint, and adds the CORS headers. It stores and logs nothing.

```bash
AI_PROXY_TARGET=https://api.openai.com/v1 node scripts/ai-proxy/proxy.mjs
```

Then open Settings → AI, choose **Other OpenAI-compatible endpoint**, and set the base URL to `http://127.0.0.1:8787`. Your key still goes in Settings; the proxy just passes the `Authorization` header through.

| Variable | Default | Meaning |
|---|---|---|
| `AI_PROXY_TARGET` | `https://api.openai.com/v1` | The real API root |
| `AI_PROXY_PORT` | `8787` | Local port |
| `AI_PROXY_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | Comma-separated origins allowed to call it (add your deployed site's origin if you use one) |

Needs Node 18 or newer (for the built-in `fetch`).
