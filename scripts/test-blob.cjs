const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
function load(file,mocks,env={}){const context={exports:{},require:n=>mocks[n]||require(n),process:{env},console,URL,Buffer,Date};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);return context.exports;}
const id='11111111-1111-4111-8111-111111111111',path=`scripts/${id}/22222222-2222-4222-8222-222222222222/package.zip`;
let session={user:{id:'owner'}},script,metadata,signature,updates=0,heads=0,deleted=[],signed=[],licensed=false;
const scripts={async findOne(filter){return script && !script.deletedAt && script._id===filter._id ? {...script}:null},async updateOne(filter,change){if(!script||script.deletedAt||script._id!==filter._id || (filter.pendingBlobPath && script.pendingBlobPath!==filter.pendingBlobPath))return{modifiedCount:0,matchedCount:0};updates++;Object.assign(script,change.$set);for(const field of Object.keys(change.$unset||{}))delete script[field];return{modifiedCount:1,matchedCount:1}}};
const database={studioDatabase:async()=>({db:{},scripts,licenses:{findOne:async()=>licensed?{_id:'license'}:null}}),unexpired:()=>({expiresAt:null})};
const blob={head:async()=>{heads++;return metadata},get:async()=>({statusCode:200,stream:new ReadableStream({start(c){c.enqueue(signature);c.close()}})}),del:async p=>deleted.push(p),issueSignedToken:async o=>{signed.push(o);return{delegationToken:'test',clientSigningToken:'test'}},presignUrl:async(t,o)=>{signed.push(o);return{presignedUrl:'https://test.private.blob.vercel-storage.com/file.zip?signed=test'}}};
const finish=load('lib/blob-storage.ts',{'@/lib/studio-db':database,'@vercel/blob':blob});
function reset(){script={_id:id,pendingBlobPath:path,pendingBlobName:'doors.zip',blobPath:'scripts/old.zip'};metadata={pathname:path,url:'https://test.private.blob.vercel-storage.com/'+path,size:26*1024*1024};signature=Buffer.from([0x50,0x4b,0x03,0x04]);updates=0;heads=0;deleted=[];}
const auth={'next-auth/next':{getServerSession:async()=>session},'@/lib/auth':{authOptions:{},isOwner:x=>x==='owner'}};
function response(){return{code:200,body:null,setHeader(){},status(c){this.code=c;return this},json(b){this.body=b;return this},end(){return this},redirect(c,url){this.code=c;this.body={url};return this}};}
(async()=>{
reset();await finish.finishBlobUpload(id,path);assert.equal(script.fileSize,26*1024*1024);assert.equal(script.blobPath,path);assert.deepEqual(deleted,['scripts/old.zip']);assert.equal(script.pendingBlobPath,undefined);await finish.finishBlobUpload(id,path);assert.equal(updates,1,'Callback and browser completion must be idempotent.');
reset();await assert.rejects(()=>finish.finishBlobUpload(id,path+'other'));assert.equal(heads,0);
reset();metadata.url='https://test.public.blob.vercel-storage.com/file';await assert.rejects(()=>finish.finishBlobUpload(id,path));assert.equal(updates,0);
reset();metadata.size=101*1024*1024;await assert.rejects(()=>finish.finishBlobUpload(id,path));assert.equal(updates,0);
reset();signature=Buffer.from('nope');await assert.rejects(()=>finish.finishBlobUpload(id,path));assert.equal(updates,0);
reset();script.deletedAt='deleted';await assert.rejects(()=>finish.finishBlobUpload(id,path));assert.equal(updates,0);
let options;
const upload=load('pages/api/scripts/blob-upload.ts',{...auth,'@/lib/studio-db':database,'@/lib/blob-storage':finish,'@vercel/blob/client':{handleUpload:async o=>{options=await o.onBeforeGenerateToken(o.body.pathname,o.body.clientPayload);return{ok:true}}}},{BLOB_READ_WRITE_TOKEN:'test-only',NEXTAUTH_URL:'https://core.test'}).default;
const req={method:'POST',headers:{origin:'https://core.test'},body:{pathname:path,clientPayload:JSON.stringify({scriptId:id,fileName:'doors.zip'})}};
reset();let res=response();await upload(req,res);assert.equal(res.code,200);assert.equal(options.maximumSizeInBytes,100*1024*1024);assert.equal(options.allowOverwrite,false);assert.equal(JSON.parse(options.tokenPayload).pathname,path);
session={user:{id:'client'}};res=response();await upload(req,res);assert.equal(res.code,400);
session={user:{id:'owner'}};res=response();await upload({...req,headers:{origin:'https://other.test'}},res);assert.equal(res.code,400);
const download=load('pages/api/scripts/download.ts',{...auth,'@/lib/studio-db':database,'@vercel/blob':blob}).default;
reset();script.blobPath=path;session=null;res=response();await download({method:'GET',query:{id,delivery:'link'}},res);assert.equal(res.code,401);assert.equal(signed.length,0);
session={user:{id:'client'}};res=response();await download({method:'GET',query:{id,delivery:'link'}},res);assert.equal(res.code,403);assert.equal(signed.length,0);
licensed=true;res=response();await download({method:'GET',query:{id,delivery:'link'}},res);assert.equal(res.code,200);assert.equal(signed[0].pathname,path);assert.equal(signed[0].operations[0],'get');assert(signed[0].validUntil<=Date.now()+60000);assert.equal(signed[1].access,'private');
console.log('PASS: 26 MB metadata, private-only storage, ZIP verification, size cap, idempotent completion, outdated/deleted uploads, owner/origin checks and license-gated scoped download URLs.');
})().catch(e=>{console.error(e);process.exitCode=1});
