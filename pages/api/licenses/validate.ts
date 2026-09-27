import type { NextApiRequest, NextApiResponse } from 'next';
import { createHash } from 'node:crypto';
import { studioDatabase, unexpired } from '@/lib/studio-db';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ valid: false }); }
  const authorization = req.headers.authorization || '';
  const key = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const { scriptId, binding } = req.body || {};
  if (!/^PROTO-[A-F0-9]{48}$/.test(key) || typeof scriptId !== 'string' || !scriptId || scriptId.length > 120 || (binding !== undefined && (typeof binding !== 'string' || binding.length > 120))) return res.status(400).json({ valid: false, reason: 'invalid_request' });
  try {
    const { db, scripts, licenses } = await studioDatabase();
    const forwarded = req.headers['x-forwarded-for'];
    const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : req.socket.remoteAddress) || 'unknown';
    const bucket = Math.floor(Date.now() / 60000);
    const id = createHash('sha256').update(ip + ':' + bucket).digest('hex');
    const limit = await db.collection<{ _id: string; count: number; expiresAt: Date }>('hub_validation_limits').findOneAndUpdate(
      { _id: id }, { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((bucket + 2) * 60000) } }, { upsert: true, returnDocument: 'after' },
    );
    if (limit && limit.count > 120) { res.setHeader('Retry-After', '60'); return res.status(429).json({ valid: false, reason: 'rate_limited' }); }
    if (!await scripts.findOne({ _id: scriptId, deletedAt: null })) return res.status(200).json({ valid: false, reason: 'invalid_license' });
    const now = new Date().toISOString();
    const license = await licenses.findOneAndUpdate({ key, scriptId, status: 'active', $and: [unexpired(now), { $or: [{ binding: '' }, { binding: { $exists: false } }, ...(typeof binding === 'string' && binding ? [{ binding }] : [])] }] }, { $set: { lastValidatedAt: now } }, { returnDocument: 'after' });
    if (!license) return res.status(200).json({ valid: false, reason: 'invalid_license' });
    return res.status(200).json({ valid: true, scriptId, expiresAt: license.expiresAt || null, checkedAt: now });
  } catch {
    console.error('[license-validation] Falha de consulta.');
    return res.status(503).json({ valid: false, reason: 'service_unavailable' });
  }
}
export const config = { api: { bodyParser: { sizeLimit: '4kb' } } };
