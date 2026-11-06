"""Real audio gain, accessible volume input, persistence and responsive player controls."""
import argparse,json,math
from pathlib import Path
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);out=p.parse_args().output.resolve();out.mkdir(parents=True,exist_ok=False)
r=Path(__file__).resolve().parents[1]
with sync_playwright() as pw:
 b=pw.chromium.launch(channel='msedge',headless=True);page=b.new_page(viewport={'width':1366,'height':768});errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto((r/'SkyMusicStudio_Standalone.html').as_uri());page.locator('.card-play').first.click();slider=page.get_by_role('slider',name='音量',exact=True);assert slider.input_value()=='25'
 assert page.evaluate("window.__SKY_STUDIO_TEST__.normalize({score:{events:[]},playback:{volume:0}}).playback.volume")==0
 assert page.evaluate("window.__SKY_STUDIO_TEST__.normalize({score:{events:[]},playback:{volume:'bad'}}).playback.volume")==.25
 audio=page.evaluate('''async()=>{
 const t=window.__SKY_STUDIO_TEST__;await t.preloadPiano();const s=t.state,ac=s.audioCtx;if(Math.abs(s.volumeBus.gain.value-2)>.001)throw Error('Default gain not increased');await ac.resume();
 const osc=ac.createOscillator(),quiet=ac.createGain(),analyser=ac.createAnalyser();quiet.gain.value=.05;osc.connect(quiet);quiet.connect(s.dryBus);s.volumeBus.connect(analyser);osc.start();
 const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),set=n=>{const e=document.getElementById('volumeSlider');e.value=n;e.dispatchEvent(new Event('input',{bubbles:true}))};
 const rms=()=>{const a=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(a);return Math.sqrt(a.reduce((v,x)=>v+x*x,0)/a.length)};
 set(100);await wait(400);const loud=rms(),fullGain=s.volumeBus.gain.value;set(25);await wait(200);const low=rms();set(50);await wait(200);const half=rms();if(Math.abs(half/low-2)>.1)throw Error('Nonlinear volume');set(0);await wait(200);const silent=rms();osc.stop();quiet.disconnect();s.volumeBus.disconnect(analyser);
 if(Math.abs(fullGain-8)>.001||loud<.001||low/loud<.20||low/loud>.30||silent>.000001)throw Error('Unexpected gain '+JSON.stringify({loud,low,silent,fullGain}));
 if(t.projectEntry(s.project).playback.volume!==0)throw Error('Export lost mute');return {loud,low,silent,ratio:low/loud,doubleRatio:half/low,fullGain};
 }''')
 assert slider.get_attribute('aria-valuetext')=='静音';slider.press('End');assert slider.input_value()=='100';slider.press('ArrowLeft');assert slider.input_value()=='99';page.locator('#playBtn').click();page.wait_for_function('window.__SKY_STUDIO_TEST__.state.isPlaying');slider.press('Home');assert page.evaluate('window.__SKY_STUDIO_TEST__.state.isPlaying');page.wait_for_timeout(100);assert page.evaluate('window.__SKY_STUDIO_TEST__.state.position')>0;page.locator('#playBtn').click();page.reload();assert page.locator('#homeView').is_visible();page.locator('.card-play').first.click();assert slider.input_value()=='0'
 assert page.evaluate('window.__SKY_STUDIO_TEST__.state.volumeBus?.gain.value??0')==0
 page.evaluate("window.__SKY_STUDIO_TEST__.goHome()");page.locator('.card-play').nth(1).click();assert slider.input_value()=='25'
 colors=page.evaluate("(()=>{const style=id=>getComputedStyle(document.getElementById(id));return {volume:style('volumeSlider').accentColor,sustain:style('sustainSlider').accentColor,volumeText:style('volumeValue').color,sustainText:style('sustainValue').color}})()");assert colors['volume']==colors['sustain'] and colors['volumeText']==colors['sustainText']
 layouts=[]
 for w,h in [(1920,1080),(1366,768),(1100,768),(1024,768),(900,768),(390,844)]:
  page.set_viewport_size({'width':w,'height':h});page.wait_for_timeout(80)
  layout=page.locator('.player-control-row').evaluate('''e=>{const rect=e.getBoundingClientRect();const items=[...e.children].filter(x=>!x.hidden).map(x=>{let r=x.getBoundingClientRect();return {class:x.className,x:r.x,y:r.y,right:r.right,bottom:r.bottom}});return {left:rect.left,right:rect.right,items,overflow:document.documentElement.scrollWidth>innerWidth}}''')
  assert not layout['overflow'],(w,layout)
  assert all(x['x']>=0 and x['right']<=w+1 for x in layout['items']),(w,layout)
  for i,a in enumerate(layout['items']):
   for c in layout['items'][i+1:]:
    assert min(a['right'],c['right'])-max(a['x'],c['x'])<=1 or min(a['bottom'],c['bottom'])-max(a['y'],c['y'])<=1,(w,a,c)
  page.screenshot(path=str(out/f'volume-{w}.png'));layouts.append({'width':w,**layout})
 assert not errors,errors
 (out/'results.json').write_text(json.dumps({'passed':True,'audio':audio,'colors':colors,'layouts':layouts,'errors':errors},ensure_ascii=False,indent=2),'utf-8');print('PASS real output gain/mute, uninterrupted playback, keyboard/UI recognition, song persistence and 6 viewports');b.close()
