"""Overlapping physical key presses form one step; record view selects older notes."""
import argparse,json
from pathlib import Path
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--output',required=True,type=Path);p.add_argument('--url');a=p.parse_args();a.output.mkdir(parents=True,exist_ok=False)
with sync_playwright() as pw:
 b=pw.chromium.launch(channel='msedge',headless=True);page=b.new_page(viewport={'width':1375,'height':884},reduced_motion='reduce');errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(a.url or (Path(__file__).resolve().parents[1]/'SkyMusicStudio_Standalone.html').as_uri());page.locator('.card-play').first.click();page.locator('#scoreEditorBtn').click()
 fixture=[{'timeMs':500,'notes':[10],'durationMs':180,'velocity':85},{'timeMs':1000,'notes':[12],'durationMs':180,'velocity':85}]
 def reset():page.evaluate('''events=>{const t=window.__SKY_STUDIO_TEST__;t.state.project.score.events=structuredClone(events);t.state.project.score.gridIntervalMs=250;t.state.project.durationMs=2000;t.state.position=500;t.state.selected=0;t.state.lastSelected=0;t.refreshWorkspace()}''',fixture)
 def data():return page.evaluate('window.__SKY_STUDIO_TEST__.state.project.score.events')
 for mode in ['insert','overwrite']:
  page.locator('[data-write-mode='+mode+']').click();reset();page.locator('#consoleClose').focus();page.keyboard.down('q');page.keyboard.down('e');page.keyboard.down('t');page.keyboard.down('t');page.keyboard.up('q');page.keyboard.up('e');page.keyboard.up('t')
  events=data();assert len([e for e in events if e['timeMs']==500])==1 and events[0]['notes']==[1,3,5],events;assert page.evaluate('window.__SKY_STUDIO_TEST__.state.position')==750
  assert [(e['timeMs'],e['notes']) for e in events[1:]]==([(750,[10]),(1250,[12])] if mode=='insert' else [(1000,[12])]),events
  page.locator('#consoleUndo').click();assert data()==fixture;page.locator('#consoleRedo').click();assert data()==events
  page.evaluate('window.__SKY_STUDIO_TEST__.state.position=750');page.locator('#consoleClose').focus();page.keyboard.press('w');assert any(e['timeMs']==750 and e['notes']==[2] for e in data())
 # Select the older chord's first note in record view; the click must not split or write.
 before=data();frame=page.evaluate('''()=>{const t=window.__SKY_STUDIO_TEST__,c=document.getElementById('rollCanvas'),r=c.getBoundingClientRect(),f=t.rollFrame(),g=t.rollPlotGeometry(r,f);return {...f,...g,x:r.x,y:r.y,h:r.height}}''');row=(frame['h']-frame['top']-frame['bottom'])/15
 page.mouse.click(frame['x']+frame['left']+(500-frame['begin'])/frame['windowMs']*frame['plotW']+2,frame['y']+frame['top']+(15-1+.5)*row)
 assert data()==before
 chosen=page.evaluate('({time:window.__SKY_STUDIO_TEST__.scoreConsole.selection.event.timeMs,note:window.__SKY_STUDIO_TEST__.scoreConsole.selection.note})');assert chosen=={'time':500,'note':1},chosen
 page.locator('[data-note-move=up]').click();events=data();assert any(e['timeMs']==500 and e['notes']==[2] for e in events);assert any(e['timeMs']==500 and e['notes']==[3,5] for e in events);assert any(e['timeMs']==750 and e['notes']==[2] for e in events)
 page.locator('#consoleUndo').click();assert data()==before;page.screenshot(path=str(a.output/'old-note-selected.png'));assert not errors,errors;b.close()
(a.output/'results.json').write_text(json.dumps({'passed':True,'insertOverwriteChord':True,'oneStepOneUndo':True,'olderSingleNoteSelection':True,'errors':errors},indent=2),'utf-8');print('PASS overlapping keys, chord step undo, record-view old-note selection and isolated movement')
