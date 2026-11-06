"""Inline circular range strip: layout, endless wheel/drag, keyboard and edit transaction."""
import argparse,json
from pathlib import Path
from playwright.sync_api import sync_playwright

p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True)
out=p.parse_args().output.resolve();out.mkdir(parents=True,exist_ok=False)
root=Path(__file__).resolve().parents[1];checks=[]
with sync_playwright() as pw:
 b=pw.chromium.launch(channel='msedge',headless=True)
 for width,height in [(1366,900),(1366,680),(390,844)]:
  page=b.new_page(viewport={'width':width,'height':height});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto((root/'SkyMusicStudio_Standalone.html').as_uri());page.locator('.card-play').first.click();page.locator('#scoreEditorBtn').click()
  trigger=page.locator('#consoleRangeToggle');menu=page.locator('#consoleRangeMenu')
  assert page.locator('#consoleTuning').is_hidden()
  assert '音域' not in page.locator('.console-transport').inner_text()
  for tab in ['consoleRecordTab','consoleFineTab','consoleGenerateTab']:
   page.locator('#'+tab).click();trigger.scroll_into_view_if_needed();closed=trigger.bounding_box();holder=page.locator('.console-range-control').bounding_box()
   trigger.click();assert trigger.is_hidden() and menu.is_visible()
   opened=menu.bounding_box();after=page.locator('.console-range-control').bounding_box()
   assert holder==after and abs(opened['x']+opened['width']/2-closed['x']-closed['width']/2)<1
   assert opened['width']<=272 and opened['width']>=230
   assert page.locator('#consoleRangeTrack [data-key]').count()==13
   assert page.locator('#consoleRangeTrack [aria-selected=true]').get_attribute('data-key')=='C'
   page.keyboard.press('End');page.keyboard.press('ArrowRight');assert page.evaluate('document.activeElement.dataset.key')=='sky-original'
   page.keyboard.press('ArrowLeft');assert page.evaluate('document.activeElement.dataset.key')=='B'
   page.keyboard.press('Escape');assert menu.is_hidden() and page.locator('#scoreConsole').is_visible() and page.locator('#saveChoiceDialog').is_hidden()
   trigger.click();page.keyboard.press('Home');page.keyboard.press('ArrowLeft');assert page.evaluate('document.activeElement.dataset.key')=='B';page.keyboard.press('Enter')
   assert menu.is_hidden() and trigger.is_visible() and page.locator('#consoleRangeValue').inner_text()=='B 大调'
   assert page.evaluate('window.__SKY_STUDIO_TEST__.state.tuning')=='B'
   trigger.click();page.keyboard.press('Home');page.keyboard.press('ArrowRight');page.keyboard.press('Enter');assert page.locator('#consoleRangeValue').inner_text()=='C 大调'
  trigger.click();menu.hover();before=float(menu.get_attribute('data-position'))
  for _ in range(65):page.mouse.wheel(0,120);page.wait_for_timeout(8)
  page.wait_for_timeout(400);forward=float(menu.get_attribute('data-position'));assert forward-before>26,(before,forward)
  for _ in range(130):page.mouse.wheel(0,-120);page.wait_for_timeout(8)
  page.wait_for_timeout(400);backward=float(menu.get_attribute('data-position'));assert backward-forward < -52,(forward,backward)
  visible=menu.evaluate('''e=>{const r=e.getBoundingClientRect();return [...e.querySelectorAll('button')].map(b=>({key:b.dataset.key,r:b.getBoundingClientRect()})).filter(b=>b.r.right>r.left+16&&b.r.left<r.right-16).sort((a,b)=>a.r.left-b.r.left).map(b=>b.key)}''')
  keys=['sky-original','C','Db','D','Eb','E','F','Fs','G','Ab','A','Bb','B'];assert 5<=len(visible)<=6
  assert all(keys[(keys.index(a)+1)%13]==c for a,c in zip(visible,visible[1:])),visible
  r=menu.bounding_box();x=r['x']+r['width']/2;y=r['y']+r['height']/2;page.mouse.move(x,y);page.mouse.down();page.mouse.move(x-95,y,steps=8);page.mouse.up();assert menu.is_visible();assert float(menu.get_attribute('data-position'))>backward+1
  page.screenshot(path=str(out/f'open-{width}-{height}.png'))
  # Selection uses the working copy. Dismissal and tab changes close the strip.
  page.keyboard.press('Home');page.keyboard.press('ArrowRight');page.keyboard.press('ArrowRight');page.keyboard.press('Enter');assert page.locator('#consoleRangeValue').inner_text()=='D♭ 大调'
  page.locator('#consoleClose').click();page.locator('#discardChanges').click();assert page.locator('#keyRangeValue').inner_text()=='C 大调'
  page.locator('#scoreEditorBtn').click();trigger.click();page.keyboard.press('End');page.keyboard.press('Enter');page.locator('#consoleClose').click();page.locator('#saveDirect').click();assert page.locator('#keyRangeValue').inner_text()=='B 大调'
  page.locator('#scoreEditorBtn').click();trigger.click();page.locator('#consoleFineTab').click();assert menu.is_hidden();page.locator('#consoleClose').click();page.locator('#discardChanges').click()
  assert not errors,errors;checks.append({'viewport':[width,height],'threeTabs':True,'inPlace':True,'wheelMultipleCycles':True,'reverseCycles':True,'drag':True,'keyboardWrap':True,'escape':True,'saveDiscard':True,'visibleOrder':visible});page.close()
 b.close()
(out/'results.json').write_text(json.dumps({'passed':True,'checks':checks},ensure_ascii=False,indent=2),'utf-8');print('PASS inline circular range in 3 console tabs / 3 viewports, multiple wheel cycles, drag, keyboard wrap, cancellation and save/discard')
