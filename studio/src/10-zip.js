// Zero-dependency ZIP store/reader for .skymusic v1. Export is STORE, import also handles DEFLATE on modern Chromium.
const ENCODER=new TextEncoder(),DECODER=new TextDecoder();
const asBytes=x=>typeof x==='string'?ENCODER.encode(x):x instanceof Uint8Array?x:new Uint8Array(x);
let CRC_TABLE=null;
function crc32(buf){if(!CRC_TABLE){CRC_TABLE=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?(0xedb88320^(c>>>1)):(c>>>1);CRC_TABLE[n]=c>>>0}}let c=0xffffffff;for(let v of buf)c=CRC_TABLE[(c^v)&255]^(c>>>8);return (c^0xffffffff)>>>0}
function makeZip(items){const locals=[],centrals=[];let offset=0;for(const [name,value] of Object.entries(items)){
 const nameBytes=ENCODER.encode(name),data=asBytes(value),crc=crc32(data);
 const local=new Uint8Array(30+nameBytes.length+data.length),lv=new DataView(local.buffer);
 lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0x0800,true);lv.setUint16(8,0,true);lv.setUint32(14,crc,true);lv.setUint32(18,data.length,true);lv.setUint32(22,data.length,true);lv.setUint16(26,nameBytes.length,true);local.set(nameBytes,30);local.set(data,30+nameBytes.length);locals.push(local);
 const central=new Uint8Array(46+nameBytes.length),cv=new DataView(central.buffer);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x0800,true);cv.setUint16(10,0,true);cv.setUint32(16,crc,true);cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);cv.setUint16(28,nameBytes.length,true);cv.setUint32(42,offset,true);central.set(nameBytes,46);centrals.push(central);offset+=local.length}
 const centralSize=centrals.reduce((s,a)=>s+a.length,0);const output=new Uint8Array(offset+centralSize+22);let p=0;for(const entry of [...locals,...centrals]){output.set(entry,p);p+=entry.length}let ev=new DataView(output.buffer,p,22);ev.setUint32(0,0x06054b50,true);ev.setUint16(8,centrals.length,true);ev.setUint16(10,centrals.length,true);ev.setUint32(12,centralSize,true);ev.setUint32(16,offset,true);return output
}
async function readZip(arrayBuffer){const bytes=asBytes(arrayBuffer),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let eo=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65558);i--){if(view.getUint32(i,true)===0x06054b50){eo=i;break}}
 if(eo<0)throw Error('不是有效的 ZIP / .skymusic 文件');let count=view.getUint16(eo+10,true),p=view.getUint32(eo+16,true);if(count>100)throw Error('项目条目过多');let result={},totalSize=0;
 for(let i=0;i<count;i++){if(p+46>bytes.length||view.getUint32(p,true)!==0x02014b50)throw Error('ZIP 中央目录错误');let flags=view.getUint16(p+8,true),method=view.getUint16(p+10,true),packed=view.getUint32(p+20,true),size=view.getUint32(p+24,true),nameLen=view.getUint16(p+28,true),extra=view.getUint16(p+30,true),comment=view.getUint16(p+32,true),local=view.getUint32(p+42,true);let name=DECODER.decode(bytes.slice(p+46,p+46+nameLen));p+=46+nameLen+extra+comment;
  if(name.includes('..')||name.startsWith('/')||name.includes('\\'))throw Error('项目包含非法资源路径');if(flags&1)throw Error('加密项目暂不支持');totalSize+=size;if(totalSize>48*1024*1024)throw Error('项目总大小超过48MB');if(size>25*1024*1024)throw Error('项目单个文件超过25MB');
  if(view.getUint32(local,true)!==0x04034b50)throw Error('ZIP 文件头错误');let start=local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true);if(start+packed>bytes.length)throw Error('ZIP 数据损坏');let compressed=bytes.slice(start,start+packed);
  let data;if(method===0)data=compressed;else if(method===8){if(typeof DecompressionStream==='undefined')throw Error('浏览器不支持 ZIP 压缩读取，请使用 Chrome / Edge');let stream=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));data=new Uint8Array(await new Response(stream).arrayBuffer())}else throw Error('暂不支持 ZIP 压缩方式 '+method);
  if(size!==data.length)throw Error('资源大小校验失败: '+name);if(crc32(data)!==view.getUint32(p-(46+nameLen+extra+comment)+16,true))throw Error('资源校验失败: '+name);result[name]=data;
 }return result
}
function bytesToBase64(bytes){let parts=[];for(let i=0;i<bytes.length;i+=8192)parts.push(String.fromCharCode(...bytes.subarray(i,i+8192)));return btoa(parts.join(''))}
function base64ToBytes(base64){let txt=atob(base64),out=new Uint8Array(txt.length);for(let i=0;i<txt.length;i++)out[i]=txt.charCodeAt(i);return out}
async function exportProject(p){let score={mode:p.score.mode,gridIntervalMs:p.score.gridIntervalMs,tuning:p.playback.tuning,events:scoreEvents(p)};
 let man={format:'skymusic-project',schemaVersion:1,id:p.id,title:p.title,subtitle:p.subtitle,author:p.author||'',favorite:!!p.favorite,createdAt:p.createdAt||0,lastOpened:p.lastOpened||0,description:p.description,durationMs:p.durationMs,keyCount:15,author:p.author||'',provenance:p.provenance,assets:[]};
 let scene={...p.theme},files={};
 if(p._imageBytes){files['assets/stage.webp']=p._imageBytes;man.assets.push('assets/stage.webp');scene.image='assets/stage.webp'}
 else if(p._imageUrl&&p._imageUrl.startsWith('data:image/')){let parts=p._imageUrl.split(',');files['assets/stage.webp']=base64ToBytes(parts[1]);man.assets.push('assets/stage.webp');scene.image='assets/stage.webp'}
 else if(p._imageUrl?.startsWith('data:image/')&&p._imageUrl.includes(';base64,')){files['assets/stage.webp']=base64ToBytes(p._imageUrl.split(';base64,')[1]);man.assets.push('assets/stage.webp');scene.image='assets/stage.webp'}
 else if(sceneId(p)==='christmas'&&SCENE_EMBEDS.christmas){files['assets/stage.webp']=base64ToBytes(SCENE_EMBEDS.christmas);man.assets.push('assets/stage.webp');scene.image='assets/stage.webp'}
 for(let [path,data] of Object.entries({'manifest.json':man,'score.json':score,'scene.json':scene,'playback.json':p.playback})){files[path]=JSON.stringify(data,null,2)}
 let zip=makeZip(files);downloadBytes(p.title.replace(/[\\/:*?"<>|]/g,'_')+'.skymusic',zip,'application/zip');toast('已导出 .skymusic：乐谱、调性及主题配置')
}
async function unpackProject(bytes){let files=await readZip(bytes);for(let name of ['manifest.json','score.json','scene.json','playback.json'])if(!files[name])throw Error('项目缺少 '+name);
 const read=name=>JSON.parse(DECODER.decode(files[name]));const man=read('manifest.json');if(man.schemaVersion!==1||man.format!=='skymusic-project')throw Error('不支持的项目格式版本');
 const p=normalize({...man,score:read('score.json'),theme:read('scene.json'),playback:read('playback.json')});
 const scene=read('scene.json');if(scene.image&&files[scene.image]&&files[scene.image].length<4*1024*1024){p._imageBytes=files[scene.image];p._imageUrl='data:image/webp;base64,'+bytesToBase64(p._imageBytes)}
 return p
}

// Standalone shareable theme package. No scripts and no remote references.
async function exportTheme(p){try{downloadBytes(escName(p.title)+'.skytheme',await themeResourceBytes(p),'application/zip');toast('已导出 .skytheme 主题及资源')}catch(error){toast('主题导出失败：'+error.message,6000)}}
async function unpackTheme(bytes){let files=await readZip(bytes);if(!files['manifest.json']||!files['scene.json'])throw Error('主题包缺少配置文件');let man=JSON.parse(DECODER.decode(files['manifest.json']));if(man.format!=='skytheme'||man.schemaVersion!==1)throw Error('主题包版本不支持');let t=JSON.parse(DECODER.decode(files['scene.json']));let data=null;if(t.image&&files[t.image]&&files[t.image].length<4*1024*1024)data=files[t.image];return {theme:t,imageBytes:data}}
