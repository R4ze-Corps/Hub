import Link from "next/link";
import Head from "next/head";
import {useState} from "react";
import {getServerSession} from "next-auth/next";
import {signOut} from "next-auth/react";
import type {GetServerSideProps} from "next";
import {authOptions} from "@/lib/auth";
import styles from "@/styles/auth.module.css";
type AccountProps={user:{id:string;name:string;role:"owner"|"client"}};
export const getServerSideProps:GetServerSideProps<AccountProps>=async({req,res})=>{
 res.setHeader("Cache-Control","no-store");
 const session=await getServerSession(req,res,authOptions);
 if(!session?.user?.id)return {redirect:{destination:"/login",permanent:false}};
 return {props:{user:{id:session.user.id,name:session.user.name||"Cliente",role:session.user.role}}};
};
export default function Account({user}:AccountProps){
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 async function logout(){setBusy(true);try{await signOut({callbackUrl:"/login"})}catch{setError("Não foi possível sair. Tente novamente.");setBusy(false)}}
 return <main className={styles.desktop}><Head><title>Minha conta · Protocolo</title></Head><section className={styles.window}>
 <div className={styles.titlebar}><span className={styles.traffic} aria-hidden="true"><i/><i/><i/></span><span>Protocolo · Minha conta</span></div>
 <div className={styles.body}><div className={styles.avatar}>{user.name.slice(0,2).toUpperCase()}</div><p className={styles.eyebrow}>DISCORD CONECTADO</p><h1>Olá, {user.name}.</h1><p className={styles.description}>Sua conta está conectada com segurança.</p><dl className={styles.details}><div><dt>ID do Discord</dt><dd>{user.id}</dd></div><div><dt>Perfil</dt><dd>{user.role==="owner"?"Proprietário":"Cliente"}</dd></div></dl><p className={styles.notice}>Acesse o painel para acompanhar seus scripts e licenças.</p>{error&&<p className={styles.error} role="alert">{error}</p>}<Link href="/" className={styles.primary}>Abrir painel →</Link><button className={styles.secondary} disabled={busy} onClick={logout}>{busy?"Saindo…":"Sair da conta"}</button></div>
 <footer className={styles.footer}>Protocolo <span>License Studio</span></footer></section></main>;
}
