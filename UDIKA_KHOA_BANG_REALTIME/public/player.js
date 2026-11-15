'use strict';
let joinedPin='',playerId='',current=null,selected=false;
const pinFromUrl=(params.get('pin')||'').replace(/\D/g,'').slice(0,6);
qs('#pin').value=pinFromUrl;
const storageKey=pin=>`udika_player_${pin}`;
function msgError(s){qs('#errors').textContent=s;qs('#errors').style.display='block';setTimeout(()=>qs('#errors').style.display='none',6000)}
function join(){const pin=qs('#pin').value.trim();const name=qs('#name').value.trim();if(!/^\d{6}$/.test(pin)){msgError('Vui lòng nhập mã phòng gồm 6 chữ số');return}if(!name){msgError('Vui lòng nhập tên sĩ tử');return}const saved=JSON.parse(localStorage.getItem(storageKey(pin))||'null');joinedPin=pin;emit({type:'join',pin,name,avatar:qs('#avatar').value,playerId:saved?.playerId||''})}
qs('#joinButton').onclick=join;
onOpen=()=>{qs('#connection').textContent='● Trực tuyến';if(joinedPin){const saved=JSON.parse(localStorage.getItem(storageKey(joinedPin))||'null');emit({type:'join',pin:joinedPin,name:qs('#name').value||saved?.name||'Sĩ tử',avatar:qs('#avatar').value,playerId:playerId||saved?.playerId})}};
onClose=()=>{qs('#connection').textContent='● Đang kết nối lại'};
onEvent=msg=>{
 if(msg.type==='error'){msgError(msg.message);return}
 if(msg.type==='joined'){joinedPin=msg.pin;playerId=msg.playerId;localStorage.setItem(storageKey(joinedPin),JSON.stringify({playerId,name:qs('#name').value.trim()}));qs('#joinPanel').classList.add('hidden');qs('#playPanel').classList.remove('hidden');return}
 if(msg.type==='answered'){selected=true;qs('#answerNote').textContent=`Đã nộp bài · ${Math.round(msg.answer.ms)/1000} giây · đang chờ công bố`;return}
 if(msg.type==='state'){current=msg;render()}
};
function render(){if(!current)return;const s=current;const q=s.q;
 qs('#myName').textContent=s.my?`${s.my.avatar} ${s.my.name}`:'';qs('#myScore').textContent=fmt(s.my?.score)+' điểm';
 qs('#stage').textContent=q?stageNames[q.stage]:'TRƯỜNG THI KHOA BẢNG';
 qs('#qNumber').textContent=q?`Câu ${q.index}/${q.total}`:s.phase==='idle'?'Chưa khai trường':'Chờ câu tiếp theo';
 qs('#timer').textContent=s.phase==='running'?timeLeft(q):s.phase==='ready'?'--':'—';
 qs('#question').textContent=s.phase==='finished'?'Khoa thi đã kết thúc':s.phase==='ready'?'Quan trường đang chuẩn bị phát đề...':q?q.q:'MC chưa mở kỳ thi';
 const ans=s.my?.answer;selected=!!ans;
 qs('#choices').innerHTML=(q&&['running','reveal'].includes(s.phase))?q.a.map((x,i)=>`<button class="choice ${ans?.choice===i?'selected':''} ${s.phase==='reveal'&&i===q.answer?'correct':''}" ${s.phase!=='running'||selected?'disabled':''} data-i="${i}"><b>${'ABCD'[i]}.</b> ${escapeHtml(x)}</button>`).join(''):'';
 for(const b of qs('#choices').querySelectorAll('button'))b.onclick=()=>{if(selected)return;selected=true;emit({type:'answer',choice:Number(b.dataset.i)});for(const c of qs('#choices').querySelectorAll('button'))c.disabled=true;b.classList.add('selected');qs('#answerNote').textContent='Đã gửi câu trả lời. Chờ máy chủ xác nhận...'};
 qs('#answerNote').textContent=s.phase==='running'?(ans?`Đã nộp bài trong ${(ans.ms/1000).toFixed(2)} giây`:selected?'Đã gửi, đang đợi xác nhận...':'Chạm đáp án để nộp bài') :s.phase==='reveal'?`Đáp án đúng: ${'ABCD'[q.answer]}. ${q.a[q.answer]} · Bạn được ${ans?.points||0} điểm`:'Chờ quan trường điều khiển';
 qs('#stateNote').textContent=s.phase==='idle'?'Đã ghi danh. Chờ MC khai trường.':s.phase==='running'?'⏳ Câu hỏi đang diễn ra':s.phase==='reveal'?'🏅 Đã công bố bảng vàng – chờ MC chuyển câu':s.phase==='finished'?'📯 Xướng danh Tam khôi':'Chờ MC mở câu hỏi tiếp theo';
 qs('#finalPanel').classList.toggle('hidden',s.phase!=='finished');if(s.phase==='finished')qs('#finalRanks').innerHTML=renderRanks(s.leaderboard,10);
}
setInterval(()=>{if(current?.phase==='running'&&current.q){const sec=timeLeft(current.q);qs('#timer').textContent=sec;qs('#timer').classList.toggle('hot',sec<=5)}},170);
connect();
