"""Precise edit history targets and stationary/quarter-position roll view policy."""
import argparse,json
from pathlib import Path
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);out=p.parse_args().output.resolve();out.mkdir(parents=True,exist_ok=False);root=Path(__file__).resolve().parents[1];results=[]
with sync_playwright() as pw:
 b=pw.chromium.launch(channel='msedge',headless=True)
 for seconds in [8,10,12,20]:
  page=b.new_page(viewport={'width':1366,'height':900});errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto((root/'SkyMusicStudio_Standalone.html').as_uri());page.locator('.card-play').first.click();page.locator('#scoreEditorBtn').click();page.locator('#consoleFineTab').click();page.locator('#rollWindow').select_option(str(seconds));w=seconds*1000
  page.evaluate('''w=>{const t=window.__SKY_STUDIO_TEST__,s=t.state;s.project.score.events=[.5,2.5,9.5].map(k=>({timeMs:k*w,notes:[5],durationMs:200,velocity:85}));s.project.durationMs=10*w;const slider=document.getElementById('seekSlider');slider.max=10*w;slider.value=2.5*w;slider.dispatchEvent(new Event('input'))}''',w)
  def frame():return page.evaluate('window.__SKY_STUDIO_TEST__.rollFrame()')
  def edit(time):page.locator('#eventTime').fill(str(int(time)));page.locator('#eventDuration').fill('200');page.locator('#eventApply').click()
  def check(time,begin):
   f=frame();assert abs(f['begin']-begin)<.1,(seconds,time,begin,f);assert abs(page.evaluate('window.__SKY_STUDIO_TEST__.state.position')-time)<.1
   assert page.evaluate('window.__SKY_STUDIO_TEST__.state.project.score.events[window.__SKY_STUDIO_TEST__.state.selected].timeMs')==time
  edit(5.5*w);page.locator('#consoleUndo').click();check(2.5*w,2.25*w);page.locator('#consoleRedo').click();check(5.5*w,5.25*w);page.locator('#consoleUndo').click();check(2.5*w,2.25*w)
  edit(2.6*w);page.locator('#consoleUndo').click();check(2.5*w,2.25*w);page.locator('#consoleRedo').click();check(2.6*w,2.25*w);page.locator('#consoleUndo').click()
  edit(.75*w);page.locator('#consoleUndo').click();check(2.5*w,2.25*w);page.locator('#consoleRedo').click();check(.75*w,0);page.locator('#consoleUndo').click()
  edit(9.75*w);page.locator('#consoleUndo').click();check(2.5*w,2.25*w);page.locator('#consoleRedo').click();check(9.75*w,9*w);page.locator('#consoleUndo').click()
  before=frame()['begin'];page.locator('#resetKeyEdit').click();assert frame()['begin']==before;page.locator('#consoleUndo').click();check(2.5*w,2.25*w);assert not errors,errors
  page.screenshot(path=str(out/f'quarter-{seconds}.png'));results.append({'window':seconds,'samePageStationary':True,'middleQuarter':True,'firstPage':True,'lastPage':True,'restoreStationary':True,'duplicatePitchExactTarget':True});page.close()
 b.close()
(out/'results.json').write_text(json.dumps({'passed':True,'checks':results},indent=2),'utf-8');print('PASS history target identity, stationary same-page views, quarter placement across pages, first/last-page rules and restore: 4 windows')
