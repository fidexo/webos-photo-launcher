const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=path.join(__dirname,'../installer/ui/app.js');

function fixture(options={}) {
  const nodes={};
  function element(tag='div') {
    let text='';
    return {tagName:tag.toUpperCase(),children:[],listeners:{},attributes:{},value:'',checked:false,disabled:false,
      appendChild(child){this.children.push(child);return child;},
      setAttribute(key,value){this.attributes[key]=String(value);},getAttribute(key){return this.attributes[key]||null;},
      addEventListener(name,fn){this.listeners[name]=fn;},
      get textContent(){return text+this.children.map(n=>n.textContent).join('');},set textContent(value){text=String(value);this.children=[];},
      set innerHTML(value){throw new Error('Unsafe DOM rendering');}};
  }
  const ids=['setup-form','host','identity','install','home','privacy','root','connect','prepare','apply','restore','feedback','result-summary','result-status','steps','device-status','capture-status','lights-status','plan-status'];
  ids.forEach(id=>nodes[id]=element());
  nodes.host.value='192.168.50.20';nodes.identity.value='C:\\Keys\\tv_key';
  const removals=['webos.day','epoxyaisports','lgchannels.home'].map(value=>Object.assign(element('input'),{value}));
  const token=element('meta');token.setAttribute('content','session-token');
  const document={getElementById:id=>nodes[id],createElement:element,
    querySelector:selector=>selector==='meta[name="setup-token"]'?token:null,
    querySelectorAll:selector=>selector==='[name="removeApps"]'?removals:selector==='input'?[...['host','identity','install','home','privacy','root'].map(id=>nodes[id]),...removals]:[]};
  const calls=[];
  const fetch=(url,request)=>new Promise((resolve,reject)=>calls.push({url,request,resolve:result=>resolve({ok:true,json:async()=>({ok:true,result})}),reject}));
  const app=require(source).createApp(Object.assign({document,fetch,timeoutMs:100},options));app.start();
  return {app,nodes,removals,calls,token,change(){nodes['setup-form'].listeners.input();}};
}

test('installer UI imports without browser globals and keeps response content as text',async()=>{
  assert.equal(typeof require(source).createApp,'function');
  const p=fixture();const pending=p.app.connect();
  p.calls[0].resolve({status:'ready',summary:'<img src=x onerror=alert(1)>',steps:[{label:'<script>bad()</script>',status:'verified'}]});await pending;
  assert.equal(p.nodes['result-summary'].textContent,'<img src=x onerror=alert(1)>');
  assert.match(p.nodes.steps.textContent,/<script>bad\(\)<\/script>/);
  assert.doesNotMatch(fs.readFileSync(source,'utf8'),/\.innerHTML\s*=/);
});

test('status sends private host and identity only with the session header; invalid addresses never request',async()=>{
  const p=fixture();assert.equal(p.calls.length,0);let pending=p.app.connect();
  assert.deepEqual(JSON.parse(p.calls[0].request.body),{action:'status',payload:{host:'192.168.50.20',identity:'C:\\Keys\\tv_key'}});
  assert.equal(p.calls[0].request.headers['X-Setup-Token'],'session-token');p.calls[0].resolve({status:'ready'});await pending;
  p.nodes.host.value='8.8.8.8';await p.app.connect();assert.equal(p.calls.length,1);
  assert.match(p.nodes.feedback.textContent,/privada/);
});

test('the reviewed plan is invalidated by edits and apply sends only its bound id',async()=>{
  const p=fixture();p.nodes.home.checked=true;
  let pending=p.app.prepare();p.calls[0].resolve({status:'planned',plan:{id:'plan-one'}});await pending;
  assert.equal(p.nodes.apply.disabled,false);p.nodes.privacy.checked=true;p.change();
  assert.equal(p.nodes.apply.disabled,true);await p.app.apply();assert.equal(p.calls.length,1);
  pending=p.app.prepare();p.calls[1].resolve({status:'planned',plan:{id:'plan-two'}});await pending;
  pending=p.app.apply();assert.deepEqual(JSON.parse(p.calls[2].request.body),{action:'apply',payload:{planId:'plan-two'}});
  p.calls[2].resolve({status:'applied',backupId:'backup-two'});await pending;
  assert.equal(p.nodes.restore.disabled,false);
  pending=p.app.restore();assert.deepEqual(JSON.parse(p.calls[3].request.body),{action:'restore',payload:{backupId:'backup-two'}});
  p.calls[3].resolve({status:'verified'});await pending;
});

