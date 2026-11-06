// One player interaction entry for every score and theme.
function syncVolumeControl(){
 const rules=PLAYER_RULES.volume,percent=Math.round(state.volume*100),slider=$(rules.sliderId);
 slider.value=String(percent);slider.setAttribute('aria-valuetext',percent===0?'静音':percent+'%');$(rules.outputId).textContent=percent+'%';updateVolumeAudio();
}
let cancelRollDrag=()=>{};
function bindRollPointerSeek(){
 const canvas=$('rollCanvas');let drag=null;
 const stop=()=>{const pointerId=drag?.pointerId;drag=null;if(pointerId!==undefined&&canvas.hasPointerCapture(pointerId))canvas.releasePointerCapture(pointerId)};
 cancelRollDrag=stop;
 const move=event=>{
  if(!drag||event.pointerId!==drag.pointerId)return;
  if(state.project!==drag.project||state.mode!=='player'){stop();return}
  const fraction=clamp((event.clientX-drag.rectLeft-drag.left)/drag.plotW,0,1);
  const end=drag.end<state.project.durationMs?drag.end-.001:drag.end;
  seekTo(clamp(drag.begin+fraction*drag.windowMs,0,end),false,drag);
 };
 canvas.addEventListener('pointerdown',event=>{
  if(!PLAYER_RULES.roll.pointerSeek||!state.project||event.button!==0||event.isPrimary===false)return;
  if(beginFineNoteDrag(event,canvas))return;
  const rect=canvas.getBoundingClientRect(),frame=rollFrame(),geometry=rollPlotGeometry(rect,frame),x=event.clientX-rect.left,y=event.clientY-rect.top;
  if(geometry.plotW<=0||x<geometry.left||x>geometry.left+geometry.plotW||y<geometry.top-6||y>rect.height-geometry.bottom+6)return;
  event.preventDefault();pauseSong();cancelRollFinish();
  drag={...frame,...geometry,rectLeft:rect.left,pointerId:event.pointerId,project:state.project};canvas.setPointerCapture(event.pointerId);move(event);
 });
 canvas.addEventListener('pointermove',move);
 canvas.addEventListener('pointerup',event=>{if(drag&&event.pointerId===drag.pointerId){move(event);stop()}});
 canvas.addEventListener('pointercancel',stop);canvas.addEventListener('lostpointercapture',()=>{drag=null});
 window.addEventListener('blur',stop);
}
function bindPlayerInteractions(){
 $(PLAYER_RULES.volume.sliderId).oninput=ev=>{state.volume=normalizeVolume(Number(ev.target.value)/100);if(state.project){state.project.playback.volume=state.volume;saveLibrary()}syncVolumeControl()};

 bindRollPointerSeek();
 $('backLibrary').onclick=goHome;
 $('rollWindow').innerHTML='';for(const seconds of PLAYER_RULES.roll.windowsSeconds){const option=document.createElement('option');option.value=String(seconds);option.textContent=seconds+'秒';$('rollWindow').append(option)}
 $('playBtn').onclick=()=>playPause();$('restartBtn').onclick=()=>seekTo(0);
 $('sustainSlider').oninput=ev=>{state.sustain=Number(ev.target.value)/100;$('sustainValue').textContent=Math.round(state.sustain*100)+'%';if(state.project){state.project.playback.sustain=state.sustain;saveLibrary()}updateSustainAudio()};
 $('speedSelect').onchange=ev=>{let was=state.isPlaying;if(was)pauseSong();state.rate=Number(ev.target.value);syncSpeedPicker();if(state.project){state.project.playback.rate=state.rate;saveLibrary()}if(was)playPause()};
 $('rollWindow').onchange=ev=>{const finishing=Boolean(state.rollFinish),frame=rollFrame(),fraction=frame.phase/frame.windowMs;cancelRollFinish();state.windowSec=Number(ev.target.value);state.rollPageStart=rollSeekOrigin(state.position,fraction);if(finishing)finishRollScan();else drawRoll()};
 $('rollWindow').value=String(state.windowSec);$('stepPrev').onclick=()=>stepEvent(-1);$('stepNext').onclick=()=>stepEvent(1);
 $('seekSlider').oninput=ev=>seekTo(Number(ev.target.value));
 $('rollSeekSlider').oninput=ev=>seekTo(Number(ev.target.value),true);
 $('pagePrev').onclick=()=>{pauseSong();let pg=Math.floor(state.selected/BEATS_PER_PAGE);let ev=scoreEvents(state.project),i=Math.max(0,(pg-1)*BEATS_PER_PAGE);seekTo(ev[i]?.timeMs||0)};
 $('pageNext').onclick=()=>{pauseSong();let pg=Math.floor(state.selected/BEATS_PER_PAGE);let ev=scoreEvents(state.project),i=Math.min(ev.length-1,(pg+1)*BEATS_PER_PAGE);seekTo(ev[i]?.timeMs||0)};
 $('resetKeyEdit').onclick=()=>{if(!state.editMode)return;let p=state.project;let original=BUILTINS.find(x=>x.id===(p.provenance?.derivedFrom||p.id));let e=scoreEvents(p)[state.selected],reference=original&&scoreEvents(original)[state.selected];if(!e)return;if(reference){rememberEdit();e.notes=[...reference.notes];e.durationMs=reference.durationMs;e.confidence='source';renderKeyBoard();renderBeatGrid(true);updateVisual();toast('已恢复此格的原始琴键')}else toast('导入曲目无内置原谱，请通过导入文件恢复')};
 $('keySelect').onchange=ev=>{if(!state.project)return;let was=state.isPlaying;if(was)pauseSong();state.tuning=ev.target.value;state.project.playback.tuning=state.tuning;saveLibrary();setTuningButtons();renderKeyBoard();renderBeatGrid(true);updateVisual();if(state.editMode)syncEditorFields();if(was)playPause()};
 $('instrumentSelect').onchange=ev=>chooseInstrument(ev.target.value);
 document.addEventListener('keydown',e=>{if(state.mode!=='player'||document.querySelector('dialog[open]')||e.target.closest('input,select,textarea,button'))return;if(e.code===PLAYER_RULES.keyboard.playPause){e.preventDefault();playPause()}else if(e.code===PLAYER_RULES.keyboard.nextEvent){e.preventDefault();stepEvent(1)}else if(e.code===PLAYER_RULES.keyboard.previousEvent){e.preventDefault();stepEvent(-1)}});
 window.addEventListener('resize',()=>{if(state.mode==='player')requestAnimationFrame(()=>{drawRoll();if(!state.isPlaying)initializeScene()})});
}
function setTuningButtons(){
 const key=Object.hasOwn(KEY_ROOTS,state.tuning)?state.tuning:'C';
 $('keySelect').value=key;$('keyRangeValue').textContent=key==='sky-original'?'光遇原调':KEY_DEGREES[key][0]+' 大调';syncInstrumentPicker();
 for(const button of document.querySelectorAll('#keyRangeMenu [data-key]'))button.setAttribute('aria-selected',String(button.dataset.key===key));
}
let cancelRangeWheel=()=>{};
function cancelRangeScroll(){cancelRangeWheel()}
function closeRangePicker(returnFocus=false){cancelRangeScroll();$('keyRangeMenu').hidden=true;$('keyRangeToggle').setAttribute('aria-expanded','false');if(returnFocus)$('keyRangeToggle').focus()}
function positionRangePicker(){
 const trigger=$('keyRangeToggle'),menu=$('keyRangeMenu'),rect=trigger.getBoundingClientRect();
 let width=Math.min(272,Math.max(0,rect.left-20)),left=rect.left-width-8;
 // Narrow screens retain one horizontal strip; never fall back to a downward menu.
 if(width<120){width=Math.min(272,innerWidth-24);left=12}
 menu.style.width=width+'px';menu.style.left=left+'px';menu.style.top=Math.max(8,Math.min(innerHeight-46,rect.top+(rect.height-42)/2))+'px';
}
function openRangePicker(){
 closeInstrumentPicker();closeSpeedPicker();setTuningButtons();$('keyRangeMenu').hidden=false;$('keyRangeToggle').setAttribute('aria-expanded','true');positionRangePicker();
 const selected=$('keyRangeMenu').querySelector('[aria-selected="true"]');selected?.focus({preventScroll:true});selected?.scrollIntoView({block:'nearest',inline:'nearest'});
}
function bindRangePicker(){
 const trigger=$('keyRangeToggle'),menu=$('keyRangeMenu'),track=$('keyRangeTrack');
 trigger.onclick=()=>menu.hidden?openRangePicker():closeRangePicker();
 cancelRangeWheel=bindSmoothWheel(track,menu,'x',PLAYER_RULES.selectors.rangeMaxStepPx);
 trigger.onkeydown=event=>{if(['ArrowLeft','ArrowRight','ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();openRangePicker()}};
 for(const button of menu.querySelectorAll('[data-key]'))button.onclick=()=>{
  $('keySelect').value=button.dataset.key;$('keySelect').onchange({target:$('keySelect')});closeRangePicker(true);
 };
 menu.onkeydown=event=>{
  cancelRangeScroll();
  const options=[...menu.querySelectorAll('[data-key]')],index=options.indexOf(document.activeElement);let next;
  if(event.key==='ArrowLeft')next=(index-1+options.length)%options.length;
  if(event.key==='ArrowRight')next=(index+1)%options.length;
  if(event.key==='Home')next=0;if(event.key==='End')next=options.length-1;
  if(next!==undefined){event.preventDefault();options[next].focus({preventScroll:true});options[next].scrollIntoView({block:'nearest',inline:'nearest'})}
  if(event.key==='Escape'){event.preventDefault();closeRangePicker(true)}
  if(event.key==='Tab')closeRangePicker();
 };
 document.addEventListener('pointerdown',event=>{if(!menu.hidden&&!menu.contains(event.target)&&!trigger.contains(event.target))closeRangePicker()});
 window.addEventListener('resize',()=>{if(!menu.hidden)positionRangePicker()});
 window.addEventListener('scroll',event=>{if(!menu.hidden&&event.target!==menu&&!menu.contains(event.target))closeRangePicker()},true);
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
  position+=(target-position)*(1-Math.exp(-dt/PLAYER_RULES.selectors.smoothingMs));
  if(Math.abs(target-position)<.5){write(target);raf=0;return}
  write(position);raf=requestAnimationFrame(animate);
 };
 const start=()=>{if(!raf){position=read();last=performance.now();raf=requestAnimationFrame(animate)}};
 cancel.to=value=>{cancel();target=clamp(value,0,maximum());start()};
 host.addEventListener('wheel',event=>{
  event.preventDefault();let delta=event.deltaY+event.deltaX;
  if(event.deltaMode===1)delta*=16;if(event.deltaMode===2)delta*=axis==='x'?track.clientWidth:track.clientHeight;
  if(!delta)return;if(!raf)target=read();
  target=clamp(target+Math.sign(delta)*Math.min(limit,Math.abs(delta)*PLAYER_RULES.selectors.wheelGain),0,maximum());start();
  clearTimeout(snapTimer);
  if(model?.snap)snapTimer=setTimeout(()=>{target=clamp(model.snap(target),0,maximum());start()},PLAYER_RULES.selectors.instrumentSnapDelayMs);
 },{passive:false});
 host.addEventListener('pointerdown',cancel);host.addEventListener('keydown',cancel);
 return cancel;
}
// One downward picker template for instruments and playback speed.
function createDownwardPicker(config){
 const trigger=$(config.trigger),menu=$(config.menu),options=$(config.options),focus=$(config.focus),items=config.items;
 const view={position:0,row:31,step:36,touch:null,suppressClick:false};let cancelWheel=()=>{};
 const buttons=items.map(item=>{const button=document.createElement('button');button.type='button';button.dataset.value=item.value;button.dataset[config.attribute]=item.value;button.setAttribute('role','option');button.setAttribute('aria-selected','false');button.tabIndex=-1;button.textContent=item.label;button.onclick=()=>{if(view.suppressClick){view.suppressClick=false;return}config.choose(item.value)};options.append(button);return button});
 function sync(){for(const button of buttons)button.setAttribute('aria-selected',String(button.dataset.value===config.selected()))}
 function close(returnFocus=false){cancelWheel();menu.hidden=true;trigger.setAttribute('aria-expanded','false');if(returnFocus)trigger.focus()}
 function position(){
  const rect=trigger.getBoundingClientRect();view.row=rect.height;view.step=rect.height+PLAYER_RULES.selectors.instrumentRowGapPx;
  const below=Math.min(config.rowsBelow()*view.step,(items.length-1-view.position)*view.step,Math.max(0,innerHeight-rect.bottom-8));
  menu.style.width=rect.width+'px';menu.style.left=rect.left+'px';menu.style.top=rect.top+'px';menu.style.height=(rect.height+below)+'px';focus.style.top='0px';focus.style.height=rect.height+'px';
  buttons.forEach((button,i)=>{const y=(i-view.position)*view.step;button.style.top=y+'px';button.style.height=view.row+'px';button.style.visibility=y+view.row>0&&y<view.row+below?'visible':'hidden'});menu.dataset.position=String(view.position);
 }
 function move(value){view.position=clamp(value,0,items.length-1);position();if(options.contains(document.activeElement)&&document.activeElement.style.visibility==='hidden')menu.focus({preventScroll:true})}
 function open(){config.beforeOpen();sync();cancelWheel();view.position=Math.max(0,items.findIndex(item=>item.value===config.selected()));menu.hidden=false;trigger.setAttribute('aria-expanded','true');position();buttons.find(button=>button.dataset.value===config.selected())?.focus({preventScroll:true})}
 menu.tabIndex=-1;
 cancelWheel=bindSmoothWheel(options,menu,'y',PLAYER_RULES.selectors.instrumentMaxStepPx,{read:()=>view.position*view.step,write:pixels=>move(pixels/view.step),max:()=>(items.length-1)*view.step,snap:pixels=>Math.round(pixels/view.step)*view.step});
 trigger.onclick=()=>menu.hidden?open():close();trigger.onkeydown=event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();open()}};
 menu.onkeydown=event=>{
  const focused=buttons.indexOf(document.activeElement),index=focused>=0?focused:Math.round(view.position);let next;
  if(event.key==='ArrowDown')next=Math.min(buttons.length-1,index+1);if(event.key==='ArrowUp')next=Math.max(0,index-1);if(event.key==='Home')next=0;if(event.key==='End')next=buttons.length-1;
  if(next!==undefined){event.preventDefault();cancelWheel();move(next);buttons[next].focus({preventScroll:true})}
  if(['Enter',' '].includes(event.key)){event.preventDefault();event.stopPropagation();config.choose(items[index].value)}
  if(event.key==='Escape'){event.preventDefault();close(true)}if(event.key==='Tab')close();
 };
 menu.addEventListener('pointerdown',event=>{if(event.pointerType==='touch'){view.touch={id:event.pointerId,y:event.clientY,position:view.position};view.suppressClick=false}});
 menu.addEventListener('pointermove',event=>{if(!view.touch||view.touch.id!==event.pointerId)return;const dy=event.clientY-view.touch.y;if(Math.abs(dy)>6){view.suppressClick=true;menu.setPointerCapture(event.pointerId);move(view.touch.position-dy/view.step)}});
 const endTouch=()=>{if(view.touch&&view.suppressClick)cancelWheel.to(Math.round(view.position)*view.step);view.touch=null;setTimeout(()=>view.suppressClick=false,0)};
 menu.addEventListener('pointerup',endTouch);menu.addEventListener('pointercancel',endTouch);
 document.addEventListener('pointerdown',event=>{if(!menu.hidden&&!menu.contains(event.target)&&!trigger.contains(event.target))close()});
 window.addEventListener('resize',()=>{if(!menu.hidden){cancelWheel();position()}});window.addEventListener('scroll',event=>{if(!menu.hidden&&event.target!==menu&&!menu.contains(event.target))close()},true);
 return {open,close,sync};
}
let instrumentPicker=null,speedPicker=null;
function closeInstrumentPicker(returnFocus=false){instrumentPicker?.close(returnFocus)}
function closeSpeedPicker(returnFocus=false){speedPicker?.close(returnFocus)}
function syncInstrumentPicker(){const spec=instrumentSpec(state.project?.playback?.instrument);$('instrumentSelect').value=spec.id;$('instrumentValue').textContent=spec.name;instrumentPicker?.sync()}
function syncSpeedPicker(){$('speedSelect').value=String(state.rate);$('speedValue').textContent=state.rate.toFixed(2)+'×';speedPicker?.sync()}
async function chooseInstrument(id){
 if(!state.project)return;const project=state.project,selection=++instrumentSelection,was=state.isPlaying||instrumentResume;
 instrumentResume=was;if(state.isPlaying)pauseSong();project.playback.instrument=instrumentSpec(id).id;saveLibrary();syncInstrumentPicker();closeInstrumentPicker(true);
 toast('正在准备'+instrumentSpec(id).name+'…',1300);
 try{const ready=await preloadPiano();if(selection!==instrumentSelection||project!==state.project)return;instrumentResume=false;if(ready&&was&&!state.isPlaying)await playPause()}catch(error){if(selection===instrumentSelection)instrumentResume=false;console.warn(error);toast('音源加载异常：'+error.message,5000)}
}

