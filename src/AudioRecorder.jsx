import React,{useEffect,useRef,useState} from 'react';
const MAX_BYTES=1048576;
export default function AudioRecorder({disabled,onSend}){
 const [phase,setPhase]=useState('idle'),[seconds,setSeconds]=useState(0),[draft,setDraft]=useState(null),[error,setError]=useState('');
 const recording=useRef(null),stream=useRef(null),timer=useRef(null),mounted=useRef(true),preview=useRef(null);
 function release(){clearInterval(timer.current);stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;}
 useEffect(()=>()=>{mounted.current=false;const r=recording.current;if(r&&r.state!=='inactive'){r.onstop=null;r.stop();}release();if(preview.current)URL.revokeObjectURL(preview.current);},[]);
 function discard(){if(preview.current)URL.revokeObjectURL(preview.current);preview.current=null;setDraft(null);setPhase('idle');setError('');}
 function stop(){if(recording.current?.state==='recording'){setPhase('processing');recording.current.stop();release();}}
 async function start(){
 setError('');if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){setError('Este navegador não permite gravar. Abra em um navegador atualizado, pelo endereço HTTPS.');return;}
 setPhase('permission');
 try{
 const media=await navigator.mediaDevices.getUserMedia({audio:true});if(!mounted.current){media.getTracks().forEach(t=>t.stop());return;}stream.current=media;
 const mime=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(t=>MediaRecorder.isTypeSupported(t));
 if(!mime)throw new Error('Formato não suportado');
 const r=new MediaRecorder(media,{mimeType:mime,audioBitsPerSecond:64000});recording.current=r;const chunks=[];let size=0;
 r.ondataavailable=e=>{if(e.data.size){chunks.push(e.data);size+=e.data.size;if(size>MAX_BYTES&&r.state==='recording')stop();}};
 r.onerror=()=>{r.onstop=null;release();if(mounted.current){setError('A gravação foi interrompida. Tente novamente.');setPhase('idle');}};
 r.onstop=()=>{release();if(!mounted.current)return;const blob=new Blob(chunks,{type:mime.split(';')[0]});if(!blob.size||blob.size>MAX_BYTES){setError('Grave um áudio menor, de até 1 minuto e 1 MB.');setPhase('idle');return;}preview.current=URL.createObjectURL(blob);setDraft({blob,url:preview.current});setPhase('preview');};
 r.start(250);setSeconds(0);setPhase('recording');const began=Date.now();timer.current=setInterval(()=>{const elapsed=Math.floor((Date.now()-began)/1000);setSeconds(elapsed);if(elapsed>=60)stop();},250);
 }catch(e){release();if(mounted.current){setPhase('idle');setError(e.name==='NotAllowedError'?'Permita o microfone nas configurações do navegador para gravar.':'Não foi possível acessar o microfone. Verifique se ele está disponível.');}}
 }
 async function send(){if(!draft)return;setPhase('sending');setError('');try{const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(draft.blob);});if(!mounted.current)return;await onSend({data,type:draft.blob.type});if(mounted.current)discard();}catch{if(mounted.current){setPhase('preview');setError('Áudio não enviado. Sua gravação foi preservada para tentar novamente.');}}}
 return <div className="audio-recorder">{phase==='idle'?<button className="quiet" disabled={disabled} onClick={start} aria-label="Gravar áudio">♩ Gravar áudio</button>:phase==='permission'?<p>Aguardando permissão do microfone…</p>:phase==='recording'?<div className="recording-controls"><span role="status">● Gravando · {seconds}s / 60s</span><button onClick={stop}>Parar gravação</button></div>:phase==='processing'?<p>Preparando áudio…</p>:<div className="audio-preview"><audio controls src={draft?.url} aria-label="Ouvir gravação antes de enviar"/><button disabled={phase==='sending'||disabled} onClick={send}>{phase==='sending'?'Enviando…':'Enviar áudio'}</button><button className="quiet" disabled={phase==='sending'} onClick={discard}>Descartar</button></div>}{error&&<p role="alert" className="audio-error">{error}</p>}</div>;
}
