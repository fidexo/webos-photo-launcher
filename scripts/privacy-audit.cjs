#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const cp = require('node:child_process');

const GENERAL = ['homePromotion', 'screenSaverAd', 'adCookie', 'customizedAd', 'personalRecommend', 'homeAutoLaunch', 'defaultApps'];
const OPTION = ['livePlus', 'livePromotion', 'webOSPromotionVideo', 'quickStartMode'];
const SECTIONS = ['ROOT', 'APPS', 'GENERAL', 'OPTION', 'MEMORY', 'DISK', 'PAGE', 'CPU1', 'PROC1', 'CPU2', 'PROC2', 'END'];
const HELP = `Auditoría LG webOS, sólo lectura. Requiere Node >=18, OpenSSH y root ya instalado/autorizado.
Uso: node scripts/privacy-audit.cjs --host HOST --identity RUTA [--port 22] [--output ARCHIVO]
La clave sólo se entrega a SSH; no se lee. No instala, modifica ajustes ni descubre otros equipos.
La identidad del host debe estar verificada en known_hosts. Para un host nuevo, conectate primero
con SSH normal y verificá su huella por un canal confiable; no desactives StrictHostKeyChecking.
Sin --output no guarda archivos. Con --output crea un informe saneado nuevo, con modo 0600.
En Windows guardalo además en una carpeta privada: los permisos dependen de las ACL locales.
El informe no demuestra ausencia de telemetría ni mide FPS. CPU es una muestra de 2 segundos.`;

function parseArgs(argv, exists = path => fs.existsSync(path) && fs.statSync(path).isFile()) {
  const opts = {port: 22};
  const seen = new Set();
  const names = {'--host': 'host', '--identity': 'identity', '--port': 'port', '--output': 'output'};
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === '--help' || argv[index] === '-h') return {help: true};
    const key = names[argv[index]];
    if (!key || seen.has(key)) throw Error('Argumentos inválidos. Usá --help.');
    seen.add(key);
    const value = argv[++index];
    if (!value || value.startsWith('--') || value.includes('\0')) throw Error('Falta un valor válido. Usá --help.');
    opts[key] = value;
  }
  if (!opts.host || opts.host.length > 253 || !/^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(opts.host)) {
    throw Error('Host inválido; usá un nombre DNS o una dirección IPv4 sin espacios ni opciones.');
  }
  if (!/^\d+$/.test(String(opts.port)) || Number(opts.port) < 1 || Number(opts.port) > 65535) throw Error('Puerto inválido.');
  opts.port = Number(opts.port);
  if (!opts.identity || !exists(opts.identity)) throw Error('La ruta de identidad debe ser un archivo existente.');
  return opts;
}

function buildSshArgs(opts) {
  return ['-i', opts.identity, '-p', String(opts.port),
    '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes',
    '-o', 'ConnectTimeout=8', '-o', 'KexAlgorithms=+diffie-hellman-group14-sha1,diffie-hellman-group1-sha1',
    '-o', 'HostKeyAlgorithms=+ssh-rsa', '-o', 'PubkeyAcceptedAlgorithms=+ssh-rsa',
    'root@' + opts.host, 'sh -s'];
}

// Fixed script: user-supplied host, port and key path never enter shell text.
function remoteScript() {
  return [
    "printf '__MP_AUDIT_ROOT__\\n'; id -u",
    "printf '__MP_AUDIT_APPS__\\n'; luna-send -n 1 luna://com.webos.applicationManager/listApps '{}' </dev/null",
    "printf '\\n__MP_AUDIT_GENERAL__\\n'; luna-send -n 1 luna://com.webos.settingsservice/getSystemSettings '" + JSON.stringify({category: 'general', keys: GENERAL}) + "' </dev/null",
    "printf '\\n__MP_AUDIT_OPTION__\\n'; luna-send -n 1 luna://com.webos.settingsservice/getSystemSettings '" + JSON.stringify({category: 'option', keys: OPTION}) + "' </dev/null",
    "printf '\\n__MP_AUDIT_MEMORY__\\n'; cat /proc/meminfo",
    "printf '__MP_AUDIT_DISK__\\n'; df -k /media/developer",
    "printf '__MP_AUDIT_PAGE__\\n'; getconf PAGESIZE 2>/dev/null || printf '4096\\n'",
    "printf '__MP_AUDIT_CPU1__\\n'; cat /proc/stat",
    "printf '__MP_AUDIT_PROC1__\\n'; cat /proc/[0-9]*/stat 2>/dev/null",
    'sleep 2',
    "printf '__MP_AUDIT_CPU2__\\n'; cat /proc/stat",
    "printf '__MP_AUDIT_PROC2__\\n'; cat /proc/[0-9]*/stat 2>/dev/null",
    "printf '__MP_AUDIT_END__\\n'"
  ].join('\n') + '\n';
}

