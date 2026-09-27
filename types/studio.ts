export type StudioScript = {
  _id: string; name: string; version: string; description: string;
  createdAt?: string; deletedAt?: string | null; downloadUrl?: string;
  fileId?: string; fileName?: string; fileSize?: number; hasDownload?: boolean;
};
export type StudioLicense = {
  _id: string; scriptId: string; scriptName?: string; discordId: string; key: string;
  status: 'pending' | 'active' | 'revoked'; binding: string; createdAt: string;
  expiresAt?: string | null; activatedAt?: string; revokedAt?: string;
  lastValidatedAt?: string;
};
export type StudioData = { scripts: StudioScript[]; licenses: StudioLicense[]; createdScriptId?: string };
export function licenseStatus(license: StudioLicense, now = Date.now()) {
  if (license.status === 'revoked') return 'revoked';
  if (license.expiresAt && new Date(license.expiresAt).getTime() <= now) return 'expired';
  return license.status;
}
