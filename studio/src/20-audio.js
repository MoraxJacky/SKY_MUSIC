const ONLINE_PIANO_ROOTS=[['C4',60],['Ds4',63],['Fs4',66],['A4',69],['C5',72],['Ds5',75],['Fs5',78],['A5',81],['C6',84],['Ds6',87],['Fs6',90],['A6',93]];
const ONLINE_PIANO_BASE='https://tonejs.github.io/audio/salamander/';
function makeRoomImpulse(ac){let length=Math.round(ac.sampleRate*1.85),b=ac.createBuffer(2,length,ac.sampleRate);for(let ch=0;ch<2;ch++){let data=b.getChannelData(ch);for(let i=0;i<length;i++){let t=i/ac.sampleRate;data[i]=(Math.random()*2-1)*Math.exp(-t*3.5)*Math.pow(Math.max(0,1-t/1.85),1.4)*.36}}return b}
function getAudio(){if(!state.audioCtx){const C=window.AudioContext||window.webkitAudioContext;if(!C)throw Error('当前浏览器不支持 Web Audio');let ac=state.audioCtx=new C();state.master=ac.createDynamicsCompressor();state.master.threshold.value=-15;state.master.knee.value=18;state.master.ratio.value=3;state.volumeBus=ac.createGain();state.volumeBus.gain.value=normalizeVolume(state.volume)*PLAYER_RULES.volume.maxGain;state.master.connect(state.volumeBus);state.volumeBus.connect(ac.destination);
 state.dryBus=ac.createGain();state.dryBus.connect(state.master);state.reverbSend=ac.createGain();let convolution=ac.createConvolver();convolution.buffer=makeRoomImpulse(ac);state.wetBus=ac.createGain();state.reverbSend.connect(convolution);convolution.connect(state.wetBus);state.wetBus.connect(state.master);updateSustainAudio();}return state.audioCtx}
