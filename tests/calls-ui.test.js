import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('voice call UI starts, mutes, hangs up and accepts an incoming call',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://family.test'});globalThis.window=dom.window;globalThis.document=dom.window.document;window.rings=0;window.ringStops=0;
 const originalNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator'),oldFetch=globalThis.fetch,oldInterval=globalThis.setInterval,oldClear=globalThis.clearInterval,oldRTC=globalThis.RTCPeerConnection;
 let poll,active=null,lastPC,stops=0;const track={enabled:true,stop(){stops++;}};
 const stream={getTracks:()=>[track],getAudioTracks:()=>[track]};
 class Peer {
 constructor(){lastPC=this;}iceGatheringState='complete';connectionState='new';remoteDescription=null;
 addTrack(){}createOffer(){return {type:'offer',sdp:'v=0\r\nm=audio'};}createAnswer(){return {type:'answer',sdp:'v=0\r\nm=audio'};}
 async setLocalDescription(d){this.localDescription=d;}async setRemoteDescription(d){this.remoteDescription=d;}close(){this.connectionState='closed';}
 }
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{userAgent:'test',mediaDevices:{getUserMedia:async()=>stream}}});globalThis.RTCPeerConnection=Peer;window.RTCPeerConnection=Peer;
 globalThis.setInterval=fn=>{poll=fn;return 1;};globalThis.clearInterval=()=>{};
 globalThis.fetch=async(_url,options)=>{const b=JSON.parse(options.body);let data={};if(b.op==='config')data={iceServers:[]};if(b.op==='status')data={call:active};if(b.op==='start'){active={id:'call1',caller:'dad',callee:'child',callee_name:'Filha'};data={id:active.id};}if(b.op==='end')active=null;if(b.op==='answer')active={...active,state:'active',answer:b.sdp};return {ok:true,json:async()=>data};};
 const dir=await mkdtemp(join(tmpdir(),'wf-call-'));const settle=()=>new Promise(r=>setTimeout(r,50));
 try{
 const output=await build({stdin:{contents:"import React from 'react';import {createRoot} from 'react-dom/client';import VoiceCall from './src/VoiceCall.jsx';createRoot(document.getElementById('root')).render(<VoiceCall user={{id:'dad'}} peer={{id:'child',name:'Filha'}} onCallBusy={()=>{}} soundEnabled={true} sound={{play:()=>window.rings++,stop:()=>window.ringStops++}}/>);",resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,format:'esm',platform:'node'});
 await writeFile(join(dir,'call.mjs'),output.outputFiles[0].text);await import(join(dir,'call.mjs'));await settle();
 const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes(text));
 button('Ligar para').click();await settle();assert.match(document.body.textContent,/Chamando Filha/);assert.ok(active);
 lastPC.connectionState='connected';lastPC.onconnectionstatechange();await settle();button('Silenciar').click();await settle();assert.equal(track.enabled,false);
 button('Encerrar').click();await settle();assert.equal(active,null);assert.ok(stops>0);
 active={id:'call2',caller:'child',callee:'dad',caller_name:'Filha',offer:'v=0\r\nm=audio',state:'ringing'};await poll();await settle();assert.match(document.body.textContent,/Filha está ligando/);assert.equal(window.rings,1);
 button('Atender').click();await settle();assert.equal(active.state,'active');assert.ok(window.ringStops>=1);assert.equal(lastPC.remoteDescription.type,'offer');
 button('Encerrar').click();await settle();assert.equal(active,null);
 }finally{globalThis.fetch=oldFetch;globalThis.setInterval=oldInterval;globalThis.clearInterval=oldClear;globalThis.RTCPeerConnection=oldRTC;if(originalNavigator)Object.defineProperty(globalThis,'navigator',originalNavigator);else delete globalThis.navigator;dom.window.close();await rm(dir,{recursive:true,force:true});}
});
