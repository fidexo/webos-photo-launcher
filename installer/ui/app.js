(function (root) {
  'use strict';
  var LABELS = { ready: 'Preparado', planned: 'Plan preparado', pending: 'Pendiente', applied: 'Aplicado', verified: 'Verificado',
    'recovery-pending': 'Recuperación pendiente', complete: 'Completado', partial: 'Parcial', blocked: 'Bloqueado', failed: 'Error', skipped: 'Omitido' };
  function safeText(value, limit) { return typeof value === 'string' ? value.slice(0, limit || 300) : ''; }
  function privateHost(value) {
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return false;
    var parts = value.split('.').map(Number);
    return parts.every(function (part) { return part >= 0 && part <= 255; }) &&
      (parts[0] === 10 || parts[0] === 192 && parts[1] === 168 || parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31);
  }
  function createApp(options) {
    var document = options.document, fetch = options.fetch;
    var schedule = options.setTimeout || setTimeout, cancel = options.clearTimeout || clearTimeout;
    var timeoutMs = options.timeoutMs || 125000;
    var state = { busy: false, revision: 0, plan: null, backupId: null, backupTarget: null, pendingTarget: null, uncertain: false };
    function node(id) { return document.getElementById(id); }
    function text(id, value) { node(id).textContent = value; }
    function values() {
      var removeApps = Array.prototype.slice.call(document.querySelectorAll('[name="removeApps"]')).filter(function (input) { return input.checked; }).map(function (input) { return input.value; });
      return { host: node('host').value.trim(), identity: node('identity').value.trim(), options: {
        install: node('install').checked, home: node('home').checked, privacy: node('privacy').checked, root: false, removeApps: removeApps } };
    }
    function snapshot() { return JSON.stringify(values()); }
    function target() { var input = values(); return JSON.stringify([input.host, input.identity]); }
    function validPlan() {
      if (state.uncertain || !state.plan || state.plan.snapshot !== snapshot()) return false;
      var expiry = state.plan.expiresAt;
      return !expiry || (typeof expiry === 'number' ? expiry : Date.parse(expiry)) > Date.now();
    }
    function buttons() {
      node('connect').disabled = state.busy; node('prepare').disabled = state.busy || state.uncertain;
      node('connect').textContent = state.uncertain ? 'Revisar estado' : 'Comprobar conexión';
      node('apply').disabled = state.busy || !validPlan(); node('restore').disabled = state.busy || !state.backupId || state.backupTarget !== target();
      Array.prototype.slice.call(document.querySelectorAll('input')).forEach(function (input) { input.disabled = state.busy; });
      node('setup-form').setAttribute('aria-busy', state.busy ? 'true' : 'false');
    }
    function invalidate() {
      state.revision++; state.plan = null;
      text('plan-status', state.uncertain ? 'Hay una operación sin confirmar. Volvé al destino original y usá Revisar estado.' : 'Prepará un nuevo plan para revisar esta configuración.');
      text('device-status', 'Compatibilidad y acceso por consultar.');
      mediaStatus('capture-status'); mediaStatus('lights-status');
      buttons();
    }
    function validate() {
      var input = values();
      if (!privateHost(input.host)) { text('feedback', 'Ingresá la dirección IPv4 privada de la TV en tu red local.'); return false; }
      if (!input.identity || input.identity.length > 1024 || /[\r\n\u0000]/.test(input.identity)) {
        text('feedback', 'Ingresá la ruta local del archivo de identidad SSH.'); return false;
      }
      return true;
    }
    function mediaStatus(id, detail) {
      var verified = detail && detail.verified === true;
      text(id, verified && detail.active === true ? 'Activo · verificado' : verified && detail.active === false ? 'Verificado · inactivo' : verified ? 'Verificado · estado sin confirmar' : 'Sin verificar');
    }
    function render(result) {
      text('result-summary', safeText(result.summary) || 'Consulta completada. Revisá el detalle de cada paso.');
      text('result-status', LABELS[result.status] || 'Estado sin confirmar');
      node('result-status').setAttribute('data-state', LABELS[result.status] ? result.status : 'unknown');
      var steps = node('steps'); steps.textContent = '';
      (Array.isArray(result.steps) ? result.steps.slice(0, 20) : []).forEach(function (step) {
        if (!step || typeof step !== 'object') return;
        var row = document.createElement('li'), label = document.createElement('span'), badge = document.createElement('span');
        label.textContent = safeText(step.label, 180) || 'Paso sin descripción';
        badge.textContent = LABELS[step.status] || 'Sin confirmar'; badge.setAttribute('class', 'step-state');
        row.appendChild(label); row.appendChild(badge); steps.appendChild(row);
      });
      var device = result.device;
      if (device && typeof device === 'object') {
        var compatibility = device.verified !== true ? 'Identidad sin verificar' : device.supported === true ? 'Modelo y firmware compatibles' : device.supported === false ? 'Equipo no compatible' : 'Compatibilidad sin confirmar';
        var privilege = device.privilege === 'root' ? 'Acceso root confirmado' : device.privilege === 'non-root' ? 'Sin acceso root' : 'Acceso root sin confirmar';
        text('device-status', compatibility + ' · ' + privilege);
      }
      mediaStatus('capture-status', result.capture); mediaStatus('lights-status', result.lights);
    }
    function request(action, payload, onResult) {
      if (state.busy) return Promise.resolve(false);
      var meta = document.querySelector('meta[name="setup-token"]'), token = meta && meta.getAttribute('content');
      if (!token) { text('feedback', 'Abrí esta página desde el asistente local para iniciar una sesión.'); return Promise.resolve(false); }
      var revision = state.revision, timer, finished = false;
      state.busy = true; buttons(); text('feedback', action === 'apply' || action === 'restore' ? 'Procesando. Esperá la confirmación del asistente local.' : 'Consultando al asistente local…');
      text('result-status', LABELS.pending); node('result-status').setAttribute('data-state', 'pending');
      mediaStatus('capture-status'); mediaStatus('lights-status');
      return new Promise(function (resolve) {
        function finish(result, message) {
          if (finished) return;
          finished = true; cancel(timer); state.busy = false;
          if ((action === 'status' || action === 'plan') && revision !== state.revision) {
            text('feedback', 'La configuración cambió. Repetí la consulta para revisar el estado actual.');
          } else if (message) {
            if (action === 'apply' || action === 'restore') {
              state.plan = null; state.uncertain = true;
              text('plan-status', 'La operación no está confirmada. Usá Revisar estado para recuperar su respaldo; no repitas la aplicación.');
            }
            text('result-status', 'Sin confirmar'); node('result-status').setAttribute('data-state', 'unknown');
            text('feedback', message);
          } else {
            render(result); onResult(result); text('feedback', 'Respuesta recibida.');
          }
          buttons(); resolve(!message);
        }
        timer = schedule(function () { finish(null, 'El asistente local no respondió a tiempo. El resultado de la operación no está confirmado.'); }, timeoutMs);
        var promise;
        try { promise = fetch('/api', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Setup-Token': token }, body: JSON.stringify({ action: action, payload: payload }) }); }
        catch (error) { finish(null, 'No se pudo contactar al asistente local.'); return; }
        Promise.resolve(promise).then(function (response) { if (!response.ok) throw new Error('http'); return response.json(); }).then(function (data) {
          if (!data || data.ok !== true || !data.result || typeof data.result !== 'object' || Array.isArray(data.result)) {
            finish(null, safeText(data && data.error && data.error.message) || 'El asistente local rechazó la operación.'); return;
          }
          finish(data.result);
        }, function () { finish(null, 'No se pudo contactar al asistente local. El resultado no está confirmado.'); });
      });
    }
    function connect() {
      if (state.busy || !validate()) return Promise.resolve(false);
      state.plan = null; buttons(); var input = values(), queriedTarget = target();
      return request('status', { host: input.host, identity: input.identity }, function (result) {
        var recovery = result.recovery;
        var confirmedRecovery = recovery && typeof recovery.pending === 'boolean' && ['prepared', 'unconfirmed', 'applied', 'restoring', 'restored', 'inflight'].indexOf(recovery.phase) !== -1;
        var matching = queriedTarget === target() && (queriedTarget === state.pendingTarget || state.pendingTarget === null && confirmedRecovery);
        if (matching) {
          if (state.pendingTarget === null) state.pendingTarget = queriedTarget;
          if (recovery && recovery.pending === true) {
            state.uncertain = true;
            if (!result.backupId) { state.backupId = null; state.backupTarget = null; }
          }
          if (typeof result.backupId === 'string' && result.backupId) { state.backupId = result.backupId; state.backupTarget = queriedTarget; }
          if (recovery && recovery.pending === false && (recovery.phase === 'applied' || recovery.phase === 'restored')) {
            state.uncertain = false;
            if (recovery.phase === 'restored') { state.backupId = null; state.backupTarget = null; state.pendingTarget = null; }
          }
        }
        text('plan-status', state.uncertain ? state.backupId && state.backupTarget === target() ? 'Respaldo recuperado. La operación sigue sin confirmar; podés restaurarlo.' : 'La operación sigue sin confirmar. Revisá el estado del destino original para recuperar su respaldo.' : matching && state.backupId ? 'Respaldo recuperado. Revisá el resultado o restaurá los cambios.' : 'Elegí los cambios y prepará un plan.');
      });
    }
    function prepare() {
      if (state.busy || !validate()) return Promise.resolve(false);
      if (state.uncertain) { text('feedback', 'Revisá la operación sin confirmar antes de preparar nuevos cambios.'); return Promise.resolve(false); }
      state.plan = null; var bound = snapshot(), boundTarget = target();
      return request('plan', values(), function (result) {
        var blocked = result.status !== 'planned' && result.status !== 'ready' || result.steps !== undefined && !Array.isArray(result.steps) || (Array.isArray(result.steps) ? result.steps : []).some(function (step) { return !step || step.status === 'blocked' || step.status === 'failed'; });
        if (result.plan && typeof result.plan.id === 'string' && result.plan.id && !blocked) {
          state.plan = { id: result.plan.id, snapshot: bound, target: boundTarget, expiresAt: result.plan.expiresAt };
          text('plan-status', 'Plan preparado. Revisá los pasos antes de aplicar.');
        } else text('plan-status', 'Este plan no puede aplicarse. Revisá los pasos bloqueados.');
      });
    }
    function apply() {
      if (state.busy) return Promise.resolve(false);
      if (!validPlan()) { invalidate(); text('feedback', 'Prepará y revisá un plan nuevo antes de aplicar.'); return Promise.resolve(false); }
      var planId = state.plan.id; state.pendingTarget = state.plan.target; state.plan = null;
      state.backupId = null; state.backupTarget = null;
      return request('apply', { planId: planId }, function (result) {
        if (typeof result.backupId === 'string' && result.backupId) { state.backupId = result.backupId; state.backupTarget = state.pendingTarget; }
        state.uncertain = result.status === 'recovery-pending' || Array.isArray(result.codes) && result.codes.indexOf('APPLY_UNCONFIRMED') !== -1;
        text('plan-status', 'El plan fue enviado. El detalle indica qué se aplicó y qué se verificó.');
      });
    }
    function restore() {
      if (state.busy || !state.backupId || state.backupTarget !== target()) return Promise.resolve(false);
      return request('restore', { backupId: state.backupId }, function (result) {
        state.plan = null;
        if (result.status === 'verified' || result.status === 'complete') { state.backupId = null; state.backupTarget = null; state.pendingTarget = null; state.uncertain = false; }
        text('plan-status', result.status === 'verified' ? 'Restauración verificada.' : result.status === 'complete' ? 'Restauración completada.' : 'Revisá el resultado de la restauración.');
      });
    }
    function start() {
      node('setup-form').addEventListener('input', invalidate); node('setup-form').addEventListener('change', invalidate);
      node('setup-form').addEventListener('submit', function (event) { event.preventDefault(); connect(); });
      [['connect', connect], ['prepare', prepare], ['apply', apply], ['restore', restore]].forEach(function (entry) { node(entry[0]).addEventListener('click', entry[1]); });
      mediaStatus('capture-status'); mediaStatus('lights-status'); buttons();
    }
    return { start: start, connect: connect, prepare: prepare, apply: apply, restore: restore, invalidate: invalidate,
      getState: function () { return { busy: state.busy, planId: state.plan && state.plan.id, backupId: state.backupId, uncertain: state.uncertain }; } };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { createApp: createApp, privateHost: privateHost };
  else root.MiPantallaSetup = { createApp: createApp };
  if (root && root.document) root.document.addEventListener('DOMContentLoaded', function () {
    createApp({ document: root.document, fetch: root.fetch.bind(root) }).start();
  });
}(typeof window === 'undefined' ? null : window));