test('a plan is snapshot-bound even without an input event; stale responses and concurrent requests are rejected',async()=>{
  const p=fixture();let pending=p.app.prepare();await p.app.connect();assert.equal(p.calls.length,1);
  p.nodes.host.value='192.168.50.21';p.change();p.calls[0].resolve({status:'planned',plan:{id:'stale'}});await pending;
  assert.equal(p.nodes.apply.disabled,true);
  pending=p.app.prepare();p.calls[1].resolve({status:'planned',plan:{id:'current'}});await pending;
  p.nodes.identity.value='C:\\Keys\\other';await p.app.apply();assert.equal(p.calls.length,2);
  assert.equal(p.nodes.apply.disabled,true);
});

test('timeout is a local-helper failure, late readiness is ignored, unknown capture is never active',async()=>{
  const p=fixture({timeoutMs:5});const pending=p.app.connect();await pending;
  assert.equal(p.app.getState().busy,false);assert.match(p.nodes.feedback.textContent,/asistente local/);
  p.calls[0].resolve({status:'verified',capture:{active:true},lights:{active:true}});await new Promise(r=>setImmediate(r));
  assert.match(p.nodes['capture-status'].textContent,/Sin verificar/);assert.match(p.nodes['lights-status'].textContent,/Sin verificar/);
  assert.equal(p.nodes.apply.disabled,true);
});

test('blocked and expired plans cannot apply and removal is opt-in',async()=>{
  const p=fixture();let pending=p.app.prepare();
  assert.deepEqual(JSON.parse(p.calls[0].request.body).payload.options.removeApps,[]);
  p.calls[0].resolve({status:'blocked',plan:{id:'blocked'}});await pending;assert.equal(p.nodes.apply.disabled,true);
  p.removals[1].checked=true;pending=p.app.prepare();
  assert.deepEqual(JSON.parse(p.calls[1].request.body).payload.options.removeApps,['epoxyaisports']);
  p.calls[1].resolve({status:'planned',plan:{id:'expired',expiresAt:Date.now()-1}});await pending;
  await p.app.apply();assert.equal(p.calls.length,2);assert.equal(p.nodes.apply.disabled,true);
});

test('a new failed query revokes old verified media and never reuses a missing session',async()=>{
  const p=fixture({timeoutMs:5});let pending=p.app.connect();
  p.calls[0].resolve({status:'verified',capture:{verified:true,active:true},lights:{verified:true,active:true}});await pending;
  assert.match(p.nodes['capture-status'].textContent,/Activo/);
  pending=p.app.connect();await pending;assert.match(p.nodes['capture-status'].textContent,/Sin verificar/);
  assert.match(p.nodes['lights-status'].textContent,/Sin verificar/);
  p.token.setAttribute('content','');await p.app.prepare();assert.equal(p.calls.length,2);
  assert.match(p.nodes.feedback.textContent,/sesión/);
});

test('restore remains available for recovery-pending but a completed restore consumes its result backup',async()=>{
  const p=fixture();let pending=p.app.prepare();p.calls[0].resolve({status:'planned',plan:{id:'plan'}});await pending;
  pending=p.app.apply();p.calls[1].resolve({status:'recovery-pending',backupId:'saved'});await pending;
  assert.equal(p.nodes.restore.disabled,false);pending=p.app.restore();p.calls[2].resolve({status:'partial'});await pending;
  assert.equal(p.nodes.restore.disabled,false);pending=p.app.restore();p.calls[3].resolve({status:'complete'});await pending;
  assert.equal(p.nodes.restore.disabled,true);assert.doesNotMatch(p.nodes['plan-status'].textContent,/verificada/);
});

test('the actual local page has one injected token and the UI contract reaches a stub engine',async()=>{
  const {startServer}=require('../installer/server.cjs');const received=[];
  const server=await startServer({engine:{async runAction(action,payload){received.push({action,payload});return {status:'ready',summary:'Conexión de prueba'};}}});
  try {
    const page=await (await fetch(server.url)).text();
    const tokens=[...page.matchAll(/<meta name="setup-token" content="([^"]*)">/g)];
    assert.equal(tokens.length,1);assert.match(tokens[0][1],/^[a-f0-9]{32}$/);
    const p=fixture({fetch:(url,request)=>fetch(server.url+url,Object.assign({},request,{headers:Object.assign({},request.headers,{Origin:server.url})}))});
    p.token.setAttribute('content',tokens[0][1]);await p.app.connect();
    assert.deepEqual(received.map(x=>x.action),['status']);assert.equal(p.nodes['result-summary'].textContent,'Conexión de prueba');
    assert.equal(received[0].payload.identity,'C:\\Keys\\tv_key');
  } finally {await server.close();}
});

