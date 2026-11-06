"""Real card-face motion, navigation reset, preparation/reveal and home materials."""
import argparse,json
from pathlib import Path
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);p.add_argument('--url')
a=p.parse_args();out=a.output.resolve();out.mkdir(parents=True,exist_ok=False)
root=Path(__file__).resolve().parents[1];url=a.url or (root/'SkyMusicStudio_Standalone.html').as_uri()
with sync_playwright() as pw:
 b=pw.chromium.launch(channel='msedge',headless=True);page=b.new_page(viewport={'width':1366,'height':900});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(url);page.mouse.move(0,0)
 layout=page.evaluate("""()=>{const header=document.querySelector('.home-top'),buttons=[...header.querySelectorAll('button')],svg=document.querySelector('.brand-emblem'),star=svg.querySelector('path').getBBox(),ring=svg.querySelector('circle').getBBox();return {top:header.getBoundingClientRect().top,buttons:buttons.map(e=>({label:e.textContent,height:e.getBoundingClientRect().height,background:getComputedStyle(e).backgroundImage,border:getComputedStyle(e).borderColor})),starCenter:[star.x+star.width/2,star.y+star.height/2],ringCenter:[ring.x+ring.width/2,ring.y+ring.height/2],stroke:svg.querySelector('circle').getAttribute('stroke-width')}}""")
 assert layout['top']>=16 and layout['starCenter']==layout['ringCenter']==[24,24] and float(layout['stroke'])>2
 assert [x['label'] for x in layout['buttons']]==['使用说明','主题仓库','＋ 新建空白乐曲','↥ 导入乐曲']
 assert {x['height'] for x in layout['buttons']}=={34}
 assert layout['buttons'][1]['border']==layout['buttons'][2]['border']
 # Actions remain the same after their visual restyling.
 page.locator('#showGuide').click();assert page.locator('#helpDialog').is_visible();page.keyboard.press('Escape')
 with page.expect_file_chooser():page.locator('#importThemeLibrary').click()
 page.locator('#newSongBtn').click();assert page.locator('#createDialog').is_visible();page.locator('[data-close="createDialog"]').first.click()
 page.locator('.home-top-actions [data-import]').click();assert page.locator('#importDialog').is_visible();page.locator('[data-close="importDialog"]').click()
 before=page.evaluate('JSON.stringify(window.__SKY_STUDIO_TEST__.state.library.map(s=>[s.id,s.score,s.playback,s.theme]))')
 card=page.locator('.light-cone').first
 assert card.locator('.cone-face .cone-edge').count()==2 and card.locator('.cone-face .cone-etch').count()==2
 material=card.evaluate("e=>({acrylic:getComputedStyle(e.querySelector('.song-details'),'::before').backgroundImage,blur:getComputedStyle(e.querySelector('.song-details'),'::before').backdropFilter,glass:getComputedStyle(e.querySelector('.card-play')).backgroundImage,glassBlur:getComputedStyle(e.querySelector('.card-play')).backdropFilter})")
 assert 'linear-gradient' in material['acrylic'] and 'blur' in material['blur'] and 'blur' in material['glassBlur']
 card.locator('.cone-flip-trigger').click();page.wait_for_timeout(125)
 assert card.evaluate('e=>e.classList.contains("is-turning")')
 assert card.locator('.cone-front .cone-edge').evaluate('e=>getComputedStyle(e).visibility')=='visible'
 pose=card.evaluate("e=>{const face=e.querySelector('.cone-front').getBoundingClientRect(),edge=e.querySelector('.cone-front .cone-edge').getBoundingClientRect();return {face:face.width,edge:edge.width,delta:Math.abs(face.left-edge.left)}}")
 assert abs(pose['face']-pose['edge'])<1 and pose['delta']<1,pose
 page.screenshot(path=str(out/'flip-in-motion.png'));page.wait_for_timeout(300)
 assert card.get_attribute('data-face')=='back' and not card.evaluate('e=>e.classList.contains("is-turning")')
 assert page.evaluate('JSON.stringify(window.__SKY_STUDIO_TEST__.state.library.map(s=>[s.id,s.score,s.playback,s.theme]))')==before
 page.locator('#homeThemeDots button').nth(3).click();page.wait_for_timeout(800)
 # Record all phases to ensure the real mounted player, not a screenshot, is revealed.
 page.evaluate("window.entryPhases=[];new MutationObserver(()=>window.entryPhases.push(document.getElementById('songEntryTransition').dataset.phase)).observe(document.getElementById('songEntryTransition'),{attributes:true,attributeFilter:['data-phase']})")
 card.locator('.card-play').click();page.wait_for_timeout(90)
 assert page.locator('#songEntryTransition').is_visible() and page.locator('#songEntryTransition').get_attribute('data-phase')=='expand'
 page.screenshot(path=str(out/'entry-expand.png'))
 page.wait_for_function("document.getElementById('songEntryTransition').dataset.phase==='reveal'")
 assert page.locator('#playerView').evaluate("e=>e.inert&&getComputedStyle(e).clipPath.startsWith('circle')")
 page.screenshot(path=str(out/'entry-reveal.png'))
 page.wait_for_function("document.getElementById('songEntryTransition').hidden")
 assert page.locator('#playerView').is_visible() and not page.locator('#playerView').evaluate('e=>e.inert')
 assert page.evaluate('window.__SKY_STUDIO_TEST__.state.position')==0
 assert page.evaluate('document.activeElement.id')=='songTitle'
 assert set(page.evaluate('window.entryPhases'))>={'expand','loading','reveal','idle'}
 page.locator('#backLibrary').click()
 assert page.locator('.light-cone[data-face="back"]').count()==0
 assert page.locator('#homeThemeTrack').get_attribute('data-index')=='0'
 assert page.locator('#songSearch').input_value()=='' and page.locator('#libraryFilter').input_value()=='all'
 assert page.locator('#homeView').evaluate('e=>e.scrollTop')==0
 # Cancel before mounting; no delayed continuation can enter a song afterward.
 page.locator('.card-play').first.click();page.evaluate('window.__SKY_STUDIO_TEST__.goHome()');page.wait_for_timeout(800)
 assert page.locator('#homeView').is_visible() and page.locator('#songEntryTransition').is_hidden()
 assert not page.locator('#homeView').evaluate('e=>e.inert')
 page.locator('.card-play').first.click();page.set_viewport_size({'width':1367,'height':900});page.wait_for_timeout(700)
 assert page.locator('#homeView').is_visible() and page.locator('#songEntryTransition').is_hidden()
 frames=page.locator('#homeFlowCanvas').get_attribute('data-frames');page.wait_for_timeout(150)
 assert page.locator('#homeFlowCanvas').get_attribute('data-frames')!=frames
 # Reset and fill two rows, preserving side margins and the new top inset.
 page.evaluate('while(window.__SKY_STUDIO_TEST__.state.library.length<6)window.__SKY_STUDIO_TEST__.duplicateSong(window.__SKY_STUDIO_TEST__.state.library[0].id)')
 layouts=[]
 for w,h in [(1920,1080),(1366,900),(1366,768),(1024,768),(768,900),(640,900),(390,844)]:
  page.set_viewport_size({'width':w,'height':h});page.wait_for_timeout(100)
  geometry=page.evaluate("""()=>{const cards=[...document.querySelectorAll('.light-cone')].map(e=>e.getBoundingClientRect()),header=document.querySelector('.home-top').getBoundingClientRect();return {w:innerWidth,h:innerHeight,top:header.top,bottom:cards[5].bottom,overflow:document.documentElement.scrollWidth>innerWidth}}""")
  assert not geometry['overflow'] and geometry['top']>=14,geometry
  assert page.locator('.home-top').evaluate("e=>{const logo=e.querySelector('.wordmark').getBoundingClientRect();return [...e.querySelectorAll('.home-top-actions button')].every(x=>{const r=x.getBoundingClientRect();return Math.min(logo.right,r.right)-Math.max(logo.left,r.left)<=1||Math.min(logo.bottom,r.bottom)-Math.max(logo.top,r.top)<=1})}")
  if w>900:assert 12<=h-geometry['bottom']<=54,geometry
  page.screenshot(path=str(out/f'home-{w}-{h}.png'));layouts.append(geometry)
 assert page.locator('.home-islet').evaluate('e=>e.complete&&e.naturalWidth>0')
 flow=page.locator('#homeFlowCanvas');frame=flow.get_attribute('data-frames');pixel=flow.evaluate('e=>e.toDataURL()');page.wait_for_timeout(500)
 assert flow.get_attribute('data-frames')!=frame and flow.evaluate('e=>e.toDataURL()')!=pixel
 assert page.locator('.home-atmosphere').evaluate('e=>getComputedStyle(e).pointerEvents')=='none'
 # A tall mobile player still opens from the center of the visible screen.
 page.locator('.card-play').first.click();page.wait_for_function("document.getElementById('songEntryTransition').dataset.phase==='reveal'")
 center=page.locator('#playerView').evaluate("e=>{const r=e.getBoundingClientRect(),m=getComputedStyle(e).clipPath.match(/at ([\\d.]+)px ([\\d.]+)px/);return m?{x:r.left+Number(m[1]),y:r.top+Number(m[2]),w:innerWidth,h:innerHeight}:null}")
 assert center and abs(center['x']-center['w']/2)<1 and abs(center['y']-center['h']/2)<1,center
 page.wait_for_function("document.getElementById('songEntryTransition').hidden")
 page.locator('#backLibrary').click()
 page.close()
 reduced=b.new_page(viewport={'width':1366,'height':900},reduced_motion='reduce');reduced.goto(url)
 reduced.locator('.cone-flip-trigger').first.click();reduced.locator('.card-play').first.click()
 assert reduced.locator('#playerView').is_visible() and reduced.locator('#songEntryTransition').is_hidden()
 reduced.locator('#backLibrary').click();assert reduced.locator('.light-cone[data-face="back"]').count()==0
 assert reduced.locator('.home-islet').evaluate('e=>getComputedStyle(e).animationName')=='none'
 assert not errors,errors
 (out/'results.json').write_text(json.dumps({'passed':True,'header':layout,'materials':material,'attachedEdgePose':pose,'layouts':layouts,'navigationReset':True,'entryPhases':True,'cancelledEntry':True,'reducedMotion':True,'errors':errors},ensure_ascii=False,indent=2),'utf-8')
 b.close();print('PASS attached fast flip, acrylic/glass, card-to-player transition, clean home return, cancellation, header/logo, responsive layout and quiet moving scenery')
