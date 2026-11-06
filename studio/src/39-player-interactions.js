// One player interaction entry for every score and theme.
// Notification timing belongs to the interaction layer; colors belong to the template.
function toast(text,ms=PLAYER_RULES.notifications.durationMs){
 const el=$(PLAYER_RULES.notifications.controlId);clearTimeout(state.toastTimer);
 syncStatusNotificationAppearance();el.textContent=text;el.hidden=false;
 if(el.showPopover&&!el.matches(':popover-open'))el.showPopover();
 state.toastTimer=setTimeout(()=>{if(el.hidePopover&&el.matches(':popover-open'))el.hidePopover();el.hidden=true},ms);
}
const playerValuePickers=new Map();
function cancelPlayerValueScroll(){for(const picker of playerValuePickers.values())picker.cancel()}
function syncPlayerValue(kind){
 const el=$(PLAYER_RULES[kind].controlId),percent=Math.round(state[kind]*100);
 el.value=String(percent);el.setAttribute('aria-valuenow',String(percent));el.setAttribute('aria-valuetext',kind==='volume'&&percent===0?'静音':percent+'%');
 playerValuePickers.get(kind)?.sync(percent);
}
function syncVolumeControl(){syncPlayerValue('volume');updateVolumeAudio()}
function syncSustainControl(){syncPlayerValue('sustain');updateSustainAudio()}
function bindPlayerValuePicker(kind){
 const el=$(PLAYER_RULES[kind].controlId),row=PLAYER_RULES.valuePicker.rowHeightPx;
 const commit=percent=>{const value=clamp(Math.round(Number.isFinite(percent)?percent:state[kind]*100),0,100);if(state[kind]===value/100)return;state[kind]=value/100;el.value=String(value);el.setAttribute('aria-valuenow',String(value));el.setAttribute('aria-valuetext',kind==='volume'&&value===0?'静音':value+'%');if(state.project){state.project.playback[kind]=state[kind];saveLibrary()}if(kind==='volume')updateVolumeAudio();else updateSustainAudio()};
 el.oninput=()=>{commit(Number(el.value));playerValuePickers.get(kind)?.sync(Math.round(state[kind]*100))};
 // The headless DOM harness does not implement scrolling; the real browser owns animation.
 if(!document.createComment)return;
 const track=el.querySelector('.value-picker-track');let position=(100-Math.round(state[kind]*100))*row,drag=null;
 for(let n=100;n>=0;n--){const cell=document.createElement('span');cell.textContent=String(n);track.append(cell)}
 const paint=value=>{position=value;track.style.transform='translateY('+(-position)+'px)';commit(100-value/row)};
 const wheel=bindSmoothWheel(track,el,'y',PLAYER_RULES.valuePicker.wheelMaxStepPx,{read:()=>position,write:paint,max:()=>100*row,snap:value=>Math.round(value/row)*row,wheelGain:PLAYER_RULES.valuePicker.wheelGain});
 const sync=value=>{wheel();position=(100-value)*row;track.style.transform='translateY('+(-position)+'px)'};
 el.onkeydown=event=>{let value=Math.round(state[kind]*100);if(['ArrowUp','ArrowRight'].includes(event.key))value++;else if(['ArrowDown','ArrowLeft'].includes(event.key))value--;else if(event.key==='Home')value=0;else if(event.key==='End')value=100;else return;event.preventDefault();event.stopPropagation();commit(value);sync(Math.round(state[kind]*100))};
 el.addEventListener('pointerdown',event=>{if(event.button!==0)return;wheel();el.focus();drag={id:event.pointerId,y:event.clientY,start:position};el.setPointerCapture(event.pointerId)});
 el.addEventListener('pointermove',event=>{if(drag?.id===event.pointerId){event.preventDefault();paint(clamp(drag.start+drag.y-event.clientY,0,100*row))}});
 const stop=event=>{if(drag?.id!==event.pointerId)return;drag=null;if(el.hasPointerCapture(event.pointerId))el.releasePointerCapture(event.pointerId);wheel.to(Math.round(position/row)*row)};
 el.addEventListener('pointerup',stop);el.addEventListener('pointercancel',stop);
 playerValuePickers.set(kind,{sync,cancel:wheel});sync(Math.round(state[kind]*100));
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
 bindPlayerValuePicker('volume');bindPlayerValuePicker('sustain');

 bindRollPointerSeek();
 $('backLibrary').onclick=goHome;
 $('rollWindow').innerHTML='';for(const seconds of PLAYER_RULES.roll.windowsSeconds){const option=document.createElement('option');option.value=String(seconds);option.textContent=seconds+'秒';$('rollWindow').append(option)}
 $('playBtn').onclick=()=>playPause();$('restartBtn').onclick=()=>seekTo(0);

 $('speedSelect').onchange=ev=>{let was=state.isPlaying;if(was)pauseSong();state.rate=Number(ev.target.value);syncSpeedPicker();if(state.project){state.project.playback.rate=state.rate;saveLibrary()}if(was)playPause()};
 $('rollWindow').onchange=ev=>{const finishing=Boolean(state.rollFinish),frame=rollFrame(),fraction=frame.phase/frame.windowMs;cancelRollFinish();state.windowSec=Number(ev.target.value);state.rollPageStart=rollSeekOrigin(state.position,fraction);if(finishing)finishRollScan();else drawRoll()};
 $('rollWindow').value=String(state.windowSec);$('stepPrev').onclick=()=>stepEvent(-1);$('stepNext').onclick=()=>stepEvent(1);
 $('seekSlider').oninput=ev=>seekTo(Number(ev.target.value));
 $('rollSeekSlider').oninput=ev=>seekTo(Number(ev.target.value),true);
 $('pagePrev').onclick=()=>seekBeatPage(-1);
 $('pageNext').onclick=()=>seekBeatPage(1);
 $('resetKeyEdit').onclick=()=>{if(!canEditScore())return;const view=rollFrame();let p=state.project;let original=BUILTINS.find(x=>x.id===(p.provenance?.derivedFrom||p.id));let e=scoreEvents(p)[state.selected],reference=original&&scoreEvents(original)[state.selected];if(!e)return;if(reference){rememberEdit();e.notes=[...reference.notes];e.durationMs=reference.durationMs;e.confidence='source';settleFineRollView(view,e);renderKeyBoard();renderBeatGrid(true);updateVisual();toast('已恢复此格的原始琴键')}else toast('导入曲目无内置原谱，请通过导入文件恢复')};
 $('keySelect').onchange=ev=>{if(!state.project)return;let was=state.isPlaying;if(was)pauseSong();state.tuning=ev.target.value;state.project.playback.tuning=state.tuning;saveLibrary();setTuningButtons();renderKeyBoard();renderBeatGrid(true);updateVisual();if(state.editMode)syncEditorFields();if(was)playPause()};
 $('instrumentSelect').onchange=ev=>chooseInstrument(ev.target.value);
 document.addEventListener('keydown',e=>{if(state.mode!=='player'||document.querySelector('dialog[open]')||e.target.closest('input,select,textarea,button'))return;if(e.code===PLAYER_RULES.keyboard.playPause){e.preventDefault();playPause()}else if(e.code===PLAYER_RULES.keyboard.nextEvent){e.preventDefault();stepEvent(1)}else if(e.code===PLAYER_RULES.keyboard.previousEvent){e.preventDefault();stepEvent(-1)}});
 window.addEventListener('resize',()=>{if(state.mode==='player')requestAnimationFrame(()=>{drawRoll();if(!state.isPlaying)initializeScene()})});
}
function setTuningButtons(){
 const key=Object.hasOwn(KEY_ROOTS,state.tuning)?state.tuning:'C';
 $('keySelect').value=key;$('keyRangeValue').textContent=key==='sky-original'?'光遇原调':KEY_DEGREES[key][0]+' 大调';syncInstrumentPicker();
 for(const button of document.querySelectorAll('#keyRangeMenu [data-key]'))button.setAttribute('aria-selected',String(button.dataset.key===key));
 syncConsoleRangePicker();
}
let cancelRangeWheel=()=>{},rangeTrack=null;
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
 rangeTrack.center(state.tuning);
}
function bindRangePicker(){
 const trigger=$('keyRangeToggle'),menu=$('keyRangeMenu'),track=$('keyRangeTrack');
 trigger.onclick=()=>menu.hidden?openRangePicker():closeRangePicker();
 rangeTrack=createCircularRangeTrack(track,menu,key=>{$('keySelect').value=key;$('keySelect').onchange({target:$('keySelect')});closeRangePicker(true)},closeRangePicker);
 cancelRangeWheel=()=>rangeTrack.cancel();
 trigger.onkeydown=event=>{if(['ArrowLeft','ArrowRight','ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();openRangePicker()}};
 document.addEventListener('pointerdown',event=>{if(!menu.hidden&&!menu.contains(event.target)&&!trigger.contains(event.target))closeRangePicker()});
 window.addEventListener('resize',()=>{if(!menu.hidden)positionRangePicker()});
 window.addEventListener('scroll',event=>{if(!menu.hidden&&event.target!==menu&&!menu.contains(event.target))closeRangePicker()},true);
}

// Shared wheel easing; circular models keep a continuous, unbounded position.
function bindSmoothWheel(track,host,axis='x',limit=24,model=null){
 let raf=0,target=0,position=0,last=0,snapTimer=0;
 const read=()=>model?model.read():(axis==='x'?track.scrollLeft:track.scrollTop);
 const write=value=>{if(model)model.write(value);else if(axis==='x')track.scrollLeft=value;else track.scrollTop=value};
 const maximum=()=>Math.max(0,model?model.max():(axis==='x'?track.scrollWidth-track.clientWidth:track.scrollHeight-track.clientHeight));
 const bound=value=>model?.loop?value:clamp(value,0,maximum());
 const cancel=()=>{cancelAnimationFrame(raf);clearTimeout(snapTimer);raf=0};
 const animate=now=>{
  if(host.hidden){cancel();return}const dt=Math.min(40,now-last);last=now;
  position+=(target-position)*(1-Math.exp(-dt/PLAYER_RULES.selectors.smoothingMs));
  if(Math.abs(target-position)<.5){write(target);raf=0;return}
  write(position);raf=requestAnimationFrame(animate);
 };
 const start=()=>{if(!raf){position=read();last=performance.now();raf=requestAnimationFrame(animate)}};
 cancel.to=value=>{cancel();target=bound(value);start()};
 host.addEventListener('wheel',event=>{
  event.preventDefault();let delta=event.deltaY+event.deltaX;
  if(event.deltaMode===1)delta*=16;if(event.deltaMode===2)delta*=axis==='x'?track.clientWidth:track.clientHeight;
  if(!delta)return;if(!raf)target=read();
  target=bound(target+Math.sign(delta)*Math.min(limit,Math.abs(delta)*(model?.wheelGain??PLAYER_RULES.selectors.wheelGain)));start();
  clearTimeout(snapTimer);
  if(model?.snap)snapTimer=setTimeout(()=>{target=bound(model.snap(target));start()},PLAYER_RULES.selectors.instrumentSnapDelayMs);
 },{passive:false});
 host.addEventListener('pointerdown',cancel);host.addEventListener('keydown',cancel);
 return cancel;
}
// Both range pickers share one circular strip; only their opening layout differs.
function createCircularRangeTrack(track,menu,choose,close){
 const buttons=[...track.querySelectorAll('[data-key]')],step=49,count=buttons.length,wrap=n=>((n%count)+count)%count;
 const view={position:0,touch:null,suppressClick:false};
 function render(){for(let index=0;index<count;index++){const offset=wrap(index-view.position/step+count/2)-count/2;buttons[index].style.transform='translateX('+(offset*step)+'px)'}menu.dataset.position=String(view.position/step)}
 const cancelWheel=bindSmoothWheel(track,menu,'x',PLAYER_RULES.selectors.rangeMaxStepPx,{loop:true,read:()=>view.position,write:value=>{view.position=value;render()}});
 function cancel(){cancelWheel();const drag=view.touch;view.touch=null;if(drag&&menu.hasPointerCapture(drag.id))menu.releasePointerCapture(drag.id)}
 function center(key){cancel();view.suppressClick=false;const index=Math.max(0,buttons.findIndex(button=>button.dataset.key===key));view.position=index*step;render();buttons[index].focus({preventScroll:true})}
 for(const button of buttons)button.onclick=()=>{if(view.suppressClick){view.suppressClick=false;return}choose(button.dataset.key)};
 menu.onkeydown=event=>{view.suppressClick=false;let index=buttons.indexOf(document.activeElement),next;
  if(event.key==='ArrowLeft'||event.key==='ArrowUp')next=wrap(index-1);if(event.key==='ArrowRight'||event.key==='ArrowDown')next=wrap(index+1);if(event.key==='Home')next=0;if(event.key==='End')next=count-1;
  if(next!==undefined){event.preventDefault();event.stopPropagation();cancel();const current=Math.round(view.position/step);let delta=wrap(next-wrap(current));if(delta>count/2)delta-=count;view.position=(current+delta)*step;render();buttons[next].focus({preventScroll:true})}
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true)}if(event.key==='Tab')close(true);
 };
 menu.addEventListener('pointerdown',event=>{if(event.button!==0)return;view.suppressClick=false;view.touch={id:event.pointerId,x:event.clientX,y:event.clientY,start:view.position,moved:false}});
 menu.addEventListener('pointermove',event=>{const drag=view.touch;if(!drag||drag.id!==event.pointerId)return;const dx=event.clientX-drag.x,dy=event.clientY-drag.y;if(!drag.moved&&Math.abs(dy)>Math.abs(dx)+4){view.touch=null;return}if(!drag.moved&&Math.abs(dx)<4)return;drag.moved=true;view.suppressClick=true;menu.setPointerCapture(event.pointerId);view.position=drag.start-dx;render();event.preventDefault()});
 const endDrag=event=>{if(view.touch?.id!==event.pointerId)return;view.touch=null;if(menu.hasPointerCapture(event.pointerId))menu.releasePointerCapture(event.pointerId)};menu.addEventListener('pointerup',endDrag);menu.addEventListener('pointercancel',endDrag);
 return {center,cancel};
}
let consoleRangePicker=null;
function syncConsoleRangePicker(){consoleRangePicker?.sync()}
function closeConsoleRangePicker(returnFocus=false){consoleRangePicker?.close(returnFocus)}
function bindConsoleRangePicker(){
 const trigger=$('consoleRangeToggle'),menu=$('consoleRangeMenu'),track=$('consoleRangeTrack');
 const items=[...$('keySelect').options].map(option=>({key:option.value,label:option.textContent}));
 for(const item of items){const button=document.createElement('button');button.type='button';button.dataset.key=item.key;button.textContent=item.key==='sky-original'?'光遇':KEY_DEGREES[item.key][0];button.title=item.label;button.setAttribute('role','option');button.tabIndex=-1;track.append(button)}
 const ring=createCircularRangeTrack(track,menu,key=>{if(!canEditScore())return;$('consoleTuning').value=key;$('consoleTuning').onchange({target:$('consoleTuning')});close(true)},close);
 function sync(){const selected=items.find(item=>item.key===state.tuning)||items[1];$('consoleRangeValue').textContent=selected.label;for(const button of track.querySelectorAll('[data-key]'))button.setAttribute('aria-selected',String(button.dataset.key===selected.key))}
 function close(returnFocus=false){ring.cancel();menu.hidden=true;trigger.hidden=false;trigger.setAttribute('aria-expanded','false');if(returnFocus)trigger.focus()}
 function open(){if(!canEditScore())return;closeRangePicker();sync();trigger.hidden=true;menu.hidden=false;trigger.setAttribute('aria-expanded','true');ring.center(state.tuning)}
 trigger.onclick=open;trigger.onkeydown=event=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();open()}};
 document.addEventListener('pointerdown',event=>{if(!menu.hidden&&!menu.contains(event.target)&&!trigger.contains(event.target))close()});
 consoleRangePicker={sync,close};sync();
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
  const origin=Math.min(view.position,Math.max(0,items.length-(config.minimumRows||1)));
  const below=Math.min(config.rowsBelow()*view.step,(items.length-1-origin)*view.step,Math.max(0,innerHeight-rect.bottom-8));
  menu.style.width=rect.width+'px';menu.style.left=rect.left+'px';menu.style.top=rect.top+'px';menu.style.height=(rect.height+below)+'px';focus.style.top=((view.position-origin)*view.step)+'px';focus.style.height=rect.height+'px';
  buttons.forEach((button,i)=>{const y=(i-origin)*view.step;button.style.top=y+'px';button.style.height=view.row+'px';button.style.visibility=y+view.row>0&&y<view.row+below?'visible':'hidden'});menu.dataset.position=String(view.position);
 }
 function move(value){view.position=clamp(value,0,items.length-1);position();if(options.contains(document.activeElement)&&document.activeElement.style.visibility==='hidden')menu.focus({preventScroll:true})}
 function open(){config.beforeOpen();sync();cancelWheel();view.position=Math.max(0,items.findIndex(item=>item.value===config.selected()));menu.hidden=false;trigger.setAttribute('aria-expanded','true');position();buttons.find(button=>button.dataset.value===config.selected())?.focus({preventScroll:true})}
 menu.tabIndex=-1;
 cancelWheel=bindSmoothWheel(options,menu,'y',config.maxStepPx||PLAYER_RULES.selectors.instrumentMaxStepPx,{read:()=>view.position*view.step,write:pixels=>move(pixels/view.step),max:()=>(items.length-1)*view.step,snap:pixels=>Math.round(pixels/view.step)*view.step});
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
 speedPicker=createDownwardPicker({trigger:'speedToggle',menu:'speedMenu',options:'speedOptions',focus:'speedCurrent',attribute:'speed',maxStepPx:PLAYER_RULES.selectors.speedMaxStepPx,minimumRows:PLAYER_RULES.selectors.speedMinimumRows,items:PLAYER_RULES.playbackRates.map(rate=>({value:String(rate),label:rate.toFixed(2)+'×'})),selected:()=>String(state.rate),rowsBelow:()=>PLAYER_RULES.selectors.speedRowsBelow,beforeOpen:()=>{closeRangePicker();closeInstrumentPicker()},choose:value=>{$('speedSelect').value=value;$('speedSelect').onchange({target:$('speedSelect')});closeSpeedPicker(true)}});
}

function seekBeatPage(direction){if(!state.project)return;pauseSong();const layout=beatLayout(),size=beatPageSize(),slot=clamp((Math.floor(beatDisplayIndex()/size)+direction)*size,0,layout.count-1);seekTo(layout.grid?Math.round(slot*layout.step):scoreEvents(state.project)[slot].timeMs)}
