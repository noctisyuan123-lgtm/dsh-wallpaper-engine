import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the shipped module and its registered root hook component, rather
// than exporting a duplicate implementation solely for the test.
const elements = new Map();
const imageLoads = [];
function element(tag) {
  const classes = new Set();
  return {
    tagName: tag, children: [], dataset: {}, attributes: {},
    classList: { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x) },
    style: { props: {}, setProperty(k, v) { this.props[k] = v; }, removeProperty(k) { delete this.props[k]; } },
    getBoundingClientRect() { return { left: 280, width: 1280, height: 900 }; },
    getContext() {
      let image;
      return { drawImage(img) { image = img; }, getImageData() {
        const value = image.src === '/dark' ? 12 : 245;
        return { data: Uint8ClampedArray.from({ length: 32 * 32 * 4 }, (_, i) => i % 4 === 3 ? 255 : value) };
      } };
    },
    appendChild(child) { if (child.parent) child.parent.children = child.parent.children.filter(x => x !== child); child.parent = child.parentElement = this; this.children.push(child); if (child.id) elements.set(child.id, child); },
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(x => x !== this); if (this.id) elements.delete(this.id); },
    hasAttribute(k) { return k in this.attributes; }, setAttribute(k, v) { this.attributes[k] = v; }, removeAttribute(k) { delete this.attributes[k]; },
    querySelector() { return null; },
  };
}
const body = element('body'), sidebar = element('aside'), header = element('header');
let center = element('div'), chat = element('section');
body.appendChild(sidebar); body.appendChild(center); center.appendChild(header); center.appendChild(chat);
let effects = [], cleanups = [], factory, bridge, observer;
const React = {
  useState: x => [x, () => {}], useRef: x => ({ current: x }),
  useEffect: fn => effects.push(fn), createElement: () => null,
};
const storage = new Map([['dsh-wallpaper-engine:selection', JSON.stringify({ id: 'global', rotationSeeded: true })]]);
const inventory = {
  projectOnly: process.argv.includes('--project-only'),
  projectScrim: 0.08,
  wallpapers: [{ id: 'global', type: 'image', playable: true, media: '/global', contentrating: 'Everyone' }],
  projectWallpapers: [
    { cwd: '/persona/shuangshuang', media: '/shuang', readability: true },
    { cwd: '/persona/shuangshuang/nested', media: '/nested' },
    { cwd: '/persona/dark', media: '/dark' },
  ],
};
const context = vm.createContext({
  window: { __ModuleLoader__: { load: x => { factory = x.factory; } }, setTimeout, clearTimeout,
    getComputedStyle: () => ({ getPropertyValue: () => '#f8fafc' }) },
  document: { body, head: { appendChild() {} }, createElement: element, getElementById: x => elements.get(x),
    querySelector: selector => selector.includes('_sidebarCol') ? sidebar : selector.includes('data-conversation-content') ? chat : selector.includes('_centerCol') ? center : null },
  Image: class {
    set src(value) {
      this._src = value; this.naturalWidth = this.naturalHeight = 1024;
      const callback = this.onload; imageLoads.push(() => callback?.());
    }
    get src() { return this._src; }
  },
  localStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v) },
  MutationObserver: class { constructor(fn) { observer = fn; } observe() {} disconnect() { observer = null; } },
  fetch: async () => ({ ok: true, json: async () => inventory }),
});
vm.runInContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'), context);
const plugin = factory(id => id === 'react' ? React : {});
plugin.apply({ effect: fn => fn(), slots: { inject: (_, cb) => cb(), register: (opts, render) => {
  if (opts.name === 'shell.overlay') bridge = render;
} } });
await new Promise(resolve => setImmediate(resolve));
assert.equal(typeof bridge, 'function');
const globalSaved = storage.get('dsh-wallpaper-engine:selection');
const snapshot = node => JSON.stringify(node, (key, value) => ['parent','parentElement'].includes(key) ? undefined : value);
const sidebarSaved = snapshot(sidebar);
const headerSaved = snapshot(header);
function render(cwd, panel = null, desktop = false, loadImage = true) {
  cleanups.forEach(fn => fn()); effects = []; cleanups = [];
  bridge({
    useSessions: select => select(desktop
      ? { byId: { other: { cwd: '/persona/lisheng', retainedBy: { mainView: 0 } }, session: { cwd, retainedBy: { mainView: 1 } } } }
      : { current: 'session', byId: { session: { cwd } } }),
    usePanelInfo: select => select({ activePanelId: panel }),
  });
  cleanups = effects.map(fn => fn()).filter(fn => typeof fn === 'function');
  if (loadImage) imageLoads.splice(0).forEach(fn => fn());
}
const wallpaper = () => center.children.find(x => x.className === 'we-project-chat__wallpaper');
const backdrop = () => center.children.find(x => x.className === 'we-project-chat__backdrop');
render('/persona/shuangshuang');
assert.match(wallpaper().style.backgroundImage, /\/shuang/);
assert.equal(body.attributes['data-we-persona'], 'on');
assert.equal(body.style.props['--we-persona-left'], '280px');
assert.equal(center.classList.contains('we-project-chat--readable'), true);
assert.equal(backdrop(), undefined);
assert.match(wallpaper().style.backgroundImage, /rgba\(0,0,0,0\.08\)/);
assert.match(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'), /background-size: 100% 100%, cover;/);
assert.equal(center.attributes['data-we-project-tone'], 'dark-ink');
assert.equal(center.style.props['--we-project-label-primary'], '#101827');
render('/persona/dark');
assert.equal(center.classList.contains('we-project-chat--readable'), false);
assert.equal(center.attributes['data-we-project-tone'], 'light-ink');
assert.equal(center.style.props['--we-project-label-primary'], '#f8fafc');
render('/persona/shuangshuang', null, true);
assert.match(wallpaper().style.backgroundImage, /\/shuang/);
assert.equal(center.classList.contains('we-project-chat'), true);
assert.equal(wallpaper().attributes['aria-hidden'], 'true');
render('/persona/shuangshuang/notes'); assert.match(wallpaper().style.backgroundImage, /\/shuang/);
render('/persona/shuangshuang/nested/file'); assert.match(wallpaper().style.backgroundImage, /\/nested/);
render('/persona/shuangshuang-other'); assert.equal(wallpaper(), undefined);
assert.equal(backdrop(), undefined);
assert.equal(center.attributes['data-we-project-tone'], undefined);
assert.equal(center.style.props['--we-project-label-primary'], undefined);
render('/persona/lisheng'); assert.equal(wallpaper(), undefined); assert.equal(body.attributes['data-we-persona'], undefined);
render(undefined); assert.equal(wallpaper(), undefined);
render('/persona/shuangshuang', 'plugins'); assert.equal(wallpaper(), undefined);
// A late image decode from a closed Session cannot apply colors to its successor.
render('/persona/shuangshuang', null, false, false);
render('/persona/lisheng');
assert.equal(center.attributes['data-we-project-tone'], undefined);
render('/persona/shuangshuang');
const oldCenter = center;
center = element('div'); center.appendChild(header); center.appendChild(chat); observer();
assert.equal(oldCenter.classList.contains('we-project-chat'), false);
assert.equal(oldCenter.classList.contains('we-project-chat--readable'), false);
assert.match(wallpaper().style.backgroundImage, /\/shuang/);
cleanups.forEach(fn => fn());
assert.equal(wallpaper(), undefined);
assert.equal(backdrop(), undefined);
assert.equal(center.classList.contains('we-project-chat'), false);
assert.equal(center.classList.contains('we-project-chat--readable'), false);
assert.equal(storage.get('dsh-wallpaper-engine:selection'), globalSaved);
assert.equal(snapshot(sidebar), sidebarSaved);
assert.equal(snapshot(header), headerSaved);
if (inventory.projectOnly) {
  assert.equal(elements.get('dsh-wallpaper-engine-layer'), undefined);
  assert.equal(body.attributes['data-we-wallpaper'], undefined);
  assert.equal(body.attributes['data-we-glass-window'], undefined);
} else { assert.equal(elements.get('dsh-wallpaper-engine-layer').children.length, 1); assert.equal(elements.get('dsh-wallpaper-engine-layer').parent, body); }
console.log('PASS: bright/dark adaptive text, late-image cleanup, cwd/panel switching, remount, teardown; global selection/layer and sidebar unchanged, persona image includes header, persona sidebar mask cleans up on project switch; global code rain preserved elsewhere.');
