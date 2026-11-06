function install(){restorePlatformThemes();state.library=BUILTINS.map(p=>normalize(p));loadLibrary();snowPopulate($('worldSnow'),70);snowPopulate($('stageSnow'),24,'stage');$('showGuide').onclick=()=>$('helpDialog').showModal();for(let b of document.querySelectorAll('[data-import]'))b.onclick=openImport;$('openFirst').onclick=()=>openSong(state.library[0].id);$('songSearch').oninput=renderLibrary;
 $('fileInput').onchange=async ev=>{let files=[...(ev.target.files||[])],file=files[0];ev.target.value='';if(!file)return;toast('正在检查 '+file.name,1200);try{await importFiles(files)}catch(err){console.error('Import failed',err);toast('导入失败：'+err.message,7500)}};
 $('importThemeLibrary').onclick=()=>$('themeLibraryInput').click();$('themeLibraryInput').onchange=async ev=>{const file=ev.target.files?.[0];ev.target.value='';if(file)try{await importFile(file)}catch(error){toast('主题录入失败：'+error.message,7500)}};
 bindPlayerInteractions();
 bindRangePicker();bindInstrumentPicker();bindSpeedPicker();bindWorkspace();bindVideo();renderLibrary();if(location.hash.startsWith('#song=')){let id=decodeURIComponent(location.hash.slice(6));if(state.library.some(x=>x.id===id))openSong(id)}
 }
// Avoid editing the user-provided v7 backup: all transforms occur on copied score objects.

window.__SKY_STUDIO_TEST__={state,openSong,goHome,normalize,makeZip,readZip,unpackProject,parseMIDI,parseCSV,parseMusicXML,exportProject,exportMIDI,exportCSV,importFile,createProject,renameSong,renameConfirmed,duplicateSong,deleteSong,deleteConfirmed,completeEdit,openEditor,requestFinishEdit,KEY_ROOTS,noteMidi,noteName,rollFrame,rollTimeLabels,rollPlotGeometry,platformController,importFiles,importPlatformFile,readMusicResource,exportPlatformEntry,projectEntry,PLAYER_RULES,THEME_DEFINITIONS,bindPlayerInteractions,INSTRUMENTS,loadInstrumentBank,preloadPiano,triggerSample,chooseInstrument,undo,redo,eventInsert,eventRemove,applyThemeFields,analyseSkyGrid,applyPlayerTemplate,PLAYER_TEMPLATE_ID};
install();startDbBackup();
})();
