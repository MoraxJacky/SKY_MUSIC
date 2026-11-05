function install(){state.library=BUILTINS.map(p=>normalize(p));loadLibrary();snowPopulate($('worldSnow'),70);snowPopulate($('stageSnow'),24,'stage');$('showGuide').onclick=()=>$('helpDialog').showModal();for(let b of document.querySelectorAll('[data-import]'))b.onclick=openImport;$('openFirst').onclick=()=>openSong(state.library[0].id);$('songSearch').oninput=renderLibrary;$('backLibrary').onclick=goHome;
 $('fileInput').onchange=async ev=>{let file=ev.target.files?.[0];ev.target.value='';if(!file)return;toast('正在检查 '+file.name,1200);try{await importFile(file)}catch(err){console.error('Import failed',err);toast('导入失败：'+err.message,7500)}};
 $('playBtn').onclick=()=>playPause();$('restartBtn').onclick=()=>seekTo(0);
 $('sustainSlider').oninput=ev=>{state.sustain=Number(ev.target.value)/100;$('sustainValue').textContent=Math.round(state.sustain*100)+'%';if(state.project){state.project.playback.sustain=state.sustain;saveLibrary()}updateSustainAudio()};
 $('speedSelect').onchange=ev=>{let was=state.isPlaying;if(was)pauseSong();state.rate=Number(ev.target.value);if(state.project){state.project.playback.rate=state.rate;saveLibrary()}if(was)playPause()};
 $('rollWindow').onchange=ev=>{const finishing=Boolean(state.rollFinish),frame=rollFrame(),fraction=frame.phase/frame.windowMs;cancelRollFinish();state.windowSec=Number(ev.target.value);state.rollPageStart=rollSeekOrigin(state.position,fraction);if(finishing)finishRollScan();else drawRoll()};
 $('rollWindow').value=String(state.windowSec);$('stepPrev').onclick=()=>stepEvent(-1);$('stepNext').onclick=()=>stepEvent(1);
 $('seekSlider').oninput=ev=>seekTo(Number(ev.target.value));
 $('rollSeekSlider').oninput=ev=>seekTo(Number(ev.target.value),true);
 $('pagePrev').onclick=()=>{pauseSong();let pg=Math.floor(state.selected/32);let ev=scoreEvents(state.project),i=Math.max(0,(pg-1)*32);seekTo(ev[i]?.timeMs||0)};
 $('pageNext').onclick=()=>{pauseSong();let pg=Math.floor(state.selected/32);let ev=scoreEvents(state.project),i=Math.min(ev.length-1,(pg+1)*32);seekTo(ev[i]?.timeMs||0)};
 $('resetKeyEdit').onclick=()=>{if(!state.editMode)return;let p=state.project;let original=BUILTINS.find(x=>x.id===(p.provenance?.derivedFrom||p.id));let e=scoreEvents(p)[state.selected],reference=original&&scoreEvents(original)[state.selected];if(!e)return;if(reference){rememberEdit();e.notes=[...reference.notes];e.durationMs=reference.durationMs;e.confidence='source';renderKeyBoard();renderBeatGrid(true);updateVisual();toast('已恢复此格的原始琴键')}else toast('导入曲目无内置原谱，请通过导入文件恢复')};
 $('keySelect').onchange=ev=>{if(!state.project)return;let was=state.isPlaying;if(was)pauseSong();state.tuning=ev.target.value;state.project.playback.tuning=state.tuning;saveLibrary();setTuningButtons();renderKeyBoard();renderBeatGrid(true);updateVisual();if(state.editMode)syncEditorFields();if(was)playPause()};
 $('instrumentSelect').onchange=async ev=>{if(!state.project)return;let was=state.isPlaying;if(was)pauseSong();state.project.playback.instrument=ev.target.value;saveLibrary();toast('正在切换钢琴音色…',1100);try{await preloadPiano()}catch(err){console.warn(err);toast('音源加载异常：'+err.message,5000)}if(was)playPause()};
 document.addEventListener('keydown',e=>{if(state.mode!=='player'||e.target.closest('input,select,textarea,button'))return;if(e.code==='Space'){e.preventDefault();playPause()}else if(e.code==='ArrowRight'){e.preventDefault();stepEvent(1)}else if(e.code==='ArrowLeft'){e.preventDefault();stepEvent(-1)}});
 window.addEventListener('resize',()=>{if(state.mode==='player')requestAnimationFrame(()=>{drawRoll();if(!state.isPlaying)initializeScene()})});
 bindRangePicker();bindWorkspace();bindVideo();renderLibrary();if(location.hash.startsWith('#song=')){let id=decodeURIComponent(location.hash.slice(6));if(state.library.some(x=>x.id===id))openSong(id)}
 }
