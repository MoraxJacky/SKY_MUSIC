// Shared instrument catalogue. Every bank supports the 15-key range in all 12 major keys.
const INSTRUMENTS=[
 {id:'offline',name:'经典钢琴',mode:'offline',gain:.23},
 {id:'offline-harp',name:'竖琴',mode:'offline',bank:'orchestral_harp',gain:.26},
 {id:'offline-music-box',name:'八音盒',mode:'offline',bank:'music_box',gain:.20},
 {id:'offline-flute',name:'长笛',mode:'offline',bank:'flute',gain:.16},
 {id:'offline-nylon-guitar',name:'尼龙吉他',mode:'offline',bank:'acoustic_guitar_nylon',gain:.26},
 {id:'salamander',name:'Yamaha C5',mode:'online',gain:.23},
 {id:'online-electric-piano',name:'电钢琴',mode:'online',bank:'electric_piano_1',gain:.23},
 {id:'online-violin',name:'小提琴',mode:'online',bank:'violin',gain:.16},
 {id:'online-cello',name:'大提琴',mode:'online',bank:'cello',gain:.18},
 {id:'online-strings',name:'弦乐合奏',mode:'online',bank:'string_ensemble_1',gain:.16},
 {id:'online-choir',name:'合唱',mode:'online',bank:'choir_aahs',gain:.16}
];
const instrumentSpec=id=>INSTRUMENTS.find(x=>x.id===id)||INSTRUMENTS[0];
const FLUID_REVISION='044fab8e1456bfafc5776e86dfd6bb8697149aef';
const FLUID_BASE=`https://raw.githubusercontent.com/gleitz/midi-js-soundfonts/${FLUID_REVISION}/FluidR3_GM/`;
const SAMPLE_NAMES=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const instrumentBanks=new Map(),instrumentLoads=new Map();
let activeInstrumentBuffers=null,activeInstrumentId='offline',instrumentRequest=0,instrumentSelection=0,instrumentResume=false;
function invalidateInstrumentChange(){instrumentRequest++;instrumentSelection++;instrumentResume=false}
async function fetchSample(url){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{const response=await fetch(url,{signal:controller.signal});if(!response.ok)throw Error('音源 HTTP '+response.status);return await response.arrayBuffer()}finally{clearTimeout(timer)}
}
async function mapAudio(items,job){
 const results=new Array(items.length);let next=0;
 await Promise.all(Array.from({length:Math.min(6,items.length)},async()=>{while(next<items.length){const index=next++;results[index]=await job(items[index])}}));
 return results;
}
function audibleSample(buffer){
 for(let channel=0;channel<buffer.numberOfChannels;channel++){
  const data=buffer.getChannelData(channel);for(let i=0;i<data.length;i++)if(Math.abs(data[i])>.00001)return true;
 }
 return false;
}
async function transposeBuffer(buffer,semitones){
 const rate=2**(semitones/12),length=Math.max(1,Math.ceil(buffer.length/rate)),C=window.OfflineAudioContext||window.webkitOfflineAudioContext;
 if(C){const offline=new C(buffer.numberOfChannels,length,buffer.sampleRate),source=offline.createBufferSource();source.buffer=buffer;source.playbackRate.value=rate;source.connect(offline.destination);source.start();return offline.startRendering()}
 const output=getAudio().createBuffer(buffer.numberOfChannels,length,buffer.sampleRate);
 for(let channel=0;channel<buffer.numberOfChannels;channel++){
  const input=buffer.getChannelData(channel),data=output.getChannelData(channel);
  for(let i=0;i<length;i++){const at=i*rate,index=Math.floor(at),fraction=at-index;data[i]=(input[index]||0)*(1-fraction)+(input[index+1]||0)*fraction}
 }
 return output;
}
async function loadInstrumentBank(id){
 const spec=instrumentSpec(id),ac=getAudio();
 if(spec.id==='offline'){await loadOfflinePiano();return state.pianoBuffers}
 if(instrumentBanks.has(spec.id))return instrumentBanks.get(spec.id);
 if(!instrumentLoads.has(spec.id)){
  const load=(async()=>{
   let items;
   if(spec.id==='salamander'){
    items=await mapAudio(ONLINE_PIANO_ROOTS,async([name,midi])=>[midi,await ac.decodeAudioData(await fetchSample(ONLINE_PIANO_BASE+name+'.mp3'))]);
   }else{
    const embedded=window.SKY_INSTRUMENT_SAMPLES?.[spec.bank];
    items=await mapAudio(Array.from({length:36},(_,i)=>i+60),async midi=>{
     let bytes;
     if(spec.mode==='offline'){
      if(!embedded?.[midi])throw Error('离线音色缺少采样 '+midi);
      bytes=base64ToBytes(embedded[midi]).buffer;
     }else{
      const note=SAMPLE_NAMES[midi%12]+(Math.floor(midi/12)-1);
      bytes=await fetchSample(FLUID_BASE+spec.bank+'-mp3/'+note+'.mp3');
     }
     return [midi,await ac.decodeAudioData(bytes)];
    });
   }
   const bank=new Map(items);
   if(bank.size!==(spec.id==='salamander'?12:36))throw Error('音源加载不完整');
   if([...bank.values()].some(buffer=>buffer.duration<.03))throw Error('音源采样无效');
   const valid=[...bank].filter(([,buffer])=>audibleSample(buffer));if(!valid.length)throw Error('音源没有有效声音');
   bank.repairedNotes=[];
   for(const [midi,buffer] of bank)if(!audibleSample(buffer)){
    const [root,reference]=valid.reduce((a,b)=>Math.abs(a[0]-midi)<=Math.abs(b[0]-midi)?a:b);
    bank.set(midi,await transposeBuffer(reference,midi-root));bank.repairedNotes.push(midi);
   }
   instrumentBanks.set(spec.id,bank);if(spec.id==='salamander')state.onlinePianoBuffers=bank;
   return bank;
  })().catch(error=>{instrumentLoads.delete(spec.id);throw error});
  instrumentLoads.set(spec.id,load);
 }
 return instrumentLoads.get(spec.id);
}
async function prepareInstrument(){
 try{if(window.navigator?.audioSession)window.navigator.audioSession.type='playback'}catch(error){console.warn('Audio session unavailable',error)}
 const ac=getAudio();await ac.resume();if(ac.state&&ac.state!=='running')throw Error('音频尚未启动，请再次点击播放');
 const project=state.project,spec=instrumentSpec(project?.playback?.instrument),request=++instrumentRequest;
 try{
  const bank=await loadInstrumentBank(spec.id);
  if(request!==instrumentRequest||project!==state.project)return false;
  activeInstrumentId=spec.id;activeInstrumentBuffers=bank;return true;
 }catch(error){
  if(request!==instrumentRequest||project!==state.project)return false;
  console.warn(spec.name+' 无法加载，将回退离线钢琴',error);
  await loadOfflinePiano();if(request!==instrumentRequest||project!==state.project)return false;
  activeInstrumentId='offline';activeInstrumentBuffers=state.pianoBuffers;
  if(project)project.playback.instrument='offline';$('instrumentSelect').value='offline';syncInstrumentPicker();saveLibrary();
  toast(spec.name+' 暂不可用，已切换经典钢琴',5200);return true;
 }
}
// A reusable bounded wheel animation for both instrument and range pickers.
function bindSmoothWheel(track,host,axis='x',limit=24,model=null){
 let raf=0,target=0,position=0,last=0,snapTimer=0;
 const read=()=>model?model.read():(axis==='x'?track.scrollLeft:track.scrollTop);
 const write=value=>{if(model)model.write(value);else if(axis==='x')track.scrollLeft=value;else track.scrollTop=value};
 const maximum=()=>Math.max(0,model?model.max():(axis==='x'?track.scrollWidth-track.clientWidth:track.scrollHeight-track.clientHeight));
 const cancel=()=>{cancelAnimationFrame(raf);clearTimeout(snapTimer);raf=0};
 const animate=now=>{
  if(host.hidden){cancel();return}const dt=Math.min(40,now-last);last=now;
  position+=(target-position)*(1-Math.exp(-dt/65));
  if(Math.abs(target-position)<.5){write(target);raf=0;return}
  write(position);raf=requestAnimationFrame(animate);
 };
 const start=()=>{if(!raf){position=read();last=performance.now();raf=requestAnimationFrame(animate)}};
 cancel.to=value=>{cancel();target=clamp(value,0,maximum());start()};
 host.addEventListener('wheel',event=>{
  event.preventDefault();let delta=event.deltaY+event.deltaX;
  if(event.deltaMode===1)delta*=16;if(event.deltaMode===2)delta*=axis==='x'?track.clientWidth:track.clientHeight;
  if(!delta)return;if(!raf)target=read();
  target=clamp(target+Math.sign(delta)*Math.min(limit,Math.abs(delta)*.22),0,maximum());start();
  clearTimeout(snapTimer);
  if(model?.snap)snapTimer=setTimeout(()=>{target=clamp(model.snap(target),0,maximum());start()},110);
 },{passive:false});
 host.addEventListener('pointerdown',cancel);host.addEventListener('keydown',cancel);
 return cancel;
}
let cancelInstrumentWheel=()=>{};
const instrumentViewport={position:0,row:31,step:36,touch:null,suppressClick:false};
function closeInstrumentPicker(returnFocus=false){cancelInstrumentWheel();$('instrumentMenu').hidden=true;$('instrumentToggle').setAttribute('aria-expanded','false');if(returnFocus)$('instrumentToggle').focus()}
function syncInstrumentPicker(){
 const spec=instrumentSpec(state.project?.playback?.instrument);
 $('instrumentSelect').value=spec.id;$('instrumentValue').textContent=spec.name;
 for(const button of $('instrumentOptions').querySelectorAll('[data-instrument]'))button.setAttribute('aria-selected',String(button.dataset.instrument===spec.id));
}
function positionInstrumentPicker(){
 const rect=$('instrumentToggle').getBoundingClientRect(),menu=$('instrumentMenu'),view=instrumentViewport;
 view.row=rect.height;view.step=rect.height+5;
 const above=Math.min(2*view.step,view.position*view.step,Math.max(0,rect.top-8));
 const below=Math.min(2*view.step,(INSTRUMENTS.length-1-view.position)*view.step,Math.max(0,innerHeight-rect.bottom-8));
 menu.style.width=rect.width+'px';menu.style.left=rect.left+'px';menu.style.top=(rect.top-above)+'px';menu.style.height=(above+rect.height+below)+'px';
 const focus=$('instrumentCurrent');focus.style.top=above+'px';focus.style.height=rect.height+'px';
 const buttons=$('instrumentOptions').querySelectorAll('[data-instrument]');
 for(let i=0;i<buttons.length;i++){
  const y=above+(i-view.position)*view.step,visible=y+view.row>0&&y<above+view.row+below;
  buttons[i].style.top=y+'px';buttons[i].style.height=view.row+'px';buttons[i].style.visibility=visible?'visible':'hidden';
 }
 menu.dataset.position=String(view.position);
}
function openInstrumentPicker(){
 closeRangePicker();syncInstrumentPicker();cancelInstrumentWheel();
 instrumentViewport.position=Math.max(0,INSTRUMENTS.findIndex(spec=>spec.id===state.project?.playback?.instrument));
 $('instrumentMenu').hidden=false;$('instrumentToggle').setAttribute('aria-expanded','true');positionInstrumentPicker();
 $('instrumentOptions').querySelector('[aria-selected="true"]')?.focus({preventScroll:true});
}
async function chooseInstrument(id){
 if(!state.project)return;const project=state.project,selection=++instrumentSelection,was=state.isPlaying||instrumentResume;
 instrumentResume=was;if(state.isPlaying)pauseSong();project.playback.instrument=instrumentSpec(id).id;saveLibrary();syncInstrumentPicker();closeInstrumentPicker(true);
 toast('正在准备'+instrumentSpec(id).name+'…',1300);
 try{const ready=await preloadPiano();if(selection!==instrumentSelection||project!==state.project)return;instrumentResume=false;if(ready&&was&&!state.isPlaying)await playPause()}catch(error){if(selection===instrumentSelection)instrumentResume=false;console.warn(error);toast('音源加载异常：'+error.message,5000)}
}
function bindInstrumentPicker(){
 const menu=$('instrumentMenu'),trigger=$('instrumentToggle'),options=$('instrumentOptions'),view=instrumentViewport;
 for(const spec of INSTRUMENTS){
  const button=document.createElement('button');button.type='button';button.dataset.instrument=spec.id;button.setAttribute('role','option');button.setAttribute('aria-selected','false');button.tabIndex=-1;button.textContent=spec.name+' · '+(spec.mode==='offline'?'离线':'在线');
  button.onclick=()=>{if(view.suppressClick){view.suppressClick=false;return}if(state.project?.playback?.instrument===spec.id)closeInstrumentPicker(true);else chooseInstrument(spec.id)};options.append(button);
 }
 const move=position=>{view.position=clamp(position,0,INSTRUMENTS.length-1);positionInstrumentPicker()};
 cancelInstrumentWheel=bindSmoothWheel(options,menu,'y',18,{read:()=>view.position*view.step,write:pixels=>move(pixels/view.step),max:()=>(INSTRUMENTS.length-1)*view.step,snap:pixels=>Math.round(pixels/view.step)*view.step});
 trigger.onclick=()=>menu.hidden?openInstrumentPicker():closeInstrumentPicker();
 trigger.onkeydown=event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();openInstrumentPicker()}};
 menu.onkeydown=event=>{
  const buttons=[...options.querySelectorAll('[data-instrument]')],index=buttons.indexOf(document.activeElement);let next;
  if(event.key==='ArrowDown')next=Math.min(buttons.length-1,index+1);if(event.key==='ArrowUp')next=Math.max(0,index-1);
  if(event.key==='Home')next=0;if(event.key==='End')next=buttons.length-1;
  if(next!==undefined){event.preventDefault();cancelInstrumentWheel();move(next);buttons[next].focus({preventScroll:true})}
  if(event.key==='Escape'){event.preventDefault();closeInstrumentPicker(true)}if(event.key==='Tab')closeInstrumentPicker();
 };
 menu.addEventListener('pointerdown',event=>{if(event.pointerType==='touch'){view.touch={id:event.pointerId,y:event.clientY,position:view.position};view.suppressClick=false}});
 menu.addEventListener('pointermove',event=>{
  if(!view.touch||view.touch.id!==event.pointerId)return;
  const dy=event.clientY-view.touch.y;
  if(Math.abs(dy)>6){view.suppressClick=true;menu.setPointerCapture(event.pointerId);move(view.touch.position-dy/view.step)}
 });
 const endTouch=()=>{if(view.touch&&view.suppressClick)cancelInstrumentWheel.to(Math.round(view.position)*view.step);view.touch=null;setTimeout(()=>view.suppressClick=false,0)};
 menu.addEventListener('pointerup',endTouch);menu.addEventListener('pointercancel',endTouch);
 document.addEventListener('pointerdown',event=>{if(!menu.hidden&&!menu.contains(event.target)&&!trigger.contains(event.target))closeInstrumentPicker()});
 window.addEventListener('resize',()=>{if(!menu.hidden){cancelInstrumentWheel();positionInstrumentPicker()}});
 window.addEventListener('scroll',event=>{if(!menu.hidden&&event.target!==menu&&!menu.contains(event.target))closeInstrumentPicker()},true);
}
