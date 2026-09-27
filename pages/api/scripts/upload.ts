import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { GridFSBucket, ObjectId } from 'mongodb';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { authOptions, isOwner } from '@/lib/auth';
import { studioDatabase } from '@/lib/studio-db';
const MAX = 3 * 1024 * 1024;
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).end(); }
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) return res.status(401).json({ error: 'Entre novamente.' });
  if (!isOwner(session.user.id)) return res.status(403).json({ error: 'Operação exclusiva do proprietário.' });
  if (!process.env.NEXTAUTH_URL || req.headers.origin !== new URL(process.env.NEXTAUTH_URL).origin) return res.status(403).json({ error: 'Origem inválida.' });
  if (req.headers['content-type'] !== 'application/zip') return res.status(400).json({ error: 'Envie um arquivo ZIP.' });
  if (Number(req.headers['content-length']) > MAX) return res.status(413).json({ error: 'O limite por ZIP é 3 MB.' });
  const id = req.query.id;
  if (typeof id !== 'string' || id.length > 120) return res.status(400).json({ error: 'Script inválido.' });
  try {
    const { db, scripts } = await studioDatabase();
    const script = await scripts.findOne({ _id: id, deletedAt: null });
    if (!script) return res.status(404).json({ error: 'Script não encontrado.' });
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of req) { const buffer = Buffer.from(chunk); size += buffer.length; if (size > MAX) return res.status(413).json({ error: 'O limite por ZIP é 3 MB.' }); chunks.push(buffer); }
    const buffer = Buffer.concat(chunks);
    if (size < 4 || ![0x04034b50, 0x06054b50].includes(buffer.readUInt32LE(0))) return res.status(400).json({ error: 'O arquivo não contém um ZIP válido.' });
    const bucket = new GridFSBucket(db, { bucketName: 'hub_files' });
    const fileName = (script.name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'script') + '.zip';
    const upload = bucket.openUploadStream(fileName, { metadata: { scriptId: id } });
    await pipeline(Readable.from(buffer), upload);
    const result = await scripts.updateOne({ _id: id, deletedAt: null, fileId: script.fileId || { $exists: false } }, { $set: { fileId: upload.id.toHexString(), fileName, fileSize: size } });
    if (!result.modifiedCount) { await bucket.delete(upload.id); return res.status(409).json({ error: 'O script foi alterado. Atualize e tente novamente.' }); }
    if (script.fileId) { try { await bucket.delete(new ObjectId(script.fileId)); } catch { console.warn('[upload] Arquivo anterior pendente de limpeza.'); } }
    return res.status(200).json({ ok: true });
  } catch { console.error('[upload] Falha no armazenamento.'); return res.status(503).json({ error: 'Não foi possível salvar o ZIP. Tente novamente.' }); }
}
export const config = { api: { bodyParser: false } };
