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
const REQUIRE_DATABASE = process.env.REQUIRE_DATABASE === 'true';
if (REQUIRE_DATABASE && !process.env.DATABASE_URL) {
 console.error('DATABASE_URL is required when REQUIRE_DATABASE=true. No temporary-file fallback allowed.');
 process.exit(1);
}
const publicDir = path.join(__dirname,'public');
const MAX_ROOMS = Number(process.env.MAX_ROOMS || 30);
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS || 300); // safety default for pilot; NOT a throughput guarantee
const MAX_BODY = 1_000_000;
const LOCK_TIME_MS = 120_000;
const ADMIN_PASSWORD=process.env.ADMIN_PASSWORD||'';
const SESSION_SECRET=process.env.SESSION_SECRET||'';
if(!ADMIN_PASSWORD || !SESSION_SECRET || ADMIN_PASSWORD.length<12 || SESSION_SECRET.length<24){
 console.error('CẦN THIẾT LẬP ADMIN_PASSWORD (>=12 ký tự) và SESSION_SECRET (>=24 ký tự) trong Render Environment.');
 process.exit(1);
}
const passwordHash=(password,salt)=>crypto.scryptSync(String(password),salt,64).toString('hex');
function passwordRecord(password){let salt=crypto.randomBytes(16).toString('hex');return {salt,hash:passwordHash(password,salt)}}
function verifyPassword(rec,password){if(!rec||!rec.hash||!rec.salt)return false;try{let a=Buffer.from(passwordHash(password,rec.salt),'hex'),b=Buffer.from(rec.hash,'hex');return a.length===b.length&&crypto.timingSafeEqual(a,b)}catch{return false}}
function makeSession(payload){let data=Buffer.from(JSON.stringify({...payload,exp:Date.now()+12*3600*1000})).toString('base64url');let sig=crypto.createHmac('sha256',SESSION_SECRET).update(data).digest('base64url');return data+'.'+sig}
function verifySession(t){try{let [d,sig]=String(t||'').split('.');if(!d||!sig)return null;let expected=crypto.createHmac('sha256',SESSION_SECRET).update(d).digest('base64url');if(!timingEq(expected,sig))return null;let user=JSON.parse(Buffer.from(d,'base64url'));return user.exp>Date.now()?user:null}catch{return null}}
function getCookie(req,name){let c=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='));return c?decodeURIComponent(c.split('=').slice(1).join('=')):''}
function authRequest(req){return verifySession(getCookie(req,'udika_session'))}
const accessLog=[];
function audit(actor,action,room){accessLog.push({at:Date.now(),actor,action,room});if(accessLog.length>300)accessLog.shift()}

const STAGE_NAMES=['Lớp thầy đồ','Khảo hạch','Thi Hương','Thi Hội','Thi Đình'];
const STAGE_WISHES=['Thầy đồ và gia đình rất tự hào về sự hiếu học của bạn!','Họ hàng, làng xóm đều vui mừng khi bạn vượt qua kỳ khảo hạch!','Tiếng lành đỗ đạt lan khắp quê nhà, gia tộc hân hoan đón tin vui!','Cả họ tộc tự hào, chờ ngày bạn bước vào điện vua!','Khoa thi đã khép lại, quan trường chuẩn bị xướng danh Tam khôi!'];
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
function serialize(){return Array.from(rooms.values()).map(r=>({pin:r.pin,hostKey:r.hostKey,title:r.title,bank:r.bank,phase:r.phase,idx:r.idx,startedAt:r.startedAt,endedAt:r.endedAt,createdAt:r.createdAt,completedStage:r.completedStage??null,mcUser:r.mcUser||'',mcPassword:r.mcPassword||null,mcVersion:r.mcVersion||'',players:Array.from(r.players.values())}));}
let saveTimer;
const db=process.env.DATABASE_URL?new (require('pg').Pool)({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==='require'?{rejectUnauthorized:false}:undefined,max:4}):null;
let saving=Promise.resolve();
let persistenceLastError = null;
let persistenceLastSavedAt = null;
let persistenceReady = false;
async function persistNow(){const payload=serialize();if(db){saving=saving.then(()=>db.query('INSERT INTO udika_snapshot (id,payload,updated_at) VALUES (1,$1,NOW()) ON CONFLICT (id) DO UPDATE SET payload=$1,updated_at=NOW()', [JSON.stringify(payload)])).then(()=>{persistenceLastError=null;persistenceLastSavedAt=Date.now()}).catch(e=>{persistenceLastError=String(e.message||e);console.error('DATABASE SAVE FAILED:',e.message)});await saving;return}
 try{fs.mkdirSync(path.dirname(DATA_FILE),{recursive:true});fs.writeFileSync(DATA_FILE+'.tmp',JSON.stringify(payload));fs.renameSync(DATA_FILE+'.tmp',DATA_FILE)}catch(e){console.error('FILE SAVE FAILED:',e.message)} }
function saveSoon(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>persistNow().catch(e=>console.error('SAVE:',e.message)),150)}
function restore(list){for(const item of list){if(!item.pin||!item.hostKey)continue;const r={...item,mcUser:item.mcUser||'',mcPassword:item.mcPassword||null,mcVersion:item.mcVersion||'',bank:normalizeBank(item.bank),players:new Map((item.players||[]).map(p=>[p.id,p])),clients:new Set(),deadlineTimer:null};if(r.phase==='running'){r.phase='reveal';r.endedAt=now()}rooms.set(r.pin,r)}console.log('Restored',rooms.size,'rooms')}
async function load(){if(db){await db.query('CREATE TABLE IF NOT EXISTS udika_snapshot (id INTEGER PRIMARY KEY, payload JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');let {rows}=await db.query('SELECT payload FROM udika_snapshot WHERE id=1');if(rows.length)restore(rows[0].payload);persistenceReady=true;console.log('PostgreSQL persistence active');return}
 try{restore(JSON.parse(fs.readFileSync(DATA_FILE,'utf8')))}catch(e){if(e.code!=='ENOENT')console.warn('Cannot load:',e.message)}persistenceReady=true;console.warn('WARNING: local file persistence only; Render Free filesystem is ephemeral!')}

