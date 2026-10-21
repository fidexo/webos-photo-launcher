const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../backgrounds.js'),'utf8');
const paint=source.slice(source.indexOf('  function paintFrost('),source.indexOf('  // Ubica el canvas'));
function fixture(filterSupported=true){
  const buffers=[],draws=[],attributes={};
  function canvas(){
    const result={width:0,height:0,setAttribute:(key,value)=>{attributes[key]=value;}};
    const context={clearRect(){},drawImage(image,x,y,w,h){draws.push({width:result.width,height:result.height,filter:context.filter,w,h});}};
    if(filterSupported)context.filter='none';
    result.getContext=()=>{buffers.push({width:result.width,height:result.height});return context;};
    return result;
  }
  const context={FROST_WIDTH:160,FROST_BLUR:3,document:{createElement:canvas}};
  vm.runInNewContext(paint,context);
  return {paint:context.paintFrost,canvas:canvas(),buffers,draws,attributes};
}
test('frost uses only thumbnail-sized drawing buffers even for a large source image',()=>{
  const f=fixture();assert.equal(f.paint(f.canvas,{naturalWidth:3840,naturalHeight:2160}),true);
  assert.ok(f.buffers.every(b=>b.width<=160&&b.height<=90),'full-resolution intermediate buffers block the TV UI');
  assert.equal(f.canvas.width,160);assert.equal(f.canvas.height,90);
  assert.equal(f.attributes['data-width'],3840);assert.equal(f.attributes['data-height'],2160);
});
test('frost retains an unblurred base for the image edges and a small blurred coat',()=>{
  const f=fixture();assert.equal(f.paint(f.canvas,{naturalWidth:1920,naturalHeight:1280}),true);
  const final=f.draws.filter(d=>d.width===160);
  assert.equal(final[0].filter,'none');assert.ok(final.some(d=>d.filter==='blur(3px)'));
  assert.ok(final.every(d=>d.w===160&&d.h===107));
});
test('older canvas without a filter still paints, and unavailable contexts fail safely',()=>{
  const f=fixture(false);assert.equal(f.paint(f.canvas,{naturalWidth:1920,naturalHeight:1080}),true);
  assert.equal(f.paint({getContext:()=>null},{naturalWidth:1920,naturalHeight:1080}),false);
});
