"""Six real home cards, three new original theme scores, and zero sustain on fresh song entry."""
import argparse,json
from pathlib import Path
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);p.add_argument('--url');a=p.parse_args();out=a.output.resolve();out.mkdir(parents=True,exist_ok=False);root=Path(__file__).resolve().parents[1]
with sync_playwright() as pw:
 b=pw.chromium.launch(channel='msedge',headless=True);page=b.new_page(viewport={'width':1375,'height':884},reduced_motion='reduce');errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(a.url or (root/'SkyMusicStudio_Standalone.html').as_uri())
 assert page.locator('#libraryCards .light-cone').count()==6
 page.wait_for_function("[...document.querySelectorAll('#libraryCards .song-cover img')].every(e=>e.complete&&e.naturalWidth>0)");page.screenshot(path=str(out/'six-builtin-cards.png'))
 rows=page.locator('#libraryCards .light-cone').evaluate_all('es=>es.map(e=>Math.round(e.getBoundingClientRect().top))');assert len(set(rows[:3]))==len(set(rows[3:]))==1 and rows[3]>rows[0],rows
 assert page.evaluate('window.__SKY_STUDIO_TEST__.normalize({score:{events:[]}}).playback.sustain')==0
 records=[]
 for theme in ['prairie','rainforest','vault']:
  id=theme+'-demo';page.locator('[data-song-id='+id+'] .card-play').click();assert page.locator('#playerView').get_attribute('data-theme')==theme
  cell=page.get_by_role('spinbutton',name='延音',exact=True);assert cell.get_attribute('aria-valuenow')=='0' and page.evaluate('window.__SKY_STUDIO_TEST__.state.sustain')==0
  score=page.evaluate('({score:window.__SKY_STUDIO_TEST__.state.project.score,kind:window.__SKY_STUDIO_TEST__.state.project.originKind,volume:window.__SKY_STUDIO_TEST__.state.volume})');assert len(score['score']['events'])==32 and score['kind']=='builtin' and score['volume']==.25
  page.locator('#playBtn').click();page.wait_for_function('window.__SKY_STUDIO_TEST__.state.isPlaying&&window.__SKY_STUDIO_TEST__.state.activeVoices.size>0');page.wait_for_timeout(250);zero=page.evaluate('window.__SKY_STUDIO_TEST__.state.wetBus.gain.value');assert abs(zero-.012)<.003,zero;page.locator('#playBtn').click()
  cell.press('End');page.wait_for_timeout(350);high=page.evaluate('window.__SKY_STUDIO_TEST__.state.wetBus.gain.value');assert abs(high-.412)<.003,high
  page.locator('#scoreEditorBtn').click();assert page.evaluate('window.__SKY_STUDIO_TEST__.state.sustain')==1;page.locator('#consoleClose').click();page.locator('#discardChanges').click();assert cell.get_attribute('aria-valuenow')=='100'
  page.locator('#backLibrary').click();page.locator('[data-song-id='+id+'] .card-play').click();assert cell.get_attribute('aria-valuenow')=='0' and page.evaluate('window.__SKY_STUDIO_TEST__.state.project.playback.sustain')==0
  page.wait_for_timeout(350);assert abs(page.evaluate('window.__SKY_STUDIO_TEST__.state.wetBus.gain.value')-.012)<.003
  page.screenshot(path=str(out/(theme+'-player.png')));page.locator('#backLibrary').click();records.append({'theme':theme,'events':32,'sustainZeroAudioGain':zero,'sustainFullAudioGain':high,'sameVisitRetained':True,'newEntryReset':True})
 page.reload();page.locator('[data-song-id=prairie-demo] .card-play').click();assert page.get_by_role('spinbutton',name='延音',exact=True).get_attribute('aria-valuenow')=='0';assert not errors,errors;b.close()
(out/'results.json').write_text(json.dumps({'passed':True,'cards':6,'rows':rows,'newPresets':records,'errors':errors},ensure_ascii=False,indent=2),'utf-8');print('PASS six builtin cards, three original offline-playable scores, zero sustain UI/state/audio, control-console preservation and re-entry reset')
