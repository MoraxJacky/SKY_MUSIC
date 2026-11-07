// Homepage presentation is separate from the player, score and theme controllers.
const homeExperience={cards:new Set(),views:new Set(),flipped:new Set(),flips:new Map(),raf:0,last:0,carousel:null,flow:null,preview:null,entry:null};
const homeReducedMotion=()=>Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);

function clearHomeCardPhysics(){
 hideHomeControlTooltip();
 cancelAnimationFrame(homeExperience.raf);homeExperience.raf=0;
 for(const [el,animation]of homeExperience.flips){animation.cancel();el.classList.remove('is-turning')}homeExperience.flips.clear();
 for(const card of homeExperience.views){card.x=card.y=card.vx=card.vy=card.tx=card.ty=card.glow=card.flash=0;paintHomeCard(card)}
 homeExperience.cards.clear();homeExperience.views.clear();
}
function paintHomeCard(card){
 card.el.style.setProperty('--tilt-x',card.x.toFixed(3)+'deg');card.el.style.setProperty('--tilt-y',card.y.toFixed(3)+'deg');
 card.el.style.setProperty('--shine-x',card.lightX.toFixed(2)+'%');card.el.style.setProperty('--shine-y',card.lightY.toFixed(2)+'%');
 card.el.style.setProperty('--shine-opacity',Math.min(.6,card.glow*.32+card.flash*.18).toFixed(3));
 const depth=APP_CONFIG.home.cardPhysics.parallaxPx;
 card.el.style.setProperty('--art-x',(-card.y/6*depth).toFixed(2)+'px');card.el.style.setProperty('--art-y',(card.x/6*depth).toFixed(2)+'px');
 card.el.style.setProperty('--foil-angle',(118+card.y*4-card.x*2).toFixed(2)+'deg');card.el.style.setProperty('--foil-position',(40+card.y*5).toFixed(2)+'%');
 card.el.style.setProperty('--card-lift',(-card.glow*4).toFixed(2)+'px');card.el.style.setProperty('--card-scale',(1+card.glow*.012).toFixed(4));
 card.el.dataset.tiltX=card.x.toFixed(3);card.el.dataset.tiltY=card.y.toFixed(3);
}
function tickHomeCards(now){
 const physics=APP_CONFIG.home.cardPhysics,dt=Math.min(physics.maxFrameSeconds,Math.max(.001,(now-homeExperience.last)/1000));homeExperience.last=now;
 for(const card of homeExperience.cards){
  if(!card.el.isConnected){homeExperience.cards.delete(card);continue}
  for(const [angle,velocity,target]of [['x','vx','tx'],['y','vy','ty']]){
   const force=physics.stiffness*(card[target]-card[angle])-physics.damping*card[velocity];
   card[velocity]=clamp(card[velocity]+force/physics.mass*dt,-physics.maxVelocityDegPerSec,physics.maxVelocityDegPerSec);
   card[angle]=clamp(card[angle]+card[velocity]*dt,-physics.maxTiltDeg*1.1,physics.maxTiltDeg*1.1);
  }
  const ease=1-Math.exp(-dt*12);card.lightX+=(card.targetLightX-card.lightX)*ease;card.lightY+=(card.targetLightY-card.lightY)*ease;
  card.glow+=((card.hover?1:0)-card.glow)*ease;card.flash*=Math.exp(-dt*5);paintHomeCard(card);
  const resting=Math.abs(card.tx-card.x)<physics.restAngleDeg&&Math.abs(card.ty-card.y)<physics.restAngleDeg&&Math.abs(card.vx)<physics.restVelocityDegPerSec&&Math.abs(card.vy)<physics.restVelocityDegPerSec&&card.flash<.004&&Math.abs(card.glow-(card.hover?1:0))<.004;
  if(resting){card.x=card.tx;card.y=card.ty;card.vx=card.vy=0;card.glow=card.hover?1:0;card.flash=0;paintHomeCard(card);homeExperience.cards.delete(card)}
 }
 homeExperience.raf=homeExperience.cards.size?requestAnimationFrame(tickHomeCards):0;
}
function wakeHomeCard(card){
 homeExperience.cards.add(card);homeExperience.views.add(card);
 if(!homeExperience.raf){homeExperience.last=performance.now();homeExperience.raf=requestAnimationFrame(tickHomeCards)}
}
function setHomeCardFlip(el,song,flipped,animate=false){
 const face=el.querySelector('.cone-flip'),current=getComputedStyle(face).transform,old=homeExperience.flips.get(el);old?.cancel();homeExperience.flips.delete(el);el.classList.remove('is-turning');
 el.classList.toggle('is-flipped',flipped);el.dataset.face=flipped?'back':'front';
 const trigger=el.querySelector('.cone-flip-trigger');trigger.setAttribute('aria-pressed',String(flipped));trigger.setAttribute('aria-label',(flipped?'返回封面：':'查看歌曲信息：')+song.title);
 el.querySelector('.cone-front').setAttribute('aria-hidden',String(flipped));el.querySelector('.cone-back').setAttribute('aria-hidden',String(!flipped));
 if(flipped)homeExperience.flipped.add(song.id);else homeExperience.flipped.delete(song.id);
 if(animate&&!homeReducedMotion()&&face.animate){
  const end=flipped?180:0,sign=flipped?1:-1,matrix=current&&current!=='none'?new DOMMatrixReadOnly(current):null;
  let start=matrix?Math.atan2(-matrix.m13,matrix.m11)*180/Math.PI:0;if(start<0)start+=360;
  el.classList.add('is-turning');
  const animation=face.animate([{transform:current==='none'?'rotateY(0deg)':current,easing:'cubic-bezier(.42,0,.58,1)'},{offset:.46,transform:'translateZ(10px) rotateY('+((start+end)/2)+'deg) rotateZ('+(-sign*.35)+'deg)',easing:'cubic-bezier(.18,.55,.3,1)'},{offset:.88,transform:'translateZ(2px) rotateY('+(end+sign*2)+'deg)',easing:'ease-out'},{transform:'rotateY('+end+'deg)'}],{duration:Math.max(140,APP_CONFIG.home.cardPhysics.flipMs*Math.min(1,Math.abs(end-start)/180)),easing:'linear'});
  homeExperience.flips.set(el,animation);animation.onfinish=()=>{if(homeExperience.flips.get(el)===animation){homeExperience.flips.delete(el);el.classList.remove('is-turning')}};
 }
}
function attachHomeCard(el,song){
 if(!document.createComment)return;
 const card={el,x:0,y:0,vx:0,vy:0,tx:0,ty:0,glow:0,flash:0,hover:false,lightX:50,lightY:50,targetLightX:50,targetLightY:50};
 homeExperience.views.add(card);setHomeCardFlip(el,song,homeExperience.flipped.has(song.id));
 for(const button of el.querySelectorAll('[data-home-tooltip]')){button.addEventListener('pointerenter',event=>{if(event.pointerType!=='touch')showHomeControlTooltip(button)});button.addEventListener('pointerleave',hideHomeControlTooltip);button.addEventListener('focus',()=>showHomeControlTooltip(button));button.addEventListener('blur',hideHomeControlTooltip);button.addEventListener('click',hideHomeControlTooltip)}
 el.querySelector('.cone-flip-trigger').onclick=()=>setHomeCardFlip(el,song,el.dataset.face!=='back',true);
 const point=event=>{const rect=el.getBoundingClientRect(),x=clamp((event.clientX-rect.left)/rect.width,0,1),y=clamp((event.clientY-rect.top)/rect.height,0,1),limit=APP_CONFIG.home.cardPhysics.maxTiltDeg;card.tx=(.5-y)*2*limit;card.ty=(x-.5)*2*limit;card.targetLightX=x*100;card.targetLightY=y*100;wakeHomeCard(card)};
 el.addEventListener('pointerenter',event=>{if(event.pointerType==='touch'||homeReducedMotion())return;card.hover=true;card.flash=1;point(event)});
 el.addEventListener('pointermove',event=>{if(event.pointerType==='touch'||homeReducedMotion())return;point(event)});
 const leave=()=>{card.hover=false;card.tx=card.ty=0;card.targetLightX=card.targetLightY=50;if(!homeReducedMotion())wakeHomeCard(card)};
 el.addEventListener('pointerleave',leave);el.addEventListener('pointercancel',leave);
}

