"""Explicit state notifications, quiet exploration, delayed loading and platform help styling."""
import argparse,json
from pathlib import Path
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);p.add_argument('--url');a=p.parse_args();out=a.output.resolve();out.mkdir(parents=True,exist_ok=False);root=Path(__file__).resolve().parents[1]
with sync_playwright() as pw:
 b=pw.chromium.launch(channel='msedge',headless=True);page=b.new_page(viewport={'width':1375,'height':884},reduced_motion='reduce');errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(a.url or (root/'SkyMusicStudio_Standalone.html').as_uri())
 page.evaluate("()=>{window.notices=[];new MutationObserver(()=>window.notices.push(document.getElementById('toast').textContent)).observe(document.getElementById('toast'),{childList:true})}")
 page.locator('#showGuide').click();help=page.locator('#helpDialog');assert help.is_visible();assert '默认只读' in help.inner_text() and '.skytrack' in help.inner_text()
 paint=help.evaluate("e=>{const s=getComputedStyle(e);return {paint:s.backgroundImage,color:s.color,border:s.borderColor}}")
 assert '19, 42, 59' in paint['paint'] and '13, 28, 44' in paint['paint'],paint
 page.screenshot(path=str(out/'help-desktop.png'));help.get_by_role('button',name='我知道了').click();assert not help.is_visible() and page.evaluate('window.notices')==[]
 page.locator('.card-play').first.click()
 for id in ['songInfoBtn','exportProject']:
  page.locator('#'+id).click();page.keyboard.press('Escape')
 page.locator('#speedToggle').click();page.keyboard.press('Escape');page.locator('#keyRangeToggle').click();page.keyboard.press('Escape')
 page.locator('#seekSlider').fill('10000');page.locator('#rollSeekSlider').fill('20000');page.locator('#keyBoard button').first.click();page.wait_for_timeout(200)
 for name in ['音量','延音']:page.get_by_role('spinbutton',name=name,exact=True).press('ArrowUp')
 assert page.evaluate('window.notices')==[],page.evaluate('window.notices')
 # Deliberate committed state changes issue one concise result each.
 page.locator('#keyRangeToggle').click()
 for _ in range(7):page.keyboard.press('ArrowRight')
 page.keyboard.press('Enter');assert page.evaluate('window.notices')==['音域：G 大调']
 tone=page.get_by_role('spinbutton',name='选择音色',exact=True);tone.press('ArrowDown');page.wait_for_function("window.notices.at(-1)==='音色：竖琴'")
 count=page.evaluate('window.notices.length');page.locator('#playBtn').click();page.wait_for_function('window.__SKY_STUDIO_TEST__.state.isPlaying');assert page.evaluate('window.notices.length')==count+1 and page.evaluate('window.notices.at(-1)')=='开始演奏'
 # A running tuning change retains playback and does not announce another play action.
 count=page.evaluate('window.notices.length');page.locator('#keyRangeToggle').click();page.keyboard.press('ArrowLeft');page.keyboard.press('ArrowLeft');page.keyboard.press('Enter');page.wait_for_function('window.__SKY_STUDIO_TEST__.state.isPlaying');assert page.evaluate('window.notices.length')==count+1 and page.evaluate('window.notices.at(-1)')=='音域：F 大调'
 page.locator('#playBtn').click();assert page.evaluate('window.notices.at(-1)')=='已暂停演奏'
 page.locator('#restartBtn').click();assert page.evaluate('window.notices.at(-1)')=='已重置到开头'
 page.locator('#loopOneBtn').click();assert page.evaluate('window.notices.at(-1)')=='已开启单曲循环';page.locator('#loopOneBtn').click()
 for choice,expected in [('discardChanges','未保存修改'),('saveDirect','已保存'),('saveAsNew','已另存为新曲谱')]:
  page.locator('#scoreEditorBtn').click();assert page.evaluate('window.notices.at(-1)')=='已打开谱面编辑控制台'
  count=page.evaluate('window.notices.length');page.locator('#consoleClose').click();assert page.evaluate('window.notices.length')==count
  page.locator('#'+choice).click();assert expected in page.evaluate('window.notices.at(-1)')
 # Slow network feedback appears once, while the more useful fallback error remains visible.
 page.evaluate("()=>{const original=window.fetch;window.fetch=async(...args)=>{if(String(args[0]).startsWith('https:')){await new Promise(r=>setTimeout(r,850));throw new TypeError('controlled offline test')}return original(...args)}}")
 count=page.evaluate('window.notices.length');tone.press('End');page.wait_for_function("document.getElementById('toast').textContent.includes('暂不可用')")
 delayed=page.evaluate('(n)=>window.notices.slice(n)',count);assert delayed[0]=='正在加载音色…' and len(delayed)==2 and '已切换经典钢琴' in delayed[-1],delayed
 count=page.evaluate('window.notices.length');page.locator('#songInfoBtn').click();page.keyboard.press('Escape');assert page.evaluate('window.notices.length')==count
 # Leaving during another slow load must not post a late loading or error notice on home.
 tone.press('End');page.locator('#backLibrary').click();count=page.evaluate('window.notices.length');page.wait_for_timeout(1000);assert page.evaluate('window.notices.length')==count
 assert page.evaluate('window.notices.at(-1)')=='已返回音乐馆';page.wait_for_function("document.getElementById('toast').hidden",timeout=3000)
 # Phone dialog remains scrollable inside the viewport and uses the same platform surface.
 page.set_viewport_size({'width':390,'height':844});page.locator('#showGuide').click();assert help.bounding_box()['width']<=390 and page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path=str(out/'help-mobile.png'));help.get_by_role('button',name='我知道了').click()
 assert not errors,errors;notices=page.evaluate('window.notices');b.close()
(out/'results.json').write_text(json.dumps({'passed':True,'paint':paint,'quietExploration':True,'stateNotifications':notices,'internalResumeQuiet':True,'slowFallback':delayed,'noLateLoadingOnHome':True,'helpResponsive':True,'errors':errors},ensure_ascii=False,indent=2),'utf-8');print('PASS quiet exploration, explicit state feedback, no internal resume chatter and shared blue responsive help dialog')
