const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const navigation = source.slice(source.indexOf('  // ---------- Control remoto'), source.indexOf('  function updateClock'));

function harness(onTV, editing = false) {
  const controls = [];
  const events = {};
  const document = {activeElement: null, addEventListener(name, fn) { events[name] = fn; }};
  function query(selector, group) {
    return controls.filter((button) => (!group || button.group === group) && selector.split(',').some((part) => {
      if (button.disabled) return false;
      if (part.includes('.dock') && button.group !== 'dock') return false;
      if (part.includes('.top-actions') && button.group !== 'top') return false;
      return true;
    }));
  }
  document.querySelectorAll = (selector) => query(selector);
  const panel = {querySelectorAll: (selector) => query(selector, 'manager')};
  function button(name, group, x, y, hidden = false) {
    const result = {name, group, hidden, disabled: false, scrolls: 0, visibilityReads: 0,
      classList: {contains: (name) => name === 'tile' && group === 'dock'},
      getClientRects() { this.visibilityReads++; return this.hidden ? [] : [1]; },
      geometryReads: 0,
      getBoundingClientRect() { this.geometryReads++; return {left: x, top: y, width: 40, height: 40}; },
      focus() { document.activeElement = this; }, scrollIntoView() { this.scrolls++; }};
    controls.push(result); return result;
  }
  const one = button('YouTube', 'dock', 0, 100);
  const two = button('Spotify', 'dock', 100, 100);
  const edit = button('Personalizar', 'top', 100, 0);
  const hidden = button('Control oculto', 'hidden-panel', 50, 100, true);
  const first = button('Visible', 'manager', 0, 0);
  const second = button('Mover', 'manager', 100, 0);
  vm.runInNewContext(navigation, {document, panel, editing, onTV, window: {}, setEditing() {}, clean: false, setClean() {}, noteActivity() {}});
  function press(key) { events.keydown({key, preventDefault() {}}); }
  return {document, one, two, edit, hidden, first, second, press};
}

test('TV dock arrows focus the next icon without requesting a post-focus scroll', () => {
  const h = harness(true); h.one.focus(); h.press('ArrowRight');
  assert.equal(h.document.activeElement, h.two);
  assert.equal(h.two.scrolls, 0);
});

test('horizontal TV dock navigation never forces layout, skips disabled icons and stops at the edges', () => {
  const h = harness(true); h.one.focus(); h.press('ArrowRight');
  assert.equal(h.document.activeElement, h.two);
  h.press('ArrowRight'); assert.equal(h.document.activeElement, h.two);
  h.press('ArrowLeft'); assert.equal(h.document.activeElement, h.one);
  h.two.disabled = true; h.press('ArrowRight'); assert.equal(h.document.activeElement, h.one);
  assert.equal(h.one.visibilityReads + h.two.visibilityReads + h.one.geometryReads + h.two.geometryReads, 0);
});

test('preview keeps scrolling when moving focus; the TV manager fits and never scrolls', () => {
  const preview = harness(false); preview.one.focus(); preview.press('ArrowRight');
  assert.equal(preview.document.activeElement, preview.two); assert.equal(preview.two.scrolls, 1);
  const manager = harness(true, true); manager.first.focus(); manager.press('ArrowRight');
  assert.equal(manager.document.activeElement, manager.second); assert.equal(manager.second.scrolls, 0);
});

test('main navigation skips panel controls and keeps Personalizar reachable', () => {
  const h = harness(true); h.one.focus(); h.press('ArrowUp');
  assert.equal(h.document.activeElement, h.edit);
  assert.equal(h.hidden.visibilityReads, 0, 'closed panels never enter the main navigation query');
  assert.equal(h.first.visibilityReads, 0, 'manager controls belong only to its own navigation scope');
});

