"""Six data-only themes: paused-canvas refresh, visual feedback, layout and portable assets."""
import argparse,base64,io,json,zipfile,xml.etree.ElementTree as ET
from pathlib import Path
from playwright.sync_api import sync_playwright

p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True)
out=p.parse_args().output.resolve();out.mkdir(parents=True,exist_ok=False)
root=Path(__file__).resolve().parents[1]
ids=['christmas','starlight','citylights','prairie','rainforest','vault']
checks=[];exports={};errors=[]
for asset in (root/'app/assets/themes').glob('*.svg'):
 tree=ET.fromstring(asset.read_text('utf-8'))
 assert all(e.tag.split('}')[-1] not in ['script','foreignObject'] and not any(k.lower().startswith('on') for k in e.attrib) for e in tree.iter())
 assert 'http' not in asset.read_text('utf-8').split('viewBox',1)[-1]

def snapshot(page):
 return page.evaluate('''()=>{const t=window.__SKY_STUDIO_TEST__,s=t.state;return {score:JSON.stringify(s.project.score),playback:JSON.stringify(s.project.playback),position:s.position,begin:t.rollFrame().begin,window:s.windowSec,selected:s.selected,page:s.page}}''')

with sync_playwright() as pw:
 b=pw.chromium.launch(channel='msedge',headless=True)
 page=b.new_page(viewport={'width':1366,'height':900},accept_downloads=True)
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto((root/'SkyMusicStudio_Standalone.html').as_uri())
 assert page.locator('.home-art').evaluate('e=>e.complete&&e.naturalWidth>=1600&&!e.src.includes("christmas")')
 assert page.locator('.home-aura').evaluate_all('es=>es.every(e=>getComputedStyle(e).animationName!=="none")')
 page.locator('.card-play').first.click()
 assert page.evaluate('Object.keys(window.__SKY_STUDIO_TEST__.THEME_DEFINITIONS)')==ids
 page.evaluate('''()=>{window.themePaint=[];const original=CanvasRenderingContext2D.prototype.fillRect;CanvasRenderingContext2D.prototype.fillRect=function(x,y,w,h){if(this.canvas.id==='rollCanvas'&&x===59&&w>150&&h>2&&h<70)window.themePaint.push(this.fillStyle);return original.call(this,x,y,w,h)};window.themeHandlers=Object.fromEntries(['playBtn','keySelect','pageNext','stepNext','consoleUndo'].map(id=>[id,document.getElementById(id).onclick||document.getElementById(id).onchange]))}''')
 palettes=[]
 for theme in ids:
  page.locator('#seekSlider').evaluate("e=>{e.value=12000;e.dispatchEvent(new Event('input'))}")
  main_position=snapshot(page)['position']
  page.locator('#scoreEditorBtn').click();page.locator('#consoleFineTab').click()
  page.locator('#rollWindow').select_option('8')
  page.locator('#rollSeekSlider').evaluate("e=>{e.value=23000;e.dispatchEvent(new Event('input'))}")
  before=snapshot(page);page.locator('#sceneEditorBtn').click();assert page.locator('#themeChoices [data-scene]').count()==6
  page.evaluate('window.themePaint=[]');page.locator('[data-scene="'+theme+'"]').click()
  page.wait_for_function('window.themePaint.length>=15')
  assert snapshot(page)==before,theme
  result=page.evaluate('''()=>{const t=window.__SKY_STUDIO_TEST__,s=t.state,d=t.THEME_DEFINITIONS[s.project.theme.id],cv=document.getElementById('rollCanvas'),rgba=cv.getContext('2d').getImageData(4,4,1,1).data;return {palette:d.rollPalette,rows:window.themePaint.slice(-15),pixel:'#'+[...rgba].slice(0,3).map(v=>v.toString(16).padStart(2,'0')).join(''),handlers:Object.entries(window.themeHandlers).every(([id,f])=>(document.getElementById(id).onclick||document.getElementById(id).onchange)===f),shape:d.keyFeedback.shape,materials:d.materials}}''')
  pattern=['light','medium','dark','medium','light']*3
  assert result['rows']==[result['palette'][key] for key in pattern],(theme,result)
  assert result['pixel']==result['palette']['base'] and result['handlers'],(theme,result)
  assert page.locator('#playerView').get_attribute('data-theme')==page.locator('#scoreConsole').get_attribute('data-theme')==theme
  palettes.append(result['palette']['base'])
  # Each preset exports its own portable resource package, including SVG ornaments.
  with page.expect_download() as dl:page.locator('#themeExportBtn').click()
  target=out/(theme+'.skytheme');dl.value.save_as(target);exports[theme]=target
  with zipfile.ZipFile(target) as z:
   definition=json.loads(z.read('theme.json'))
   assert definition['keyFeedback']['shape']==result['shape']
   paths=[definition['decorations']['identity']['image'],*definition['decorations']['ornaments']]
   if theme!='christmas':paths.extend([definition['decorations']['scene']['image'],definition['decorations']['companion']])
   assert all(path in z.namelist() for path in paths if path),(theme,paths,z.namelist())
  page.locator('[data-close=sceneDialog]').click();page.locator('#consoleRecordTab').click()
  page.locator('#keyBoard [data-note="1"]').click();assert page.locator('#keyFeedbackLayer .key-particle').count()==0
  page.locator('#consoleUndo').click();assert snapshot(page)['score']==before['score']
  page.locator('#consoleClose').click();page.locator('#saveDirect').click()
  assert snapshot(page)['position']==main_position and page.locator('#beatGrid .beat').count()==32
  page.wait_for_function("[...document.querySelectorAll('[data-theme-decoration]:not([hidden]),.stage-companion:not([hidden]),#identitySnow:not([hidden])')].every(e=>e.complete&&e.naturalWidth>0)")
  page.locator('#keyBoard [data-note="2"]').click()
  assert page.locator('#keyFeedbackLayer .key-particle').count()>=8
  assert page.locator('#keyFeedbackLayer .key-particle').first.get_attribute('data-shape')==result['shape']
  assert snapshot(page)['score']==before['score']
  page.screenshot(path=str(out/(theme+'-player.png')))
  page.wait_for_timeout(1150);assert page.locator('#keyFeedbackLayer .key-particle').count()==0
  geometry=page.evaluate('''()=>{const rect=s=>document.querySelector(s).getBoundingClientRect(),a=rect('.roll-pane'),c=rect('.keys-pane'),g=rect('.grid-pane'),s=rect('#stagePane');return {leftGap:c.top-a.bottom,rightGap:s.top-g.bottom,columnGap:g.left-a.right,panelsBottom:Math.max(c.bottom,s.bottom),viewport:innerHeight}}''')
  assert max(geometry[k] for k in ['leftGap','rightGap','columnGap'])-min(geometry[k] for k in ['leftGap','rightGap','columnGap'])<1,geometry
  assert geometry['panelsBottom']<=geometry['viewport'],geometry
  # Existing playback and navigation continue under each theme.
  page.locator('#stepNext').click();page.locator('#stepPrev').click();page.locator('#playBtn').click();page.wait_for_function('window.__SKY_STUDIO_TEST__.state.isPlaying');page.locator('#playBtn').click()
  checks.append({'theme':theme,'pausedCanvasRefresh':True,'rows':True,'independentStateAndHandlers':True,'portableAssets':True,'shape':result['shape'],'editorNoParticles':True,'geometry':geometry})
 assert len(set(palettes))==6
 # Round-trip a theme with its SVG and PNG resources through the actual platform importer.
 with zipfile.ZipFile(exports['starlight']) as src:
  files={name:src.read(name) for name in src.namelist()}
 definition=json.loads(files['theme.json']);definition['id']='sky-roundtrip-test';files['theme.json']=json.dumps(definition).encode('utf-8')
 bio=io.BytesIO()
 with zipfile.ZipFile(bio,'w') as dest:
  for name,data in files.items():dest.writestr(name,data)
 page.locator('#scoreEditorBtn').click();original=snapshot(page)['score']
 page.evaluate('''async b64=>{const t=window.__SKY_STUDIO_TEST__,bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));await t.importFile(new File([bytes],'roundtrip.skytheme'))}''',base64.b64encode(bio.getvalue()).decode())
 assert snapshot(page)['score']==original
 assert page.evaluate('window.__SKY_STUDIO_TEST__.state.project.theme.id')=='sky-roundtrip-test'
 page.wait_for_function("document.getElementById('identitySnow').complete&&document.getElementById('identitySnow').naturalWidth>0&&document.querySelector('.stage-companion').complete&&document.querySelector('.stage-companion').naturalWidth>0")
 assert page.locator('#identitySnow').get_attribute('src').startswith('data:image/svg+xml;')
 page.locator('#consoleClose').click();page.locator('#discardChanges').click();page.locator('#backLibrary').click()
 # Fill two rows with genuine independent song copies; the seventh card starts below them.
 page.evaluate('''()=>{const t=window.__SKY_STUDIO_TEST__;while(t.state.library.length<6)t.duplicateSong(t.state.library[0].id)}''')
 home=[]
 for width,height in [(1920,1080),(1366,900),(1366,768),(1024,768)]:
  page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(100)
  layout=page.evaluate('''()=>{const cards=[...document.querySelectorAll('#libraryCards .song-card')].map(e=>e.getBoundingClientRect()),hero=document.querySelector('.home-hero').getBoundingClientRect(),action=document.querySelector('.hero-actions').getBoundingClientRect();return {bottom:cards[5].bottom,nextTop:cards[6].top,cardHeight:cards[0].height,heroBottom:hero.bottom,actionBottom:action.bottom,width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth}}''')
  assert 12<=height-layout['bottom']<=54 and layout['nextTop']>=height-40,layout
  assert layout['actionBottom']<=layout['heroBottom']-8 and not layout['overflow'],layout
  page.screenshot(path=str(out/f'home-{width}-{height}.png'));home.append(layout)
 page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(out/'home-mobile.png'))
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert not errors,errors
 page.close()
 reduced=b.new_page(reduced_motion='reduce');reduced.goto((root/'SkyMusicStudio_Standalone.html').as_uri())
 assert reduced.locator('.home-aura').evaluate_all('es=>es.every(e=>getComputedStyle(e).animationName==="none")')
 reduced.locator('.card-play').first.click();reduced.locator('#keyBoard [data-note="2"]').click();assert reduced.locator('.key-particle').count()==0
 b.close()
(out/'results.json').write_text(json.dumps({'passed':True,'themes':checks,'home':home,'svgPngRoundtrip':True,'reducedMotion':True,'errors':errors},ensure_ascii=False,indent=2),'utf-8')
print('PASS six themes, immediate paused roll redraw, unchanged music/navigation/handlers, main-only particles, six portable packages, SVG/PNG import, equal panel gaps, full two-row home and reduced motion')
