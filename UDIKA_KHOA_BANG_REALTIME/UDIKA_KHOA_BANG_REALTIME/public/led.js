'use strict';
let pin=(params.get('pin')||'').replace(/\D/g,''),current=null,joined=false;
qs('#pinInput').value=pin;
function enter(){pin=qs('#pinInput').value.trim();if(!/^\d{6}$/.test(pin)){qs('#error').textContent='Mã phòng gồm 6 chữ số';qs('#error').style.display='block';return}joined=true;emit({type:'watch',pin})}
qs('#enterBtn').onclick=enter;
onOpen=()=>{if(joined)emit({type:'watch',pin})};
onEvent=msg=>{if(msg.type==='error'){qs('#error').textContent=msg.message;qs('#error').style.display='block';return}if(msg.type==='state'){current=msg;qs('#enter').classList.add('hidden');qs('#display').classList.remove('hidden');render()}};
function render(){const s=current,q=s.q;qs('#pin').textContent='MÃ PHÒNG '+s.pin;qs('#count').textContent=s.count+' sĩ tử';qs('#round').textContent=`Câu ${s.idx+1}`;qs('#stage').textContent=q?stageNames[q.stage]:'TRƯỜNG THI KHOA BẢNG';qs('#landscape').innerHTML=sceneMarkup(q?.stage||0);qs('#qcount').textContent=q?`CÂU ${q.index}/${q.total}`:'ĐÓN SĨ TỬ';qs('#phase').textContent=s.phase==='running'?'ĐANG THI':s.phase==='reveal'?'CÔNG BỐ ĐÁP ÁN':s.phase==='finished'?'VINH QUY BÁI TỔ':s.phase==='intermission'?'CHÚC MỪNG VƯỢT KỲ THI':'CHỜ MỞ CÂU';qs('#timer').textContent=s.phase==='running'?timeLeft(q):q?.t||'--';qs('#question').textContent=s.phase==='finished'?'XƯỚNG DANH TAM KHÔI':s.phase==='intermission'?'HOÀN THÀNH MỘT CHẶNG KHOA BẢNG':q?q.q:'Quan trường đang chuẩn bị kỳ thi';qs('#choices').innerHTML=q&&s.phase!=='finished'?q.a.map((x,i)=>`<div class="choice ${s.phase==='reveal'&&i===q.answer?'correct':''}"><b>${'ABCD'[i]}.</b> ${escapeHtml(x)}</div>`).join(''):'';qs('#note').textContent=s.phase==='reveal'?`✅ Đáp án đúng: ${'ABCD'[q.answer]} · ${q.a[q.answer]}`:s.phase==='running'?'⏳ Sĩ tử đang làm bài':'📯 Chờ hiệu lệnh quan trường';qs('#leaders').innerHTML=renderRanks(s.leaderboard,10);qs('#standings').style.display=(['reveal','intermission','finished'].includes(s.phase))?'block':'none';qs('#top10').innerHTML=renderRanks(s.leaderboard,10);qs('#joinUrl').textContent=location.origin+'/join?pin='+s.pin;
const names=(s.candidates||[]).map(p=>p.avatar+' '+p.name);
qs('#candidateNames').textContent=names.length?names.join('  ·  '):'Đang chờ sĩ tử vào trường';
qs('#candidateBanner').classList.toggle('hidden',s.phase==='finished');const sc=qs('#stageCelebration');sc.classList.toggle('hidden',s.phase!=='intermission');if(s.phase==='intermission'){qs('#stageCongrats').textContent='CHÚC MỪNG ĐÃ HOÀN THÀNH '+stageNames[s.completedStage];
 qs('#stageWish').textContent=s.stageWish||'Họ hàng nhà bạn rất tự hào về bạn!';
 qs('#stageLeaders').innerHTML=(s.stageLeaders||[]).slice(0,3).map((p,i)=>`<div class="stage-leader"><b>${['🥇','🥈','🥉'][i]}</b><span>${escapeHtml(p.name)}</span><strong>${fmt(p.score)} điểm</strong></div>`).join('')||'<div class="stage-leader">Khoa thi đã hoàn thành – chờ các sĩ tử ghi danh bảng vàng.</div>';}
const ceremony=qs('#finalCeremony');ceremony.classList.toggle('hidden',s.phase!=='finished');
if(s.phase==='finished'){
 const honors=(s.honors||[]);
 const order=[honors[1],honors[0],honors[2]];
 const titles=['BẢNG NHÃN','TRẠNG NGUYÊN','THÁM HOA'];
 const symbols=['🥈','👑','🥉'];
 qs('#honors').innerHTML=honors.length?order.map((p,i)=>p?`<div class="honor-card ${i===1?'champion':''}"><div class="honor-med">${symbols[i]}</div><div class="honor-title">${titles[i]}</div><div class="honor-avatar">${scholarFigure(i===1?'trang-nguyen':i===0?'bang-nhan':'tham-hoa')}</div><div class="honor-name">${escapeHtml(p.name)}</div><div class="honor-score">${fmt(p.score)} điểm · ${p.correct} câu đúng</div><div class="honor-wish">Chúc mừng đã thi đỗ!</div></div>`:'').join(''):'<div class="empty-honors">Khoa thi kết thúc, nhưng chưa có sĩ tử ghi danh để xướng danh.</div>';
 qs('#congratsBottom').textContent=honors.length?'📯 Xin chúc mừng các sĩ tử đỗ đầu khoa bảng. Vinh quy bái tổ!':'';
}}
setInterval(()=>{if(current?.phase==='running'&&current.q){const s=timeLeft(current.q);qs('#timer').textContent=s;qs('#timer').classList.toggle('hot',s<=5)}},170);
connect();if(pin)enter();
