"""The roll scrubber holds the final time window without stretching notes, in either direction."""
import argparse,json
from pathlib import Path
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);p.add_argument('--url');a=p.parse_args();out=a.output.resolve();out.mkdir(parents=True,exist_ok=False);root=Path(__file__).resolve().parents[1]
with sync_playwright() as pw:
 b=pw.chromium.launch(channel='msedge',headless=True);page=b.new_page(viewport={'width':1366,'height':900},reduced_motion='reduce');errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(a.url or (root/'SkyMusicStudio_Standalone.html').as_uri());page.locator('.card-play').first.click()
 records=[];original=page.evaluate('JSON.stringify(window.__SKY_STUDIO_TEST__.state.project.score)');duration=page.evaluate('window.__SKY_STUDIO_TEST__.state.project.durationMs')
 for seconds in [8,10,12,20]:
  for total in [duration,24000,5000]:
   for fraction in [0,.25,.75,.99]:
    record=page.evaluate("""({seconds,total,fraction})=>{
     const t=window.__SKY_STUDIO_TEST__,s=t.state,slider=document.getElementById('rollSeekSlider');s.project.durationMs=total;document.getElementById('seekSlider').max=total;slider.max=total;
     document.getElementById('rollWindow').value=seconds;document.getElementById('rollWindow').dispatchEvent(new Event('change'));s.position=fraction*Math.min(total,seconds*1000);s.rollPageStart=0;
     const span=Math.min(total,seconds*1000),start=total-span,targets=[start,start+span*.25,total-100,total-1,total,total-1,total-100,start+span*.25,start],frames=[];
     for(const time of targets){slider.value=time;slider.dispatchEvent(new Event('input',{bubbles:true}));const f=t.rollFrame();frames.push({...f,position:s.position,scoreX:(total-1000-f.begin)/f.windowMs})}
     return {seconds,total,fraction,start,span,frames};
    }""",{'seconds':seconds,'total':total,'fraction':fraction})
    for f in record['frames']:
     assert abs(f['begin']-record['start'])<.001 and abs(f['end']-total)<.001 and abs(f['windowMs']-record['span'])<.001,record
     assert abs(f['phase']-(f['position']-record['start']))<.001,record
    assert len({round(f['scoreX'],8) for f in record['frames']})==1,record
    records.append(record)
 # Actual playing seek reaches the same final frame and stays there at natural finish.
 page.evaluate('(d)=>{const t=window.__SKY_STUDIO_TEST__;t.state.project.durationMs=d;document.getElementById("seekSlider").max=d}',duration);page.locator('#rollWindow').select_option('12');page.locator('#restartBtn').click();page.locator('#playBtn').click();page.wait_for_function('window.__SKY_STUDIO_TEST__.state.isPlaying')
 page.locator('#rollSeekSlider').fill(str(int(duration-400)));page.wait_for_function('!window.__SKY_STUDIO_TEST__.state.isPlaying');final=page.evaluate('window.__SKY_STUDIO_TEST__.rollFrame()');assert final['begin']==duration-12000 and final['windowMs']==12000 and final['end']==duration and final['phase']==12000,final
 assert page.evaluate('JSON.stringify(window.__SKY_STUDIO_TEST__.state.project.score)')==original
 page.screenshot(path=str(out/'fixed-final-window.png'));assert not errors,errors;b.close()
(out/'results.json').write_text(json.dumps({'passed':True,'cases':records,'naturalFinish':final,'scoreUnchanged':True,'errors':errors},indent=2),'utf-8');print('PASS fixed final scrub window, four window lengths, long/exact/short songs, both directions, unchanged note scale and natural playback finish')
