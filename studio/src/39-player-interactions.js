// One player interaction entry for every score and theme.
function syncVolumeControl(){
 const rules=PLAYER_RULES.volume,percent=Math.round(state.volume*100),slider=$(rules.sliderId);
 slider.value=String(percent);slider.setAttribute('aria-valuetext',percent===0?'静音':percent+'%');$(rules.outputId).textContent=percent+'%';updateVolumeAudio();
}
function bindPlayerInteractions(){
 $(PLAYER_RULES.volume.sliderId).oninput=ev=>{state.volume=normalizeVolume(Number(ev.target.value)/100);if(state.project){state.project.playback.volume=state.volume;saveLibrary()}syncVolumeControl()};

 $('backLibrary').onclick=goHome;
 $('rollWindow').innerHTML='';for(const seconds of PLAYER_RULES.roll.windowsSeconds){const option=document.createElement('option');option.value=String(seconds);option.textContent=seconds+'秒';$('rollWindow').append(option)}
 $('playBtn').onclick=()=>playPause();$('restartBtn').onclick=()=>seekTo(0);
 $('sustainSlider').oninput=ev=>{state.sustain=Number(ev.target.value)/100;$('sustainValue').textContent=Math.round(state.sustain*100)+'%';if(state.project){state.project.playback.sustain=state.sustain;saveLibrary()}updateSustainAudio()};
 $('speedSelect').onchange=ev=>{let was=state.isPlaying;if(was)pauseSong();state.rate=Number(ev.target.value);if(state.project){state.project.playback.rate=state.rate;saveLibrary()}if(was)playPause()};
 $('rollWindow').onchange=ev=>{const finishing=Boolean(state.rollFinish),frame=rollFrame(),fraction=frame.phase/frame.windowMs;cancelRollFinish();state.windowSec=Number(ev.target.value);state.rollPageStart=rollSeekOrigin(state.position,fraction);if(finishing)finishRollScan();else drawRoll()};
 $('rollWindow').value=String(state.windowSec);$('stepPrev').onclick=()=>stepEvent(-1);$('stepNext').onclick=()=>stepEvent(1);
 $('seekSlider').oninput=ev=>seekTo(Number(ev.target.value));
 $('rollSeekSlider').oninput=ev=>seekTo(Number(ev.target.value),true);
 $('pagePrev').onclick=()=>{pauseSong();let pg=Math.floor(state.selected/BEATS_PER_PAGE);let ev=scoreEvents(state.project),i=Math.max(0,(pg-1)*BEATS_PER_PAGE);seekTo(ev[i]?.timeMs||0)};
 $('pageNext').onclick=()=>{pauseSong();let pg=Math.floor(state.selected/BEATS_PER_PAGE);let ev=scoreEvents(state.project),i=Math.min(ev.length-1,(pg+1)*BEATS_PER_PAGE);seekTo(ev[i]?.timeMs||0)};
 $('resetKeyEdit').onclick=()=>{if(!state.editMode)return;let p=state.project;let original=BUILTINS.find(x=>x.id===(p.provenance?.derivedFrom||p.id));let e=scoreEvents(p)[state.selected],reference=original&&scoreEvents(original)[state.selected];if(!e)return;if(reference){rememberEdit();e.notes=[...reference.notes];e.durationMs=reference.durationMs;e.confidence='source';renderKeyBoard();renderBeatGrid(true);updateVisual();toast('已恢复此格的原始琴键')}else toast('导入曲目无内置原谱，请通过导入文件恢复')};
 $('keySelect').onchange=ev=>{if(!state.project)return;let was=state.isPlaying;if(was)pauseSong();state.tuning=ev.target.value;state.project.playback.tuning=state.tuning;saveLibrary();setTuningButtons();renderKeyBoard();renderBeatGrid(true);updateVisual();if(state.editMode)syncEditorFields();if(was)playPause()};
 $('instrumentSelect').onchange=ev=>chooseInstrument(ev.target.value);
 document.addEventListener('keydown',e=>{if(state.mode!=='player'||e.target.closest('input,select,textarea,button'))return;if(e.code===PLAYER_RULES.keyboard.playPause){e.preventDefault();playPause()}else if(e.code===PLAYER_RULES.keyboard.nextEvent){e.preventDefault();stepEvent(1)}else if(e.code===PLAYER_RULES.keyboard.previousEvent){e.preventDefault();stepEvent(-1)}});
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
 closeInstrumentPicker();setTuningButtons();$('keyRangeMenu').hidden=false;$('keyRangeToggle').setAttribute('aria-expanded','true');positionRangePicker();
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
 view.row=rect.height;view.step=rect.height+PLAYER_RULES.selectors.instrumentRowGapPx;
 const above=0; // Expand downward from the original control, never above it.
 const below=Math.min(PLAYER_RULES.selectors.instrumentRowsBelow*view.step,(INSTRUMENTS.length-1-view.position)*view.step,Math.max(0,innerHeight-rect.bottom-8));
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
 menu.tabIndex=-1;
 const move=position=>{view.position=clamp(position,0,INSTRUMENTS.length-1);positionInstrumentPicker();if(options.contains(document.activeElement)&&document.activeElement.style.visibility==='hidden')menu.focus({preventScroll:true})};
 cancelInstrumentWheel=bindSmoothWheel(options,menu,'y',PLAYER_RULES.selectors.instrumentMaxStepPx,{read:()=>view.position*view.step,write:pixels=>move(pixels/view.step),max:()=>(INSTRUMENTS.length-1)*view.step,snap:pixels=>Math.round(pixels/view.step)*view.step});
 trigger.onclick=()=>menu.hidden?openInstrumentPicker():closeInstrumentPicker();
 trigger.onkeydown=event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();openInstrumentPicker()}};
 menu.onkeydown=event=>{
  const buttons=[...options.querySelectorAll('[data-instrument]')],focused=buttons.indexOf(document.activeElement),index=focused>=0?focused:Math.round(view.position);let next;
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