test('focus aura does not write full-screen gradients on TV and stays available in preview', () => {
  const start = source.indexOf('  function setAura(');
  const end = source.indexOf('  // Al enfocar', start);
  function updates(onTV) {
    let changes = 0;
    const auras = Array.from({length: 2}, () => ({style: {set background(value) { changes++; }},
      classList: {toggle() { changes++; }}}));
    const context = {onTV, auras, activeAura: -1};
    vm.runInNewContext(source.slice(start, end), context);
    context.setAura('#ff0000'); return changes;
  }
  assert.equal(updates(true), 0);
  assert.ok(updates(false) > 0);
});

test('dock shifts only as much as needed to keep the focused tile fully visible', () => {
  const start = source.indexOf('  var dockShift');
  const end = source.indexOf('  function showFocus', start);
  const row = {id: 'apps-grid', style: {}, parentNode: {clientWidth: 1000}};
  const context = {window: {addEventListener() {}, getComputedStyle: () => ({fontSize: '10px'})},
    document: {documentElement: {}, querySelector: () => null}, current: null};
  vm.runInNewContext(source.slice(start, end), context);
  const tile = (index) => ({parentNode: row, offsetLeft: index * 100, offsetWidth: 90});
  const shift = () => Number(/translate3d\(-?(\d+)/.exec(row.style.transform || 'translate3d(0')[1]);
  context.revealTile(tile(5)); assert.equal(row.style.transform, undefined, 'visible tile: no movement');
  context.revealTile(tile(9)); assert.equal(shift(), 990 + 12 - 1000 + 0, 'right edge + padding');
  const at = shift();
  context.revealTile(tile(8)); assert.equal(shift(), at, 'tile already visible: no recentering');
  context.revealTile(tile(0)); assert.equal(row.style.transform, 'none', 'returns to the start');
});

test('in Solo fondo any key only brings the interface back, without moving focus or going Back', () => {
  const events = {};
  const calls = [];
  const document = { activeElement: null, addEventListener(name, fn) { events[name] = fn; }, querySelectorAll: () => [] };
  vm.runInNewContext(navigation, { document, panel: {}, editing: false, onTV: true, window: { webOS: { platformBack() { calls.push('back'); } } },
    setEditing() {}, clean: true, noteActivity() {}, setClean(value) { calls.push('clean:' + value); } });
  for (const key of ['ArrowRight', 'Enter', 'Escape']) {
    let prevented = false;
    events.keydown({ key, keyCode: key === 'Escape' ? 461 : 0, preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
  }
  assert.deepEqual(calls, ['clean:false', 'clean:false', 'clean:false']);
});

test('Solo fondo starts by itself after the idle time, only when nothing else is going on, and a single timer is reused', () => {
  const start = source.indexOf('  var IDLE_MS');
  const end = source.indexOf('  function openItem', start);
  let now = 1000;
  const timers = [];
  const toggles = [];
  const context = {
    Date: { now: () => now }, setTimeout(fn, ms) { const timer = { fn, ms }; timers.push(timer); return timer; },
    clearTimeout(timer) { const at = timers.indexOf(timer); if (at !== -1) timers.splice(at, 1); },
    document: { hidden: false, activeElement: null, body: { classList: { toggle(name, on) { toggles.push(on); } }, contains: () => false },
      querySelector: () => null, addEventListener() {} },
    editing: false, busy: false,
  };
  vm.runInNewContext(source.slice(start, end), context);
  assert.equal(timers.length, 1);
  const idle = timers[0].ms;
  assert.ok(idle >= 30000 && idle <= 60000, 'between 30 s and 1 min');
  now += idle - 5000; context.noteActivity();
  now += 5000;
  timers[0].fn();
  assert.deepEqual(toggles, [], 'activity postponed it');
  assert.equal(timers.length, 1, 'still a single timer');
  context.busy = true; now += 5 * idle; timers[0].fn();
  assert.deepEqual(toggles, [], 'not while launching an app');
  context.busy = false; context.editing = true; now += 5 * idle; timers[0].fn();
  assert.deepEqual(toggles, [], 'not while customizing');
  context.editing = false; now += 5 * idle; timers[0].fn();
  assert.deepEqual(toggles, [true], 'idle with nothing going on turns it on');
  assert.equal(context.clean, true);
});
