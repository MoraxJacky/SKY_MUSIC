from pathlib import Path
import json,zipfile,sys
root=Path(__file__).resolve().parents[1]
scores=[json.loads((root/'samples'/n).read_text()) for n in ['canon.json','starlight-demo.json']]
canon=scores[0]
assert canon['durationMs']==216000
assert len(canon['score']['events'])==1296
assert sum(len(e['notes']) for e in canon['score']['events'])==1399
assert canon['score']['events'][-1]['confidence']=='unverified'
assert len(list((root/'app/assets/audio').glob('*.mp3')))==20
assert len(list((root/'app/assets/christmas').glob('stage_*.webp')))==24
assert (root/'sources/TimGM6mb.sf2').stat().st_size>1000000
assert (root/'SkyMusicStudio_独立版.html').stat().st_size>1000000
for name in ['canon','starlight-demo']:
 path=root/f'samples/{name}.skymusic'
 with zipfile.ZipFile(path) as z:
  assert set(['manifest.json','score.json','playback.json','scene.json']).issubset(z.namelist())
  manifest=json.loads(z.read('manifest.json'))
  assert manifest['format']=='skymusic-project'
  assert len(json.loads(z.read('score.json'))['events'])==len(scores[['canon','starlight-demo'].index(name)]['score']['events'])
  assert z.testzip() is None
print('PASS | 1296 beats | 1399 note-ons | 24 stage frames | 20 piano samples | 2 valid .skymusic archives')
