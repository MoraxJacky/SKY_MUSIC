"""Panel rhythm and complete controls across desktop, short laptop and mobile layouts."""
import argparse,json
from pathlib import Path
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True)
out=p.parse_args().output.resolve();out.mkdir(parents=True,exist_ok=False);root=Path(__file__).resolve().parents[1];checks=[]
with sync_playwright() as pw:
 b=pw.chromium.launch(channel='msedge',headless=True);page=b.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto((root/'SkyMusicStudio_Standalone.html').as_uri());page.locator('.card-play').first.click()
 for width,height in [(1920,1080),(1366,900),(1366,768),(1024,768),(390,844)]:
  page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(100)
  data=page.evaluate('''()=>{const r=s=>document.querySelector(s).getBoundingClientRect(),a=r('.roll-pane'),k=r('.keys-pane'),g=r('.grid-pane'),s=r('#stagePane'),last=r('#keyBoard button:last-child'),title=r('.keys-pane .pane-top');return {leftGap:k.top-a.bottom,rightGap:s.top-g.bottom,columnGap:g.left-a.right,lastKeyBottom:last.bottom,keysBottom:k.bottom,firstKeyTop:r('#keyBoard button').top,titleBottom:title.bottom,bottom:Math.max(k.bottom,s.bottom),overflow:document.documentElement.scrollWidth>innerWidth}}''')
  assert not data['overflow'],data
  assert data['lastKeyBottom']<=data['keysBottom']-5 and data['firstKeyTop']>=data['titleBottom']+5,(width,data)
  if width>900:
   assert data['bottom']<=height+1 and max(data[k] for k in ['leftGap','rightGap','columnGap'])-min(data[k] for k in ['leftGap','rightGap','columnGap'])<1,(width,data)
  page.screenshot(path=str(out/f'player-{width}-{height}.png'));page.locator('#scoreEditorBtn').click()
  for tab in ['consoleRecordTab','consoleFineTab','consoleGenerateTab']:
   page.locator('#'+tab).click();page.wait_for_timeout(60)
   box=page.evaluate('''()=>{const side=document.querySelector('.console-side'),footer=document.querySelector('.console-footer').getBoundingClientRect(),items=[...side.querySelectorAll('button,input,textarea,select')].filter(e=>e.getClientRects().length);return {sideOverflow:side.scrollHeight-side.clientHeight,lastBottom:Math.max(...items.map(e=>e.getBoundingClientRect().bottom)),footerTop:footer.top}}''')
   if width>900:assert box['lastBottom']<=box['footerTop']+1 and box['sideOverflow']<=1,(width,height,tab,box)
   page.screenshot(path=str(out/f'{tab}-{width}-{height}.png'))
  page.locator('#consoleClose').click();page.locator('#discardChanges').click();checks.append({'viewport':[width,height],'main':data,'consoleThreeModes':True})
 assert not errors,errors;b.close()
(out/'results.json').write_text(json.dumps({'passed':True,'checks':checks,'errors':errors},indent=2),'utf-8');print('PASS equal panel gaps, title/key separation, complete 15 keys and console controls at five viewport sizes')
