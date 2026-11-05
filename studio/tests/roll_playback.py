"""Real-browser checks for paged scanning, independent seeking and the final page."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
out = args.output.resolve()
out.mkdir(parents=True, exist_ok=False)
root = Path(__file__).resolve().parents[1]

with sync_playwright() as pw:
    browser = pw.chromium.launch(channel='msedge', headless=True)
    page = browser.new_page(viewport={'width': 1366, 'height': 768})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto((root / 'SkyMusicStudio_Standalone.html').as_uri())
    page.locator('.card-play').first.click()
    # Frozen page, moving marker, and the same rules for every window size.
    for seconds in [8, 10, 12, 20]:
        page.locator('#rollWindow').select_option(str(seconds))
        page.locator('#seekSlider').fill(str(seconds * 1000 + 2300))
        frame = page.evaluate('window.__SKY_STUDIO_TEST__.rollFrame()')
        assert frame['begin'] == seconds * 1000 and frame['phase'] == 2300
        page.locator('#rollSeekSlider').fill('99000')
        after = page.evaluate('window.__SKY_STUDIO_TEST__.rollFrame()')
        assert after['phase'] == frame['phase'] and after['begin'] == 96700
        # Seeking to the very beginning can expose an empty lead-in without moving the marker.
        page.locator('#rollSeekSlider').fill('0')
        assert page.evaluate('window.__SKY_STUDIO_TEST__.rollFrame().phase') == 2300
        assert page.evaluate('window.__SKY_STUDIO_TEST__.rollFrame().begin') == -2300
    page.locator('#rollWindow').select_option('8')
    page.locator('#seekSlider').fill('7800')
    page.locator('#playBtn').click()
    page.wait_for_function('window.__SKY_STUDIO_TEST__.state.isPlaying')
    page.wait_for_function('window.__SKY_STUDIO_TEST__.rollFrame().begin === 8000')
    page.locator('#playBtn').click()
    frozen = page.evaluate('window.__SKY_STUDIO_TEST__.rollFrame()')
    page.wait_for_timeout(100)
    assert page.evaluate('window.__SKY_STUDIO_TEST__.rollFrame()') == frozen
    # Repeated drag events preserve the marker and a single running audio clock.
    page.locator('#playBtn').click()
    page.wait_for_function('window.__SKY_STUDIO_TEST__.state.isPlaying')
    drift = page.evaluate('''() => {
      const T=window.__SKY_STUDIO_TEST__, e=document.getElementById('rollSeekSlider');
      const phase=T.rollFrame(T.state.mediaAnchor+(T.state.audioCtx.currentTime-T.state.clockAnchor)*1000*T.state.rate).phase;
      for(let i=0;i<80;i++){e.value=30000+i*100;e.dispatchEvent(new Event('input',{bubbles:true}))}
      return {difference:T.rollFrame().phase-phase, playing:T.state.isPlaying, target:T.state.position};
    }''')
    assert drift['playing'] and drift['target'] == 37900 and 0 <= drift['difference'] < 150
    page.wait_for_function('window.__SKY_STUDIO_TEST__.state.position > 37980')
    page.locator('#playBtn').click()
    page.screenshot(path=str(out / 'paged-roll.png'), animations='disabled')
    # Finish between boundaries and exactly at a boundary: final page never wraps to empty.
    for duration in [10000, 8000]:
        page.evaluate('(d)=>window.__SKY_STUDIO_TEST__.state.project.durationMs=d', duration)
        page.locator('#seekSlider').fill(str(duration - 160))
        page.locator('#playBtn').click()
        page.wait_for_function('window.__SKY_STUDIO_TEST__.state.rollFinish !== null')
        end = page.evaluate('''() => {
          const T=window.__SKY_STUDIO_TEST__;
          return {position:T.state.position,playing:T.state.isPlaying,...T.rollFrame()};
        }''')
        assert end['position'] == duration and not end['playing']
        assert end['begin'] == (8000 if duration == 10000 else 0)
        if duration == 10000:
            page.wait_for_timeout(100)
            assert page.evaluate('window.__SKY_STUDIO_TEST__.rollFrame().phase') > end['phase']
        # Advance only the visual tail clock; playback time stays at the true end.
        page.evaluate('window.__SKY_STUDIO_TEST__.state.rollFinish.at -= 30000')
        page.wait_for_function('window.__SKY_STUDIO_TEST__.state.rollFinishRaf === 0')
        final = page.evaluate('window.__SKY_STUDIO_TEST__.rollFrame()')
        assert final['phase'] == 8000 and final['begin'] == end['begin']
        assert page.evaluate('window.__SKY_STUDIO_TEST__.state.position') == duration
        page.wait_for_timeout(100)
        assert page.evaluate('window.__SKY_STUDIO_TEST__.rollFrame()') == final
        page.screenshot(path=str(out / f'final-{duration}.png'), animations='disabled')
        page.locator('#rollWindow').select_option('10')
        assert page.evaluate('window.__SKY_STUDIO_TEST__.rollFrame().phase') == 10000
        assert page.evaluate('window.__SKY_STUDIO_TEST__.rollFrame().begin') == duration - 10000
        page.locator('#rollWindow').select_option('8')
        page.locator('#rollSeekSlider').fill('1500')
        assert page.evaluate('window.__SKY_STUDIO_TEST__.state.rollFinish === null')
    page.locator('#playBtn').click()
    page.wait_for_function('window.__SKY_STUDIO_TEST__.state.isPlaying')
    page.locator('#backLibrary').click()
    assert page.locator('#homeView').is_visible()
    assert page.evaluate('!window.__SKY_STUDIO_TEST__.state.isPlaying && window.__SKY_STUDIO_TEST__.state.rollFinish === null')
    assert not errors, errors
    browser.close()

(out / 'results.json').write_text(json.dumps({
    'status': 'PASS', 'windows': [8, 10, 12, 20], 'pagedScan': True,
    'seekPreservesPhase': True, 'rapidSeekKeepsPlayback': True,
    'finalPagePersists': True, 'exactBoundaryEnd': True, 'pageErrors': errors,
}, indent=2), encoding='utf-8')
print('PASS paged scan, phase-preserving seek, rapid playback seek, pause and final-page hold')
