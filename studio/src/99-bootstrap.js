function install(){restorePlatformThemes();state.library=BUILTINS.map(p=>normalize(p));loadLibrary();snowPopulate($('worldSnow'),70);snowPopulate($('stageSnow'),24,'stage');$('showGuide').onclick=()=>$('helpDialog').showModal();for(let b of document.querySelectorAll('[data-import]'))b.onclick=openImport;$('openFirst').onclick=()=>openSong(state.library[0].id);$('songSearch').oninput=renderLibrary;
 $('fileInput').onchange=async ev=>{let files=[...(ev.target.files||[])],file=files[0];ev.target.value='';if(!file)return;toast('正在检查 '+file.name,1200);try{await importFiles(files)}catch(err){console.error('Import failed',err);toast('导入失败：'+err.message,7500)}};
 $('importThemeLibrary').onclick=()=>$('themeLibraryInput').click();$('themeLibraryInput').onchange=async ev=>{const file=ev.target.files?.[0];ev.target.value='';if(file)try{await importFile(file)}catch(error){toast('主题录入失败：'+error.message,7500)}};
 bindPlayerInteractions();
 bindRangePicker();bindInstrumentPicker();bindSpeedPicker();bindWorkspace();bindScoreConsole();bindVideo();bindHomeExperience();renderLibrary();const navigation=performance.getEntriesByType?.('navigation')?.[0];if(navigation?.type==='reload'){try{history.replaceState(null,'',location.pathname+location.search)}catch(error){}}else if(location.hash.startsWith('#song=')){let id=decodeURIComponent(location.hash.slice(6));if(state.library.some(x=>x.id===id))openSong(id)}
 }
// Browsers can restore a complete page or its form controls independently of app data.
function resetStartupNavigation(home=true){
 stopConsoleRecording();cancelRollDrag();pauseSong();cancelRollFinish();closeInstrumentPicker();closeSpeedPicker();closeRangePicker();
 if($('scoreConsole').open)closeScoreConsole();
 if(state.editMode&&state.editSource)state.project=state.editSource;
 state.editMode=false;state.editDirty=false;state.editSource=null;state.editBaseline=null;state.pendingEditAction=null;
 state.history.clear();state.future.clear();scoreConsole.views.clear();scoreConsole.returnView=null;scoreConsole.selection=null;scoreConsole.selectedNote=null;scoreConsole.mode=PLAYER_RULES.editor.initialMode;
 state.position=0;state.rollPageStart=0;state.windowSec=PLAYER_RULES.roll.initialSeconds;state.selected=0;state.lastSelected=-1;state.page=-1;state.beatLayoutCache=null;
 for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();
 for(const id of ['consoleInterval','consoleNoteDuration','consoleGenerateInterval','consoleNumberScore','quantizeMs','offsetMs','batchDuration','stretchFactor']){const input=$(id);input.value=input.defaultValue}
 $('consoleRecordMode').value='step';$('rollWindow').value=String(state.windowSec);$('timeClock').textContent=positionFmt(0);$('consoleClock').textContent=positionFmt(0);$('seekSlider').value='0';$('rollSeekSlider').value='0';$('playBtn').textContent='▶ 播放';
 updateEditButton();
 if(home){state.mode='home';state.project=null;resetHomePresentation();$('playerView').hidden=true;$('homeView').hidden=false;$('songSearch').value='';$('libraryFilter').value='all';$('homeView').scrollTop=0;try{history.replaceState(null,'',location.pathname+location.search)}catch(error){}renderLibrary()}
 else if(state.project){refreshWorkspace()}
 try{window.scrollTo(0,0)}catch(error){}
}
function bindStartupNavigation(){
 try{history.scrollRestoration='manual'}catch(error){}
 window.addEventListener('pageshow',event=>{const navigation=performance.getEntriesByType?.('navigation')?.[0],home=event.persisted||navigation?.type==='reload'||state.mode==='home';resetStartupNavigation(home);requestAnimationFrame(()=>{if(state.position===0&&!state.editMode){$('seekSlider').value='0';$('rollSeekSlider').value='0';$('rollWindow').value=String(PLAYER_RULES.roll.initialSeconds)}})});
}
// Avoid editing the user-provided v7 backup: all transforms occur on copied score objects.

window.__SKY_STUDIO_TEST__={state,openSong,goHome,normalize,makeZip,readZip,unpackProject,parseMIDI,parseCSV,parseMusicXML,exportProject,exportMIDI,exportCSV,importFile,createProject,renameSong,renameConfirmed,duplicateSong,deleteSong,deleteConfirmed,completeEdit,openEditor,requestFinishEdit,KEY_ROOTS,noteMidi,noteName,rollFrame,rollTimeLabels,rollPlotGeometry,platformController,importFiles,importPlatformFile,readMusicResource,exportPlatformEntry,projectEntry,PLAYER_RULES,THEME_DEFINITIONS,bindPlayerInteractions,INSTRUMENTS,loadInstrumentBank,preloadPiano,triggerSample,chooseInstrument,undo,redo,eventInsert,eventRemove,applyThemeFields,analyseSkyGrid,applyPlayerTemplate,PLAYER_TEMPLATE_ID};
install();bindStartupNavigation();startDbBackup();
})();
