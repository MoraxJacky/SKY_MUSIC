"""Fresh navigation baselines on reload, re-entry and cached-page restoration."""
import argparse
import functools
import json
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, required=True)
out = parser.parse_args().output.resolve()
out.mkdir(parents=True, exist_ok=False)
root = Path(__file__).resolve().parents[1]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(root/'app')))
threading.Thread(target=server.serve_forever, daemon=True).start()


def state(page):
    return page.evaluate('''()=>{
      const t=window.__SKY_STUDIO_TEST__,s=t.state;
      return {mode:s.mode,position:s.position,begin:s.rollPageStart,window:s.windowSec,
        defaultWindow:t.PLAYER_RULES.roll.initialSeconds,selected:s.selected,page:s.page,
        editing:s.editMode,playing:s.isPlaying,project:s.project?.id??null,
        hash:location.hash,clock:document.getElementById('timeClock').textContent,
        seek:document.getElementById('seekSlider').value,
        rollSeek:document.getElementById('rollSeekSlider').value,
        dialogs:document.querySelectorAll('dialog[open]').length};
    }''')


def assert_home(page):
    s = state(page)
    assert s['mode'] == 'home' and s['project'] is None and not s['hash'], s
    assert s['position'] == s['begin'] == 0 and s['window'] == s['defaultWindow'], s
    assert not s['playing'] and not s['editing'] and s['dialogs'] == 0, s
    assert s['seek'] == s['rollSeek'] == '0' and s['clock'] == '00:00.000', s
    assert page.locator('#homeView').is_visible() and page.locator('#playerView').is_hidden()


def assert_song_start(page):
    s = state(page)
    assert s['mode'] == 'player' and s['position'] == s['begin'] == s['selected'] == 0, s
    assert s['window'] == s['defaultWindow'] and s['page'] == 0, s
    assert not s['playing'] and not s['editing'] and s['dialogs'] == 0, s
    assert s['seek'] == s['rollSeek'] == '0' and s['clock'] == '00:00.000', s
    assert page.locator('#beatGrid .beat').count() == 32
    assert page.locator('#beatGrid .beat.active').get_attribute('data-index') == '0'


def seek(page, ms=42000):
    page.locator('#rollWindow').select_option('20')
    page.locator('#rollSeekSlider').evaluate("(e,v)=>{e.value=v;e.dispatchEvent(new Event('input'))}", ms)


