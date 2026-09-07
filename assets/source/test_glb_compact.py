"""Small deterministic fixtures; runs with standard Python, without Blender."""

import copy
import json
import struct
import unittest

from glb_compact import compact_glb_weights


def glb(document, payloads):
    document = copy.deepcopy(document)
    binary = bytearray()
    for view, payload in zip(document['bufferViews'], payloads):
        binary.extend(b'\0'*((-len(binary)) % 4))
        view.update(buffer=0, byteOffset=len(binary), byteLength=len(payload))
        binary.extend(payload)
    document['buffers'] = [{'byteLength': len(binary), 'name': 'Preserve buffer name'}]
    binary.extend(b'\0'*((-len(binary)) % 4))
    encoded = json.dumps(document).encode()
    encoded += b' '*((-len(encoded)) % 4)
    return struct.pack('<III', 0x46546C67, 2, 28+len(encoded)+len(binary))+struct.pack('<II', len(encoded), 0x4E4F534A)+encoded+struct.pack('<II', len(binary), 0x004E4942)+binary


def unpack(data):
    length = struct.unpack_from('<I', data, 12)[0]
    return json.loads(data[20:20+length]), data[28+length:]


def payload(document, binary, view):
    record = document['bufferViews'][view]
    offset = record.get('byteOffset', 0)
    return binary[offset:offset+record['byteLength']]


def fixture():
    weight = lambda rows: b''.join(struct.pack('<4f', *row) for row in rows)
    document = {
        'asset': {'version': '2.0', 'generator': 'Lossless fixture'},
        'extras': {'preserve': ['all', 'metadata']},
        'nodes': [{'name': 'head', 'extras': {'fitRole': 'side'}}],
        'meshes': [{'primitives': [
            {'attributes': {'WEIGHTS_0': 0, 'POSITION': 2}},
            {'attributes': {'WEIGHTS_0': 1}},
        ]}],
        'accessors': [
            {'bufferView': 0, 'componentType': 5126, 'type': 'VEC4', 'count': 2},
            {'bufferView': 1, 'componentType': 5126, 'type': 'VEC4', 'count': 2},
            {'bufferView': 2, 'componentType': 5126, 'type': 'VEC3', 'count': 1},
        ],
        'bufferViews': [{'target': 34962}, {'target': 34962}, {'target': 34962}, {}],
        'images': [{'bufferView': 3, 'mimeType': 'image/png', 'name': 'Keep exact PNG bytes'}],
    }
    payloads = [weight([(1, 0, 0, 0), (0, 1, 0, 0)]), weight([(.5, .5, 0, 0), (0, 1, 0, 0)]), struct.pack('<3f', .123, -.456, .789), b'\x89PNG\r\n\x1a\nunchanged\x00\xff\x7f']
    return document, payloads


class CompactWeightsTests(unittest.TestCase):
    def test_mixed_weights_roundtrip_other_payloads_and_metadata(self):
        document, payloads = fixture()
        original = glb(document, payloads)
        before, _ = unpack(original)
        result = compact_glb_weights(original)
        after, binary = unpack(result)
        self.assertEqual(after['accessors'][0]['componentType'], 5121)
        self.assertIs(after['accessors'][0]['normalized'], True)
        self.assertEqual(payload(after, binary, 0), bytes([255, 0, 0, 0, 0, 255, 0, 0]))
        decoded = [byte/255 for byte in payload(after, binary, 0)]
        self.assertEqual(decoded, list(struct.unpack('<8f', payloads[0])))
        for index in [1, 2, 3]:
            self.assertEqual(payload(after, binary, index), payloads[index])
        self.assertEqual(after['accessors'][1], before['accessors'][1])
        for index, view in enumerate(after['bufferViews']):
            self.assertEqual(view['byteOffset'] % 4, 0)
            before['bufferViews'][index]['byteOffset'] = view['byteOffset']
            before['bufferViews'][index]['byteLength'] = view['byteLength']
        before['accessors'][0].update(componentType=5121, normalized=True)
        before['buffers'][0]['byteLength'] = after['buffers'][0]['byteLength']
        self.assertEqual(after, before)
        self.assertEqual(struct.unpack_from('<I', result, 8)[0], len(result))
        self.assertEqual(compact_glb_weights(result), result)

    def test_nonexact_float32_roundtrip_is_not_accepted(self):
        document, payloads = fixture()
        # This value rounds back to the same FLOAT after UNORM8 decoding,
        # but its decoded numeric value is different and must remain FLOAT.
        value = struct.unpack('<f', struct.pack('<f', 1/255))[0]
        self.assertEqual(struct.unpack('<f', struct.pack('<f', round(value*255)/255))[0], value)
        self.assertNotEqual(round(value*255)/255, value)
        payloads[0] = struct.pack('<8f', value, 1-value, 0, 0, 1, 0, 0, 0)
        original = glb(document, payloads)
        self.assertEqual(compact_glb_weights(original), original)

    def test_shared_view_interleaving_and_other_semantics_are_untouched(self):
        for guard in ['accessor', 'image', 'stride', 'semantic', 'offset', 'min', 'max']:
            with self.subTest(guard=guard):
                document, payloads = fixture()
                if guard == 'accessor':
                    document['accessors'].append(copy.deepcopy(document['accessors'][0]))
                elif guard == 'image':
                    document['images'].append({'bufferView': 0, 'mimeType': 'image/png'})
                elif guard == 'stride':
                    document['bufferViews'][0]['byteStride'] = 16
                elif guard == 'semantic':
                    document['meshes'][0]['primitives'][0]['attributes']['COLOR_0'] = 0
                elif guard == 'offset':
                    document['accessors'][0]['byteOffset'] = 4
                else:
                    document['accessors'][0][guard] = [0, 0, 0, 0]
                original = glb(document, payloads)
                self.assertEqual(compact_glb_weights(original), original)

    def test_overlapping_views_and_invalid_weights_are_not_rewritten(self):
        document, payloads = fixture()
        original = glb(document, payloads)
        parsed, binary = unpack(original)
        parsed['bufferViews'][2]['byteOffset'] = parsed['bufferViews'][0]['byteOffset']
        encoded = json.dumps(parsed).encode()
        encoded += b' '*((-len(encoded)) % 4)
        overlapping = struct.pack('<III', 0x46546C67, 2, 28+len(encoded)+len(binary))+struct.pack('<II', len(encoded), 0x4E4F534A)+encoded+struct.pack('<II', len(binary), 0x004E4942)+binary
        self.assertEqual(compact_glb_weights(overlapping), overlapping)
        for value in [float('nan'), float('inf'), -1, 2]:
            with self.subTest(value=value):
                document, payloads = fixture()
                payloads[0] = struct.pack('<8f', value, 0, 0, 0, 1, 0, 0, 0)
                original = glb(document, payloads)
                self.assertEqual(compact_glb_weights(original), original)


if __name__ == '__main__':
    unittest.main()
