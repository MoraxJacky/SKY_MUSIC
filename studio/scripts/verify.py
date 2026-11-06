#!/usr/bin/env python3
"""Verify SkyMusic Studio assets, references, portable archives, and source basics."""
from pathlib import Path
from collections import Counter
import json, zipfile, re, sys
root=Path(__file__).resolve().parents[1]; errors=[]
from configuration import generate
generate(root,check=True)
for f in ['SkyMusicStudio_独立版.html','app/index.html','app/js/studio.js','app/js/builtins.js','src/20-audio.js','samples/canon.skymusic','samples/citylights-demo.skymusic','legacy/第七版_原始备份.html']:
 if not (root/f).exists():errors.append('Missing: '+f)
h=(root/'app/index.html').read_text(encoding='utf-8');js=(root/'app/js/studio.js').read_text(encoding='utf-8');ids=re.findall(r'\bid="([^"]+)"',h)
for k,n in Counter(ids).items():
 if n>1:errors.append('Duplicate DOM id '+k)
for k in set(re.findall(r'''\$\(['\"]([^'\"]+)['\"]\)''',js)):
 if k not in ids and k!='sceneCanvas':errors.append('Missing DOM control '+k)
volume=json.loads((root/'config/player-interactions.json').read_text(encoding='utf-8'))['volume']
for control in ['sliderId','outputId']:
 if volume[control] not in ids:errors.append('Missing volume UI control '+volume[control])
if not re.search(r'id="volumeSlider"[^>]*aria-label="音量"',h):errors.append('Volume slider must expose an accessible name')
standalone=(root/'SkyMusicStudio_独立版.html').read_text(encoding='utf-8')
if re.search(r'<script\b[^>]*\bsrc=',standalone):errors.append('Standalone has external JavaScript')
for name in ['canon','starlight-demo','citylights-demo']:
 try:
  with zipfile.ZipFile(root/'samples'/(name+'.skymusic')) as z:
   if z.testzip() is not None:errors.append('Broken ZIP '+name)
   m=json.loads(z.read('manifest.json'));s=json.loads(z.read('score.json'))
   if m['format']!='skymusic-project' or m['keyCount']!=15:errors.append('Invalid manifest '+name)
   for e in s['events']:
    if not (0<=e['timeMs']<=36000000 and all(n in range(1,16) for n in e['notes'])):errors.append('Invalid score event '+name);break
   if name=='canon':
    assert len(s['events'])==1296 and sum(len(e['notes']) for e in s['events'])==1399
 except Exception as e:errors.append(f'{name}: {e}')
print('Sky Music Studio static verification', 'PASS' if not errors else 'FAIL')
if errors:
 for e in errors:print(' -',e)
 sys.exit(1)
print(f' - {len(ids)} unique DOM controls, expected 3 samples, standalone {(root/"SkyMusicStudio_独立版.html").stat().st_size/1e6:.2f}MB')
