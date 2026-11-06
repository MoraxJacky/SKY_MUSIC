"""Verify the eighteen generated theme assets and their published/original integrity."""
import argparse,hashlib,json
from pathlib import Path
from PIL import Image

parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True)
out=parser.parse_args().output.resolve();out.mkdir(parents=True,exist_ok=False)
root=Path(__file__).resolve().parents[1]
manifest=json.loads((root/'sources/theme-art-v2-manifest.json').read_text('utf-8'))
items=manifest['assets'];assert len(items)==18 and len({i['asset'] for i in items})==18
config=json.loads((root/'app/js/studio-config.js').read_text('utf-8').split('window.SKY_STUDIO_CONFIG=',1)[1].rstrip(';\n'))
checks=[];originals=0
for item in items:
    path=root/'app'/item['asset'];assert path.resolve().is_relative_to((root/'app/assets/themes/v2').resolve())
    assert hashlib.sha256(path.read_bytes()).hexdigest()==item['webSha256']
    image=Image.open(path);assert list(image.size)==item['dimensions'] and image.format=='WEBP'
    if item['alpha']:
        assert image.mode=='RGBA' and image.getchannel('A').getextrema()[0]==0
        assert image.getchannel('A').getextrema()[1]>=250
    else:assert image.size==(1672,941)
    original=root.parents[1]/item['original']
    if original.exists():
        assert hashlib.sha256(original.read_bytes()).hexdigest()==item['originalSha256']
        source=Image.open(original);assert source.size==image.size
        if item['alpha']:assert source.getchannel('A').tobytes()==image.getchannel('A').tobytes()
        originals+=1
    checks.append({'asset':item['asset'],'bytes':path.stat().st_size,'dimensions':list(image.size),'alpha':item['alpha']})
ids=['christmas','starlight','citylights','prairie','rainforest','vault'];companions=set()
for id in ids:
    d=config['themes'][id]['decorations'];companions.add(d['companion'])
    assert d['scene']['type']=='image' and d['scene']['image']==d['cover']
    assert d['scene']['image']==f'assets/themes/v2/{id}-scene-v2.webp'
    assert d['companion']==f'assets/themes/v2/{id}-companions-v2.webp'
    assert d['identity']['image']==d['ornaments'][0]==f'assets/themes/v2/{id}-charm-v2.webp'
    assert d['layout']['sceneFit']=='cover' and 40<=d['layout']['companionWidth']<=50
    assert next(i for i in items if i['asset']==d['companion'])['characters']==2
assert len(companions)==6
report={'passed':True,'assets':checks,'totalWebBytes':sum(i['bytes'] for i in items),'originalsChecked':originals,'sixIndependentCompanionResources':True,'characterCountsAreVisualReviewMetadata':True}
(out/'results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n','utf-8')
print('PASS 18 WebP resources, hashes/native dimensions/alpha, available PNG originals, six distinct theme scenes/duos/charms and data-only composition')
