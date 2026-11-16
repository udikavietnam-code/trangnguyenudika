'use strict';
const qs = (s)=>document.querySelector(s);
const params = new URLSearchParams(location.search);
const escapeHtml=(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stageNames=['LỚP THẦY ĐỒ','KHẢO HẠCH','THI HƯƠNG','THI HỘI','THI ĐÌNH'];
const fmt=(n)=>Number(n||0).toLocaleString('vi-VN');
const medal=(n)=>['🥇','🥈','🥉'][n]||'📜';
const timeLeft=(q)=>q?Math.max(0,Math.ceil((q.deadline-(Date.now()+serverOffset))/1000)):0;
let serverOffset=0;
let socket=null;
let onEvent=()=>{};
let onOpen=()=>{};
let onClose=()=>{};
let socketQueue=[];
function connect(){
 const protocol=location.protocol==='https:'?'wss:':'ws:';
 socket=new WebSocket(protocol+'//'+location.host+'/ws');
 socket.onopen=()=>{const jobs=socketQueue.splice(0);for(let j of jobs)socket.send(JSON.stringify(j));onOpen()};
 socket.onmessage=e=>{let msg;try{msg=JSON.parse(e.data)}catch{return}if(msg.time)serverOffset=msg.time-Date.now();onEvent(msg)};
 socket.onclose=()=>{onClose();setTimeout(connect,1600)};
 socket.onerror=()=>{};
}
function emit(msg){if(socket&&socket.readyState===1)socket.send(JSON.stringify(msg));else if(socketQueue.length<20)socketQueue.push(msg)}
function renderRanks(list,limit=10){return (list||[]).slice(0,limit).map((p,i)=>`<div class="rank"><span class="no">${medal(i)}</span><div><b>${escapeHtml(p.avatar||'📜')} ${escapeHtml(p.name)}</b><div class="meta">${p.correct||0} câu đúng</div></div><span class="pts">${fmt(p.score)} điểm</span></div>`).join('')||'<p class="muted">Chưa có người ghi điểm.</p>'}
