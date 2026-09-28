import { del, get, head } from '@vercel/blob';
import { GridFSBucket, ObjectId } from 'mongodb';
import { studioDatabase } from '@/lib/studio-db';
export const MAX_SCRIPT_BYTES = 100 * 1024 * 1024;

export async function finishBlobUpload(scriptId: string, pathname: string) {
  const { db, scripts } = await studioDatabase();
  const script = await scripts.findOne({ _id: scriptId, deletedAt: null });
  if (!script) throw new Error('Script indisponível.');
  if (script.blobPath === pathname) return;
  if (script.pendingBlobPath !== pathname) throw new Error('Upload substituído ou não autorizado.');
  const metadata = await head(pathname);
  const url = new URL(metadata.url);
  if (!/^[a-z0-9-]+\.private\.blob\.vercel-storage\.com$/i.test(url.hostname) || metadata.pathname !== pathname) throw new Error('Configure um armazenamento Blob privado.');
  if (metadata.size < 4 || metadata.size > MAX_SCRIPT_BYTES) throw new Error('O limite por ZIP é 100 MB.');
  const result = await get(pathname, { access: 'private', useCache: false });
  if (!result || result.statusCode !== 200) throw new Error('Arquivo indisponível no Blob.');
  const reader = result.stream.getReader();
  const signature = Buffer.alloc(4); let offset = 0;
  try {
    while (offset < 4) { const part = await reader.read(); if (part.done) break; const count = Math.min(4 - offset, part.value.length); signature.set(part.value.subarray(0, count), offset); offset += count; }
  } finally { await reader.cancel(); }
  if (offset !== 4 || ![0x04034b50, 0x06054b50].includes(signature.readUInt32LE(0))) throw new Error('O arquivo não contém um ZIP válido.');
  const updated = await scripts.updateOne({ _id: scriptId, deletedAt: null, pendingBlobPath: pathname }, {
    $set: { blobPath: pathname, fileName: script.pendingBlobName || 'script.zip', fileSize: metadata.size },
    $unset: { fileId: '', pendingBlobPath: '', pendingBlobName: '' },
  });
  if (!updated.modifiedCount) {
    if ((await scripts.findOne({ _id: scriptId, deletedAt: null }))?.blobPath === pathname) return;
    throw new Error('O script foi alterado durante o upload. Atualize o painel.');
  }
  // Falhas de limpeza não desfazem o arquivo já publicado.
  try {
    if (script.blobPath && script.blobPath !== pathname) await del(script.blobPath);
    if (script.fileId) await new GridFSBucket(db, { bucketName: 'hub_files' }).delete(new ObjectId(script.fileId));
  } catch { console.warn('[blob] Arquivo anterior pendente de limpeza.'); }
}
