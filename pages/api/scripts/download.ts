import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { GridFSBucket, ObjectId } from 'mongodb';
import { pipeline } from 'node:stream/promises';
import { authOptions, isOwner } from '@/lib/auth';
import { studioDatabase, unexpired } from '@/lib/studio-db';
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).end(); }
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) return res.status(401).json({ error: 'Entre para baixar.' });
  if (typeof req.query.id !== 'string') return res.status(400).end();
  try {
    const { db, scripts, licenses } = await studioDatabase();
    const script = await scripts.findOne({ _id: req.query.id, deletedAt: null });
    if (!script) return res.status(404).json({ error: 'Script indisponível.' });
    if (!isOwner(session.user.id) && !await licenses.findOne({ scriptId: script._id, discordId: session.user.id, status: 'active', ...unexpired() })) return res.status(403).json({ error: 'Você precisa de uma licença ativa para baixar este script.' });
    if (!script.fileId) return res.status(404).json({ error: 'O ZIP ainda não foi publicado.' });
    const bucket = new GridFSBucket(db, { bucketName: 'hub_files' });
    const objectId = new ObjectId(script.fileId);
    if (!await bucket.find({ _id: objectId }).hasNext()) return res.status(404).json({ error: 'Arquivo indisponível.' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'attachment; filename="' + (script.fileName || 'script.zip').replace(/[^a-zA-Z0-9_.-]/g, '_') + '"');
    await pipeline(bucket.openDownloadStream(objectId), res);
  } catch { console.error('[download] Falha ao baixar arquivo.'); if (!res.headersSent) res.status(503).json({ error: 'Download indisponível. Tente novamente.' }); }
}
