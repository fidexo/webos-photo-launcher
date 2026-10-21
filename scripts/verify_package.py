"""Inspect the local IPK without running application or TV code."""
import hashlib
import io
import json
import pathlib
import tarfile

root = pathlib.Path(__file__).resolve().parent.parent
expected = json.loads((root / 'appinfo.json').read_text(encoding='utf-8'))
package = root / 'artifacts' / (expected['id'] + '_' + expected['version'] + '_all.ipk')
raw = package.read_bytes()
assert raw[:8] == b'!<arch>\n', 'Not an ar/IPK archive'
parts = {}
offset = 8
while offset < len(raw):
    header = raw[offset:offset + 60]
    assert len(header) == 60 and header[58:60] == b'`\n'
    name = header[:16].decode('ascii').strip().rstrip('/')
    length = int(header[48:58].decode('ascii'))
    parts[name] = raw[offset + 60:offset + 60 + length]
    offset += 60 + length + (length % 2)

assert parts['debian-binary'].strip() == b'2.0'
with tarfile.open(fileobj=io.BytesIO(parts['data.tar.gz']), mode='r:gz') as archive:
    members = [member for member in archive.getmembers() if member.isfile()]
    assert members and min(member.mtime for member in members) > 946684800, 'Epoch timestamps are unsuitable for webOS 5'
    names = [member.name for member in members]
    assert not any('node_modules' in name or 'sdk-source' in name or 'lg-sdk.zip' in name for name in names)
    assert any(name.endswith('/vendor/webOSTV.js') for name in names)
    manifest = next(member for member in members if member.name.endswith('/appinfo.json'))
    info = json.load(archive.extractfile(manifest))
    assert info['id'] == expected['id'] and info['version'] == expected['version']
    for member in members:
        if member.name == 'usr/palm/packages/com.frxn.mipantalla/packageinfo.json':
            metadata = json.load(archive.extractfile(member))
            assert metadata['id'] == info['id'] and metadata['version'] == info['version']
            continue
        relative = member.name.split('com.frxn.mipantalla/', 1)[-1]
        local = root / 'dist' / relative
        assert local.is_file(), 'Unexpected file: ' + member.name
        assert archive.extractfile(member).read() == local.read_bytes(), 'Package differs from build: ' + relative
print(json.dumps({'package': package.name, 'bytes': len(raw), 'files': len(members), 'sha256': hashlib.sha256(raw).hexdigest(), 'matches_dist': True}))
