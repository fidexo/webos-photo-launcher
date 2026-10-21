const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
const startup=source.slice(source.indexOf('  if (window.LauncherBackgrounds)'),source.indexOf('  if (window.LauncherWeather) weather'));
function start(cached, dailyAvailable=true, backgroundsAvailable=true){
  const order=[],replacements=[];let received,notify;
  const gallery={replace:photos=>replacements.push(photos)};
  const window={LAUNCHER_DAILY_PHOTOS:{count:6}};
  if(backgroundsAvailable)window.LauncherBackgrounds={mount(options){order.push('backgrounds');received=options;return gallery;}};
  if(dailyAvailable)window.LauncherDailyPhotos={mount(config,onPhotos){order.push('daily');notify=onPhotos;if(cached.length)onPhotos(cached);}};
  const context={window,backgrounds:null,sourcesOpen:false,renderSources(){},
    document:{querySelector(){return {};},querySelectorAll(){return [{},{}];},getElementById(){return {};}}};
  vm.runInNewContext(startup,context);
  return {order,replacements,received,notify,gallery:context.backgrounds};
}
test('cached daily photos reach the first background mount without first loading a local gallery',()=>{
  const cached=[{src:'https://upload.wikimedia.org/wikipedia/commons/a/ab/photo.jpg'}];
  const result=start(cached);
  assert.deepEqual(result.order,['daily','backgrounds']);
  assert.equal(result.received.initialList,cached);
  assert.equal(result.replacements.length,0);
  const fresh=[{src:'https://upload.wikimedia.org/wikipedia/commons/c/cd/new.jpg'}];
  result.notify(fresh);assert.deepEqual(result.replacements,[fresh]);
});
test('a missing daily module or empty cache starts local backgrounds immediately',()=>{
  for(const available of [true,false]){
    const result=start([],available);
    assert.ok(result.gallery);assert.equal(result.replacements.length,0);
    assert.ok(Array.isArray(result.received.initialList),'explicit empty initial gallery preserves the local fallback');
    assert.equal(result.received.initialList.length,0);
  }
});
test('a missing optional background module does not start daily network refreshes',()=>{
  const result=start([],true,false);assert.deepEqual(result.order,[]);assert.equal(result.gallery,null);
});
