'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const audit = require('../scripts/privacy-audit.cjs');

function section(name, body) { return '__MP_AUDIT_' + name + '__\n' + body + '\n'; }
function fixture() {
  const sections = {
    ROOT: '0', APPS: JSON.stringify({returnValue: true, apps: [
      {id: 'org.webosbrew.hbchannel', version: '0.7.3', title: 'Private name'},
      {id: 'com.frxn.mipantalla', version: '0.7.4', systemApp: false, removable: true},
      {id: 'unrelated.private', title: 'Private name', systemApp: true}
    ]}),
    GENERAL: JSON.stringify({returnValue: true, settings: {homePromotion: 'off', personalRecommend: {value: 'off'}, defaultApps: {home: 'com.frxn.mipantalla', other: 'Private default'}, ignored: 'private'}}),
    OPTION: JSON.stringify({returnValue: true, settings: {livePlus: 'off'}}),
    MEMORY: 'MemTotal: 1000000 kB\nMemAvailable: 300000 kB\nMemFree: 100000 kB',
    DISK: 'Filesystem 1K-blocks Used Available Use% Mounted on\nprivate-device 1000000 200000 800000 20% /media/developer',
    PAGE: '4096',
    CPU1: 'cpu 100 0 100 800 0 0 0 0 0 0\ncpu0 25 0 25 200 0 0 0 0',
    PROC1: '12 (iconnectivity) S 1 0 0 0 0 0 0 0 0 0 10 10 0 0 0 0 0 0 1 0 100',
    CPU2: 'cpu 200 0 200 1600 0 0 0 0 0 0\ncpu0 50 0 50 400 0 0 0 0',
    PROC2: '12 (iconnectivity) S 1 0 0 0 0 0 0 0 0 0 60 60 0 0 0 0 0 0 1 0 200'
  };
  return Object.entries(sections).map(([key, value]) => section(key, value)).join('') + section('END', '');
}

test('arguments accept explicit host/key and reject unsafe input', () => {
  const exists = path => path === 'key path';
  const value = audit.parseArgs(['--host', 'tv.example.test', '--identity', 'key path', '--port', '22'], exists);
  assert.equal(value.port, 22);
  for (const host of ['-oProxyCommand=evil', 'tv host', 'tv;id', 'tv\nother', 'a@b', 'a/b']) {
    assert.throws(() => audit.parseArgs(['--host', host, '--identity', 'key path'], exists));
  }
  for (const port of ['0', '65536', '22;id', '1.5']) {
    assert.throws(() => audit.parseArgs(['--host', 'tv', '--identity', 'key path', '--port', port], exists));
  }
  assert.throws(() => audit.parseArgs(['--host', 'tv', '--identity', 'missing'], exists));
  assert.throws(() => audit.parseArgs(['--host', 'tv', '--identity', 'key path', '--unknown'], exists));
  assert.throws(() => audit.parseArgs(['--host', 'tv', '--identity', 'key path', '--port', '22', '--port', '23'], exists));
});

test('SSH keeps host verification and treats all user data as arguments', () => {
  const args = audit.buildSshArgs({host: 'tv', identity: 'key path', port: 22});
  assert.ok(args.includes('StrictHostKeyChecking=yes'));
  assert.ok(args.includes('BatchMode=yes'));
  assert.ok(args.includes('IdentitiesOnly=yes'));
  assert.deepEqual(args.slice(-2), ['root@tv', 'sh -s']);
  assert.ok(args.includes('key path'));
});

test('parser reports known facts without unrelated app or settings data', () => {
  const value = audit.parseTranscript(fixture());
  assert.equal(value.apps.total, 3);
  assert.equal(value.apps.system, 1);
  assert.equal(value.apps.removable, 1);
  assert.equal(value.homebrew.present, true);
  assert.equal(value.launcher.version, '0.7.4');
  assert.equal(value.launcher.homeIsLauncher, true);
  assert.equal(value.preferences.general.homePromotion, 'off');
  assert.equal(value.preferences.general.personalRecommend, 'off');
  assert.equal(value.preferences.option.livePromotion, 'unknown');
  assert.equal(value.memory.availableKiB, 300000);
  assert.equal(value.disk.availableKiB, 800000);
  assert.equal(value.cpu.top[0].percentOfMachine, 10);
  assert.ok(!JSON.stringify(value).includes('Private'));
  assert.ok(!JSON.stringify(value).includes('private-device'));
  assert.ok(!JSON.stringify(value).includes('unrelated.private'));
});

