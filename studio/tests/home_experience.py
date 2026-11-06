"""Homepage carousel, full-size flipping cards, bounded spring motion and full-scene wind."""
import argparse,json,zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright

p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);p.add_argument('--url')
args=p.parse_args();out=args.output.resolve();out.mkdir(parents=True,exist_ok=False)
root=Path(__file__).resolve().parents[1];url=args.url or (root/'SkyMusicStudio_Standalone.html').as_uri()
with sync_playwright() as pw:
 b=pw.chromium.launch(channel='msedge',headless=True)
 page=b.new_page(viewport={'width':1366,'height':900},reduced_motion='no-preference');errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(url);page.add_style_tag(content='#toast{visibility:hidden}')
 assert page.locator('.theme-carousel #homeThemeDots button').count()==6
 assert page.locator('#homeThemeDots').evaluate('e=>{const d=e.getBoundingClientRect(),h=e.closest(".theme-carousel").getBoundingClientRect();return d.top>=h.top&&d.bottom<=h.bottom&&Math.abs((d.left+d.right-h.left-h.right)/2)<1}')
 assert page.locator('#homeThemeTrack>.home-theme-slide:not([data-clone])').count()==6
 assert page.locator('#homeThemeTrack>[data-clone][aria-hidden=true]').count()==2
 ids=page.locator('#homeThemeTrack>.home-theme-slide:not([data-clone])').evaluate_all('es=>es.map(e=>e.dataset.theme)')
 original=page.evaluate('JSON.stringify(window.__SKY_STUDIO_TEST__.state.library.map(p=>[p.id,p.score,p.playback,p.theme]))')
 for index in range(6):
  page.locator('#homeThemeDots button').nth(index).click();page.wait_for_timeout(800)
  assert page.locator('#homeThemeTrack').get_attribute('data-index')==str(index)
  assert page.locator('#homeThemeDots [aria-current=true]').count()==1
  assert page.locator('#homeThemeDots button').nth(index).get_attribute('aria-current')=='true'
 assert page.evaluate('JSON.stringify(window.__SKY_STUDIO_TEST__.state.library.map(p=>[p.id,p.score,p.playback,p.theme]))')==original
 # Both ordinary and queued boundary moves must continue in the same direction.
 page.locator('#homeThemeDots button').first.click();page.wait_for_timeout(800);page.locator('#homeThemePrev').click();page.wait_for_timeout(800)
 assert page.locator('#homeThemeTrack').get_attribute('data-index')=='5' and page.locator('#homeThemeTrack').get_attribute('data-physical')=='6'
 page.locator('#homeThemeNext').click();page.wait_for_timeout(800);assert page.locator('#homeThemeTrack').get_attribute('data-physical')=='1'
 page.locator('#homeThemeDots button').nth(4).click();page.wait_for_timeout(800)
 page.evaluate("window.carouselPositions=[];new MutationObserver(()=>window.carouselPositions.push(document.getElementById('homeThemeTrack').dataset.physical)).observe(document.getElementById('homeThemeTrack'),{attributes:true,attributeFilter:['data-physical']})")
 page.locator('#homeThemeNext').click();page.locator('#homeThemeNext').click();page.wait_for_timeout(1650)
 assert page.locator('#homeThemeTrack').get_attribute('data-index')=='0' and '7' in page.evaluate('window.carouselPositions')
 # Accelerated fixture timing proves auto-left and pause/resume without lengthy sleeps.
 page.mouse.move(0,0);page.evaluate("document.activeElement.blur();window.SKY_STUDIO_CONFIG.home.carousel.intervalMs=180;window.SKY_STUDIO_CONFIG.home.carousel.transitionMs=100;document.dispatchEvent(new Event('visibilitychange'))")
 start=page.locator('#homeThemeTrack').get_attribute('data-index');page.wait_for_function('(i)=>document.getElementById("homeThemeTrack").dataset.index!==i',arg=start)
 next_index=int(page.locator('#homeThemeTrack').get_attribute('data-index'));assert next_index==(int(start)+1)%6
 page.locator('.theme-carousel').hover();held=page.locator('#homeThemeTrack').get_attribute('data-index');page.wait_for_timeout(550);assert page.locator('#homeThemeTrack').get_attribute('data-index')==held
 page.mouse.move(0,0);page.wait_for_function('(i)=>document.getElementById("homeThemeTrack").dataset.index!==i',arg=held)
 page.locator('#homeThemeDots button').first.focus();held=page.locator('#homeThemeTrack').get_attribute('data-index');page.wait_for_timeout(500);assert page.locator('#homeThemeTrack').get_attribute('data-index')==held
 page.evaluate('window.SKY_STUDIO_CONFIG.home.carousel.intervalMs=6000;window.SKY_STUDIO_CONFIG.home.carousel.transitionMs=680')
 # Motion is driven by pointer position and a damped spring, never random offsets.
 card=page.locator('.light-cone').first;r=card.bounding_box();page.mouse.move(r['x']+r['width']*.9,r['y']+r['height']*.15);page.wait_for_timeout(350)
 motion=card.evaluate('e=>({x:Number(e.dataset.tiltX),y:Number(e.dataset.tiltY),shine:Number(getComputedStyle(e).getPropertyValue("--shine-opacity"))})')
 assert .2<abs(motion['x'])<=6.6 and .2<abs(motion['y'])<=6.6 and motion['shine']>.15,motion
 page.mouse.move(0,0);page.wait_for_timeout(1100);assert card.evaluate('e=>Math.abs(Number(e.dataset.tiltX))<.04&&Math.abs(Number(e.dataset.tiltY))<.04')
 # A flip changes presentation only; its reverse face contains data and no imagery.
 score=page.evaluate('JSON.stringify(window.__SKY_STUDIO_TEST__.state.library.map(p=>[p.score,p.playback]))')
 trigger=card.locator('.cone-flip-trigger');trigger.click();page.wait_for_timeout(150);assert card.locator('.cone-flip').evaluate('e=>e.getAnimations().some(a=>a.playState==="running")');assert card.locator('.cone-flip').bounding_box()['width']<r['width']*.65;page.wait_for_timeout(320);assert card.get_attribute('data-face')=='back'
 assert card.locator('.cone-back img').count()==0 and 'url(' not in card.locator('.cone-back').evaluate('e=>getComputedStyle(e).backgroundImage')
 assert card.locator('.cone-info dd').count()==3 and card.locator('.cone-info dt').all_text_contents()==['音符数','音域','作者'] and trigger.get_attribute('aria-pressed')=='true'
 assert page.evaluate('JSON.stringify(window.__SKY_STUDIO_TEST__.state.library.map(p=>[p.score,p.playback]))')==score
 page.screenshot(path=str(out/'flipped-1366.png'))
 # Reverse an unfinished turn from its present pose, then settle on the requested face.
 trigger.press('Space');page.wait_for_timeout(160);trigger.press('Enter');page.wait_for_timeout(900)
 assert card.get_attribute('data-face')=='back' and not card.evaluate('e=>e.classList.contains("is-turning")')
 assert card.locator('.cone-flip').evaluate('e=>Math.abs(new DOMMatrixReadOnly(getComputedStyle(e).transform).m11+1)<.01')
 card.get_by_role('button',name='收藏',exact=True).click();card=page.locator('.light-cone').first;assert card.get_attribute('data-face')=='back'
 card.get_by_role('button',name='重命名',exact=True).click();page.locator('#renameInput').fill('光锥卡片测试');page.locator('#renameConfirm').click();assert page.locator('.cone-back h3').first.inner_text()=='光锥卡片测试'
 page.locator('.light-cone').first.get_by_role('button',name='制作副本',exact=True).click();assert page.locator('.light-cone').count()==4
 page.locator('.light-cone').first.get_by_role('button',name='删除项目',exact=True).click();page.locator('#deleteConfirm').click();assert page.locator('.light-cone').count()==3
 # The dedicated play button works on the back without toggling the card.
 page.locator('.light-cone').first.locator('.card-play').click();page.wait_for_function("document.getElementById('songEntryTransition').hidden");assert page.locator('#playerView').is_visible();assert page.evaluate('window.__SKY_STUDIO_TEST__.state.position')==0
 page.locator('#backLibrary').click();page.wait_for_function("document.getElementById('songEntryTransition').hidden");page.locator('#songSearch').fill('不存在的乐曲');assert page.locator('.light-cone').count()==0;page.locator('#songSearch').fill('')
 # Three columns keep their original full cell width and fill two usable rows.
 page.evaluate('''()=>{const t=window.__SKY_STUDIO_TEST__;while(t.state.library.length<6)t.duplicateSong(t.state.library[0].id)}''')
 layouts=[]
 for width,height in [(1920,1080),(1366,900),(1366,768),(1024,768)]:
  page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(100)
  layout=page.evaluate('''()=>{const grid=document.getElementById('libraryCards'),g=grid.getBoundingClientRect(),cards=[...grid.querySelectorAll('.light-cone')].map(e=>e.getBoundingClientRect()),hero=document.querySelector('.theme-carousel').getBoundingClientRect(),arrow=document.getElementById('homeThemeNext').getBoundingClientRect(),cn=document.querySelector('.library-heading h2').getBoundingClientRect(),en=document.querySelector('.library-heading .eyebrow').getBoundingClientRect();return {width:innerWidth,height:innerHeight,contentLeft:g.left,contentRight:g.right,cardWidth:cards[0].width,cellWidth:(g.width-2*parseFloat(getComputedStyle(grid).columnGap))/3,cardHeight:cards[0].height,bottom:cards[5].bottom,heroHeight:hero.height,arrowHeight:arrow.height,headingOrder:cn.bottom<=en.top,overflow:document.documentElement.scrollWidth>innerWidth}}''')
  assert abs(layout['cardWidth']-layout['cellWidth'])<1 and 12<=height-layout['bottom']<=54,layout
  assert layout['contentLeft']>=(32 if width<=1150 else 80) and layout['contentRight']<=width-(32 if width<=1150 else 80) and layout['headingOrder'] and not layout['overflow'],layout
  assert abs(layout['arrowHeight']-layout['heroHeight'])<=2,layout
  page.screenshot(path=str(out/f'home-{width}-{height}.png'));layouts.append(layout)
 bg=page.locator('.home-atmosphere').bounding_box();assert bg['height']==768 and bg['width']==1024
 flow=page.locator('#homeFlowCanvas');frames=int(flow.get_attribute('data-frames'));pixels=flow.evaluate('e=>e.toDataURL()');page.wait_for_timeout(300);assert int(flow.get_attribute('data-frames'))>frames and flow.evaluate('e=>e.toDataURL()')!=pixels
 assert page.locator('.home-wind').count()==0 and page.locator('.home-art').evaluate('e=>getComputedStyle(e).animationName')=='none'
 assert page.locator('.home-atmosphere').evaluate('e=>getComputedStyle(e).pointerEvents')=='none'
 # Symmetric heading insets, comfortable separation, and white navigation gradients.
 geometry=page.evaluate('''()=>{const r=s=>document.querySelector(s).getBoundingClientRect(),g=r('#libraryCards'),h=r('.library-heading'),t=r('.library-heading h2'),c=r('.library-tools'),hero=r('.theme-carousel');return {left:t.left-g.left,right:g.right-c.right,gap:h.top-hero.bottom,arrow:getComputedStyle(document.getElementById('homeThemePrev')).backgroundImage,glow:getComputedStyle(document.querySelector('.theme-carousel')).boxShadow}}''')
 assert abs(geometry['left']-geometry['right'])<1 and geometry['left']==12 and geometry['gap']>=27,geometry
 assert '255, 255, 255' in geometry['arrow'] and geometry['glow']!='none',geometry
 # Each slide carries its own settings button; a preview is isolated from musical state.
 library=page.evaluate('JSON.stringify(window.__SKY_STUDIO_TEST__.state.library)')
 for index,theme in enumerate(ids):
  page.locator('#homeThemeDots button').nth(index).click();page.wait_for_timeout(800)
  button=page.locator('.home-theme-slide[aria-hidden=false] .theme-preview-open');assert button.inner_text()=='设置主题'
  button.click();assert page.locator('#homeThemeSample').get_attribute('data-theme')==theme
  assert page.locator('#homeThemeSampleRoll i').count()==5 and page.locator('#homeThemeSampleKeys span').count()==15
  page.locator('#homePreviewAccent').evaluate('e=>{e.value="#aaddff";e.dispatchEvent(new Event("input"))}')
  assert page.locator('#homeThemeSample').evaluate('e=>e.style.getPropertyValue("--sample-accent")')=='#aaddff'
  page.locator('#homePreviewMotion').select_option('off');assert page.locator('#homeThemeSample').get_attribute('data-motion')=='off'
  if index==1:
   with page.expect_download() as download:page.locator('#homePreviewExport').click()
   target=out/'preview-edited.skytheme';download.value.save_as(target)
   with zipfile.ZipFile(target) as z:
    d=json.loads(z.read('theme.json'));assert d['id'].startswith('custom-') and d['initialOverrides']['accent']=='#aaddff' and d['initialOverrides']['motion']=='off'
    assert d['decorations']['cover'] in z.namelist()
   page.screenshot(path=str(out/'theme-settings.png'))
  page.locator('#homePreviewReset').click();assert page.locator('#homePreviewMotion').input_value()=='ambient'
  page.locator('[data-close=homeThemeDialog]').click()
 assert page.evaluate('JSON.stringify(window.__SKY_STUDIO_TEST__.state.library)')==library
 # Mid-transition the active settings button travels with the slide.
 old=page.locator('.home-theme-slide[aria-hidden=false] .theme-preview-open').bounding_box()['x']
 page.locator('#homeThemeNext').click();page.wait_for_timeout(170)
 moving=page.locator('.home-theme-slide[aria-hidden=false] .theme-preview-open').bounding_box()['x'];assert abs(moving-old)>20
 page.wait_for_timeout(650)
 page.locator('#homeThemeDots button').nth(0).focus();page.locator('#homeThemeDots button').nth(0).press('ArrowRight');page.wait_for_timeout(800)
 assert page.locator('#homeThemeTrack').get_attribute('data-index')=='1'
 assert not errors,errors;page.close()
 touch=b.new_page(viewport={'width':390,'height':844},has_touch=True);touch.goto(url);touch.locator('.cone-flip-trigger').first.tap();assert touch.locator('.light-cone').first.get_attribute('data-face')=='back';assert touch.locator('.light-cone').first.evaluate('e=>!Number(e.dataset.tiltX||0)&&!Number(e.dataset.tiltY||0)');touch.screenshot(path=str(out/'touch-390.png'));assert touch.evaluate('document.documentElement.scrollWidth<=innerWidth');touch.close()
 reduced=b.new_page(reduced_motion='reduce');reduced.goto(url);reduced.evaluate("window.SKY_STUDIO_CONFIG.home.carousel.intervalMs=100;document.dispatchEvent(new Event('visibilitychange'))");reduced.wait_for_timeout(350);assert reduced.locator('#homeThemeTrack').get_attribute('data-index')=='0';reduced.locator('.cone-flip-trigger').first.click();assert reduced.locator('.light-cone').first.get_attribute('data-face')=='back';assert reduced.locator('#homeFlowCanvas').evaluate('e=>getComputedStyle(e).display==="none"&&!e.dataset.frames');b.close()
(out/'results.json').write_text(json.dumps({'passed':True,'themes':ids,'automaticLeftAndPause':True,'seamlessBoundaries':True,'spring':motion,'flip':True,'backHasNoImage':True,'actionsAndPlayback':True,'layouts':layouts,'organicNoiseFlow':True,'touch':True,'reducedMotion':True,'errors':errors},ensure_ascii=False,indent=2),'utf-8')
print('PASS six-theme carousel and wraps, bounded damped cards, flip/info/actions/playback, original card widths, two full rows, side margins, organic local flow, touch and reduced motion')
