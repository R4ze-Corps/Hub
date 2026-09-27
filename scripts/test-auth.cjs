const assert=require("node:assert/strict");
const base=process.env.TEST_BASE_URL || "http://localhost:3000";
const jar=new Map();
async function request(route,options={}){
 const res=await fetch(base+route,{...options,headers:{cookie:[...jar].map(([k,v])=>k+"="+v).join("; "),...options.headers},redirect:"manual"});
 for(const cookie of res.headers.getSetCookie()){const pair=cookie.split(";")[0];const i=pair.indexOf("=");jar.set(pair.slice(0,i),pair.slice(i+1));}
 return res;
}
(async()=>{
 let r=await request("/");assert(r.status===307&&r.headers.get("location")==="/login","Dashboard must require sign-in."); r=await request("/api/studio");assert(r.status===401,"Studio API must require sign-in."); r=await request("/login");assert(r.status===200,"Login page must render.");
 r=await request("/api/account");assert(r.status===401,"Anonymous API access must be rejected.");
 r=await request("/conta");assert(r.status===307&&r.headers.get("location")==="/","Legacy account page must redirect home.");
 r=await request("/api/auth/session");assert(Object.keys(await r.json()).length===0,"Anonymous session must be empty.");
 r=await request("/api/auth/signin/discord",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({json:"true",callbackUrl:base+"/"})});let data=await r.json();assert(new URL(data.url).origin===base,"Missing CSRF must not begin OAuth.");
 r=await request("/api/auth/csrf");const {csrfToken}=await r.json();
 r=await request("/api/auth/signin/discord",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({csrfToken,callbackUrl:base+"/",json:"true"})});data=await r.json();
 const target=new URL(data.url);assert(target.hostname==="discord.com","OAuth target must be Discord.");assert(target.searchParams.get("scope")==="identify","Only identify scope is requested.");assert(target.searchParams.get("redirect_uri")===base+"/api/auth/callback/discord","Callback URL must match configuration.");assert(!!target.searchParams.get("state"),"OAuth state must be present.");assert([...jar.keys()].some(k=>k.endsWith(".state")),"State cookie must be set.");
 r=await request("/api/auth/callback/discord?code=invalid-test-code&state=invalid-test-state");assert([302,307].includes(r.status),"Invalid callback must redirect to error.");assert(![...jar].some(([k,v])=>k.endsWith("session-token")&&v),"Invalid callback must not establish a session.");
 r=await request("/api/account");assert(r.status===401,"Invalid callback must not grant account access.");
 jar.set("next-auth.session-token","tampered");r=await request("/api/account");assert(r.status===401,"Tampered session must be rejected.");
 console.log("PASS: login page, protected account/API, CSRF, Discord redirect, callback URL, minimal scope, OAuth state, invalid callback and tampered session.");
})().catch(()=>{console.error("Falha nos testes de autenticação. Nenhum cookie ou token foi exibido.");process.exitCode=1});
