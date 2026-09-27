import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { randomBytes, randomUUID } from 'node:crypto';
import { authOptions, isOwner } from '@/lib/auth';
import client from '@/lib/mongodb';
import type { StudioScript, StudioLicense } from '@/types/studio';

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
    if (!['script', 'issue', 'activate', 'revoke'].includes(req.body.action)) return res.status(400).json({ error: 'Operação inválida.' });
    if (!owner && req.body.action !== 'activate') return res.status(403).json({ error: 'Operação exclusiva do proprietário.' });
  }
  try {
    await client.connect();
    const db = client.db();
    const scripts = db.collection<StudioScript>('hub_scripts');
    const licenses = db.collection<StudioLicense>('hub_licenses');
    if (req.method === 'POST') {
      const body = req.body;
      const field = (key: string, max = 120) => typeof body[key] === 'string' ? body[key].trim().slice(0, max) : '';
      if (body.action === 'script') {
        const name = field('name');
        if (!name) return res.status(400).json({ error: 'Informe o nome do script.' });
        await scripts.insertOne({ _id: randomUUID(), name, version: field('version', 30) || '1.0.0', description: field('description', 500) });
      } else if (body.action === 'issue') {
        const discordId = field('discordId', 20), scriptId = field('scriptId');
        if (!/^[0-9]{17,20}$/.test(discordId) || !await scripts.findOne({ _id: scriptId })) return res.status(400).json({ error: 'Selecione um script e informe um ID válido do Discord.' });
        await licenses.insertOne({ _id: randomUUID(), scriptId, discordId, key: 'PROTO-' + randomBytes(24).toString('hex').toUpperCase(), status: 'pending', binding: '', createdAt: new Date().toISOString() });
      } else {
        const filter = { _id: field('id'), ...(owner ? {} : { discordId: session.user.id }), status: body.action === 'activate' ? 'pending' as const : { $ne: 'revoked' as const } };
        const binding = field('binding');
        if (body.action === 'activate' && !binding) return res.status(400).json({ error: 'Informe o servidor para liberar a licença.' });
        const result = await licenses.updateOne(filter, { $set: body.action === 'activate' ? { status: 'active', binding } : { status: 'revoked' } });
        if (!result.modifiedCount) return res.status(409).json({ error: 'Licença indisponível para esta operação. Atualize o painel.' });
      }
    }
    const visibleLicenses = await licenses.find(owner ? {} : { discordId: session.user.id }).sort({ createdAt: -1 }).toArray();
    const visibleScripts = await scripts.find(owner ? {} : { _id: { $in: visibleLicenses.map(l => l.scriptId) } }).toArray();
    return res.status(200).json({ scripts: visibleScripts, licenses: visibleLicenses });
  } catch {
    console.error('[studio] Falha ao acessar o banco de licenças.');
    return res.status(503).json({ error: 'Não foi possível carregar ou salvar os dados. Tente novamente.' });
  }
}
