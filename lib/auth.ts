import type { NextAuthOptions } from "next-auth";
import DiscordProvider from "next-auth/providers/discord";
import client from "@/lib/mongodb";

type AccountProfile = {
  _id: string;
  name: string;
  image: string | null;
  createdAt: Date;
  lastLoginAt: Date;
};

export function isOwner(discordId: string): boolean {
  const owner = process.env.OWNER_DISCORD_ID?.trim();
  return !!owner && /^[0-9]{17,20}$/.test(owner) && owner === discordId;
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  pages: { signIn: "/login", error: "/login" },
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID || "",
      clientSecret: process.env.DISCORD_CLIENT_SECRET || "",
      authorization: { params: { scope: "identify" } },
      checks: ["state"],
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if(account?.provider !== "discord" || !/^[0-9]{17,20}$/.test(account.providerAccountId) || user.id !== account.providerAccountId) return false;
      try {
        await client.connect();
        await client.db().collection<AccountProfile>("discord_users").updateOne(
          { _id: account.providerAccountId },
          {
            $set: { name: user.name || "Cliente", image: user.image || null, lastLoginAt: new Date() },
            $setOnInsert: { createdAt: new Date() },
          },
          { upsert: true },
        );
        return true;
      } catch {
        console.error("[auth] Não foi possível salvar o perfil no MongoDB.");
        return false;
      }
    },
    async jwt({ token, account }) {
      if(account?.provider === "discord") token.discordId = account.providerAccountId;
      return token;
    },
    async session({ session, token }) {
      if(session.user && typeof token.discordId === "string") {
        session.user.id = token.discordId;
        // Reavaliado no servidor; nenhum papel é aceito do navegador.
        session.user.role = isOwner(token.discordId) ? "owner" : "client";
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      try {
        const next = new URL(url, baseUrl);
        if(next.origin === new URL(baseUrl).origin) return next.href;
      } catch {}
      return new URL("/", baseUrl).href;
    },
  },
  logger: {
    // Nunca registrar respostas OAuth, tokens ou strings de conexão.
    error(code) { console.error("[auth]", code); },
    warn(code) { console.warn("[auth]", code); },
    debug() {},
  },
};
