import {neon} from '@neondatabase/serverless';
import {randomBytes, scryptSync, timingSafeEqual, createHash} from 'node:crypto';
const hash=x=>createHash('sha256').update(x).digest('hex');
const secret=()=>randomBytes(32).toString('hex');
const inviteCode=()=>Array.from(randomBytes(10),b=>'0123456789abcdefghjkmnpqrstvwxyz'[b%32]).join('');
const normalizeInvite=value=>String(value||'').toLowerCase().replace(/[\s-]/g,'');

async function init(sql){
 await sql`CREATE TABLE IF NOT EXISTS wf_rooms (id text PRIMARY KEY, invite_hash text UNIQUE NOT NULL)`;
 await sql`CREATE TABLE IF NOT EXISTS wf_users (id text PRIMARY KEY, room_id text NOT NULL REFERENCES wf_rooms(id), username text UNIQUE NOT NULL, name text NOT NULL, password text NOT NULL)`;
 await sql`CREATE TABLE IF NOT EXISTS wf_sessions (token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES wf_users(id), expires timestamptz NOT NULL)`;
 await sql`CREATE TABLE IF NOT EXISTS wf_messages (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, room_id text NOT NULL REFERENCES wf_rooms(id), sender_id text NOT NULL REFERENCES wf_users(id), body text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`;
 await sql`ALTER TABLE wf_messages ADD COLUMN IF NOT EXISTS recipient_id text REFERENCES wf_users(id)`;
 await sql`ALTER TABLE wf_messages ADD COLUMN IF NOT EXISTS audio_data text`;
 await sql`ALTER TABLE wf_messages ADD COLUMN IF NOT EXISTS audio_type text`;
 await sql`CREATE INDEX IF NOT EXISTS wf_messages_room_idx ON wf_messages(room_id,id)`;
 await sql`CREATE TABLE IF NOT EXISTS wf_limits (bucket text PRIMARY KEY, hits integer NOT NULL, expires timestamptz NOT NULL)`;
}
async function accountAttempt(sql,username){
 const bucket='account:'+hash(username);
 const [limit]=await sql`INSERT INTO wf_limits(bucket,hits,expires) VALUES (${bucket},1,now()+interval '15 minutes') ON CONFLICT(bucket) DO UPDATE SET hits=CASE WHEN wf_limits.expires<now() THEN 1 ELSE wf_limits.hits+1 END,expires=CASE WHEN wf_limits.expires<now() THEN now()+interval '15 minutes' ELSE wf_limits.expires END RETURNING hits`;
 return {allowed:limit.hits<=5,bucket};
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
 if(JSON.stringify(b).length>1450000)return res.status(413).json({error:'Conteúdo muito grande.'});
 const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('wf_session='))?.slice(11)||'';
 const [user]=cookie?await sql`SELECT u.id,u.name,u.room_id FROM wf_sessions s JOIN wf_users u ON u.id=s.user_id WHERE s.token_hash=${hash(cookie)} AND s.expires>now()`:[];
 const fail=(status,error)=>res.status(status).json({error});
 if(['create','join','login'].includes(action)){
 const bucket=hash(String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0]);
 const [limit]=await sql`INSERT INTO wf_limits(bucket,hits,expires) VALUES (${bucket},1,now()+interval '15 minutes') ON CONFLICT(bucket) DO UPDATE SET hits=CASE WHEN wf_limits.expires<now() THEN 1 ELSE wf_limits.hits+1 END,expires=CASE WHEN wf_limits.expires<now() THEN now()+interval '15 minutes' ELSE wf_limits.expires END RETURNING hits`;
 if(limit.hits>20)return fail(429,'Muitas tentativas. Aguarde 15 minutos.');
 const username=String(b.username||'').trim().toLowerCase(),password=String(b.password||'');
 if(!/^[a-z0-9_.-]{3,40}$/.test(username)||(!/^\d{4}$/.test(password)&&password.length<10)||password.length>128)return fail(400,'Use um usuário de 3 a 40 letras/números e PIN de 4 números (ou sua senha anterior).');
 let account,invite;
 if(action==='login'){
 const attempt=await accountAttempt(sql,username);
 if(!attempt.allowed)return fail(429,'Muitas tentativas para este usuário. Aguarde 15 minutos.');
 [account]=await sql`SELECT * FROM wf_users WHERE username=${username}`;
 const stored=account?.password||('0'.repeat(32)+':'+ '0'.repeat(128));const [salt,digest]=stored.split(':');
 const valid=timingSafeEqual(scryptSync(password,salt,64),Buffer.from(digest,'hex'));
 if(!account||!valid)return fail(401,'Usuário ou senha incorretos.');
 await sql`DELETE FROM wf_limits WHERE bucket=${attempt.bucket}`;
 }else{
 const name=String(b.name||'').trim();if(!name||name.length>60)return fail(400,'Informe um nome de até 60 caracteres.');
 const id=secret(),salt=randomBytes(16).toString('hex');const digest=salt+':'+scryptSync(password,salt,64).toString('hex');
 if(action==='create'){
 invite=inviteCode();const room=secret();
 const result=await sql.transaction([sql`INSERT INTO wf_rooms(id,invite_hash) VALUES (${room},${hash(invite)})`,sql`INSERT INTO wf_users(id,room_id,username,name,password) VALUES (${id},${room},${username},${name},${digest}) RETURNING *`]);account=result[1][0];
 }else{
 const [room]=await sql`SELECT id FROM wf_rooms WHERE invite_hash=${hash(normalizeInvite(b.invite))}`;
 if(!room)return fail(400,'Convite inválido. Confira com sua família.');
 [account]=await sql`INSERT INTO wf_users(id,room_id,username,name,password) VALUES (${id},${room.id},${username},${name},${digest}) RETURNING *`;
 }
 }
 const token=secret();await sql`INSERT INTO wf_sessions(token_hash,user_id,expires) VALUES (${hash(token)},${account.id},now()+interval '30 days')`;
 res.setHeader('Set-Cookie',`wf_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`);
 return res.json({user:{id:account.id,name:account.name},invite});
 }
 if(!user)return fail(401,'Entre para conversar.');
 if(req.method==='GET'&&req.query?.audio){
 const id=String(req.query.audio);if(!/^\d{1,19}$/.test(id))return fail(400,'Áudio inválido.');
 const [audio]=await sql`SELECT audio_data,audio_type FROM wf_messages WHERE id=${id} AND room_id=${user.room_id} AND (recipient_id IS NULL OR sender_id=${user.id} OR recipient_id=${user.id})`;
 if(!audio?.audio_data)return fail(404,'Áudio não disponível.');
 const bytes=Buffer.from(audio.audio_data,'base64');res.setHeader('Content-Type',audio.audio_type);res.setHeader('Content-Length',bytes.length);return res.end(bytes);
 }
 if(action==='pin'){
 const pin=String(b.pin||''),current=String(b.current||'');
 if(!/^\d{4}$/.test(pin)||current.length>128)return fail(400,'O PIN precisa ter exatamente 4 números.');
 const [account]=await sql`SELECT * FROM wf_users WHERE id=${user.id}`;
 const attempt=await accountAttempt(sql,account.username);
 if(!attempt.allowed)return fail(429,'Muitas tentativas para este usuário. Aguarde 15 minutos.');
 const [salt,digest]=account.password.split(':');
 if(!timingSafeEqual(scryptSync(current,salt,64),Buffer.from(digest,'hex')))return fail(401,'Senha atual incorreta.');
 const nextSalt=randomBytes(16).toString('hex');const password=nextSalt+':'+scryptSync(pin,nextSalt,64).toString('hex');
 await sql.transaction([sql`UPDATE wf_users SET password=${password} WHERE id=${user.id}`,sql`DELETE FROM wf_sessions WHERE user_id=${user.id} AND token_hash<>${hash(cookie)}`,sql`DELETE FROM wf_limits WHERE bucket=${attempt.bucket}`]);
 return res.json({ok:true});
 }
 if(action==='invite'){const invite=inviteCode();await sql`UPDATE wf_rooms SET invite_hash=${hash(invite)} WHERE id=${user.room_id}`;return res.json({invite});}
 if(action==='logout'){await sql`DELETE FROM wf_sessions WHERE token_hash=${hash(cookie)}`;res.setHeader('Set-Cookie','wf_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');return res.json({ok:true});}
 const recipient=String(b.recipient||'');
 if(recipient){const [peer]=await sql`SELECT id FROM wf_users WHERE id=${recipient} AND room_id=${user.room_id} AND id<>${user.id}`;if(!peer)return fail(403,'Integrante não disponível nesta família.');}
 if(action==='clear'){
 if(b.confirm!==true||!/^\d{1,19}$/.test(String(b.before||'')))return fail(400,'Confirme quais mensagens deseja apagar.');
 await sql`DELETE FROM wf_messages WHERE room_id=${user.room_id} AND id<=${String(b.before)} AND ((${recipient}='' AND recipient_id IS NULL) OR (${recipient}<>'' AND ((sender_id=${user.id} AND recipient_id=${recipient}) OR (sender_id=${recipient} AND recipient_id=${user.id}))))`;
 }
 if(action==='send'){
 const body=String(b.body||'').trim();if((!body&&!b.audio)||body.length>2000)return fail(400,'Escreva uma mensagem de até 2000 caracteres.');
 let audioData=null,audioType=null;
 if(b.audio){
 const {data,type}=b.audio;
 if(typeof data!=='string'||data.length>1398104||!data.length||!/^[A-Za-z0-9+/]+={0,2}$/.test(data)||!['audio/webm','audio/mp4','audio/ogg'].includes(type))return fail(400,'Áudio inválido ou maior que 1 MB.');
 const bytes=Buffer.from(data,'base64');
 const valid=type==='audio/webm'?bytes.subarray(0,4).toString('hex')==='1a45dfa3':type==='audio/mp4'?bytes.subarray(4,8).toString()==='ftyp':bytes.subarray(0,4).toString()==='OggS';
 if(!valid||bytes.length>1048576)return fail(400,'Formato de áudio inválido.');
 audioData=data;audioType=type;
 }
 await sql`INSERT INTO wf_messages(room_id,sender_id,body,recipient_id,audio_data,audio_type) VALUES (${user.room_id},${user.id},${body},${recipient||null},${audioData},${audioType})`;
 }else if(!['load','clear'].includes(action))return fail(400,'Ação inválida.');
 const rows=await sql`SELECT m.id,m.body,m.sender_id,m.created_at,u.name,m.audio_type FROM wf_messages m JOIN wf_users u ON u.id=m.sender_id WHERE m.room_id=${user.room_id} AND ((${recipient}='' AND m.recipient_id IS NULL) OR (${recipient}<>'' AND ((m.sender_id=${user.id} AND m.recipient_id=${recipient}) OR (m.sender_id=${recipient} AND m.recipient_id=${user.id})))) ORDER BY m.id DESC LIMIT 100`;
 const members=await sql`SELECT id,name FROM wf_users WHERE room_id=${user.room_id} AND id<>${user.id} ORDER BY name,id`;
 return res.json({user:{id:user.id,name:user.name},members,messages:rows.reverse()});
 }catch(e){return res.status(e.code==='23505'?409:500).json({error:e.code==='23505'?'Esse usuário já existe. Escolha outro.':'Não foi possível concluir. Confira a conexão e tente novamente.'});}
}

}
export default createHandler();
