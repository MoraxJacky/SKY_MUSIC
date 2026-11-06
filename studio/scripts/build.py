#!/usr/bin/env python3
"""Rebuild modular app, standalone offline HTML, and portable .skymusic samples."""
from pathlib import Path
import base64, json, zipfile, re, html
from configuration import generate
ROOT=Path(__file__).resolve().parents[1]
APP=ROOT/'app'
generate(ROOT)
FILES=['00-core.js','10-zip.js','18-instruments.js','20-audio.js','30-import.js','35-video.js','36-platform-controller.js','37-theme-scenes.js','38-player-template.js','39-player-interactions.js','40-ui.js','41-home-experience.js','45-workspace.js','46-score-console.js','47-edit-session.js','99-bootstrap.js']
compiled='\n'.join('/* '+f+' */\n'+(ROOT/'src'/f).read_text(encoding='utf-8') for f in FILES)
(APP/'js/studio.js').write_text(compiled,encoding='utf-8')
html_source=(APP/'index.html').read_text(encoding='utf-8')
css=(APP/'player-styles.css').read_text(encoding='utf-8')
site=html_source.replace('<link rel="stylesheet" href="player-styles.css">','<style>\n'+css+'\n</style>')
# A standalone version MUST NOT fetch assets/scripts over file://. Base64 scenes are used only for offline portability.
frames=['data:image/webp;base64,'+base64.b64encode((APP/f'assets/christmas/stage_{i:02d}.webp').read_bytes()).decode() for i in range(24)]
stage_uri=frames[0]
flake_uri='data:image/webp;base64,'+base64.b64encode((APP/'assets/christmas/snowflake.webp').read_bytes()).decode()
site=site.replace('src="assets/christmas/stage_00.webp"','src="'+stage_uri+'"')
site=site.replace('src="assets/christmas/snowflake.webp"','src="'+flake_uri+'"')
for decoration in ['legacy-tree.png']:
 uri='data:image/png;base64,'+base64.b64encode((APP/f'assets/christmas/{decoration}').read_bytes()).decode()
 site=site.replace(f'src="assets/christmas/{decoration}"',f'src="{uri}"')
home_art='assets/platform/music-islands-v1.png'
home_uri='data:image/png;base64,'+base64.b64encode((APP/home_art).read_bytes()).decode()
site=site.replace('src="'+home_art+'"','src="'+home_uri+'"')
islet_art='assets/platform/home-islet.svg'
islet_uri='data:image/svg+xml;base64,'+base64.b64encode((APP/islet_art).read_bytes()).decode()
site=site.replace('src="'+islet_art+'"','src="'+islet_uri+'"')
theme_assets={}
config_text=(APP/'js/studio-config.js').read_text(encoding='utf-8')
config_data=json.loads(config_text.split('window.SKY_STUDIO_CONFIG=',1)[1].rstrip(';\n'))
for definition in config_data['themes'].values():
 decoration=definition['decorations']
 paths=[decoration['identity'].get('image'),decoration.get('cover'),decoration.get('treeImage'),decoration.get('companion'),*decoration.get('ornaments',[])]
 scene=decoration['scene']
 if scene['type']=='image':paths.append(scene['image'])
 if scene['type']=='frames':paths.extend(scene['framePattern'].replace('{index}',str(i).zfill(2)) for i in range(scene['frameCount']))
 for asset in filter(None,paths):
  mime={'.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'}[Path(asset).suffix.lower()]
  theme_assets[asset]='data:'+mime+';base64,'+base64.b64encode((APP/asset).read_bytes()).decode()
# Preserve the legacy frame bank for imported v0.4 themes even when every preset uses new artwork.
for i,uri in enumerate(frames):theme_assets[f'assets/christmas/stage_{i:02d}.webp']=uri
preload='<script>window.SKY_THEME_ASSETS='+json.dumps(theme_assets,separators=(',',':'))+';window.SKY_STAGE_FRAMES='+'['+','.join('window.SKY_THEME_ASSETS['+json.dumps(f'assets/christmas/stage_{i:02d}.webp')+']' for i in range(24))+']'+';window.SKY_INLINE_STAGE=window.SKY_THEME_ASSETS["assets/christmas/stage_00.webp"]'+';</script>'
site=site.replace('<script src="js/builtins.js"></script>',preload+'\n<script src="js/builtins.js"></script>')
for filename in ['studio-config.js','builtins.js','piano-samples.js','instrument-samples.js','scene-embedded.js','studio.js']:
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
