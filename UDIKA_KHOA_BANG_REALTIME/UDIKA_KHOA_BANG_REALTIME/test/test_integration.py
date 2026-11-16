import json, os, socket, subprocess, tempfile, time, urllib.request, urllib.error
import websocket
ROOT=os.path.dirname(os.path.dirname(__file__))
PORT=18753
TMP=tempfile.TemporaryDirectory()
ENV={**os.environ,'PORT':str(PORT),'DATA_FILE':TMP.name+'/rooms.json','ADMIN_PASSWORD':'UDIKA-Local-Test-Password-8841','SESSION_SECRET':'udika-local-test-secret-random-1234567890'}
proc=subprocess.Popen(['node','server.js'],cwd=ROOT,env=ENV,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
def req(path,method='GET',data=None,cookie=None):
    body=json.dumps(data).encode() if data is not None else None
    head={'Content-Type':'application/json'}
    if cookie:head['Cookie']=cookie
    try:
        r=urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{PORT}'+path,data=body,method=method,headers=head),timeout=10)
        raw=r.read().decode('utf-8-sig'); return r.status, (raw if 'text/csv' in r.headers.get('Content-Type','') else (json.loads(raw) if raw else {})),r.headers.get('Set-Cookie')
    except urllib.error.HTTPError as e:
        return e.code,json.loads(e.read()),None

def ws(cookie=None):
    opts={}
    if cookie:opts['cookie']=cookie
    return websocket.create_connection(f'ws://127.0.0.1:{PORT}/ws',timeout=5,**opts)

def emit(c,obj):c.send(json.dumps(obj))
def nextmsg(c,kind=None,timeout=5):
    t=time.time()+timeout
    while time.time()<t:
        c.settimeout(t-time.time())
        d=json.loads(c.recv())
        if kind is None or d.get('type')==kind:return d
    raise AssertionError('missing '+str(kind))
try:
    deadline=time.time()+10
    while time.time()<deadline:
        try:
            if req('/health')[0]==200:break
        except Exception:time.sleep(.1)
    else:raise AssertionError('Server not ready')
    assert req('/api/rooms')[0]==403
    assert req('/api/login','POST',{'role':'admin','password':'wrong-password'})[0]==401
    status,d,cookie=req('/api/login','POST',{'role':'admin','password':ENV['ADMIN_PASSWORD']})
    assert status==200 and cookie
    cookie=cookie.split(';')[0]
    status,a,_=req('/api/rooms','POST',{'title':'VietinBank Gala','mcUser':'mc-vietin','password':'vitmcpwd-12345'},cookie)
    assert status==201,a
    status,b,_=req('/api/rooms','POST',{'title':'TPBank Gala','mcUser':'mc-tpbank','password':'tpbmcpwd-12345'},cookie)
    assert status==201,b
    print('OK admin created independent rooms',a['pin'],b['pin'])
    status,m,mcCookie=req('/api/login','POST',{'role':'mc','user':'mc-vietin','password':'vitmcpwd-12345','pin':a['pin']})
    assert status==200, m
    mcCookie=mcCookie.split(';')[0]
    mca=ws(mcCookie);emit(mca,{'type':'host_auth','pin':a['pin']});assert nextmsg(mca,'host_ok')['pin']==a['pin'];nextmsg(mca,'state')
    other=ws(mcCookie);emit(other,{'type':'host_auth','pin':b['pin']});e=nextmsg(other,'error');assert 'không có quyền' in e['message'] or 'chưa đăng nhập' in e['message'];other.close()
    print('OK MC cannot access another group')
    p1=ws();emit(p1,{'type':'join','pin':a['pin'],'name':'Sĩ tử A','avatar':'📜'});p1id=nextmsg(p1,'joined')['playerId'];nextmsg(p1,'state')
    p2=ws();emit(p2,{'type':'join','pin':a['pin'],'name':'Sĩ tử B','avatar':'📜'});p2id=nextmsg(p2,'joined')['playerId'];nextmsg(p2,'state')
    w=ws();emit(w,{'type':'watch','pin':a['pin']});nextmsg(w,'watch_ok');st=nextmsg(w,'state');assert st['count']==2
    print('OK two players join same room')
    # replace with one question to finish in one step
    bank=[{'stage':0,'q':'2 + 2 = ?','a':['3','4','5','6'],'c':1,'t':5}]
    emit(mca,{'type':'bank_set','bank':bank});nextmsg(mca,'state')
    emit(mca,{'type':'start'});nextmsg(mca,'state')
    qmsg=nextmsg(p1,'state');
    while qmsg['phase']!='running': qmsg=nextmsg(p1,'state')
    emit(p1,{'type':'answer','choice':1});ans=nextmsg(p1,'answered');assert ans['answer']['correct'] is True
    emit(p2,{'type':'answer','choice':0});ans2=nextmsg(p2,'answered');assert ans2['answer']['correct'] is False
    p1.close();time.sleep(.3)
    p1=ws();emit(p1,{'type':'join','pin':a['pin'],'playerId':p1id,'name':'Sĩ tử A'});assert nextmsg(p1,'joined')['playerId']==p1id;rec=nextmsg(p1,'state');assert rec['my']['score']>0 and rec['count']==2
    print('OK reconnect preserves submitted answer and score')
    emit(mca,{'type':'reveal'});final=nextmsg(mca,'state');
    while final['phase']!='finished':final=nextmsg(mca,'state')
    assert final['phase']=='finished' and final['honors'][0]['name']=='Sĩ tử A' and 'id' not in final['honors'][0]
    assert req('/api/rooms')[0]==403
    status,dr,_=req('/api/rooms','GET',cookie=cookie)
    assert status==200 and len(dr['rooms'])==2
    status,exp,_=req('/api/rooms/'+a['pin']+'/export',cookie=cookie)
    assert status==200 and 'Sĩ tử A' in exp
    print('OK final rankings and admin operations')
    emit(mca,{'type':'reset'});nextmsg(mca,'state')
    for c in [mca,p1,p2,w]:c.close()
    print('PASS')
finally:
    proc.terminate()
    try: stdout,_=proc.communicate(timeout=5)
    except subprocess.TimeoutExpired:proc.kill();stdout,_=proc.communicate()
    print('server logs:\n'+stdout[-1000:])
    TMP.cleanup()
