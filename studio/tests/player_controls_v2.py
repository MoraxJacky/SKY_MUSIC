"""Real playback feedback/repeat, wheel instruments, capsule geometry, SVG and notices."""
import argparse,json
from pathlib import Path
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);p.add_argument('--url');a=p.parse_args();out=a.output.resolve();out.mkdir(parents=True,exist_ok=False)
r=Path(__file__).resolve().parents[1];url=a.url or (r/'SkyMusicStudio_Standalone.html').as_uri()
with sync_playwright() as pw:
 b=pw.chromium.launch(channel='msedge',headless=True);page=b.new_page(viewport={'width':1366,'height':900});errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(url)
 page.locator('.card-play').first.click();page.wait_for_function("document.getElementById('playerView').dataset.scoreEntrance==='running'")
 timing=page.locator('#keyBoard').evaluate("e=>[...e.querySelectorAll('button')].flatMap(e=>e.getAnimations().filter(a=>a.constructor.name==='Animation').map(a=>({duration:a.effect.getTiming().duration,end:a.effect.getTiming().duration+a.effect.getTiming().delay})))")
 assert timing and min(t['duration'] for t in timing)>1000 and max(t['end'] for t in timing)==2400,timing
 page.wait_for_function("document.getElementById('playerView').dataset.scoreEntrance==='done'")
 assert page.locator('#loopOneBtn svg').count()==1 and page.locator('#restartBtn svg').count()==1 and page.locator('#speedToggle svg').count()==1
 assert page.locator('#instrumentToggle,#instrumentMenu').count()==0
 notices=[]
 for id in ['songInfoBtn','exportProject']:
  page.locator('#'+id).click();assert page.locator('#toast').is_visible();notices.append(page.locator('#toast').inner_text());page.keyboard.press('Escape')
 tone=page.get_by_role('spinbutton',name='选择音色',exact=True);tone.hover();page.mouse.wheel(0,120)
 page.wait_for_function("window.__SKY_STUDIO_TEST__.state.project.playback.instrument==='offline-harp'")
 assert tone.get_attribute('aria-valuenow')=='2' and '竖琴' in tone.get_attribute('aria-valuetext')
 tone.press('Home');page.wait_for_function("window.__SKY_STUDIO_TEST__.state.project.playback.instrument==='offline'")
 volume=page.get_by_role('spinbutton',name='音量',exact=True);volume.press('ArrowUp');assert '音量 26' in page.locator('#toast').inner_text()
 assert volume.get_attribute('aria-valuenow')=='26'
 page.locator('#loopOneBtn').click();assert page.locator('#loopOneBtn').get_attribute('aria-pressed')=='true' and page.evaluate('window.__SKY_STUDIO_TEST__.state.project.playback.loop')
 assert '开启单曲循环' in page.locator('#toast').inner_text()
 # A short in-memory score verifies real clock rollover and repeated note-on particles.
 page.evaluate("""()=>{const t=window.__SKY_STUDIO_TEST__,s=t.state;s.project.score.events=[{timeMs:0,notes:[1,3],durationMs:90,velocity:70},{timeMs:180,notes:[1],durationMs:90,velocity:70},{timeMs:360,notes:[5],durationMs:90,velocity:70}];s.project.durationMs=600;s.project.score.gridIntervalMs=180;s.beatLayoutCache=null;t.openSong(s.project.id);window.feedbackCount=0;new MutationObserver(rs=>{for(const r of rs)window.feedbackCount+=r.addedNodes.length}).observe(document.getElementById('keyFeedbackLayer'),{childList:true});window.loopPositions=[];window.trackLoop=true;function tick(){window.loopPositions.push(s.position);if(window.trackLoop)requestAnimationFrame(tick)}requestAnimationFrame(tick)}""")
 page.locator('#playBtn').click();page.wait_for_function('window.__SKY_STUDIO_TEST__.state.isPlaying');page.wait_for_timeout(1550)
 loop=page.evaluate("({playing:window.__SKY_STUDIO_TEST__.state.isPlaying,drops:window.loopPositions.reduce((n,v,i,a)=>n+(i>0&&v<a[i-1]-100),0),particles:window.feedbackCount})")
 assert loop['playing'] and loop['drops']>=2 and loop['particles']>10,loop
 page.locator('#playBtn').click();page.evaluate('window.trackLoop=false');assert not page.evaluate('window.__SKY_STUDIO_TEST__.state.isPlaying')
 page.locator('#loopOneBtn').click();assert page.locator('#loopOneBtn').get_attribute('aria-pressed')=='false'
 page.locator('#restartBtn').click();assert page.evaluate('window.__SKY_STUDIO_TEST__.state.position')==0;assert page.locator('#toast').is_visible()
 page.locator('#playBtn').click();page.wait_for_function('window.__SKY_STUDIO_TEST__.state.isPlaying');page.wait_for_function('!window.__SKY_STUDIO_TEST__.state.isPlaying');assert page.evaluate('window.__SKY_STUDIO_TEST__.state.position')==600
 # Capsules share one width/height and rounded ends across active and empty reference dots.
 capsules=page.locator('#beatGrid .mini-dot').evaluate_all("es=>es.map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return [r.width,r.height,s.borderRadius]})")
 assert len({tuple(x) for x in capsules})==1 and capsules[0][0]>capsules[0][1] and float(capsules[0][2].replace('px',''))>=capsules[0][1]/2,capsules[:4]
 # Restore the original score from a fresh context for layout and persistence checks.
 page.close();page=b.new_page(viewport={'width':1366,'height':900});page.on('pageerror',lambda e:errors.append(str(e)));page.goto(url);page.locator('.card-play').first.click();page.wait_for_function("document.getElementById('songEntryTransition').hidden")
 page.locator('#loopOneBtn').click();page.reload();page.locator('.card-play').first.click();page.wait_for_function("document.getElementById('songEntryTransition').hidden");assert page.locator('#loopOneBtn').get_attribute('aria-pressed')=='true'
 page.locator('#restartBtn').click()
 layouts=[]
 for w,h in [(1920,1080),(1366,900),(1366,768),(1100,768),(1024,768),(768,900),(390,844)]:
  page.set_viewport_size({'width':w,'height':h});page.wait_for_timeout(100)
  result=page.evaluate("""()=>{const rect=e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height}};const bar=document.querySelector('.play-controls'),r=rect(bar),items=[...document.querySelectorAll('#playerView .header-actions>button')].map(rect),controls=[...document.querySelectorAll('.player-control-row>div')].map(rect),visual=['playBtn','restartBtn','loopOneBtn','keyRangeToggle','speedToggle'].map(id=>rect(document.getElementById(id)));for(const id of ['instrumentPicker','sustainPicker','volumePicker']){const e=document.getElementById(id),value=e.value,n=id==='instrumentPicker'?Number(e.getAttribute('aria-valuenow'))-1:100-Number(value);visual.push(rect(e.querySelectorAll('b')[n]))}return {items,visual,controls,bar:r,overflow:document.documentElement.scrollWidth>innerWidth}}""")
  assert not result['overflow'],(w,result)
  assert len({round(x['top'],1) for x in result['items']})==len({round(x['bottom'],1) for x in result['items']})==1,(w,result)
  assert all(abs(x['height']-34)<.1 for x in result['visual']),(w,result)
  for i,x in enumerate(result['controls']):
   for y in result['controls'][i+1:]:assert min(x['right'],y['right'])-max(x['left'],y['left'])<=1 or min(x['bottom'],y['bottom'])-max(x['top'],y['top'])<=1,(w,x,y)
  assert min(x['top'] for x in result['visual'])>=result['bar']['top']+5,(w,result)
  if w>900:assert max(x['top'] for x in result['visual'])-min(x['top'] for x in result['visual'])<1,(w,result)
  page.screenshot(path=str(out/f'controls-{w}-{h}.png'));layouts.append({'width':w,**result})
 page.locator('#speedToggle').click();assert page.locator('#toast').is_visible();page.keyboard.press('Escape')
 assert page.locator('#playerView button').evaluate_all("es=>es.every(e=>!/[▶Ⅱ↶⇩✎◐⌄⧉★☆‹›＋✧♬]/.test(e.textContent))")
 assert not errors,errors
 (out/'results.json').write_text(json.dumps({'passed':True,'stampTiming':timing,'loop':loop,'notices':notices,'capsule':capsules[0],'layouts':layouts,'errors':errors},ensure_ascii=False,indent=2),'utf-8');b.close();print('PASS synchronized arrival, capsules, wheel instruments, real repeat and particles, notices, SVG and aligned responsive controls')
