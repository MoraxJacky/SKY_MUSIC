// Homepage presentation is separate from the player, score and theme controllers.
const homeExperience={cards:new Set(),views:new Set(),flipped:new Set(),raf:0,last:0,carousel:null};
const homeReducedMotion=()=>Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);

function clearHomeCardPhysics(){
 cancelAnimationFrame(homeExperience.raf);homeExperience.raf=0;
 for(const card of homeExperience.views){card.x=card.y=card.vx=card.vy=card.tx=card.ty=card.glow=card.flash=0;paintHomeCard(card)}
 homeExperience.cards.clear();homeExperience.views.clear();
}
function paintHomeCard(card){
 card.el.style.setProperty('--tilt-x',card.x.toFixed(3)+'deg');card.el.style.setProperty('--tilt-y',card.y.toFixed(3)+'deg');
 card.el.style.setProperty('--shine-x',card.lightX.toFixed(2)+'%');card.el.style.setProperty('--shine-y',card.lightY.toFixed(2)+'%');
 card.el.style.setProperty('--shine-opacity',Math.min(.65,card.glow*.34+card.flash*.22).toFixed(3));
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
function setHomeCardFlip(el,song,flipped){
 el.classList.toggle('is-flipped',flipped);el.dataset.face=flipped?'back':'front';
 const trigger=el.querySelector('.cone-flip-trigger');trigger.setAttribute('aria-pressed',String(flipped));trigger.setAttribute('aria-label',(flipped?'返回封面：':'查看歌曲信息：')+song.title);
 el.querySelector('.cone-front').setAttribute('aria-hidden',String(flipped));el.querySelector('.cone-back').setAttribute('aria-hidden',String(!flipped));
 if(flipped)homeExperience.flipped.add(song.id);else homeExperience.flipped.delete(song.id);
}
function attachHomeCard(el,song){
 if(!document.createComment)return;
 const card={el,x:0,y:0,vx:0,vy:0,tx:0,ty:0,glow:0,flash:0,hover:false,lightX:50,lightY:50,targetLightX:50,targetLightY:50};
 homeExperience.views.add(card);setHomeCardFlip(el,song,homeExperience.flipped.has(song.id));
 el.querySelector('.cone-flip-trigger').onclick=()=>setHomeCardFlip(el,song,el.dataset.face!=='back');
 const point=event=>{const rect=el.getBoundingClientRect(),x=clamp((event.clientX-rect.left)/rect.width,0,1),y=clamp((event.clientY-rect.top)/rect.height,0,1),limit=APP_CONFIG.home.cardPhysics.maxTiltDeg;card.tx=(.5-y)*2*limit;card.ty=(x-.5)*2*limit;card.targetLightX=x*100;card.targetLightY=y*100;wakeHomeCard(card)};
 el.addEventListener('pointerenter',event=>{if(event.pointerType==='touch'||homeReducedMotion())return;card.hover=true;card.flash=1;point(event)});
 el.addEventListener('pointermove',event=>{if(event.pointerType==='touch'||homeReducedMotion())return;point(event)});
 const leave=()=>{card.hover=false;card.tx=card.ty=0;card.targetLightX=card.targetLightY=50;if(!homeReducedMotion())wakeHomeCard(card)};
 el.addEventListener('pointerleave',leave);el.addEventListener('pointercancel',leave);
}

function stopHomeCarousel(){const c=homeExperience.carousel;if(c){clearTimeout(c.timer);c.timer=0}}
function scheduleHomeCarousel(){
 stopHomeCarousel();const c=homeExperience.carousel;
 if(!c||c.busy||c.hover||c.focus||document.hidden||state.mode!=='home'||$('homeView').hidden||homeReducedMotion())return;
 c.timer=setTimeout(()=>{c.timer=0;if(!document.hidden&&state.mode==='home'&&!c.hover&&!c.focus)moveHomeTheme(1,false)},APP_CONFIG.home.carousel.intervalMs);
}
function paintHomeCarousel(animate=true){
 const c=homeExperience.carousel;if(!c)return;
 c.track.style.transitionDuration=animate&&!homeReducedMotion()?APP_CONFIG.home.carousel.transitionMs+'ms':'0ms';
 c.track.style.transform='translate3d('+(-100*c.physical)+'%,0,0)';
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
 clearHomeCardPhysics();homeExperience.flipped.clear();const c=homeExperience.carousel;if(!c)return;stopHomeCarousel();clearTimeout(c.settleTimer);c.index=0;c.physical=1;c.busy=false;c.pending=null;paintHomeCarousel(false);scheduleHomeCarousel();
}
function pauseHomePresentation(){stopHomeCarousel();clearHomeCardPhysics()}
function resumeHomePresentation(){scheduleHomeCarousel()}
function bindHomeExperience(){
 if(!document.createComment)return;
 const track=$('homeThemeTrack'),dotHost=$('homeThemeDots');
 const definitions=Object.values(APP_CONFIG.platform.themes).map(pack=>pack.definition);
 const c=homeExperience.carousel={track,definitions,count:definitions.length,index:0,physical:1,busy:false,pending:null,timer:0,settleTimer:0,hover:false,focus:false,slides:[],dots:[]};
 for(const [index,definition]of definitions.entries()){
  const slide=document.createElement('article');slide.className='home-theme-slide';slide.dataset.theme=definition.id;slide.setAttribute('role','group');slide.setAttribute('aria-roledescription','幻灯片');slide.setAttribute('aria-label',(index+1)+' / '+c.count+' '+definition.displayName);
  slide.style.setProperty('--preview-start',definition.appearance.stageStart);slide.style.setProperty('--preview-accent',definition.appearance.accent);
  slide.innerHTML='<div class="home-theme-art"><img class="preview-landscape" alt=""><img class="preview-companion" alt=""></div><div class="home-theme-copy"><span class="eyebrow">THEME COLLECTION</span><h1></h1><p></p><span class="theme-preview-label">主题预览</span></div>';
  slide.querySelector('h1').textContent=definition.displayName;slide.querySelector('p').textContent=definition.description||definition.name;
  const project={theme:{id:definition.id}},decor=definition.decorations,scene=decor.scene,path=decor.cover||(scene.type==='image'?scene.image:scene.type==='frames'?scene.framePattern.replace('{index}','00'):null),image=slide.querySelector('.preview-landscape');
  image.hidden=!path;if(path)image.src=themeAsset(path,project);
  const companion=slide.querySelector('.preview-companion');companion.hidden=!decor.companion;if(decor.companion)companion.src=themeAsset(decor.companion,project);
  track.append(slide);c.slides.push(slide);
  const dot=document.createElement('button');dot.type='button';dot.setAttribute('aria-label','展示'+definition.displayName);dot.onclick=()=>goHomeTheme(index,true);dotHost.append(dot);c.dots.push(dot);
 }
 for(const [slide,where]of [[c.slides[c.count-1],'before'],[c.slides[0],'after']]){const clone=slide.cloneNode(true);clone.dataset.clone='true';clone.setAttribute('aria-hidden','true');clone.inert=true;if(where==='before')track.prepend(clone);else track.append(clone)}
 track.addEventListener('transitionend',event=>{if(event.target===track&&event.propertyName==='transform')finishHomeThemeMove()});
 $('homeThemePrev').onclick=()=>moveHomeTheme(-1);$('homeThemeNext').onclick=()=>moveHomeTheme(1);
 const hero=document.querySelector('.theme-carousel');
 hero.addEventListener('pointerenter',()=>{if(APP_CONFIG.home.carousel.pauseOnHover){c.hover=true;stopHomeCarousel()}});hero.addEventListener('pointerleave',()=>{c.hover=false;scheduleHomeCarousel()});
 for(const host of [hero,dotHost]){
  host.addEventListener('focusin',()=>{c.focus=true;stopHomeCarousel()});
  host.addEventListener('focusout',event=>{if(!hero.contains(event.relatedTarget)&&!dotHost.contains(event.relatedTarget)){c.focus=false;scheduleHomeCarousel()}});
  host.addEventListener('keydown',event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();moveHomeTheme(event.key==='ArrowRight'?1:-1)}});
 }
 document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseHomePresentation();else scheduleHomeCarousel()});
 window.matchMedia?.('(prefers-reduced-motion: reduce)')?.addEventListener?.('change',()=>{clearHomeCardPhysics();if(homeReducedMotion()){stopHomeCarousel();finishHomeThemeMove()}else scheduleHomeCarousel()});
 paintHomeCarousel(false);scheduleHomeCarousel();
}
