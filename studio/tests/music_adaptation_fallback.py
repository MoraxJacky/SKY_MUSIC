import json,argparse
from pathlib import Path
from playwright.sync_api import sync_playwright
parser=argparse.ArgumentParser();parser.add_argument('--output',required=True,type=Path);args=parser.parse_args();out=args.output;out.mkdir(parents=True,exist_ok=False)
with sync_playwright() as pw:
 b=pw.chromium.launch(channel='msedge',headless=True);p=b.new_page();p.goto((Path(__file__).resolve().parents[1]/'SkyMusicStudio_Standalone.html').as_uri());p.locator('.card-play').first.click();p.locator('#musicEdit').click()
 p.route('https://**/*',lambda route:route.abort())
 report=p.evaluate('''async()=>{const w=window.SKY_MUSIC_TEST,M=w.Music,c=M.blank(),t=c.tracks[0].id;c.notes=[{id:'one',trackId:t,pitch:60,startTick:0,durationTicks:960,soundTicks:800,gate:800/960,velocity:85},{id:'two',trackId:t,pitch:64,startTick:0,durationTicks:480,soundTicks:300,gate:300/480,velocity:70}];w.mw.project.composition=c;w.mw.track=t;w.musicRender();const original=JSON.stringify(c),before=window.__SKY_STUDIO_TEST__.state.library.length;w.musicAction('previewSky');w.musicAction('applySky');const lib=window.__SKY_STUDIO_TEST__.state.library,adapted=lib[0];if(lib.length!==before+1||adapted.id===w.mw.project.id||JSON.stringify(w.mw.project.composition)!==original||adapted.composition.notes[0].durationTicks!==960||adapted.composition.notes[1].durationTicks!==480)throw Error('adaptation isolation');w.MusicAudio.banks.delete('online-violin');await w.MusicAudio.prepare({...c,tracks:[{...c.tracks[0],instrument:'online-violin'}]});if(!w.MusicAudio.banks.get('online-violin')?.size)throw Error('fallback missing');return {adaptationIndependent:true,durationsPreserved:true,offlineFallback:true}}''')
 b.close()
(out/'results.json').write_text(json.dumps(report,indent=2),'utf-8');print(report)
