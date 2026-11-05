"""Pin, extract and embed full C4-B6 chromatic samples; never execute upstream JS."""
from concurrent.futures import ThreadPoolExecutor
import base64
import hashlib
import json
from pathlib import Path
import re
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
REVISION = '044fab8e1456bfafc5776e86dfd6bb8697149aef'
BASE = f'https://raw.githubusercontent.com/gleitz/midi-js-soundfonts/{REVISION}/FluidR3_GM/'
BANKS = ['orchestral_harp', 'music_box', 'flute', 'acoustic_guitar_nylon']
NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']


def fetch(bank):
    url = BASE + bank + '-mp3.js'
    source = urllib.request.urlopen(url, timeout=60).read()
    match = re.search(rb'MIDI\.Soundfont\.' + bank.encode() + rb'\s*=\s*(\{.*\})\s*;?\s*$', source, re.S)
    if not match:
        raise ValueError('Unexpected sample data format: ' + bank)
    data = json.loads(re.sub(rb',\s*}', b'}', match[1]))
    selected, manifest = {}, {}
    folder = ROOT / 'app/assets/instruments' / bank
    folder.mkdir(parents=True, exist_ok=True)
    for midi in range(60, 96):
        note = NAMES[midi % 12] + str(midi // 12 - 1)
        uri = data[note]
        assert uri.startswith('data:audio/mp3;base64,')
        payload = base64.b64decode(uri.split(',', 1)[1], validate=True)
        assert len(payload) > 500
        (folder / f'{midi}.mp3').write_bytes(payload)
        selected[str(midi)] = uri.split(',', 1)[1]
        manifest[str(midi)] = {'note': note, 'bytes': len(payload), 'sha256': hashlib.sha256(payload).hexdigest()}
    return bank, selected, {'source': url, 'sourceSha256': hashlib.sha256(source).hexdigest(), 'samples': manifest}


def verify():
    embedded = (ROOT / 'app/js/instrument-samples.js').read_text('utf-8')
    banks = json.loads(embedded.split('window.SKY_INSTRUMENT_SAMPLES=', 1)[1].rstrip(';\n'))
    manifest = json.loads((ROOT / 'sources/instruments-manifest.json').read_text('utf-8'))
    assert set(banks) == set(BANKS)
    for bank in BANKS:
        assert set(banks[bank]) == {str(n) for n in range(60, 96)}
        for midi, entry in manifest['banks'][bank]['samples'].items():
            payload = (ROOT / f'app/assets/instruments/{bank}/{midi}.mp3').read_bytes()
            assert payload == base64.b64decode(banks[bank][midi], validate=True)
            assert hashlib.sha256(payload).hexdigest() == entry['sha256']
    print('PASS 4 offline banks x 36 chromatic samples: assets, embedded data and hashes agree')


if __name__ == '__main__':
    import sys
    if '--verify' in sys.argv:
        verify()
    else:
        results = list(ThreadPoolExecutor(max_workers=4).map(fetch, BANKS))
        banks = {bank: samples for bank, samples, _ in results}
        manifest = {'revision': REVISION, 'license': 'CC BY 3.0 US (rendered samples, upstream README)', 'banks': {bank: meta for bank, _, meta in results}}
        (ROOT / 'app/js/instrument-samples.js').write_text('// FluidR3 GM / Frank Wen; MIDI.js rendering by Benjamin Gleitzman. CC BY 3.0 US. See licenses/INSTRUMENTS.md.\nwindow.SKY_INSTRUMENT_SAMPLES=' + json.dumps(banks, separators=(',', ':')) + ';\n', encoding='utf-8')
        (ROOT / 'sources/instruments-manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
        verify()
