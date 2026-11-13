import React,{useEffect,useRef,useState} from 'react';
async function signal(body){const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'call',...body})});const data=await r.json();if(!r.ok)throw new Error(data.error||'Falha na chamada.');return data;}
async function completeIce(pc){if(pc.iceGatheringState==='complete')return;await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pc.removeEventListener('icegatheringstatechange',check);reject(new Error('Não foi possível preparar a conexão. Tente outra rede.'));},12000);function check(){if(pc.iceGatheringState==='complete'){clearTimeout(timer);pc.removeEventListener('icegatheringstatechange',check);resolve();}}pc.addEventListener('icegatheringstatechange',check);check();});}
export default function VoiceCall({user,peer,disabled,onCallBusy}){
 const [call,setCall]=useState(null),[phase,setPhase]=useState('idle'),[error,setError]=useState(''),[muted,setMuted]=useState(false);
 const pc=useRef(null),media=useRef(null),remote=useRef(null),current=useRef(null),alive=useRef(true),working=useRef(false),generation=useRef(0),connectTimer=useRef(null);
 function cleanup(){clearTimeout(connectTimer.current);if(pc.current){pc.current.onconnectionstatechange=null;pc.current.close();pc.current=null;}media.current?.getTracks().forEach(t=>t.stop());media.current=null;if(remote.current)remote.current.srcObject=null;}
 function reset(){generation.current++;cleanup();current.current=null;working.current=false;if(alive.current){setCall(null);setPhase('idle');setMuted(false);onCallBusy(false);}}
 async function end(){const id=current.current?.id;reset();if(id)try{await signal({op:'end',id});}catch{if(alive.current)setError('A chamada foi encerrada neste aparelho. O outro lado será desconectado automaticamente.');}}
 useEffect(()=>{let polling=false;async function poll(){if(polling||working.current)return;polling=true;const version=generation.current;try{const data=await signal({op:'status'});if(!alive.current||version!==generation.current)return;
 if(!data.call){if(current.current){reset();setError('Chamada encerrada ou não atendida.');}return;}
 current.current=data.call;setCall(data.call);onCallBusy(true);
 if(data.call.callee===user.id&&!pc.current)setPhase('incoming');
 if(data.call.caller===user.id&&data.call.answer&&pc.current&&!pc.current.remoteDescription){await pc.current.setRemoteDescription({type:'answer',sdp:data.call.answer});}
 }catch(e){if(alive.current)setError(e.message);}finally{polling=false;}}
 poll();const timer=setInterval(poll,2000);
 return()=>{alive.current=false;clearInterval(timer);const id=current.current?.id;generation.current++;cleanup();onCallBusy(false);if(id)fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'call',op:'end',id}),keepalive:true}).catch(()=>{});};},[]);
 async function prepare(){
 if(!navigator.mediaDevices?.getUserMedia||!window.RTCPeerConnection)throw new Error('Use um navegador atualizado com HTTPS para ligar.');
 const version=generation.current;const config=await signal({op:'config'});const stream=await navigator.mediaDevices.getUserMedia({audio:true});
 if(!alive.current||version!==generation.current){stream.getTracks().forEach(t=>t.stop());throw new Error('Chamada cancelada.');}
 media.current=stream;const connection=new RTCPeerConnection({iceServers:config.iceServers});pc.current=connection;
 stream.getTracks().forEach(t=>connection.addTrack(t,stream));
 connection.ontrack=e=>{if(remote.current){remote.current.srcObject=e.streams[0]||new MediaStream([e.track]);remote.current.play().catch(()=>setError('Toque em Reproduzir áudio para ouvir a chamada.'));}};
 connection.onconnectionstatechange=()=>{if(!alive.current)return;if(connection.connectionState==='connected'){clearTimeout(connectTimer.current);setPhase('connected');setError('');}else if(connection.connectionState==='disconnected'){clearTimeout(connectTimer.current);connectTimer.current=setTimeout(()=>{end();setError('A ligação caiu. Tente ligar novamente.');},15000);}else if(['failed','closed'].includes(connection.connectionState)){end();setError('A rede não conseguiu manter a ligação. Tente outra conexão.');}};
 return connection;
 }
 function connectionDeadline(){connectTimer.current=setTimeout(()=>{end();setError('Não foi possível conectar o áudio nesta rede. Tente outra conexão.');},45000);}
 async function start(){if(!peer||working.current||current.current)return;working.current=true;onCallBusy(true);setPhase('preparing');setError('');const version=generation.current;
 try{const connection=await prepare();await connection.setLocalDescription(await connection.createOffer());await completeIce(connection);if(!alive.current||version!==generation.current)return;const data=await signal({op:'start',recipient:peer.id,sdp:connection.localDescription.sdp});
 if(!alive.current||version!==generation.current){await signal({op:'end',id:data.id});return;}
 const outgoing={id:data.id,caller:user.id,callee:peer.id,callee_name:peer.name};current.current=outgoing;setCall(outgoing);setPhase('ringing');connectionDeadline();
 }catch(e){if(version!==generation.current)return;reset();if(alive.current)setError(e.name==='NotAllowedError'?'Permita o microfone para ligar.':e.message);}finally{working.current=false;}}
 async function answer(){if(working.current||!current.current)return;working.current=true;setPhase('preparing');setError('');const incoming=current.current,version=generation.current;
 try{const connection=await prepare();await connection.setRemoteDescription({type:'offer',sdp:incoming.offer});await connection.setLocalDescription(await connection.createAnswer());await completeIce(connection);if(!alive.current||version!==generation.current)return;await signal({op:'answer',id:incoming.id,sdp:connection.localDescription.sdp});setPhase('connecting');connectionDeadline();
 }catch(e){if(version!==generation.current)return;await end();if(alive.current)setError(e.name==='NotAllowedError'?'Permita o microfone para atender.':e.message);}finally{working.current=false;}}
 function mute(){media.current?.getAudioTracks().forEach(t=>t.enabled=muted);setMuted(!muted);}
 return <section className="voice-call" aria-label="Ligação de voz"><audio ref={remote} autoPlay playsInline/>{phase==='idle'?peer?<button className="quiet" disabled={disabled} onClick={start}>☎ Ligar para {peer.name}</button>:null:<div className="call-panel" role="status"><strong>{phase==='incoming'?`${call?.caller_name} está ligando…`:phase==='connected'?'Ligação de voz conectada':phase==='ringing'?`Chamando ${call?.callee_name}…`:phase==='preparing'?'Preparando microfone…':'Conectando áudio…'}</strong><div>{phase==='incoming'&&<button onClick={answer}>Atender</button>}{phase==='connected'&&<><button className="quiet" onClick={mute}>{muted?'Ativar microfone':'Silenciar'}</button><button className="quiet" onClick={()=>remote.current?.play().catch(()=>setError('Não foi possível reproduzir o áudio.'))}>Reproduzir áudio</button></>}<button className="hangup" onClick={end}>{phase==='incoming'?'Recusar':'Encerrar'}</button></div></div>}{error&&<p className="audio-error" role="alert">{error}</p>}</section>;
}
