'use strict';
// UDIKA realtime pilot: built-in Node.js HTTP + WebSocket (RFC 6455 text frames).
// For commercial scale, move room and response state to PostgreSQL/Redis and load-test.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname,'data','rooms.json');
const publicDir = path.join(__dirname,'public');
const MAX_ROOMS = Number(process.env.MAX_ROOMS || 30);
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS || 300); // safety default for pilot; NOT a throughput guarantee
const MAX_BODY = 1_000_000;
const LOCK_TIME_MS = 120_000;
const questions = JSON.parse(fs.readFileSync(path.join(__dirname,'questions.json'),'utf8'));
const rooms = new Map();
const now = ()=>Date.now();
const token = () => crypto.randomBytes(24).toString('base64url');
const makePin = () => {let x; do {x=String(crypto.randomInt(100000,1000000))} while(rooms.has(x));return x;};
const clean = (s,n=48) => String(s||'').replace(/[<>\x00-\x1f]/g,'').trim().slice(0,n);
const safeQ = q => ({stage:Math.max(0,Math.min(4,Number(q.stage)||0)),q:clean(q.q,260),a:(Array.isArray(q.a)?q.a:[]).slice(0,4).map(v=>clean(v,160)),c:Number(q.c),t:Number(q.t)});
function normalizeBank(arr){
 if(!Array.isArray(arr)||!arr.length||arr.length>120)throw Error('Bộ đề cần từ 1 đến 120 câu');
 let a=arr.map(safeQ);
 if(a.some(q=>!q.q||q.a.length!==4||q.a.some(x=>!x)||!Number.isInteger(q.c)||q.c<0||q.c>3||!Number.isInteger(q.t)||q.t<5||q.t>120))throw Error('Câu hỏi/đáp án/thời gian không hợp lệ');
 return a;
}
function serialize(){return Array.from(rooms.values()).map(r=>({pin:r.pin,hostKey:r.hostKey,title:r.title,bank:r.bank,phase:r.phase,idx:r.idx,startedAt:r.startedAt,endedAt:r.endedAt,createdAt:r.createdAt,players:Array.from(r.players.values())}));}
let saveTimer;
function saveSoon(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{fs.mkdirSync(path.dirname(DATA_FILE),{recursive:true});fs.writeFileSync(DATA_FILE+'.tmp',JSON.stringify(serialize()));fs.renameSync(DATA_FILE+'.tmp',DATA_FILE);}catch(e){console.error('Persistence:',e.message)}},350);}
function load(){try{const list=JSON.parse(fs.readFileSync(DATA_FILE,'utf8'));for(const item of list){if(!item.pin||!item.hostKey)continue;const r={...item,bank:normalizeBank(item.bank),players:new Map((item.players||[]).map(p=>[p.id,p])),clients:new Set(),deadlineTimer:null};if(r.phase==='running'){r.phase='reveal';r.endedAt=now()}rooms.set(r.pin,r)}console.log('Restored',rooms.size,'rooms')}catch(e){if(e.code!=='ENOENT')console.warn('Cannot load:',e.message)}}
load();
function leader(r){return [...r.players.values()].sort((a,b)=>b.score-a.score||b.correct-a.correct||a.totalMs-b.totalMs||a.joinedAt-b.joinedAt).map((p,i)=>({rank:i+1,id:p.id,name:p.name,avatar:p.avatar,score:p.score,correct:p.correct,totalMs:p.totalMs}));}
function publicQuestion(r){if(r.phase==='idle'||r.phase==='ready')return null;const q=r.bank[r.idx];return {index:r.idx+1,total:r.bank.length,stage:q.stage,q:q.q,a:q.a,t:q.t,deadline:r.startedAt+q.t*1000,answer:r.phase==='reveal'||r.phase==='finished'?q.c:null};}
function publicState(r){return {pin:r.pin,title:r.title,phase:r.phase,idx:r.idx,count:r.players.size,q:publicQuestion(r),leaderboard:(r.phase==='reveal'||r.phase==='finished')?leader(r).slice(0,20):[],time:now(),isFinal:r.phase==='finished'};}
function playerState(r,id){const p=r.players.get(id);const pub=publicState(r);return {...pub,my:p?{id:p.id,name:p.name,avatar:p.avatar,score:p.score,correct:p.correct,answer:p.answers[r.idx]||null}:null};}
function hostState(r){return {...publicState(r),bank:r.bank,leaderboard:leader(r),players:[...r.players.values()].map(p=>({name:p.name,id:p.id,avatar:p.avatar,score:p.score,answered:!!p.answers[r.idx]}))};}
function send(ws,obj){if(ws.closed||!ws.socket.writable)return;try{let data=Buffer.from(JSON.stringify(obj));const h=Buffer.alloc(data.length<=125?2:data.length<=65535?4:10);h[0]=0x81;if(data.length<=125)h[1]=data.length;else if(data.length<=65535){h[1]=126;h.writeUInt16BE(data.length,2)}else{h[1]=127;h.writeBigUInt64BE(BigInt(data.length),2)}ws.socket.write(Buffer.concat([h,data]));}catch(e){ws.socket.destroy()}}
function broadcast(r){const s=publicState(r);for(const ws of r.clients){if(ws.role==='host')send(ws,{type:'state',...hostState(r)});else if(ws.role==='watch')send(ws,{type:'state',...publicState(r)});else send(ws,{type:'state',...playerState(r,ws.playerId)})}saveSoon();}
function closeRound(r){if(r.phase!=='running')return;r.phase='reveal';r.endedAt=now();clearTimeout(r.deadlineTimer);r.deadlineTimer=null;broadcast(r);}
function err(ws,e){send(ws,{type:'error',message:String(e.message||e)});}
function authHost(ws,msg){const r=rooms.get(String(msg.pin||''));if(!r||!timingEq(r.hostKey,String(msg.hostKey||'')))throw Error('Mã phòng hoặc khóa MC không đúng');if(ws.room)ws.room.clients.delete(ws);ws.role='host';ws.room=r;ws.playerId=null;r.clients.add(ws);send(ws,{type:'host_ok',pin:r.pin,hostKey:r.hostKey});broadcast(r)}
function timingEq(a,b){let x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&crypto.timingSafeEqual(x,y)}
function onMessage(ws,msg){
 if(!msg||typeof msg!=='object')throw Error('Yêu cầu không hợp lệ');
 const type=msg.type;
 if(type==='create'){
   if(rooms.size>=MAX_ROOMS)throw Error('Đã đạt giới hạn phòng của bản thử nghiệm');
   const pin=makePin(),hostKey=token(),title=clean(msg.title,80)||'Khoa thi Trạng Nguyên';
   let r={pin,hostKey,title,bank:normalizeBank(questions),phase:'idle',idx:0,startedAt:0,endedAt:0,createdAt:now(),players:new Map(),clients:new Set(),deadlineTimer:null};rooms.set(pin,r);ws.role='host';ws.room=r;r.clients.add(ws);send(ws,{type:'created',pin,hostKey});broadcast(r);return;
 }
 if(type==='host_auth'){authHost(ws,msg);return}
 if(type==='join'){
   let r=rooms.get(String(msg.pin||''));if(!r)throw Error('Không tìm thấy phòng thi');
   let id=String(msg.playerId||'').slice(0,96);let p=id?r.players.get(id):null;
   if(!p){if(r.players.size>=MAX_PLAYERS)throw Error('Phòng thử nghiệm đã đạt giới hạn người chơi');if(!clean(msg.name,28))throw Error('Vui lòng nhập tên sĩ tử');id=token();p={id,name:clean(msg.name,28),avatar:clean(msg.avatar,6)||'📜',score:0,correct:0,totalMs:0,joinedAt:now(),answers:{}};r.players.set(id,p)}
   if(ws.room)ws.room.clients.delete(ws);ws.room=r;ws.role='player';ws.playerId=id;r.clients.add(ws);send(ws,{type:'joined',pin:r.pin,playerId:id});broadcast(r);return;
 }
 if(type==='watch'){let r=rooms.get(String(msg.pin||''));if(!r)throw Error('Không tìm thấy phòng thi');if(ws.room)ws.room.clients.delete(ws);ws.room=r;ws.role='watch';ws.playerId=null;r.clients.add(ws);send(ws,{type:'watch_ok',pin:r.pin});send(ws,{type:'state',...publicState(r)});return}
 if(type==='ping'){send(ws,{type:'pong',at:now()});return}
 if(!ws.room)throw Error('Bạn chưa tham gia phòng');
 const r=ws.room;
 if(type==='answer'){
   if(ws.role!=='player'||r.phase!=='running')return;
   const p=r.players.get(ws.playerId),q=r.bank[r.idx]; if(!p||p.answers[r.idx])return;
   const c=Number(msg.choice);if(!Number.isInteger(c)||c<0||c>3)throw Error('Đáp án không hợp lệ');
   const ms=now()-r.startedAt;if(ms<0||ms>q.t*1000)return;
   const correct=c===q.c;
   const points=correct?Math.max(300,Math.round(1000*(.3+.7*(1-ms/(q.t*1000))))):0;
   p.answers[r.idx]={choice:c,ms,points,correct};p.score+=points;if(correct){p.correct++;p.totalMs+=ms}
   send(ws,{type:'answered',answer:p.answers[r.idx]});broadcast(r);return;
 }
 if(ws.role!=='host')throw Error('Chỉ MC được điều khiển kỳ thi');
 if(type==='bank_set'){
   if(r.phase==='running')throw Error('Không sửa đề khi câu hỏi đang diễn ra');
   r.bank=normalizeBank(msg.bank);r.idx=0;r.phase='idle';r.startedAt=0;r.endedAt=0;
   for(const p of r.players.values()){p.score=0;p.correct=0;p.totalMs=0;p.answers={}}
 }else if(type==='start'){
   if(r.phase==='running')throw Error('Câu hỏi đang diễn ra');if(r.phase==='finished')throw Error('Hãy tạo lại khoa thi mới');
   r.phase='running';r.startedAt=now();r.endedAt=0;const q=r.bank[r.idx];
   clearTimeout(r.deadlineTimer);r.deadlineTimer=setTimeout(()=>closeRound(r),q.t*1000+15);
 }else if(type==='reveal')closeRound(r);
 else if(type==='next'){
   if(r.phase!=='reveal')throw Error('Hãy công bố kết quả trước khi sang câu tiếp');
   if(r.idx===r.bank.length-1)r.phase='finished';else {r.idx++;r.phase='ready';r.startedAt=0}
 }else if(type==='reset'){
   clearTimeout(r.deadlineTimer);r.idx=0;r.phase='idle';r.startedAt=0;r.endedAt=0;
   for(const p of r.players.values()){p.score=0;p.correct=0;p.totalMs=0;p.answers={}}
 }else if(type==='set_title'){r.title=clean(msg.title,80)||r.title}
 else throw Error('Lệnh không hỗ trợ');
 broadcast(r);
}
const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
const routes={'/':'index.html','/join':'player.html','/host':'host.html','/led':'led.html'};
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');if(u.pathname==='/health'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,rooms:rooms.size}));return}
 if(req.method!=='GET'){res.writeHead(405);res.end('Method not allowed');return}
 const name=routes[u.pathname]||u.pathname.replace(/^\//,'');const file=path.resolve(publicDir,name);
 if(!file.startsWith(publicDir+path.sep)){res.writeHead(403);res.end('Forbidden');return}
 fs.readFile(file,(e,data)=>{if(e){res.writeHead(404);res.end('Not found');return}res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(data)})
});
// WebSocket implementation for pilot; no external packages required on Render.
server.on('upgrade',(req,socket,head)=>{
 try{
  const u=new URL(req.url,'http://localhost');if(u.pathname!=='/ws')return socket.destroy();
  if(String(req.headers.upgrade||'').toLowerCase()!=='websocket'||!req.headers['sec-websocket-key'])return socket.destroy();
  const key=crypto.createHash('sha1').update(req.headers['sec-websocket-key']+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+key+'\r\n\r\n');
  const ws={socket,closed:false,buffer:Buffer.alloc(0),role:null,room:null,playerId:null};
  function cleanup(){if(ws.closed)return;ws.closed=true;if(ws.room)ws.room.clients.delete(ws)}
  socket.on('close',cleanup);socket.on('error',cleanup);
  function processPacket(){
   for(;;){const b=ws.buffer;if(b.length<2)return;const opcode=b[0]&15;const fin=!!(b[0]&128);let len=b[1]&127,ofs=2;if(len===126){if(b.length<4)return;len=b.readUInt16BE(2);ofs=4}else if(len===127){if(b.length<10)return;const n=b.readBigUInt64BE(2);if(n>BigInt(MAX_BODY))return socket.destroy();len=Number(n);ofs=10}if(len>MAX_BODY)return socket.destroy();if(!(b[1]&128))return socket.destroy();if(b.length<ofs+4+len)return;const mask=b.subarray(ofs,ofs+4),data=Buffer.from(b.subarray(ofs+4,ofs+4+len));for(let i=0;i<data.length;i++)data[i]^=mask[i&3];ws.buffer=b.subarray(ofs+4+len);
    if(!fin){socket.destroy();return}if(opcode===8){socket.end();return}if(opcode===9){socket.write(Buffer.from([0x8A,0x00]));continue}if(opcode!==1)continue;let msg;try{msg=JSON.parse(data.toString('utf8'))}catch{err(ws,'Dữ liệu không hợp lệ');continue}try{onMessage(ws,msg)}catch(e){err(ws,e)}
   }
  }
  socket.on('data',chunk=>{ws.buffer=Buffer.concat([ws.buffer,chunk]);if(ws.buffer.length>MAX_BODY+100)socket.destroy();else processPacket()});if(head.length){ws.buffer=head;processPacket()}
 }catch(e){socket.destroy()}
});
server.listen(PORT,HOST,()=>console.log(`UDIKA Khoa Bang realtime ready on port ${PORT}. Pilot max ${MAX_PLAYERS} players per room.`));
process.on('SIGTERM',()=>{clearTimeout(saveTimer);try{fs.mkdirSync(path.dirname(DATA_FILE),{recursive:true});fs.writeFileSync(DATA_FILE,JSON.stringify(serialize()))}catch{}server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),5000)});
