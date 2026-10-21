const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const file=path.join(__dirname,'../services/com.frxn.mipantalla.lights/screen-backend.js');
const ids=['wiz-aabbcc001122','wiz-aabbcc003344'];
const lamps=ids.map((id,i)=>({id,ip:'192.168.1.'+(40+i),reachable:true}));
function setup(change=()=>{}) {
  assert.ok(fs.existsSync(file),'screen diagnostic backend must exist');
  const data={admin:{adminRequired:false},server:{currentInstance:0,
    instance:[{instance:0,friendly_name:'Mi pantalla WiZ Living',running:true}],
    components:[{name:'LEDDEVICE',enabled:false}],priorities:[]},
    config:{device:{type:'wiz',port:38899,lamps:lamps.map(d=>({ipAddress:d.ip,macAddress:d.id.slice(4)}))},
      leds:ids.map(()=>({hmin:0,hmax:1,vmin:0,vmax:1}))}};
  const calls=[];let closed=0,connections=0;
  const rpc={connect:async()=>{connections++;return {request:async command=>{
    calls.push(command);return {success:true,info:command.command==='serverinfo'?data.server:
      command.command==='config'?data.config:data.admin};},close(){closed++;}};}};
  const config={enabled:true,token:'synthetic-user-token-not-a-secret',profile:'Mi pantalla WiZ Living'};
  change(data,config,rpc);
  const backend=require(file)({config,rpc,read:async()=>({devices:lamps})});
  return {backend,data,calls,get closed(){return closed;},get connections(){return connections;}};
}
test('screen backend defaults to prepared without making any connection',async()=>{
  const t=setup((data,config)=>{config.enabled=false;});
  const status=await t.backend.inspect([]);
  assert.equal(status.reason,'setup-pending');assert.equal(status.ready,false);assert.equal(t.connections,0);
});
test('screen diagnostic verifies exact local instance and selected WiZ config but never invents frame proof',async()=>{
  const t=setup();const result=await t.backend.inspect(ids);
  assert.equal(result.configVerified,true);assert.equal(result.ready,false);
  assert.equal(result.framesVerified,false);assert.equal(result.hardwareVerified,false);
  assert.equal(result.sourceFreshness,'unknown');assert.equal(result.reason,'frames-unverified');
  assert.ok(t.calls.every(c=>['authorize','serverinfo','config'].includes(c.command)));
  assert.equal(t.closed,1);assert.doesNotMatch(JSON.stringify(result),/192\.168|aabbcc|synthetic|token/);
});
test('screen diagnostic works without selection, without lamp reads or mutation',async()=>{
  const t=setup();const result=await t.backend.inspect([]);
  assert.equal(result.reason,'selection-required');assert.equal(result.configVerified,false);
  assert.equal(t.calls.some(c=>c.command==='componentstate'),false);
});
test('screen diagnostic rejects mismatched admin, profile, instance, driver, layout, MAC or current IP',async()=>{
  const cases=[
    [d=>{d.admin.adminRequired=true;},'admin-required'],
    [d=>{d.server.currentInstance=1;},'instance-mismatch'],
    [d=>{d.server.instance[0].friendly_name='Another room';},'profile-mismatch'],
    [d=>{d.config.device.type='other';},'selection-mismatch'],
    [d=>{d.config.device.lamps.push(d.config.device.lamps[0]);},'selection-mismatch'],
    [d=>{d.config.device.lamps[0].macAddress='aabbcc000000';},'selection-mismatch'],
    [d=>{d.config.device.lamps[0].ipAddress='192.168.1.99';},'selection-mismatch'],
    [d=>{d.config.leds=[];},'selection-mismatch'],
    [d=>{d.config.leds[0].disabled=true;},'selection-mismatch']
  ];
  for(const [change,reason] of cases){const t=setup(change);const status=await t.backend.inspect(ids);
    assert.equal(status.ready,false);assert.equal(status.reason,reason);assert.equal(t.closed,1);}
});
test('a foreign enabled output is reported without being stopped',async()=>{
  const t=setup(d=>{d.server.components[0].enabled=true;});
  const status=await t.backend.inspect(ids);
  assert.equal(status.reason,'output-in-use');assert.equal(status.active,false);
  assert.equal(t.calls.some(c=>c.command==='componentstate'),false);
});
test('transport errors cannot expose credentials or raw server messages',async()=>{
  const t=setup((d,c,rpc)=>{rpc.connect=async()=>{throw Error('secret-token at 192.168.1.40');};});
  const status=await t.backend.inspect(ids);
  assert.equal(status.reason,'offline');assert.doesNotMatch(JSON.stringify(status),/secret|192\.168/);
});
test('screen activation stays disabled until a real frame channel is implemented and verified',async()=>{
  const t=setup();await assert.rejects(t.backend.start(ids),e=>e.code==='SCREEN_FRAMES_UNVERIFIED');
  assert.equal(t.calls.length,0);
});
