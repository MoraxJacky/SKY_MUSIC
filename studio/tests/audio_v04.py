from pathlib import Path
from playwright.sync_api import sync_playwright
html=Path(__file__).resolve().parents[1].joinpath('SkyMusicStudio_Standalone.html').read_text('utf-8')
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
    page=b.new_page(viewport={'width':1366,'height':768})
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.route('https://tonejs.github.io/**', lambda r:r.abort())
    page.set_content(html, wait_until='domcontentloaded')
    page.locator('.song-card').first.locator('.card-play').click()
    assert page.locator('#instrumentSelect').input_value()=='offline','builtin instrument migrate'
    assert page.locator('#keySelect').input_value()=='C','builtin sky tune migrate'
    page.locator('#sustainSlider').fill('95')
    assert page.locator('#sustainValue').inner_text()=='95%'
    page.locator('#playBtn').click()
    page.wait_for_function('window.__SKY_STUDIO_TEST__.state.pianoBuffers.size>=15',timeout=24000)
    page.wait_for_timeout(550)
    audio=page.evaluate('''() => {let s=window.__SKY_STUDIO_TEST__.state;return {playing:s.isPlaying,buffers:s.pianoBuffers.size,sustain:s.sustain,wet:s.wetBus.gain.value,voices:s.activeVoices.size,key:s.tuning}}''')
    print('offline sound:',audio)
    assert audio['playing'] and audio['buffers']>=15 and audio['sustain']==.95
    assert audio['wet']>.25,'Sustain reverb not updated'
    page.locator('#playBtn').click();assert not page.evaluate('window.__SKY_STUDIO_TEST__.state.isPlaying')
    page.locator('#instrumentSelect').select_option('salamander')
    page.wait_for_function('window.__SKY_STUDIO_TEST__.state.project.playback.instrument==="offline"',timeout=15000)
    print('online unavailable -> offline fallback',page.locator('#instrumentSelect').input_value())
    assert not errors,errors
    b.close()
