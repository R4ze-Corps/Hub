import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { randomBytes, randomUUID } from 'node:crypto';
import { authOptions, isOwner } from '@/lib/auth';
import { studioDatabase, unexpired } from '@/lib/studio-db';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (!['GET', 'POST'].includes(req.method || '')) { res.setHeader('Allow', 'GET, POST'); return res.status(405).end(); }
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) return res.status(401).json({ error: 'Entre para acessar o painel.' });
  const owner = isOwner(session.user.id);
  if (req.method === 'POST') {
    const origin = process.env.NEXTAUTH_URL;
    if (!origin || req.headers.origin !== new URL(origin).origin || !req.headers['content-type']?.startsWith('application/json')) return res.status(403).json({ error: 'Origem da solicitação inválida.' });
    if (!req.body || typeof req.body !== 'object') return res.status(400).json({ error: 'Solicitação inválida.' });
    if (!['script', 'deleteScript', 'issue', 'activate', 'revoke'].includes(req.body.action)) return res.status(400).json({ error: 'Operação inválida.' });
    if (!owner && req.body.action !== 'activate') return res.status(403).json({ error: 'Operação exclusiva do proprietário.' });
  }
  try {
    const { scripts, licenses } = await studioDatabase();
    let createdScriptId: string | undefined;
    if (req.method === 'POST') {
      const body = req.body;
      const field = (key: string, max = 120) => typeof body[key] === 'string' ? body[key].trim().slice(0, max) : '';
      const now = new Date().toISOString();
      if (body.action === 'script') {
        const name = field('name'), downloadUrl = field('downloadUrl', 2000);
        if (!name) return res.status(400).json({ error: 'Informe o nome do script.' });
        if (downloadUrl) {
          try { const url = new URL(downloadUrl); if (url.protocol !== 'https:' || url.username || url.password) throw new Error(); }
          catch { return res.status(400).json({ error: 'O download deve usar uma URL HTTPS válida.' }); }
        }
        createdScriptId = randomUUID();
        await scripts.insertOne({ _id: createdScriptId, name, version: field('version', 30) || '1.0.0', description: field('description', 1000), downloadUrl, createdAt: now, deletedAt: null });
      } else if (body.action === 'deleteScript') {
        const id = field('id');
        const result = await scripts.updateOne({ _id: id, deletedAt: null }, { $set: { deletedAt: now, downloadUrl: '' } });
        if (!result.modifiedCount) return res.status(404).json({ error: 'Script não encontrado.' });
        // A exclusão bloqueia validação/download imediatamente; preserva o histórico das licenças.
        await licenses.updateMany({ scriptId: id, status: { $ne: 'revoked' } }, { $set: { status: 'revoked', revokedAt: now } });
      } else if (body.action === 'issue') {
        const discordId = field('discordId', 20), scriptId = field('scriptId');
        const script = await scripts.findOne({ _id: scriptId, deletedAt: null });
        if (!/^[0-9]{17,20}$/.test(discordId) || !script) return res.status(400).json({ error: 'Selecione um script e informe um ID válido do Discord.' });
        let expiresAt: string | null = null;
        if (body.expiresAt) {
          const expiry = typeof body.expiresAt === 'string' ? new Date(body.expiresAt) : new Date(NaN);
          if (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= Date.now()) return res.status(400).json({ error: 'A expiração deve ser uma data futura.' });
          expiresAt = expiry.toISOString();
        }
        await licenses.insertOne({ _id: randomUUID(), scriptId, scriptName: script.name, discordId, key: 'PROTO-' + randomBytes(24).toString('hex').toUpperCase(), status: 'pending', binding: '', createdAt: now, expiresAt });
      } else if (body.action === 'activate') {
        const binding = field('binding');
        if (!binding) return res.status(400).json({ error: 'Informe a identificação do servidor.' });
        const filter = { _id: field('id'), ...(owner ? {} : { discordId: session.user.id }), status: 'pending' as const, ...unexpired(now) };
        const license = await licenses.findOne(filter);
        if (!license || !await scripts.findOne({ _id: license.scriptId, deletedAt: null })) return res.status(409).json({ error: 'Licença expirada, removida ou indisponível.' });
        const result = await licenses.updateOne(filter, { $set: { status: 'active', binding, activatedAt: now } });
        if (!result.modifiedCount) return res.status(409).json({ error: 'A licença já foi alterada. Atualize o painel.' });
      } else {
        const result = await licenses.updateOne({ _id: field('id'), status: { $ne: 'revoked' } }, { $set: { status: 'revoked', revokedAt: now } });
        if (!result.modifiedCount) return res.status(409).json({ error: 'Licença já revogada ou não encontrada.' });
      }
    }
    const visibleLicenses = await licenses.find(owner ? {} : { discordId: session.user.id }).sort({ createdAt: -1 }).toArray();
    const visibleScripts = await scripts.find({ deletedAt: null, ...(owner ? {} : { _id: { $in: visibleLicenses.map(l => l.scriptId) } }) }).toArray();
    // Clientes recebem downloads apenas pela rota autenticada, após verificação da licença.
    const publicScripts = visibleScripts.map(({ downloadUrl, fileId, ...script }) => ({ ...script, hasDownload: !!(downloadUrl || fileId) }));
    return res.status(200).json({ scripts: publicScripts, licenses: visibleLicenses, ...(createdScriptId ? { createdScriptId } : {}) });
  } catch {
    console.error('[studio] Falha ao acessar o banco de licenças.');
    return res.status(503).json({ error: 'Não foi possível concluir a operação. Atualize o painel antes de tentar novamente.' });
  }
}
export const config = { api: { bodyParser: { sizeLimit: '16kb' } } };
