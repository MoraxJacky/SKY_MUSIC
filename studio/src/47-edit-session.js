// Transactional score editing. The public library copy remains untouched until Save.
function updateEditButton(){
 const on=Boolean(state.editMode),p=$('playerView');if(!p)return;
 p.classList.toggle('editing',on);
 const b=$('scoreEditorBtn');b.textContent=!on?'✎ 曲谱编辑':state.editDirty?'▣ 保存':'✓ 完成编辑';
 b.classList.toggle('has-changes',on&&state.editDirty);
 const hint=$('gridHint');if(hint)hint.textContent=on?'点击节拍选择事件':'点击节拍可查看';
 const info=$('saveMetadata');if(info)info.hidden=!on;
}
function requestFinishEdit(action='exit'){
 if(!state.editMode){if(action==='home')goHome();return}
 state.pendingEditAction=action;
 if(state.editDirty){$('saveChoiceDialog').showModal();return}
 completeEdit('discard');
}
function completeEdit(kind){
 if(!state.editMode)return;
 pauseSong();
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
 state.history.delete(original.id);state.future.delete(original.id);updateEditButton();
 saveLibrary();
 if(action==='home'){goHome();return}
 state.tuning=chosen.playback?.tuning||'C';state.sustain=chosen.playback?.sustain??.45;
 refreshWorkspace();renderLibrary();saveLibrary();
 toast(kind==='new'?'已另存为普通曲谱，可自由重命名和删除':kind==='direct'?'已保存当前项目':'已退出编辑模式');
}
function openSongInfo(){if(!state.project)return;syncEditorFields();for(let id of ['metaTitle','metaSubtitle','metaDescription'])$(id).readOnly=!state.editMode;$('saveMetadata').hidden=!state.editMode;$('metadataDialog').showModal()}