// One platform tooltip lives in the top layer, outside clipped and tilted cards.
let homeControlTooltip=null,homeTooltipAnchor=null;
function hideHomeControlTooltip(){if(!homeControlTooltip)return;homeTooltipAnchor?.removeAttribute('aria-describedby');homeTooltipAnchor=null;if(homeControlTooltip.matches(':popover-open'))homeControlTooltip.hidePopover()}
function showHomeControlTooltip(button){
 if(!homeControlTooltip){homeControlTooltip=document.createElement('div');homeControlTooltip.id='homeControlTooltip';homeControlTooltip.className='home-control-tooltip';homeControlTooltip.setAttribute('role','tooltip');homeControlTooltip.setAttribute('popover','manual');document.body.append(homeControlTooltip);$('homeView').addEventListener('scroll',hideHomeControlTooltip,{passive:true});window.addEventListener('resize',hideHomeControlTooltip);document.addEventListener('pointerdown',hideHomeControlTooltip);document.addEventListener('keydown',e=>{if(e.key==='Escape')hideHomeControlTooltip()})}
 hideHomeControlTooltip();homeTooltipAnchor=button;homeControlTooltip.textContent=button.dataset.homeTooltip;button.setAttribute('aria-describedby',homeControlTooltip.id);homeControlTooltip.showPopover();
 const r=button.getBoundingClientRect(),t=homeControlTooltip.getBoundingClientRect();homeControlTooltip.style.left=clamp(r.left+r.width/2-t.width/2,8,innerWidth-t.width-8)+'px';homeControlTooltip.style.top=(r.top>=t.height+16?r.top-t.height-8:r.bottom+8)+'px';
}

