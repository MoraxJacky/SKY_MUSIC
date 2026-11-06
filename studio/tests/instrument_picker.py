"""Single-cell shared instrument strip: circular navigation, playback resume, persistence and geometry."""
import argparse,json
from pathlib import Path
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);out=p.parse_args().output.resolve();out.mkdir(parents=True,exist_ok=False);root=Path(__file__).resolve().parents[1]
with sync_playwright() as pw:
 b=pw.chromium.launch(channel='msedge',headless=True);records=[]
 for width in [1366,768,375]:
  page=b.new_page(viewport={'width':width,'height':900},reduced_motion='reduce');errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto((root/'SkyMusicStudio_Standalone.html').as_uri());page.locator('.card-play').first.click()
  tone=page.get_by_role('spinbutton',name='选择音色',exact=True);base=tone.bounding_box();assert tone.get_attribute('aria-valuenow')=='1'
  tone.hover();y=page.evaluate('scrollY');page.mouse.wheel(0,-120);page.wait_for_function("document.getElementById('instrumentPicker').getAttribute('aria-valuenow')==='11'");page.mouse.wheel(0,120);page.wait_for_function("document.getElementById('instrumentPicker').getAttribute('aria-valuenow')==='1'");tone.press('Home');assert tone.get_attribute('aria-valuenow')=='1' and page.evaluate('scrollY')==y
  assert base['width']==84 and tone.locator('b').evaluate_all('es=>es.every(e=>e.scrollWidth<=e.clientWidth)'),base
  page.mouse.wheel(0,120);page.wait_for_function("window.__SKY_STUDIO_TEST__.state.project.playback.instrument==='offline-harp'");assert tone.bounding_box()==base
  page.locator('#playBtn').click();page.wait_for_function('window.__SKY_STUDIO_TEST__.state.isPlaying');tone.press('ArrowDown');page.wait_for_function("window.__SKY_STUDIO_TEST__.state.isPlaying&&window.__SKY_STUDIO_TEST__.state.project.playback.instrument==='offline-music-box'")
  page.locator('#playBtn').click();assert not page.evaluate('window.__SKY_STUDIO_TEST__.state.isPlaying')
  # Boundary previews must not load every online bank traversed during the wheel movement.
  page.route('https://**/*',lambda route:route.abort());bounds=tone.evaluate("e=>['End','ArrowDown','Home','ArrowUp','Home'].map(key=>{e.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));return e.getAttribute('aria-valuenow')})");assert bounds==['11','1','1','11','1'],bounds
  page.wait_for_function("window.__SKY_STUDIO_TEST__.state.project.playback.instrument==='offline'");tone.press('ArrowDown');page.wait_for_function("window.__SKY_STUDIO_TEST__.state.project.playback.instrument==='offline-harp'")
  page.screenshot(path=str(out/f'strip-{width}.png'));page.reload();page.locator('.card-play').first.click();assert tone.get_attribute('aria-valuenow')=='2' and '竖琴' in tone.get_attribute('aria-valuetext');assert page.locator('#instrumentSelect').input_value()=='offline-harp'
  assert not errors,errors;records.append({'width':width,'circularWheelKeyboard':True,'fixedFrame':True,'playbackResume':True,'persistence':True});page.close()
 b.close()
(out/'results.json').write_text(json.dumps({'passed':True,'checks':records},ensure_ascii=False,indent=2),'utf-8');print('PASS one-cell instrument strip, wheel/keyboard circular navigation, playback resume and persistence at three widths')
