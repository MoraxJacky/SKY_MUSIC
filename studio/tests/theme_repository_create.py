"""Theme shelf lifecycle and custom creation listbox, in isolated browser contexts."""
import argparse,json
from pathlib import Path
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);p.add_argument('--url');a=p.parse_args();out=a.output.resolve();out.mkdir(parents=True,exist_ok=False);root=Path(__file__).resolve().parents[1]
with sync_playwright() as pw:
 b=pw.chromium.launch(channel='msedge',headless=True);page=b.new_page(viewport={'width':1375,'height':884},reduced_motion='reduce');errors=[];choosers=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('filechooser',lambda e:choosers.append(e));page.goto(a.url or (root/'SkyMusicStudio_Standalone.html').as_uri())
 baseline=page.evaluate('JSON.stringify(window.__SKY_STUDIO_TEST__.state.library.map(p=>p.score))')
 page.locator('#importThemeLibrary').click();assert page.locator('#themeRepositoryDialog').is_visible() and len(choosers)==0
 assert page.locator('.theme-repository-card').count()==6 and page.get_by_role('button',name='内置保留').count()==6
 page.screenshot(path=str(out/'theme-repository.png'))
 assert page.locator('#themeRepositoryDialog').evaluate('e=>e.scrollHeight<=e.clientHeight+1')
 with page.expect_download() as download_event: page.locator('.theme-repository-card').first.get_by_role('button',name='导出',exact=True).click()
 assert download_event.value.suggested_filename=='圣诞雪夜.skytheme'
 page.locator('.theme-repository-card').first.get_by_role('button',name='预览',exact=True).click();assert page.locator('#homeThemeDialog').is_visible();page.keyboard.press('Escape');assert page.locator('#themeRepositoryDialog').is_visible()
 # Import through the same File entry point used by the shelf's add control.
 with page.expect_file_chooser() as chooser_event: page.locator('#themeRepositoryAdd').click()
 chooser=chooser_event.value
 data=page.evaluate("()=>{const d=structuredClone(window.__SKY_STUDIO_TEST__.THEME_DEFINITIONS.rainforest);d.id='test-added';d.name=d.displayName='测试 · 林间';return JSON.stringify({format:'skytheme',schemaVersion:2,definition:d})}")
 chooser.set_files({'name':'test.skytheme','mimeType':'application/json','buffer':data.encode()});page.wait_for_selector('[data-theme-id=test-added]');assert page.locator('.theme-repository-card').count()==7
 card=page.locator('[data-theme-id=test-added]');card.get_by_role('button',name='移除',exact=True).click();page.get_by_role('button',name='取消',exact=True).click();assert card.is_visible()
 page.keyboard.press('Escape');page.reload();page.locator('#importThemeLibrary').click();assert page.locator('.theme-repository-card').count()==7
 page.locator('[data-theme-id=test-added]').get_by_role('button',name='移除',exact=True).click();page.locator('#confirmThemeRemoval').click();assert page.locator('.theme-repository-card').count()==6
 assert page.evaluate('JSON.stringify(window.__SKY_STUDIO_TEST__.state.library.map(p=>p.score))')==baseline
 page.keyboard.press('Escape');page.locator('#newSongBtn').click();title=page.locator('#createTitle');assert title.input_value()=='' and title.get_attribute('placeholder')=='请输入乐曲名称'
 page.locator('#createConfirm').click();assert page.locator('#createDialog').is_visible() and page.locator('#libraryCards .light-cone').count()==6
 assert page.locator('#createTitle').bounding_box()['y']==page.locator('#createThemeToggle').bounding_box()['y']
 title.fill('  林间新旋律  ');page.locator('#createThemeToggle').click();assert page.locator('#createThemeMenu:popover-open').is_visible();assert page.locator('#createThemeMenu [role=option]').count()==6
 assert not page.locator('#createTheme').is_visible();page.screenshot(path=str(out/'create-theme-list.png'))
 page.keyboard.press('End');page.keyboard.press('Enter');assert page.locator('#createTheme').input_value()=='vault' and page.locator('#createThemeToggle').get_attribute('aria-expanded')=='false'
 page.locator('#createThemeToggle').click();page.keyboard.press('Escape');assert page.locator('#createDialog').is_visible() and page.locator('#createThemeToggle').get_attribute('aria-expanded')=='false'
 page.locator('#createConfirm').click();page.wait_for_selector('#scoreConsole[open]');project=page.evaluate('window.__SKY_STUDIO_TEST__.state.project');assert project['title']=='林间新旋律' and project['theme']['id']=='vault'
 page.locator('#consoleClose').click();page.locator('#discardChanges').click();page.locator('#backLibrary').click();page.locator('#newSongBtn').click();assert title.input_value()=='';page.keyboard.press('Escape')
 # A referenced imported theme must remain registered.
 page.evaluate("async text=>{const t=window.__SKY_STUDIO_TEST__;await t.importFile(new File([text],'test.skytheme',{type:'application/json'}));t.state.library[0].theme.id='test-added'}",data)
 page.locator('#importThemeLibrary').click();assert page.locator('[data-theme-id=test-added]').get_by_role('button',name='移除',exact=True).is_disabled();page.keyboard.press('Escape')
 page.set_viewport_size({'width':390,'height':844});page.locator('#newSongBtn').click();page.locator('#createThemeToggle').click();rect=page.locator('#createThemeMenu').bounding_box();assert rect['x']>=0 and rect['x']+rect['width']<=391 and rect['y']>=0 and rect['y']+rect['height']<=845,rect
 page.screenshot(path=str(out/'mobile-create-list.png'));page.keyboard.press('Escape');page.keyboard.press('Escape');page.locator('#importThemeLibrary').click();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path=str(out/'mobile-theme-repository.png'))
 assert not errors,errors;b.close()
(out/'results.json').write_text(json.dumps({'passed':True,'blankNameValidation':True,'keyboardListbox':True,'themes':6,'importRestoreRemove':True,'referenceProtection':True,'mobileBounds':rect,'errors':errors},ensure_ascii=False,indent=2),'utf-8');print('PASS theme shelf add/preview/cancel/remove/restore/reference protection and blank-name creation/custom keyboard/mobile theme list')
