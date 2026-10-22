"""Empaqueta dist/ en artifacts/<id>_<version>_all.ipk (sin tocar la TV). Uso: npm run build && python scripts/make_ipk.py ."""
import io, tarfile, gzip, pathlib, sys, time, json
root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else pathlib.Path(__file__).resolve().parent.parent); info = json.loads((root/'appinfo.json').read_text(encoding='utf-8'))
id_, ver = info['id'], info['version']; ts = int(time.time())
def tgz(add):
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode='wb', mtime=ts) as gz:
        with tarfile.open(fileobj=gz, mode='w', format=tarfile.GNU_FORMAT) as t: add(t)
    return buf.getvalue()
def d(t, name):
    m = tarfile.TarInfo(name); m.type = tarfile.DIRTYPE; m.mode = 0o755; m.mtime = ts; t.addfile(m)
def f(t, name, data):
    m = tarfile.TarInfo(name); m.size = len(data); m.mode = 0o644; m.mtime = ts; t.addfile(m, io.BytesIO(data))
dist = root/'dist'; app = 'usr/palm/applications/'+id_
def data(t):
    for p in ['usr','usr/palm','usr/palm/applications','usr/palm/packages',app,'usr/palm/packages/'+id_]: d(t,p)
    for q in sorted(dist.rglob('*')):
        rel = q.relative_to(dist).as_posix()
        if q.is_dir(): d(t, app+'/'+rel)
        else: f(t, app+'/'+rel, q.read_bytes())
    f(t, 'usr/palm/packages/%s/packageinfo.json'%id_, json.dumps({'id':id_,'version':ver,'app':id_}, indent=2).encode()+b'\n')
size = sum(q.stat().st_size for q in dist.rglob('*') if q.is_file())
control = ('Package: %s\nVersion: %s\nSection: misc\nPriority: optional\nArchitecture: all\nInstalled-Size: %d\nMaintainer: N/A <nobody@example.com>\nDescription: This is a webOS application.\nwebOS-Package-Format-Version: 2\nwebOS-Packager-Version: x.y.x\n'%(id_,ver,size)).encode()
parts = [('debian-binary', b'2.0\n'), ('control.tar.gz', tgz(lambda t: f(t,'control',control))), ('data.tar.gz', tgz(data))]
out = b'!<arch>\n'
for n, b in parts:
    out += n.ljust(16).encode()
    out += str(ts).ljust(12).encode()+b'0     0     100644  '+str(len(b)).ljust(10).encode()+b'`\n'+b+(b'\n' if len(b)%2 else b'')
dest = root/'artifacts'/('%s_%s_all.ipk'%(id_,ver))
assert not dest.exists(), 'ya existe'
dest.write_bytes(out); print(dest)
