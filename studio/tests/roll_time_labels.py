"""Check actual canvas time labels, final-note coverage and centered grid alignment."""
import argparse,json
from pathlib import Path
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);out=p.parse_args().output.resolve();out.mkdir(parents=True,exist_ok=False)
r=Path(__file__).resolve().parents[1]
with sync_playwright() as pw:
 b=pw.chromium.launch(channel='msedge',headless=True);page=b.new_page(viewport={'width':1366,'height':768});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.add_init_script('''(()=>{
 const p=CanvasRenderingContext2D.prototype,original={};for(const name of ['clearRect','beginPath','moveTo','lineTo','stroke','fillText'])original[name]=p[name];
 p.clearRect=function(...args){if(this.canvas.id==='rollCanvas')window.rollDraw={labels:[],lines:[],path:[]};return original.clearRect.apply(this,args)};
 p.beginPath=function(...args){if(this.canvas.id==='rollCanvas'&&window.rollDraw)window.rollDraw.path=[];return original.beginPath.apply(this,args)};
 for(const name of ['moveTo','lineTo'])p[name]=function(x,y){if(this.canvas.id==='rollCanvas'&&window.rollDraw)window.rollDraw.path.push({x,y});return original[name].call(this,x,y)};
 p.stroke=function(...args){if(this.canvas.id==='rollCanvas'&&window.rollDraw)window.rollDraw.lines.push([...window.rollDraw.path]);return original.stroke.apply(this,args)};
 p.fillText=function(text,x,y,...args){if(this.canvas.id==='rollCanvas'&&/^\\d+(\\.\\d+)?s$/.test(text))window.rollDraw.labels.push({text,x,y,align:this.textAlign,width:this.measureText(text).width});return original.fillText.call(this,text,x,y,...args)};
 })()''')
 page.goto((r/'SkyMusicStudio_Standalone.html').as_uri());page.locator('.card-play').first.click();records=[]
 for sec in [8,10,12,20]:
  page.evaluate('''()=>{let s=window.__SKY_STUDIO_TEST__.state;s.position=0;s.rollPageStart=0}''');page.locator('#rollWindow').select_option(str(sec));page.wait_for_timeout(80)
  initial=page.evaluate('window.rollDraw');expected=[f'{i}s' for i in range(0,sec+1,1 if sec<=10 else 5)];assert [x['text'] for x in initial['labels']]==expected,(sec,initial)
  page.evaluate('''()=>{let t=window.__SKY_STUDIO_TEST__,s=t.state;s.position=s.project.durationMs;s.rollPageStart=Math.floor((s.position-.001)/(s.windowSec*1000))*s.windowSec*1000;window.dispatchEvent(new Event('resize'))}''');page.wait_for_timeout(100)
  final=page.evaluate('window.rollDraw');terminal=page.evaluate('window.__SKY_STUDIO_TEST__.rollTimeLabels().find(x=>x.terminal)');assert terminal,(sec,final)
  assert any(abs(float(x['text'][:-1])*1000-terminal['timeMs'])<.001 for x in final['labels'])
  width=page.locator('#rollCanvas').bounding_box()['width']
  for draw in [initial,final]:
   for label in draw['labels']:
    assert label['align']=='center' and label['x']-label['width']/2>=0 and label['x']+label['width']/2<=width+1,label
    assert any(len(line)==2 and abs(line[0]['x']-label['x'])<.01 and abs(line[1]['x']-label['x'])<.01 and line[0]['y']==25 for line in draw['lines']),label
  page.screenshot(path=str(out/f'final-{sec}.png'));records.append({'seconds':sec,'initial':initial['labels'],'final':final['labels']})
 page.evaluate('''()=>{const s=window.__SKY_STUDIO_TEST__.state;s.project.score.events=[{timeMs:400,notes:[1],durationMs:100}];s.project.durationMs=500;s.position=500;s.rollPageStart=300;window.dispatchEvent(new Event('resize'))}''');page.wait_for_timeout(80);assert page.evaluate('window.rollDraw.labels.some(x=>x.text==="0.4s")')
 assert not errors,errors
 (out/'results.json').write_text(json.dumps({'passed':True,'windows':records,'subsecondTail':True,'errors':errors},ensure_ascii=False,indent=2),'utf-8');print('PASS 4 time intervals, terminal-note labels, subsecond tail, centered canvas/grid alignment and unclipped text');b.close()