function bindInstrumentPicker(){
 instrumentPicker=createDownwardPicker({trigger:'instrumentToggle',menu:'instrumentMenu',options:'instrumentOptions',focus:'instrumentCurrent',attribute:'instrument',items:INSTRUMENTS.map(spec=>({value:spec.id,label:spec.name+' · '+(spec.mode==='offline'?'离线':'在线')})),selected:()=>instrumentSpec(state.project?.playback?.instrument).id,rowsBelow:()=>PLAYER_RULES.selectors.instrumentRowsBelow,beforeOpen:()=>{closeRangePicker();closeSpeedPicker()},choose:id=>{if(state.project?.playback?.instrument===id)closeInstrumentPicker(true);else chooseInstrument(id)}});
}
function bindSpeedPicker(){
 $('speedSelect').innerHTML='';for(const rate of PLAYER_RULES.playbackRates){const option=document.createElement('option');option.value=String(rate);option.textContent=rate.toFixed(2)+'×';$('speedSelect').append(option)}
 speedPicker=createDownwardPicker({trigger:'speedToggle',menu:'speedMenu',options:'speedOptions',focus:'speedCurrent',attribute:'speed',items:PLAYER_RULES.playbackRates.map(rate=>({value:String(rate),label:rate.toFixed(2)+'×'})),selected:()=>String(state.rate),rowsBelow:()=>PLAYER_RULES.selectors.speedRowsBelow,beforeOpen:()=>{closeRangePicker();closeInstrumentPicker()},choose:value=>{$('speedSelect').value=value;$('speedSelect').onchange({target:$('speedSelect')});closeSpeedPicker(true)}});
}
