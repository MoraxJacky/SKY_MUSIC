"""Real keyboard input, insert/overwrite, mapping persistence, movement and theme fields."""
import argparse,json
from pathlib import Path
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--output',required=True,type=Path);p.add_argument('--url');a=p.parse_args();a.output.mkdir(parents=True,exist_ok=False);root=Path(__file__).resolve().parents[1]
with sync_playwright() as pw:
 b=pw.chromium.launch(channel='msedge',headless=True);page=b.new_page(viewport={'width':1375,'height':884},reduced_motion='reduce');errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(a.url or (root/'SkyMusicStudio_Standalone.html').as_uri())
 page.locator('#newSongBtn').click();page.locator('#createConfirm').click();assert page.locator('#createTitleError').is_visible();assert page.locator('#createTitle').get_attribute('aria-invalid')=='true';assert page.locator('#createDialog').is_visible();page.locator('#createTitle').fill('输入测试');assert page.locator('#createTitleError').is_hidden();page.locator('#createConfirm').click()
 original=page.evaluate('JSON.stringify(window.__SKY_STUDIO_TEST__.state.editSource.score)')
 fixture=[{'timeMs':500,'notes':[2],'durationMs':190,'velocity':85},{'timeMs':700,'notes':[4],'durationMs':100,'velocity':85},{'timeMs':900,'notes':[5,8],'durationMs':300,'velocity':85}]
 def reset():
  page.evaluate('''events=>{const t=window.__SKY_STUDIO_TEST__;t.state.project.score.events=structuredClone(events);t.state.project.score.gridIntervalMs=250;t.state.project.durationMs=1500;t.state.position=500;t.state.selected=0;t.state.lastSelected=-1;t.refreshWorkspace()}''',fixture)
 def events():return page.evaluate('window.__SKY_STUDIO_TEST__.state.project.score.events')
 reset();page.locator('#consoleClose').focus();page.keyboard.press('q');e=events();assert [(x['timeMs'],x['notes']) for x in e]==[(500,[1]),(750,[2]),(950,[4]),(1150,[5,8])],e
 page.locator('#consoleUndo').click();assert events()==fixture;page.locator('#consoleRedo').click();assert len(events())==4
 page.locator('[data-write-mode=overwrite]').click();reset();page.locator('#consoleClose').focus();page.keyboard.press('q');e=events();assert [(x['timeMs'],x['notes']) for x in e]==[(500,[1]),(900,[5,8])],e;assert page.evaluate('window.__SKY_STUDIO_TEST__.state.project.durationMs')==1500
 page.locator('#consoleUndo').click();assert events()==fixture
 page.locator('#consoleKeymapOpen').click();assert page.locator('#consoleKeymapGrid button').count()==15
 page.locator('#consoleKeymapGrid button').nth(0).click();page.keyboard.press('u');page.locator('#consoleKeymapSave').click();reset();page.locator('#consoleClose').focus();page.keyboard.press('u');assert events()[0]['notes']==[1]
 page.locator('#consoleKeymapOpen').click();page.locator('#consoleKeymapGrid button').nth(1).click();page.keyboard.press('u');page.locator('#consoleKeymapSave').click();saved=page.evaluate("JSON.parse(localStorage.getItem('sky-studio-keymap-v1'))");assert len(set(saved))==15 and saved[:2]==['KeyW','KeyU']
 page.locator('#consoleKeymapOpen').click();page.locator('#consoleKeymapGrid button').nth(0).click();page.keyboard.press('Space');assert '请选择' in page.locator('#consoleKeymapHelp').inner_text();page.keyboard.press('Escape');assert page.locator('#consoleKeymapDialog').is_visible();page.keyboard.press('Escape');assert page.locator('#consoleKeymapDialog').is_hidden()
 page.locator('#consoleFineTab').click();reset();page.evaluate('''()=>{const t=window.__SKY_STUDIO_TEST__;t.state.selected=2;t.scoreConsole.selection={project:t.state.project,event:t.state.project.score.events[2],note:5};t.refreshWorkspace()}''');page.locator('[data-note-move=up]').click();e=events();assert [(x['timeMs'],x['notes']) for x in e if x['timeMs']==900]==[(900,[8]),(900,[6])],e
 page.locator('[data-note-move=right]').click();assert any(x['timeMs']==1150 and x['notes']==[6] for x in events());page.locator('#consoleUndo').click();assert any(x['timeMs']==900 and x['notes']==[6] for x in events());page.locator('#consoleUndo').click();assert events()==fixture
 assert page.evaluate('JSON.stringify(window.__SKY_STUDIO_TEST__.state.editSource.score)')==original
 themes=[]
 for theme in ['christmas','starlight','citylights','prairie','rainforest','vault']:
  page.evaluate('''id=>{const t=window.__SKY_STUDIO_TEST__;t.state.project.theme={id};t.refreshWorkspace()}''',theme)
  for mode in ['record','fine','generate']:
   page.locator('[data-console-mode='+mode+']').click()
   fields=page.locator('#scoreConsole input:not([type=range]):visible,#scoreConsole textarea:visible').evaluate_all('es=>es.map(e=>({id:e.id,color:getComputedStyle(e).color,bg:getComputedStyle(e).backgroundColor,expected:getComputedStyle(e).getPropertyValue(e.disabled?"--player-rest":"--player-button").trim()}))')
   for f in fields:
    h=f['expected'].lstrip('#');rgb='rgb('+', '.join(str(int(h[i:i+2],16)) for i in (0,2,4))+')';assert f['bg']==rgb,(theme,mode,f)
   box=page.locator('.console-side').evaluate('e=>({height:e.clientHeight,scroll:e.scrollHeight})');page.screenshot(path=str(a.output/(theme+'-'+mode+'-layout.png')));assert box['scroll']<=box['height']+2,(theme,mode,box,page.locator('.console-side').evaluate('e=>[...e.children].filter(x=>!x.hidden).map(x=>({id:x.id,h:x.getBoundingClientRect().height,y:x.getBoundingClientRect().y,css:getComputedStyle(x).gridTemplateRows}))'))
   page.screenshot(path=str(a.output/(theme+'-'+mode+'.png')))
  themes.append(theme)
 page.reload();page.locator('.card-play').first.click();page.locator('#scoreEditorBtn').click();page.locator('#consoleKeymapOpen').click();assert page.locator('#consoleKeymapGrid button').nth(1).inner_text().endswith('U');page.screenshot(path=str(a.output/'keymap.png'));page.set_viewport_size({'width':390,'height':844});assert page.locator('#consoleKeymapDialog').bounding_box()['width']<=390;assert page.locator('#consoleKeymapGrid').evaluate('e=>e.scrollWidth<=e.clientWidth');page.screenshot(path=str(a.output/'keymap-mobile.png'));assert not errors,errors;b.close()
(a.output/'results.json').write_text(json.dumps({'passed':True,'themes':themes,'insertOverwrite':True,'mappingPersistenceAndConflicts':True,'singleNoteMovementUndo':True,'originalIsolation':True,'errors':errors},indent=2),'utf-8');print('PASS console input v2, keymaps, movement undo, six themes and original isolation')
