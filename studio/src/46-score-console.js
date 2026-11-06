// One editing work copy, three views of the same score and player controls.
const scoreConsole={mode:PLAYER_RULES.editor.initialMode,recording:false,start:0,at:0,raf:0,homes:[],fine:null,views:new Map(),returnView:null};
function setConsoleMode(mode){
 closeConsoleRangePicker();stopConsoleRecording();scoreConsole.mode=mode;const fine=mode==='fine',generate=mode==='generate';
 $('scoreConsole').dataset.mode=mode;$('consoleEditActions').parentElement.scrollTop=0;$('rollCanvas').title=fine?'点击音符选中；横向拖动改时间，纵向拖动改音高，拖动右边缘改长度':'点击或拖动扫描条定位，松开后保持暂停';
 for(const button of document.querySelectorAll('[data-console-mode]')){const on=button.dataset.consoleMode===mode;button.setAttribute('aria-selected',String(on));button.tabIndex=on?0:-1}
 $('consoleLayout').setAttribute('aria-labelledby',mode==='fine'?'consoleFineTab':generate?'consoleGenerateTab':'consoleRecordTab');
 $('consoleKeysSlot').hidden=mode!=='record';$('consoleGridSlot').hidden=!generate;$('consoleRecordControls').hidden=mode!=='record';$('consoleGenerateControls').hidden=!generate;$('consoleBatchControls').hidden=!fine;$('consoleInspectorSlot').hidden=!fine;
 renderBeatGrid(true);renderKeyBoard();updateVisual();requestAnimationFrame(()=>{drawRoll();initializeScene()});
}
function openScoreConsole(){
 if(!state.editMode)return;if(!document.createComment){$('scoreConsole').showModal();return;}
 if(!$('scoreConsole').open){pauseSong();scoreConsole.homes=[];for(const [selector,slot] of [['.roll-pane','consoleRollSlot'],['.keys-pane','consoleKeysSlot'],['.grid-pane','consoleGridSlot']]){const panel=document.querySelector(selector),marker=document.createComment('player-panel');panel.before(marker);scoreConsole.homes.push({panel,marker});$(slot).append(panel)}$('scoreConsole').showModal()}
 applyPlayerTemplate(state.project,$('scoreConsole'));setConsoleMode(scoreConsole.mode);syncEditorFields();updateScoreConsole();
}
function closeScoreConsole(){
 closeConsoleRangePicker(); if(!document.createComment){$('scoreConsole').close();return}stopConsoleRecording();pauseSong();scoreConsole.fine=null;
 if($('scoreConsole').open)$('scoreConsole').close();for(const {panel,marker} of scoreConsole.homes){marker.replaceWith(panel)}scoreConsole.homes=[];renderBeatGrid(true);renderKeyBoard();updateVisual();requestAnimationFrame(()=>{drawRoll();initializeScene()});
}
function updateScoreConsole(){
 if(!$('scoreConsole')?.open)return;$('consoleClock').textContent=positionFmt(state.position);$('consolePlay').textContent=state.isPlaying?'暂停':'播放';$('consoleTuning').value=state.tuning;syncConsoleRangePicker();
 $('consoleUndo').disabled=!historyItems(state.history,state.project.id).length;$('consoleRedo').disabled=!historyItems(state.future,state.project.id).length;
 $('consoleStatus').textContent=scoreConsole.recording?'录制中 · 所有改动可撤销':state.editDirty?'工作副本已修改 · 尚未保存':'编辑工作副本，保存后生效';
 const event=scoreEvents(state.project)[state.selected];for(const button of $('consoleNoteKeys').children)button.setAttribute('aria-pressed',String(event?.notes.includes(Number(button.dataset.note))));
}
function stopConsoleRecording(){scoreConsole.recording=false;cancelAnimationFrame(scoreConsole.raf);if($('consoleRecordStart'))$('consoleRecordStart').textContent='开始录制'}
function startConsoleRecording(){
 if(scoreConsole.recording){stopConsoleRecording();updateScoreConsole();return}pauseSong();rememberEdit();scoreConsole.recording=true;scoreConsole.start=performance.now();scoreConsole.at=state.position;$('consoleRecordStart').textContent='停止录制';if($('consoleRecordMode').value==='live'){const tick=()=>{if(!scoreConsole.recording)return;state.position=Math.min(state.project.durationMs,scoreConsole.at+performance.now()-scoreConsole.start);updateVisual();scoreConsole.raf=requestAnimationFrame(tick)};tick()}updateScoreConsole();
}
function consoleNumber(id,min,max){const value=Number($(id).value);if(!Number.isFinite(value)||value<min||value>max)throw Error('参数超出范围：'+$(id).parentElement.textContent);return value}
function scoreConsoleCapture(note){
 if(!scoreConsole.recording||!$('scoreConsole')?.open||scoreConsole.mode!=='record')return false;
 try{const step=consoleNumber('consoleInterval',20,5000),duration=consoleNumber('consoleNoteDuration',30,10000),live=$('consoleRecordMode').value==='live';let time=live?Math.round((scoreConsole.at+performance.now()-scoreConsole.start)/step)*step:state.position;time=clamp(time,0,35990000);
 const events=scoreEvents(state.project);if(events.length>=100000)throw Error('事件数量已达上限');let event=events.find(e=>e.timeMs===time);if(!event){event={timeMs:time,notes:[],durationMs:duration,velocity:85,confidence:'recorded'};events.push(event)}if(!event.notes.includes(note))event.notes.push(note);event.durationMs=duration;events.sort((a,b)=>a.timeMs-b.timeMs);state.project.durationMs=Math.max(state.project.durationMs,time+duration);state.position=live?time:Math.min(36000000,time+step);saveLibrary();refreshWorkspace();preloadPiano().then(()=>triggerSample(note,state.audioCtx.currentTime+.01,duration)).catch(()=>{});
 }catch(error){stopConsoleRecording();toast(error.message,5000)}return true;
}
function generateConsoleScore(){
 try{const step=consoleNumber('consoleGenerateInterval',20,5000),lines=$('consoleNumberScore').value.trim().split(/\r?\n/);if(!lines[0]||lines.length>4000)throw Error('请输入1–4000行数字谱');const start=state.position;
 const events=lines.map((line,index)=>{const text=line.trim(),notes=text==='0'?[]:text.split(/[+\s,，]+/).map(Number);if(!text||notes.some(n=>!Number.isInteger(n)||n<1||n>15))throw Error('第 '+(index+1)+' 行需要1–15音符或0休止');return {timeMs:Math.round(start+index*step),notes:[...new Set(notes)],durationMs:notes.length?Math.min(190,step):0,velocity:85,confidence:'generated'}});
 if(start+lines.length*step>36000000||scoreEvents(state.project).length+events.length>100000)throw Error('生成内容超出曲谱上限');pauseSong();rememberEdit();state.project.score.events.push(...events);state.project.score.events.sort((a,b)=>a.timeMs-b.timeMs);state.project.durationMs=Math.max(state.project.durationMs,start+lines.length*step);saveLibrary();refreshWorkspace();toast('已插入 '+events.length+' 个事件，可撤销');
 }catch(error){toast(error.message,6000)}
}
function beginFineNoteDrag(event,canvas){
 if(!$('scoreConsole')?.open||scoreConsole.mode!=='fine')return false;
 const rect=canvas.getBoundingClientRect(),frame=rollFrame(),g=rollPlotGeometry(rect,frame),x=event.clientX-rect.left,y=event.clientY-rect.top,rowH=(rect.height-g.top-g.bottom)/15,note=15-Math.floor((y-g.top)/rowH);if(note<1||note>15)return false;
 const list=scoreEvents(state.project),time=frame.begin+(x-g.left)/g.plotW*frame.windowMs;
 const hit=[...list].reverse().find(e=>e.notes.includes(note)&&time>=e.timeMs&&time<=e.timeMs+Math.max(e.durationMs,frame.windowMs/g.plotW*4));if(!hit)return false;
 event.preventDefault();pauseSong();let chosen=hit,split=false;if(hit.notes.length>1){rememberEdit({index:list.indexOf(hit),note,position:hit.timeMs});chosen={...copy(hit),notes:[note]};hit.notes=hit.notes.filter(n=>n!==note);list.push(chosen);list.sort((a,b)=>a.timeMs-b.timeMs);saveLibrary();split=true}const endX=g.left+(hit.timeMs+hit.durationMs-frame.begin)/frame.windowMs*g.plotW;
 scoreConsole.fine={pointerId:event.pointerId,canvas,event:chosen,note,frame,g,rect,x,y,time:hit.timeMs,duration:hit.durationMs,resize:Math.abs(x-endX)<Math.min(5,Math.max(1,hit.durationMs/frame.windowMs*g.plotW*.25)),changed:split};
 scoreConsole.selectedNote=note;scoreConsole.selection={project:state.project,event:chosen,note};state.selected=list.indexOf(chosen);state.position=hit.timeMs;state.lastSelected=state.selected;renderBeatGrid(true);renderKeyBoard();updateVisual();syncEditorFields();canvas.setPointerCapture(event.pointerId);return true;
}
function bindScoreConsole(){
 if(!document.createComment)return;
 $('consoleClose').onclick=()=>requestFinishEdit('exit');$('scoreConsole').addEventListener('cancel',event=>{event.preventDefault();requestFinishEdit('exit')});$('saveChoiceDialog').addEventListener('cancel',event=>{event.preventDefault();event.stopPropagation()});
 for(const button of document.querySelectorAll('[data-console-mode]')){button.onclick=()=>setConsoleMode(button.dataset.consoleMode);button.onkeydown=event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const buttons=[...document.querySelectorAll('[data-console-mode]')],index=buttons.indexOf(button),next=event.key==='Home'?0:event.key==='End'?2:(index+(event.key==='ArrowRight'?1:2))%3;setConsoleMode(buttons[next].dataset.consoleMode);buttons[next].focus()}}}
 $('consoleSave').onclick=()=>{stopConsoleRecording();requestFinishEdit('exit')};$('consoleUndo').onclick=undo;$('consoleRedo').onclick=redo;$('consolePrev').onclick=()=>stepConsoleEvent(-1);$('consoleNext').onclick=()=>stepConsoleEvent(1);$('consolePlay').onclick=()=>{stopConsoleRecording();playPause()};$('consoleRecordStart').onclick=startConsoleRecording;$('consoleGenerate').onclick=generateConsoleScore;
 $('consoleTuning').innerHTML=$('keySelect').innerHTML;$('consoleTuning').onchange=event=>{$('keySelect').value=event.target.value;$('keySelect').onchange({target:$('keySelect')})};bindConsoleRangePicker();
 for(let n=1;n<=15;n++){const button=document.createElement('button');button.textContent=n;button.dataset.note=n;button.setAttribute('aria-label','当前事件音符 '+n);button.onclick=()=>toggleNote(n);$('consoleNoteKeys').append(button)}
 const codes=['KeyQ','KeyW','KeyE','KeyR','KeyT','KeyA','KeyS','KeyD','KeyF','KeyG','KeyZ','KeyX','KeyC','KeyV','KeyB'];
 $('scoreConsole').addEventListener('keydown',event=>{if(event.ctrlKey||event.metaKey){if(event.code==='KeyS'){event.preventDefault();stopConsoleRecording();requestFinishEdit('exit')}if(event.code==='KeyZ'){event.preventDefault();event.shiftKey?redo():undo()}if(event.code==='KeyY'){event.preventDefault();redo()}return}if(event.target.closest('input,select,textarea'))return;const note=codes.indexOf(event.code)+1;if(note&&scoreConsole.recording){event.preventDefault();if(!event.repeat)scoreConsoleCapture(note)}if(event.code==='Space'&&!event.target.closest('button')){event.preventDefault();$('consolePlay').click()}});
 const canvas=$('rollCanvas');canvas.addEventListener('pointermove',event=>{const drag=scoreConsole.fine;if(!drag||drag.pointerId!==event.pointerId)return;const dx=event.clientX-drag.rect.left-drag.x,dy=event.clientY-drag.rect.top-drag.y;if(!drag.changed&&Math.abs(dx)+Math.abs(dy)<3)return;
 if(!drag.changed){rememberEdit();if(drag.event.notes.length>1){drag.event.notes=drag.event.notes.filter(n=>n!==drag.note);drag.event={...copy(drag.event),notes:[drag.note]};scoreEvents(state.project).push(drag.event)}drag.changed=true}
 const step=state.project.score.gridIntervalMs,delta=dx/drag.g.plotW*drag.frame.windowMs;
 if(drag.resize)drag.event.durationMs=clamp(Math.round((drag.duration+delta)/10)*10,30,10000);else{drag.event.timeMs=clamp(Math.round((drag.time+delta)/step)*step,Math.max(0,drag.frame.begin),Math.min(35990000,drag.frame.end-.001));const rowH=(drag.rect.height-drag.g.top-drag.g.bottom)/15;drag.event.notes=[clamp(drag.note-Math.round(dy/rowH),1,15)]}
 const list=scoreEvents(state.project);list.sort((a,b)=>a.timeMs-b.timeMs);state.selected=list.indexOf(drag.event);state.lastSelected=state.selected;state.position=clamp(drag.event.timeMs,drag.frame.begin,drag.frame.end);state.rollPageStart=drag.frame.begin;state.project.durationMs=Math.max(state.project.durationMs,drag.event.timeMs+drag.event.durationMs);saveLibrary();renderBeatGrid(true);renderKeyBoard();updateVisual();syncEditorFields();
 });
 const end=()=>{if(scoreConsole.fine){scoreConsole.fine=null;refreshWorkspace()}};canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);canvas.addEventListener('lostpointercapture',end);
}