function parseSections(raw) {
  const output = {};
  const marker = /^__MP_AUDIT_([A-Z0-9]+)__\r?$/gm;
  let current, match;
  const names = [];
  while ((match = marker.exec(raw))) {
    if (!current && raw.slice(0, match.index).trim()) throw Error('Respuesta incompleta de la TV.');
    if (current) output[current.name] = raw.slice(current.start, match.index).trim();
    current = {name: match[1], start: marker.lastIndex};
    names.push(current.name);
  }
  if (current) output[current.name] = raw.slice(current.start).trim();
  if (names.join(',') !== SECTIONS.join(',') || output.END !== '') throw Error('Respuesta incompleta de la TV.');
  for (const name of SECTIONS) if (name !== 'END' && !output[name]) throw Error('Respuesta incompleta de la TV.');
  if (output.ROOT !== '0') throw Error('Esta auditoría requiere el acceso root previamente autorizado.');
  return output;
}

function lunaJson(raw, expected) {
  let value;
  try { value = JSON.parse(raw); } catch { throw Error('Respuesta Luna inválida.'); }
  if (!value || value.returnValue !== true || !value[expected] ||
      expected === 'apps' && !Array.isArray(value.apps) ||
      expected === 'settings' && (typeof value.settings !== 'object' || Array.isArray(value.settings))) throw Error('Lectura Luna no confirmada.');
  if (expected === 'apps') {
    const ids = new Set();
    for (const app of value.apps) {
      if (!app || typeof app !== 'object' || Array.isArray(app) || typeof app.id !== 'string' ||
          !/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(app.id) || ids.has(app.id)) throw Error('Lectura Luna de inventario inválida.');
      ids.add(app.id);
    }
  }
  return value[expected];
}

function safeVersion(app) {
  return app && typeof app.version === 'string' && /^\d+(?:\.\d+){1,3}$/.test(app.version) ? app.version : null;
}

function preferences(settings, keys) {
  return Object.fromEntries(keys.map(key => {
    const raw = key === 'personalRecommend' && settings[key] && typeof settings[key] === 'object' ? settings[key].value : settings[key];
    return [key, raw === 'on' || raw === 'off' ? raw : 'unknown'];
  }));
}

function parseCpu(raw) {
  const line = raw.split('\n').find(value => /^cpu\s/.test(value));
  const values = line && line.trim().split(/\s+/).slice(1, 9).map(Number);
  if (!values || values.length !== 8 || values.some(value => !Number.isSafeInteger(value) || value < 0)) throw Error('Muestra CPU inválida.');
  return {total: values.reduce((a, b) => a + b, 0), idle: values[3] + values[4],
    counters: values,
    cores: raw.split('\n').filter(value => /^cpu\d+\s/.test(value)).length};
}

function parseProcesses(raw) {
  const values = new Map();
  for (const line of raw.split('\n')) {
    const match = /^(\d+) \((.*)\) (.*)$/.exec(line);
    if (!match) continue;
    const fields = match[3].trim().split(/\s+/);
    const ticks = Number(fields[11]) + Number(fields[12]);
    const rss = Number(fields[21]);
    const started = fields[19];
    if (!Number.isFinite(ticks) || ticks < 0 || !Number.isFinite(rss) || rss < 0 || !/^\d+$/.test(started || '')) continue;
    values.set(match[1], {name: /^[A-Za-z0-9_.-]{1,32}$/.test(match[2]) ? match[2] : '(otro)', ticks, rss, started});
  }
  return values;
}

