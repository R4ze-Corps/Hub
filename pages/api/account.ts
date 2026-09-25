import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if(req.method !== "GET") { res.setHeader("Allow","GET"); return res.status(405).json({error:"Método não permitido."}) }
  const session = await getServerSession(req, res, authOptions);
  if(!session?.user?.id) return res.status(401).json({error:"Faça login para continuar."});
  return res.json({user:session.user});
}
