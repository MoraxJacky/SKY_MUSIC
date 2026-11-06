// One player interaction entry for every score and theme.
// Notification timing belongs to the interaction layer; colors belong to the template.
let actionNoticeRevision=0;
function toast(text,ms=PLAYER_RULES.notifications.durationMs){
 actionNoticeRevision++;
 const el=$(PLAYER_RULES.notifications.controlId);clearTimeout(state.toastTimer);
 syncStatusNotificationAppearance();el.textContent=text;el.hidden=false;
 if(el.showPopover&&!el.matches(':popover-open'))el.showPopover();
 state.toastTimer=setTimeout(()=>{if(el.hidePopover&&el.matches(':popover-open'))el.hidePopover();el.hidden=true},ms);
}
const playerValuePickers=new Map();
function cancelPlayerValueScroll(){for(const picker of playerValuePickers.values())picker.cancel();instrumentPicker?.close()}
function syncPlayerValue(kind){
 const el=$(PLAYER_RULES[kind].controlId),percent=Math.round(state[kind]*100);
 el.value=String(percent);el.setAttribute('aria-valuenow',String(percent));el.setAttribute('aria-valuetext',kind==='volume'&&percent===0?'静音':percent+'%');
 playerValuePickers.get(kind)?.sync(percent);
}
function syncVolumeControl(){syncPlayerValue('volume');updateVolumeAudio()}
function syncSustainControl(){syncPlayerValue('sustain');updateSustainAudio()}
function createVerticalChoiceStrip(el,items,options){
 const row=PLAYER_RULES.valuePicker.rowHeightPx,track=el.querySelector('.value-picker-track'),count=items.length;let position=options.selected()*row,drag=null,settle=0;
 const wrap=index=>((index%count)+count)%count,bound=index=>options.loop?wrap(index):clamp(index,0,count-1);
 track.innerHTML='';for(const item of items){const cell=document.createElement('span'),label=document.createElement('b');label.textContent=item.label;label.title=item.title||item.label;cell.append(label);track.append(cell)}
 el.classList.toggle('circular-choice',Boolean(options.loop));
 const indexAt=value=>bound(Math.round(value/row));
 const commit=index=>options.choose(index);
 function render(){if(options.loop){track.style.transform='none';[...track.children].forEach((cell,index)=>{const offset=wrap(index-position/row+count/2)-count/2;cell.style.transform='translateY('+(offset*row)+'px)'})}else track.style.transform='translateY('+(-position)+'px)';el.dataset.position=String(position/row)}
 const paint=value=>{position=value;render();const index=indexAt(value);options.preview?.(index);if(options.live)commit(index);else{clearTimeout(settle);settle=setTimeout(()=>commit(indexAt(position)),150)}};
 const wheel=bindSmoothWheel(track,el,'y',PLAYER_RULES.valuePicker.wheelMaxStepPx,{loop:options.loop,read:()=>position,write:paint,max:()=>(count-1)*row,snap:value=>Math.round(value/row)*row,wheelGain:PLAYER_RULES.valuePicker.wheelGain});
 function cancel(){wheel();clearTimeout(settle);const active=drag;drag=null;if(active&&el.hasPointerCapture(active.id))el.releasePointerCapture(active.id)}
 function sync(index){cancel();position=bound(index)*row;render();options.preview?.(indexAt(position))}
 el.onkeydown=event=>{let index=indexAt(position);if(event.key==='ArrowUp')index--;else if(event.key==='ArrowDown')index++;else if(event.key==='ArrowRight')index+=options.numeric?-1:1;else if(event.key==='ArrowLeft')index+=options.numeric?1:-1;else if(event.key==='Home')index=options.numeric?count-1:0;else if(event.key==='End')index=options.numeric?0:count-1;else return;event.preventDefault();event.stopPropagation();index=bound(index);cancel();commit(index);sync(index)};
 el.addEventListener('pointerdown',event=>{if(event.button!==0)return;cancel();el.focus();drag={id:event.pointerId,y:event.clientY,start:position};el.setPointerCapture(event.pointerId)});
 el.addEventListener('pointermove',event=>{if(drag?.id===event.pointerId){event.preventDefault();const value=drag.start+drag.y-event.clientY;paint(options.loop?value:clamp(value,0,(count-1)*row))}});
 const stop=event=>{if(drag?.id!==event.pointerId)return;drag=null;if(el.hasPointerCapture(event.pointerId))el.releasePointerCapture(event.pointerId);wheel.to(Math.round(position/row)*row)};
 el.addEventListener('pointerup',stop);el.addEventListener('pointercancel',stop);sync(options.selected());return {sync,cancel};
}
function bindPlayerValuePicker(kind){
 const el=$(PLAYER_RULES[kind].controlId);
 const commit=percent=>{const value=clamp(Math.round(Number.isFinite(percent)?percent:state[kind]*100),0,100);if(state[kind]===value/100)return;state[kind]=value/100;el.value=String(value);el.setAttribute('aria-valuenow',String(value));el.setAttribute('aria-valuetext',kind==='volume'&&value===0?'静音':value+'%');if(state.project){state.project.playback[kind]=state[kind];saveLibrary()}if(kind==='volume')updateVolumeAudio();else updateSustainAudio()};
 el.oninput=()=>{commit(Number(el.value));playerValuePickers.get(kind)?.sync(Math.round(state[kind]*100))};
 if(!document.createComment)return;
 const strip=createVerticalChoiceStrip(el,Array.from({length:101},(_,i)=>({label:String(100-i)})),{numeric:true,live:true,selected:()=>100-Math.round(state[kind]*100),choose:index=>commit(100-index)});
 playerValuePickers.set(kind,{sync:value=>strip.sync(100-value),cancel:strip.cancel});
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
 bindScoreEntranceInterrupts();
 bindPlayerValuePicker('volume');bindPlayerValuePicker('sustain');

 bindRollPointerSeek();
 $('backLibrary').onclick=returnHomeFromPlayer;
 $('rollWindow').innerHTML='';for(const seconds of PLAYER_RULES.roll.windowsSeconds){const option=document.createElement('option');option.value=String(seconds);option.textContent=seconds+'秒';$('rollWindow').append(option)}
 $('playBtn').onclick=()=>playPause();$('restartBtn').onclick=()=>{seekTo(0);toast('已重置到开头')};$('loopOneBtn').onclick=()=>{if(!state.project)return;state.project.playback.loop=!state.project.playback.loop;saveLibrary();syncLoopControl();toast(state.project.playback.loop?'已开启单曲循环':'已关闭单曲循环')};

 $('speedSelect').onchange=ev=>{const previous=state.rate;let was=state.isPlaying;if(was)pauseSong();state.rate=Number(ev.target.value);syncSpeedPicker();if(state.project){state.project.playback.rate=state.rate;saveLibrary()}if(previous!==state.rate)toast('倍速：'+state.rate.toFixed(2)+'×');if(was)playPause(true)};
 $('rollWindow').onchange=ev=>{const finishing=Boolean(state.rollFinish),frame=rollFrame(),fraction=frame.phase/frame.windowMs;cancelRollFinish();state.windowSec=Number(ev.target.value);state.rollPageStart=rollSeekOrigin(state.position,fraction);if(finishing)finishRollScan();else drawRoll()};
 $('rollWindow').value=String(state.windowSec);$('stepPrev').onclick=()=>stepEvent(-1);$('stepNext').onclick=()=>stepEvent(1);
 $('seekSlider').oninput=ev=>seekTo(Number(ev.target.value));
 $('rollSeekSlider').oninput=ev=>seekTo(Number(ev.target.value),true);
 $('pagePrev').onclick=()=>seekBeatPage(-1);
 $('pageNext').onclick=()=>seekBeatPage(1);
 $('resetKeyEdit').onclick=()=>{if(!canEditScore())return;const view=rollFrame();let p=state.project;let original=BUILTINS.find(x=>x.id===(p.provenance?.derivedFrom||p.id));let e=scoreEvents(p)[state.selected],reference=original&&scoreEvents(original)[state.selected];if(!e)return;if(reference){rememberEdit();e.notes=[...reference.notes];e.durationMs=reference.durationMs;e.confidence='source';settleFineRollView(view,e);renderKeyBoard();renderBeatGrid(true);updateVisual();toast('已恢复此格的原始琴键')}else toast('导入曲目无内置原谱，请通过导入文件恢复')};
 $('keySelect').onchange=ev=>{if(!state.project)return;const previous=state.tuning;let was=state.isPlaying;if(was)pauseSong();state.tuning=ev.target.value;state.project.playback.tuning=state.tuning;saveLibrary();setTuningButtons();renderKeyBoard();renderBeatGrid(true);updateVisual();if(state.editMode)syncEditorFields();if(previous!==state.tuning)toast('音域：'+$('keyRangeValue').textContent);if(was)playPause(true)};
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
// Playback speed retains a bounded downward picker.
function createDownwardPicker(config){
 const trigger=$(config.trigger),menu=$(config.menu),options=$(config.options),focus=$(config.focus),items=config.items;
 const view={position:0,row:31,step:36,touch:null,suppressClick:false};let cancelWheel=()=>{};
 const buttons=items.map(item=>{const button=document.createElement('button');button.type='button';button.dataset.value=item.value;button.dataset[config.attribute]=item.value;button.setAttribute('role','option');button.setAttribute('aria-selected','false');button.tabIndex=-1;button.textContent=item.label;button.onclick=()=>{if(view.suppressClick){view.suppressClick=false;return}config.choose(item.value)};options.append(button);return button});
 function sync(){for(const button of buttons)button.setAttribute('aria-selected',String(button.dataset.value===config.selected()))}
 function close(returnFocus=false){cancelWheel();menu.hidden=true;trigger.setAttribute('aria-expanded','false');if(returnFocus)trigger.focus()}
 function position(){
  const rect=trigger.getBoundingClientRect();view.row=rect.height;view.step=rect.height+PLAYER_RULES.selectors.instrumentRowGapPx;
  // minimumRows includes the baseline row: keep both lower hit targets at the end.
  const visibleRows=Math.min(items.length,Math.max(config.minimumRows||1,config.rowsBelow()+1));
  const origin=Math.min(view.position,Math.max(0,items.length-visibleRows));
  const below=Math.min((visibleRows-1)*view.step,Math.max(0,innerHeight-rect.bottom-8));
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
function syncInstrumentPicker(){const spec=instrumentSpec(state.project?.playback?.instrument),host=$('instrumentPicker');$('instrumentSelect').value=spec.id;host.value=spec.id;host.setAttribute('aria-valuenow',String(INSTRUMENTS.indexOf(spec)+1));host.setAttribute('aria-valuetext',spec.name+' · '+(spec.mode==='offline'?'离线':'在线'));instrumentPicker?.sync()}
function syncSpeedPicker(){$('speedSelect').value=String(state.rate);$('speedValue').textContent=state.rate.toFixed(2)+'×';speedPicker?.sync()}
async function chooseInstrument(id){
 if(!state.project)return;const project=state.project,selection=++instrumentSelection,was=state.isPlaying||instrumentResume;
 instrumentResume=was;if(state.isPlaying)pauseSong();project.playback.instrument=instrumentSpec(id).id;saveLibrary();syncInstrumentPicker();closeInstrumentPicker(true);
 const revision=actionNoticeRevision;let loadingRevision=-1;
 const waiting=setTimeout(()=>{if(selection===instrumentSelection&&project===state.project&&state.mode==='player'){toast('正在加载音色…');loadingRevision=actionNoticeRevision}},PLAYER_RULES.notifications.slowOperationMs);
 try{const ready=await preloadPiano();clearTimeout(waiting);if(selection!==instrumentSelection||project!==state.project||state.mode!=='player')return;instrumentResume=false;if(ready&&was&&!state.isPlaying)await playPause(true);if(ready&&selection===instrumentSelection&&project===state.project&&(revision===actionNoticeRevision||loadingRevision===actionNoticeRevision))toast('音色：'+instrumentSpec(project.playback.instrument).name)}catch(error){if(selection===instrumentSelection&&project===state.project){instrumentResume=false;console.warn(error);toast('音源加载异常：'+error.message,5000)}}finally{clearTimeout(waiting)}
}

function bindInstrumentPicker(){
 const host=$('instrumentPicker');host.oninput=()=>chooseInstrument(host.value);
 if(!document.createComment)return;
 const strip=createVerticalChoiceStrip(host,INSTRUMENTS.map(spec=>({label:spec.name,title:spec.name+' · '+(spec.mode==='offline'?'离线':'在线')})),{loop:true,selected:()=>Math.max(0,INSTRUMENTS.findIndex(spec=>spec.id===state.project?.playback.instrument)),preview:index=>{host.value=INSTRUMENTS[index].id;host.setAttribute('aria-valuenow',String(index+1));host.setAttribute('aria-valuetext',INSTRUMENTS[index].name)},choose:index=>{if(state.project&&state.project.playback.instrument!==INSTRUMENTS[index].id)chooseInstrument(INSTRUMENTS[index].id)}});
 instrumentPicker={sync:()=>strip.sync(Math.max(0,INSTRUMENTS.findIndex(spec=>spec.id===state.project?.playback.instrument))),close:()=>strip.cancel()};
 const closeOthers=()=>{closeRangePicker();closeSpeedPicker()};host.addEventListener('pointerdown',closeOthers,true);host.addEventListener('wheel',closeOthers,{capture:true,passive:true});
}
function bindSpeedPicker(){
 $('speedSelect').innerHTML='';for(const rate of PLAYER_RULES.playbackRates){const option=document.createElement('option');option.value=String(rate);option.textContent=rate.toFixed(2)+'×';$('speedSelect').append(option)}
 speedPicker=createDownwardPicker({trigger:'speedToggle',menu:'speedMenu',options:'speedOptions',focus:'speedCurrent',attribute:'speed',maxStepPx:PLAYER_RULES.selectors.speedMaxStepPx,minimumRows:PLAYER_RULES.selectors.speedMinimumRows,items:PLAYER_RULES.playbackRates.map(rate=>({value:String(rate),label:rate.toFixed(2)+'×'})),selected:()=>String(state.rate),rowsBelow:()=>PLAYER_RULES.selectors.speedRowsBelow,beforeOpen:()=>{closeRangePicker();closeInstrumentPicker()},choose:value=>{$('speedSelect').value=value;$('speedSelect').onchange({target:$('speedSelect')});closeSpeedPicker(true)}});
}

function seekBeatPage(direction){if(!state.project)return;pauseSong();const layout=beatLayout(),size=beatPageSize(),slot=clamp((Math.floor(beatDisplayIndex()/size)+direction)*size,0,layout.count-1);seekTo(layout.grid?Math.round(slot*layout.step):scoreEvents(state.project)[slot].timeMs)}

// A single visual-only arrival sequence for every song and theme.
const scoreEntrance={current:null};
function currentScoreEntrance(){const a=scoreEntrance.current;return a&&a.project===state.project&&!state.editMode?a:null}
function scoreEntranceHidesKeys(){return Boolean(currentScoreEntrance())}
function scoreEntranceHidesKey(key){return Boolean(currentScoreEntrance()&&!key.classList.contains('score-stamped'))}
function scoreEntranceShowsBeat(beat){return !currentScoreEntrance()||beat.classList.contains('score-grown')}
function scoreEntranceRollProgress(time,begin,windowMs){
 const a=currentScoreEntrance();if(!a)return 1;if(a.started===null)return 0;
 const cfg=PLAYER_RULES.scoreEntrance,span=cfg.durationMs-cfg.blankMs,scale=span/(cfg.rollSpreadMs+cfg.rollFloatMs),elapsed=performance.now()-a.started-cfg.blankMs-clamp((time-begin)/windowMs,0,1)*cfg.rollSpreadMs*scale;
 const t=clamp(elapsed/(cfg.rollFloatMs*scale),0,1);return 1-(1-t)**3;
}
function prepareScoreEntrance(){
 if(!document.createComment||homeReducedMotion())return;
 cancelScoreEntrance();scoreEntrance.current={project:state.project,started:null,animations:[],overlays:[],raf:0,beats:[],keys:[]};
 const host=$('playerView');host.classList.add('score-arriving');host.dataset.scoreEntrance='armed';
}
function finishScoreEntrance(phase='done'){
 const a=scoreEntrance.current;if(!a)return;scoreEntrance.current=null;cancelAnimationFrame(a.raf);
 for(const animation of a.animations)animation.cancel();
 for(const overlay of a.overlays)overlay.remove();
 const host=$('playerView');host.classList.remove('score-arriving');host.dataset.scoreEntrance=phase;
 for(const el of [...$('beatGrid').children,...$('keyBoard').children]){el.classList.remove('score-grown','score-settled','score-stamped');el.style.removeProperty('z-index');el.style.removeProperty('transform-origin')}
 if(state.mode==='player'&&state.project===a.project)updateVisual();
}
function cancelScoreEntrance(){finishScoreEntrance('cancelled')}
function startScoreEntrance(){
 const a=currentScoreEntrance();if(!a||a.started!==null)return;
 if(state.mode!=='player'||state.isPlaying||homeReducedMotion()){cancelScoreEntrance();return}
 const cfg=PLAYER_RULES.scoreEntrance,columns=PLAYER_RULES.grid.columns,colors=resolvedPlayerColors(state.project),blank=cfg.blankMs;
 a.started=performance.now();$('playerView').dataset.scoreEntrance='running';
 const animate=(el,frames,delay,duration,fill='both')=>{const animation=el.animate(frames,{delay,duration,fill,easing:'cubic-bezier(.2,.65,.25,1)'});animation.startTime=a.started;a.animations.push(animation)};
 const cells=[...$('beatGrid').children],rowStride=(columns-1)*cfg.beatStepMs+cfg.beatGrowMs+cfg.rowGapMs,span=cfg.durationMs-blank,beatScale=span/(Math.floor((cells.length-1)/columns)*rowStride+((cells.length-1)%columns)*cfg.beatStepMs+cfg.beatGrowMs),beatGrowMs=cfg.beatGrowMs*beatScale;
 cells.forEach((cell,index)=>{
  const delay=blank+(Math.floor(index/columns)*rowStride+(index%columns)*cfg.beatStepMs)*beatScale;a.beats.push({el:cell,delay,duration:beatGrowMs});
  if(index===beatDisplayIndex())animate(cell,[{boxShadow:'0 0 0 transparent'},{offset:.48,boxShadow:'0 0 20px '+colors.accent+'88, inset 0 0 0 1px '+colors.accent},{boxShadow:'0 0 0 transparent'}],delay,beatGrowMs);
  const pattern=cell.querySelector('.mini-keys'),name=cell.querySelector('.beat-name');
  if(pattern){const rect=pattern.getBoundingClientRect(),box=cell.getBoundingClientRect(),overlay=pattern.cloneNode(true);overlay.classList.add('score-arrival-pattern');overlay.style.cssText='left:'+(rect.left-box.left-cell.clientLeft)+'px;top:'+(rect.top-box.top-cell.clientTop)+'px;width:'+rect.width+'px;height:'+rect.height+'px';cell.append(overlay);a.overlays.push(overlay);
   animate(overlay,[{opacity:0,transform:'translateY(10px) scale(.72)'},{offset:.48,opacity:1,transform:'translateY(-2px) scale(1.08)'},{opacity:1,transform:'none'}],delay,beatGrowMs);
  }
  if(name)animate(name,[{opacity:0,transform:'translateY(5px)'},{opacity:1,transform:'none'}],delay,beatGrowMs);
 });
 const notes=displayedBeat().notes,stampScaleTime=span/(cfg.stampDelayMs+Math.max(0,notes.length-1)*cfg.stampStepMs+cfg.stampMs),stampMs=cfg.stampMs*stampScaleTime;
 [...$('keyBoard').children].filter(key=>notes.includes(Number(key.dataset.note))).forEach((key,index)=>{
  const delay=blank+(cfg.stampDelayMs+index*cfg.stampStepMs)*stampScaleTime;a.keys.push({el:key,delay});key.style.zIndex='3';key.style.transformOrigin='center center';
  animate(key,[{opacity:0,transform:'translateY(0px) scale(1)',boxShadow:'0 0 0 '+colors.accent+'00',easing:'cubic-bezier(.16,.8,.3,1)'},{offset:cfg.stampGrowEnd,opacity:1,transform:'translateY(-'+cfg.stampRisePx+'px) scale('+cfg.stampScale+')',boxShadow:'0 0 28px '+colors.accent+'99',easing:'cubic-bezier(.2,.6,.3,1)'},{offset:cfg.stampHighlightEnd,opacity:1,transform:'translateY(-'+cfg.stampRisePx+'px) scale('+cfg.stampScale+')',boxShadow:'0 0 20px '+colors.accent+'77',easing:'cubic-bezier(.3,.05,.35,1)'},{opacity:1,transform:'translateY(0px) scale(1)',boxShadow:'0 0 10px '+colors.accent+'33'}],delay,stampMs,'forwards');
 });
 const duration=cfg.durationMs;
 // Start one shared clock after layout work, preserving the blank opening on slower devices.
 a.started=performance.now();for(const animation of a.animations)animation.startTime=a.started;
 const frame=()=>{
  if(scoreEntrance.current!==a)return;
  if(state.project!==a.project||state.mode!=='player'||state.editMode||state.isPlaying){cancelScoreEntrance();return}
  const elapsed=performance.now()-a.started;
  for(const item of a.beats){if(elapsed>=item.delay&&!item.el.classList.contains('score-grown')){item.el.classList.add('score-grown');if(Number(item.el.dataset.index)===beatDisplayIndex())item.el.classList.add('active','select')}if(elapsed>=item.delay+item.duration&&!item.settled){item.settled=true;item.el.classList.add('score-settled')}}
  for(const item of a.keys)if(elapsed>=item.delay&&!item.el.classList.contains('score-stamped'))item.el.classList.add('score-stamped','active');
  drawRoll();if(elapsed>=duration&&a.animations.every(animation=>animation.effect.getComputedTiming().progress===1)){finishScoreEntrance();return}a.raf=requestAnimationFrame(frame);
 };
 a.raf=requestAnimationFrame(frame);
}
function bindScoreEntranceInterrupts(){
 const interrupt=event=>{if(scoreEntrance.current&&((event.type==='keydown'&&state.mode==='player')||$('playerView').contains(event.target))){const input=(event.type==='input'||event.type==='change')&&'value'in event.target,value=input?event.target.value:null;cancelScoreEntrance();if(input)event.target.value=value}};
 for(const type of ['pointerdown','keydown','wheel','input','change'])document.addEventListener(type,interrupt,true);
 window.addEventListener('resize',cancelScoreEntrance);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelScoreEntrance()});
}

function syncLoopControl(){const on=state.project?.playback.loop===true;$('loopOneBtn').setAttribute('aria-pressed',String(on));$('loopOneBtn').title=on?'关闭单曲循环':'开启单曲循环'}