function setTuningButtons(){
 const key=Object.hasOwn(KEY_ROOTS,state.tuning)?state.tuning:'C';
 $('keySelect').value=key;$('keyRangeValue').textContent=KEY_DEGREES[key][0]+' 大调';
 for(const button of document.querySelectorAll('#keyRangeMenu [data-key]'))button.setAttribute('aria-selected',String(button.dataset.key===key));
}
function closeRangePicker(returnFocus=false){$('keyRangeMenu').hidden=true;$('keyRangeToggle').setAttribute('aria-expanded','false');if(returnFocus)$('keyRangeToggle').focus()}
function positionRangePicker(){
 const trigger=$('keyRangeToggle'),menu=$('keyRangeMenu'),rect=trigger.getBoundingClientRect();
 let width=Math.min(252,Math.max(0,rect.left-20)),left=rect.left-width-8;
 // Narrow screens retain one horizontal strip; never fall back to a downward menu.
 if(width<120){width=Math.min(252,innerWidth-24);left=12}
 menu.style.width=width+'px';menu.style.left=left+'px';menu.style.top=Math.max(8,Math.min(innerHeight-46,rect.top+(rect.height-42)/2))+'px';
}
function openRangePicker(){
 setTuningButtons();$('keyRangeMenu').hidden=false;$('keyRangeToggle').setAttribute('aria-expanded','true');positionRangePicker();
 const selected=$('keyRangeMenu').querySelector('[aria-selected="true"]');selected?.focus({preventScroll:true});selected?.scrollIntoView({block:'nearest',inline:'nearest'});
}
function bindRangePicker(){
 const trigger=$('keyRangeToggle'),menu=$('keyRangeMenu');
 trigger.onclick=()=>menu.hidden?openRangePicker():closeRangePicker();
 menu.addEventListener('wheel',event=>{event.preventDefault();menu.scrollLeft+=event.deltaX+event.deltaY},{passive:false});
 trigger.onkeydown=event=>{if(['ArrowLeft','ArrowRight','ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();openRangePicker()}};
 for(const button of menu.querySelectorAll('[data-key]'))button.onclick=()=>{
  $('keySelect').value=button.dataset.key;$('keySelect').onchange({target:$('keySelect')});closeRangePicker(true);
 };
 menu.onkeydown=event=>{
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
// Avoid editing the user-provided v7 backup: all transforms occur on copied score objects.
const oldOpenSong=openSong;openSong=function(id){oldOpenSong(id);setTuningButtons();updateEditButton()};
window.__SKY_STUDIO_TEST__={state,openSong,goHome,normalize,makeZip,readZip,unpackProject,parseMIDI,parseCSV,parseMusicXML,exportProject,exportMIDI,exportCSV,importFile,createProject,renameSong,renameConfirmed,duplicateSong,deleteSong,deleteConfirmed,completeEdit,openEditor,requestFinishEdit,KEY_ROOTS,noteMidi,noteName,rollFrame,undo,redo,eventInsert,eventRemove,applyThemeFields,analyseSkyGrid,applyPlayerTemplate,PLAYER_TEMPLATE_ID};
install();startDbBackup();
})();
