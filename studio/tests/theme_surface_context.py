"""Shared dialog surfaces and clearly separated note categories across all six themes."""
import argparse,json,math
from pathlib import Path
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);p.add_argument('--url');a=p.parse_args();out=a.output.resolve();out.mkdir(parents=True,exist_ok=False);root=Path(__file__).resolve().parents[1]
def rgb(hex):return [int(hex[i:i+2],16) for i in [1,3,5]]
def lum(hex):
 values=[x/255 for x in rgb(hex)];return sum((v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4)*w for v,w in zip(values,[.2126,.7152,.0722]))
def contrast(a,b):
 x,y=sorted([lum(a),lum(b)]);return (y+.05)/(x+.05)
records=[]
with sync_playwright() as pw:
 b=pw.chromium.launch(channel='msedge',headless=True);page=b.new_page(viewport={'width':1375,'height':884},reduced_motion='reduce');errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(a.url or (root/'SkyMusicStudio_Standalone.html').as_uri())
 for theme in ['christmas','starlight','citylights','prairie','rainforest','vault']:
  page.evaluate("id=>{const t=window.__SKY_STUDIO_TEST__;t.goHome();const p=t.state.library[0],d=t.THEME_DEFINITIONS[id];p.theme={id,...d.defaults,...d.initialOverrides};t.openSong(p.id)}",theme)
  score=page.evaluate('JSON.stringify(window.__SKY_STUDIO_TEST__.state.project.score)')
  colors=page.evaluate('window.__SKY_STUDIO_TEST__.state.playerColors');palette=page.evaluate('window.__SKY_STUDIO_TEST__.THEME_DEFINITIONS[window.__SKY_STUDIO_TEST__.state.project.theme.id].rollPalette')
  legend=page.locator('.roll-foot .dot').evaluate_all('es=>es.map(e=>getComputedStyle(e).backgroundColor)')
  categories=[colors[k] for k in ['note','chord','poly']];assert legend==['rgb('+', '.join(str(x) for x in rgb(c))+')' for c in categories],(theme,legend,categories)
  distances=[math.dist(rgb(categories[i]),rgb(categories[j])) for i in range(3) for j in range(i+1,3)];assert min(distances)>90,(theme,distances)
  contrasts=[contrast(c,palette[k]) for c in categories for k in ['light','medium','dark']];assert min(contrasts)>3,(theme,contrasts)
  page.locator('#exportProject').click();dialog=page.locator('#exportDialog');assert dialog.is_visible() and dialog.get_attribute('data-theme')==theme
  paint=dialog.evaluate("e=>{const s=getComputedStyle(e);return {background:s.backgroundImage,fill:s.backgroundColor,border:s.borderColor,text:s.color}}")
  gradient=page.evaluate('window.__SKY_STUDIO_TEST__.THEME_DEFINITIONS[window.__SKY_STUDIO_TEST__.state.project.theme.id].materials.surfaceGradient')
  for key in (['surfaceStart','surfaceEnd'] if gradient else ['surfaceEnd']):assert ', '.join(str(v) for v in rgb(colors[key])) in (paint['background'] if gradient else paint['fill']),(theme,paint)
  page.screenshot(path=str(out/(theme+'-export.png')));page.keyboard.press('Escape');page.locator('#songInfoBtn').click();assert page.locator('#metadataDialog').get_attribute('data-theme')==theme;page.keyboard.press('Escape')
  page.locator('#scoreEditorBtn').click();page.locator('#consoleClose').click();assert page.locator('#saveChoiceDialog').get_attribute('data-theme')==theme;page.locator('#discardChanges').click()
  assert page.evaluate('JSON.stringify(window.__SKY_STUDIO_TEST__.state.project.score)')==score
  page.screenshot(path=str(out/(theme+'-legend.png')));records.append({'theme':theme,'categories':categories,'minColorDistance':min(distances),'minContrast':min(contrasts),'dialog':paint})
 page.locator('#backLibrary').click();page.locator('[data-import]').first.click();assert page.locator('#importDialog').get_attribute('data-theme')=='platform';assert '#132a3b'==page.locator('#importDialog').evaluate("e=>getComputedStyle(e).getPropertyValue('--player-surface-start').trim()")
 page.keyboard.press('Escape');page.locator('#showGuide').click();assert 'context-dialog' not in page.locator('#helpDialog').get_attribute('class');assert not errors,errors;b.close()
(out/'results.json').write_text(json.dumps({'passed':True,'themes':records,'scoreUnchanged':True,'homeContextRestored':True,'errors':errors},ensure_ascii=False,indent=2),'utf-8');print('PASS six theme category separation/contrast, export/info/save dialog surfaces, unchanged score and homepage context reset')