test('missing/failed Luna responses and invalid root cannot become a clean result', () => {
  assert.throws(() => audit.parseTranscript(fixture().replace('"returnValue":true', '"returnValue":false')));
  assert.throws(() => audit.parseTranscript(fixture().replace('__MP_AUDIT_ROOT__\n0', '__MP_AUDIT_ROOT__\n1000')));
  assert.throws(() => audit.parseTranscript(fixture().replace('__MP_AUDIT_MEMORY__', '__OTHER__')));
  assert.throws(() => audit.parseTranscript(fixture().replace('__MP_AUDIT_END__', '')));
});

test('execution failures never expose raw SSH stderr or identity paths', () => {
  assert.throws(() => audit.collect({host: 'tv', identity: 'secret-key', port: 22}, () => ({status: 255, stderr: 'PRIVATE KEY secret-key'})), /^Error: No se pudo completar/);
});

test('collector sends a fixed LF script through stdin without shell interpolation', () => {
  const value = audit.collect({host: 'tv', identity: 'key path', port: 22}, (command, args, options) => {
    assert.equal(command, 'ssh');
    assert.equal(options.shell, false);
    assert.equal(options.input, audit.remoteScript());
    assert.ok(!options.input.includes('\r'));
    assert.ok(!options.input.includes('key path'));
    assert.ok(options.timeout <= 25000);
    return {status: 0, stdout: fixture()};
  });
  assert.equal(value.launcher.present, true);
});

test('unrecognized settings and invalid versions remain unknown', () => {
  const value = audit.parseTranscript(fixture().replace('"version":"0.7.4"', '"version":"Private data"').replace('"homePromotion":"off"', '"homePromotion":false'));
  assert.equal(value.launcher.version, null);
  assert.equal(value.preferences.general.homePromotion, 'unknown');
  assert.equal(value.cpu.pauseSeconds, 2);
  assert.equal(value.cpu.sampleSeconds, undefined);
  assert.equal(audit.parseTranscript(fixture().replace('"home":"com.frxn.mipantalla"', '"home":null')).launcher.homeIsLauncher, null);
  assert.equal(audit.parseTranscript(fixture().replace('"home":"com.frxn.mipantalla"', '"home":"com.webos.app.fullhome"')).launcher.homeIsLauncher, false);
});

test('malformed or duplicate app IDs cannot prove absence of LG packages', () => {
  assert.throws(() => audit.parseTranscript(fixture().replace('"id":"unrelated.private"', '"unexpected":"unrelated.private"')));
  assert.throws(() => audit.parseTranscript(fixture().replace('"id":"unrelated.private"', '"id":"com.frxn.mipantalla"')));
  assert.throws(() => audit.parseTranscript(fixture().replace('"id":"unrelated.private"', '"id":"bad id"')));
});

test('inconsistent CPU counters and core counts are rejected instead of producing percentages', () => {
  assert.throws(() => audit.parseTranscript(fixture().replace('cpu 200 0 200 1600', 'cpu 2000 0 2000 100')));
  assert.throws(() => audit.parseTranscript(fixture().replace('cpu 200 0 200 1600', 'cpu 10 0 10 1600')));
  assert.throws(() => audit.parseTranscript(fixture().replace('cpu0 50 0 50 400', 'cpu0 50 0 50 400\ncpu1 50 0 50 400')));
});

test('markers must be complete, ordered, unique and end the transcript', () => {
  const text = fixture();
  assert.throws(() => audit.parseTranscript('__MP_AUDIT_END__\n' + text.replace('__MP_AUDIT_END__\n\n', '')));
  assert.throws(() => audit.parseTranscript(text + 'unexpected trailing data'));
  assert.throws(() => audit.parseTranscript(text.replace('__MP_AUDIT_CPU1__', '__MP_AUDIT_PAGE__\n4096\n__MP_AUDIT_CPU1__')));
  assert.throws(() => audit.parseTranscript(text.replace('__MP_AUDIT_PAGE__\n4096\n', '')));
});
