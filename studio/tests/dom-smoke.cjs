const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=path.resolve(__dirname,'..');let src=fs.readFileSync(ROOT+'/app/js/studio.js','utf8');
let elems=new Map(),errors=[];
const nop=()=>{};
const canvasCtx=new Proxy({measureText:(s)=>({width:s.length*10}),createLinearGradient:()=>({addColorStop:nop}),createRadialGradient:()=>({addColorStop:nop})},{get(o,k){return (k in o)?o[k]:nop},set(o,k,v){o[k]=v;return true}});
function fakeEl(tag='div',id=''){
 let x={tagName:tag,id,children:[],parentNode:null,dataset:{},style:{setProperty:nop},hidden:false,disabled:false,open:false,complete:true,naturalWidth:960,naturalHeight:520,width:1000,height:500,value:'',innerHTML:'',textContent:'',checked:false};
 x.classList={add:nop,remove:nop,toggle:nop,contains:()=>false};x.addEventListener=nop;x.removeEventListener=nop;x.setAttribute=nop;x.getBoundingClientRect=()=>({width:700,height:300,left:0,top:0,right:700,bottom:300});x.querySelector=()=>fakeEl();x.querySelectorAll=()=>[];x.append=(...kids)=>{x.children.push(...kids);for(let k of kids)if(k)k.parentNode=x};x.prepend=x.append;x.remove=nop;x.replaceChildren=(...kids)=>{x.children=kids};x.showModal=()=>x.open=true;x.close=()=>x.open=false;x.getContext=()=>canvasCtx;x.getAttribute=()=>'';x.click=nop;x.setPointerCapture=nop;return x
}
const doc={getElementById(id){if(!elems.has(id))elems.set(id,fakeEl('div',id));return elems.get(id)},createElement(tag){return fakeEl(tag)},createDocumentFragment(){return fakeEl('fragment')},querySelectorAll(sel){return[]},querySelector:()=>fakeEl(),addEventListener:nop,body:fakeEl('body')};
const orig=JSON.parse(fs.readFileSync(ROOT+'/samples/canon.json','utf8'));
let local=new Map();let win={SKY_BUILTINS:[orig],SKY_SAMPLES:{},SKY_EMBED_SCENES:{},addEventListener:nop,location:{hash:'',pathname:'/'}};
const globals={window:win,document:doc,history:{replaceState:nop},location:win.location,localStorage:{getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,v)},Image:class{constructor(){this.width=960;this.height=520;this.complete=true;this.naturalWidth=960} set src(v){this._src=v}get src(){return this._src}},devicePixelRatio:1,requestAnimationFrame:nop,cancelAnimationFrame:nop,performance,setTimeout,clearTimeout,setInterval,clearInterval,confirm:()=>true,prompt:()=>null,TextEncoder,TextDecoder,Uint8Array,DataView,ArrayBuffer,Blob,Response,DecompressionStream,URL,console,atob,btoa,Math,Date};globals.globalThis=globals;
let ctx=vm.createContext(globals);try{vm.runInContext(src,ctx,{timeout:30000});console.log('PASS initial DOM initialization')}catch(e){console.error('FAIL initialize',e);process.exit(1)}
try{let T=ctx.window.__SKY_STUDIO_TEST__;T.openSong('canon-christmas');console.log('PASS launch legacy song',T.state.project?.title);T.eventInsert();console.log('PASS insert event',T.state.project.score.events.length);T.undo();T.redo();console.log('PASS undo redo');}catch(e){console.error('FAIL interactive smoke',e);process.exit(1)}
