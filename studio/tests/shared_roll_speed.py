"""Shared final-window geometry across all themes and stable three-row speed hit area."""
import argparse,json
from pathlib import Path
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);p.add_argument('--url');a=p.parse_args();out=a.output.resolve();out.mkdir(parents=True,exist_ok=False);root=Path(__file__).resolve().parents[1]
with sync_playwright() as pw:
 b=pw.chromium.launch(channel='msedge',headless=True);page=b.new_page(viewport={'width':1375,'height':884},reduced_motion='reduce');errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(a.url or (root/'SkyMusicStudio_Standalone.html').as_uri());records=[]
 ids=page.evaluate('window.__SKY_STUDIO_TEST__.state.library.map(p=>p.id)')
 for id in ids:
  page.evaluate('id=>window.__SKY_STUDIO_TEST__.openSong(id)',id)
  original=page.evaluate('JSON.stringify(window.__SKY_STUDIO_TEST__.state.project.score)')
  for seconds in [8,10,12,20]:
   page.locator('#rollWindow').select_option(str(seconds))
   record=page.evaluate('''seconds=>{const t=window.__SKY_STUDIO_TEST__,s=t.state,d=s.project.durationMs,span=Math.min(d,seconds*1000),last=Math.max(0,d-span),frames=[];s.rollFinish=null;s.rollPageStart=0;
    // Normal forward playback, including entry into the remainder page.
    for(let pos=0;pos<d;pos+=137){s.position=pos;const f=t.rollFrame();if(f.windowMs!==span||f.end>d+.001)throw Error('Forward scale changed');if(f.begin>=last&&Math.abs(f.begin-last)>.001)throw Error('Tail moved')}
    s.position=d;frames.push({source:'forwardEnd',...t.rollFrame()});
    for(const sliderId of ['seekSlider','rollSeekSlider'])for(const pos of (sliderId==='seekSlider'?[d,d-1,d]:[d,d-1,d-span*.25,d])){const el=document.getElementById(sliderId);el.value=pos;el.dispatchEvent(new Event('input',{bubbles:true}));frames.push({source:sliderId,...t.rollFrame()})}
    return {id:s.project.id,theme:s.project.theme.id,seconds,duration:d,span,last,frames};}''',seconds)
   for f in record['frames']:
    assert abs(f['windowMs']-record['span'])<.001 and abs(f['begin']-record['last'])<.001 and abs(f['end']-record['duration'])<.001,record
   records.append(record)
  # End naturally using the global timeline, not the previously-fixed roll slider.
  duration=record['duration'];page.locator('#rollWindow').select_option('12');page.locator('#seekSlider').fill(str(int(duration-350)));page.locator('#playBtn').click();page.wait_for_function('window.__SKY_STUDIO_TEST__.state.rollFinish!==null');f=page.evaluate('window.__SKY_STUDIO_TEST__.rollFrame()');assert f['end']==duration and f['windowMs']==min(duration,12000) and f['phase']==f['windowMs'],f
  assert page.evaluate('JSON.stringify(window.__SKY_STUDIO_TEST__.state.project.score)')==original
  if id=='prairie-demo':page.screenshot(path=str(out/'prairie-final-window.png'))
 # Stationary pointer stays inside the final lower option for both wheel directions.
 speeds=[]
 for width in [1375,768,390]:
  page.set_viewport_size({'width':width,'height':884});page.locator('#speedToggle').click();menu=page.locator('#speedMenu');initial=menu.bounding_box();page.mouse.move(initial['x']+initial['width']/2,initial['y']+initial['height']-10)
  for _ in range(24):page.mouse.wheel(0,120);page.wait_for_timeout(40)
  page.wait_for_timeout(350);final=menu.bounding_box();assert abs(initial['height']-final['height'])<.01 and abs(initial['y']-final['y'])<.01,(initial,final)
  visible=page.locator('#speedOptions button:visible');assert visible.count()==3 and visible.last.get_attribute('data-speed')=='2',visible.count()
  at_end=float(menu.get_attribute('data-position'));assert at_end>=6.99,at_end
  page.mouse.wheel(0,-120);page.wait_for_timeout(350);assert float(menu.get_attribute('data-position'))<at_end
  page.screenshot(path=str(out/f'speed-stable-{width}.png'));speeds.append({'width':width,'height':final['height'],'lastVisibleRows':3,'samePointerReverses':True});page.keyboard.press('Escape')
 assert not errors,errors;b.close()
(out/'results.json').write_text(json.dumps({'passed':True,'frames':records,'speed':speeds,'errors':errors},ensure_ascii=False,indent=2),'utf-8');print('PASS six themes × four windows: fixed final frame from playback/global seek/roll seek; natural end; stationary-pointer three-row speed menu')
