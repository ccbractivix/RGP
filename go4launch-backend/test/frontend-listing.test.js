'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('main listing renders old and distant launches and accepts an empty selection', async () => {
  const app = { innerHTML: '' };
  const storage = new Map([['go4launch_managed_v1', JSON.stringify({ data: [{ id: 'old-cache' }] })]]);
  const context = vm.createContext({
    document: {
      querySelector: () => ({ getAttribute: () => 'https://backend.example' }),
      getElementById: () => app,
      addEventListener() {},
    },
    window: { addEventListener() {} },
    localStorage: {
      getItem: key => storage.get(key),
      setItem: (key, value) => storage.set(key, value),
    },
    fetch: async () => ({ ok: true, json: async () => [] }),
    console,
  });
  vm.runInContext(fs.readFileSync(require.resolve('../../go4launch/js/app.js'), 'utf8'), context);
  vm.runInContext(`
    buildCard = launch => launch.id;
    buildTeasers = () => '';
    startCountdowns = () => {};
    allLaunches = [
      { id: 'past', net: '2020-01-01', status: { id: 3 } },
      { id: 'future', net: '2040-01-01', status: { id: 1 } }
    ];
    renderMainPage();
  `, context);
  assert.match(app.innerHTML, /pastfuture/);
  const result = await vm.runInContext('fetchAndCache()', context);
  assert.equal(result.length, 0);
  assert.deepEqual(JSON.parse(storage.get('go4launch_managed_v1')).data, []);
});
