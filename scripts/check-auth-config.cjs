const {loadEnvConfig}=require("@next/env");
loadEnvConfig(process.cwd(),true);
const {MongoClient}=require("mongodb");
(async()=>{let client;try{client=new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:8000});await client.connect();await client.db().command({ping:1});console.log("MongoDB: conexão verificada.");}catch(e){console.log("MongoDB: falha de conexão ("+e.name+"). Os detalhes foram omitidos para proteger as credenciais.");process.exitCode=1;}finally{if(client)await client.close();}const callback=new URL(process.env.DISCORD_REDIRECT_URI);console.log(JSON.stringify({callback:callback.href,ownerConfigured:!!process.env.OWNER_DISCORD_ID}));})();