function stopHomeCarousel(){const c=homeExperience.carousel;if(c){clearTimeout(c.timer);c.timer=0}}
function scheduleHomeCarousel(){
 stopHomeCarousel();const c=homeExperience.carousel;
 if(!c||c.busy||c.hover||c.focus||$('homeThemeDialog')?.open||$('themeRepositoryDialog')?.open||document.hidden||state.mode!=='home'||$('homeView').hidden||homeReducedMotion())return;
 c.timer=setTimeout(()=>{c.timer=0;if(!document.hidden&&state.mode==='home'&&!c.hover&&!c.focus)moveHomeTheme(1,false)},APP_CONFIG.home.carousel.intervalMs);
}
function paintHomeCarousel(animate=true){
 const c=homeExperience.carousel;if(!c)return;
 c.track.style.transitionDuration=animate&&!homeReducedMotion()?APP_CONFIG.home.carousel.transitionMs+'ms':'0ms';
 c.track.style.transform='translate3d('+(-100*c.physical)+'%,0,0)';
 c.artTrack.style.transitionDuration=c.track.style.transitionDuration;c.artTrack.style.transform=c.track.style.transform;
 c.track.dataset.index=String(c.index);c.track.dataset.physical=String(c.physical);
 for(const [index,slide]of c.slides.entries()){const active=index===c.index;slide.setAttribute('aria-hidden',String(!active));slide.inert=!active}
 for(const [index,dot]of c.dots.entries()){dot.setAttribute('aria-current',String(index===c.index));dot.classList.toggle('is-active',index===c.index)}
}
function finishHomeThemeMove(){
 const c=homeExperience.carousel;if(!c||!c.busy)return;
 clearTimeout(c.settleTimer);c.busy=false;
 if(c.physical===0||c.physical===c.count+1){c.physical=c.index+1;paintHomeCarousel(false);void c.track.offsetWidth}
 if(c.pending!==null){const next=c.pending;c.pending=null;if(next.index!==c.index){requestAnimationFrame(()=>goHomeTheme(next.index,next.manual,next.direction));return}}
 scheduleHomeCarousel();
}
function goHomeTheme(index,manual=true,direction=0){
 const c=homeExperience.carousel;if(!c)return;index=(index+c.count)%c.count;stopHomeCarousel();
 if(c.busy){c.pending={index,manual,direction};return}
 if(index===c.index){scheduleHomeCarousel();return}
 const old=c.index;c.index=index;
 c.physical=direction===1&&old===c.count-1&&index===0?c.count+1:direction===-1&&old===0&&index===c.count-1?0:index+1;
 c.busy=!homeReducedMotion();paintHomeCarousel(c.busy);
 if(manual)$('homeThemeAnnouncement').textContent=c.definitions[index].displayName+'，第 '+(index+1)+' / '+c.count+' 个主题';
 if(c.busy)c.settleTimer=setTimeout(finishHomeThemeMove,APP_CONFIG.home.carousel.transitionMs+80);else scheduleHomeCarousel();
}
function moveHomeTheme(direction,manual=true){const c=homeExperience.carousel;if(c)goHomeTheme(c.index+direction,manual,direction)}
function resetHomePresentation(){
 clearHomeCardPhysics();homeExperience.flipped.clear();const c=homeExperience.carousel;if(!c)return;stopHomeCarousel();clearTimeout(c.settleTimer);c.index=0;c.physical=1;c.busy=false;c.pending=null;c.hover=false;c.focus=false;paintHomeCarousel(false);scheduleHomeCarousel();
}
function pauseHomePresentation(){stopHomeCarousel();clearHomeCardPhysics();stopHomeFlow()}
function resumeHomePresentation(){scheduleHomeCarousel();startHomeFlow()}
function bindHomeExperience(){
 bindHomeScrollChrome();bindLibraryFilterPicker();
 if(!document.createComment)return;
 const track=$('homeThemeTrack'),artTrack=$('homeThemeArtTrack'),dotHost=$('homeThemeDots');
 const definitions=Object.values(APP_CONFIG.platform.themes).map(pack=>pack.definition);
 const c=homeExperience.carousel={track,artTrack,definitions,count:definitions.length,index:0,physical:1,busy:false,pending:null,timer:0,settleTimer:0,hover:false,focus:false,slides:[],dots:[]};
 for(const [index,definition]of definitions.entries()){
  const slide=document.createElement('article');slide.className='home-theme-slide';slide.dataset.theme=definition.id;slide.setAttribute('role','group');slide.setAttribute('aria-roledescription','幻灯片');slide.setAttribute('aria-label',(index+1)+' / '+c.count+' '+definition.displayName);
  slide.style.setProperty('--preview-start',definition.appearance.stageStart);slide.style.setProperty('--preview-accent',definition.appearance.accent);
  slide.innerHTML='<div class="home-theme-art"><img class="preview-landscape" alt=""><img class="preview-companion" alt=""></div><div class="home-theme-copy"><span class="eyebrow">THEME COLLECTION</span><h1></h1><p></p></div><div class="home-carousel-action"><button class="btn-primary theme-preview-open" type="button">设置主题</button></div>';
  slide.querySelector('.theme-preview-open').dataset.previewTheme=definition.id;
  slide.querySelector('h1').textContent=definition.displayName;slide.querySelector('p').textContent=definition.description||definition.name;
  const project={theme:{id:definition.id}},decor=definition.decorations,scene=decor.scene,path=decor.cover||(scene.type==='image'?scene.image:scene.type==='frames'?scene.framePattern.replace('{index}','00'):null),image=slide.querySelector('.preview-landscape');
  image.hidden=!path;if(path)image.src=themeAsset(path,project);
  const companion=slide.querySelector('.preview-companion');companion.hidden=!decor.companion;if(decor.companion)companion.src=themeAsset(decor.companion,project);
  const artSlide=document.createElement('div');artSlide.className='home-theme-art-slide';artSlide.dataset.theme=definition.id;artSlide.append(slide.querySelector('.home-theme-art'));artTrack.append(artSlide);
  track.append(slide);c.slides.push(slide);
  const dot=document.createElement('button');dot.type='button';dot.setAttribute('aria-label','展示'+definition.displayName);dot.onclick=()=>goHomeTheme(index,true);dotHost.append(dot);c.dots.push(dot);
 }
 for(const [slide,where]of [[c.slides[c.count-1],'before'],[c.slides[0],'after']]){const clone=slide.cloneNode(true);clone.dataset.clone='true';clone.setAttribute('aria-hidden','true');clone.inert=true;if(where==='before')track.prepend(clone);else track.append(clone)}
 const artSlides=[...artTrack.children];artTrack.prepend(artSlides[artSlides.length-1].cloneNode(true));artTrack.append(artSlides[0].cloneNode(true));
 track.addEventListener('transitionend',event=>{if(event.target===track&&event.propertyName==='transform')finishHomeThemeMove()});
 track.addEventListener('click',event=>{const button=event.target.closest('[data-preview-theme]');if(button&&!button.closest('[data-clone]'))openHomeThemePreview(button.dataset.previewTheme)});
 $('homeThemePrev').onclick=()=>moveHomeTheme(-1);$('homeThemeNext').onclick=()=>moveHomeTheme(1);
 const hero=document.querySelector('.theme-carousel');
 hero.addEventListener('pointerenter',()=>{if(APP_CONFIG.home.carousel.pauseOnHover){c.hover=true;stopHomeCarousel()}});hero.addEventListener('pointerleave',()=>{c.hover=false;scheduleHomeCarousel()});
 for(const host of [hero]){
  host.addEventListener('focusin',()=>{c.focus=true;stopHomeCarousel()});
  host.addEventListener('focusout',event=>{if(!hero.contains(event.relatedTarget)&&!dotHost.contains(event.relatedTarget)){c.focus=false;scheduleHomeCarousel()}});
  host.addEventListener('keydown',event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();moveHomeTheme(event.key==='ArrowRight'?1:-1)}});
 }
 document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseHomePresentation();else resumeHomePresentation()});
 window.addEventListener('pagehide',cancelSongEntry);window.addEventListener('resize',()=>{if(homeExperience.entry)cancelSongEntry()});
 window.matchMedia?.('(prefers-reduced-motion: reduce)')?.addEventListener?.('change',()=>{cancelSongEntry();clearHomeCardPhysics();if(homeReducedMotion()){stopHomeCarousel();finishHomeThemeMove();stopHomeFlow()}else resumeHomePresentation()});
 bindHomeThemePreview();paintHomeCarousel(false);resumeHomePresentation();
}