function stepConsoleEvent(direction){pauseSong();const events=scoreEvents(state.project),index=clamp(state.selected+direction,0,events.length-1);if(!events[index])return;seekTo(events[index].timeMs);state.selected=index;scoreConsole.selection={project:state.project,event:events[index],note:events[index].notes[0]};state.lastSelected=index;renderKeyBoard();updateVisual();syncEditorFields()}

// Editing operations retain the current view unless their target leaves it.
function settleFineRollView(view,event){
 if(!$('scoreConsole')?.open||scoreConsole.mode!=='fine'||!event)return;
 const drag=scoreConsole.fine;scoreConsole.fine=null;if(drag&&drag.canvas.hasPointerCapture(drag.pointerId))drag.canvas.releasePointerCapture(drag.pointerId);
 cancelRollFinish();const time=event.timeMs,duration=state.project.durationMs,windowMs=state.windowSec*1000;
 const inside=time>=view.begin&&time<view.end||(time===duration&&time===view.end);
 if(inside){state.rollPageStart=view.begin;return}
 const lastStart=Math.floor(Math.max(0,duration-.001)/windowMs)*windowMs;
 state.rollPageStart=time<windowMs?0:time>=lastStart?lastStart:clamp(time-windowMs*PLAYER_RULES.editor.crossPageFocusFraction,0,lastStart);
}

// Each surface owns its own navigation state; score data is the only shared result.
function captureTimelineView(){const frame=rollFrame();return {position:state.position,rollPageStart:frame.begin,windowSec:state.windowSec}}
function applyTimelineView(view){
 if(!view)return;cancelRollFinish();state.windowSec=PLAYER_RULES.roll.windowsSeconds.includes(view.windowSec)?view.windowSec:PLAYER_RULES.roll.initialSeconds;
 state.position=clamp(view.position,0,state.project.durationMs);state.rollPageStart=view.position>state.project.durationMs||view.rollPageStart>=state.project.durationMs?Math.floor(Math.max(0,state.project.durationMs-.001)/(state.windowSec*1000))*state.windowSec*1000:view.rollPageStart;rollFrame();state.selected=beatIndex(state.position);state.lastSelected=-1;state.page=-1;$('rollWindow').value=String(state.windowSec);
}