function updateVolumeAudio(){
 if(!state.audioCtx||!state.volumeBus)return;const now=state.audioCtx.currentTime,gain=state.volumeBus.gain;
 gain.cancelScheduledValues(now);gain.setValueAtTime(gain.value,now);gain.linearRampToValueAtTime(normalizeVolume(state.volume)*PLAYER_RULES.volume.maxGain,now+PLAYER_RULES.volume.rampSeconds);
}
function updateSustainAudio(){if(!state.audioCtx||!state.wetBus)return;state.wetBus.gain.setTargetAtTime(.012+state.sustain*.40,state.audioCtx.currentTime,.04)}
async function loadOfflinePiano(){const ac=getAudio();if(state.pianoBuffers.size>=15)return;if(!state.loadedSamplePromise){state.loadedSamplePromise=Promise.all(Object.entries(SAMPLES).map(async([midi,b64])=>{let bytes=base64ToBytes(b64);return [Number(midi),await ac.decodeAudioData(bytes.buffer)]})).then(items=>{for(let [m,b]of items)state.pianoBuffers.set(m,b)}).catch(err=>{state.loadedSamplePromise=null;throw err})}await state.loadedSamplePromise}
async function preloadPiano(){return prepareInstrument()}
function sampledKey(midi,buffers){let keys=[...buffers.keys()];if(!keys.length)return null;keys.sort((a,b)=>Math.abs(a-midi)-Math.abs(b-midi));return keys[0]}
function triggerSample(note,at,duration=190,poly=1,velocity=85){const ac=state.audioCtx;if(!ac)return;let midi=noteMidi(note),buffers=activeInstrumentBuffers||state.pianoBuffers,root=sampledKey(midi,buffers);if(root==null)return;
 let source=ac.createBufferSource();source.buffer=buffers.get(root);source.playbackRate.value=2**((midi-root)/12);let gain=ac.createGain();let attack=.008,noteSec=clamp(duration/1000,.06,2.8)/state.rate,release=(.16+state.sustain*1.6)/Math.sqrt(state.rate),volume=instrumentSpec(activeInstrumentId).gain/Math.sqrt(Math.max(1,poly))*Math.pow(clamp(velocity,1,127)/95,1.28);let end=at+noteSec+release;
 gain.gain.setValueAtTime(.0001,at);gain.gain.linearRampToValueAtTime(volume,at+attack);gain.gain.setValueAtTime(volume*.74,at+noteSec);gain.gain.exponentialRampToValueAtTime(.00013,end);source.connect(gain);gain.connect(state.dryBus);gain.connect(state.reverbSend);source.start(at);source.stop(Math.min(at+source.buffer.duration/Math.max(.01,source.playbackRate.value)-.02,end+.1));state.activeVoices.add(source);source.onended=()=>{state.activeVoices.delete(source);try{source.disconnect();gain.disconnect()}catch(e){}}
}
function stopVoices(){for(let source of [...state.activeVoices]){try{source.stop()}catch(e){}}state.activeVoices.clear()}
function realPosition(){if(!state.isPlaying||!state.audioCtx)return state.position;return state.mediaAnchor+(state.audioCtx.currentTime-state.clockAnchor)*1000*state.rate}
function beginClock(){let ac=state.audioCtx;state.mediaAnchor=state.position;state.clockAnchor=ac.currentTime;let ev=scoreEvents(state.project);state.scheduleIndex=lowerBound(ev,state.position-2);state.interval=setInterval(scheduleAudio,24);scheduleAudio()}
function lowerBound(arr,t){let l=0,r=arr.length;while(l<r){let m=(l+r)>>1;if(arr[m].timeMs<t)l=m+1;else r=m}return l}
function scheduleAudio(){if(!state.isPlaying)return;let events=scoreEvents(state.project),now=realPosition(),lookahead=Math.min(state.project.durationMs,now+170*state.rate);while(state.scheduleIndex<events.length&&events[state.scheduleIndex].timeMs<=lookahead){let e=events[state.scheduleIndex++];if(!e.notes.length||e.timeMs<now-35)continue;let at=state.audioCtx.currentTime+Math.max(0,(e.timeMs-now)/(1000*state.rate));for(let n of e.notes)triggerSample(n,at,e.durationMs,e.notes.length,e.velocity||85)}}
async function playPause(){cancelScoreEntrance();if(state.isPlaying){pauseSong();return}if(!state.project)return;const project=state.project;cancelRollFinish();try{toast('正在准备音源…',1300);if(!await preloadPiano())return}catch(err){console.error(err);toast('音源加载失败：'+err.message,6000);return}if(state.project!==project||state.mode!=='player')return;if(state.position>=state.project.durationMs-80){state.position=0;state.rollPageStart=0}state.isPlaying=true;beginClock();setControlContent($('playBtn'),'pause','暂停');state.sceneBase=performance.now();state.raf=requestAnimationFrame(playFrame);toast('开始演奏',1000)}
function pauseSong(){if(!state.isPlaying)return;state.position=clamp(realPosition(),0,state.project.durationMs);state.isPlaying=false;clearInterval(state.interval);cancelAnimationFrame(state.raf);stopVoices();setControlContent($('playBtn'),'play','播放');updateVisual();$('stageStatus').textContent='已暂停'}
function seekTo(time,preserveRoll=false,rollView=null){
 resetPlaybackKeyFeedback();
 cancelScoreEntrance();
 if(!state.project)return;
 const was=state.isPlaying,frame=rollFrame(was?realPosition():state.position),fraction=frame.phase/frame.windowMs;
 cancelRollFinish();
 if(was){clearInterval(state.interval);stopVoices()}
 state.position=clamp(time,0,Math.max(0,state.project.durationMs));
 state.rollPageStart=rollView?rollView.begin:preserveRoll?rollSeekOrigin(state.position,fraction):Math.floor(Math.max(0,state.position-(state.position>=state.project.durationMs ? .001 : 0))/(state.windowSec*1000))*state.windowSec*1000;
 state.lastSelected=-1;
 // Re-anchor the running audio clock directly: rapid drag events never spawn async play calls.
 if(was)beginClock();
 updateVisual();
}
function playFrame(){if(!state.isPlaying)return;state.position=clamp(realPosition(),0,state.project.durationMs);if(state.position>=state.project.durationMs){if(state.project.playback.loop&&!state.editMode){clearInterval(state.interval);cancelRollFinish();state.position=0;state.rollPageStart=0;state.selected=0;state.lastSelected=-1;state.page=-1;resetPlaybackKeyFeedback();beginClock()}else{finishRollScan();return}}updateVisual();animateScene();state.raf=requestAnimationFrame(playFrame)}
function isSounding(timeMs){if(!state.isPlaying)return false;let ev=scoreEvents(state.project);let i=lowerBound(ev,timeMs);for(let k=Math.max(0,i-10);k<i;k++){let e=ev[k];if(e.notes.length&&timeMs>=e.timeMs&&timeMs<e.timeMs+e.durationMs+250+state.sustain*800)return true}return false}
function activeNotes(timeMs){let ev=scoreEvents(state.project),i=lowerBound(ev,timeMs),set=new Set();for(let k=Math.max(0,i-12);k<i;k++){let e=ev[k];if(e.notes.length&&timeMs>=e.timeMs&&timeMs<e.timeMs+e.durationMs+state.sustain*570){for(let n of e.notes)set.add(n)}}return set}