test('an uncertain apply recovers its late backup through status for the same reviewed target without replaying apply',async()=>{
  const p=fixture({timeoutMs:5});let pending=p.app.prepare();p.calls[0].resolve({status:'planned',plan:{id:'reviewed'}});await pending;
  await p.app.apply();assert.equal(p.app.getState().uncertain,true);assert.equal(p.nodes.restore.disabled,true);
  assert.equal(p.nodes.prepare.disabled,true);await p.app.prepare();assert.equal(p.calls.length,2);
  p.calls[1].resolve({status:'complete',backupId:'late-backup'});await new Promise(r=>setImmediate(r));
  assert.equal(p.app.getState().backupId,null);
  pending=p.app.connect();p.calls[2].resolve({status:'recovery-pending',backupId:'late-backup'});await pending;
  assert.equal(p.nodes.restore.disabled,false);assert.equal(p.app.getState().backupId,'late-backup');
  assert.equal(p.app.getState().uncertain,true);assert.match(p.nodes['plan-status'].textContent,/respaldo/i);
  pending=p.app.restore();assert.deepEqual(JSON.parse(p.calls[3].request.body),{action:'restore',payload:{backupId:'late-backup'}});
  p.calls[3].resolve({status:'complete'});await pending;assert.equal(p.app.getState().uncertain,false);
  assert.deepEqual(p.calls.map(c=>JSON.parse(c.request.body).action),['plan','apply','status','restore']);
});

test('recovery never adopts another host or identity backup, nor a status made stale by editing its target',async()=>{
  const p=fixture({timeoutMs:5});let pending=p.app.prepare();p.calls[0].resolve({status:'planned',plan:{id:'reviewed'}});await pending;await p.app.apply();
  const originalHost=p.nodes.host.value,originalIdentity=p.nodes.identity.value;
  p.nodes.host.value='192.168.50.21';p.change();pending=p.app.connect();p.calls[2].resolve({status:'recovery-pending',backupId:'other-host'});await pending;
  assert.equal(p.app.getState().backupId,null);assert.equal(p.nodes.restore.disabled,true);
  p.nodes.host.value=originalHost;p.nodes.identity.value='C:\\Keys\\different';p.change();pending=p.app.connect();p.calls[3].resolve({status:'recovery-pending',backupId:'other-identity'});await pending;
  assert.equal(p.app.getState().backupId,null);assert.equal(p.app.getState().uncertain,true);
  p.nodes.identity.value=originalIdentity;p.change();pending=p.app.connect();p.nodes.host.value='192.168.50.22';p.change();p.calls[4].resolve({status:'recovery-pending',backupId:'stale'});await pending;
  assert.equal(p.app.getState().backupId,null);
  p.nodes.host.value=originalHost;p.change();pending=p.app.connect();p.calls[5].resolve({status:'recovery-pending',backupId:'matching'});await pending;
  assert.equal(p.nodes.restore.disabled,false);p.nodes.host.value='192.168.50.23';p.change();
  assert.equal(p.nodes.restore.disabled,true);await p.app.restore();assert.equal(p.calls.length,6);
});

test('only matching explicit journal completion clears uncertainty; generic ready never does',async()=>{
  const p=fixture({timeoutMs:5});let pending=p.app.prepare();p.calls[0].resolve({status:'planned',plan:{id:'reviewed'}});await pending;await p.app.apply();
  pending=p.app.connect();p.calls[2].resolve({status:'ready'});await pending;assert.equal(p.app.getState().uncertain,true);
  pending=p.app.connect();p.calls[3].resolve({status:'ready',backupId:'saved',recovery:{phase:'prepared',pending:true}});await pending;
  assert.equal(p.app.getState().uncertain,true);assert.equal(p.nodes.restore.disabled,false);
  pending=p.app.connect();p.calls[4].resolve({status:'ready',backupId:'saved',recovery:{phase:'applied',pending:false}});await pending;
  assert.equal(p.app.getState().uncertain,false);assert.equal(p.nodes.restore.disabled,false);assert.equal(p.nodes.prepare.disabled,false);
  pending=p.app.connect();p.calls[5].resolve({status:'partial',recovery:{phase:'inflight',pending:true}});await pending;
  assert.equal(p.app.getState().uncertain,true);assert.equal(p.nodes.restore.disabled,true);
  pending=p.app.connect();p.calls[6].resolve({status:'ready',backupId:'saved',recovery:{phase:'restored',pending:false}});await pending;
  assert.equal(p.app.getState().backupId,null);assert.equal(p.nodes.restore.disabled,true);
});