// A low-resolution, domain-warped noise field creates local eddies instead of sweeping bands.
function homeNoise(x,y){
 const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy);
 const hash=(a,b)=>{let n=Math.imul(a,374761393)^Math.imul(b,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295};
 const a=hash(ix,iy),b=hash(ix+1,iy),c=hash(ix,iy+1),d=hash(ix+1,iy+1);return (a+(b-a)*u)*(1-v)+(c+(d-c)*u)*v;
}
function homeFbm(x,y){return homeNoise(x,y)*.64+homeNoise(x*2.07+17,y*2.07-11)*.25+homeNoise(x*4.13-8,y*4.13+23)*.11}
function renderHomeFlow(now){
 const f=homeExperience.flow;if(!f)return;
 if(now-f.last>=1000/APP_CONFIG.home.atmosphere.fps){
  const cfg=APP_CONFIG.home.atmosphere,aspect=innerWidth/innerHeight,w=Math.max(80,Math.round(cfg.maxWidth*Math.min(1,aspect))),h=Math.max(60,Math.round(cfg.maxWidth*Math.min(1,1/aspect)));
  if(f.canvas.width!==w||f.canvas.height!==h){f.canvas.width=w;f.canvas.height=h;f.image=f.ctx.createImageData(w,h)}
  f.time+=Math.min((now-f.last)/1000,.15)*cfg.speed;f.last=now;const data=f.image.data,t=f.time,ratio=w/h;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const px=x/w*3.2*ratio,py=y/h*3.2,a=homeNoise(px*.65+t*.4,py*.65-t*.18),b=homeNoise(px*.7-t*.23+31,py*.7+t*.32+13);
   const field=homeFbm(px+a*1.7+t*.17,py+b*1.7-t*.11),filament=Math.pow(Math.max(0,1-Math.abs(field-.54)*7),3),cloud=Math.max(0,field-.35);
   const i=(y*w+x)*4;data[i]=172+Math.round(a*35);data[i+1]=218+Math.round(b*20);data[i+2]=232;data[i+3]=Math.round((filament*82+cloud*76)*cfg.opacity);
  }
  f.ctx.putImageData(f.image,0,0);f.canvas.dataset.frames=String(++f.frames);
 }
 f.raf=requestAnimationFrame(renderHomeFlow);
}
function stopHomeFlow(){const f=homeExperience.flow;if(f){cancelAnimationFrame(f.raf);f.raf=0}}
function startHomeFlow(){
 if(!document.createComment||document.hidden||state.mode!=='home'||homeReducedMotion())return;
 let f=homeExperience.flow;if(!f){const canvas=$('homeFlowCanvas');if(!canvas)return;f=homeExperience.flow={canvas,ctx:canvas.getContext('2d'),time:8.3,last:0,frames:0,raf:0,image:null}}
 if(!f.raf){f.last=performance.now()-100;f.raf=requestAnimationFrame(renderHomeFlow)}
}

