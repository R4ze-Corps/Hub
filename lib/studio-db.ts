import client from '@/lib/mongodb';
import type { StudioScript, StudioLicense } from '@/types/studio';
let ready: Promise<unknown> | undefined;
export async function studioDatabase() {
  await client.connect();
  const db = client.db();
  if (!ready) ready = Promise.all([
    db.collection('hub_licenses').createIndex({ key: 1 }, { unique: true }),
    db.collection('hub_licenses').createIndex({ discordId: 1, createdAt: -1 }),
    db.collection('hub_licenses').createIndex({ scriptId: 1, status: 1 }),
    db.collection('hub_validation_limits').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]).catch(error => { ready = undefined; throw error; });
  await ready;
  return { db, scripts: db.collection<StudioScript>('hub_scripts'), licenses: db.collection<StudioLicense>('hub_licenses') };
}
export function unexpired(now = new Date().toISOString()) {
  return { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] };
}
