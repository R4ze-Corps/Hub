// Integration checks use a fresh, randomly named database and a local server.
// Production data is never read or changed; only generated test collections are cleaned.
const assert = require('node:assert/strict');
const {randomBytes} = require('node:crypto');
const {spawn} = require('node:child_process');
const fs = require('node:fs');
const {MongoClient} = require('mongodb');
const {encode} = require('next-auth/jwt');
require('@next/env').loadEnvConfig(process.cwd());
const testName = 'protocolo_test_' + randomBytes(10).toString('hex');
const ownerId='111111111111111111', clientId='222222222222222222', strangerId='333333333333333333';
const base='http://127.0.0.1:3087';
const secret=randomBytes(32).toString('hex');
const zip=Buffer.alloc(22);zip.writeUInt32LE(0x06054b50);
let server, mongo, browser;
async function run() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required for isolated integration tests.');
  const url=new URL(process.env.MONGODB_URI);
  // Preserve the original authentication database while selecting an isolated data database.
  if(!url.searchParams.has('authSource')) url.searchParams.set('authSource',url.protocol==='mongodb+srv:'?'admin':url.pathname.slice(1)||'admin');
  url.pathname='/'+testName;
  const uri=url.toString();
  mongo=new MongoClient(uri,{serverSelectionTimeoutMS:10000});await mongo.connect();
  const db=mongo.db(testName);
  assert.equal(db.databaseName,testName);
  await db.createCollection('test_marker');
  server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3087'],{env:{...process.env,BLOB_READ_WRITE_TOKEN:'',MONGODB_URI:uri,NEXTAUTH_URL:base,NEXTAUTH_SECRET:secret,OWNER_DISCORD_ID:ownerId},stdio:'ignore',windowsHide:true});
  let ready=false;
  for(let i=0;i<60;i++){try{const r=await fetch(base+'/login');if(r.status===200){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,500));}
  assert(ready,'Test server did not become ready.');
  const tokens={};
  for(const [role,id] of Object.entries({owner:ownerId,client:clientId,stranger:strangerId}))tokens[role]=await encode({secret,token:{discordId:id,name:role==='owner'?'Operador Protocolo':'Cliente de teste'},maxAge:600});
  async function request(path,role,body,extra={}){return fetch(base+path,{redirect:'manual',method:body!==undefined?'POST':'GET',headers:{...(role?{cookie:'next-auth.session-token='+tokens[role]}:{}),...(body!==undefined?{'Content-Type':'application/json',origin:base}:{}),...extra},...(body!==undefined?{body:JSON.stringify(body)}:{})});}
  async function mutate(body,role='owner'){const r=await request('/api/studio',role,body);assert.equal(r.status,200,'Studio mutation failed: '+body.action);return r.json();}
  async function validate(license,overrides={}){const r=await request('/api/licenses/validate',null,{scriptId:license.scriptId,...overrides},{authorization:'Bearer '+license.key});return {status:r.status,...await r.json()};}
  assert.equal((await request('/api/studio')).status,401);
  assert.equal((await request('/api/scripts/download?id=none')).status,401);
  assert.equal((await request('/')).status,307);
  const legacy=await request('/conta','owner');assert.equal(legacy.headers.get('location'),'/');
  const login=await request('/login','owner');assert.equal(login.headers.get('location'),'/');
  assert.equal((await request('/','owner')).status,200);
  for(const action of ['script','issue','revoke','deleteScript']) assert.equal((await request('/api/studio','client',{action})).status,403);
  assert.equal((await request('/api/studio','owner',{action:'script',name:'CSRF'},{origin:'https://foreign.test'})).status,403);
  let data=await mutate({action:'script',name:'Advanced Inventory',version:'2.4.0',description:'Organização e controle do inventário do seu servidor.'});
  const scriptId=data.createdScriptId;
  const upload=(role,body=zip)=>fetch(base+'/api/scripts/upload?id='+scriptId,{method:'POST',headers:{cookie:'next-auth.session-token='+tokens[role],origin:base,'Content-Type':'application/zip'},body});
  assert.equal((await upload('client')).status,403);
  assert.equal((await upload('owner',Buffer.from('invalid'))).status,400);
  assert.equal((await upload('owner',Buffer.alloc(3*1024*1024+1))).status,413);
  assert.equal((await upload('owner')).status,200);
  assert.equal(await db.collection('hub_files.files').countDocuments(),1);
  assert.equal((await upload('owner')).status,200);assert.equal(await db.collection('hub_files.files').countDocuments(),1,'Previous ZIP should be replaced.');
  assert.equal((await request('/api/scripts/download?id='+scriptId,'client')).status,403);
  assert.equal((await request('/api/studio','owner',{action:'issue',scriptId,discordId:clientId,expiresAt:'2000-01-01'})).status,400);
  data=await mutate({action:'issue',scriptId,discordId:clientId,expiresAt:new Date(Date.now()+86400000).toISOString()});
  let license=data.licenses[0]; assert.equal(license.discordId,null,'Issuance must not accept a Discord binding.'); const beforeClaim=await (await request('/api/studio','client')).json(); assert.equal(beforeClaim.licenses.length,0); assert.equal(beforeClaim.scripts.length,0);
  assert.equal((await validate(license)).valid,false,'Pending key must not validate.');
  assert.equal((await request('/api/studio','stranger',{action:'activate',id:license._id,binding:'server-01'})).status,409);
  data=await mutate({action:'redeem',key:license.key,discordId:strangerId},'client');assert.equal(data.licenses[0].discordId,clientId);assert.equal(data.licenses[0].status,'active');
  assert.equal((await validate(license)).valid,true);
  assert.equal((await validate(license,{binding:'ignored-for-new-license'})).valid,true); await db.collection('hub_licenses').updateOne({_id:license._id},{$set:{binding:'legacy-server'}}); assert.equal((await validate(license)).valid,false); assert.equal((await validate(license,{binding:'legacy-server'})).valid,true); await db.collection('hub_licenses').updateOne({_id:license._id},{$set:{binding:''}});
  assert.equal((await validate(license,{scriptId:'other-script'})).valid,false);
  const downloaded=await request('/api/scripts/download?id='+scriptId,'client');assert.equal(downloaded.status,200);assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),zip);
  assert.equal((await request('/api/scripts/download?id='+scriptId,'stranger')).status,403);
  const outsider=await (await request('/api/studio','stranger')).json();assert.equal(outsider.licenses.length,0);assert.equal(outsider.scripts.length,0);
  assert((await db.collection('hub_licenses').findOne({_id:license._id})).lastValidatedAt);
  await db.collection('hub_licenses').updateOne({_id:license._id},{$set:{expiresAt:new Date(Date.now()-1000).toISOString()}});
  assert.equal((await validate(license)).valid,false,'Expired key must not validate.');
  assert.equal((await request('/api/scripts/download?id='+scriptId,'client')).status,403);
  await mutate({action:'revoke',id:license._id});assert.equal((await validate(license)).valid,false);
  assert.equal((await request('/api/studio','client',{action:'activate',id:license._id,binding:'server-01'})).status,409);
  // A transferred key cannot rebind an existing license, even for the owner.
  assert.equal((await request('/api/studio','stranger',{action:'redeem',key:license.key,binding:'server-02'})).status,409);
  let generated=await mutate({action:'issue',scriptId,expiresAt:null});
  const contested=generated.licenses.find(l=>l.status==='pending');
  const claims=await Promise.all(['client','stranger'].map(role=>request('/api/studio',role,{action:'redeem',key:contested.key,binding:'race-'+role,discordId:ownerId})));
  assert.deepEqual(claims.map(r=>r.status).sort(),[200,409],'Exactly one simultaneous claimant must win.');
  const winner=claims[0].status===200?'client':'stranger';
  const claimed=await db.collection('hub_licenses').findOne({_id:contested._id});
  assert.equal(claimed.discordId,winner==='client'?clientId:strangerId);assert.equal(claimed.binding,'');assert(claimed.redeemedAt);
  assert.equal((await request('/api/studio','owner',{action:'redeem',key:contested.key,binding:'hijack'})).status,409);
  generated=await mutate({action:'issue',scriptId,expiresAt:null});
  const expired=generated.licenses.find(l=>l.status==='pending');
  await db.collection('hub_licenses').updateOne({_id:expired._id},{$set:{expiresAt:new Date(Date.now()-1000).toISOString()}});
  assert.equal((await request('/api/studio','client',{action:'redeem',key:expired.key,binding:'server-01'})).status,409);
  await mutate({action:'revoke',id:expired._id});
  generated=await mutate({action:'issue',scriptId,expiresAt:null});
  const legacyLicense=generated.licenses.find(l=>l.status==='pending');
  await db.collection('hub_licenses').updateOne({_id:legacyLicense._id},{$set:{discordId:clientId}});
  assert.equal((await request('/api/studio','stranger',{action:'redeem',key:legacyLicense.key,binding:'server-01'})).status,409);
  await mutate({action:'redeem',key:legacyLicense.key,binding:'server-01'},'client');
  data=await mutate({action:'issue',scriptId,discordId:clientId,expiresAt:null});license=data.licenses.find(l=>l.status==='pending');
  await mutate({action:'redeem',key:license.key,binding:'server-01'},'client');assert.equal((await validate(license)).valid,true,'Lifetime license must validate.');
  await mutate({action:'deleteScript',id:scriptId});assert.equal((await validate(license)).valid,false);
  assert.equal((await request('/api/scripts/download?id='+scriptId,'owner')).status,404);
  assert.equal(await db.collection('hub_licenses').countDocuments({scriptId,status:{$ne:'revoked'}}),0);
  assert.equal((await request('/api/studio','owner',{action:'issue',scriptId,discordId:clientId})).status,400);
  assert((await db.collection('hub_scripts').findOne({_id:scriptId})).deletedAt);
  await db.collection('hub_validation_limits').updateMany({},{$set:{count:121}});
  assert.equal((await validate(license)).status,429);await db.collection('hub_validation_limits').deleteMany({});
  console.log('PASS: real MongoDB persistence, authorization, CSRF, ZIP storage/replacement/download, generation, first-claim binding, concurrent redemption, legacy ownership, expiration, revocation, deletion and validation rate limit.');
  if(process.env.TEST_PLAYWRIGHT_MODULE){
    const {chromium}=require(process.env.TEST_PLAYWRIGHT_MODULE);
    browser=await chromium.launch({channel:'msedge',headless:true});
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    await context.addCookies([{name:'next-auth.session-token',value:tokens.owner,domain:'127.0.0.1',path:'/'}]);
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    for(const [name,version] of [['Advanced Inventory','2.4.0'],['Garage System','1.8.2'],['Phone Pro','3.1.0']]){
      const created=await mutate({action:'script',name,version,description:'Um novo nível de controle para seu servidor. Configure, personalize e coloque em operação.'});
      const r=await mutate({action:'issue',scriptId:created.createdScriptId,discordId:clientId,expiresAt:new Date(Date.now()+30*86400000).toISOString()});
      if(name==='Garage System')await mutate({action:'redeem',key:r.licenses.find(l=>l.scriptId===created.createdScriptId).key,binding:'server-01'},'client');
    }
    await page.goto(base);await page.getByRole('heading',{name:'LICENÇAS RECENTES'}).waitFor();await page.getByText('Advanced Inventory',{exact:true}).first().waitFor();
    fs.mkdirSync('artifacts',{recursive:true});await page.screenshot({path:'artifacts/tactical-desktop.png',fullPage:true});
    await page.getByRole('button',{name:'Modo Cliente',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:'Modo Cliente',exact:true}).getAttribute('aria-pressed'),'true');
    assert.equal(await page.getByRole('button',{name:'GERAR LICENÇA',exact:true}).count(),0);
    assert.equal(await page.getByText('Advanced Inventory',{exact:true}).count(),0);
    const ownerKey=await db.collection('hub_licenses').findOne({scriptName:'Advanced Inventory',status:'pending'});
    await page.getByLabel('Chave da licença',{exact:true}).fill(ownerKey.key);
    await page.getByRole('button',{name:'LIBERAR SCRIPT',exact:true}).click();
    await page.getByRole('heading',{name:'Advanced Inventory',exact:true}).waitFor();
    assert.equal(await page.getByRole('heading',{name:'Garage System',exact:true}).count(),0);
    assert.equal(await page.getByRole('button',{name:'PUBLICAR SCRIPT',exact:true}).count(),0);
    await page.screenshot({path:'artifacts/owner-client-mode.png'});
    await page.getByRole('button',{name:'ATUALIZAR',exact:true}).click();
    await page.getByRole('button',{name:'Modo Dono',exact:true}).waitFor();
    await page.getByRole('button',{name:'Modo Dono',exact:true}).click();
    await page.getByRole('heading',{name:'Garage System',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Modo Dono',exact:true}).getAttribute('aria-pressed'),'true');
    console.log('PASS: owner toggles client view, redeems own key, sees only owned scripts, and restores admin controls.');
    await page.getByRole('button',{name:'Biblioteca',exact:false}).first().click();
    await page.getByRole('heading',{name:'BIBLIOTECA DE SCRIPTS'}).waitFor();await page.screenshot({path:'artifacts/tactical-library.png',fullPage:true});
    await page.getByRole('button',{name:'PUBLICAR SCRIPT',exact:true}).click();
    await page.getByLabel('Nome do script').fill('Upload pelo navegador');
    await page.getByLabel('Descrição').fill('Pacote de teste isolado.');
    await page.locator('input[type=file]').setInputFiles({name:'test.zip',mimeType:'application/zip',buffer:zip});
    await page.getByRole('button',{name:'PUBLICAR',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
    assert(await db.collection('hub_scripts').findOne({name:'Upload pelo navegador',fileId:{$exists:true}}));
    await page.getByRole('button',{name:'Licenças',exact:false}).first().click();
    await page.getByRole('button',{name:'GERAR LICENÇA',exact:true}).click();
    assert.equal(await page.getByLabel('ID do Discord do cliente').count(),0);
    await page.getByLabel('Validade').selectOption('custom');
    await page.getByLabel('Expira em').fill('2030-12-30T23:00');
    await page.screenshot({path:'artifacts/tactical-license-dialog.png',fullPage:true});
    await page.getByRole('button',{name:'GERAR CHAVE'}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
    await page.setViewportSize({width:390,height:844});
    await page.getByRole('button',{name:'Visão geral',exact:false}).click();
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile page must not overflow.');
    await page.screenshot({path:'artifacts/tactical-mobile.png',fullPage:true});
    const clientContext=await browser.newContext();await clientContext.addCookies([{name:'next-auth.session-token',value:tokens.client,domain:'127.0.0.1',path:'/'}]);
    const clientPage=await clientContext.newPage();await clientPage.goto(base);await clientPage.getByRole('heading',{name:'LICENÇAS RECENTES'}).waitFor();
    assert.equal(await clientPage.getByRole('button',{name:'GERAR LICENÇA',exact:true}).count(),0);
    assert.equal(await clientPage.getByText('Minha conta',{exact:true}).count(),0);
    assert.equal(await clientPage.getByRole('group',{name:'Modo de visualização'}).count(),0);
    const redemptionData=await mutate({action:'issue',scriptId:(await db.collection('hub_scripts').findOne({name:'Upload pelo navegador'}))._id,expiresAt:null});
    const browserLicense=redemptionData.licenses.find(l=>l.scriptName==='Upload pelo navegador'&&l.status==='pending');
    await clientPage.getByLabel('Chave da licença',{exact:true}).fill(browserLicense.key);
    assert.equal(await clientPage.getByLabel('Identificação do servidor',{exact:true}).count(),0);
    await clientPage.getByRole('button',{name:'LIBERAR SCRIPT',exact:true}).click();
    await clientPage.getByRole('heading',{name:'BIBLIOTECA DE SCRIPTS'}).waitFor();
    await clientPage.getByRole('heading',{name:'Upload pelo navegador',exact:true}).waitFor();
    assert.equal((await db.collection('hub_licenses').findOne({_id:browserLicense._id})).discordId,clientId);
    await clientPage.screenshot({path:'artifacts/redeem-library.png'});
    console.log('PASS: client key redemption unlocks the library through the browser.');
    assert.equal(errors.length,0,'Browser must have no uncaught errors.');
    console.log('PASS: owner browser upload and issuance, mobile overflow, client controls, removed account screen, and desktop/library/modal/mobile screenshots.');
    await browser.close();browser=null;
  }
}
run().catch(e=>{console.error('Integration test failed: '+e.name+' '+e.message.replace(/mongodb(?:\+srv)?:\/\/[^\s]+/g,'[redacted]'));process.exitCode=1}).finally(async()=>{
  if(browser)await browser.close();
  if(server){server.kill(); await new Promise(resolve=>{if(server.exitCode!==null || server.signalCode!==null)return resolve();server.once('exit',resolve);setTimeout(resolve,3000).unref();});}
  if(mongo){try{if(!/^protocolo_test_[a-f0-9]{20}$/.test(testName))throw new Error('Unexpected test database name');for(const name of ['test_marker','hub_scripts','hub_licenses','hub_files.files','hub_files.chunks','hub_validation_limits']){try{await mongo.db(testName).collection(name).drop()}catch(e){if(e.code!==26)await mongo.db(testName).collection(name).deleteMany({})}}console.log('Temporary test collections cleaned.');}catch(e){console.error('Temporary test cleanup failed: '+testName);process.exitCode=1}finally{await mongo.close();}}
});