function openHomeThemePreview(id){
 const definition=THEME_DEFINITIONS[id];if(!definition)return;
 stopHomeCarousel();homeExperience.preview={id,project:{title:definition.displayName,theme:{id,...copy(definition.defaults),...copy(definition.initialOverrides)},card:{}}};
 resetHomeThemePreview();$('homeThemeDialog').showModal();syncStatusNotificationAppearance();
}
function resetHomeThemePreview(){
 const preview=homeExperience.preview;if(!preview)return;const d=THEME_DEFINITIONS[preview.id];preview.project.theme={id:d.id,...copy(d.defaults),...copy(d.initialOverrides)};
 $('homePreviewName').value=preview.project.theme.name||d.name;$('homePreviewAccent').value=preview.project.theme.accent||d.appearance.accent;$('homePreviewBackground').value=preview.project.theme.backgroundColor||d.appearance.stageEnd;$('homePreviewGlow').value=preview.project.theme.glow??50;$('homePreviewMotion').value=preview.project.theme.motion==='off'?'off':'ambient';paintHomeThemePreview();
}
function paintHomeThemePreview(){
 const preview=homeExperience.preview;if(!preview)return;const d=THEME_DEFINITIONS[preview.id],p=preview.project,t=p.theme;
 t.name=$('homePreviewName').value.slice(0,60);t.accent=$('homePreviewAccent').value;t.backgroundColor=$('homePreviewBackground').value;t.glow=Number($('homePreviewGlow').value);t.motion=$('homePreviewMotion').value;
 const host=$('homeThemeSample'),colors={...d.appearance,accent:t.accent,stageEnd:t.backgroundColor};
 for(const [key,value]of Object.entries(colors))host.style.setProperty('--sample-'+key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),value);
 host.style.setProperty('--sample-glow',String(t.glow/100));host.dataset.motion=t.motion;host.dataset.theme=d.id;$('homePreviewGlowValue').textContent=t.glow+'%';$('homeThemeSampleName').textContent=t.name;
 const decor=d.decorations,path=decor.cover||decor.scene.image||(decor.scene.type==='frames'?decor.scene.framePattern.replace('{index}','00'):null),image=$('homeThemeSampleImage');image.hidden=!path;if(path)image.src=themeAsset(path,p);
 for(const [id,path]of [['homeThemeSampleCompanion',decor.companion],['homeThemeSampleCharm',decor.ornaments?.[0]]]){const img=$(id);img.hidden=!path;if(path)img.src=themeAsset(path,p)}
 $('homeThemeSampleRoll').style.backgroundImage='linear-gradient(90deg,transparent calc(25% - 1px),#ffffff14 25%,transparent calc(25% + 1px)),linear-gradient(180deg,'+Array.from({length:15},(_,i)=>{const color=d.rollPalette[['light','medium','dark','medium','light'][i%5]];return color+' '+(i/15*100)+'%,'+color+' '+((i+1)/15*100)+'%'}).join(',')+')';
 syncStatusNotificationAppearance();
}
function bindHomeThemePreview(){
 const roll=$('homeThemeSampleRoll');for(const [left,top,width]of [[9,13,14],[24,40,10],[41,27,18],[63,60,12],[78,80,14]]){const note=document.createElement('i');note.style.cssText='left:'+left+'%;top:'+top+'%;width:'+width+'%';roll.append(note)}
 for(let i=0;i<15;i++){const key=document.createElement('span');key.textContent=String(i%5+1);if([2,6,10].includes(i))key.className='sample-active';$('homeThemeSampleKeys').append(key)}
 for(const id of ['homePreviewName','homePreviewAccent','homePreviewBackground','homePreviewGlow','homePreviewMotion'])$(id).addEventListener('input',paintHomeThemePreview);
 $('homePreviewReset').onclick=resetHomeThemePreview;$('homePreviewExport').onclick=()=>{if(homeExperience.preview)exportTheme(homeExperience.preview.project)};
 $('homeThemeDialog').addEventListener('close',()=>{homeExperience.preview=null;syncStatusNotificationAppearance();scheduleHomeCarousel()});
}

