'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('main listing renders old and distant launches and accepts an empty selection', async t => {
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

  await t.test('special event shows its whole description on the home card and disappears on refresh', async () => {
    const app = { innerHTML: '' };
    const event = {
      title: 'Star Party',
      subtitle: 'A night under the stars',
      location: 'Resort lawn',
      event_datetime: '2026-07-05T00:30:00Z',
      description: 'Bring a blanket.\n\nMeet at the <lawn>.',
      has_image: true,
    };
    let published = event;
    const context = vm.createContext({
      document: {
        querySelector: () => ({ getAttribute: () => 'https://backend.example' }),
        getElementById: () => app,
        addEventListener() {},
        createElement: () => ({
          set textContent(value) {
            this.innerHTML = value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
          },
        }),
      },
      window: { addEventListener() {} },
      localStorage: { setItem() {} },
      fetch: async url => ({
        ok: true,
        json: async () => url.endsWith('/api/special-event') ? published : [],
      }),
      console,
    });
    vm.runInContext(fs.readFileSync(require.resolve('../../go4launch/js/app.js'), 'utf8'), context);
    vm.runInContext(`
      buildTeasers = () => '';
      startCountdowns = () => {};
      handleRoute = renderMainPage;
    `, context);

    await vm.runInContext('refreshLaunchData()', context);
    assert.match(app.innerHTML, /launch-card special-event-card/);
    assert.match(app.innerHTML, /Star Party/);
    assert.match(app.innerHTML, /A night under the stars/);
    assert.match(app.innerHTML, /Resort lawn/);
    assert.match(app.innerHTML, /July 4, 2026 - 08:30 PM EDT/);
    assert.match(app.innerHTML, /Bring a blanket\.\n\nMeet at the &lt;lawn&gt;\./);
    assert.match(app.innerHTML, /src="https:\/\/backend\.example\/api\/special-event\/image"/);
    assert.doesNotMatch(app.innerHTML, /MORE INFO|countdown-row|I Saw This/);
    assert.doesNotMatch(app.innerHTML, /No launches are currently displayed/);

    published = null;
    await vm.runInContext('refreshLaunchData()', context);
    assert.doesNotMatch(app.innerHTML, /Star Party/);
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
