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
        track = page.locator('#keyRangeTrack')
        score = page.evaluate('JSON.stringify(window.__SKY_STUDIO_TEST__.state.project.score)')
        trigger.click()
        assert menu.is_visible() and trigger.get_attribute('aria-expanded') == 'true'
        assert page.locator('#keyRangeMenu [role=option]').count() == 13
        tr, mr = trigger.bounding_box(), menu.bounding_box()
        assert mr['width'] <= 272
        assert menu.evaluate('(e)=>getComputedStyle(e).borderTopWidth') == '0px'
        assert 'linear-gradient' in menu.evaluate('(e)=>getComputedStyle(e).maskImage')
        assert menu.evaluate('(e)=>getComputedStyle(e,"::before").content') == 'none'
        assert menu.evaluate('(e)=>getComputedStyle(e,"::after").content') == 'none'
        assert mr['x'] >= 0 and mr['x'] + mr['width'] <= width
        assert abs(mr['y'] + mr['height']/2 - tr['y'] - tr['height']/2) < 1
        if tr['x'] >= 140:
            assert mr['x'] + mr['width'] <= tr['x']
        selected = page.locator('#keyRangeMenu [data-key=C]')
        assert selected.get_attribute('aria-selected') == 'true'
        visible = menu.evaluate('(e)=>{const r=e.getBoundingClientRect();return [...e.querySelectorAll("[role=option]")].filter(b=>{const v=b.getBoundingClientRect();return v.left>=r.left&&v.right<=r.right}).length}')
        assert visible == 5, visible
        menu.hover()
        vertical = page.evaluate('scrollY')
        scroll = float(menu.get_attribute('data-position'))*49
        page.mouse.wheel(0, 100)
        page.wait_for_function('(v)=>Number(document.getElementById("keyRangeMenu").dataset.position)*49 > v',arg=scroll)
        page.wait_for_timeout(350)
        distance = float(menu.get_attribute('data-position'))*49 - scroll
        assert 0 < distance <= 24, distance
        assert page.evaluate('scrollY') == vertical
        page.mouse.wheel(0, -100)
        page.wait_for_function('(v)=>Math.abs(Number(document.getElementById("keyRangeMenu").dataset.position)*49-v)<1',arg=scroll)
        if width == 1366:
            positions = page.evaluate('''async () => {
              const track=document.getElementById('keyRangeTrack'),menu=document.getElementById('keyRangeMenu'),base=Number(menu.dataset.position)*49,samples=[];
              track.dispatchEvent(new WheelEvent('wheel',{deltaY:1200,bubbles:true,cancelable:true}));
              for(let i=0;i<28;i++){await new Promise(requestAnimationFrame);samples.push(Number(menu.dataset.position)*49-base)}
              return samples;
            }''')
            assert max(positions) <= 24, positions
            assert any(0 < p < max(positions) for p in positions), positions
            assert max(b-a for a,b in zip(positions, positions[1:])) < 12, positions
        assert all(abs(w-44) < .1 for w in page.locator('#keyRangeMenu [role=option]').evaluate_all('(es)=>es.map(e=>e.getBoundingClientRect().width)'))
        if width == 1366:
            menu.hover();start=float(menu.get_attribute('data-position'))
            for _ in range(65):page.mouse.wheel(0,120);page.wait_for_timeout(8)
            page.wait_for_timeout(400);forward=float(menu.get_attribute('data-position'));assert forward-start>26
            for _ in range(130):page.mouse.wheel(0,-120);page.wait_for_timeout(8)
            page.wait_for_timeout(400);assert float(menu.get_attribute('data-position'))-forward < -52
        page.keyboard.press('End');page.keyboard.press('ArrowRight');assert page.evaluate('document.activeElement.dataset.key')=='sky-original'
        page.keyboard.press('ArrowLeft');assert page.evaluate('document.activeElement.dataset.key')=='B'
        page.keyboard.press('Home')
        for _ in range(6):page.keyboard.press('ArrowRight')
        option = page.locator('#keyRangeMenu [data-key=F]')
        option.evaluate('(e)=>e.blur()')
        page.locator('h1#songTitle').hover()
        page.wait_for_timeout(220)
        color = option.evaluate('(e)=>getComputedStyle(e).borderTopColor')
        option.hover()
        page.wait_for_function('(color)=>getComputedStyle(document.querySelector("#keyRangeMenu [data-key=F]")).borderTopColor !== color', arg=color)
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
        saved_id=page.evaluate('window.__SKY_STUDIO_TEST__.state.project.id')
        page.reload()
        assert page.locator('#homeView').is_visible()
        page.evaluate('id=>window.__SKY_STUDIO_TEST__.openSong(id)',saved_id)
        assert page.locator('#keyRangeValue').inner_text() == 'B 大调'
        if width == 1366:
            page.locator('#playBtn').click()
            page.wait_for_function('window.__SKY_STUDIO_TEST__.state.isPlaying')
            page.locator('#keyRangeToggle').click()
            for _ in range(4):page.keyboard.press('ArrowLeft')
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
print('PASS left-opening circular range picker, multiple wheel cycles, keyboard wrap, gold selection, hover, 12 keys, persistence and playback')
