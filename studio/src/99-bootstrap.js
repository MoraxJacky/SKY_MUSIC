function install(){state.library=BUILTINS.map(p=>normalize(p));loadLibrary();snowPopulate($('worldSnow'),70);snowPopulate($('stageSnow'),24,'stage');$('showGuide').onclick=()=>$('helpDialog').showModal();for(let b of document.querySelectorAll('[data-import]'))b.onclick=openImport;$('openFirst').onclick=()=>openSong(state.library[0].id);$('songSearch').oninput=renderLibrary;$('backLibrary').onclick=goHome;
 $('fileInput').onchange=async ev=>{let file=ev.target.files?.[0];ev.target.value='';if(!file)return;toast('正在检查 '+file.name,1200);try{await importFile(file)}catch(err){console.error('Import failed',err);toast('导入失败：'+err.message,7500)}};
 $('playBtn').onclick=()=>playPause();$('restartBtn').onclick=()=>seekTo(0);
 $('sustainSlider').oninput=ev=>{state.sustain=Number(ev.target.value)/100;$('sustainValue').textContent=Math.round(state.sustain*100)+'%';if(state.project){state.project.playback.sustain=state.sustain;saveLibrary()}updateSustainAudio()};
 $('speedSelect').onchange=ev=>{let was=state.isPlaying;if(was)pauseSong();state.rate=Number(ev.target.value);if(state.project){state.project.playback.rate=state.rate;saveLibrary()}if(was)playPause()};
 $('rollWindow').onchange=ev=>{const finishing=Boolean(state.rollFinish),fraction=rollFrame().phase/(state.windowSec*1000);cancelRollFinish();state.windowSec=Number(ev.target.value);state.rollPageStart=state.position-fraction*state.windowSec*1000;if(finishing)finishRollScan();else drawRoll()};
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
 bindWorkspace();bindVideo();renderLibrary();if(location.hash.startsWith('#song=')){let id=decodeURIComponent(location.hash.slice(6));if(state.library.some(x=>x.id===id))openSong(id)}
 }
function setTuningButtons(){if($('keySelect'))$('keySelect').value=Object.hasOwn(KEY_ROOTS,state.tuning)?state.tuning:'C'}
// Avoid editing the user-provided v7 backup: all transforms occur on copied score objects.
const oldOpenSong=openSong;openSong=function(id){oldOpenSong(id);setTuningButtons();updateEditButton()};
window.__SKY_STUDIO_TEST__={state,openSong,goHome,normalize,makeZip,readZip,unpackProject,parseMIDI,parseCSV,parseMusicXML,exportProject,exportMIDI,exportCSV,importFile,createProject,renameSong,renameConfirmed,duplicateSong,deleteSong,deleteConfirmed,completeEdit,openEditor,requestFinishEdit,KEY_ROOTS,noteMidi,noteName,rollFrame,undo,redo,eventInsert,eventRemove,applyThemeFields,analyseSkyGrid,applyPlayerTemplate,PLAYER_TEMPLATE_ID};
install();startDbBackup();
})();
