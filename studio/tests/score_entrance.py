"""Blank post-transition score, ordered note/grid arrival, key stamps and interruptions."""
import argparse,json
from pathlib import Path
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);p.add_argument('--url');a=p.parse_args();out=a.output.resolve();out.mkdir(parents=True,exist_ok=False)
root=Path(__file__).resolve().parents[1];url=a.url or (root/'SkyMusicStudio_Standalone.html').as_uri()
hook="""(()=>{window.rollArrivalPaint=[];const p=CanvasRenderingContext2D.prototype,clear=p.clearRect,round=p.roundRect;p.clearRect=function(...args){if(this.canvas.id==='rollCanvas')window.rollArrivalPaint=[];return clear.apply(this,args)};p.roundRect=function(x,y,w,h,...args){if(this.canvas.id==='rollCanvas')window.rollArrivalPaint.push({x,y,w,h,alpha:this.globalAlpha});return round.call(this,x,y,w,h,...args)}})()"""
with sync_playwright() as pw:
 b=pw.chromium.launch(channel='msedge',headless=True);page=b.new_page(viewport={'width':1366,'height':900});errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.add_init_script(hook);page.goto(url)
 page.locator('.card-play').first.click();page.wait_for_function("document.getElementById('playerView').dataset.scoreEntrance==='running'")
 assert page.locator('#songEntryTransition').is_hidden()
 lit=page.locator('#beatGrid>.beat').evaluate_all("es=>es.filter(e=>e.getAnimations().some(a=>a.constructor.name==='Animation'&&a.effect.getKeyframes().some(f=>f.boxShadow))).map(e=>Number(e.dataset.index))");assert lit==[0],lit
 blank=page.evaluate("({roll:window.rollArrivalPaint.length,keys:document.querySelectorAll('#keyBoard .active').length,visibleKeys:[...document.querySelectorAll('#keyBoard .key-tile')].filter(e=>getComputedStyle(e).opacity==='1').length,tiles:[...document.querySelectorAll('#beatGrid>.beat')].filter(e=>Number(getComputedStyle(e).opacity)>0).length,patterns:[...document.querySelectorAll('#beatGrid .score-arrival-pattern')].filter(e=>Number(getComputedStyle(e).opacity)>0).length,labels:[...document.querySelectorAll('#beatGrid .beat-name')].filter(e=>Number(getComputedStyle(e).opacity)>0).length})")
 assert blank=={'roll':0,'keys':0,'visibleKeys':15,'tiles':32,'patterns':0,'labels':0},blank
 baseline=page.evaluate('JSON.stringify([window.__SKY_STUDIO_TEST__.state.project.score,window.__SKY_STUDIO_TEST__.state.project.playback,window.__SKY_STUDIO_TEST__.state.position])')
 page.evaluate("""()=>{window.rowGrowth=[];const seen=new Set();new MutationObserver(records=>{for(const {target:e} of records){if(!e.classList.contains('score-grown')||seen.has(e))continue;seen.add(e);const cells=[...e.parentNode.children],index=cells.indexOf(e),row=Math.floor(index/8),previous=cells.slice(Math.max(0,(row-1)*8),row*8);window.rowGrowth.push({index,row,previousDone:previous.every(p=>[p,...p.querySelectorAll('.score-arrival-pattern,.beat-name')].every(n=>n.getAnimations().filter(a=>a.constructor.name==='Animation').every(a=>a.effect.getComputedTiming().progress===1)))})}}).observe(document.getElementById('beatGrid'),{subtree:true,attributes:true,attributeFilter:['class']})}""")
 page.screenshot(path=str(out/'blank-score.png'))
 page.wait_for_function("document.querySelectorAll('#beatGrid .score-grown').length>=4")
 partial=page.evaluate('window.rollArrivalPaint');assert partial and any(n['alpha']<.99 for n in partial),partial
 assert page.locator('#beatGrid .score-grown').evaluate_all('es=>es.every(e=>Number(e.dataset.index)<8)')
 page.screenshot(path=str(out/'first-row-floating-notes.png'))
 page.wait_for_function("document.querySelectorAll('#keyBoard .score-stamped').length>0")
 stamp=page.locator('#keyBoard .score-stamped').first.evaluate("e=>{const a=e.getAnimations().find(a=>a.effect.getKeyframes().some(f=>f.transform?.includes('scale')));return {origin:e.style.transformOrigin,note:Number(e.dataset.note),frames:a.effect.getKeyframes().map(f=>f.transform||'none'),opacity:a.effect.getKeyframes().map(f=>f.opacity),offsets:a.effect.getKeyframes().map(f=>f.computedOffset)}}")
 assert stamp['origin']=='center center',stamp
 assert stamp['opacity'][0]=='0' and stamp['offsets']==[0,.18,.5,1],stamp
 assert stamp['frames']==['translateY(0px) scale(1)', 'translateY(-8px) scale(1.28)', 'translateY(-8px) scale(1.28)', 'translateY(0px) scale(1)'],stamp
 page.wait_for_function("document.getElementById('playerView').dataset.scoreEntrance==='done'")
 final=page.evaluate('window.rollArrivalPaint');assert len(final)>len(partial)
 first=partial[0];settled=next(n for n in final if abs(n['x']-first['x'])<.1 and abs(n['h']-first['h'])<.1)
 assert first['y']>settled['y'] and all(n['alpha']==1 for n in final),(first,settled)
 growth=page.evaluate('window.rowGrowth');assert len(growth)==32 and all(row['previousDone'] for row in growth),growth
 assert [x['index'] for x in growth]==list(range(32)),growth
 active=page.locator('#keyBoard .active').evaluate_all('es=>es.map(e=>Number(e.dataset.note))')
 expected=page.evaluate('window.__SKY_STUDIO_TEST__.state.project.score.events[0].notes');assert active==expected and stamp['note'] in expected
 assert page.evaluate('JSON.stringify([window.__SKY_STUDIO_TEST__.state.project.score,window.__SKY_STUDIO_TEST__.state.project.playback,window.__SKY_STUDIO_TEST__.state.position])')==baseline
 assert page.locator('#beatGrid').evaluate('e=>[...e.children].every(c=>c.getAnimations().length===0)')
 assert page.locator('#beatGrid .score-arrival-pattern').count()==0
 page.screenshot(path=str(out/'settled-score.png'))
 # Scrubbing cancels presentation immediately and no late frame restores the old location.
 page.evaluate('window.__SKY_STUDIO_TEST__.goHome()');page.locator('.card-play').first.click();page.wait_for_function("document.getElementById('playerView').dataset.scoreEntrance==='running'")
 page.locator('#seekSlider').evaluate("e=>{e.value=4200;e.dispatchEvent(new Event('input',{bubbles:true}))}")
 assert page.locator('#playerView').get_attribute('data-score-entrance')=='cancelled'
 page.wait_for_timeout(2300);assert page.evaluate('window.__SKY_STUDIO_TEST__.state.position')==4200
 assert not page.locator('#playerView').evaluate("e=>e.classList.contains('score-arriving')")
 # The original clicked key survives cancellation and still auditions audio.
 page.evaluate('window.__SKY_STUDIO_TEST__.goHome()');page.locator('.card-play').first.click();page.wait_for_function("document.getElementById('playerView').dataset.scoreEntrance==='running'")
 page.locator('#keyBoard [data-note="7"]').click();page.wait_for_function('window.__SKY_STUDIO_TEST__.state.audioCtx!==null')
 assert page.locator('#playerView').get_attribute('data-score-entrance')=='cancelled'
 # Every preset uses the same entrance and its own semantic highlight colors.
 themes=[]
 for theme in ['starlight','citylights','prairie','rainforest','vault']:
  page.evaluate("id=>{const t=window.__SKY_STUDIO_TEST__,d=t.THEME_DEFINITIONS[id];t.goHome();t.state.library[0].theme={id,...d.defaults,...d.initialOverrides};t.goHome()}",theme)
  page.locator('.card-play').first.click();page.wait_for_function("document.getElementById('playerView').dataset.scoreEntrance==='running'")
  assert page.locator('#playerView').get_attribute('data-theme')==theme
  assert page.locator('#keyBoard .key-tile').evaluate_all("es=>es.filter(e=>e.getAnimations().some(a=>a.effect.getKeyframes().some(f=>f.transform?.includes('scale')))).every(e=>e.style.transformOrigin==='center center')")
  page.wait_for_function("document.querySelectorAll('#keyBoard .score-stamped').length>0")
  page.screenshot(path=str(out/(theme+'-stamp.png')))
  # Opening the console cancels the sequence before moving shared score panels.
  page.locator('#scoreEditorBtn').click();assert page.locator('#scoreConsole').is_visible()
  assert page.locator('#playerView').get_attribute('data-score-entrance')=='cancelled'
  assert page.locator('#beatGrid').evaluate('e=>[...e.children].every(c=>c.getAnimations().length===0)')
  page.locator('#consoleClose').click();page.locator('#discardChanges').click();themes.append(theme)
 assert not errors,errors;page.close()
 mobile=b.new_page(viewport={'width':390,'height':844});mobile.add_init_script(hook);mobile.goto(url);mobile.locator('.card-play').first.click()
 mobile.wait_for_function("document.getElementById('playerView').dataset.scoreEntrance==='done'")
 assert mobile.locator('#beatGrid').evaluate('e=>e.children.length')==32
 assert mobile.evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert mobile.locator('#keyBoard .active').count()>0
 mobile.screenshot(path=str(out/'mobile-settled.png'),full_page=True);mobile.close()
 reduced=b.new_page(reduced_motion='reduce');reduced.goto(url);reduced.locator('.card-play').first.click()
 assert reduced.locator('#playerView').is_visible() and not reduced.locator('#playerView').evaluate("e=>e.classList.contains('score-arriving')")
 assert reduced.locator('#keyBoard .active').count()>0 and reduced.locator('#beatGrid .active').count()==1
 (out/'results.json').write_text(json.dumps({'passed':True,'blank':blank,'partialNoteCount':len(partial),'finalNoteCount':len(final),'risingNote':[first,settled],'rows':growth,'stamp':stamp,'themes':themes,'dataUnchanged':True,'seekInterrupt':True,'keyClickSurvives':True,'editorInterrupt':True,'reducedMotion':True,'errors':errors},ensure_ascii=False,indent=2),'utf-8')
 b.close();print('PASS blank score, rising roll notes, complete rows before next row, key stamp, six themes, no music changes and seek/key/editor interruption')
