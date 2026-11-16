'use strict';
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const port=18761, dir=fs.mkdtempSync(path.join(os.tmpdir(),'udika-prod-'));
const app=spawn(process.execPath,['server.js'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,PORT:String(port),ADMIN_PASSWORD:'test-admin-password-strong',SESSION_SECRET:'test-session-secret-must-be-long-enough',DATA_FILE:path.join(dir,'rooms.json')}});
let output='';app.stdout.on('data',x=>output+=x);app.stderr.on('data',x=>output+=x);
const url='http://127.0.0.1:'+port;
async function wait(){for(let i=0;i<80;i++){try{const r=await fetch(url+'/health');if(r.ok)return}catch{}await new Promise(r=>setTimeout(r,100))}throw Error('Failed start: '+output)}
(async()=>{try{await wait();assert.equal((await fetch(url+'/api/rooms')).status,403);const login=await fetch(url+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({role:'admin',password:'test-admin-password-strong'})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];const create=await fetch(url+'/api/rooms',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({title:'UDIKA Test',mcUser:'mc-test',password:'password-mc-123'})});assert.equal(create.status,201);const room=await create.json();assert.match(room.pin,/^\d{6}$/);const list=await fetch(url+'/api/rooms',{headers:{Cookie:cookie}});assert.equal((await list.json()).rooms.length,1);console.log('PASS: Admin login, room creation and role-based access')}finally{app.kill('SIGTERM');fs.rmSync(dir,{force:true,recursive:true})}})().catch(e=>{console.error(e);process.exitCode=1});