// Card entry is presentation only; the shared platform controller still mounts every song.
function cancelSongEntry(completed=false){
 if(completed!==true)cancelScoreEntrance();
 const entry=homeExperience.entry;if(!entry)return;homeExperience.entry=null;
 for(const animation of entry.animations)animation.cancel();
 $('songEntryTransition').hidden=true;$('songEntryTransition').dataset.phase='idle';
 document.querySelector('.site-wrap').classList.remove('song-entry-reveal');
 $('homeView').inert=false;$('playerView').inert=false;$('playerView').removeAttribute('aria-busy');
 if(state.mode==='home'&&!document.hidden)resumeHomePresentation();
}
async function enterSongFromCard(id,card){
 if(homeExperience.entry)return;
 const project=state.library.find(song=>song.id===id);if(!project)return toast('找不到歌曲');
 const overlay=$('songEntryTransition');
 if(homeReducedMotion()||!overlay.animate){openSong(id);$('songTitle').focus?.({preventScroll:true});return}
 const entry={animations:[],mounting:false};homeExperience.entry=entry;
 const active=()=>homeExperience.entry===entry,animate=(el,frames,duration)=>animateSongTransition(entry,el,frames,duration);
 const colors=resolvedPlayerColors(project),rect=card.getBoundingClientRect(),rules=APP_CONFIG.home.songEntry;
 for(const [name,value]of [['start',colors.surfaceStart],['end',colors.backdrop],['accent',colors.accent]])overlay.style.setProperty('--entry-'+name,value);
 $('songEntryTitle').textContent=project.title;$('songEntryMessage').textContent='正在展开谱面';const art=platformCover(project)||themeDefinition(project).decorations.cover;
 $('songEntryArt').hidden=!art;if(art)$('songEntryArt').src=themeAsset(art,project);
 overlay.setAttribute('aria-label','正在打开单曲');$('homeView').inert=true;pauseHomePresentation();overlay.hidden=false;overlay.dataset.phase='expand';
 try{
  await animate(overlay,[{clipPath:`inset(${Math.max(0,rect.top)}px ${Math.max(0,innerWidth-rect.right)}px ${Math.max(0,innerHeight-rect.bottom)}px ${Math.max(0,rect.left)}px round 16px)`,opacity:.7},{clipPath:'inset(0px 0px 0px 0px round 0px)',opacity:1}],rules.expandMs);
  if(!active())return;
  overlay.dataset.phase='loading';entry.mounting=true;openSong(id);entry.mounting=false;
  const player=$('playerView');player.inert=true;player.setAttribute('aria-busy','true');
  // Paint the assembled roll and grid under the cover before revealing the real player.
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));if(!active())return;
  overlay.dataset.phase='reveal';document.querySelector('.site-wrap').classList.add('song-entry-reveal');
  await animate(player,songRevealFrames(player),rules.revealMs);
  if(!active())return;cancelSongEntry(true);startScoreEntrance();$('songTitle').focus({preventScroll:true});
 }catch(error){if(active()){cancelSongEntry();toast('打开单曲失败：'+error.message,5000)}}
}

async function animateSongTransition(entry,el,frames,duration){
 const animation=el.animate(frames,{duration,easing:'cubic-bezier(.22,.65,.25,1)',fill:'forwards'});entry.animations.push(animation);await animation.finished.catch(()=>{});
}
function songRevealFrames(el,opening=true){
 const bounds=el.getBoundingClientRect(),cx=clamp(innerWidth/2-bounds.left,0,el.clientWidth),cy=clamp(innerHeight/2-bounds.top,0,el.clientHeight),radius=Math.ceil(Math.hypot(Math.max(cx,el.clientWidth-cx),Math.max(cy,el.clientHeight-cy)));
 const frames=[{clipPath:`circle(0px at ${cx}px ${cy}px)`},{clipPath:`circle(${radius}px at ${cx}px ${cy}px)`}];return opening?frames:frames.reverse();
}
async function returnHomeFromPlayer(){
 cancelScoreEntrance();
 if(homeExperience.entry)return;
 const overlay=$('songEntryTransition');
 if(state.mode!=='player'||state.editMode||homeReducedMotion()||!overlay.animate){goHome();return}
 const entry={animations:[],mounting:false};homeExperience.entry=entry;
 const active=()=>homeExperience.entry===entry,colors=resolvedPlayerColors(state.project),rules=APP_CONFIG.home.songReturn;
 for(const [name,value]of [['start',colors.surfaceStart],['end',colors.backdrop],['accent',colors.accent]])overlay.style.setProperty('--entry-'+name,value);
 $('songEntryTitle').textContent='星光音乐馆';$('songEntryMessage').textContent='正在返回音乐馆';$('songEntryArt').hidden=true;overlay.setAttribute('aria-label','正在返回音乐馆');
 pauseSong();cancelRollDrag();cancelRollFinish();cancelPlayerValueScroll();closeRangePicker();closeInstrumentPicker();closeSpeedPicker();
 $('homeView').inert=true;$('playerView').inert=true;overlay.hidden=false;overlay.dataset.phase='return-cover';
 document.querySelector('.site-wrap').classList.add('song-entry-reveal');
 try{
  await animateSongTransition(entry,$('playerView'),songRevealFrames($('playerView'),false),rules.coverMs);if(!active())return;
  document.querySelector('.site-wrap').classList.remove('song-entry-reveal');
  overlay.dataset.phase='return-loading';entry.mounting=true;goHome();entry.mounting=false;$('homeView').inert=true;
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));if(!active())return;
  // Shrink the preparation cover too, exposing the home from the edges inward.
  overlay.dataset.phase='return-reveal';
  await animateSongTransition(entry,overlay,songRevealFrames(overlay,false),rules.revealMs);if(!active())return;
  cancelSongEntry();$('libraryTitle').focus({preventScroll:true});
 }catch(error){if(active()){cancelSongEntry();goHome()}}
}

