// GET /api/recent  (header x-veyra-key: VIEW_KEY)
// Pulls the latest conversations for your agent straight from ElevenLabs, with full transcripts.
// Works without the webhook or Blob storage.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  const key = req.headers['x-veyra-key'] || req.query.key;
  if (!process.env.VIEW_KEY || key !== process.env.VIEW_KEY) return res.status(401).json({ error: 'unauthorised' });
  if (!process.env.ELEVENLABS_API_KEY) return res.status(500).json({ error: 'ELEVENLABS_API_KEY not set' });
  if (!process.env.ELEVENLABS_AGENT_ID) return res.status(500).json({ error: 'ELEVENLABS_AGENT_ID not set' });

  const H = { 'xi-api-key': process.env.ELEVENLABS_API_KEY };
  const n = Math.min(Number(req.query.limit) || 20, 50);
  const lr = await fetch('https://api.elevenlabs.io/v1/convai/conversations?agent_id=' + encodeURIComponent(process.env.ELEVENLABS_AGENT_ID) + '&page_size=' + n, { headers: H });
  if (!lr.ok) return res.status(lr.status).json({ error: 'ElevenLabs returned ' + lr.status });
  const list = (await lr.json()).conversations || [];

  const conversations = (await Promise.all(list.map(async c => {
    const r = await fetch('https://api.elevenlabs.io/v1/convai/conversations/' + c.conversation_id, { headers: H });
    if (!r.ok) return null;
    const d = await r.json();
    const msgs = (d.transcript || []).filter(t => t.message);
    return {
      conversation_id: d.conversation_id,
      agent_id: d.agent_id,
      status: d.status,
      started_at: d.metadata?.start_time_unix_secs ? new Date(d.metadata.start_time_unix_secs * 1000).toISOString() : null,
      duration_secs: d.metadata?.call_duration_secs ?? null,
      summary: d.analysis?.transcript_summary || null,
      data_collection: d.analysis?.data_collection_results || null,
      message_count: msgs.length,
      messages: msgs.map(t => ({ role: t.role === 'user' ? 'user' : 'agent', text: t.message, time_in_call_secs: t.time_in_call_secs ?? null }))
    };
  }))).filter(Boolean);

  res.setHeader('cache-control', 'no-store');
  return res.status(200).json({ count: conversations.length, conversations });
}
