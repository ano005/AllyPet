# Veyra

Landing page, app prototype and a serverless endpoint that receives structured JSON from an ElevenLabs Conversational AI agent.

## Structure

```
public/index.html          Landing page + live voice demo (ElevenLabs widget, client tools)
public/app.html            Full app prototype (9 screens)
public/support.js          Runtime the pages need
public/image-slot.js       Photo slots
api/elevenlabs-webhook.js  Server tool + post-call webhook endpoint
elevenlabs-tools.json      Tool definitions to paste into ElevenLabs
```

On Vercel, `public/` is served at the root, so the landing page is `/` and the app is `/app.html`. Open `public/index.html` directly in a browser to view it locally (needs internet for fonts, photos and the widget).

Add your deployed domain to the agent's allowed hosts in ElevenLabs so the widget loads.

## What it does

`POST /api/elevenlabs-webhook` handles two kinds of request:

| Request | How it's identified | Auth | Response |
|---|---|---|---|
| Server tool call (`research_products`) | any body without `type` | `x-veyra-key` header = `TOOL_SHARED_SECRET` | `{ ok, input, products, say }` |
| Post-call webhook | `type: "post_call_transcription"` | `ElevenLabs-Signature` HMAC with `ELEVENLABS_WEBHOOK_SECRET` | `{ received: true }` |

## Input schema (tool call)

```json
{
  "transcript": "Pet products between £20 and £30",
  "budget": 1500,
  "price_min": 20,
  "price_max": 30,
  "min_profit": 7,
  "category": "pets",
  "lightweight": true,
  "competition": "low",
  "experience": "none",
  "priority": "low_risk"
}
```
Only `transcript` is required. Numbers sent as strings are converted.

## Deploy (Vercel)

```bash
npm i -g vercel
vercel
vercel env add TOOL_SHARED_SECRET
vercel env add ELEVENLABS_WEBHOOK_SECRET
vercel --prod
```

## Received data log

Clicking **Talk to Veyra** starts a live voice conversation with the ElevenLabs agent (`@elevenlabs/client` SDK, agent `agent_0701m3rrc7b8frd8cbmm7y5ss85y`). Every message is saved in the browser under `veyra_received_log` as:

```json
{ "tool": "conversation", "source": "elevenlabs",
  "payload": { "conversation_id": "...", "agent_id": "...", "started_at": "...", "ended_at": "...",
    "message_count": 4,
    "messages": [ { "role": "user", "text": "...", "time": "..." }, { "role": "agent", "text": "...", "time": "..." } ] } }
```

Open **Received data** in the top menu to view or download it. The agent must be public (no auth) and your domain listed in the agent's allowed hosts.

## Getting the transcript after a call

The ElevenLabs widget does not pass messages to the page, only the conversation id. After a call, the page calls `GET /api/transcript?id=<conversation_id>`, which fetches the full transcript from the ElevenLabs API, saves it to Blob and fills in **Received data**.

Required env vars: `ELEVENLABS_API_KEY` (ElevenLabs → Developers → API keys, needs ConvAI read access) and `ELEVENLABS_AGENT_ID`.

## Storing conversations as JSON (server)

After every voice call ElevenLabs sends the full transcript to `/api/elevenlabs-webhook`. It is saved to Vercel Blob as `conversations/<conversation_id>.json`:

```json
{
  "conversation_id": "conv_...",
  "agent_id": "agent_...",
  "received_at": "2026-10-01T12:00:00Z",
  "status": "done",
  "duration_secs": 74,
  "summary": "User wants a lightweight pet product...",
  "data_collection": { "budget": { "value": 1500 } },
  "messages": [
    { "role": "agent", "text": "Hi, what would you like to sell?", "time_in_call_secs": 0 },
    { "role": "user", "text": "Something for pets under £30", "time_in_call_secs": 4 }
  ],
  "raw": { }
}
```

Setup:
1. Vercel → your project → **Storage → Create → Blob** → connect to the project (adds `BLOB_READ_WRITE_TOKEN`).
2. Add env vars `ELEVENLABS_WEBHOOK_SECRET` and `VIEW_KEY`, then redeploy.
3. ElevenLabs → **Settings → Webhooks → Post-call webhook** → `https://<your-domain>/api/elevenlabs-webhook`, type *transcription*. Copy its secret into `ELEVENLABS_WEBHOOK_SECRET`.
4. Optional: in your agent → **Analysis → Data collection**, add fields (budget, price_min, price_max, category…). They arrive in `data_collection` as structured JSON.

View them: `GET /api/conversations` with header `x-veyra-key: <VIEW_KEY>`, or on the site open **Received data → Load from server**.

Note: Blob files are stored with public but unguessable URLs. Use private storage or a database for sensitive data.

## Connect ElevenLabs

1. **Agent → Tools → Add tool → Webhook.** Name `research_products`, method POST, URL `https://<your-app>.vercel.app/api/elevenlabs-webhook`.
2. Add header `x-veyra-key` with your `TOOL_SHARED_SECRET`.
3. Paste the parameters from `elevenlabs-tools.json` → `client_tools[0].parameters`.
4. **Settings → Webhooks → Post-call webhook.** Same URL. Copy the signing secret into `ELEVENLABS_WEBHOOK_SECRET`.
5. Client tools (`submit_research_request`, `open_product`, `show_suppliers`) run in the Veyra web page and need no server — add them as **Client** tools using the same file.

## Test locally

```bash
npm install
cp .env.example .env
vercel dev
curl -X POST http://localhost:3000/api/elevenlabs-webhook \
  -H "content-type: application/json" -H "x-veyra-key: dev-secret" \
  -d '{"transcript":"pet products","price_min":20,"price_max":30}'
```

## TODO

- Replace `research()` mock data with real Amazon / supplier data.
- Persist post-call transcripts.
