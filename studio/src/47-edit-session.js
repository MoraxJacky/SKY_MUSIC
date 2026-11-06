function canEditScore(){return Boolean(state.editMode&&$('scoreConsole').open&&!$('saveChoiceDialog').open)}
// Transactional score editing. The public library copy remains untouched until Save.
function updateEditButton(){
 const on=Boolean(state.editMode),p=$('playerView');if(!p)return;
 p.classList.toggle('editing',on);
 const b=$('scoreEditorBtn');setControlContent(b,'edit','曲谱编辑');
 b.classList.toggle('has-changes',on&&state.editDirty);
 const hint=$('gridHint');if(hint)hint.textContent=on?'点击节拍选择事件':'点击节拍可查看';
 const info=$('saveMetadata');if(info)info.hidden=!on;
}
function requestFinishEdit(action='exit'){
 closeConsoleRangePicker(); if(!state.editMode){if(action==='home')goHome();return}
 stopConsoleRecording();pauseSong();cancelRollDrag();const drag=scoreConsole.fine;scoreConsole.fine=null;if(drag&&drag.canvas.hasPointerCapture(drag.pointerId))drag.canvas.releasePointerCapture(drag.pointerId);
 state.pendingEditAction=action;
 if(!$('saveChoiceDialog').open)$('saveChoiceDialog').showModal();
}
function completeEdit(kind){
 if(!state.editMode)return;
 const editorView=captureTimelineView();closeScoreConsole();pauseSong();
 const action=state.pendingEditAction||'exit',working=state.project,original=state.editSource;
 let chosen=original;
 if(kind==='direct'||kind==='new')trimTrailingRests(working);
 if(kind==='direct'){
  const idx=state.library.findIndex(p=>p.id===original.id);
  if(idx<0){toast('找不到原曲，无法直接保存');return}
  state.library[idx]=working;chosen=working;
 }else if(kind==='new'){
  chosen=normalize({...copy(working),id:nextId('copy'),title:working.title+' · 新曲谱',originKind:'user',provenance:{...working.provenance,source:'用户另存为',derivedFrom:original.id}});
  chosen._imageUrl=working._imageUrl;chosen._imageBytes=working._imageBytes;
  state.library.unshift(chosen);
 }else if(kind!=='discard')return;
 if($('saveChoiceDialog').open)$('saveChoiceDialog').close();
 state.project=chosen;state.editMode=false;state.editDirty=false;state.editSource=null;state.editBaseline=null;state.pendingEditAction=null;
 scoreConsole.views.set(original.id,editorView);if(kind==='new')scoreConsole.views.set(chosen.id,{...editorView});const playerView=scoreConsole.returnView;scoreConsole.returnView=null;applyTimelineView(playerView);
 state.history.delete(original.id);state.future.delete(original.id);updateEditButton();
 saveLibrary();
 if(action==='home'&&kind!=='new'){returnHomeFromPlayer();return}
 try{history.replaceState(null,'','#song='+encodeURIComponent(chosen.id))}catch(error){}
 state.rate=chosen.playback?.rate||1;state.volume=normalizeVolume(chosen.playback?.volume);syncSpeedPicker();syncVolumeControl();
 state.tuning=chosen.playback?.tuning||'C';state.sustain=chosen.playback?.sustain??PLAYER_RULES.sustain.default;
 refreshWorkspace();renderLibrary();saveLibrary();
 toast(kind==='new'?'已另存为新曲谱，请选择导出格式':kind==='direct'?'已保存，已结束编辑':'已结束编辑，未保存修改');
 if(kind==='new')openExport(true,action==='home');
}
function openSongInfo(){if(!state.project)return;syncEditorFields();for(let id of ['metaTitle','metaSubtitle','metaDescription'])$(id).readOnly=!state.editMode;$('saveMetadata').hidden=!state.editMode;$('metadataDialog').showModal()}
