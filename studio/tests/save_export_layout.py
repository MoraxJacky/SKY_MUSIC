"""Save-as export handoff, original isolation, shared player gutters and card labels."""
import argparse,json
from pathlib import Path
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);p.add_argument('--url');a=p.parse_args();out=a.output.resolve();out.mkdir(parents=True,exist_ok=False);root=Path(__file__).resolve().parents[1]
with sync_playwright() as pw:
 b=pw.chromium.launch(channel='msedge',headless=True);page=b.new_page(viewport={'width':1375,'height':884},reduced_motion='reduce');errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(a.url or (root/'SkyMusicStudio_Standalone.html').as_uri());page.wait_for_timeout(400)
 tag=page.locator('.cover-tag').first;assert tag.evaluate('e=>parseFloat(getComputedStyle(e).fontSize)')>=10
 page.locator('#importThemeLibrary').click();assert page.locator('#themeRepositoryTitle').bounding_box()['y']<page.locator('#themeRepositoryDialog .eyebrow').bounding_box()['y'];page.screenshot(path=str(out/'theme-repository-title.png'));page.keyboard.press('Escape')
 layout=[]
 for theme in ['christmas','starlight','citylights','prairie','rainforest','vault']:
  page.evaluate("id=>{const t=window.__SKY_STUDIO_TEST__;const p=t.state.library.find(p=>p.theme.id===id);t.openSong(p.id)}",theme)
  boxes=page.evaluate("()=>Object.fromEntries(['.player-header','.play-controls','.workspace'].map(s=>{const r=document.querySelector('#playerView '+s).getBoundingClientRect();return [s,{left:r.left,right:r.right,bottom:r.bottom}]}))")
  assert len({x['left'] for x in boxes.values()})==1 and len({x['right'] for x in boxes.values()})==1,boxes
  assert boxes['.workspace']['left']>=30 and 1375-boxes['.workspace']['right']>=30 and 884-boxes['.workspace']['bottom']>=24,boxes
  layout.append({'theme':theme,'boxes':boxes})
 page.screenshot(path=str(out/'vault-player-spacing.png'))
 original=page.evaluate('({id:window.__SKY_STUDIO_TEST__.state.project.id,score:JSON.stringify(window.__SKY_STUDIO_TEST__.state.project.score)})');page.locator('#scoreEditorBtn').click();page.evaluate('window.__SKY_STUDIO_TEST__.eventInsert()');page.locator('#consoleClose').click();page.locator('#saveAsNew').click();assert page.locator('#exportDialog').is_visible() and page.locator('#exportLater').is_visible()
 saved=page.evaluate('window.__SKY_STUDIO_TEST__.state.project');assert saved['id']!=original['id'] and saved['originKind']=='user'
 assert page.evaluate('(id)=>JSON.stringify(window.__SKY_STUDIO_TEST__.state.library.find(p=>p.id===id).score)',original['id'])==original['score']
 page.screenshot(path=str(out/'save-as-export.png'))
 for button,extension,fmt in [('exportPlatform','skymusic','skymusic'),('exportNative','skytrack','skytrack')]:
  with page.expect_download() as pending:page.locator('#'+button).click()
  dl=pending.value;assert dl.suggested_filename.endswith('.'+extension);path=out/('saved.'+extension);dl.save_as(path);doc=json.loads(path.read_text('utf-8'));assert doc['format']==fmt
  events=doc['music']['events'] if extension=='skymusic' else doc['events'];assert events==saved['score']['events']
 page.locator('#exportLater button').click();page.locator('#scoreEditorBtn').click();page.evaluate("window.__SKY_STUDIO_TEST__.requestFinishEdit('home')");page.locator('#saveAsNew').click();assert page.locator('#exportDialog').is_visible();page.locator('#exportLater button').click();assert page.locator('#homeView').is_visible()
 # The public export button should still open the ordinary export dialog, not the save-as state.
 page.locator('.card-play').first.click();page.locator('#exportProject').click();assert page.locator('#exportTitle').inner_text()=='导出乐曲' and not page.locator('#exportLater').is_visible();page.keyboard.press('Escape')
 page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');assert not errors,errors;b.close()
(out/'results.json').write_text(json.dumps({'passed':True,'layouts':layout,'saveAsFormats':['skymusic','skytrack'],'originalPreserved':True,'returnHomeAfterChoice':True,'errors':errors},ensure_ascii=False,indent=2),'utf-8');print('PASS six-theme aligned gutters, readable tags, title order, save-as format handoff/downloads and original isolation')
