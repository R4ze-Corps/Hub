import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { authOptions, isOwner } from '@/lib/auth';
import { studioDatabase } from '@/lib/studio-db';
import { finishBlobUpload, MAX_SCRIPT_BYTES } from '@/lib/blob-storage';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).end(); }
  if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(503).json({ error: 'Conecte o Blob privado ao projeto e configure BLOB_READ_WRITE_TOKEN.' });
  try {
    const result = await handleUpload({
      request: req, body: req.body as HandleUploadBody,
      onBeforeGenerateToken: async (pathname, payload) => {
        const session = await getServerSession(req, res, authOptions);
        if (!session?.user?.id || !isOwner(session.user.id)) throw new Error('Operação exclusiva do proprietário.');
        if (!process.env.NEXTAUTH_URL || req.headers.origin !== new URL(process.env.NEXTAUTH_URL).origin) throw new Error('Origem inválida.');
        const input = JSON.parse(payload || '{}');
        if (typeof input.scriptId !== 'string' || !/^[a-f0-9-]{36}$/.test(input.scriptId) || typeof input.fileName !== 'string' || !input.fileName.toLowerCase().endsWith('.zip')) throw new Error('Script ou arquivo inválido.');
        if (!pathname.startsWith(`scripts/${input.scriptId}/`) || !/^scripts\/[a-f0-9-]{36}\/[a-f0-9-]{36}\/package\.zip$/.test(pathname)) throw new Error('Caminho de upload inválido.');
        const { scripts } = await studioDatabase();
        const fileName = input.fileName.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(-160);
        const result = await scripts.updateOne({ _id: input.scriptId, deletedAt: null }, { $set: { pendingBlobPath: pathname, pendingBlobName: fileName } });
        if (!result.matchedCount) throw new Error('Script não encontrado.');
        return { allowedContentTypes: ['application/zip'], maximumSizeInBytes: MAX_SCRIPT_BYTES, addRandomSuffix: false, allowOverwrite: false, validUntil: Date.now() + 60 * 60 * 1000, tokenPayload: JSON.stringify({ scriptId: input.scriptId, pathname }) };
      },
      // O SDK verifica a assinatura do callback antes de executá-lo.
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const input = JSON.parse(tokenPayload || '{}');
        if (blob.pathname !== input.pathname || typeof input.scriptId !== 'string') throw new Error('Callback inválido.');
        await finishBlobUpload(input.scriptId, input.pathname);
      },
    });
    return res.status(200).json(result);
  } catch { return res.status(400).json({ error: 'Não foi possível autorizar ou concluir o upload. Verifique o Blob privado e tente novamente.' }); }
}
export const config = { api: { bodyParser: { sizeLimit: '16kb' } } };
