'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup(responses) {
  const elements = new Map();
  const requests = [];
  function element() {
    return {
      value: '', textContent: '', children: [], handlers: {}, style: {},
      classList: { add() {}, remove() {} },
      set innerHTML(value) { this._html = value; this.children = []; this.value = ''; },
      get innerHTML() { return this._html || ''; },
      get selectedOptions() {
        return this.children.flatMap(group => group.children).filter(option => option.value === this.value);
      },
      appendChild(child) { this.children.push(child); },
      addEventListener(event, handler) { this.handlers[event] = handler; },
    };
  }
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element());
      return elements.get(id);
    },
    createElement: element,
    querySelector: () => ({ content: 'https://backend.example' }),
    querySelectorAll: () => [],
  };
  const html = fs.readFileSync(path.join(__dirname, '../admin.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  vm.runInNewContext(script, {
    document,
    window: { location: { href: 'https://ccbractivix.github.io/RGP/channel-web/admin.html' } },
    localStorage: { getItem: () => '', setItem() {}, removeItem() {} },
    URLSearchParams,
    setTimeout() {},
    console: { error() {} },
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (url.startsWith('https://api.github.com/')) {
        const folder = url.split('/contents/')[1];
        const response = responses[folder];
        if (response instanceof Error) throw response;
        return response || { ok: true, json: async () => [] };
      }
      return { ok: true, json: async () => ({ channels: [], slides: [] }) };
    },
  });
  return { elements, requests };
}

const result = data => ({ ok: true, json: async () => data });
const flush = () => new Promise(resolve => setImmediate(resolve));

test('image picker groups folders and registers the selected encoded image URL', async () => {
  const { elements, requests } = setup({
    'static/images': result([{ type: 'file', name: 'same #.jpg' }]),
    'theater-web/static': result([{ type: 'file', name: 'same #.jpg' }, { type: 'file', name: 'notes.txt' }]),
    Activities_Images: result([{ type: 'file', name: 'Pool & Games.png' }, { type: 'dir', name: 'ignored.png' }]),
  });
  elements.get('new-image-slide-btn').handlers.click();
  await flush();
  const select = elements.get('img-slide-select');
  assert.deepEqual(select.children.map(group => group.label), ['/static/images', '/theater-web/static', '/Activities_Images']);
  assert.deepEqual(select.children.map(group => group.children.length), [1, 1, 1]);
  assert.notEqual(select.children[0].children[0].value, select.children[1].children[0].value);

  select.value = select.children[2].children[0].value;
  select.handlers.change();
  assert.equal(elements.get('img-slide-label').value, 'Pool & Games');
  await elements.get('img-slide-save-btn').handlers.click();
  const post = requests.find(request => request.url.endsWith('/admin/slides') && request.options.method === 'POST');
  const slide = JSON.parse(post.options.body);
  assert.equal(new URL(slide.url).searchParams.get('image'), 'https://ccbractivix.github.io/RGP/Activities_Images/Pool%20%26%20Games.png');
  assert.equal(slide.label, 'Pool & Games');
});

test('a failed folder is reported without hiding other images and reopening retries', async () => {
  const responses = {
    'static/images': result([{ type: 'file', name: 'shared.jpg' }]),
    'theater-web/static': { ok: false, status: 403 },
    Activities_Images: result([]),
  };
  const { elements, requests } = setup(responses);
  elements.get('new-image-slide-btn').handlers.click();
  await flush();
  assert.equal(elements.get('img-slide-select').children[0].label, '/static/images');
  assert.match(elements.get('img-slide-status').textContent, /\/theater-web\/static/);

  responses['theater-web/static'] = result([{ type: 'file', name: 'movie.jpg' }]);
  elements.get('new-image-slide-btn').handlers.click();
  await flush();
  assert.equal(elements.get('img-slide-status').textContent, '');
  assert.equal(elements.get('img-slide-select').children[1].label, '/theater-web/static');
  elements.get('img-slide-select').value = elements.get('img-slide-select').children[1].children[0].value;
  elements.get('img-slide-url').value = 'https://example.com/override.jpg';
  elements.get('img-slide-label').value = 'Override';
  await elements.get('img-slide-save-btn').handlers.click();
  const post = requests.find(request => request.url.endsWith('/admin/slides') && request.options.method === 'POST');
  assert.equal(new URL(JSON.parse(post.options.body).url).searchParams.get('image'), 'https://example.com/override.jpg');
});
