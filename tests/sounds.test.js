import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMessageWatcher,createNotificationSound} from '../src/notificationSound.js';
test('message cursor ignores old, duplicate and deleted history without losing large IDs',()=>{
 const watcher=createMessageWatcher();assert.equal(watcher.observe('9007199254740993'),false);assert.equal(watcher.observe('9007199254740994'),true);assert.equal(watcher.observe('9007199254740994'),false);assert.equal(watcher.observe('0'),false);assert.equal(watcher.observe('9007199254740994'),false);assert.equal(watcher.observe('9007199254740995'),true);assert.equal(watcher.observe(undefined),false);watcher.reset();assert.equal(watcher.observe('9999999999999999'),false);
});
test('sound requires activation, supports distinct ringtone, and silencing stops playback',async()=>{
 let notes=0,stops=0,closed=false;
 const context={state:'suspended',currentTime:0,destination:{},async resume(){this.state='running';},async close(){closed=true;},createOscillator(){notes++;return {frequency:{},connect(){},disconnect(){},start(){},stop(){stops++;}};},createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}};
 const sound=createNotificationSound(()=>context);assert.equal(sound.play(),false);await sound.enable();assert.equal(notes,2);sound.play('ring');assert.equal(notes,6);sound.disable();assert.ok(stops>=12);assert.equal(sound.play('ring'),false);context.state='suspended';assert.equal(sound.play(),false);sound.close();assert.ok(closed);
});
test('unsupported sound gives a useful activation error',async()=>{await assert.rejects(createNotificationSound(()=>null).enable(),/não oferece/);});
