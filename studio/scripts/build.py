#!/usr/bin/env python3
"""Rebuild modular app, standalone offline HTML, and portable .skymusic samples."""
from pathlib import Path
import base64, json, zipfile, re, html
ROOT=Path(__file__).resolve().parents[1]
APP=ROOT/'app'
FILES=['00-core.js','10-zip.js','18-instruments.js','20-audio.js','30-import.js','35-video.js','38-player-template.js','40-ui.js','45-workspace.js','47-edit-session.js','99-bootstrap.js']
compiled='\n'.join('/* '+f+' */\n'+(ROOT/'src'/f).read_text(encoding='utf-8') for f in FILES)
(APP/'js/studio.js').write_text(compiled,encoding='utf-8')
html_source=(APP/'index.html').read_text(encoding='utf-8')
css=(APP/'styles.css').read_text(encoding='utf-8')
site=html_source.replace('<link rel="stylesheet" href="styles.css">','<style>\n'+css+'\n</style>')
# A standalone version MUST NOT fetch assets/scripts over file://. Base64 scenes are used only for offline portability.
frames=['data:image/webp;base64,'+base64.b64encode((APP/f'assets/christmas/stage_{i:02d}.webp').read_bytes()).decode() for i in range(24)]
stage_uri=frames[0]
flake_uri='data:image/webp;base64,'+base64.b64encode((APP/'assets/christmas/snowflake.webp').read_bytes()).decode()
site=site.replace('src="assets/christmas/stage_00.webp"','src="'+stage_uri+'"')
site=site.replace('src="assets/christmas/snowflake.webp"','src="'+flake_uri+'"')
for decoration in ['legacy-tree.png']:
 uri='data:image/png;base64,'+base64.b64encode((APP/f'assets/christmas/{decoration}').read_bytes()).decode()
 site=site.replace(f'src="assets/christmas/{decoration}"',f'src="{uri}"')
preload='<script>window.SKY_STAGE_FRAMES='+json.dumps(frames,separators=(',',':'))+';window.SKY_INLINE_STAGE='+json.dumps(stage_uri)+';</script>'
site=site.replace('<script src="js/builtins.js"></script>',preload+'\n<script src="js/builtins.js"></script>')
for filename in ['builtins.js','piano-samples.js','instrument-samples.js','scene-embedded.js','studio.js']:
 script=(APP/'js'/filename).read_text(encoding='utf-8').replace('</script>','<\\/script>')
 site=site.replace('<script src="js/'+filename+'"></script>','<script>\n'+script+'\n</script>')
if '<script src=' in site:raise Exception('Standalone HTML has external script src')
(ROOT/'SkyMusicStudio_独立版.html').write_text(site,encoding='utf-8')
(ROOT/'SkyMusicStudio_Standalone.html').write_text(site,encoding='utf-8')
for name in ['canon','starlight-demo','citylights-demo']:
 p=json.loads((ROOT/'samples'/(name+'.json')).read_text(encoding='utf-8'))
 manifest={k:p[k] for k in ['format','schemaVersion','id','title','subtitle','description','durationMs','keyCount','provenance']}
 scene=p['theme'].copy();assets={};manifest['assets']=[]
 if scene['id']=='christmas':
  assets['assets/stage.webp']=(APP/'assets/christmas/stage_00.webp').read_bytes()
  scene['image']='assets/stage.webp';manifest['assets']=['assets/stage.webp']
 target=ROOT/'samples'/(name+'.skymusic')
 with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_STORED) as z:
  for k,obj in [('manifest.json',manifest),('score.json',p['score']),('scene.json',scene),('playback.json',p['playback'])]:z.writestr(k,json.dumps(obj,ensure_ascii=False,indent=2))
  for k,blob in assets.items():z.writestr(k,blob)
 print('Sample:',target.name,target.stat().st_size)
print('Standalone:',(ROOT/'SkyMusicStudio_独立版.html').stat().st_size,'bytes')
print('JavaScript:',len(compiled),'chars')
