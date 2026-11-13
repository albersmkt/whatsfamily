import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {createHandler} from '../api/chat.js';
test('family authentication, persistence, isolation and logout',async()=>{
 const db=new PGlite();
 function sql(parts,...values){const query=parts.reduce((s,p,i)=>s+(i?'$'+i:'')+p,'');return {then(resolve,reject){return db.query(query,values).then(r=>r.rows).then(resolve,reject);},query,values};}
 sql.transaction=queries=>db.transaction(async tx=>{const results=[];for(const q of queries)results.push((await tx.query(q.query,q.values)).rows);return results;});
 process.env.DATABASE_URL='postgresql://test-only';
 const handler=createHandler(()=>sql);
 async function call(body,cookie='',origin='https://family.test'){
 const result={status:200,headers:{}};const res={setHeader(k,v){result.headers[k]=v;},status(n){result.status=n;return this;},json(data){result.data=data;return this;}};
 await handler({method:body?'POST':'GET',body,headers:{host:'family.test',origin,cookie,'x-forwarded-for':'127.0.0.1'}},res);
 result.cookie=result.headers['Set-Cookie']?.split(';')[0];return result;
 }
 assert.equal((await call()).status,401);
 const father=await call({action:'create',username:'father',name:'Pai',password:'correct-password'});assert.equal(father.status,200);assert.match(father.data.invite,/^[0-9a-z]{10}$/);
 assert.match(father.headers['Set-Cookie'],/HttpOnly; Secure; SameSite=Lax/);
 assert.equal((await call({action:'join',username:'child',name:'Filha',password:'child-password',invite:'wrong'})).status,400);
 const child=await call({action:'join',username:'child',name:'Filha',password:'child-password',invite:father.data.invite.slice(0,5).toUpperCase()+' - '+father.data.invite.slice(5).toUpperCase()});assert.equal(child.status,200);
 await call({action:'send',body:'Oi, filha!'},father.cookie);
 assert.equal((await call(null,child.cookie)).data.messages[0].body,'Oi, filha!');
 await call({action:'send',body:'Oi, pai!'},child.cookie);
 assert.equal((await call(null,father.cookie)).data.messages.length,2);
 const other=await call({action:'create',username:'other',name:'Outro',password:'other-password'});
 assert.equal((await call(null,other.cookie)).data.messages.length,0);
 assert.equal((await call({action:'send',body:'invasão'},father.cookie,'https://evil.test')).status,403);
 assert.equal((await call({action:'login',username:'father',password:'wrong-password'})).status,401);
 assert.equal((await call({action:'login',username:'father',password:'correct-password'})).status,200);
 assert.equal((await call({action:'send',body:'a'.repeat(2001)},father.cookie)).status,400);
 await call({action:'logout'},child.cookie);assert.equal((await call(null,child.cookie)).status,401);
 const rotated=await call({action:'invite'},father.cookie);assert.match(rotated.data.invite,/^[0-9a-z]{10}$/);
 assert.equal((await call({action:'invite'})).status,401);
 assert.equal((await call({action:'join',username:'oldcode',name:'Outro',password:'other-password',invite:father.data.invite})).status,400);
 assert.equal((await call({action:'join',username:'newcode',name:'Outro',password:'other-password',invite:rotated.data.invite})).status,200);
 await db.close();
});