test('starting a new reviewed operation cannot leave an older target backup attached to its uncertainty',async()=>{
  const p=fixture({timeoutMs:5});let pending=p.app.prepare();p.calls[0].resolve({status:'planned',plan:{id:'first'}});await pending;
  pending=p.app.apply();p.calls[1].resolve({status:'complete',backupId:'first-backup'});await pending;
  const firstHost=p.nodes.host.value;p.nodes.host.value='192.168.50.24';p.change();
  pending=p.app.prepare();p.calls[2].resolve({status:'planned',plan:{id:'second'}});await pending;await p.app.apply();
  assert.equal(p.app.getState().backupId,null);assert.equal(p.app.getState().uncertain,true);
  p.nodes.host.value=firstHost;p.change();await p.app.restore();assert.equal(p.calls.length,4);assert.equal(p.nodes.restore.disabled,true);
});

test('a reloaded UI recovers a confirmed journal from status and binds restoration to that queried target',async()=>{
  const p=fixture();assert.equal(p.app.getState().backupId,null);
  let pending=p.app.connect();p.calls[0].resolve({status:'ready',backupId:'prior-session',recovery:{phase:'applied',pending:false}});await pending;
  assert.equal(p.app.getState().backupId,'prior-session');assert.equal(p.nodes.restore.disabled,false);
  const originalHost=p.nodes.host.value;p.nodes.host.value='192.168.50.29';p.change();assert.equal(p.nodes.restore.disabled,true);
  await p.app.restore();assert.equal(p.calls.length,1);
  p.nodes.host.value=originalHost;p.change();pending=p.app.restore();
  assert.deepEqual(JSON.parse(p.calls[1].request.body),{action:'restore',payload:{backupId:'prior-session'}});
  p.calls[1].resolve({status:'complete'});await pending;
});

test('fresh-page recovery rejects an unqualified backup and stale target results before accepting a pending journal',async()=>{
  const p=fixture();let pending=p.app.connect();p.calls[0].resolve({status:'ready',backupId:'unqualified'});await pending;
  assert.equal(p.app.getState().backupId,null);
  pending=p.app.connect();p.nodes.host.value='192.168.50.28';p.change();p.calls[1].resolve({status:'ready',backupId:'stale-host',recovery:{phase:'applied',pending:false}});await pending;
  assert.equal(p.app.getState().backupId,null);
  pending=p.app.connect();p.nodes.identity.value='C:\\Keys\\changed';p.calls[2].resolve({status:'ready',backupId:'stale-identity',recovery:{phase:'applied',pending:false}});await pending;
  assert.equal(p.app.getState().backupId,null);
  pending=p.app.connect();p.calls[3].resolve({status:'partial',backupId:'pending-journal',recovery:{phase:'unconfirmed',pending:true}});await pending;
  assert.equal(p.app.getState().backupId,'pending-journal');assert.equal(p.app.getState().uncertain,true);assert.equal(p.nodes.restore.disabled,false);
});

test('a fresh page recovers an interrupted restoring journal and can retry only that backup',async()=>{
  const p=fixture();let pending=p.app.connect();
  p.calls[0].resolve({status:'partial',backupId:'restoring-backup',recovery:{phase:'restoring',pending:true}});await pending;
  assert.equal(p.app.getState().backupId,'restoring-backup');assert.equal(p.app.getState().uncertain,true);
  assert.equal(p.nodes.restore.disabled,false);assert.equal(p.nodes.prepare.disabled,true);
  pending=p.app.restore();assert.deepEqual(JSON.parse(p.calls[1].request.body),{action:'restore',payload:{backupId:'restoring-backup'}});
  p.calls[1].resolve({status:'complete'});await pending;assert.equal(p.app.getState().backupId,null);
});
