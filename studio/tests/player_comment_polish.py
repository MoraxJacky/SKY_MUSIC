"""Compact cyclic instruments, bold vector buttons, unclipped editor surfaces and save choices."""
import argparse,json
from pathlib import Path
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);p.add_argument('--url');a=p.parse_args();out=a.output.resolve();out.mkdir(parents=True,exist_ok=False);root=Path(__file__).resolve().parents[1]
with sync_playwright() as pw:
 b=pw.chromium.launch(channel='msedge',headless=True);page=b.new_page(viewport={'width':1375,'height':884},reduced_motion='reduce');errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(a.url or (root/'SkyMusicStudio_Standalone.html').as_uri());page.locator('.card-play').first.click()
 for id in ['songInfoBtn','restartBtn','loopOneBtn']:
  assert page.locator('#'+id+' svg').count()==1 and page.locator('#'+id+' svg').get_attribute('stroke-width')=='2.5'
 assert page.locator('#songInfoBtn svg circle').count()==2
 page.locator('#songInfoBtn').click();assert page.locator('#metadataDialog').is_visible();page.keyboard.press('Escape')
 page.locator('#loopOneBtn').click();assert page.locator('#loopOneBtn').get_attribute('aria-pressed')=='true';page.locator('#loopOneBtn').click()
 gap=page.locator('#rollWindow').evaluate("e=>{const r=document.createRange();r.selectNodeContents(e.parentNode.firstChild);return e.getBoundingClientRect().left-r.getBoundingClientRect().right}");assert 5<=gap<=10,gap
 layouts=[]
 for w,h in [(1375,884),(1024,768),(390,844)]:
  page.set_viewport_size({'width':w,'height':h});page.wait_for_timeout(80);tone=page.locator('#instrumentPicker');assert tone.bounding_box()['width']==84
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path=str(out/f'player-{w}.png'));layouts.append({'width':w,'toneWidth':84})
 page.set_viewport_size({'width':1375,'height':884});page.locator('#scoreEditorBtn').click()
 modes=[]
 for tab in ['consoleRecordTab','consoleFineTab','consoleGenerateTab']:
  page.locator('#'+tab).click();shadows=page.locator('#consoleGridSlot>.pane,#consoleRollSlot>.pane').evaluate_all('es=>es.filter(e=>e.getBoundingClientRect().height>0).map(e=>getComputedStyle(e).boxShadow)');assert shadows and all(s=='none' for s in shadows),shadows
  page.screenshot(path=str(out/(tab+'.png')));modes.append(tab)
 page.locator('#consoleClose').click();assert page.locator('#saveChoiceDialog .save-options>button').evaluate_all('es=>es.map(e=>e.id)')==['saveDirect','discardChanges','saveAsNew']
 styles=page.locator('#saveDirect,#discardChanges').evaluate_all('es=>es.map(e=>{const s=getComputedStyle(e);return {border:s.border,background:s.background,height:e.getBoundingClientRect().height}})');assert styles[0]==styles[1],styles
 page.screenshot(path=str(out/'save-choices.png'));page.locator('#discardChanges').click();assert not page.locator('#scoreConsole').is_visible();assert not errors,errors;b.close()
(out/'results.json').write_text(json.dumps({'passed':True,'layouts':layouts,'windowLabelGap':gap,'editorTabs':modes,'saveButtonStyles':styles,'errors':errors},indent=2),'utf-8');print('PASS compact cyclic tone controls, bold SVG, label gap, shadow-free console panels and reordered save choices')
