"""Prove configuration independence and reuse the same interactions across songs/themes."""
import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import shutil
import sys
import threading
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, required=True)
out = parser.parse_args().output.resolve()
out.mkdir(parents=True, exist_ok=False)
root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / 'scripts'))
from configuration import render, generate
generate(root, check=True)
baseline = render(root)


def variant(name):
    target = out / name
    shutil.copytree(root / 'config', target / 'config')
    (target / 'app').mkdir()
    shutil.copy2(root / 'app/styles.css', target / 'app/styles.css')
    return target


def edit(path, transform):
    data = json.loads(path.read_text(encoding='utf-8'))
    transform(data)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')


score_variant = variant('score-only')
edit(score_variant / 'config/scores/canon.json', lambda data: data['events'][0]['notes'].append(next(n for n in range(1, 16) if n not in data['events'][0]['notes'])))
score_result = render(score_variant)
assert score_result['app/js/builtins.js'] != baseline['app/js/builtins.js']
decode=lambda text:json.loads(text.split('window.SKY_STUDIO_CONFIG=',1)[1].rstrip(';\n'))
assert decode(score_result['app/js/studio-config.js'])['themes'] == decode(baseline['app/js/studio-config.js'])['themes']
assert decode(score_result['app/js/studio-config.js'])['player'] == decode(baseline['app/js/studio-config.js'])['player']
assert score_result['app/player-styles.css'] == baseline['app/player-styles.css']
theme_variant = variant('theme-only')
edit(theme_variant / 'config/themes/christmas.json', lambda data: data['appearance'].update(note='#123456'))
theme_result = render(theme_variant)
assert theme_result['app/js/builtins.js'] == baseline['app/js/builtins.js']
assert theme_result['app/js/studio-config.js'] != baseline['app/js/studio-config.js']
interaction_variant = variant('interaction-only')
edit(interaction_variant / 'config/player-interactions.json', lambda data: data['selectors'].update(instrumentRowsBelow=1))
interaction_result = render(interaction_variant)
assert interaction_result['app/js/builtins.js'] == baseline['app/js/builtins.js']
assert interaction_result['app/player-styles.css'] == baseline['app/player-styles.css']
assert interaction_result['app/js/studio-config.js'] != baseline['app/js/studio-config.js']
new_theme_variant = variant('additional-theme')
theme = json.loads((root / 'config/themes/starlight.json').read_text(encoding='utf-8'))
theme.update(id='moonlight-test', name='MOONLIGHT TEST', displayName='独立主题检查')
theme['appearance']['note'] = '#123456'
theme['decorations'].update(tree=True,motif=False)
theme['elementRefs']['tree']='christmas.tree'
(new_theme_variant / 'config/themes/moonlight-test.json').write_text(json.dumps(theme, ensure_ascii=False), encoding='utf-8')
new_theme_config = render(new_theme_variant)['app/js/studio-config.js']
assert render(new_theme_variant)['app/js/builtins.js'] == baseline['app/js/builtins.js']


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(root / 'app'), **kwargs)

    def do_GET(self):
        if self.path == '/js/studio-config.js':
            payload = new_theme_config.encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/javascript; charset=utf-8')
            self.send_header('Content-Length', str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
        else:
            super().do_GET()

    def log_message(self, *args):
        pass


combinations = []
with sync_playwright() as pw:
    browser = pw.chromium.launch(channel='msedge', headless=True)
    page = browser.new_page(viewport={'width': 1366, 'height': 900}, reduced_motion='reduce')
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto((root / 'SkyMusicStudio_Standalone.html').as_uri())
    songs = page.evaluate('window.__SKY_STUDIO_TEST__.state.library.map(p=>p.id)')
    themes = page.evaluate('Object.keys(window.__SKY_STUDIO_TEST__.THEME_DEFINITIONS)')
    for song in songs:
        page.evaluate('(id)=>window.__SKY_STUDIO_TEST__.openSong(id)', song)
        original = page.evaluate('JSON.stringify(window.__SKY_STUDIO_TEST__.state.project.score)')
        page.locator('#scoreEditorBtn').click()
        for theme in themes:
            if not page.locator('#scoreConsole').is_visible(): page.locator('#scoreEditorBtn').click()
            page.locator('#consoleFineTab').click()
            page.locator('#consoleInspectorSlot').wait_for(state='visible')
            page.locator('#sceneEditorBtn').click()
            page.locator(f'[data-scene="{theme}"]').click()
            page.locator('[data-close="sceneDialog"]').click()
            page.locator('#consoleClose').click()
            page.locator('#saveDirect').click()
            assert page.evaluate('JSON.stringify(window.__SKY_STUDIO_TEST__.state.project.score)') == original
            assert page.locator('#playerView').get_attribute('data-theme') == theme
            assert page.locator('#beatGrid .beat').count() == 32
            page.locator('#stepNext').click()
            assert page.locator('.beat.active .beat-number').inner_text() == '002'
            page.locator('#stepPrev').click()
            page.locator('#playBtn').click()
            page.wait_for_function('window.__SKY_STUDIO_TEST__.state.isPlaying')
            page.locator('#playBtn').click()
            assert not page.evaluate('window.__SKY_STUDIO_TEST__.state.isPlaying')
            combinations.append({'score': song, 'theme': theme, 'sharedPlaybackAndNavigation': True})
        page.locator('#backLibrary').click()
    assert not errors, errors
    page.close()
    # A newly added theme JSON is discoverable in the real HTTP app without changing any JS handler.
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        page = browser.new_page(viewport={'width': 1366, 'height': 900})
        page.goto(f'http://127.0.0.1:{server.server_port}/')
        page.locator('.card-play').first.click()
        page.locator('#scoreEditorBtn').click()
        page.locator('#consoleFineTab').click()
        page.locator('#consoleInspectorSlot').wait_for(state='visible')
        page.locator('#sceneEditorBtn').click()
        page.locator('[data-scene="moonlight-test"]').click()
        page.locator('[data-close="sceneDialog"]').click()
        page.locator('#consoleClose').click()
        page.locator('#saveDirect').click()
        assert page.locator('#playerView').get_attribute('data-theme') == 'moonlight-test'
        assert page.evaluate('window.__SKY_STUDIO_TEST__.state.playerColors.note') == '#123456'
        assert page.locator('.stage-tree').is_visible()
        assert page.locator('.stage-motif').is_hidden()
        page.locator('#stepNext').click()
        assert page.locator('.beat.active .beat-number').inner_text() == '002'
        page.screenshot(path=str(out / 'additional-theme.png'), animations='disabled')
        # A behavior setting changes only the interaction layer, without changing music or appearance.
        page.evaluate('window.__SKY_STUDIO_TEST__.PLAYER_RULES.selectors.instrumentRowsBelow=1')
        page.locator('#instrumentToggle').click()
        assert page.locator('#instrumentOptions button:visible').count() == 2
        page.close()
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
    browser.close()

(out / 'results.json').write_text(json.dumps({'status': 'PASS',
    'independentScoreMutation': True, 'independentThemeMutation': True,
    'independentInteractionMutation': True, 'additionalThemeNeedsNoHandlerChange': True,
    'combinations': combinations, 'pageErrors': errors}, ensure_ascii=False, indent=2), encoding='utf-8')
print('PASS independent configurations, 9 score/theme combinations, shared interactions and new-theme discovery')
