"""Browser acceptance for complete skymusic + pure skytrack + registered skytheme."""
import argparse,json
from pathlib import Path
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);out=p.parse_args().output.resolve();out.mkdir(parents=True,exist_ok=False)
r=Path(__file__).resolve().parents[1]
with sync_playwright() as pw:
 b=pw.chromium.launch(channel='msedge',headless=True);page=b.new_page(accept_downloads=True,viewport={'width':1366,'height':768});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto((r/'SkyMusicStudio_Standalone.html').as_uri());page.locator('.card-play').first.click()
 result=page.evaluate('''async()=>{
 const t=window.__SKY_STUDIO_TEST__,before=JSON.stringify(t.state.project.score.events),entry=t.projectEntry(t.state.project);
 if(entry.music.format!=='skytrack'||entry.theme.id!=='christmas'||Object.keys(entry.theme).length!==1)throw Error('Format contract');
 const imported=await t.importPlatformFile(new File([JSON.stringify(entry)],'complete.skymusic'));
 if(JSON.stringify(imported.score.events)!==before)throw Error('Score changed');
 const count=t.state.library.length;entry.theme.id='registered-test';
 try{await t.importFile(new File([JSON.stringify(entry)],'unknown.skymusic'));throw Error('Accepted missing theme')}catch(error){if(!error.message.includes('主题未录入'))throw error}
 if(t.state.library.length!==count||t.THEME_DEFINITIONS['registered-test'])throw Error('Import mutated registry');
 const definition=JSON.parse(JSON.stringify(window.SKY_STUDIO_CONFIG.themes.starlight));definition.id='registered-test';definition.name='Test Registered';definition.displayName='已录入测试主题';
 await t.importFile(new File([JSON.stringify({format:'skytheme',schemaVersion:2,definition})],'new.skytheme'));
 await t.importFile(new File([JSON.stringify({format:'skytheme',schemaVersion:2,definition})],'same.skytheme'));
 const altered=JSON.parse(JSON.stringify(definition));altered.name='Collision';try{await t.importFile(new File([JSON.stringify({format:'skytheme',schemaVersion:2,definition:altered})],'collision.skytheme'));throw Error('Accepted collision')}catch(error){if(!error.message.includes('ID 已存在'))throw error}
 await t.importFile(new File([JSON.stringify(entry)],'complete.skymusic'));
 if(t.state.project.theme.id!=='registered-test'||JSON.stringify(t.state.project.score.events)!==before)throw Error('Registration/score failed');
 if(document.querySelectorAll('.beat').length!==32)throw Error('Beat grid not filled');
 return {format:entry.format,scoreFormat:entry.music.format,events:entry.music.events.length,theme:entry.theme,library:t.state.library.length};
 }''')
 page.reload();page.wait_for_function("Boolean(window.__SKY_STUDIO_TEST__.THEME_DEFINITIONS['registered-test'])")
 assert page.evaluate("window.__SKY_STUDIO_TEST__.state.library.some(p=>p.theme.id==='registered-test')")
 with page.expect_download() as dl:page.evaluate('window.__SKY_STUDIO_TEST__.exportPlatformEntry(window.__SKY_STUDIO_TEST__.state.project)')
 download=dl.value;download.save_as(out/'roundtrip.skymusic');doc=json.loads((out/'roundtrip.skymusic').read_text('utf-8'));assert doc['theme']=={'id':'registered-test'};assert doc['music']['events'];assert 'definition' not in doc['theme']
 # Old ZIP project remains readable.
 page.set_input_files('#fileInput',str(r/'samples/starlight-demo.skymusic'));page.wait_for_function("window.__SKY_STUDIO_TEST__.state.project.title.includes('星光')")
 page.screenshot(path=str(out/'platform.png'))
 assert not errors,errors
 (out/'results.json').write_text(json.dumps({'passed':True,'result':result,'errors':errors},ensure_ascii=False,indent=2),'utf-8');print('PASS format, full score, missing-theme rejection, explicit registration, persistence, export and legacy ZIP')
 b.close()
