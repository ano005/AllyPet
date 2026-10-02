// GET /api/conversations  (header x-veyra-key: VIEW_KEY)
// Returns the latest 50 stored ElevenLabs conversations as JSON.
import { list } from '@vercel/blob';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  const key = req.headers['x-veyra-key'] || req.query.key;
  if (!process.env.VIEW_KEY || key !== process.env.VIEW_KEY) return res.status(401).json({ error: 'unauthorised' });

  const { blobs } = await list({ prefix: 'conversations/', limit: 1000 });
  blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  const items = (await Promise.all(
    blobs.slice(0, 50).map(b => fetch(b.url, { cache: 'no-store' }).then(r => r.json()).catch(() => null))
  )).filter(Boolean);

  res.setHeader('cache-control', 'no-store');
  return res.status(200).json({ count: items.length, conversations: items });
}
