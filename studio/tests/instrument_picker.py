"""The picker expands only below its fixed baseline and never pads its end boundaries."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, required=True)
out = parser.parse_args().output.resolve()
out.mkdir(parents=True, exist_ok=False)
root = Path(__file__).resolve().parents[1]
evidence = []
with sync_playwright() as pw:
    browser = pw.chromium.launch(channel='msedge', headless=True)
    for width in [1366, 768, 375]:
        page = browser.new_page(viewport={'width': width, 'height': 900}, reduced_motion='reduce')
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto((root/'SkyMusicStudio_Standalone.html').as_uri())
        page.locator('.card-play').first.click()
        for index in [0, 1, 5, 9, 10]:
            page.evaluate('(i)=>{const T=window.__SKY_STUDIO_TEST__;T.state.project.playback.instrument=T.INSTRUMENTS[i].id}', index)
            baseline = page.locator('#instrumentToggle').bounding_box()
            page.locator('#instrumentToggle').click()
            guide = page.locator('#instrumentCurrent')
            assert guide.bounding_box() == baseline
            rows = page.locator('#instrumentOptions button').evaluate_all('''es=>{
              const r=document.getElementById('instrumentMenu').getBoundingClientRect();
              return es.map((e,i)=>({i,visible:getComputedStyle(e).visibility!=='hidden',y:e.getBoundingClientRect().y,b:e.getBoundingClientRect().bottom})).filter(e=>e.visible&&e.b>r.top&&e.y<r.bottom);
            }''')
            assert sum(r['i'] < index for r in rows) == 0
            assert sum(r['i'] > index for r in rows) == min(2, 10-index)
            bounds = page.locator('#instrumentMenu').bounding_box()
            assert bounds['y'] == baseline['y']
            if index == 10:
                assert abs(bounds['y']+bounds['height']-baseline['y']-baseline['height']) < .1
            assert page.locator('#instrumentOptions [aria-selected=true]').count() == 1
            page.screenshot(path=str(out/f'picker-{width}-{index}.png'), animations='disabled', full_page=width <= 900)
            # Scrolling beyond either end stops exactly at the baseline, without empty rows.
            page.locator('#instrumentMenu').hover()
            vertical = page.evaluate('scrollY')
            page.mouse.wheel(0, -1200 if index == 0 else 1200)
            page.wait_for_timeout(550)
            assert guide.bounding_box() == baseline
            assert page.locator('#instrumentMenu').bounding_box()['y'] == baseline['y']
            position=page.locator('#instrumentMenu').evaluate('(e)=>Number(e.dataset.position)')
            assert abs(position-round(position)) < .001
            assert page.evaluate('scrollY') == vertical
            if index in [0, 10]:
                assert page.locator('#instrumentMenu').evaluate('(e)=>Number(e.dataset.position)') == index
            page.keyboard.press('Escape')
            assert page.locator('#instrumentMenu').is_hidden()
            assert page.locator('#instrumentToggle').bounding_box() == baseline
        # Keyboard navigation also stops at the ends and keeps the original frame fixed.
        page.locator('#instrumentToggle').click()
        page.keyboard.press('Home')
        page.keyboard.press('ArrowUp')
        assert page.locator('#instrumentMenu').evaluate('(e)=>Number(e.dataset.position)') == 0
        page.keyboard.press('End')
        page.keyboard.press('ArrowDown')
        assert page.locator('#instrumentMenu').evaluate('(e)=>Number(e.dataset.position)') == 10
        page.keyboard.press('Escape')
        assert not errors, errors
        evidence.append({'width': width, 'fixedBaseline': True, 'downwardOnly': True, 'twoBelow': True, 'noBoundaryPadding': True})
        page.close()
    browser.close()
(out/'results.json').write_text(json.dumps({'status':'PASS','checks':evidence},indent=2),encoding='utf-8')
print('PASS fixed picker baseline, downward-only expansion, 2 rows below, first/last boundaries and bounded wheel/keyboard')
