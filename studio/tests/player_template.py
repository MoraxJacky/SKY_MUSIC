"""One shell across themes, portable custom appearance, stable scene canvas and navigation."""
import argparse
import json
from pathlib import Path
import zipfile
from playwright.sync_api import sync_playwright

parser=argparse.ArgumentParser()
parser.add_argument('--output',type=Path,required=True)
args=parser.parse_args()
out=args.output.resolve();out.mkdir(parents=True,exist_ok=False)
root=Path(__file__).resolve().parents[1]
with sync_playwright() as pw:
    browser=pw.chromium.launch(channel='msedge',headless=True)
    page=browser.new_page(viewport={'width':1366,'height':768},reduced_motion='reduce',accept_downloads=True)
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto((root/'SkyMusicStudio_Standalone.html').as_uri(),wait_until='load')
    page.locator('.card-play').first.click()
    page.wait_for_function('(()=>{let e=document.getElementById("sceneCanvas"),r=e.getBoundingClientRect();return Math.abs(e.height-r.height*devicePixelRatio)<1.1})()')
    assert page.locator('#identitySnow').is_visible()
    assert page.locator('#stagePane img.stage-tree').evaluate('(e)=>e.complete&&e.naturalWidth>0&&e.src.startsWith("data:image/png")')
    # The same score and DOM geometry survives all 3 theme switches.
    page.locator('#scoreEditorBtn').click()
    score=page.evaluate('JSON.stringify(window.__SKY_STUDIO_TEST__.state.project.score)')
    geometry=page.locator('.workspace').bounding_box()
    themes=[]
    for theme in ['starlight','citylights','christmas']:
        page.locator('#sceneEditorBtn').click()
        page.locator(f'[data-scene="{theme}"]').click()
        page.locator('[data-close="sceneDialog"]').click()
        assert page.locator('#playerView').get_attribute('data-template')=='legacy-v7'
        assert page.locator('#playerView').get_attribute('data-theme')==theme
        assert page.locator('.workspace').bounding_box()==geometry
        assert page.evaluate('JSON.stringify(window.__SKY_STUDIO_TEST__.state.project.score)')==score
        page.screenshot(path=str(out/f'{theme}-editor.png'),animations='disabled')
        themes.append(theme)
    # Import a data-only appearance through the real theme/project container functions.
    page.evaluate('''async () => {
      const T=window.__SKY_STUDIO_TEST__;
      const theme={id:'starlight',name:'海边月夜',accent:'#a8ddd9',backgroundColor:'#102e39',motion:'off',appearance:{surfaceStart:'#183e48',surfaceEnd:'#102b36',button:'#204651',gridStart:'#244b53',note:'#d3f1e6',unsafe:'url(https://example.invalid/x)',hover:'url(https://example.invalid/x)'}};
      const data=T.makeZip({'manifest.json':JSON.stringify({format:'skytheme',schemaVersion:1}),'scene.json':JSON.stringify(theme)});
      await T.importFile(new File([data],'moonlight.skytheme',{type:'application/zip'}));
    }''')
    assert page.locator('#playerView').evaluate('(e)=>getComputedStyle(e).getPropertyValue("--player-surface-start").trim()')=='#183e48'
    assert page.locator('#playerView').evaluate('(e)=>getComputedStyle(e).getPropertyValue("--player-hover").trim()')=='#3a4c69'
    assert page.locator('#playerView').evaluate('(e)=>e.classList.contains("motion-off")')
    page.locator('#sceneEditorBtn').click()
    with page.expect_download() as download:
        page.locator('#themeExportBtn').click()
    exported=download.value;exported.save_as(out/'moonlight.skytheme')
    with zipfile.ZipFile(out/'moonlight.skytheme') as archive:
        scene=json.loads(archive.read('scene.json'))
        assert scene['appearance']['surfaceStart']=='#183e48'
    page.locator('[data-close="sceneDialog"]').click()
    page.locator('#scoreEditorBtn').click();page.locator('#saveDirect').click()
    page.reload(wait_until='load')
    assert page.locator('#playerView').get_attribute('data-template')=='legacy-v7'
    assert page.locator('#playerView').evaluate('(e)=>getComputedStyle(e).getPropertyValue("--player-surface-start").trim()')=='#183e48'
    assert page.evaluate('JSON.stringify(window.__SKY_STUDIO_TEST__.state.project.score)')==score
    page.screenshot(path=str(out/'custom-theme.png'),animations='disabled')
    # Reimport the exported theme and unpack a complete project to verify normalization persistence.
    roundtrip=page.evaluate('''async () => {
      const T=window.__SKY_STUDIO_TEST__,p=T.state.project;
      const data=T.makeZip({'manifest.json':JSON.stringify(p),'score.json':JSON.stringify(p.score),'scene.json':JSON.stringify(p.theme),'playback.json':JSON.stringify(p.playback)});
      const restored=await T.unpackProject(data);
      return restored.theme.appearance;
    }''')
    assert roundtrip['surfaceStart']=='#183e48' and 'unsafe' not in roundtrip and 'hover' not in roundtrip
    page.locator('#stepNext').click()
    assert page.locator('.beat.active .beat-number').inner_text()=='002'
    page.locator('#stepPrev').click()
    assert page.locator('.beat.active .beat-number').inner_text()=='001'
    page.locator('#playBtn').click();page.wait_for_function('window.__SKY_STUDIO_TEST__.state.isPlaying')
    page.locator('.beat[data-index="4"]').click()
    assert not page.evaluate('window.__SKY_STUDIO_TEST__.state.isPlaying')
    assert page.locator('.beat.active .beat-number').inner_text()=='005'
    page.locator('#rollWindow').select_option('20')
    assert page.evaluate('window.__SKY_STUDIO_TEST__.state.windowSec')==20
    assert not errors,errors
    browser.close()
(out/'results.json').write_text(json.dumps({'status':'PASS','themes':themes,'sameDOMAndGeometry':True,'sameScore':True,'customThemeRoundtrip':True,'navigation':True,'sceneCanvasFits':True,'pageErrors':errors},ensure_ascii=False,indent=2),'utf-8')
print('PASS shared player template, 3 themes, custom theme/project roundtrip, safe appearance, stable canvas and beat navigation')
