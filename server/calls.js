import {randomBytes} from 'node:crypto';
export async function calls(sql,user,b){
 const fail=(status,error)=>({status,data:{error}});
 await sql`UPDATE wf_calls SET state='ended',offer=NULL,answer=NULL WHERE room_id=${user.room_id} AND state<>'ended' AND (expires<now() OR (state='active' AND (caller_seen<now()-interval '45 seconds' OR callee_seen<now()-interval '45 seconds')))`;
 const iceServers=[{urls:'stun:stun.l.google.com:19302'}];
 if(process.env.TURN_URL&&process.env.TURN_USERNAME&&process.env.TURN_CREDENTIAL)iceServers.push({urls:process.env.TURN_URL,username:process.env.TURN_USERNAME,credential:process.env.TURN_CREDENTIAL});
 if(b.op==='config')return {data:{iceServers}};
 if(b.op==='status'){
 await sql`UPDATE wf_calls SET caller_seen=CASE WHEN caller=${user.id} THEN now() ELSE caller_seen END,callee_seen=CASE WHEN callee=${user.id} THEN now() ELSE callee_seen END WHERE room_id=${user.room_id} AND (caller=${user.id} OR callee=${user.id}) AND state<>'ended'`;
 const [call]=await sql`SELECT c.id,c.caller,c.callee,c.state,c.offer,c.answer,u.name AS caller_name,v.name AS callee_name FROM wf_calls c JOIN wf_users u ON u.id=c.caller JOIN wf_users v ON v.id=c.callee WHERE c.room_id=${user.room_id} AND (c.caller=${user.id} OR c.callee=${user.id}) AND c.state<>'ended' ORDER BY c.created_at DESC LIMIT 1`;
 return {data:{call:call||null}};
 }
 if(b.op==='start'||b.op==='answer'){
 if(typeof b.sdp!=='string'||b.sdp.length>50000||!b.sdp.startsWith('v=0')||!b.sdp.includes('m=audio'))return fail(400,'Dados da chamada inválidos.');
 }
 if(b.op==='start'){
 const [peer]=await sql`SELECT id FROM wf_users WHERE id=${String(b.recipient||'')} AND room_id=${user.room_id} AND id<>${user.id}`;
 if(!peer)return fail(403,'Selecione um integrante da sua família.');
 const id=randomBytes(24).toString('hex');
 const rows=await sql`INSERT INTO wf_calls(id,room_id,caller,callee,state,offer,expires) VALUES (${id},${user.room_id},${user.id},${peer.id},'ringing',${b.sdp},now()+interval '60 seconds') ON CONFLICT DO NOTHING RETURNING id`;
 if(!rows.length)return fail(409,'Já existe uma ligação em andamento na família. Tente novamente em instantes.');
 return {data:{id}};
 }
 if(b.op==='answer'){
 const rows=await sql`UPDATE wf_calls SET state='active',caller_seen=now(),callee_seen=now(),answer=${b.sdp},expires=now()+interval '30 minutes' WHERE id=${String(b.id||'')} AND room_id=${user.room_id} AND callee=${user.id} AND state='ringing' RETURNING id`;
 return rows.length?{data:{ok:true}}:fail(409,'Esta chamada já terminou ou foi atendida.');
 }
 if(b.op==='end'){
 await sql`UPDATE wf_calls SET state='ended',offer=NULL,answer=NULL WHERE id=${String(b.id||'')} AND room_id=${user.room_id} AND (caller=${user.id} OR callee=${user.id})`;
 return {data:{ok:true}};
 }
 return fail(400,'Comando de chamada inválido.');
}
