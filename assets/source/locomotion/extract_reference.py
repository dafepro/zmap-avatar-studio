"""Extract untouched animation clips and their review mannequin from a source GLB.

Usage: python3 extract_reference.py INPUT.glb OUTPUT.glb CLIP_NAME [...]
No sampling, retargeting, coordinate conversion or geometric changes occur here.
The compact subset retains the creator's rig and source keyframes exactly.
"""
import copy
import hashlib
import json
from pathlib import Path
import struct
import sys


def extract(source_path, output_path, clips):
    raw = Path(source_path).read_bytes()
    magic, version, total = struct.unpack_from('<4sII', raw)
    if magic != b'glTF' or version != 2 or total != len(raw):
        raise ValueError('Expected a complete glTF 2 binary')
    json_len, json_kind = struct.unpack_from('<I4s', raw, 12)
    if json_kind != b'JSON':
        raise ValueError('Expected JSON first chunk')
    doc = json.loads(raw[20:20 + json_len])
    binary_len, binary_kind = struct.unpack_from('<I4s', raw, 20 + json_len)
    if binary_kind != b'BIN\x00':
        raise ValueError('Expected embedded binary buffer')
    binary = raw[28 + json_len:28 + json_len + binary_len]
    if doc.get('extensionsUsed') or doc.get('images'):
        raise ValueError('This extractor expects the untextured extension-free UAL source')
    if len(doc['buffers']) != 1 or doc['buffers'][0].get('uri'):
        raise ValueError('Expected a single embedded buffer')
    original_animations = {a['name']: a for a in doc['animations']}
    if len(set(clips)) != len(clips) or any(c not in original_animations for c in clips):
        raise ValueError('Requested clips must exist and be unique')
    doc['animations'] = [copy.deepcopy(original_animations[c]) for c in clips]
    refs = set()
    for mesh in doc['meshes']:
        for p in mesh['primitives']:
            refs.update(p['attributes'].values())
            if 'indices' in p:
                refs.add(p['indices'])
            for target in p.get('targets', []):
                refs.update(target.values())
    for skin in doc['skins']:
        if 'inverseBindMatrices' in skin:
            refs.add(skin['inverseBindMatrices'])
    for animation in doc['animations']:
        for sampler in animation['samplers']:
            refs.update((sampler['input'], sampler['output']))
    ids = sorted(refs)
    accessor_map = {old: new for new, old in enumerate(ids)}
    accessors = [copy.deepcopy(doc['accessors'][old]) for old in ids]
    if any('sparse' in a for a in accessors):
        raise ValueError('Unexpected sparse accessor')
    view_ids = sorted({a['bufferView'] for a in accessors})
    view_map = {old: new for new, old in enumerate(view_ids)}
    views = []
    payload = bytearray()
    for old in view_ids:
        view = copy.deepcopy(doc['bufferViews'][old])
        while len(payload) % 4:
            payload.append(0)
        offset = view.get('byteOffset', 0)
        part = binary[offset:offset + view['byteLength']]
        if len(part) != view['byteLength']:
            raise ValueError('Source buffer view extends beyond binary')
        view['byteOffset'] = len(payload)
        payload.extend(part)
        views.append(view)
    for a in accessors:
        a['bufferView'] = view_map[a['bufferView']]
    for mesh in doc['meshes']:
        for p in mesh['primitives']:
            p['attributes'] = {k: accessor_map[v] for k, v in p['attributes'].items()}
            if 'indices' in p:
                p['indices'] = accessor_map[p['indices']]
            for target in p.get('targets', []):
                for k, v in list(target.items()):
                    target[k] = accessor_map[v]
    for skin in doc['skins']:
        if 'inverseBindMatrices' in skin:
            skin['inverseBindMatrices'] = accessor_map[skin['inverseBindMatrices']]
    for animation in doc['animations']:
        for sampler in animation['samplers']:
            sampler['input'] = accessor_map[sampler['input']]
            sampler['output'] = accessor_map[sampler['output']]
    doc['accessors'] = accessors
    doc['bufferViews'] = views
    doc['buffers'] = [{'byteLength': len(payload)}]
    doc.setdefault('asset', {}).setdefault('extras', {}).update({
        'source': 'Quaternius Universal Animation Library; CC0 1.0',
        'sourceSha256': hashlib.sha256(raw).hexdigest(),
        'modification': 'Selected animation subset; original keyframes, mannequin and rig retained unchanged',
    })
    json_bytes = json.dumps(doc, separators=(',', ':')).encode()
    json_bytes += b' ' * (-len(json_bytes) % 4)
    payload += bytes(-len(payload) % 4)
    output = struct.pack('<4sII', b'glTF', 2, 28 + len(json_bytes) + len(payload))
    output += struct.pack('<I4s', len(json_bytes), b'JSON') + json_bytes
    output += struct.pack('<I4s', len(payload), b'BIN\x00') + payload
    Path(output_path).write_bytes(output)
    print(json.dumps({'output': str(output_path), 'bytes': len(output),
                      'sha256': hashlib.sha256(output).hexdigest(), 'clips': clips}))


if __name__ == '__main__':
    if len(sys.argv) < 4:
        raise SystemExit(__doc__)
    extract(sys.argv[1], sys.argv[2], sys.argv[3:])
