from pathlib import Path
from playwright.sync_api import sync_playwright
import zipfile,json,io,mido,math,wave,struct
root=Path(__file__).resolve().parents[1]
standalone=(root/'SkyMusicStudio_独立版.html').read_text(encoding='utf-8')
# Create a 6 note MIDI for import tests
m=mido.MidiFile(ticks_per_beat=480);t=mido.MidiTrack();m.tracks.append(t)
for k in [60,64,67,72,69,60]:
 t.append(mido.Message('note_on',note=k,velocity=82,time=0));t.append(mido.Message('note_off',note=k,velocity=0,time=240))
mp=root/'samples/原创建测试用.mid';m.save(mp)
# experimental audio test - two clean monophonic notes
sr=22050
with wave.open(str(root/'samples/单音测试.wav'),'wb') as f:
 f.setnchannels(1);f.setsampwidth(2);f.setframerate(sr)
 buf=bytearray()
 for i in range(sr*2):
  sec=i/sr;freq=261.626 if sec<1 else 329.628;phase=math.sin(math.pi*min(.025,sec%1)/.05)**2 if sec%1<.05 else 1
  amp=.30*phase*math.exp(-1.7*(sec%1)); val=int(amp*math.sin(2*math.pi*freq*sec)*32767);buf+=struct.pack('<h',val)
 f.writeframes(buf)
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
 page=b.new_page(viewport={'width':1366,'height':768},accept_downloads=True)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content(standalone,timeout=50000)
 print('boot:',page.locator('.song-card').count(),'cards',len(errors),'errors')
 # roundtrip using freshly packaged .skymusic file
 page.locator('#fileInput').set_input_files(str(root/'samples/canon.skymusic'))
 page.wait_for_timeout(600)
 print('import skymusic',page.locator('#songTitle').inner_text(),page.locator('.beat').count(),page.locator('.key-tile').count(),'count',page.locator('#noteCountHeader').inner_text(), 'errors',errors[-3:])
 print('imported scene',page.evaluate('window.__SKY_STUDIO_TEST__.state.project.theme.id'), 'has asset',page.evaluate('!!window.__SKY_STUDIO_TEST__.state.project._imageUrl'))
 page.locator('#backLibrary').click()
 print('library after importing',page.locator('.song-card').count())
 # import test MIDI
 page.locator('#fileInput').set_input_files(str(mp));page.wait_for_timeout(450)
 print('import MIDI',page.locator('#songTitle').inner_text(),page.locator('#noteCountHeader').inner_text(),page.evaluate('window.__SKY_STUDIO_TEST__.state.project.score.events.map(e=>e.notes).slice(0,6)'))
 page.locator('#backLibrary').click()
 # import v7 CSV
 page.locator('#fileInput').set_input_files(str(root/'app/assets/audio/60.mp3')) # audio experiment using actual pure piano sample
 page.wait_for_timeout(700)
 print('import mp3 status',page.locator('#songTitle').inner_text() if not page.locator('#playerView').is_hidden() else 'home',page.locator('#toast').inner_text(),'errors',errors[-3:])
 # Playback on original project test
 page.locator('#backLibrary').click() if not page.locator('#playerView').is_hidden() else None
 page.locator('.card-play').filter(has_text='▶').first.click()
 page.wait_for_timeout(250)
 page.locator('#playBtn').click();page.wait_for_timeout(1000)
 pre=page.evaluate('({frame:window.__SKY_STUDIO_TEST__.state.sceneFrame,pos:window.__SKY_STUDIO_TEST__.state.position})')
 page.wait_for_timeout(550);post=page.evaluate('({frame:window.__SKY_STUDIO_TEST__.state.sceneFrame,pos:window.__SKY_STUDIO_TEST__.state.position})')
 print('scene movement',pre,post)
 page.locator('#playBtn').click();pause1=page.evaluate('window.__SKY_STUDIO_TEST__.state.sceneFrame');page.wait_for_timeout(550);pause2=page.evaluate('window.__SKY_STUDIO_TEST__.state.sceneFrame')
 print('stage freeze after pause',pause1,pause2,'same?',pause1==pause2)
 page.screenshot(path=str(root/'tests/standalone_after_play.png'))
 print('errors',errors[-10:])
 b.close()
