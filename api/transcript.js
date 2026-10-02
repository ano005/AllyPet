// GET /api/transcript?id=<conversation_id>
// Fetches the full conversation from ElevenLabs, saves it to Vercel Blob as JSON, returns it.
import { put } from '@vercel/blob';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  const id = String(req.query.id || '');
  if (!/^conv_[A-Za-z0-9]+$/.test(id)) return res.status(400).json({ error: 'invalid conversation id' });
  if (!process.env.ELEVENLABS_API_KEY) return res.status(500).json({ error: 'ELEVENLABS_API_KEY not set' });

  const r = await fetch('https://api.elevenlabs.io/v1/convai/conversations/' + id, {
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY }
  });
  if (!r.ok) return res.status(r.status).json({ error: 'ElevenLabs returned ' + r.status });
  const d = await r.json();

  if (process.env.ELEVENLABS_AGENT_ID && d.agent_id !== process.env.ELEVENLABS_AGENT_ID) {
    return res.status(403).json({ error: 'conversation belongs to a different agent' });
  }

  const record = {
    conversation_id: d.conversation_id,
    agent_id: d.agent_id,
    status: d.status,
    started_at: d.metadata?.start_time_unix_secs ? new Date(d.metadata.start_time_unix_secs * 1000).toISOString() : null,
    duration_secs: d.metadata?.call_duration_secs ?? null,
    summary: d.analysis?.transcript_summary || null,
    data_collection: d.analysis?.data_collection_results || null,
    message_count: (d.transcript || []).filter(t => t.message).length,
    messages: (d.transcript || []).filter(t => t.message).map(t => ({
      role: t.role === 'user' ? 'user' : 'agent', text: t.message, time_in_call_secs: t.time_in_call_secs ?? null
    }))
  };

  if (process.env.BLOB_READ_WRITE_TOKEN && d.status === 'done') {
    await put('conversations/' + id + '.json', JSON.stringify({ ...record, received_at: new Date().toISOString() }, null, 2), {
      access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true
    });
  }
  res.setHeader('cache-control', 'no-store');
  return res.status(200).json(record);
}