function parseTranscript(raw) {
  const section = parseSections(raw);
  const apps = lunaJson(section.APPS, 'apps');
  const general = lunaJson(section.GENERAL, 'settings');
  const option = lunaJson(section.OPTION, 'settings');
  const memory = key => {
    const match = new RegExp('^' + key + ':\\s+(\\d+) kB$', 'm').exec(section.MEMORY);
    return match ? Number(match[1]) : null;
  };
  const diskLine = section.DISK.trim().split('\n').pop().trim();
  const disk = /(?:^|\s)(\d+)\s+(\d+)\s+(\d+)\s+\d+%\s+\S+$/.exec(diskLine);
  const first = parseCpu(section.CPU1), second = parseCpu(section.CPU2);
  const delta = second.total - first.total;
  const idleDelta = second.idle - first.idle;
  if (delta <= 0 || idleDelta < 0 || idleDelta > delta || first.cores < 1 || first.cores !== second.cores ||
      second.counters.some((value, index) => value < first.counters[index])) throw Error('No se pudo comparar la muestra CPU.');
  const before = parseProcesses(section.PROC1), after = parseProcesses(section.PROC2);
  const pageSize = /^\d+$/.test(section.PAGE || '') ? Number(section.PAGE) : 4096;
  const top = [];
  for (const [pid, value] of after) {
    const previous = before.get(pid);
    if (!previous || previous.started !== value.started || value.ticks < previous.ticks) continue;
    top.push({pid: Number(pid), name: value.name,
      percentOfMachine: Math.round((value.ticks - previous.ticks) / delta * 1000) / 10,
      rssKiB: Math.round(value.rss * pageSize / 1024)});
  }
  top.sort((a, b) => b.percentOfMachine - a.percentOfMachine || b.rssKiB - a.rssKiB);
  const hbc = apps.find(app => app.id === 'org.webosbrew.hbchannel');
  const launcher = apps.find(app => app.id === 'com.frxn.mipantalla');
  const defaults = general.defaultApps;
  const home = defaults && typeof defaults === 'object' && !Array.isArray(defaults) && defaults.home;
  const homeIsLauncher = typeof home === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(home) ? home === 'com.frxn.mipantalla' : null;
  return {at: new Date().toISOString(), readOnly: true,
    apps: {total: apps.length, system: apps.filter(app => app.systemApp === true).length, removable: apps.filter(app => app.removable === true).length,
      removedLgAbsent: ['webos.day', 'epoxyaisports', 'lgchannels.home'].every(id => !apps.some(app => app.id === id))},
    homebrew: {present: Boolean(hbc), version: safeVersion(hbc)},
    launcher: {id: 'com.frxn.mipantalla', present: Boolean(launcher), version: safeVersion(launcher), homeIsLauncher},
    preferences: {general: preferences(general, GENERAL.filter(key => key !== 'defaultApps')), option: preferences(option, OPTION)},
    memory: {totalKiB: memory('MemTotal'), availableKiB: memory('MemAvailable'), freeKiB: memory('MemFree')},
    disk: disk ? {totalKiB: Number(disk[1]), usedKiB: Number(disk[2]), availableKiB: Number(disk[3])} : null,
    cpu: {pauseSeconds: 2, interval: 'approximate; includes process reads', cores: second.cores, busyPercent: Math.round((1 - (second.idle - first.idle) / delta) * 1000) / 10,
      rssPageSizeBytes: pageSize, top: top.slice(0, 10)}};
}

function collect(opts, execute = cp.spawnSync) {
  const result = execute('ssh', buildSshArgs(opts), {input: remoteScript(), encoding: 'utf8',
    timeout: 25000, maxBuffer: 4 * 1024 * 1024, windowsHide: true, shell: false});
  if (result.error || result.status !== 0 || typeof result.stdout !== 'string') {
    throw Error('No se pudo completar la lectura SSH. Revisá conectividad, clave y known_hosts con SSH normal.');
  }
  return parseTranscript(result.stdout);
}

function main() {
  try {
    if (Number(process.versions.node.split('.')[0]) < 18) throw Error('Requiere Node 18 o posterior.');
    const opts = parseArgs(process.argv.slice(2));
    if (opts.help) { console.log(HELP); return; }
    const report = JSON.stringify(collect(opts), null, 2) + '\n';
    if (opts.output) {
      try { fs.writeFileSync(opts.output, report, {mode: 0o600, flag: 'wx'}); }
      catch { throw Error('No se pudo crear el informe privado; elegí una ruta nueva y una carpeta con permisos adecuados.'); }
    }
    process.stdout.write(report);
  } catch (error) {
    const safe = error && /^(Argumentos|Falta un|Host inválido|Puerto inválido|La ruta|Esta auditoría|Respuesta|Lectura Luna|Muestra CPU|No se pudo|Requiere Node)/.test(error.message) ? error.message : 'No se pudo completar la auditoría.';
    console.error(safe);
    process.exitCode = 1;
  }
}

if (require.main === module) main();
module.exports = {parseArgs, buildSshArgs, remoteScript, parseTranscript, collect};
