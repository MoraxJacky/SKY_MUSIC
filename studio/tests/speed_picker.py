"""Shared speed/instrument picker, real rate switching, persistence and narrow layouts."""
import argparse,json
from pathlib import Path
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);out=p.parse_args().output.resolve();out.mkdir(parents=True,exist_ok=False);root=Path(__file__).resolve().parents[1]
with sync_playwright() as pw:
 b=pw.chromium.launch(channel='msedge',headless=True);records=[]
 for width in [1366,768,375]:
  page=b.new_page(viewport={'width':width,'height':900});errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto((root/'SkyMusicStudio_Standalone.html').as_uri());page.locator('.card-play').first.click();assert page.locator('#speedValue').inner_text()=='1.00×'
  baseline=page.locator('#speedToggle').bounding_box();page.get_by_role('button',name='选择倍速',exact=True).click();assert page.locator('#speedCurrent').bounding_box()==baseline;assert page.locator('#speedMenu').bounding_box()['y']==baseline['y'];assert page.locator('#speedOptions button:visible').count()==3;assert page.locator('#speedOptions [aria-selected=true]').get_attribute('data-speed')=='1';page.screenshot(path=str(out/f'speed-{width}.png'))
  page.locator('#speedMenu').hover();page.mouse.wheel(0,120);page.wait_for_timeout(550);assert page.locator('#speedCurrent').bounding_box()==baseline;assert abs(float(page.locator('#speedMenu').get_attribute('data-position'))-round(float(page.locator('#speedMenu').get_attribute('data-position'))))<.001
  page.keyboard.press('End');page.keyboard.press('Enter');assert page.locator('#speedMenu').is_hidden();assert page.locator('#speedValue').inner_text()=='2.00×';assert page.evaluate('window.__SKY_STUDIO_TEST__.state.rate')==2
  page.locator('#speedToggle').click();page.keyboard.press('Home');page.keyboard.press('Enter');assert page.locator('#speedValue').inner_text()=='0.25×'
  page.locator('#speedToggle').click();page.locator('#instrumentToggle').click();assert page.locator('#speedMenu').is_hidden() and page.locator('#instrumentMenu').is_visible();page.locator('#speedToggle').click();assert page.locator('#instrumentMenu').is_hidden();page.locator('#keyRangeToggle').click();assert page.locator('#speedMenu').is_hidden();page.keyboard.press('Escape')
  page.locator('#playBtn').click();page.wait_for_function('window.__SKY_STUDIO_TEST__.state.isPlaying');page.wait_for_timeout(150);page.locator('#speedToggle').click();page.keyboard.press('End');page.keyboard.press('ArrowUp');page.keyboard.press('ArrowUp');page.keyboard.press('ArrowUp');page.keyboard.press('Enter');page.wait_for_function('window.__SKY_STUDIO_TEST__.state.isPlaying&&window.__SKY_STUDIO_TEST__.state.rate===1.25');assert page.locator('#speedValue').inner_text()=='1.25×';page.locator('#playBtn').click();page.reload();assert page.locator('#speedValue').inner_text()=='1.25×';assert page.locator('#speedSelect').input_value()=='1.25'
  page.locator('#speedToggle').click();page.keyboard.press('Escape');assert page.locator('#speedMenu').is_hidden();assert not errors,errors;records.append({'width':width,'downward':True,'keyboard':True,'wheel':True,'mutualExclusion':True,'playbackResume':True,'savedRate':True});page.close()
 b.close()
(out/'results.json').write_text(json.dumps({'passed':True,'checks':records},indent=2),'utf-8');print('PASS shared speed picker, 3 viewports, scroll/keyboard, mutual exclusion, playing-rate change and persistence')
