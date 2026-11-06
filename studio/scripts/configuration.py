"""Compose independent source configurations into generated offline/browser assets."""
import json
from pathlib import Path
import re


def render(root):
    root = Path(root)
    folder = root / 'config'
    load = lambda name: json.loads((folder / name).read_text(encoding='utf-8'))
    player = load('player-interactions.json')
    assert not ({'score', 'events', 'theme', 'themes', 'songs'} & player.keys()), 'Player settings must not embed song/theme data'
    assert player['grid'] == {'columns': 8, 'rows': 4, 'keyCount': 15}, 'The shared Sky layout is 8x4 / 15 keys'
    assert player['roll']['initialSeconds'] in player['roll']['windowsSeconds']
    assert all(player['roll']['labelIntervalSecondsByWindow'][str(window)] > 0 for window in player['roll']['windowsSeconds'])
    assert player['selectors']['instrumentRowsBelow'] >= 0
    assert 0 <= player['volume']['default'] <= 1 and 0 < player['volume']['maxGain'] <= 8
    assert 0 < player['volume']['rampSeconds'] <= 0.1
    elements = load('themes/elements.json')['elements']
    themes = {}
    for path in sorted((folder / 'themes').glob('*.json')):
        if path.name in ['style-rules.json', 'elements.json']:
            continue
        theme = json.loads(path.read_text(encoding='utf-8'))
        assert not ({'score', 'events', 'interaction', 'player', 'songs'} & theme.keys()), 'Theme must not contain score/interaction definitions'
        assert path.stem == theme['id'] and theme['id'] not in themes
        refs = theme['elementRefs']
        assert all(value in elements for value in refs.values() if value and isinstance(value, str))
        assert all(value in elements for value in refs.get('effects', []))
        identity = elements[refs['identity']]
        scene = elements[refs['stage']]
        assert scene['kind'] in ['frames', 'symbol']
        theme['decorations']['identity'] = {'image': identity.get('path'), 'glyph': identity.get('glyph', '✧')}
        theme['decorations']['cover'] = elements[refs['cover']]['path'] if refs.get('cover') else None
        theme['decorations']['treeImage'] = elements[refs['tree']]['path'] if refs.get('tree') else None
        theme['decorations']['scene'] = {'type': scene['kind'], 'frameCount': scene.get('count', 0), 'framePattern': scene.get('pattern'), 'periodMs': scene.get('periodMs', 6000)}
        theme['decorations']['effects'] = [elements[value]['type'] for value in refs.get('effects', [])]
        if refs.get('palette'):
            theme['appearanceOverrides'] = theme.get('appearance', {})
            theme['appearance'] = {**elements[refs['palette']]['colors'], **theme['appearanceOverrides']}
        theme['elements'] = elements
        assert all(re.fullmatch(r'#[0-9a-fA-F]{6}', color) for color in theme['appearance'].values())
        themes[theme['id']] = theme
    library = load('library.json')
    order = library.get('themeOrder', [])
    themes = {key: themes[key] for key in order + [key for key in themes if key not in order]}
    assert library['defaultTheme'] in themes
    songs, ids, entries, music_files, theme_files, packages = [], set(), [], {}, {}, {}
    for entry_path in library['entries']:
        assert re.fullmatch(r'songs/[a-z0-9-]+\.json', entry_path)
        entry = load(entry_path)
        assert entry['format'] == 'sky-music-entry' and entry['schemaVersion'] == 1
        assert re.fullmatch(r'scores/[a-z0-9-]+\.skytrack', entry['music'])
        assert re.fullmatch(r'themes/[a-z0-9-]+\.skytheme', entry['theme'])
        score_id = Path(entry['music']).stem
        score = load('scores/' + score_id + '.json')
        assert set(score) <= {'schemaVersion', 'keyCount', 'mode', 'gridIntervalMs', 'tuning', 'events'}, 'Scores must contain only musical data'
        assert score['keyCount'] == 15 and isinstance(score['events'], list)
        for event in score['events']:
            assert 0 <= event['timeMs'] <= 36000000
            assert all(isinstance(note, int) and 1 <= note <= 15 for note in event['notes'])
        assert entry['id'] not in ids
        ids.add(entry['id'])
        theme_id = Path(entry['theme']).stem
        assert theme_id in themes, 'The song composition must reference an existing theme package'
        if entry.get('card', {}).get('coverElement'):
            assert entry['card']['coverElement'] in elements
        song = {key: value for key, value in entry.items() if key not in ['music', 'theme', 'format', 'schemaVersion']}
        song.update(format='skymusic-project', schemaVersion=1)
        song['score'] = {key: value for key, value in score.items() if key not in ['schemaVersion', 'keyCount']}
        song['theme'] = {'id': theme_id, 'stage': theme_id, **themes[theme_id].get('initialOverrides', {})}
        song['entry'] = {'format': 'skymusic', 'schemaVersion': 2, **{key: value for key, value in entry.items() if key not in ['music', 'theme', 'format', 'schemaVersion']}, 'music': {'format': 'skytrack', **score, 'schemaVersion': 1, 'timeUnit': 'ms', 'durationMs': entry.get('durationMs', 0)}, 'theme': {'id': theme_id}}
        songs.append(song)
        entries.append(song['entry'])
        music_files[entry['music']] = {'format': 'skytrack', **score, 'schemaVersion': 1, 'timeUnit': 'ms', 'durationMs': entry.get('durationMs', 0)}
        theme_files[entry['theme']] = {'format': 'skytheme', 'schemaVersion': 2, 'definition': themes[theme_id]}
        packages['app/library/' + entry['id'] + '.skymusic'] = json.dumps(song['entry'], ensure_ascii=False, indent=2) + '\n'
    rules = load('themes/style-rules.json')['rules']
    used = []
    def replace(match):
        key = match[1]
        used.append(key)
        return rules[key]
    css = re.sub(r'/\* THEME_STYLE:([^ ]+) \*/', replace, (root / 'app/styles.css').read_text(encoding='utf-8'))
    assert set(used) == set(rules), 'Every theme style slot must have exactly one definition'
    assert len(used) == len(set(used))
    compact = lambda obj: json.dumps(obj, ensure_ascii=False, separators=(',', ':'))
    config = {'player': player, 'themes': themes, 'defaultTheme': library['defaultTheme'], 'elements': elements,
              'platform': {'entries': entries, 'music': music_files, 'themes': theme_files}}
    packages.update({'app/library/' + key: json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n' for key, value in {**music_files, **theme_files}.items()})
    return {**packages,
        'app/js/studio-config.js': '// Generated from config/; edit the independent JSON sources.\nwindow.SKY_STUDIO_CONFIG=' + compact(config) + ';\n',
        'app/js/builtins.js': '// Generated from config/library.json and config/scores/; do not edit.\nwindow.SKY_BUILTINS=' + compact(songs) + ';\n',
        'app/player-styles.css': '/* Generated from app/styles.css and config/themes/style-rules.json. */\n' + css,
    }


def generate(root, check=False):
    root = Path(root)
    for name, expected in render(root).items():
        path = root / name
        if check:
            assert path.read_text(encoding='utf-8') == expected, 'Generated configuration out of date: ' + name
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(expected, encoding='utf-8')


if __name__ == '__main__':
    import sys
    generate(Path(__file__).resolve().parents[1], check='--check' in sys.argv)
    print('PASS independent scores, interactions, themes and generated-data consistency')