function leader(r){return [...r.players.values()].sort((a,b)=>b.score-a.score||b.correct-a.correct||a.totalMs-b.totalMs||a.joinedAt-b.joinedAt).map((p,i)=>({rank:i+1,id:p.id,name:p.name,avatar:p.avatar,score:p.score,correct:p.correct,totalMs:p.totalMs}));}
function publicQuestion(r){if(r.phase==='idle'||r.phase==='ready'||r.phase==='intermission')return null;const q=r.bank[r.idx];return {index:r.idx+1,total:r.bank.length,stage:q.stage,q:q.q,a:q.a,t:q.t,deadline:r.startedAt+q.t*1000,answer:r.phase==='reveal'||r.phase==='finished'?q.c:null};}
function publicState(r){const ranks=leader(r);const safeRanks=ranks.map(({id,...p})=>p);const done=r.phase==='finished';return {pin:r.pin,title:r.title,phase:r.phase,idx:r.idx,count:r.players.size,candidates:[...r.players.values()].slice(0,60).map(p=>({name:p.name,avatar:p.avatar})),q:publicQuestion(r),leaderboard:(['reveal','intermission','finished'].includes(r.phase))?safeRanks.slice(0,20):[],honors:done?safeRanks.slice(0,3).map((p,i)=>({...p,title:['Trạng nguyên','Bảng nhãn','Thám hoa'][i]})):[],time:now(),isFinal:done,completedStage:r.phase==='intermission'?r.completedStage:null,stageWish:r.phase==='intermission'?STAGE_WISHES[r.completedStage]||'Chúc mừng đã hoàn thành chặng thi!':null,stageLeaders:r.phase==='intermission'?safeRanks.slice(0,5):[]};}
function myState(r,id,finalRanks){const p=r.players.get(id);if(!p)return null;let stage=null;if(r.phase==='intermission'&&r.completedStage!=null){let ix=r.bank.map((q,i)=>q.stage===r.completedStage?i:null).filter(x=>x!==null),n=ix.filter(i=>p.answers[i]?.correct).length;stage={stage:r.completedStage,correct:n,total:ix.length,passed:n>=Math.ceil(ix.length/2)}}return {id:p.id,name:p.name,avatar:p.avatar,score:p.score,correct:p.correct,answer:p.answers[r.idx]||null,passedStage:stage,finalRank:r.phase==='finished'?finalRanks.find(h=>h.id===id)?.rank||null:null}}
function playerState(r,id){const pub=publicState(r);return {...pub,my:myState(r,id,r.phase==='finished'?leader(r):[])}}
function hostState(r){return {...publicState(r),bank:r.bank,leaderboard:leader(r),players:[...r.players.values()].map(p=>({name:p.name,id:p.id,avatar:p.avatar,score:p.score,answered:!!p.answers[r.idx]}))};}
function send(ws,obj){if(ws.closed||!ws.socket.writable)return;try{let data=Buffer.from(JSON.stringify(obj));const h=Buffer.alloc(data.length<=125?2:data.length<=65535?4:10);h[0]=0x81;if(data.length<=125)h[1]=data.length;else if(data.length<=65535){h[1]=126;h.writeUInt16BE(data.length,2)}else{h[1]=127;h.writeBigUInt64BE(BigInt(data.length),2)}ws.socket.write(Buffer.concat([h,data]));}catch(e){ws.socket.destroy()}}
function broadcast(r){const pub=publicState(r),host=r.clients.size?hostState(r):null,finalRanks=r.phase==='finished'?leader(r):[];for(const ws of r.clients){if(ws.role==='host')send(ws,{type:'state',...host});else if(ws.role==='watch')send(ws,{type:'state',...pub});else send(ws,{type:'state',...pub,my:myState(r,ws.playerId,finalRanks)})}saveSoon();}
function broadcastPresenceSoon(r){clearTimeout(r.presenceTimer);r.presenceTimer=setTimeout(()=>broadcast(r),250)}
// V4: after revealing the last question in a stage, open the celebration immediately.
// This is a server-side state change; LED, host and every player see the same result.
function ceremonyPhase(r){
 const last=r.idx===r.bank.length-1;
 const stageEnded=last||r.bank[r.idx+1].stage!==r.bank[r.idx].stage;
 if(last){r.phase='finished';r.completedStage=r.bank[r.idx].stage;}
 else if(stageEnded){r.phase='intermission';r.completedStage=r.bank[r.idx].stage;}
 else r.phase='reveal';
}
function closeRound(r){
 if(!['running','reveal'].includes(r.phase))return;
 if(r.phase==='running'){r.endedAt=now();clearTimeout(r.deadlineTimer);r.deadlineTimer=null;}
 ceremonyPhase(r);broadcast(r);
}
function timeoutRound(r){if(r.phase!=='running')return;r.phase='reveal';r.endedAt=now();clearTimeout(r.deadlineTimer);r.deadlineTimer=null;broadcast(r)}
function err(ws,e){send(ws,{type:'error',message:String(e.message||e)});}
function authHost(ws,msg){const r=rooms.get(String(msg.pin||''));if(!r||!ws.session||!(ws.session.role==='admin'||(ws.session.role==='mc'&&ws.session.pin===r.pin&&ws.session.user===r.mcUser&&ws.session.mcVersion===r.mcVersion)))throw Error('MC chưa đăng nhập hoặc không có quyền điều khiển phòng');if(ws.room)ws.room.clients.delete(ws);ws.role='host';ws.room=r;ws.playerId=null;r.clients.add(ws);send(ws,{type:'host_ok',pin:r.pin});broadcast(r)}
function timingEq(a,b){let x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&crypto.timingSafeEqual(x,y)}
function onMessage(ws,msg){
 if(!msg||typeof msg!=='object')throw Error('Yêu cầu không hợp lệ');
 const type=msg.type;
 if(type==='create')throw Error('Chỉ Admin mới được tạo phòng. Vui lòng vào /admin');
 if(type==='host_auth'){authHost(ws,msg);return}
 if(type==='join'){
   let r=rooms.get(String(msg.pin||''));if(!r)throw Error('Không tìm thấy phòng thi');
   let id=String(msg.playerId||'').slice(0,96);let p=id?r.players.get(id):null;
   if(!p){if(r.phase==='finished')throw Error('Khoa thi đã kết thúc, không nhận ghi danh mới');if(r.players.size>=MAX_PLAYERS)throw Error('Phòng thử nghiệm đã đạt giới hạn người chơi');if(!clean(msg.name,28))throw Error('Vui lòng nhập tên sĩ tử');id=token();p={id,name:clean(msg.name,28),avatar:clean(msg.avatar,6)||'📜',score:0,correct:0,totalMs:0,joinedAt:now(),answers:{}};r.players.set(id,p)}
   if(ws.room)ws.room.clients.delete(ws);for(const other of r.clients){if(other.role==='player'&&other.playerId===id&&other!==ws){send(other,{type:'error',message:'Tài khoản đã được khôi phục trên thiết bị khác'});other.socket.end()}}ws.room=r;ws.role='player';ws.playerId=id;r.clients.add(ws);send(ws,{type:'joined',pin:r.pin,playerId:id});send(ws,{type:'state',...playerState(r,id)});broadcastPresenceSoon(r);return;
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
   send(ws,{type:'answered',answer:p.answers[r.idx]});broadcastPresenceSoon(r);return;
 }
 if(ws.role!=='host'||!ws.session||(ws.session.role!=='admin'&&!(ws.session.role==='mc'&&ws.session.pin===r.pin&&ws.session.user===r.mcUser&&ws.session.mcVersion===r.mcVersion)))throw Error('Bạn không có quyền điều khiển kỳ thi này');
 if(type==='bank_set'){
   if(r.phase==='running')throw Error('Không sửa đề khi câu hỏi đang diễn ra');
   r.bank=normalizeBank(msg.bank);r.idx=0;r.phase='idle';r.startedAt=0;r.endedAt=0;
   for(const p of r.players.values()){p.score=0;p.correct=0;p.totalMs=0;p.answers={}}
 }else if(type==='start'){
   if(!['idle','ready'].includes(r.phase))throw Error('Trước tiên hãy chuyển chặng bằng nút TIẾP TỤC trên màn MC');
   r.phase='running';r.startedAt=now();r.endedAt=0;const q=r.bank[r.idx];
   clearTimeout(r.deadlineTimer);r.deadlineTimer=setTimeout(()=>timeoutRound(r),q.t*1000+15);
 }else if(type==='reveal')closeRound(r);
 else if(type==='next'){
   if(!['reveal','intermission'].includes(r.phase))throw Error('Hãy công bố đáp án hoặc kết thúc chặng thi trước khi sang câu tiếp');
   if(r.idx>=r.bank.length-1)throw Error('Khoa thi đã kết thúc và được phong danh');
   r.idx++;r.phase='ready';r.startedAt=0;r.endedAt=0;
 }else if(type==='reset'){
   clearTimeout(r.deadlineTimer);r.idx=0;r.phase='idle';r.startedAt=0;r.endedAt=0;
   for(const p of r.players.values()){p.score=0;p.correct=0;p.totalMs=0;p.answers={}}
 }else if(type==='set_title'){r.title=clean(msg.title,80)||r.title}
 else throw Error('Lệnh không hỗ trợ');
 audit(ws.session.user,type,r.pin);broadcast(r);
}
const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
const routes={'/':'index.html','/join':'player.html','/host':'host.html','/led':'led.html','/admin':'admin.html'};
function sendJson(res,status,obj,cookie){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(cookie?{'Set-Cookie':cookie}:{})});res.end(JSON.stringify(obj))}
function jsonBody(req){return new Promise((resolve,reject)=>{let chunks=[],size=0;req.on('data',b=>{size+=b.length;if(size>MAX_BODY){reject(Error('Dữ liệu quá lớn'));req.destroy()}else chunks.push(b)});req.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))}catch{reject(Error('JSON không hợp lệ'))}});req.on('error',reject)})}
const loginAttempts=new Map();
function limited(ip){let x=loginAttempts.get(ip)||{time:Date.now(),count:0};if(Date.now()-x.time>60000)x={time:Date.now(),count:0};x.count++;loginAttempts.set(ip,x);return x.count>12}
async function api(req,res,u){
 try{
  const ip=String(req.socket.remoteAddress||'');
  const origin=req.headers.origin;
  if(req.method!=='GET'&&origin){const host=new URL(origin).host;if(host!==req.headers.host)return sendJson(res,403,{error:'Origin không hợp lệ'})}
  const user=authRequest(req),parts=u.pathname.split('/').filter(Boolean);
  if(u.pathname==='/api/session'&&req.method==='GET')return sendJson(res,200,{user:user?{role:user.role,pin:user.pin||'',name:user.user}:null});
  if(u.pathname==='/api/login'&&req.method==='POST'){
   if(limited(ip))return sendJson(res,429,{error:'Quá nhiều lần đăng nhập. Hãy thử lại sau.'});
   let b=await jsonBody(req),session=null;
   if(b.role==='admin'&&typeof b.password==='string'&&timingEq(crypto.createHash('sha256').update(b.password).digest('hex'),crypto.createHash('sha256').update(ADMIN_PASSWORD).digest('hex')))session={role:'admin',user:'Admin UDIKA'};
   if(b.role==='mc'){let r=rooms.get(String(b.pin||''));if(r&&r.mcUser===String(b.user||'')&&verifyPassword(r.mcPassword,b.password))session={role:'mc',user:r.mcUser,pin:r.pin,mcVersion:r.mcVersion}}
   if(!session)return sendJson(res,401,{error:'Tên đăng nhập hoặc mật khẩu không đúng'});
   audit(session.user,'login',session.pin||'all');
   const cookie='udika_session='+encodeURIComponent(makeSession(session))+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200'+(req.socket.encrypted||req.headers['x-forwarded-proto']==='https'?'; Secure':'');
   return sendJson(res,200,{ok:true,role:session.role,pin:session.pin||''},cookie);
  }
  if(u.pathname==='/api/logout'&&req.method==='POST')return sendJson(res,200,{ok:true},'udika_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict');
  if(u.pathname==='/api/rooms'&&req.method==='GET'){
    if(!user||user.role!=='admin')return sendJson(res,403,{error:'Chỉ Admin có quyền'});
    return sendJson(res,200,{rooms:[...rooms.values()].map(r=>({pin:r.pin,title:r.title,mcUser:r.mcUser||'',count:r.players.size,phase:r.phase,idx:r.idx,createdAt:r.createdAt}))});
  }
  if(u.pathname==='/api/rooms'&&req.method==='POST'){
    if(!user||user.role!=='admin')return sendJson(res,403,{error:'Chỉ Admin có quyền'});
    if(rooms.size>=MAX_ROOMS)return sendJson(res,409,{error:'Đã đạt giới hạn phòng của bản thử nghiệm'});
    let b=await jsonBody(req),title=clean(b.title,80),mcUser=clean(b.mcUser,40),password=String(b.password||'');
    if(!title||!mcUser||password.length<10)return sendJson(res,400,{error:'Cần tên sự kiện, tên MC và mật khẩu MC tối thiểu 10 ký tự'});
    let pin=makePin(),r={pin,hostKey:token(),title,mcUser,mcPassword:passwordRecord(password),mcVersion:token(),bank:normalizeBank(questions),phase:'idle',idx:0,startedAt:0,endedAt:0,createdAt:Date.now(),players:new Map(),clients:new Set(),deadlineTimer:null};
    rooms.set(pin,r);saveSoon();audit(user.user,'room_created',pin);return sendJson(res,201,{pin,title,mcUser});
  }
  if(parts.length===4&&parts[0]==='api'&&parts[1]==='rooms'&&parts[3]==='mc'&&req.method==='PATCH'){
    if(!user||user.role!=='admin')return sendJson(res,403,{error:'Chỉ Admin có quyền'});
    let r=rooms.get(parts[2]);if(!r)return sendJson(res,404,{error:'Không thấy phòng'});
    let b=await jsonBody(req),mcUser=clean(b.mcUser,40),password=String(b.password||'');if(!mcUser||password.length<10)return sendJson(res,400,{error:'Tên MC hoặc mật khẩu không hợp lệ'});
    r.mcUser=mcUser;r.mcPassword=passwordRecord(password);r.mcVersion=token();for(const ws of r.clients){if(ws.role==='host'&&ws.session?.role!=='admin'){send(ws,{type:'error',message:'Quyền MC đã thay đổi. Vui lòng đăng nhập lại.'});r.clients.delete(ws);ws.role=null;ws.room=null}}
    audit(user.user,'mc_changed',r.pin);saveSoon();return sendJson(res,200,{ok:true});
  }
  if(parts.length===4&&parts[0]==='api'&&parts[1]==='rooms'&&parts[3]==='export'&&req.method==='GET'){
    if(!user||user.role!=='admin')return sendJson(res,403,{error:'Chỉ Admin có quyền'});
    let r=rooms.get(parts[2]);if(!r)return sendJson(res,404,{error:'Không thấy phòng'});
    let rows=leader(r);res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="udika-${r.pin}.csv"`,'Cache-Control':'no-store'});
    let csv=['STT,Họ tên,Điểm,Câu đúng,Tổng thời gian (ms)'].concat(rows.map((p,i)=>[i+1,p.name,p.score,p.correct,p.totalMs].map(x=>'"'+String(x).replaceAll('"','""')+'"').join(','))).join('\r\n');res.end('\ufeff'+csv);return;
  }
  if(u.pathname==='/api/audit'&&req.method==='GET'){
    if(!user||user.role!=='admin')return sendJson(res,403,{error:'Chỉ Admin có quyền'});
    return sendJson(res,200,{events:accessLog.slice(-100).reverse()});
  }
  return sendJson(res,404,{error:'Không có chức năng này'});
 }catch(e){sendJson(res,400,{error:e.message||'Yêu cầu lỗi'})}
}
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');if(u.pathname.startsWith('/api/'))return api(req,res,u);if(u.pathname==='/health'){const healthy=persistenceReady&&!persistenceLastError;res.writeHead(healthy?200:503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({ok:healthy,rooms:rooms.size,persistence:{mode:db?'postgresql':'temporary-file',required:REQUIRE_DATABASE,ready:persistenceReady,lastSavedAt:persistenceLastSavedAt,error:persistenceLastError?'Database save failed (check server logs)':null}}));return}
 if(req.method!=='GET'){res.writeHead(405);res.end('Method not allowed');return}
 const name=routes[u.pathname]||u.pathname.replace(/^\//,'');const file=path.resolve(publicDir,name);
 if(!file.startsWith(publicDir+path.sep)){res.writeHead(403);res.end('Forbidden');return}
 fs.readFile(file,(e,data)=>{if(e){res.writeHead(404);res.end('Not found');return}res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(data)})
});
// WebSocket implementation for pilot; no external packages required on Render.
server.on('upgrade',(req,socket,head)=>{
 try{
  const u=new URL(req.url,'http://localhost');if(u.pathname!=='/ws')return socket.destroy();if(req.headers.origin){let originHost;try{originHost=new URL(req.headers.origin).host}catch{return socket.destroy()}if(originHost!==req.headers.host)return socket.destroy()}
  if(String(req.headers.upgrade||'').toLowerCase()!=='websocket'||!req.headers['sec-websocket-key'])return socket.destroy();
  const key=crypto.createHash('sha1').update(req.headers['sec-websocket-key']+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+key+'\r\n\r\n');
  const ws={socket,closed:false,buffer:Buffer.alloc(0),role:null,room:null,playerId:null,session:authRequest(req)};
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
load().then(()=>server.listen(PORT,HOST,()=>console.log(`UDIKA Game Hub ready on port ${PORT}. Pilot max ${MAX_PLAYERS} players per room.`))).catch(e=>{console.error('Cannot initialize persistence:',e);process.exit(1)});
process.on('SIGTERM',async()=>{clearTimeout(saveTimer);await persistNow().catch(e=>console.error(e));server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),5000)});
