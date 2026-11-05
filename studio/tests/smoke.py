from playwright.sync_api import sync_playwright
from pathlib import Path
root=Path(__file__).resolve().parents[1]
url='http://127.0.0.1:8765/index.html'
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--autoplay-policy=no-user-gesture-required','--disable-web-security','--no-sandbox'])
 for width,height in [(1366,768),(1920,1080),(1100,720)]:
  page=browser.new_page(viewport={'width':width,'height':height},accept_downloads=True)
  errors=[]
  page.on('pageerror',lambda e: errors.append(str(e)))
  page.goto(url,wait_until='load')
  print(width,height,'title',page.title(),'cards',page.locator('.song-card').count(),'errors',errors)
  page.screenshot(path=str(root/f'tests/library_{width}.png'))
  page.locator('.card-play').first.click()
  page.wait_for_timeout(800)
  print('  score',page.locator('.beat').count(),'keys',page.locator('.key-tile').count(),'canvas',page.locator('#rollCanvas').evaluate('(x)=>[x.width,x.height]'))
  page.screenshot(path=str(root/f'tests/player_{width}.png'))
  print('  pane rects',page.locator('.roll-pane').bounding_box(),page.locator('.grid-pane').bounding_box())
  page.locator('#playBtn').click()
  page.wait_for_timeout(1200)
  print('  playing clock',page.locator('#timeClock').inner_text(),'status',page.locator('#stageStatus').inner_text(),'errors',errors[:3])
  page.screenshot(path=str(root/f'tests/playing_{width}.png'))
  page.locator('#playBtn').click()
  page.wait_for_timeout(300)
  print('  paused',page.locator('#timeClock').inner_text(), 'errors',errors[:5])
  if width==1366:
   page.locator('#exportProject').click()
   # download catch separate test
   page.locator('#themeToggle').click()
   print('  new theme',page.locator('#themeToggle').inner_text())
   page.screenshot(path=str(root/'tests/starlight_toggle.png'))
  page.close()
 browser.close()
