import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions, isOwner } from '@/lib/auth';
import { finishBlobUpload } from '@/lib/blob-storage';
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).end(); }
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) return res.status(401).end();
  if (!isOwner(session.user.id) || !process.env.NEXTAUTH_URL || req.headers.origin !== new URL(process.env.NEXTAUTH_URL).origin) return res.status(403).end();
  const { scriptId, pathname } = req.body || {};
  if (typeof scriptId !== 'string' || typeof pathname !== 'string' || pathname.length > 250) return res.status(400).json({ error: 'Upload inválido.' });
  try { await finishBlobUpload(scriptId, pathname); return res.status(200).json({ ok: true }); }
  catch { return res.status(409).json({ error: 'Não foi possível confirmar o ZIP. Confira se o Blob é privado e tente novamente.' }); }
}
export const config = { api: { bodyParser: { sizeLimit: '4kb' } } };
