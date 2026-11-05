from pathlib import Path
from playwright.sync_api import sync_playwright
html=Path(__file__).resolve().parents[1].joinpath('SkyMusicStudio_Standalone.html').read_text('utf-8')
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=b.new_page(viewport={'width':1366,'height':768},device_scale_factor=1,accept_downloads=True)
    errs=[];page.on('pageerror',lambda e:errs.append(str(e)))
    page.set_content(html, wait_until='domcontentloaded')
    page.wait_for_timeout(700)
    assert page.locator('.song-card').count()==4
    assert page.get_by_text('导入我的谱子').count()==0
    assert page.get_by_text('最近播放').count()==0
    assert page.locator('.song-card').nth(0).is_visible()
    page.screenshot(path=str(Path(__file__).resolve().parents[1]/'tests/browser_home.png'),animations='disabled')
    # rename and copy flow
    page.locator('.song-card').first.locator('[aria-label="重命名"]').click()
    assert page.locator('#renameDialog').is_visible()
    page.locator('#renameInput').fill('新卡农圣诞夜')
    page.locator('#renameConfirm').click()
    assert page.locator('.song-card h3').first.inner_text()=='新卡农圣诞夜'
    page.locator('.song-card').first.locator('[aria-label="制作副本"]').click()
    assert page.locator('.song-card h3').first.inner_text().endswith('副本')
    page.locator('.song-card').first.locator('[aria-label="删除项目"]').click()
    assert page.locator('#deleteDialog').is_visible()
    page.locator('#deleteConfirm').click()
    assert page.locator('.song-card h3').first.inner_text()=='新卡农圣诞夜'
    page.locator('.song-card').first.locator('.card-play').click()
    page.wait_for_timeout(900)
    assert page.locator('#playerView').is_visible(),errs
    assert not page.locator('#inspectorPane').is_visible()
    assert page.locator('#stagePane').is_visible()
    assert page.locator('#beatGrid .beat').count()==32
    assert page.locator('#keyBoard button').count()==15
    page.screenshot(path=str(Path(__file__).resolve().parents[1]/'tests/browser_player.png'),animations='disabled')
    page.locator('#keySelect').select_option('F')
    assert 'F4' in page.locator('#keyBoard button').first.inner_text()
    page.locator('#keySelect').select_option('B')
    assert 'B4' in page.locator('#keyBoard button').first.inner_text()
    page.locator('#keySelect').select_option('C')
    # only read mode before editor
    before=page.evaluate('window.__SKY_STUDIO_TEST__.state.project.score.events[0].notes.join(",")')
    page.locator('#keyBoard button').first.click()
    after=page.evaluate('window.__SKY_STUDIO_TEST__.state.project.score.events[0].notes.join(",")')
    assert before==after,'Read only changed a note'
    page.locator('#scoreEditorBtn').click()
    assert page.locator('#inspectorPane').is_visible()
    assert not page.locator('#stagePane').is_visible()
    assert page.locator('#quickNewEvent').is_visible()
    page.screenshot(path=str(Path(__file__).resolve().parents[1]/'tests/browser_edit.png'),animations='disabled')
    page.locator('#quickNewEvent').click()
    assert '保存' in page.locator('#scoreEditorBtn').inner_text()
    page.locator('#scoreEditorBtn').click()
    assert page.locator('#saveChoiceDialog').is_visible()
    page.locator('#saveAsNew').click()
    assert not page.locator('#inspectorPane').is_visible()
    assert page.evaluate('window.__SKY_STUDIO_TEST__.state.project.originKind')=='user'
    print('browser checks passed, errors:',errs)
    assert not errs,errs
    b.close()
