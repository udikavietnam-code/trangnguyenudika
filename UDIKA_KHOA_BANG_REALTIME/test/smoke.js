'use strict';
const {spawn}=require('node:child_process');const assert=require('node:assert/strict');
const port=33321;const server=spawn(process.execPath,['server.js'],{cwd:require('node:path').resolve(__dirname,'..'),env:{...process.env,PORT:String(port),DATA_FILE:'/tmp/udika_smoke_'+Date.now()+'.json',MAX_PLAYERS:'10'},stdio:['ignore','pipe','pipe']});
const wait=t=>new Promise(r=>setTimeout(r,t));
const deadline=(p,ms=5000)=>Promise.race([p,new Promise((_,reject)=>setTimeout(()=>reject(Error('timeout')),ms))]);
function client(){return new Promise((resolve,reject)=>{const ws=new WebSocket('ws://127.0.0.1:'+port+'/ws');const messages=[];const waiters=[];ws.onmessage=e=>{const m=JSON.parse(e.data);messages.push(m);for(let i=waiters.length-1;i>=0;i--)if(waiters[i].pred(m)){waiters[i].resolve(m);waiters.splice(i,1)}};ws.onopen=()=>resolve({ws,messages,send:x=>ws.send(JSON.stringify(x)),until:pred=>{const a=messages.find(pred);if(a)return Promise.resolve(a);return new Promise(res=>waiters.push({pred,resolve:res}))}});ws.onerror=reject})}
async function main(){try{await wait(600);const h=await client();h.send({type:'create',title:'Thử nghiệm'});const made=await deadline(h.until(m=>m.type==='created'));assert.match(made.pin,/^\d{6}$/);const pin=made.pin;
const p1=await client();p1.send({type:'join',pin,name:'An',avatar:'📜'});const j1=await deadline(p1.until(m=>m.type==='joined'));
const p2=await client();p2.send({type:'join',pin,name:'Bình',avatar:'📜'});await deadline(p2.until(m=>m.type==='joined'));
const led=await client();led.send({type:'watch',pin});await deadline(led.until(m=>m.type==='watch_ok'));
h.send({type:'start'});await deadline(h.until(m=>m.type==='state'&&m.phase==='running'));
const q=await deadline(p1.until(m=>m.type==='state'&&m.phase==='running'));
assert.equal(q.q.answer,null,'Answer should be hidden before reveal');
// First question answer is option A.
p1.send({type:'answer',choice:0});await deadline(p1.until(m=>m.type==='answered'));
p2.send({type:'answer',choice:2});await deadline(p2.until(m=>m.type==='answered'));
h.send({type:'reveal'});
const s=await deadline(led.until(m=>m.type==='state'&&m.phase==='reveal'));
assert.equal(s.leaderboard[0].name,'An');assert.equal(s.leaderboard[0].correct,1);assert.equal(s.leaderboard.length,2);
h.send({type:'next'});const ready=await deadline(p2.until(m=>m.type==='state'&&m.phase==='ready'));
assert.equal(ready.idx,1);assert.equal(ready.q,null);
console.log('PASS: create / join / watch / host control / scoring / reveal / next / private answers');
for(const c of [h,p1,p2,led])c.ws.close();
}catch(e){console.error('FAIL',e);process.exitCode=1}finally{server.kill('SIGTERM')}}
main();
