import {neon} from '@neondatabase/serverless';
import {randomBytes, scryptSync, timingSafeEqual, createHash} from 'node:crypto';
const hash=x=>createHash('sha256').update(x).digest('hex');
const secret=()=>randomBytes(32).toString('hex');

async function init(sql){
 await sql`CREATE TABLE IF NOT EXISTS wf_rooms (id text PRIMARY KEY, invite_hash text UNIQUE NOT NULL)`;
 await sql`CREATE TABLE IF NOT EXISTS wf_users (id text PRIMARY KEY, room_id text NOT NULL REFERENCES wf_rooms(id), username text UNIQUE NOT NULL, name text NOT NULL, password text NOT NULL)`;
 await sql`CREATE TABLE IF NOT EXISTS wf_sessions (token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES wf_users(id), expires timestamptz NOT NULL)`;
 await sql`CREATE TABLE IF NOT EXISTS wf_messages (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, room_id text NOT NULL REFERENCES wf_rooms(id), sender_id text NOT NULL REFERENCES wf_users(id), body text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`;
 await sql`CREATE INDEX IF NOT EXISTS wf_messages_room_idx ON wf_messages(room_id,id)`;
 await sql`CREATE TABLE IF NOT EXISTS wf_limits (bucket text PRIMARY KEY, hits integer NOT NULL, expires timestamptz NOT NULL)`;
}
export function createHandler(connect=neon){
let initialized;
return async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 const connection=process.env.DATABASE_URL||process.env.POSTGRES_URL;
 if(!connection)return res.status(503).json({error:'O banco ainda não está conectado ao projeto na Vercel.'});
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Método inválido.'});
 if(req.method==='POST'&&req.headers.origin){try{if(new URL(req.headers.origin).host!==req.headers.host)return res.status(403).json({error:'Origem inválida.'});}catch{return res.status(403).json({error:'Origem inválida.'});}}
 try{
 const sql=connect(connection);if(!initialized)initialized=init(sql).catch(e=>{initialized=null;throw e;});await initialized;
 const b=req.body||{};const action=req.method==='GET'?'load':b.action;
 if(JSON.stringify(b).length>12000)return res.status(413).json({error:'Conteúdo muito grande.'});
 const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('wf_session='))?.slice(11)||'';
 const [user]=cookie?await sql`SELECT u.id,u.name,u.room_id FROM wf_sessions s JOIN wf_users u ON u.id=s.user_id WHERE s.token_hash=${hash(cookie)} AND s.expires>now()`:[];
 const fail=(status,error)=>res.status(status).json({error});
 if(['create','join','login'].includes(action)){
 const bucket=hash(String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0]);
 const [limit]=await sql`INSERT INTO wf_limits(bucket,hits,expires) VALUES (${bucket},1,now()+interval '15 minutes') ON CONFLICT(bucket) DO UPDATE SET hits=CASE WHEN wf_limits.expires<now() THEN 1 ELSE wf_limits.hits+1 END,expires=CASE WHEN wf_limits.expires<now() THEN now()+interval '15 minutes' ELSE wf_limits.expires END RETURNING hits`;
 if(limit.hits>20)return fail(429,'Muitas tentativas. Aguarde 15 minutos.');
 const username=String(b.username||'').trim().toLowerCase(),password=String(b.password||'');
 if(!/^[a-z0-9_.-]{3,40}$/.test(username)||password.length<10||password.length>128)return fail(400,'Use um usuário de 3 a 40 letras/números e senha de 10 a 128 caracteres.');
 let account,invite;
 if(action==='login'){
 [account]=await sql`SELECT * FROM wf_users WHERE username=${username}`;
 const stored=account?.password||('0'.repeat(32)+':'+ '0'.repeat(128));const [salt,digest]=stored.split(':');
 const valid=timingSafeEqual(scryptSync(password,salt,64),Buffer.from(digest,'hex'));
 if(!account||!valid)return fail(401,'Usuário ou senha incorretos.');
 }else{
 const name=String(b.name||'').trim();if(!name||name.length>60)return fail(400,'Informe um nome de até 60 caracteres.');
 const id=secret(),salt=randomBytes(16).toString('hex');const digest=salt+':'+scryptSync(password,salt,64).toString('hex');
 if(action==='create'){
 invite=secret();const room=secret();
 const result=await sql.transaction([sql`INSERT INTO wf_rooms(id,invite_hash) VALUES (${room},${hash(invite)})`,sql`INSERT INTO wf_users(id,room_id,username,name,password) VALUES (${id},${room},${username},${name},${digest}) RETURNING *`]);account=result[1][0];
 }else{
 const [room]=await sql`SELECT id FROM wf_rooms WHERE invite_hash=${hash(String(b.invite||''))}`;
 if(!room)return fail(400,'Convite inválido. Confira com sua família.');
 [account]=await sql`INSERT INTO wf_users(id,room_id,username,name,password) VALUES (${id},${room.id},${username},${name},${digest}) RETURNING *`;
 }
 }
 const token=secret();await sql`INSERT INTO wf_sessions(token_hash,user_id,expires) VALUES (${hash(token)},${account.id},now()+interval '30 days')`;
 res.setHeader('Set-Cookie',`wf_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`);
 return res.json({user:{id:account.id,name:account.name},invite});
 }
 if(!user)return fail(401,'Entre para conversar.');
 if(action==='logout'){await sql`DELETE FROM wf_sessions WHERE token_hash=${hash(cookie)}`;res.setHeader('Set-Cookie','wf_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');return res.json({ok:true});}
 if(action==='send'){
 const body=String(b.body||'').trim();if(!body||body.length>2000)return fail(400,'Escreva uma mensagem de até 2000 caracteres.');
 await sql`INSERT INTO wf_messages(room_id,sender_id,body) VALUES (${user.room_id},${user.id},${body})`;
 }else if(action!=='load')return fail(400,'Ação inválida.');
 const rows=await sql`SELECT m.id,m.body,m.sender_id,m.created_at,u.name FROM wf_messages m JOIN wf_users u ON u.id=m.sender_id WHERE m.room_id=${user.room_id} ORDER BY m.id DESC LIMIT 100`;
 return res.json({user:{id:user.id,name:user.name},messages:rows.reverse()});
 }catch(e){return res.status(e.code==='23505'?409:500).json({error:e.code==='23505'?'Esse usuário já existe. Escolha outro.':'Não foi possível concluir. Confira a conexão e tente novamente.'});}
}

}
export default createHandler();
