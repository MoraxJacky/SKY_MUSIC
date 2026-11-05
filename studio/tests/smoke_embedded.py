from pathlib import Path
import re,base64,time
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1];app=root/'app'
html=(app/'index.html').read_text()
css=(app/'styles.css').read_text();html=html.replace('<link rel="stylesheet" href="styles.css">','<style>'+css+'</style>')
for m in list(re.finditer(r'<script src="([^"]+)"></script>',html)):
 src=m.group(1);script=(app/src).read_text()
 html=html.replace(m.group(0),'<script>'+script.replace('</script>','<\\/script>')+'</script>')
stages=[]
for i in range(24):
 b=(app/f'assets/christmas/stage_{i:02d}.webp').read_bytes();stages.append('data:image/webp;base64,'+base64.b64encode(b).decode())
injected='<script>window.SKY_STAGE_FRAMES='+str(stages).replace("'",'"')+';</script>'
html=html.replace('<script>'+ (app/'js/studio.js').read_text().replace('</script>','<\\/script>')+'</script>',injected+'<script>'+ (app/'js/studio.js').read_text().replace('</script>','<\\/script>')+'</script>')
for f in ['stage_00.webp','snowflake.webp']:
 b=(app/f'assets/christmas/{f}').read_bytes();html=html.replace('assets/christmas/'+f,'data:image/webp;base64,'+base64.b64encode(b).decode())
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-gpu','--autoplay-policy=no-user-gesture-required'])
 for w,h in [(1366,768),(1920,1080),(1100,720)]:
  pg=browser.new_page(viewport={'width':w,'height':h},accept_downloads=True)
  errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
  pg.set_content(html,wait_until='load',timeout=40000)
  pg.wait_for_timeout(400)
  print('HOME',w,h,'cards',pg.locator('.song-card').count(),'errors',errors[:3])
  pg.screenshot(path=str(root/f'tests/library_{w}.png'))
  pg.locator('.card-play').first.click();pg.wait_for_timeout(400)
  print('PLAYER',w,h,'cells',pg.locator('.beat').count(),'keys',pg.locator('.key-tile').count(),'title',pg.locator('#songTitle').inner_text(),'errors',errors[:3])
  pg.screenshot(path=str(root/f'tests/player_{w}.png'))
  if w==1366:
   with pg.expect_download(timeout=20000) as di:pg.locator('#exportProject').click()
   download=di.value;dpath=root/'tests/exported_canon.skymusic';download.save_as(dpath)
   print('DOWNLOAD',download.suggested_filename,'size',dpath.stat().st_size)
   pg.locator('#themeToggle').click();print('theme',pg.locator('#themeToggle').inner_text());pg.screenshot(path=str(root/'tests/alternate_theme.png'))
   pg.locator('#themeToggle').click()
   pg.locator('[data-tuning="G"]').click();print('G-key',pg.locator('.key-tile').first.inner_text())
   pg.locator('[data-tuning="sky"]').click()
  pg.locator('#playBtn').click();pg.wait_for_timeout(1600)
  print('PLAY',w,'time',pg.locator('#timeClock').inner_text(),'state',pg.evaluate('window.__SKY_STUDIO_TEST__?.state.isPlaying'), 'errors',errors[:3]);pg.screenshot(path=str(root/f'tests/playing_{w}.png'))
  pg.locator('#playBtn').click();pg.wait_for_timeout(100)
  print('PAUSED',w,pg.locator('#timeClock').inner_text())
  pg.close()
 browser.close()