// A platform-owned theme shelf; registry mutations never alter scores or player handlers.
let pendingThemeRemoval=null;
function themeUsage(id){return state.library.filter(p=>sceneId(p)===id)}
function renderThemeRepository(){
 const grid=$('themeRepositoryGrid');grid.replaceChildren();const definitions=Object.values(THEME_DEFINITIONS);$('themeRepositoryCount').textContent=`已加载 ${definitions.length} 款主题`;
 for(const d of definitions){
  const builtin=PLATFORM_BUILTIN_THEMES.has(d.id),usage=themeUsage(d.id),card=document.createElement('article');card.className='theme-repository-card';card.dataset.themeId=d.id;
  const image=document.createElement('img'),path=d.decorations.cover||d.decorations.scene.image;image.alt='';image.loading='lazy';if(path)image.src=themeAsset(path,{theme:{id:d.id}});else image.hidden=true;
  const body=document.createElement('div'),title=document.createElement('h3'),badge=document.createElement('small'),desc=document.createElement('p'),actions=document.createElement('div');title.textContent=d.displayName;badge.textContent=(builtin?'内置主题':'已添加')+' · '+usage.length+' 首乐曲使用';desc.textContent=d.description||d.name;actions.className='theme-repository-actions';
  const preview=document.createElement('button');preview.className='btn-outline';preview.textContent='预览';preview.onclick=()=>openHomeThemePreview(d.id);actions.append(preview);
  const backup=document.createElement('button');backup.className='btn-outline';backup.textContent='导出';backup.onclick=()=>exportTheme({title:d.displayName,theme:{id:d.id,...copy(d.defaults),...copy(d.initialOverrides)}});actions.append(backup);
  const remove=document.createElement('button');remove.className='btn-outline';remove.textContent=builtin?'内置保留':'移除';remove.disabled=builtin||usage.length>0;remove.title=builtin?'平台内置主题':usage.length?'请先为使用此主题的乐曲更换主题':'';remove.onclick=()=>{pendingThemeRemoval=d.id;$('themeRemoveMessage').textContent=`移除「${d.displayName}」？你可以先导出备份，之后再重新添加。`;$('themeRemoveDialog').showModal()};actions.append(remove);
  body.append(title,badge,desc,actions);card.append(image,body);grid.append(card);
 }
}
function openThemeRepository(){stopHomeCarousel();renderThemeRepository();$('themeRepositoryDialog').showModal()}
function bindThemeRepository(){
 if(!document.createComment)return;
 $('themeRepositoryAdd').onclick=()=>$('themeLibraryInput').click();$('themeRepositoryDialog').addEventListener('close',scheduleHomeCarousel);
 $('confirmThemeRemoval').onclick=()=>{
  const id=pendingThemeRemoval,d=THEME_DEFINITIONS[id];if(!d)return;
  if(PLATFORM_BUILTIN_THEMES.has(id)||themeUsage(id).length||(state.editMode&&sceneId(state.project)===id)){toast('此主题仍被乐曲使用，不能移除');return}
  try{const records=JSON.parse(localStorage.getItem(PLATFORM_THEME_KEY)||'[]').filter(item=>item.definition.id!==id);localStorage.setItem(PLATFORM_THEME_KEY,JSON.stringify(records))}catch(error){toast('主题移除失败：'+error.message,6000);return}
  delete THEME_DEFINITIONS[id];delete PRESETS[id];delete PLAYER_APPEARANCE[id];delete PLATFORM_THEME_ASSETS[id];populateThemeChoices();renderThemeRepository();$('themeRemoveDialog').close();toast('已移除主题「'+d.displayName+'」');
 };$('themeRemoveDialog').addEventListener('close',()=>{pendingThemeRemoval=null});
}

