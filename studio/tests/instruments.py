"""Verify actual audio banks, all transpositions and the bounded themed picker."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--online', action='store_true', help='Also fetch/decode every real online bank')
args = parser.parse_args()
out = args.output.resolve()
out.mkdir(parents=True, exist_ok=False)
root = Path(__file__).resolve().parents[1]
results = {'offline': [], 'online': [], 'ui': []}

probe = '''async id => {
 const T=window.__SKY_STUDIO_TEST__,s=T.state;
 await T.chooseInstrument(id);
 if(s.project.playback.instrument!==id)throw Error('Unexpected fallback: '+id);
 const bank=await T.loadInstrumentBank(id),old=s.tuning;
 let checks=0;
 for(const key of Object.keys(T.KEY_ROOTS)){
  s.tuning=key;
  for(let n=1;n<=15;n++){
   const midi=T.noteMidi(n);T.triggerSample(n,s.audioCtx.currentTime+.1,180);
   const voice=[...s.activeVoices].at(-1);
   if(!voice)throw Error('No audio voice: '+id+' '+key+' '+n);
   const root=[...bank].find(([pitch,buffer])=>buffer===voice.buffer)?.[0];
   const ratio=2**((midi-root)/12);
   if(!Number.isFinite(ratio)||Math.abs(voice.playbackRate.value-ratio)>1e-6)throw Error('Incorrect pitch');
   voice.stop();s.activeVoices.delete(voice);checks++;
  }
 }
 s.tuning=old;
 for(const buffer of bank.values()){
  const data=buffer.getChannelData(0);let peak=0;
  for(let i=0;i<data.length;i+=Math.max(1,Math.floor(data.length/2048)))peak=Math.max(peak,Math.abs(data[i]));
  if(peak<.0001)throw Error('Silent audio sample: '+id);
 }
 return {id,samples:bank.size,repairedNotes:bank.repairedNotes||[],transpositionChecks:checks,allBuffersNonSilent:true};
}'''

with sync_playwright() as pw:
    browser = pw.chromium.launch(channel='msedge', headless=True)
    page = browser.new_page(viewport={'width': 1366, 'height': 900})
    errors, requests = [], []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.route('https://**/*', lambda route: (requests.append(route.request.url), route.abort()))
    page.goto((root / 'SkyMusicStudio_Standalone.html').as_uri())
    page.locator('.card-play').first.click()
    page.locator('#playBtn').click()
    page.wait_for_function('window.__SKY_STUDIO_TEST__.state.isPlaying')
    page.locator('#playBtn').click()
    catalogue = page.evaluate('window.__SKY_STUDIO_TEST__.INSTRUMENTS')
    for spec in catalogue:
        if spec['mode'] == 'offline':
            results['offline'].append(page.evaluate(probe, spec['id']))
    assert not requests, 'Offline voices attempted a network request'
    assert [r['samples'] for r in results['offline']] == [20, 36, 36, 36, 36]
    assert all(r['transpositionChecks'] == 195 for r in results['offline'])
    # Sky original is a separate named preset, with the verified ordinary piano baseline.
    page.locator('#keyRangeToggle').click()
    page.locator('#keyRangeMenu [data-key="sky-original"]').click()
    assert page.locator('#keyRangeValue').inner_text() == '光遇原调'
    assert page.evaluate('[window.__SKY_STUDIO_TEST__.noteMidi(1),window.__SKY_STUDIO_TEST__.noteMidi(15)]') == [60, 84]
    # A failed online load is complete fallback, never a partially playable bank.
    await_result = page.evaluate('window.__SKY_STUDIO_TEST__.chooseInstrument("online-violin")')
    assert page.evaluate('window.__SKY_STUDIO_TEST__.state.project.playback.instrument') == 'offline'
    assert page.locator('#instrumentValue').inner_text() == '经典钢琴'
    # A late failed online load must not overwrite a newer user choice.
    page.evaluate('''async () => {
      const T=window.__SKY_STUDIO_TEST__;
      await Promise.all([T.chooseInstrument('online-violin'),T.chooseInstrument('offline-music-box')]);
      if(T.state.project.playback.instrument!=='offline-music-box')throw Error('Stale load replaced latest selection');
    }''')
    # New voice IDs and Sky baseline survive the actual portable-project unpack path.
    restored = page.evaluate('''async () => {
      const T=window.__SKY_STUDIO_TEST__,p=T.state.project;p.playback.tuning='sky-original';
      const bytes=T.makeZip({'manifest.json':JSON.stringify(p),'score.json':JSON.stringify(p.score),'scene.json':JSON.stringify(p.theme),'playback.json':JSON.stringify(p.playback)});
      return (await T.unpackProject(bytes)).playback;
    }''')
    assert restored['instrument'] == 'offline-music-box' and restored['tuning'] == 'sky-original'
    page.locator('#playBtn').click()
    page.wait_for_function('window.__SKY_STUDIO_TEST__.state.isPlaying')
    page.evaluate('''async () => {
      const T=window.__SKY_STUDIO_TEST__;
      await Promise.all([T.chooseInstrument('online-violin'),T.chooseInstrument('offline-flute')]);
      if(!T.state.isPlaying||T.state.project.playback.instrument!=='offline-flute')throw Error('Rapid switch lost playback');
    }''')
    page.locator('#instrumentToggle').click()
    page.locator('#instrumentOptions [data-instrument="offline-harp"]').click()
    page.wait_for_function('window.__SKY_STUDIO_TEST__.state.isPlaying && window.__SKY_STUDIO_TEST__.state.project.playback.instrument === "offline-harp"')
    page.locator('#playBtn').click()
    assert not errors, errors
    page.close()
    for width in [1366, 768, 375]:
        page = browser.new_page(viewport={'width': width, 'height': 900}, reduced_motion='reduce')
        page.goto((root / 'SkyMusicStudio_Standalone.html').as_uri())
        page.locator('.card-play').first.click()
        baseline = page.locator('#instrumentToggle').bounding_box()
        page.locator('#instrumentToggle').click()
        menu, track = page.locator('#instrumentMenu'), page.locator('#instrumentOptions')
        assert menu.is_visible()
        box = menu.bounding_box()
        assert 0 <= box['x'] and box['x']+box['width'] <= width
        current = page.locator('#instrumentCurrent').bounding_box()
        assert current == baseline
        vertical = page.evaluate('scrollY')
        track.hover()
        page.mouse.wheel(0, 1200)
        page.wait_for_timeout(550)
        distance = menu.evaluate('(e)=>Number(e.dataset.position)') * (baseline['height'] + 5)
        assert 0 < distance <= baseline['height']+5.1, distance
        assert page.evaluate('scrollY') == vertical
        assert page.locator('#instrumentCurrent').bounding_box() == current
        page.screenshot(path=str(out / f'instruments-{width}.png'), animations='disabled', full_page=width <= 900)
        if width == 1366:
            for theme in ['christmas', 'starlight', 'citylights']:
                assert page.evaluate('''theme => {
                  const T=window.__SKY_STUDIO_TEST__;T.state.project.theme={id:theme};
                  T.applyPlayerTemplate(T.state.project,document.getElementById('playerView'));
                  const expected=T.state.playerColors.surfaceEnd;
                  const rgb=[1,3,5].map(i=>parseInt(expected.slice(i,i+2),16));
                  return getComputedStyle(document.getElementById('instrumentMenu')).backgroundColor==='rgb('+rgb.join(', ')+')';
                }''', theme)
                page.screenshot(path=str(out / f'instruments-theme-{theme}.png'), animations='disabled')
        page.keyboard.press('Escape')
        assert menu.is_hidden()
        results['ui'].append({'width': width, 'pinnedSelection': True, 'boundedSmoothWheel': True})
        page.close()
    if args.online:
        page = browser.new_page(viewport={'width': 1366, 'height': 900})
        page.goto((root / 'SkyMusicStudio_Standalone.html').as_uri())
        page.locator('.card-play').first.click()
        page.locator('#playBtn').click()
        page.wait_for_function('window.__SKY_STUDIO_TEST__.state.isPlaying')
        page.locator('#playBtn').click()
        for spec in catalogue:
            if spec['mode'] == 'online':
                print('Checking actual online bank:', spec['id'], flush=True)
                result = page.evaluate(probe, spec['id'])
                results['online'].append(result)
                (out / 'online-progress.json').write_text(json.dumps(results['online'], indent=2), encoding='utf-8')
        assert len(results['online']) == 6
        page.reload()
        assert page.locator('#instrumentValue').inner_text() == '合唱'
        page.close()
    browser.close()
(out / 'results.json').write_text(json.dumps({'status': 'PASS', **results}, ensure_ascii=False, indent=2), encoding='utf-8')
print('PASS instrument audio, 12 major keys + Sky baseline, failure fallback and themed picker')
