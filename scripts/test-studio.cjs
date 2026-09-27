const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
let session = null, reads = [], updates = [], connections = 0;
const db = { collection(name) { return { find(filter) { reads.push({name,filter}); return {sort(){return this},async toArray(){return name==='hub_licenses'?[{scriptId:'script-one'}]:[]}} }, async updateOne(filter, change) { updates.push({filter,change}); return {modifiedCount:1} } }; } };
const mocks = {'next-auth/next':{getServerSession:async()=>session}, '@/lib/auth':{authOptions:{},isOwner:id=>id==='owner'}, '@/lib/mongodb':{default:{connect:async()=>{connections++},db:()=>db}}};
const source = ts.transpileModule(fs.readFileSync('pages/api/studio.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const context = {exports:{},require:name=>mocks[name]||require(name),process:{env:{NEXTAUTH_URL:'http://localhost:3000'}},console,URL};
vm.runInNewContext(source,context);
async function request(method='GET',body={},origin='http://localhost:3000') { const res={code:200,data:null,setHeader(){},status(code){this.code=code;return this},json(data){this.data=data;return this},end(){return this}}; await context.exports.default({method,body,headers:{origin,'content-type':'application/json'}},res); return res; }
(async()=>{
 assert.equal((await request()).code,401); assert.equal(connections,0);
 session={user:{id:'client'}};
 await request(); assert.equal(reads[0].filter.discordId,'client'); assert.equal(reads[1].filter._id.$in[0],'script-one');
 for(const action of ['issue','script','revoke']) assert.equal((await request('POST',{action})).code,403);
 assert.equal((await request('POST',{action:'activate',id:'license',binding:'server'},'https://foreign.test')).code,403);
 assert.equal(updates.length,0);
 assert.equal((await request('POST',{action:'activate',id:'license',binding:'server'})).code,200);
 assert.equal(updates[0].filter.discordId,'client'); assert.equal(updates[0].filter.status,'pending');
 session={user:{id:'owner'}}; reads=[]; await request(); assert.equal(Object.keys(reads[0].filter).length,0);
 assert.equal((await request('POST',{action:'revoke',id:'license'})).code,200); assert.equal(updates[1].change.$set.status,'revoked');
 console.log('PASS: anonymous access, client data isolation, owner-only operations, cross-origin rejection, scoped activation and owner revocation.');
})().catch(e=>{console.error(e);process.exitCode=1});
