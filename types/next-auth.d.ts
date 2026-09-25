import type { DefaultSession } from "next-auth";
declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & { id: string; role: "owner" | "client" };
  }
}
declare module "next-auth/jwt" {
  interface JWT { discordId?: string }
}
