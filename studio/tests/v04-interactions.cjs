const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(root+'/app/js/studio.js','utf8');
const elements=new Map(),storage=new Map(),nop=()=>{};
const canvasCtx=new Proxy({measureText:s=>({width:s.length*9}),createLinearGradient:()=>({addColorStop:nop}),createRadialGradient:()=>({addColorStop:nop})},{get(o,k){return k in o?o[k]:nop},set(o,k,v){o[k]=v;return true}});
function element(tag='div',id=''){
 const e={tagName:tag,id,children:[],dataset:{},style:{setProperty:nop},hidden:false,disabled:false,open:false,value:'',textContent:'',innerHTML:'',checked:false,complete:true,naturalWidth:960,naturalHeight:530,width:600,height:300};
 e.classList={add:nop,remove:nop,toggle:nop,contains:()=>false};e.setAttribute=nop;e.addEventListener=nop;e.removeEventListener=nop;e.append=(...items)=>e.children.push(...items);e.prepend=e.append;e.remove=nop;e.replaceChildren=(...items)=>e.children=items;e.showModal=()=>e.open=true;e.close=()=>e.open=false;e.focus=nop;e.click=nop;e.getBoundingClientRect=()=>({width:700,height:300,left:0,top:0,right:700,bottom:300});e.getContext=()=>canvasCtx;e.querySelector=()=>element();e.querySelectorAll=()=>[];return e;
}
const doc={getElementById(id){if(!elements.has(id))elements.set(id,element('div',id));return elements.get(id)},createElement:t=>element(t),createDocumentFragment:()=>element('fragment'),querySelectorAll:()=>[],querySelector:()=>element(),addEventListener:nop,body:element('body')};
const canon=JSON.parse(fs.readFileSync(root+'/samples/canon.json','utf8'));
const starlight=JSON.parse(fs.readFileSync(root+'/samples/starlight-demo.json','utf8'));
const city=JSON.parse(fs.readFileSync(root+'/samples/citylights-demo.json','utf8'));
let win={SKY_BUILTINS:[canon,starlight,city],SKY_SAMPLES:{},SKY_EMBED_SCENES:{},addEventListener:nop,location:{hash:'',pathname:'/'}},loc=win.location;
const ctx=vm.createContext({window:win,document:doc,history:{replaceState:nop},location:loc,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},Image:class{constructor(){this.width=960;this.height=530;this.complete=true;this.naturalWidth=960}set src(v){this._src=v}get src(){return this._src}},devicePixelRatio:1,requestAnimationFrame:nop,cancelAnimationFrame:nop,performance,setTimeout,clearTimeout,setInterval,clearInterval,TextEncoder,TextDecoder,Uint8Array,DataView,ArrayBuffer,Blob,Response,DecompressionStream,URL,console,atob,btoa,Math,Date});
vm.runInContext(fs.readFileSync(root+'/app/js/studio-config.js','utf8'),ctx);vm.runInContext(source,ctx,{timeout:30000});let T=win.__SKY_STUDIO_TEST__,s=T.state;
function check(cond,msg){if(!cond)throw Error('FAIL: '+msg);console.log('PASS',msg)}
check(s.library.length===3,'三首内置歌曲已载入');
check(s.library.every(p=>p.originKind==='builtin'),'内置歌曲身份标记');
T.renameSong('canon-christmas');check(elements.get('renameDialog').open,'重命名显示站内弹窗');elements.get('renameInput').value='卡农圣诞夜（已更名）';T.renameConfirmed();check(s.library[0].title==='卡农圣诞夜（已更名）','重命名实际持久化至项目');
T.duplicateSong('canon-christmas');let copy=s.library[0];check(copy.id!=='canon-christmas'&&copy.originKind==='user','副本改为可删除的普通歌曲');
T.deleteSong(copy.id);check(elements.get('deleteDialog').open,'删除显示站内确认');T.deleteConfirmed();check(!s.library.some(p=>p.id===copy.id),'副本成功删除');
T.deleteSong('canon-christmas');check(!elements.get('deleteDialog').open,'内置歌曲防删除');
T.openSong('canon-christmas');check(!s.editMode,'初始进入只读');const n=s.project.score.events.length;
T.eventInsert();check(s.project.score.events.length===n,'只读模式禁止插入事件');
T.openEditor();check(s.editMode&&s.project!==s.library.find(p=>p.id===s.project.id),'编辑使用隔离副本');
T.eventInsert();check(s.project.score.events.length===n+1&&s.editDirty,'编辑插入后显示脏标记');check(s.library.find(p=>p.id==='canon-christmas').score.events.length===n,'保存前不覆盖内置原谱');
T.requestFinishEdit('exit');check(elements.get('saveChoiceDialog').open,'修改后弹出保存选择');
T.completeEdit('new');check(!s.editMode&&s.project.originKind==='user'&&s.project.id!=='canon-christmas','另存为新普通曲谱');check(s.library.find(p=>p.id==='canon-christmas').score.events.length===n,'另存为不改变原谱');
let newSong=s.project;T.openEditor();T.eventInsert();let len=s.project.score.events.length;T.undo();check(s.project.score.events.length===len-1,'撤销插入事件');T.redo();check(s.project.score.events.length===len,'重做事件');T.requestFinishEdit('exit');T.completeEdit('direct');check(s.library.find(p=>p.id===newSong.id).score.events.length===len,'直接保存覆盖相同项目');
let scales={C:60,F:65,G:67,B:71,Db:61,Eb:63};for(let [key,root]of Object.entries(scales))check(T.noteMidi(1,key)===root&&T.noteMidi(8,key)===root+12&&T.noteMidi(15,key)===root+24,key+' 大调一二八度映射正确');
check(T.normalize({score:{events:[]},playback:{tuning:'sky'}}).playback.tuning==='C','旧光遇原调迁移 C 大调');
let p=s.project;T.openEditor();T.eventInsert();T.requestFinishEdit('home');T.completeEdit('discard');check(s.mode==='home'&&!s.editMode,'放弃修改后返回首页');
check(storage.get('sky-studio-projects-v03')?.includes('卡农圣诞夜（已更名）'),'重命名已写入本地缓存');
console.log('V04 INTERACTION TESTS ALL PASS');process.exit(0);
