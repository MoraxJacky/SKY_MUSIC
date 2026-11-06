"""Theme-aware white focus glow across home, dialogs, preview and all six player themes."""
import argparse,json
from pathlib import Path
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);p.add_argument('--url');a=p.parse_args();out=a.output.resolve();out.mkdir(parents=True,exist_ok=False);root=Path(__file__).resolve().parents[1]
records=[]
with sync_playwright() as pw:
 b=pw.chromium.launch(channel='msedge',headless=True);page=b.new_page(viewport={'width':1375,'height':884},reduced_motion='reduce');errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(a.url or (root/'SkyMusicStudio_Standalone.html').as_uri())
 def check(id):
  el=page.locator('#'+id);el.focus();page.wait_for_timeout(220)
  result=el.evaluate("e=>{const s=getComputedStyle(e);return {id:e.id,border:s.borderColor,outline:s.outlineColor,width:parseFloat(s.outlineWidth),shadow:s.boxShadow,accent:getComputedStyle(document.body).getPropertyValue('--control-focus-accent').trim(),focused:document.activeElement===e}}")
  assert result['focused'] and result['width']>=1 and result['shadow']!='none',result
  assert result['outline'] not in ['rgb(233, 204, 139)','rgb(228, 197, 139)'],result
  assert '255, 255, 255' in result['shadow'],result
  records.append(result);return result
 home=check('songSearch');page.locator('#libraryFilterToggle').focus();page.screenshot(path=str(out/'home-focus.png'))
 page.locator('#newSongBtn').click();check('createTitle');check('createDuration');page.keyboard.press('Escape')
 page.locator('.theme-preview-open[data-preview-theme=christmas]').filter(visible=True).first.click();check('homePreviewName');check('homePreviewMotion');page.screenshot(path=str(out/'theme-preview-focus.png'));page.keyboard.press('Escape')
 before=page.locator('#toast').inner_text();check('songSearch');assert page.locator('#toast').inner_text()==before
 themes=[]
 for theme in ['christmas','starlight','citylights','prairie','rainforest','vault']:
  page.evaluate("id=>{const t=window.__SKY_STUDIO_TEST__;t.goHome();const p=t.state.library[0],d=t.THEME_DEFINITIONS[id];p.theme={id,...d.defaults,...d.initialOverrides};t.openSong(p.id)}",theme)
  baseline=page.evaluate('JSON.stringify(window.__SKY_STUDIO_TEST__.state.project.score)')
  control=check('rollWindow');page.locator('#songInfoBtn').click();check('metaTitle');page.keyboard.press('Escape');page.locator('#scoreEditorBtn').click();page.locator('#consoleFineTab').click();check('eventTime');check('eventDuration');page.locator('#consoleGenerateTab').click();check('consoleNumberScore');check('consoleGenerateInterval')
  if theme in ['christmas','rainforest']:page.screenshot(path=str(out/(theme+'-console-focus.png')))
  assert page.evaluate('JSON.stringify(window.__SKY_STUDIO_TEST__.state.project.score)')==baseline
  page.locator('#consoleClose').click();page.locator('#discardChanges').click();themes.append({'theme':theme,'accent':control['accent'],'outline':control['outline']})
 assert len({t['outline'] for t in themes})>=3,themes
 page.locator('#backLibrary').click();assert check('songSearch')['accent']==home['accent']
 page.set_viewport_size({'width':390,'height':844});check('songSearch');assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path=str(out/'mobile-focus.png'));assert not errors,errors;b.close()
(out/'results.json').write_text(json.dumps({'passed':True,'fields':records,'themes':themes,'noScoreChanges':True,'errors':errors},ensure_ascii=False,indent=2),'utf-8');print('PASS white theme focus for home, platform dialogs, preview, player and editor fields in six themes; unchanged score and no extra notifications')
