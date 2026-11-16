import json, os, subprocess, tempfile, time, urllib.request, urllib.error
import websocket
ROOT=os.path.dirname(os.path.dirname(__file__))
PORT=18911
TMP=tempfile.TemporaryDirectory()
ENV={**os.environ,'PORT':str(PORT),'DATA_FILE':TMP.name+'/rooms.json','ADMIN_PASSWORD':'UDIKA-Local-Test-Password-8841','SESSION_SECRET':'udika-local-test-secret-random-1234567890'}
proc=subprocess.Popen(['node','server.js'],cwd=ROOT,env=ENV,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
def req(path,method='GET',data=None,cookie=None):
 body=json.dumps(data).encode() if data is not None else None
 head={'Content-Type':'application/json'}
 if cookie:head['Cookie']=cookie
 r=urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{PORT}'+path,data=body,method=method,headers=head),timeout=6)
 raw=r.read().decode();return json.loads(raw),r.headers.get('Set-Cookie')
def ws(cookie=None):return websocket.create_connection(f'ws://127.0.0.1:{PORT}/ws',timeout=5,**({'cookie':cookie} if cookie else {}))
def emit(c,msg):c.send(json.dumps(msg))
def received(c,kind):
 end=time.monotonic()+5
 while time.monotonic()<end:
  c.settimeout(end-time.monotonic());m=json.loads(c.recv())
  if m.get('type')==kind:return m
 raise AssertionError('Expected '+kind)
def state(c,phase=None):
 end=time.monotonic()+5
 while time.monotonic()<end:
  c.settimeout(end-time.monotonic());m=json.loads(c.recv())
  if m.get('type')=='state' and (not phase or m.get('phase')==phase):return m
 raise AssertionError('Expected phase '+str(phase))
try:
 for i in range(60):
  try:
   h,_=req('/health');break
  except:time.sleep(.1)
 else:raise RuntimeError('server not ready')
 _,admincookie=req('/api/login','POST',{'role':'admin','password':ENV['ADMIN_PASSWORD']});ac=admincookie.split(';')[0]
 r,_=req('/api/rooms','POST',{'title':'Thi Tam Khôi','mcUser':'mctest','password':'password-test-0123'},ac);pin=r['pin']
 _,mccookie=req('/api/login','POST',{'role':'mc','pin':pin,'user':'mctest','password':'password-test-0123'});c=ws(mccookie.split(';')[0]);emit(c,{'type':'host_auth','pin':pin});state(c)
 led=ws();emit(led,{'type':'watch','pin':pin});state(led)
 player=ws();emit(player,{'type':'join','pin':pin,'name':'Nguyễn Thị A'});state(player)
 bank=[{'stage':0,'q':'Câu 1?','a':['A','B','C','D'],'c':0,'t':10}, {'stage':1,'q':'Câu 2?','a':['A','B','C','D'],'c':0,'t':10}]
 emit(c,{'type':'bank_set','bank':bank});state(c)
 emit(c,{'type':'start'});state(c,'running')
 emit(player,{'type':'answer','choice':0});received(player,'answered')
 emit(c,{'type':'reveal'});st=state(c,'intermission');assert st['completedStage']==0, st
 ledst=state(led,'intermission');assert ledst['stageLeaders'][0]['name']=='Nguyễn Thị A',ledst
 p=state(player,'intermission');assert p['my']['passedStage']['passed']
 print('PASS stage 1 celebration LED + personal message')
 emit(c,{'type':'next'});s=state(c,'ready');assert s['idx']==1,s
 emit(c,{'type':'start'});state(c,'running')
 emit(player,{'type':'answer','choice':0});received(player,'answered')
 emit(c,{'type':'reveal'});st=state(c,'finished');assert st['honors'][0]['name']=='Nguyễn Thị A',st
 assert state(led,'finished')['honors'][0]['title']=='Trạng nguyên'
 print('PASS final honors triggered by reveal without NEXT')
 for x in [c,led,player]:x.close()
finally:
 proc.terminate()
 try:out,_=proc.communicate(timeout=3)
 except:proc.kill();out,_=proc.communicate()
 TMP.cleanup()
 print(out[-500:])