// A single custom listbox keeps the creation form independent of native OS select menus.
function closeCreateThemePicker(restoreFocus=false){
 const menu=$('createThemeMenu');if(menu.matches(':popover-open'))menu.hidePopover();$('createThemeToggle').setAttribute('aria-expanded','false');if(restoreFocus)$('createThemeToggle').focus();
}
function syncCreateThemePicker(){
 if(!document.createComment)return;
 const selected=$('createTheme').value,menu=$('createThemeMenu');$('createThemeValue').textContent=THEME_DEFINITIONS[selected]?.displayName||'选择主题';menu.replaceChildren();
 for(const d of Object.values(THEME_DEFINITIONS)){
  const option=document.createElement('button');option.type='button';option.role='option';option.dataset.theme=d.id;option.setAttribute('aria-selected',String(d.id===selected));option.tabIndex=d.id===selected?0:-1;
  const swatch=document.createElement('span');swatch.className='theme-color-chip';swatch.style.backgroundColor=d.appearance.accent;const name=document.createElement('span');name.textContent=d.displayName;option.append(swatch,name);const check=document.createElement('span');check.innerHTML=appIcon('check');check.className='theme-choice-check';option.append(check);
  option.onclick=()=>{$('createTheme').value=d.id;closeCreateThemePicker(true);syncCreateThemePicker()};menu.append(option);
 }
}
function openCreateThemePicker(){
 syncCreateThemePicker();const menu=$('createThemeMenu'),rect=$('createThemeToggle').getBoundingClientRect(),below=innerHeight-rect.bottom-12,above=rect.top-12;
 const height=Math.min(260,Math.max(below,above));menu.style.width=rect.width+'px';menu.style.left=rect.left+'px';menu.style.maxHeight=height+'px';menu.style.top=below>=Math.min(260,menu.children.length*42+12)?rect.bottom+6+'px':'auto';menu.style.bottom=menu.style.top==='auto'?innerHeight-rect.top+6+'px':'auto';
 menu.showPopover();$('createThemeToggle').setAttribute('aria-expanded','true');const selected=menu.querySelector('[aria-selected=true]')||menu.firstElementChild;selected?.focus({preventScroll:true});selected?.scrollIntoView({block:'nearest'});
}
function bindCreateThemePicker(){
 if(!document.createComment)return;
 const toggle=$('createThemeToggle'),menu=$('createThemeMenu');toggle.onclick=()=>menu.matches(':popover-open')?closeCreateThemePicker():openCreateThemePicker();toggle.onkeydown=e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();openCreateThemePicker()}};
 menu.onkeydown=e=>{const options=[...menu.children],index=options.indexOf(document.activeElement);let next=index;if(e.key==='ArrowDown')next=(index+1)%options.length;else if(e.key==='ArrowUp')next=(index+options.length-1)%options.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=options.length-1;else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeCreateThemePicker(true);return}else if(e.key==='Tab'){closeCreateThemePicker(true);return}else return;e.preventDefault();options[next].focus()};
 document.addEventListener('pointerdown',e=>{if(menu.matches(':popover-open')&&!menu.contains(e.target)&&!toggle.contains(e.target))closeCreateThemePicker()});window.addEventListener('resize',()=>closeCreateThemePicker());$('createDialog').addEventListener('close',()=>closeCreateThemePicker());$('createDialog').addEventListener('cancel',e=>{if(menu.matches(':popover-open')){e.preventDefault();closeCreateThemePicker(true)}});$('createTitle').oninput=()=>{$('createTitle').setCustomValidity('');$('createTitle').removeAttribute('aria-invalid');$('createTitleError').hidden=true};$('createTheme').onchange=syncCreateThemePicker;
}


// Keep navigation anchored while the library fades out below it, without painting a header panel.
function bindHomeScrollChrome(){
 if(!document.createComment)return;
 const home=$('homeView'),header=home.querySelector('.home-top'),body=home.querySelector('.home-body');let pending=0;
 const paint=()=>{pending=0;const scrolled=home.scrollTop>1;home.classList.toggle('home-scrolled',scrolled);const cutoff=scrolled?Math.max(0,header.getBoundingClientRect().bottom-body.getBoundingClientRect().top):0;body.style.setProperty('--home-content-cutoff',cutoff+'px')};
 const schedule=()=>{if(!pending)pending=requestAnimationFrame(paint)};home.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule);new ResizeObserver(schedule).observe(header);paint();
}
let libraryFilterPicker=null;
function syncLibraryFilterPicker(){libraryFilterPicker?.sync()}
function bindLibraryFilterPicker(){
 if(!document.createComment)return;
 const select=$('libraryFilter'),trigger=$('libraryFilterToggle'),menu=$('libraryFilterMenu'),value=$('libraryFilterValue');
 const close=(focus=false)=>{if(menu.matches(':popover-open'))menu.hidePopover();trigger.setAttribute('aria-expanded','false');if(focus)trigger.focus()};
 const sync=()=>{value.textContent=select.selectedOptions[0]?.textContent||'全部曲目';for(const option of menu.children){const active=option.dataset.value===select.value;option.setAttribute('aria-selected',String(active));option.tabIndex=active?0:-1}};
 for(const item of select.options){const option=document.createElement('button');option.type='button';option.role='option';option.dataset.value=item.value;const label=document.createElement('span');label.textContent=item.textContent;const check=document.createElement('span');check.className='theme-choice-check';check.innerHTML=appIcon('check');option.append(label,check);option.onclick=()=>{select.value=item.value;select.dispatchEvent(new Event('change',{bubbles:true}));sync();close(true)};menu.append(option)}
 const open=()=>{sync();const rect=trigger.getBoundingClientRect();menu.style.width=Math.max(150,rect.width)+'px';menu.style.left=Math.min(rect.left,innerWidth-Math.max(150,rect.width)-12)+'px';menu.style.top=rect.bottom+6+'px';menu.style.maxHeight=Math.max(100,innerHeight-rect.bottom-18)+'px';menu.showPopover();trigger.setAttribute('aria-expanded','true');menu.querySelector('[aria-selected=true]')?.focus({preventScroll:true})};
 trigger.onclick=()=>menu.matches(':popover-open')?close():open();trigger.onkeydown=e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();open()}};
 menu.onkeydown=e=>{const options=[...menu.children],index=options.indexOf(document.activeElement);let next=index;if(e.key==='ArrowDown')next=(index+1)%options.length;else if(e.key==='ArrowUp')next=(index+options.length-1)%options.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=options.length-1;else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);return}else if(e.key==='Tab'){close(true);return}else return;e.preventDefault();options[next].focus()};
 document.addEventListener('pointerdown',e=>{if(menu.matches(':popover-open')&&!menu.contains(e.target)&&!trigger.contains(e.target))close()});$('homeView').addEventListener('scroll',()=>close(),{passive:true});window.addEventListener('resize',()=>close());select.addEventListener('change',sync);libraryFilterPicker={sync,close};sync();
}
