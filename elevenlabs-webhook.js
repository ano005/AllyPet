// POST /api/elevenlabs-webhook
// 1. Server tool call  -> body = tool parameters JSON, reply with JSON the agent reads back.
// 2. Post-call webhook -> body.type === "post_call_transcription", HMAC-verified.
import crypto from 'node:crypto';
import { put } from '@vercel/blob';

export const config = { api: { bodyParser: false } }; // need raw body for signature check

const FIELDS = {
  transcript: 'string', budget: 'number', price_min: 'number', price_max: 'number', min_profit: 'number',
  category: 'string', lightweight: 'boolean', competition: 'string', experience: 'string', priority: 'string'
};

async function readRaw(req) {
  if (typeof req.body === 'string') return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === 'string' ? Buffer.from(c) : c);
  return Buffer.concat(chunks).toString('utf8');
}

export function normalise(body) {
  const input = {}, errors = [];
  for (const [k, t] of Object.entries(FIELDS)) {
    let v = body[k];
    if (v === undefined || v === null || v === '') { input[k] = null; continue; }
    if (t === 'number') v = Number(v);
    if (t === 'boolean' && typeof v === 'string') v = v === 'true';
    if (typeof v !== t || (t === 'number' && Number.isNaN(v))) errors.push(k + ' must be a ' + t);
    else input[k] = v;
  }
  if (!input.transcript) errors.push('transcript is required');
  return { input, errors };
}

export function verifySignature(raw, header, secret) {
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(',').map(p => p.trim().split('=')));
  if (!parts.t || !parts.v0) return false;
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 1800) return false;
  const expected = crypto.createHmac('sha256', secret).update(parts.t + '.' + raw).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(parts.v0);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function safeEqual(a = '', b = '') {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// TODO: replace with real research (Amazon SP-API / data provider + supplier search).
async function research(input) {
  const catalogue = [
    { name: 'Portable Dog Water Bottle', price: 24.99, est_profit: 10.99, demand: 'strong', competition: 'moderate' },
    { name: 'Collapsible Silicone Pet Bowl Set', price: 21.99, est_profit: 8.40, demand: 'strong', competition: 'lower' },
    { name: 'Cat Grooming Glove', price: 22.99, est_profit: 9.89, demand: 'steady', competition: 'lower' }
  ];
  return catalogue.filter(p =>
    (input.price_min == null || p.price >= input.price_min) &&
    (input.price_max == null || p.price <= input.price_max) &&
    (input.min_profit == null || p.est_profit >= input.min_profit));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const raw = await readRaw(req);
  let body;
  try { body = JSON.parse(raw || '{}'); } catch { return res.status(400).json({ error: 'invalid JSON' }); }

  if (body.type === 'post_call_transcription') {
    const ok = verifySignature(raw, req.headers['elevenlabs-signature'], process.env.ELEVENLABS_WEBHOOK_SECRET);
    if (!ok) return res.status(401).json({ error: 'bad signature' });
    const d = body.data || {};
    const id = d.conversation_id || 'unknown-' + Date.now();
    const record = {
      conversation_id: id,
      agent_id: d.agent_id || null,
      received_at: new Date().toISOString(),
      status: d.status || null,
      duration_secs: d.metadata?.call_duration_secs ?? null,
      summary: d.analysis?.transcript_summary || null,
      data_collection: d.analysis?.data_collection_results || null,
      messages: (d.transcript || []).map(t => ({ role: t.role === 'user' ? 'user' : 'agent', text: t.message, time_in_call_secs: t.time_in_call_secs ?? null })),
      raw: d
    };
    await put('conversations/' + id + '.json', JSON.stringify(record, null, 2), {
      access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true
    });
    return res.status(200).json({ received: true, stored: 'conversations/' + id + '.json' });
  }

  if (!process.env.TOOL_SHARED_SECRET || !safeEqual(req.headers['x-veyra-key'], process.env.TOOL_SHARED_SECRET)) {
    return res.status(401).json({ error: 'unauthorised' });
  }

  const { input, errors } = normalise(body);
  if (errors.length) return res.status(400).json({ ok: false, errors });

  const products = await research(input);
  return res.status(200).json({
    ok: true,
    input,
    products,
    say: products.length
      ? 'I found ' + products.length + ' products worth a look. The top one is ' + products[0].name + '.'
      : 'Nothing matched yet. Want me to widen the price range?'
  });
}