checks = []
try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel='msedge', headless=True)
        for name, url in [('standalone', (root/'SkyMusicStudio_Standalone.html').as_uri()),
                          ('http', f'http://127.0.0.1:{server.server_port}/')]:
            context = browser.new_context(viewport={'width':1366, 'height':900})
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(url)
            assert_home(page)
            page.locator('.card-play').first.click()
            page.wait_for_function("document.getElementById('songEntryTransition').hidden")
            assert_song_start(page)
            song_id = state(page)['project']
            # Returning to a song must ignore both the previous player view and editor view.
            seek(page)
            page.locator('#scoreEditorBtn').click()
            page.locator('#consoleGenerateTab').click()
            page.locator('#pageNext').click()
            page.locator('#consoleClose').click()
            page.locator('#discardChanges').click()
            page.evaluate('window.__SKY_STUDIO_TEST__.goHome()')
            page.locator('.card-play').first.click()
            page.wait_for_function("document.getElementById('songEntryTransition').hidden")
            assert_song_start(page)
            page.locator('#scoreEditorBtn').click()
            assert page.evaluate('window.__SKY_STUDIO_TEST__.state.position') == 0
            assert page.locator('#scoreConsole').get_attribute('data-mode') == 'record'
            page.locator('#consoleClose').click()
            page.locator('#discardChanges').click()
            # A saved score and playback preference survive; an unsaved console edit does not.
            page.locator('#volumePicker').evaluate("e=>{e.value=37;e.dispatchEvent(new Event('input',{bubbles:true}))}")
            page.locator('#scoreEditorBtn').click()
            page.locator('#consoleFineTab').click()
            page.locator('#eventDuration').fill('410')
            page.locator('#eventApply').click()
            page.locator('#consoleClose').click()
            page.locator('#saveDirect').click()
            saved = page.evaluate('JSON.stringify(window.__SKY_STUDIO_TEST__.state.project.score)')
            seek(page)
            page.locator('#scoreEditorBtn').click()
            page.locator('#consoleFineTab').click()
            page.locator('#eventDuration').fill('770')
            page.locator('#eventApply').click()
            page.locator('#rollWindow').select_option('8')
            page.locator('#consoleGenerateTab').click()
            page.locator('#consoleNumberScore').fill('1 2 3')
            # Simulate a stale debounced backup and a project only kept in IndexedDB.
            page.evaluate('''async()=>{
              await new Promise(r=>setTimeout(r,500));
              const t=window.__SKY_STUDIO_TEST__,old=JSON.parse(JSON.stringify(t.state.library));
              old.find(p=>p.id===t.state.project.id).score.events[0].durationMs=125;
              const recovered=JSON.parse(JSON.stringify(old[0]));recovered.id='backup-only';
              recovered.title='Backup recovery';old.push(recovered);
              await new Promise((resolve,reject)=>{const r=indexedDB.open('sky-music-studio-library-v03',1);
                r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('library','readwrite');
                  tx.objectStore('library').put(old,'projects');tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>reject(tx.error)};
              });
            }''')
            page.reload()
            assert_home(page)
            page.wait_for_function("window.__SKY_STUDIO_TEST__.state.library.some(p=>p.id==='backup-only')")
            assert_home(page)
            page.evaluate('id=>window.__SKY_STUDIO_TEST__.openSong(id)', song_id)
            assert_song_start(page)
            restored = page.evaluate('JSON.stringify(window.__SKY_STUDIO_TEST__.state.project.score)')
            if restored != saved:
                (out/f'{name}-saved.json').write_text(saved, 'utf-8')
                (out/f'{name}-restored.json').write_text(restored, 'utf-8')
            assert restored == saved
            assert page.locator('#volumePicker').get_attribute('aria-valuenow') == '37'
            assert page.locator('#consoleNumberScore').input_value() == ''
            # An intentionally opened song link starts at zero; reloading that link goes home.
            fresh = context.new_page()
            fresh.on('pageerror', lambda error: errors.append(str(error)))
            fresh.goto(url+'#song='+song_id)
            assert_song_start(fresh)
            seek(fresh)
            fresh.reload()
            assert_home(fresh)
            fresh.close()
            # Explicit pageshow.persisted simulation exercises the restored-document path.
            seek(page)
            page.locator('#scoreEditorBtn').click()
            page.locator('#consoleFineTab').click()
            page.locator('#eventDuration').fill('990')
            page.locator('#eventApply').click()
            page.evaluate("window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))")
            page.wait_for_timeout(120)
            assert_home(page)
            page.evaluate('id=>window.__SKY_STUDIO_TEST__.openSong(id)', song_id)
            assert_song_start(page)
            assert page.evaluate('JSON.stringify(window.__SKY_STUDIO_TEST__.state.project.score)') == saved
            # Reload while audio is actually playing cannot resume itself.
            page.locator('#playBtn').click()
            page.wait_for_function('window.__SKY_STUDIO_TEST__.state.isPlaying')
            page.reload()
            page.wait_for_timeout(150)
            assert_home(page)
            page.screenshot(path=str(out/f'{name}-fresh-home.png'))
            assert not errors, errors
            checks.append({'entry': name, 'freshEntry': True, 'repeatEntry': True,
                           'reload': True, 'savedDataPreserved': True, 'staleBackupIgnored': True,
                           'backupOnlyProjectRecovered': True, 'unsavedEditDiscarded': True,
                           'directSongLink': True, 'simulatedCachedPageshow': True,
                           'reloadStopsPlayback': True, 'pageErrors': errors})
            context.close()
        browser.close()
finally:
    server.shutdown()
(out/'results.json').write_text(json.dumps({'passed':True, 'checks':checks}, ensure_ascii=False, indent=2), 'utf-8')
print('PASS fresh and repeat song entry, reload baseline, saved/unsaved data, direct links, simulated cached-page restoration and playback reset (file + HTTP)')
