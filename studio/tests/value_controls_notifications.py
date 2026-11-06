"""Wheel hit areas, single-cell controls, shared themed notices and note contrast."""
import argparse,json,math
from pathlib import Path
from playwright.sync_api import sync_playwright

p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True)
out=p.parse_args().output.resolve();out.mkdir(parents=True,exist_ok=False)
root=Path(__file__).resolve().parents[1]
with sync_playwright() as pw:
 b=pw.chromium.launch(channel='msedge',headless=True)
 page=b.new_page(viewport={'width':1366,'height':900});errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto((root/'SkyMusicStudio_Standalone.html').as_uri());page.locator('.card-play').first.click()
 assert page.locator('#volumeSlider,#sustainSlider,#volumeValue,#sustainValue').count()==0
 wheel=[]
 for kind in ['volume','sustain']:
  cell=page.locator('#'+kind+'Picker');before=int(cell.get_attribute('aria-valuenow'));cell.hover()
  page.mouse.wheel(0,-100);page.wait_for_timeout(650)
  after=int(cell.get_attribute('aria-valuenow'));assert after==before+1,(kind,before,after)
  assert cell.evaluate("e=>Math.abs(parseFloat(getComputedStyle(e.querySelector('.value-picker-track')).transform.split(',')[5])%36)<.01")
  cell.press('End');cell.hover();page.mouse.wheel(0,-120);page.wait_for_timeout(400);assert cell.get_attribute('aria-valuenow')=='100'
  cell.press('Home');page.mouse.wheel(0,120);page.wait_for_timeout(400);assert cell.get_attribute('aria-valuenow')=='0'
  assert cell.evaluate("e=>{const s=getComputedStyle(e);return s.borderTopWidth==='0px'&&s.backgroundColor==='rgba(0, 0, 0, 0)'&&s.maskImage.includes('linear-gradient')}")
  assert cell.locator('b').first.bounding_box()['height']==32
  cell.press('ArrowUp');assert cell.get_attribute('aria-valuenow')=='1'
  wheel.append({'control':kind,'up':after-before,'bounded':True,'visibleCells':1})
 page.locator('#songTitle').click();page.mouse.move(5,5);page.wait_for_timeout(220)
 # Play, key range, instrument and the numeric cells share the same actual height.
 styles=page.evaluate("['playBtn','keyRangeToggle','instrumentToggle','volumePicker','sustainPicker'].map(id=>{const host=document.getElementById(id),e=host.matches('.value-picker')?host.querySelector('b'):host,s=getComputedStyle(e);return {id,height:e.getBoundingClientRect().height,paint:s.backgroundImage,color:s.color,border:s.borderColor}})")
 assert all(s['height']==32 for s in styles),styles
 assert len({(s['paint'],s['color'],s['border']) for s in styles if s['id'] in ['playBtn','keyRangeToggle']})==1,styles
 assert len({(s['paint'],s['color'],s['border']) for s in styles if s['id'] in ['volumePicker','sustainPicker']})==1,styles
 assert styles[0]['paint']!=styles[-1]['paint']
 # The speed tail contains two real rows and accepts reverse wheel at the same pointer.
 page.locator('#speedToggle').click();page.keyboard.press('End')
 assert page.locator('#speedOptions button:visible').count()==2
 page.keyboard.press('Enter');page.locator('#speedToggle').click()
 menu=page.locator('#speedMenu');rect=menu.bounding_box();page.mouse.move(rect['x']+rect['width']/2,rect['y']+rect['height']*.75)
 old=float(menu.get_attribute('data-position'));page.mouse.wheel(0,-120);page.wait_for_timeout(650)
 assert float(menu.get_attribute('data-position'))<old
 page.keyboard.press('Escape')
 # Entering the modal posts a shared status in the top layer without taking focus.
 page.locator('#scoreEditorBtn').click();notice=page.locator('#toast')
 assert notice.is_visible() and notice.evaluate("e=>e.matches(':popover-open')")
 assert page.evaluate("document.getElementById('scoreConsole').contains(document.activeElement)")
 page.locator('#consoleFineTab').click();page.locator('#sceneEditorBtn').click()
 themes=[]
 for theme in ['christmas','starlight','citylights','prairie','rainforest','vault']:
  page.locator('[data-scene="'+theme+'"]').click();assert notice.get_attribute('data-theme')==theme
  result=notice.evaluate("e=>({theme:e.dataset.theme,text:e.textContent,color:getComputedStyle(e).color,paint:getComputedStyle(e).backgroundImage,top:e.matches(':popover-open')})")
  assert result['top'];themes.append(result)
 assert len({t['paint'] for t in themes})==6
 # Repaint an already visible status without posting a new one or touching music data.
 repaint=page.evaluate("""()=>{const t=window.__SKY_STUDIO_TEST__,s=t.state,e=document.getElementById('toast'),text=e.textContent,before=JSON.stringify([s.project.score,s.project.playback,s.position,s.rollPageStart]),d=t.THEME_DEFINITIONS.christmas;s.project.theme={id:d.id,...d.defaults,...d.initialOverrides};t.applyPlayerTemplate(s.project,document.getElementById('playerView'));return {textSame:e.textContent===text,musicSame:before===JSON.stringify([s.project.score,s.project.playback,s.position,s.rollPageStart]),theme:e.dataset.theme,colors:d.appearance,rows:d.rollPalette}}""")
 assert repaint['textSame'] and repaint['musicSame'] and repaint['theme']=='christmas'
 page.locator('#sceneDialog [data-close="sceneDialog"]').click();page.locator('#consoleClose').click();page.locator('#discardChanges').click()
 page.screenshot(path=str(out/'christmas-controls.png'))
 # A shorter old notification timer must not hide the replacement.
 page.evaluate('window.__SKY_STUDIO_TEST__.goHome()');page.wait_for_timeout(150)
 page.evaluate('window.__SKY_STUDIO_TEST__.duplicateSong(window.__SKY_STUDIO_TEST__.state.library[0].id)')
 page.wait_for_timeout(1100);assert notice.is_visible() and notice.get_attribute('data-theme')=='platform'
 page.wait_for_timeout(2600);assert notice.is_hidden()
 # Theme preview colors the same notice, while keeping the library independent.
 before=page.evaluate('JSON.stringify(window.__SKY_STUDIO_TEST__.state.library)')
 page.locator('#homeThemeDots button').first.click();page.wait_for_timeout(750)
 page.locator('.home-theme-slide:not([data-clone])[data-theme="christmas"] .theme-preview-open').click()
 preview_theme=page.locator('#homeThemeSample').get_attribute('data-theme')
 assert notice.get_attribute('data-theme')==preview_theme
 page.locator('#homePreviewAccent').evaluate("e=>{e.value='#aabbcc';e.dispatchEvent(new Event('input',{bubbles:true}))}")
 assert notice.evaluate("e=>e.style.getPropertyValue('--notice-accent')")=='#aabbcc'
 page.locator('#homeThemeDialog [data-close="homeThemeDialog"]').click()
 assert notice.get_attribute('data-theme')=='platform'
 assert page.evaluate('JSON.stringify(window.__SKY_STUDIO_TEST__.state.library)')==before
 def luminance(h):
  a=[int(h[i:i+2],16)/255 for i in [1,3,5]]
  a=[x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in a]
  return sum(x*y for x,y in zip(a,[.2126,.7152,.0722]))
 contrasts={}
 for note in ['note','chord','poly']:
  contrasts[note]=min((luminance(repaint['colors'][note])+.05)/(luminance(repaint['rows'][row])+.05) for row in ['light','medium','dark'])
  assert contrasts[note]>=4.5,(note,contrasts)
 assert not errors,errors
 (out/'results.json').write_text(json.dumps({'passed':True,'wheel':wheel,'styles':styles,'themes':themes,'contrastRatios':contrasts,'outputIncreaseDb':20*math.log10(10/8),'musicIndependent':True,'speedTailWheel':True,'noticeReplacementTimer':True,'errors':errors},ensure_ascii=False,indent=2),'utf-8')
 print('PASS bounded smooth single cells, speed tail wheel, six themed top-layer notices, replacement timers, control geometry and Christmas note contrast')
 b.close()
