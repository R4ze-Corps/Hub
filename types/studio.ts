export type StudioScript = { _id: string; name: string; version: string; description: string };
export type StudioLicense = { _id: string; scriptId: string; discordId: string; key: string; status: 'pending' | 'active' | 'revoked'; binding: string; createdAt: string };
export type StudioData = { scripts: StudioScript[]; licenses: StudioLicense[] };
