function snowPopulate(element,count,scope='world'){element.innerHTML='';for(let i=0;i<count;i++){let dot=document.createElement('i');dot.className='snow-dot';let size=1+Math.random()*3.3;dot.style.cssText=`left:${Math.random()*100}%;width:${size.toFixed(2)}px;height:${size.toFixed(2)}px;opacity:${(.18+Math.random()*.38).toFixed(2)};animation-duration:${(scope==='world'?16:9)+Math.random()*15}s;animation-delay:-${Math.random()*30}s;--dx:${Math.round((Math.random()-.5)*170)}px`;element.append(dot)}}
function renderLibrary(){
 syncStatusNotificationAppearance();syncLibraryFilterPicker(); clearHomeCardPhysics();const q=$('songSearch').value.trim().toLowerCase(),container=$('libraryCards'),filter=$('libraryFilter').value;container.innerHTML='';
 const visible=state.library.filter(song=>(song.title+' '+song.subtitle+' '+(song.author||'')).toLowerCase().includes(q)).filter(song=>filter==='favorite'?song.favorite:filter==='recent'?song.lastOpened>0:true);
 if(filter==='recent')visible.sort((a,b)=>b.lastOpened-a.lastOpened);$('libraryCount').textContent=state.library.length+' 首乐曲';
 for(const song of visible){
  const card=document.createElement('article'),definition=themeDefinition(song),palette=definition.appearance;card.className='song-card light-cone';card.dataset.songId=song.id;
  for(const key of ['stageStart','stageEnd','accent'])card.style.setProperty('--card-'+key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),palette[key]);
  card.innerHTML='<div class="cone-tilt"><div class="cone-flip"><div class="cone-face cone-front"><div class="song-cover"><span class="cover-tag"></span></div><div class="song-details"><div><h3></h3><p></p></div></div></div><div class="cone-face cone-back" aria-hidden="true"><span class="cone-back-label">SCORE ARCHIVE</span><h3></h3><dl class="cone-info"></dl><span class="cone-return">再次点击 · 返回封面</span></div></div><button class="cone-flip-trigger" type="button" aria-pressed="false"></button><div class="cone-foil" aria-hidden="true"></div><div class="cone-sheen" aria-hidden="true"></div><div class="cone-etch" aria-hidden="true"></div><div class="cone-edge" aria-hidden="true"></div><button class="card-play" type="button">'+appIcon('play')+'</button><div class="song-card-actions"></div></div>';
  for(const decoration of card.querySelectorAll('.cone-foil,.cone-sheen,.cone-etch,.cone-edge')){card.querySelector('.cone-back').append(decoration.cloneNode(true));card.querySelector('.cone-front').append(decoration)}
  card.querySelector('.cone-front h3').textContent=song.card?.title||song.title;card.querySelector('.cone-back h3').textContent=song.title;
  card.querySelector('.song-details p').textContent=definition.displayName+' · '+durationFmt(song.durationMs);
  card.querySelector('.cover-tag').textContent=song.originKind==='builtin'?'内置曲谱':song.originKind==='imported'?'导入曲谱':'我的曲谱';
  const coverPath=platformCover(song)||song._imageUrl||definition.decorations.cover;if(coverPath){const image=document.createElement('img');image.alt='';image.src=coverPath.startsWith('data:')?coverPath:themeAsset(coverPath,song);card.querySelector('.song-cover').append(image)}
  const tuning=song.playback?.tuning||'C',details=[['音符数',String(songNotes(song))],['音域',tuning==='sky-original'?'光遇原调':(KEY_DEGREES[tuning]||KEY_DEGREES.C)[0]+' 大调'],['作者',song.author||'未署名']];
  for(const [label,value]of details){const group=document.createElement('div'),term=document.createElement('dt'),content=document.createElement('dd');term.textContent=label;content.textContent=value;content.title=value;group.append(term,content);card.querySelector('.cone-info').append(group)}
  const play=card.querySelector('.card-play');play.setAttribute('aria-label','演奏'+song.title);play.onclick=event=>{event.stopPropagation();enterSongFromCard(song.id,card)};
  const actions=card.querySelector('.song-card-actions');for(const [label,action,title]of [[song.favorite?'favorite-filled':'favorite',()=>favoriteSong(song.id),'收藏'],['edit',()=>renameSong(song.id),'重命名'],['copy',()=>duplicateSong(song.id),'制作副本'],['close',()=>deleteSong(song.id),'删除项目']]){const button=document.createElement('button');button.innerHTML=appIcon(label);button.title=title;button.setAttribute('aria-label',title);button.onclick=event=>{event.stopPropagation();action()};actions.append(button)}
  attachHomeCard(card,song);container.append(card);
 }
 const add=document.createElement('button');add.className='song-card add-card';add.innerHTML='<span class="plus">'+appIcon('plus')+'</span><strong>导入新的乐曲</strong>';add.onclick=openImport;container.append(add);resumeHomePresentation();
}
function openImport(){$('importDialog').showModal()}
function mountPlatformProject(id){cancelScoreEntrance();if(!homeExperience.entry?.mounting)cancelSongEntry();cancelPlayerValueScroll();pauseHomePresentation();cancelRollDrag();invalidateInstrumentChange();closeInstrumentPicker();closeSpeedPicker();closeRangePicker();cancelRollFinish();pauseSong();let p=state.library.find(p=>p.id===id);if(!p){toast('找不到歌曲');return}state.project=p;state.editMode=false;state.editDirty=false;state.editSource=null;state.editBaseline=null;updateEditButton();p.lastOpened=Date.now();if(PLAYER_RULES.sustain.resetOnSongEntry)p.playback.sustain=PLAYER_RULES.sustain.default;saveLibrary();state.position=0;state.rollPageStart=0;state.windowSec=PLAYER_RULES.roll.initialSeconds;$('rollWindow').value=String(state.windowSec);scoreConsole.views.delete(id);scoreConsole.mode=PLAYER_RULES.editor.initialMode;state.selected=0;state.lastSelected=-1;state.page=-1;state.rate=p.playback.rate||1;state.tuning=p.playback.tuning||'C';state.sustain=Number.isFinite(p.playback.sustain)?p.playback.sustain:PLAYER_RULES.sustain.default;state.volume=normalizeVolume(p.playback.volume);syncVolumeControl();$('homeView').hidden=true;$('playerView').hidden=false;state.mode='player';if(homeExperience.entry?.mounting)prepareScoreEntrance();setControlContent($('playBtn'),'play','播放');$('songTitle').textContent=p.title;$('songSubtitle').textContent=p.subtitle;$('durationHeader').textContent=durationFmt(p.durationMs);$('noteCountHeader').textContent=songNotes(p)+' NOTES';syncSpeedPicker();syncLoopControl();syncSustainControl();$('instrumentSelect').value=p.playback.instrument||'offline';$('keySelect').value=Object.hasOwn(KEY_ROOTS,state.tuning)?state.tuning:'C';$('seekSlider').max=p.durationMs;$('seekMax').textContent=durationFmt(p.durationMs);$('playBtn').disabled=false;applyTheme();initializeScene();renderKeyBoard();renderBeatGrid(true);updateVisual();refreshHistoryButtons();try{localStorage.setItem('sky-last-song',id)}catch(e){console.warn('最近播放缓存不可用',e)}requestAnimationFrame(drawRoll);try{history.replaceState(null,'','#song='+encodeURIComponent(id))}catch(e){}}
function goHome(){cancelScoreEntrance();if(!homeExperience.entry?.mounting)cancelSongEntry();cancelPlayerValueScroll();cancelRollDrag();invalidateInstrumentChange();closeInstrumentPicker();closeSpeedPicker();closeRangePicker();cancelRollFinish();if(state.editMode){requestFinishEdit('home');return}pauseSong();state.mode='home';$('playerView').hidden=true;$('homeView').hidden=false;resetHomePresentation();$('songSearch').value='';$('libraryFilter').value='all';$('homeView').scrollTop=0;try{history.replaceState(null,'',location.pathname)}catch(e){};renderLibrary();toast('已返回音乐馆',1000)}
function applyTheme(){let p=state.project;if(!p)return;let theme=sceneId(p),host=$('playerView');applyPlayerTemplate(p,host);if($('scoreConsole')?.open)applyPlayerTemplate(p,$('scoreConsole'));applyPlayerTemplate(p,$('sceneDialog'));$('keyFeedbackLayer').innerHTML='';initializeScene();requestAnimationFrame(drawRoll)}
function beatIndex(time){let events=scoreEvents(state.project);return clamp(lowerBound(events,time+1)-1,0,Math.max(events.length-1,0))}
// A grid cell represents a time slot, not one independently editable audio event.
function editingNoteSelection(){
 if(!state.editMode)return null;const events=scoreEvents(state.project);let selection=scoreConsole.selection;
 if(!selection||selection.project!==state.project||!events.includes(selection.event)){const event=events[state.selected];if(!event?.notes.length)return null;selection=scoreConsole.selection={project:state.project,event,note:event.notes.includes(scoreConsole.selectedNote)?scoreConsole.selectedNote:event.notes[0]}}
 const event=selection.event;if(!event.notes.length)return null;const note=event.notes.includes(selection.note)?selection.note:event.notes[0];selection.note=note;const layout=beatLayout();
 return {event,note,slot:layout.grid?Math.max(0,Math.floor((event.timeMs+1)/layout.step)):events.indexOf(event)};
}
function beatLayout(){
 const p=state.project,events=scoreEvents(p),step=p.score.gridIntervalMs,cached=state.beatLayoutCache;
 if(cached&&cached.project===p&&cached.events===events&&cached.length===events.length&&cached.step===step)return cached;
 const grid=p.score.mode==='grid',cells=new Map();let count=grid?1:events.length;
 events.forEach((event,index)=>{const slot=grid?Math.max(0,Math.floor((event.timeMs+1)/step)):index;let cell=cells.get(slot);if(!cell){cell={timeMs:grid?Math.round(slot*step):event.timeMs,notes:[],indices:[],durationMs:0,confidence:event.confidence};cells.set(slot,cell)}cell.indices.push(index);cell.notes=[...new Set([...cell.notes,...event.notes])].sort((a,b)=>a-b);cell.durationMs=Math.max(cell.durationMs,event.durationMs);count=Math.max(count,slot+1)});
 return state.beatLayoutCache={project:p,events,length:events.length,step,grid,cells,count};
}
function beatDisplayIndex(){const layout=beatLayout();return layout.grid?clamp(Math.floor((state.position+1)/layout.step),0,layout.count-1):Math.max(0,state.selected)}
function displayedBeat(){return beatLayout().cells.get(beatDisplayIndex())||{timeMs:state.position,notes:[],indices:[]}}
function stepEvent(direction){if(!state.project)return;pauseSong();const layout=beatLayout();if(layout.grid){const slot=clamp(beatDisplayIndex()+direction,0,layout.count-1);seekTo(Math.round(slot*layout.step))}else{const events=scoreEvents(state.project),index=clamp(state.selected+direction,0,events.length-1);if(events[index])seekTo(events[index].timeMs)}}
function beatPageSize(){return $('scoreConsole')?.open?PLAYER_RULES.grid.columns*PLAYER_RULES.editor.beatRowsPerSection:BEATS_PER_PAGE}
function renderBeatGrid(force=false){
 if(force)state.beatLayoutCache=null;const layout=beatLayout(),size=beatPageSize(),pg=Math.floor(beatDisplayIndex()/size);if(pg===state.page&&!force)return;state.page=pg;
 const grid=$('beatGrid');grid.innerHTML='';const frag=document.createDocumentFragment();
 for(let slot=pg*size;slot<Math.min(layout.count,(pg+1)*size);slot++){
  const e=layout.cells.get(slot)||{timeMs:Math.round(slot*layout.step),notes:[],indices:[]},btn=document.createElement('button');btn.className='beat'+(e.notes.length===2?' poly2':e.notes.length>=3?' poly3':'')+(e.notes.length?'':' empty')+(e.confidence==='unverified'?' uncertain':'');btn.dataset.index=slot;btn.dataset.timeMs=e.timeMs;btn.disabled=!e.indices.length;btn.title=`${positionFmt(e.timeMs)} · ${eventLabel(e)}`;btn.setAttribute('aria-label',`第 ${String(slot+1).padStart(3,'0')} 格 · ${btn.title}`);
  const label=document.createElement('span');label.className='beat-number';label.textContent=String(slot+1).padStart(3,'0');const dots=document.createElement('div');dots.className='mini-keys';dots.setAttribute('aria-hidden','true');for(let n=1;n<=15;n++){const dot=document.createElement('span');dot.className='mini-dot'+(e.notes.includes(n)?' on':'');dot.dataset.note=n;dots.append(dot)}const name=document.createElement('span');name.className='beat-name';name.textContent=e.notes.length?e.notes.map(noteName).join('·'):'·';btn.append(label,dots,name);
  btn.onclick=click=>{pauseSong();seekTo(e.timeMs);if(e.indices.length){const note=Number(click.target.closest('[data-note]')?.dataset.note);state.selected=e.indices.find(index=>scoreEvents(state.project)[index].notes.includes(note))??e.indices[0];scoreConsole.selectedNote=note||scoreEvents(state.project)[state.selected].notes[0];scoreConsole.selection={project:state.project,event:scoreEvents(state.project)[state.selected],note:scoreConsole.selectedNote};state.lastSelected=state.selected}renderKeyBoard();updateVisual();if(state.editMode)syncEditorFields()};frag.append(btn);
 }
 for(let i=Math.min(layout.count-pg*size,size);i<size;i++){const tile=document.createElement('div');tile.className='beat empty beat-placeholder';tile.setAttribute('aria-hidden','true');frag.append(tile)}grid.append(frag);
 const split=size!==BEATS_PER_PAGE,total=Math.max(1,Math.ceil(layout.count/BEATS_PER_PAGE));$('pageLabel').textContent=(split?String(Math.floor(pg/2)+1)+(pg%2?'B':'A'):String(pg+1).padStart(2,'0'))+' / '+String(total).padStart(2,'0');grid.dataset.section=split?(pg%2?'B':'A'):'full';grid.setAttribute('aria-label',split?'第 '+(Math.floor(pg/2)+1)+' 组 '+(pg%2?'B':'A')+' 段，8列2行逐拍谱':'逐拍谱，8列4行');$('pagePrev').disabled=pg===0;$('pageNext').disabled=pg===Math.max(1,Math.ceil(layout.count/size))-1;
}
function renderKeyBoard(){let c=$('keyBoard');c.innerHTML='';let active=displayedBeat().notes;for(let n=1;n<=15;n++){let b=document.createElement('button');b.className='key-tile'+(active.includes(n)&&!scoreEntranceHidesKeys()?' active':'');b.dataset.note=n;b.setAttribute('aria-label',(canEditScore()?'切换琴键 ':'试听琴键 ')+n+' '+noteName(n));b.innerHTML=`<span class="key-no">${String(n).padStart(2,'0')}</span><span class="key-name">${noteName(n)}</span>`;b.onclick=()=>{renderKeyFeedback(b);toggleNote(n)};c.append(b)}}
async function toggleNote(n){if(!state.project)return;if(scoreConsoleCapture(n))return;if(!canEditScore()){try{await preloadPiano();triggerSample(n,state.audioCtx.currentTime+.02,280)}catch(e){toast('音源尚未就绪',2500)}return}let item=scoreEvents(state.project)[state.selected];if(!item)return;let exists=item.notes.includes(n);rememberEdit({index:state.selected,note:n,position:state.position});item.notes=exists?item.notes.filter(v=>v!==n):[...item.notes,n].sort((a,b)=>a-b);if(item.notes.length&&item.durationMs<70)item.durationMs=190;if(!item.notes.length)item.durationMs=0;item.confidence='user-corrected';scoreConsole.selectedNote=exists?item.notes[0]:n;scoreConsole.selection={project:state.project,event:item,note:scoreConsole.selectedNote};saveLibrary();renderKeyBoard();renderBeatGrid(true);updateVisual();refreshHistoryButtons();if(state.editMode)syncEditorFields();$('noteCountHeader').textContent=songNotes(state.project)+' NOTES';if(!exists){try{await preloadPiano();triggerSample(n,state.audioCtx.currentTime+.015,300)}catch(e){console.warn(e)}}}
function updateVisual(){let p=state.project;if(!p)return;let pos=state.position,events=scoreEvents(p),now=beatIndex(pos);let changed=now!==state.selected;if(state.isPlaying||state.lastSelected!==state.selected){state.selected=now;if(Math.floor(beatDisplayIndex()/beatPageSize())!==state.page)renderBeatGrid();if(changed)renderKeyBoard()}
 state.lastSelected=state.selected;const displayIndex=beatDisplayIndex();if(Math.floor(displayIndex/beatPageSize())!==state.page)renderBeatGrid();if(!state.editMode){$('timeClock').textContent=positionFmt(pos);$('seekSlider').value=Math.round(pos)}$('rollSeekSlider').max=p.durationMs;$('rollSeekSlider').value=Math.round(pos);$('rollPosition').textContent=String(state.selected+1).padStart(4,'0')+' / '+events.length;
 const e=displayedBeat();$('selectedSummary').textContent=eventLabel(e);$('currentBeatIndex').textContent='第 '+String(displayIndex+1).padStart(3,'0')+' 格';$('currentBeatNotes').textContent=eventLabel(e);
 let keys=state.isPlaying?activeNotes(pos):new Set();const editing=editingNoteSelection();
 for(let el of $('beatGrid').children){let index=+el.dataset.index,on=index===displayIndex&&scoreEntranceShowsBeat(el);el.classList.toggle('active',on);el.classList.toggle('select',on);const editingCell=editing&&index===editing.slot;el.classList.toggle('editor-selected',Boolean(editingCell));el.dataset.editingNote=editingCell?String(editing.note):'';el.setAttribute('aria-description',editingCell?'正在编辑音符 '+editing.note+' '+noteName(editing.note):'');el.classList.toggle('echo',state.isPlaying&&index<displayIndex&&index>=displayIndex-8&&beatLayout().cells.get(index)?.notes.length>0);el.setAttribute('aria-current',on?'step':'false');for(let dot of el.querySelectorAll('.mini-dot')){dot.classList.toggle('resonance',on&&keys.has(+dot.dataset.note)&&!e?.notes?.includes(+dot.dataset.note));dot.classList.toggle('editor-note',Boolean(editingCell&&+dot.dataset.note===editing.note))}}
 if(state.isPlaying&&!e?.notes.length&&keys.size){let names=[...keys].sort((a,b)=>a-b).map(noteName).join(' · ');$('currentBeatNotes').textContent='余音 '+names;$('selectedSummary').textContent=names}
 for(let k of $('keyBoard').children){let n=Number(k.dataset.note);k.classList.toggle('ringing',state.isPlaying&&keys.has(n));k.classList.toggle('active',e?.notes?.includes(n)&&!scoreEntranceHidesKey(k))}drawRoll();syncPlaybackKeyFeedback(pos);updateScoreConsole()
}
// Page origin may move independently of the scan phase when the score is scrubbed.
function rollSeekOrigin(position,fraction,windowMs=state.windowSec*1000){
 const span=Math.min(windowMs,state.project.durationMs),lastBegin=Math.max(0,state.project.durationMs-span);
 // Keep the last window fixed in both scrub directions, with no time-scale change.
 if(position>=lastBegin)return lastBegin;
 return Math.min(position-fraction*span,lastBegin);
}
function rollFrame(position=state.position){
 if(typeof scoreConsole!=='undefined'&&scoreConsole.fine){const f=scoreConsole.fine.frame;return {...f,phase:clamp(position-f.begin,0,f.windowMs)}}
 const nominal=state.windowSec*1000,duration=state.project.durationMs,windowMs=Math.max(1,Math.min(nominal,duration)),lastBegin=Math.max(0,duration-windowMs);
 if(state.rollFinish){const f=state.rollFinish;return {begin:f.begin,end:f.begin+f.windowMs,windowMs:f.windowMs,phase:Math.min(f.windowMs,f.phase+(performance.now()-f.at)*f.rate)}}
 let begin=state.rollPageStart,phase=position-begin;
 if(phase<0||phase>=nominal){
  // Exact page-boundary endings belong to the previous page, never a new blank page.
  const pagePosition=position>=duration?Math.max(0,position-.001):position;
  begin+=Math.floor((pagePosition-begin)/nominal)*nominal;
 }
 // Every entry path (playback, global seek, page arrows, editor and roll scrub)
 // shares one full-sized final window. Never magnify a short remainder page.
 begin=Math.min(begin,lastBegin);
 state.rollPageStart=begin;
 return {begin,end:begin+windowMs,windowMs,phase:clamp(position-begin,0,windowMs)};
}
function cancelRollFinish(){cancelAnimationFrame(state.rollFinishRaf);state.rollFinishRaf=0;state.rollFinish=null}
function finishRollScan(){
 const frame=rollFrame(state.project.durationMs);
 state.rollFinish={begin:frame.begin,windowMs:frame.windowMs,phase:frame.windowMs,at:performance.now(),rate:state.rate};
 pauseSong();drawRoll();
}
function rollTimeLabels(frame=rollFrame()){
 const {begin,end}=frame,step=PLAYER_RULES.roll.labelIntervalSecondsByWindow[state.windowSec]*1000,labels=[];
 for(let timeMs=Math.max(0,Math.ceil(begin/step)*step);timeMs<=end;timeMs+=step)labels.push({timeMs,terminal:false});
 const events=platformController.events();let last=null;for(let i=events.length-1;i>=0;i--)if(events[i].notes.length){last=events[i];break}
 if(last&&last.timeMs>=begin&&last.timeMs<=end){
  let timeMs=Math.max(Math.ceil(begin/1000)*1000,Math.min(Math.floor(end/1000)*1000,Math.round(last.timeMs/1000)*1000));
  if(timeMs<begin||timeMs>end)timeMs=last.timeMs;
  const existing=labels.find(label=>label.timeMs===timeMs);if(existing)existing.terminal=true;else labels.push({timeMs,terminal:true});
 }
 return labels.sort((a,b)=>a.timeMs-b.timeMs);
}
function rollTimeText(timeMs){return Number((timeMs/1000).toFixed(3))+'s'}
function rollPlotGeometry(rect,frame=rollFrame(),context=$('rollCanvas').getContext('2d')){
 context.save();context.font='10px ui-monospace,monospace';const right=Math.max(13,context.measureText(rollTimeText(frame.end)).width/2+4);context.restore();
 return {left:59,top:25,bottom:23,right,plotW:rect.width-59-right};
}
function drawRoll(){if(!state.project||state.mode!=='player')return;let cv=$('rollCanvas'),rect=cv.getBoundingClientRect();if(rect.width<30||rect.height<30)return;let dpr=Math.min(2,devicePixelRatio||1);if(cv.width!==Math.round(rect.width*dpr)||cv.height!==Math.round(rect.height*dpr)){cv.width=Math.round(rect.width*dpr);cv.height=Math.round(rect.height*dpr)}const c=cv.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);let W=rect.width,H=rect.height,left=59,top=25,bottom=23,sec=state.windowSec,{begin,end,windowMs,phase}=rollFrame();const {plotW}=rollPlotGeometry(rect,{begin,end},c),rowH=(H-top-bottom)/15;
 const colors=state.playerColors||PLAYER_APPEARANCE[APP_CONFIG.defaultTheme];
 const paper=rollPaletteForTheme(themeDefinition(),colors);
 c.clearRect(0,0,W,H);c.fillStyle=paper.base;c.fillRect(0,0,W,H);
 const cellGrid=true;
 // Three five-lane groups preserve the requested light / mid / dark / mid / light rhythm.
 for(let row=0;row<15;row++){let n=15-row,y=top+row*rowH,anchor=n===1||n===8||n===15;c.fillStyle=paper[['light','medium','dark','medium','light'][row%5]];c.fillRect(left,y,plotW,rowH);c.fillStyle=anchor?paper.anchor:paper.label;c.font=`600 ${Math.min(11,Math.max(9,rowH*.54))}px Georgia,serif`;c.textAlign='right';c.textBaseline='middle';c.fillText(n+' '+noteName(n),left-7,y+rowH/2)}
 // Draw subdivisions after opaque lane fills in every supported window.
 if(cellGrid){const divisions=PLAYER_RULES.roll.subdivisionsPerSecond,stepMs=1000/divisions;for(let i=Math.ceil(begin/stepMs);i*stepMs<=end;i++){if(i%divisions===0)continue;let x=left+(i*stepMs-begin)/windowMs*plotW;c.strokeStyle=i%3===0?paper.label+'40':paper.label+'20';c.lineWidth=.6;c.beginPath();c.moveTo(x,top);c.lineTo(x,H-bottom);c.stroke()}c.lineWidth=1;for(let row=0;row<=15;row++){let y=top+row*rowH;c.strokeStyle=paper.label+'20';c.beginPath();c.moveTo(left,y);c.lineTo(left+plotW,y);c.stroke()}}
 // Keep second grid lines independent of the sparser time labels.
 for(let t=Math.max(0,Math.ceil(begin/1000)*1000);t<=end;t+=1000){const x=left+(t-begin)/windowMs*plotW;c.strokeStyle=cellGrid?paper.anchor+'55':paper.label+'20';c.beginPath();c.moveTo(x,top);c.lineTo(x,H-bottom);c.stroke()}
 c.textAlign='center';c.textBaseline='middle';c.fillStyle=paper.anchor;c.font='10px ui-monospace,monospace';
 const labels=rollTimeLabels({begin,end}),terminal=labels.find(label=>label.terminal),labelX=label=>left+(label.timeMs-begin)/windowMs*plotW;
 for(const label of labels){
  const text=rollTimeText(label.timeMs),x=labelX(label);
  // Preserve the final-note label when a short last page would crowd a regular tick.
  if(terminal&&label!==terminal&&Math.abs(x-labelX(terminal))<(c.measureText(text).width+c.measureText(rollTimeText(terminal.timeMs)).width)/2+6)continue;
  if(label.timeMs%1000!==0){c.strokeStyle='#79927b88';c.beginPath();c.moveTo(x,top);c.lineTo(x,H-bottom);c.stroke()}
  c.fillText(text,x,12);
 }
 c.save();c.beginPath();c.rect(left,top,plotW,H-top-bottom);c.clip();const editing=editingNoteSelection(),ev=platformController.events(),start=lowerBound(ev,begin-10000);for(let i=start;i<ev.length;i++){let e=ev[i];if(e.timeMs>end)break;if(!e.notes.length)continue;let x=left+(e.timeMs-begin)/windowMs*plotW;let width=Math.max(3,Math.min($('scoreConsole')?.open&&scoreConsole.mode==='fine'?Infinity:22,(e.durationMs||180)/windowMs*plotW));for(let n of e.notes){const arrival=scoreEntranceRollProgress(e.timeMs,begin,windowMs);if(arrival<=0)continue;c.save();c.globalAlpha=arrival;let tileWidth=Math.max(2,width-1.8),tileHeight=Math.max(3,rowH*.5),tileX=x+.8,y=top+(15-n)*rowH+(rowH-tileHeight)/2+(1-arrival)*PLAYER_RULES.scoreEntrance.rollRisePx;
 // Keep repeated notes distinct even when their sounding durations overlap.
 for(let j=i+1;j<ev.length&&ev[j].timeMs<e.timeMs+(width+2)/plotW*windowMs;j++){if(ev[j].notes.includes(n)){tileWidth=Math.min(tileWidth,Math.max(.8,(ev[j].timeMs-e.timeMs)/windowMs*plotW-1.8));break}}
 c.fillStyle=e.notes.length>=3?colors.poly:e.notes.length===2?colors.chord:colors.note;c.shadowColor='rgba(0,0,0,.65)';c.shadowBlur=3;c.shadowOffsetY=1;c.beginPath();c.roundRect(tileX,y,tileWidth,tileHeight,Math.min(2,tileWidth/2,tileHeight/2));c.fill();c.save();c.shadowBlur=0;c.shadowOffsetY=0;c.lineWidth=.75;c.strokeStyle=paper.base;c.stroke();c.restore();if(editing&&editing.event===e&&editing.note===n){const boxLeft=Math.max(left+1,tileX-2),boxRight=Math.min(left+plotW-1,tileX+tileWidth+2);if(boxRight>boxLeft){c.save();c.strokeStyle=PLAYER_RULES.editor.selectionOutline;c.lineWidth=2;c.shadowColor=PLAYER_RULES.editor.selectionOutline;c.shadowBlur=5;c.shadowOffsetY=0;c.beginPath();c.roundRect(boxLeft,y-2,boxRight-boxLeft,tileHeight+4,3);c.stroke();c.restore()}}c.restore()}}
 c.restore();let cursorX=left+phase/windowMs*plotW;c.strokeStyle='#ffd89c';c.lineWidth=1.5;c.beginPath();c.moveTo(cursorX,top);c.lineTo(cursorX,H-bottom);c.stroke();c.fillStyle='#ffe0ac';c.beginPath();c.arc(cursorX,top,3.6,0,Math.PI*2);c.fill();c.beginPath();c.arc(cursorX,H-bottom,3.6,0,Math.PI*2);c.fill();c.lineWidth=1
}
