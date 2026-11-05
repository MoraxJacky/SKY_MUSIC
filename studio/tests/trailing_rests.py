"""Verify suffix-only rest trimming across loaded songs, imports and saved edits."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, required=True)
out = parser.parse_args().output.resolve()
out.mkdir(parents=True, exist_ok=False)
root = Path(__file__).resolve().parents[1]
with sync_playwright() as pw:
    browser = pw.chromium.launch(channel='msedge', headless=True)
    page = browser.new_page(viewport={'width': 1366, 'height': 768})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto((root / 'SkyMusicStudio_Standalone.html').as_uri())
    report = page.evaluate('''() => {
      const T=window.__SKY_STUDIO_TEST__;
      const raw={durationMs:5000,score:{events:Array.from({length:10},(_,i)=>({timeMs:i*250,notes:[2,6].includes(i)?[1]:[],durationMs:i===2?2400:200}))}};
      const original=JSON.stringify(raw), p=T.normalize(raw), twice=T.normalize(p);
      if(p.score.events.length!==7 || p.durationMs!==2900)throw Error('Suffix or held-note duration lost');
      if(JSON.stringify(p.score.events)!==JSON.stringify(raw.score.events.slice(0,7).map(e=>({...e,velocity:85,confidence:'imported'}))))throw Error('Preserved events changed');
      if(JSON.stringify(raw)!==original)throw Error('Input mutated');
      if(JSON.stringify(p)!==JSON.stringify(twice))throw Error('Trim is not idempotent');
      if(T.normalize({durationMs:5000,score:{events:[{timeMs:0,notes:[1],durationMs:200}]}}).durationMs!==200)throw Error('Implicit blank tail retained');
      const blank=T.normalize({durationMs:1000,score:{events:[{timeMs:0,notes:[],durationMs:0},{timeMs:250,notes:[],durationMs:0}]}});
      if(blank.score.events.length!==2)throw Error('Blank editor template lost');
      return T.state.library.map(p=>({id:p.id,events:p.score.events.length,notes:p.score.events.reduce((s,e)=>s+e.notes.length,0),durationMs:p.durationMs}));
    }''')
    canon = next(p for p in report if p['id'] == 'canon-christmas')
    assert canon == {'id': 'canon-christmas', 'events': 1288, 'notes': 1399, 'durationMs': 214680}
    page.locator('.card-play').first.click()
    # All final-window sizes end at the actual music, including direct seeking to the end.
    for seconds in [8, 10, 12, 20]:
        page.locator('#rollWindow').select_option(str(seconds))
        page.locator('#seekSlider').fill('214680')
        frame = page.evaluate('window.__SKY_STUDIO_TEST__.rollFrame()')
        assert frame['end'] == 214680 and frame['phase'] == frame['windowMs']
        assert page.evaluate('window.__SKY_STUDIO_TEST__.state.project.score.events.some(e=>e.notes.length && e.timeMs >= window.__SKY_STUDIO_TEST__.rollFrame().begin)')
        # Seeking into a partial final page keeps the marker at the same screen fraction.
        page.locator('#seekSlider').fill('3000')
        before = page.evaluate('(()=>{const f=window.__SKY_STUDIO_TEST__.rollFrame();return f.phase/f.windowMs})()')
        page.locator('#rollSeekSlider').fill('214000')
        after = page.evaluate('window.__SKY_STUDIO_TEST__.rollFrame()')
        assert abs(after['phase']/after['windowMs']-before) < 1e-8
        assert after['end'] == 214680
    page.screenshot(path=str(out / 'canon-final-roll.png'), animations='disabled')
    # Import an actual JSON File, including many blank pages after the final note.
    page.evaluate('''async () => {
      const raw={id:'trim-case',title:'曲尾裁剪检查',durationMs:25000,score:{gridIntervalMs:250,events:Array.from({length:100},(_,i)=>({timeMs:i*250,notes:[0,32].includes(i)?[3]:[],durationMs:[0,32].includes(i)?200:0}))}};
      await window.__SKY_STUDIO_TEST__.importFile(new File([JSON.stringify(raw)],'trim-case.json',{type:'application/json'}));
    }''')
    assert page.locator('#seekSlider').get_attribute('max') == '8200'
    assert page.locator('#rollSeekSlider').get_attribute('max') == '8200'
    assert page.locator('#pageLabel').inner_text() == '01 / 02'
    geometry = page.locator('.grid-foot').bounding_box()
    stage_geometry = page.locator('#stagePane').bounding_box()
    page.locator('#pageNext').click()
    assert page.locator('.grid-foot').bounding_box() == geometry
    assert page.locator('#stagePane').bounding_box() == stage_geometry
    assert page.locator('#beatGrid button.beat').count() == 1
    assert page.locator('#beatGrid .beat-placeholder').count() == 31
    assert page.locator('#beatGrid .beat').count() == 32
    assert page.locator('.beat-name').inner_text() != '·'
    page.locator('#rollSeekSlider').fill('8200')
    assert page.evaluate('window.__SKY_STUDIO_TEST__.state.position') == 8200
    page.screenshot(path=str(out / 'import-trimmed.png'), animations='disabled')
    # Temporary empty insertions stay editable, then disappear on confirmed save.
    page.locator('#scoreEditorBtn').click()
    page.locator('#quickNewEvent').click()
    assert page.evaluate('window.__SKY_STUDIO_TEST__.state.project.score.events.length') == 34
    assert page.evaluate('window.__SKY_STUDIO_TEST__.state.editSource.score.events.length') == 33
    page.locator('#scoreEditorBtn').click()
    page.locator('#saveDirect').click()
    assert page.evaluate('window.__SKY_STUDIO_TEST__.state.project.score.events.length') == 33
    assert page.locator('#rollSeekSlider').get_attribute('max') == '8200'
    # Clearing the last note also removes the newly trailing rests on save.
    page.locator('#scoreEditorBtn').click()
    page.locator('.key-tile[data-note="3"]').click()
    page.locator('#scoreEditorBtn').click()
    page.locator('#saveDirect').click()
    assert page.evaluate('window.__SKY_STUDIO_TEST__.state.project.score.events.length') == 1
    assert page.locator('#seekSlider').get_attribute('max') == '200'
    assert page.locator('#rollSeekSlider').get_attribute('max') == '200'
    assert page.evaluate('window.__SKY_STUDIO_TEST__.state.position') <= 200
    assert page.locator('#pageLabel').inner_text() == '01 / 01'
    # Refresh confirms that the same trimmed score is retained in the browser library.
    page.reload()
    assert page.evaluate('window.__SKY_STUDIO_TEST__.state.project.score.events.length') == 1
    # A held note that starts on an earlier page must remain visible through the final page.
    page.evaluate('''() => {
      const T=window.__SKY_STUDIO_TEST__,p=T.normalize({id:'held-ending',durationMs:10000,score:{events:[{timeMs:0,notes:[1],durationMs:10000}]}});
      T.state.library.push(p);T.openSong(p.id);
    }''')
    page.locator('#rollWindow').select_option('8')
    page.locator('#seekSlider').fill('9500')
    assert page.evaluate('''() => {
      const T=window.__SKY_STUDIO_TEST__,cv=document.getElementById('rollCanvas'),r=cv.getBoundingClientRect(),scale=cv.width/r.width;
      const x=r.width-23,y=25+(r.height-48)/15*14.5;
      const pixel=cv.getContext('2d').getImageData(Math.floor(x*scale),Math.floor(y*scale),1,1).data;
      const color=T.state.playerColors.note;
      return [1,3,5].every((offset,i)=>Math.abs(pixel[i]-parseInt(color.slice(offset,offset+2),16))<3);
    }''')
    page.evaluate('''() => {
      const T=window.__SKY_STUDIO_TEST__,p=T.normalize({id:'empty-layout',durationMs:0,score:{events:[]}});
      T.state.library.push(p);T.openSong(p.id);
    }''')
    assert page.locator('#beatGrid .beat-placeholder').count() == 32
    assert page.locator('#pageLabel').inner_text() == '01 / 01'
    assert page.locator('#pagePrev').is_disabled() and page.locator('#pageNext').is_disabled()
    assert not errors, errors
    browser.close()
(out / 'results.json').write_text(json.dumps({'status': 'PASS', 'builtins': report,
    'leadingAndInternalRestsPreserved': True, 'heldNotesPreserved': True,
    'sourceUnchanged': True, 'importAndSaveTrimmed': True,
    'rollAndGridSynchronized': True, 'reloadPersisted': True, 'pageErrors': errors},
    ensure_ascii=False, indent=2), encoding='utf-8')
print('PASS suffix-only trim, held-note durations, import/save/reload and roll/grid synchronization')
