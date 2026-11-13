export function createNotificationSound(contextFactory=()=>{const Audio=window.AudioContext||window.webkitAudioContext;return Audio?new Audio():null;}){
 let context=null,enabled=false;const playing=new Set();
 function stop(){for(const oscillator of playing){try{oscillator.stop();}catch{}oscillator.disconnect();}playing.clear();}
 function play(kind='message'){
 if(!enabled||context?.state!=='running')return false;
 const notes=kind==='ring'?[660,880,660,880]:[740,990];
 notes.forEach((frequency,i)=>{const oscillator=context.createOscillator(),gain=context.createGain(),start=context.currentTime+i*.19;
 oscillator.type='sine';oscillator.frequency.value=frequency;gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.10,start+.02);gain.gain.exponentialRampToValueAtTime(.001,start+.16);
 oscillator.connect(gain);gain.connect(context.destination);playing.add(oscillator);oscillator.onended=()=>{playing.delete(oscillator);oscillator.disconnect();gain.disconnect();};oscillator.start(start);oscillator.stop(start+.18);
 });return true;
 }
 return {async enable(){context??=contextFactory();if(!context)throw new Error('Este navegador não oferece avisos sonoros.');await context.resume();if(context.state!=='running')throw new Error('Toque novamente em Ativar som para permitir os avisos.');enabled=true;play();},disable(){enabled=false;stop();},play,stop,close(){enabled=false;stop();context?.close().catch(()=>{});}};
}
// A single cursor covers incoming group and private messages, even when another chat is selected.
export function createMessageWatcher(){let highest=null;return {reset(){highest=null;},observe(value){if(typeof value!=='string'||!/^\d+$/.test(value))return false;const next=BigInt(value);if(highest===null){highest=next;return false;}if(next>highest){highest=next;return true;}return false;}};}
