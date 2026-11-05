"""Check the shared left-opening range picker, hover, keyboard and playback behavior."""
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
    for width in [1366, 1024, 768, 375]:
        page = browser.new_page(viewport={'width': width, 'height': 900}, reduced_motion='reduce')
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto((root / 'SkyMusicStudio_Standalone.html').as_uri())
        page.locator('.card-play').first.click()
        assert page.locator('.key-control > span').inner_text() == '音域'
        trigger, menu = page.locator('#keyRangeToggle'), page.locator('#keyRangeMenu')
        score = page.evaluate('JSON.stringify(window.__SKY_STUDIO_TEST__.state.project.score)')
        trigger.click()
        assert menu.is_visible() and trigger.get_attribute('aria-expanded') == 'true'
        assert page.locator('#keyRangeMenu [role=option]').count() == 12
        tr, mr = trigger.bounding_box(), menu.bounding_box()
        assert mr['width'] <= 252
        assert mr['x'] >= 0 and mr['x'] + mr['width'] <= width
        assert abs(mr['y'] + mr['height']/2 - tr['y'] - tr['height']/2) < 1
        if tr['x'] >= 140:
            assert mr['x'] + mr['width'] <= tr['x']
        selected = page.locator('#keyRangeMenu [data-key=C]')
        assert selected.get_attribute('aria-selected') == 'true'
        visible = menu.evaluate('(e)=>{const r=e.getBoundingClientRect();return [...e.children].filter(b=>{const v=b.getBoundingClientRect();return v.left>=r.left&&v.right<=r.right}).length}')
        assert visible == 5, visible
        menu.hover()
        vertical = page.evaluate('scrollY')
        scroll = menu.evaluate('(e)=>e.scrollLeft')
        page.mouse.wheel(0, 100)
        page.wait_for_function('document.getElementById("keyRangeMenu").scrollLeft > 0')
        assert menu.evaluate('(e)=>e.scrollLeft') > scroll
        assert page.evaluate('scrollY') == vertical
        page.mouse.wheel(0, -100)
        page.wait_for_function('document.getElementById("keyRangeMenu").scrollLeft === 0')
        option = page.locator('#keyRangeMenu [data-key=F]')
        color = option.evaluate('(e)=>getComputedStyle(e).borderTopColor')
        option.hover()
        assert option.evaluate('(e)=>getComputedStyle(e).borderTopColor') != color
        assert page.evaluate('window.__SKY_STUDIO_TEST__.state.tuning') == 'C'
        option.click()
        assert menu.is_hidden() and trigger.get_attribute('aria-expanded') == 'false'
        assert page.locator('#keyRangeValue').inner_text() == 'F 大调'
        assert page.evaluate('window.__SKY_STUDIO_TEST__.noteName(1)') == 'F4'
        page.locator('h1#songTitle').hover()
        page.wait_for_function('getComputedStyle(document.getElementById("keyRangeToggle")).borderTopColor === "rgb(243, 210, 158)"')
        trigger.click()
        assert page.locator('#keyRangeMenu [data-key=F]').get_attribute('aria-selected') == 'true'
        page.keyboard.press('End')
        page.keyboard.press('Enter')
        assert menu.is_hidden() and page.locator('#keyRangeValue').inner_text() == 'B 大调'
        trigger.click()
        page.keyboard.press('Escape')
        assert menu.is_hidden() and trigger.evaluate('(e)=>e===document.activeElement')
        trigger.click()
        page.locator('h1#songTitle').click()
        assert menu.is_hidden()
        # All 12 values continue through the existing transposition and persistence path.
        for key in ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Fs', 'G', 'Ab', 'A', 'Bb', 'B']:
            trigger.click()
            page.locator(f'#keyRangeMenu [data-key={key}]').click()
            assert menu.is_hidden()
            assert page.evaluate('window.__SKY_STUDIO_TEST__.state.tuning') == key
        assert page.evaluate('JSON.stringify(window.__SKY_STUDIO_TEST__.state.project.score)') == score
        page.reload()
        assert page.locator('#keyRangeValue').inner_text() == 'B 大调'
        if width == 1366:
            page.locator('#playBtn').click()
            page.wait_for_function('window.__SKY_STUDIO_TEST__.state.isPlaying')
            page.locator('#keyRangeToggle').click()
            page.locator('#keyRangeMenu [data-key=G]').click()
            page.wait_for_function('window.__SKY_STUDIO_TEST__.state.isPlaying')
            assert page.evaluate('window.__SKY_STUDIO_TEST__.state.tuning') == 'G'
            page.locator('#playBtn').click()
        page.locator('#keyRangeToggle').click()
        page.screenshot(path=str(out / f'expanded-{width}.png'), animations='disabled', full_page=width <= 900)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        assert not errors, errors
        evidence.append({'width': width, 'horizontal': True, 'all12Keys': True, 'hover': True, 'keyboard': True, 'persistence': True})
        page.close()
    browser.close()
(out / 'results.json').write_text(json.dumps({'status': 'PASS', 'checks': evidence}, indent=2), encoding='utf-8')
print('PASS left-opening range picker, gold selection, hover, keyboard, 12 keys, persistence and playback')
