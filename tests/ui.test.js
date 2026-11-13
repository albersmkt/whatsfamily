import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('sending, polling and malformed replies keep the chat visible',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://family.test'});
 globalThis.window=dom.window;globalThis.document=dom.window.document;
 const user={id:'dad',name:'Pai'};let reply={user,messages:[]};let poll;let sends=0;let lastBody;
 const originalInterval=globalThis.setInterval,originalClear=globalThis.clearInterval,originalFetch=globalThis.fetch;
 globalThis.setInterval=fn=>{poll=fn;return 1;};globalThis.clearInterval=()=>{};
 globalThis.fetch=async(_url,options)=>{lastBody=options?.body?JSON.parse(options.body):null;if(options?.body&&JSON.parse(options.body).action==='send')sends++;return {ok:true,json:async()=>reply};};
 const output=await build({entryPoints:['src/main.jsx'],bundle:true,write:false,platform:'node',format:'esm',loader:{'.css':'empty'}});
 const dir=await mkdtemp(join(tmpdir(),'wf-ui-'));
 try{
 await writeFile(join(dir,'app.mjs'),output.outputFiles[0].text);
 await import(join(dir,'app.mjs'));
 const settle=()=>new Promise(r=>setTimeout(r,60));await settle();await settle();
 const input=document.querySelector('[aria-label="Mensagem"]');assert.ok(input);
 const setValue=Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set;
 setValue.call(input,'Oi filha');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
 // React event support in the simulated DOM may use change events as well.
 input.dispatchEvent(new dom.window.Event('change',{bubbles:true}));await settle();
 reply={user,messages:[{id:'1',name:'Pai',sender_id:'dad',body:'Oi filha',created_at:new Date().toISOString()}]};
 document.querySelector('.compose').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await settle();
 assert.equal(sends,1,'the form must call the send API');assert.match(document.body.textContent,/Oi filha/);
 reply={user,messages:[...reply.messages,{id:'2',name:'Filha',sender_id:'child',body:'Oi pai',created_at:new Date().toISOString()}]};
 await poll();await settle();assert.match(document.body.textContent,/Oi pai/);
 reply={ok:true};setValue.call(input,'Mensagem preservada');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await settle();document.querySelector('.compose').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await settle();assert.equal(sends,2);assert.equal(input.value,'Mensagem preservada');await poll();await settle();
 assert.ok(document.querySelector('.compose'));assert.match(document.body.textContent,/Oi filha/);assert.match(document.body.textContent,/Não foi possível atualizar/);
 reply={user,messages:[{id:'3',body:{invalid:true}}]};await poll();await settle();assert.ok(document.querySelector('.compose'));
 reply={user,members:[{id:'child',name:'Filha'}],messages:[]};await poll();await settle();
 const memberButton=document.querySelector('.member-link');assert.ok(memberButton);assert.match(memberButton.textContent,/Filha/);
 memberButton.click();await settle();assert.equal(lastBody.action,'load');assert.equal(lastBody.recipient,'child');assert.match(document.querySelector('header').textContent,/Filha/);
 setValue.call(input,'Mensagem privada');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await settle();document.querySelector('.compose').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await settle();assert.equal(lastBody.recipient,'child');assert.equal(lastBody.action,'send');
 document.querySelector('.room-link').click();await settle();assert.equal(lastBody.recipient,'');assert.match(document.querySelector('header').textContent,/Nossa família/);
 }finally{globalThis.setInterval=originalInterval;globalThis.clearInterval=originalClear;globalThis.fetch=originalFetch;dom.window.close();await rm(dir,{recursive:true,force:true});}
});
