"""Reciprocal navigation and image coverage throughout real carousel movement."""
import argparse,json
from pathlib import Path
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);p.add_argument('--url');a=p.parse_args();out=a.output.resolve();out.mkdir(parents=True,exist_ok=False)
root=Path(__file__).resolve().parents[1];url=a.url or (root/'SkyMusicStudio_Standalone.html').as_uri()
with sync_playwright() as pw:
 b=pw.chromium.launch(channel='msedge',headless=True);page=b.new_page(viewport={'width':1366,'height':900});errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(url)
 assert page.locator('.theme-preview-label').count()==0 and '主题预览' not in page.locator('.theme-carousel').inner_text()
 header=page.locator('.home-top').evaluate("e=>{const s=getComputedStyle(e);return {background:s.backgroundColor,border:s.borderBottomWidth,blur:s.backdropFilter,shadow:s.boxShadow}}")
 assert header=={'background':'rgba(0, 0, 0, 0)','border':'0px','blur':'none','shadow':'none'},header
 assert page.locator('.brand-title').evaluate('e=>getComputedStyle(e).backgroundImage').startswith('linear-gradient')
 assert page.locator('.brand-emblem #brandDiamond stop').count()>=6
 assert page.locator('.brand-emblem circle').get_attribute('stroke')=='url(#brandDiamond)'
 acrylic=page.locator('.theme-carousel').evaluate("e=>{const s=getComputedStyle(e,'::before');return {filter:s.backdropFilter,mask:s.maskImage,fill:s.backgroundImage,pointer:s.pointerEvents}}")
 assert 'blur(2px)' in acrylic['filter'] and 'linear-gradient' in acrylic['mask'] and acrylic['pointer']=='none'
 buttons=page.locator('.home-top-actions>button').evaluate_all("es=>es.map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {top:r.top,bottom:r.bottom,height:r.height,shadow:s.boxShadow}})")
 assert len({x['top'] for x in buttons})==len({x['bottom'] for x in buttons})==1 and {x['height'] for x in buttons}=={34},buttons
 assert all(x['shadow']=='none' for x in buttons)
 # At ordinary moves and both wrap boundaries every horizontal sample remains on loaded artwork.
 assert page.locator('#homeThemeArtTrack>.home-theme-art-slide').count()==8
 page.locator('.theme-carousel').hover();coverage=[]
 for arrow in ['homeThemeNext','homeThemePrev','homeThemePrev','homeThemeNext']:
  page.locator('#'+arrow).click()
  for delay in [80,140,160]:
   page.wait_for_timeout(delay)
   frame=page.evaluate("""()=>{const v=document.querySelector('.home-theme-art-viewport').getBoundingClientRect(),tiles=[...document.querySelectorAll('#homeThemeArtTrack .preview-landscape')];return {images:tiles.every(e=>e.complete&&e.naturalWidth>0&&getComputedStyle(e).objectFit==='cover'),covered:[.01,.2,.4,.6,.8,.99].every(f=>tiles.some(e=>{const r=e.getBoundingClientRect(),x=v.left+v.width*f;return r.left<=x+1&&r.right>=x-1&&r.top<=v.top+1&&r.bottom>=v.bottom-1})),synced:getComputedStyle(document.getElementById('homeThemeArtTrack')).transform===getComputedStyle(document.getElementById('homeThemeTrack')).transform,mask:getComputedStyle(document.querySelector('.home-theme-art')).maskImage}}""")
   assert frame['images'] and frame['covered'] and frame['synced'] and frame['mask']=='none',frame
   coverage.append(frame)
  page.screenshot(path=str(out/f'carousel-{arrow}-{len(coverage)}.png'));page.wait_for_timeout(380)
 page.screenshot(path=str(out/'home-diamond.png'))
 page.locator('.card-play').first.click();page.wait_for_function("document.getElementById('songEntryTransition').dataset.phase==='reveal'")
 forward=page.locator('#playerView').evaluate('e=>e.getAnimations()[0].effect.getTiming().duration');assert forward>420
 page.wait_for_function("document.getElementById('songEntryTransition').hidden")
 page.locator('#playBtn').click();page.wait_for_function('window.__SKY_STUDIO_TEST__.state.isPlaying')
 page.locator('#backLibrary').click();page.wait_for_function("document.getElementById('songEntryTransition').dataset.phase==='return-cover'")
 assert not page.evaluate('window.__SKY_STUDIO_TEST__.state.isPlaying')
 assert page.locator('#playerView').evaluate("e=>e.inert&&e.getAnimations().some(a=>a.playState==='running')")
 page.screenshot(path=str(out/'return-cover.png'))
 page.wait_for_function("document.getElementById('songEntryTransition').dataset.phase==='return-reveal'")
 assert page.locator('#homeView').evaluate("e=>e.inert&&getComputedStyle(e).clipPath==='none'")
 for id in ['playerView','songEntryTransition']:
  inward=page.locator('#'+id).evaluate("e=>{const a=e.getAnimations().find(a=>a.effect.getKeyframes()[0].clipPath?.startsWith('circle')),f=a.effect.getKeyframes(),radius=x=>Number(x.clipPath.match(/circle\\(([\\d.]+)px/)[1]);return radius(f[0])>radius(f[f.length-1])}")
  assert inward,id
 page.screenshot(path=str(out/'return-reveal.png'));page.wait_for_function("document.getElementById('songEntryTransition').hidden")
 assert page.locator('#homeView').is_visible() and page.locator('#playerView').is_hidden()
 assert page.evaluate('document.activeElement.id')=='libraryTitle'
 assert page.locator('.light-cone[data-face="back"]').count()==0
 assert page.locator('#homeView').evaluate('e=>!e.inert&&getComputedStyle(e).clipPath==="none"')
 # Programmatic navigation cancels an unfinished return without leaving a stale home switch.
 page.locator('.card-play').first.click();page.wait_for_function("document.getElementById('songEntryTransition').hidden")
 page.locator('#backLibrary').click();page.evaluate('window.__SKY_STUDIO_TEST__.openSong(window.__SKY_STUDIO_TEST__.state.library[1].id)');page.wait_for_timeout(1100)
 assert page.locator('#playerView').is_visible() and page.locator('#songEntryTransition').is_hidden()
 assert page.evaluate('window.__SKY_STUDIO_TEST__.state.project.id===window.__SKY_STUDIO_TEST__.state.library[1].id')
 # Returning from an editor still requires the existing save/discard decision first.
 original=page.evaluate('JSON.stringify(window.__SKY_STUDIO_TEST__.state.project.score)')
 page.locator('#scoreEditorBtn').click();page.evaluate('window.__SKY_STUDIO_TEST__.goHome()');assert page.locator('#saveChoiceDialog').is_visible()
 page.locator('#discardChanges').click();page.wait_for_function("document.getElementById('songEntryTransition').dataset.phase==='return-cover'")
 assert not page.evaluate('window.__SKY_STUDIO_TEST__.state.editMode')
 page.wait_for_function("document.getElementById('songEntryTransition').hidden");assert page.locator('#homeView').is_visible()
 assert page.evaluate('JSON.stringify(window.__SKY_STUDIO_TEST__.state.project.score)')==original
 page.close()
 reduced=b.new_page(reduced_motion='reduce');reduced.goto(url);reduced.locator('.card-play').first.click();reduced.locator('#backLibrary').click();assert reduced.locator('#homeView').is_visible() and reduced.locator('#songEntryTransition').is_hidden();assert reduced.locator('.brand-title').evaluate('e=>getComputedStyle(e).animationName')=='none'
 assert not errors,errors
 (out/'results.json').write_text(json.dumps({'passed':True,'header':header,'buttons':buttons,'artCoverage':coverage,'forwardRevealMs':forward,'returnMotion':True,'returnCancel':True,'reducedMotion':True,'errors':errors},ensure_ascii=False,indent=2),'utf-8');b.close()
 print('PASS two-way navigation, longer motion, cancellation, continuous loaded imagery across wrap boundaries, transparent header, aligned controls and prismatic identity')
