import { ArrowUpRight } from 'lucide-react';
import Head from "next/head";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { getServerSession } from "next-auth/next";
import type { GetServerSideProps } from "next";
import { authOptions } from "@/lib/auth";
import styles from "@/styles/auth.module.css";

const messages: Record<string,string> = {
  AccessDenied: "Não foi possível concluir o acesso. Se você autorizou no Discord, verifique a conexão com o banco.",
  OAuthSignin: "Não foi possível abrir o Discord. Tente novamente.",
  OAuthCallback: "O login não foi concluído. Tente novamente e confira a URL de retorno cadastrada no Discord.",
  OAuthAccountNotLinked: "Não foi possível vincular esta conta.",
  Configuration: "A configuração do login está incompleta.",
  SessionRequired: "Entre na sua conta para continuar.",
};
export const getServerSideProps: GetServerSideProps = async ({req,res,query}) => {
  res.setHeader("Cache-Control","no-store");
  const session=await getServerSession(req,res,authOptions);
  if(session?.user?.id) return {redirect:{destination:"/",permanent:false}};
  const error=typeof query.error==="string" ? messages[query.error] || "O login não foi concluído. Tente novamente." : null;
  return {props:{error}};
};
export default function Login({error}:{error:string|null}){
  const [busy,setBusy]=useState(false),[failure,setFailure]=useState<string|null>(null);
  async function login(){setBusy(true);setFailure(null);try{await signIn("discord",{callbackUrl:"/"})}catch{setFailure("Não foi possível abrir o login. Tente novamente.");setBusy(false)}}
  return <main className={styles.desktop}><Head><title>Entrar · Protocolo</title><meta name="description" content="Entre com Discord para acessar sua conta Protocolo."/></Head>
    <section className={styles.window}><div className={styles.titlebar}><span>PROTOCOLO / ACCESS CONTROL</span></div><div className={styles.body}>
      <div className={styles.logo} aria-hidden="true">P</div><p className={styles.eyebrow}>AUTENTICAÇÃO DISCORD</p><h1>ENTRE EM OPERAÇÃO.</h1><p className={styles.description}>Entre com sua conta do Discord para acessar suas licenças.</p>
      {(error||failure)&&<p className={styles.error} role="alert">{failure||error}</p>}
      <button className={styles.primary} onClick={login} disabled={busy}>{busy?"Abrindo Discord…":"Entrar com Discord"}<ArrowUpRight size={18} strokeWidth={1.5} aria-hidden="true"/></button>
      <p className={styles.note}>Usamos seu perfil do Discord para identificar sua conta.</p>
    </div><footer className={styles.footer}>Protocolo <span>License Studio</span></footer></section>
  </main>;
}
