"""Regression checks for the v7 score layout and real playback highlight."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output',type=Path,required=True)
args=parser.parse_args()
out=args.output.resolve()
out.mkdir(parents=True,exist_ok=False)
root=Path(__file__).resolve().parents[1]
evidence=[]
with sync_playwright() as pw:
    browser=pw.chromium.launch(channel='msedge',headless=True)
    for width,height in [(1366,768),(1920,1080),(1024,768),(768,1024),(375,812),(812,375)]:
        context=browser.new_context(viewport={'width':width,'height':height},reduced_motion='reduce')
        page=context.new_page()
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto((root/'SkyMusicStudio_Standalone.html').as_uri(),wait_until='load')
        page.locator('.card-play').first.click()
        assert page.locator('#beatGrid .beat').count()==32
        assert page.locator('#beatGrid .mini-dot').count()==480
        assert page.locator('#beatGrid .beat.active').count()==1
        assert page.locator('#beatGrid [aria-current="step"]').count()==1
        cells=page.locator('#beatGrid .beat').evaluate_all('(es)=>es.map(e=>{let r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})')
        assert all(max(c['y'] for c in cells[i:i+8])-min(c['y'] for c in cells[i:i+8])<=1.1 for i in range(0,32,8))
        assert all(cells[i+8]['y']>cells[i]['y']+cells[i]['h'] for i in [0,8,16])
        assert all(.90<c['w']/c['h']<1.12 for c in cells)
        if width>900:
            assert page.locator('#timeClock').evaluate('(e)=>parseFloat(getComputedStyle(e).fontSize)')>=18
            assert page.locator('#stagePane').bounding_box()['height']>=60
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), 'Horizontal overflow'
        assert page.locator('#pagePrev').is_disabled()
        page.locator('#pageNext').click()
        assert page.locator('.beat.active .beat-number').inner_text()=='033'
        assert page.locator('#pagePrev').is_enabled()
        page.locator('#pagePrev').click()
        assert page.locator('.beat.active .beat-number').inner_text()=='001'
        page.screenshot(path=str(out/f'player-{width}x{height}.png'),animations='disabled',full_page=width<=900)
        # Selection survives playback, automatically crosses page boundaries and clears trailing glow on pause.
        page.locator('#playBtn').click()
        page.wait_for_function('window.__SKY_STUDIO_TEST__.state.isPlaying')
        page.wait_for_function('document.querySelector(".beat.active.empty") && document.querySelector(".mini-dot.resonance")')
        assert '余音' in page.locator('#currentBeat').inner_text()
        page.screenshot(path=str(out/f'playing-{width}.png'),animations='disabled')
        page.locator('#playBtn').click()
        assert page.locator('.beat.echo').count()==0
        assert page.locator('.mini-dot.resonance').count()==0
        page.locator('#seekSlider').fill('5250')
        page.locator('#playBtn').click()
        page.wait_for_function('document.querySelector(".beat.active .beat-number")?.textContent==="033"')
        assert page.locator('#pageLabel').inner_text()=='02 / 41'
        page.locator('#playBtn').click()
        page.locator('#seekSlider').fill(page.locator('#seekSlider').get_attribute('max'))
        assert page.locator('#pageNext').is_disabled()
        # The former uncertain suffix was empty; automatic trimming now ends on a note.
        assert 'empty' not in page.locator('#beatGrid button.beat').last.get_attribute('class').split()
        assert not errors,errors
        evidence.append({'viewport':[width,height],'grid':'4x8','squareCells':True,'playbackPageFollow':True,'restResonance':True,'pageErrors':errors})
        context.close()
    # Keep read-only/edit/save behavior while rendering distinct chord densities and short last pages.
    page=browser.new_page(viewport={'width':1366,'height':768})
    page.goto((root/'SkyMusicStudio_Standalone.html').as_uri(),wait_until='load')
    for index in [0,1,2]:
        page.locator('.card-play').nth(index).click()
        assert not page.locator('#inspectorPane').is_visible()
        page.locator('#scoreEditorBtn').click()
        assert page.locator('#inspectorPane').is_visible()
        if index==0:
            page.locator('#keyBoard [data-note="2"]').click()
            assert page.locator('#beatGrid .beat').first.evaluate('(e)=>e.classList.contains("poly3")')
            page.screenshot(path=str(out/'editing.png'),animations='disabled')
            page.locator('#scoreEditorBtn').click()
            page.locator('#discardChanges').click()
        else:
            page.screenshot(path=str(out/f'theme-{index}.png'),animations='disabled')
            page.locator('#scoreEditorBtn').click()
        page.locator('#backLibrary').click()
    browser.close()
(out/'results.json').write_text(json.dumps({'status':'PASS','checks':evidence},ensure_ascii=False,indent=2),'utf-8')
print('PASS legacy 4x8 layout, 6 viewports, real playback/page following, resonance, chord colors, editing and 3 themes')
