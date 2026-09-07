"""Losslessly compact standalone rigid skin-weight arrays in exported GLBs.

Only FLOAT WEIGHTS_0 values that decode *exactly* from normalized UINT8 are
eligible. No geometry, normals, colors, UVs, images, or extensions are changed.
This is an export step; the runtime already supports this standard glTF type.
"""

import json
import math
import struct


def compact_glb_weights(data):
    """Return a GLB with eligible weight views repacked at four-byte offsets.

    Shared/accessor-interleaved/overlapping views are deliberately untouched.
    Accessor min/max bounds are stored in component units, so bounded FLOAT
    accessors remain FLOAT instead of changing the meaning of that metadata.
    With no eligible accessor, the input bytes are returned verbatim.
    """
    if len(data) < 28:
        raise ValueError('Truncated GLB')
    magic, version, length = struct.unpack_from('<III', data)
    if magic != 0x46546C67 or version != 2 or length != len(data):
        raise ValueError('Invalid GLB header')
    json_length, json_type = struct.unpack_from('<II', data, 12)
    binary_header = 20+json_length
    if json_type != 0x4E4F534A or json_length % 4 or binary_header+8 > len(data):
        raise ValueError('Invalid GLB JSON chunk')
    document = json.loads(data[20:binary_header])
    binary_length, binary_type = struct.unpack_from('<II', data, binary_header)
    if binary_type != 0x004E4942 or binary_length % 4 or binary_header+8+binary_length != len(data):
        raise ValueError('Expected one embedded GLB binary chunk')
    buffers = document.get('buffers', [])
    if len(buffers) != 1 or 'uri' in buffers[0]:
        raise ValueError('Expected one embedded buffer')
    declared_length = buffers[0].get('byteLength')
    if not isinstance(declared_length, int) or declared_length < 0 or declared_length > binary_length:
        raise ValueError('Invalid embedded buffer length')
    binary = data[binary_header+8:binary_header+8+declared_length]
    views = document.get('bufferViews', [])
    accessors = document.get('accessors', [])
    ranges = []
    for view in views:
        start, count = view.get('byteOffset', 0), view.get('byteLength')
        if view.get('buffer') != 0 or not isinstance(start, int) or not isinstance(count, int) or start < 0 or count < 0 or start+count > len(binary):
            raise ValueError('Invalid embedded buffer view')
        ranges.append((start, start+count))

    uses = {}
    for mesh in document.get('meshes', []):
        for primitive in mesh.get('primitives', []):
            for semantic, index in primitive.get('attributes', {}).items():
                uses.setdefault(index, set()).add(semantic)
            if 'indices' in primitive:
                uses.setdefault(primitive['indices'], set()).add('indices')
            for target in primitive.get('targets', []):
                for index in target.values():
                    uses.setdefault(index, set()).add('morph')
    for skin in document.get('skins', []):
        if 'inverseBindMatrices' in skin:
            uses.setdefault(skin['inverseBindMatrices'], set()).add('skin')
    for animation in document.get('animations', []):
        for sampler in animation.get('samplers', []):
            for key in ['input', 'output']:
                if key in sampler:
                    uses.setdefault(sampler[key], set()).add('animation')

    replacement = {}
    for index, accessor in enumerate(accessors):
        if uses.get(index) != {'WEIGHTS_0'} or accessor.get('componentType') != 5126 or accessor.get('type') != 'VEC4' or accessor.get('normalized') or 'sparse' in accessor or 'min' in accessor or 'max' in accessor:
            continue
        view_index, count = accessor.get('bufferView'), accessor.get('count')
        if not isinstance(view_index, int) or not 0 <= view_index < len(views) or not isinstance(count, int) or count <= 0 or accessor.get('byteOffset', 0) != 0:
            continue
        view = views[view_index]
        if 'byteStride' in view or view['byteLength'] != count*16:
            continue
        # A view shared by another accessor, image, or overlapping view cannot
        # be repurposed even if this one accessor looks independently eligible.
        if sum(other.get('bufferView') == view_index for other in accessors) != 1 or any(image.get('bufferView') == view_index for image in document.get('images', [])):
            continue
        start, end = ranges[view_index]
        if any(other != view_index and max(start, left) < min(end, right) for other, (left, right) in enumerate(ranges)):
            continue
        encoded = bytearray()
        for values in struct.iter_unpack('<4f', binary[start:end]):
            for value in values:
                if not math.isfinite(value) or not 0 <= value <= 1:
                    break
                byte = round(value*255)
                # Numeric equality is intentionally stricter than rounding
                # back to FLOAT: CPU fitting and GPU skinning both stay exact.
                if byte/255 != value:
                    break
                encoded.append(byte)
            else:
                continue
            break
        if len(encoded) != count*4:
            continue
        accessor['componentType'] = 5121
        accessor['normalized'] = True
        replacement[view_index] = bytes(encoded)
    if not replacement:
        return data

    packed = bytearray()
    for index, view in enumerate(views):
        packed.extend(b'\0'*((-len(packed)) % 4))
        start, end = ranges[index]
        payload = replacement.get(index, binary[start:end])
        view['byteOffset'] = len(packed)
        view['byteLength'] = len(payload)
        packed.extend(payload)
    buffers[0]['byteLength'] = len(packed)
    packed.extend(b'\0'*((-len(packed)) % 4))
    encoded_json = json.dumps(document, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
    encoded_json += b' '*((-len(encoded_json)) % 4)
    total = 12+8+len(encoded_json)+8+len(packed)
    return (struct.pack('<III', 0x46546C67, 2, total)
            +struct.pack('<II', len(encoded_json), 0x4E4F534A)+encoded_json
            +struct.pack('<II', len(packed), 0x004E4942)+packed)
