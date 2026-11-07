"""Original presentation page and independent full-screen musical editing boundary."""
import argparse,json
from pathlib import Path
from playwright.sync_api import sync_playwright
parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True);parser.add_argument('--url');args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=False)
with sync_playwright() as pw:
 b=pw.chromium.launch(channel='msedge',headless=True);page=b.new_page(viewport={'width':1375,'height':884},reduced_motion='reduce');errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(args.url or (Path(__file__).resolve().parents[1]/'SkyMusicStudio_Standalone.html').as_uri())
 for theme in ['christmas','starlight','citylights','prairie','rainforest','vault']:
  page.evaluate("id=>{const t=window.__SKY_STUDIO_TEST__;t.openSong(t.state.library.find(p=>p.theme.id===id).id)}",theme)
  assert page.locator('#playerView').is_visible() and page.locator('#musicWorkbench').is_hidden()
  assert page.locator('#scoreConsole').is_hidden()
  page.evaluate("()=>{const t=window.__SKY_STUDIO_TEST__;t.state.position=2000;t.state.rollPageStart=0;t.state.windowSec=8}")
  original=page.evaluate('JSON.stringify(window.__SKY_STUDIO_TEST__.state.project.score)')
  page.locator('#scoreEditorBtn').click();assert page.locator('#musicWorkbench').is_visible() and page.locator('#playerView').is_hidden()
  assert page.evaluate('window.SKY_MUSIC_TEST.mw.editing');page.evaluate("()=>{const w=window.SKY_MUSIC_TEST;w.mw.cursor=9000;w.MusicAudio.position=4500;w.musicComposition().notes[0].velocity=30}")
  page.locator('#musicEdit').click();page.locator('#discardChanges').click()
  assert page.locator('#playerView').is_visible() and page.locator('#musicWorkbench').is_hidden()
  assert page.evaluate('window.__SKY_STUDIO_TEST__.state.position')==2000
  assert page.evaluate('JSON.stringify(window.__SKY_STUDIO_TEST__.state.project.score)')==original
  page.screenshot(path=str(args.output/(theme+'-player.png')))
 # Save canonical independent notes, then play from the original presentation UI.
 page.locator('#scoreEditorBtn').click()
 page.evaluate("()=>{const w=window.SKY_MUSIC_TEST,c=w.Music.blank(),t=c.tracks[0].id;c.notes=[{id:'a',trackId:t,pitch:60,startTick:0,durationTicks:960,soundTicks:900,gate:.9375,velocity:70},{id:'b',trackId:t,pitch:64,startTick:0,durationTicks:480,soundTicks:400,gate:400/480,velocity:90}];w.mw.project.composition=c;w.mw.track=t;w.musicRender()}")
 page.locator('#musicEdit').click();page.locator('#saveDirect').click()
 assert page.locator('#playerView').is_visible()
 saved=page.evaluate('window.__SKY_STUDIO_TEST__.state.project');assert len(saved['composition']['notes'])==2 and len(saved['score']['events'])==1 and len(saved['score']['events'][0]['notes'])==2
 page.locator('#restartBtn').click();page.locator('#playBtn').click();page.wait_for_function('window.__SKY_STUDIO_TEST__.state.isPlaying');page.wait_for_timeout(150);page.locator('#playBtn').click();assert page.evaluate('window.SKY_MUSIC_TEST.MusicAudio.voices.size')==0
 page.locator('#scoreEditorBtn').click();page.locator('#musicEdit').click();page.locator('#saveAsNew').click();assert page.locator('#exportDialog').is_visible() and page.locator('#playerView').is_visible()
 assert not errors,errors;b.close()
(args.output/'results.json').write_text(json.dumps({'passed':True,'themes':6,'originalPlayerRestored':True,'editNavigationIsolated':True,'saveDiscardSaveAs':True,'canonicalPlayback':True,'errors':errors},indent=2),'utf-8');print('PASS original player, six themes, independent editor, save/discard/save-as, full composition playback and clean stop')
