/* ========================================
   ROCKET TALK — CMS DATA LOADER
   ======================================== */

const CMS = (() => {

  let launchData = {};
  let chrisSaysData = {};

  async function loadAll() {
    await Promise.all([
      loadLaunches(),
      loadChrisSays()
    ]);
  }

  async function loadLaunches() {
    try {
      const resp = await fetch('cms/launches.json?v=' + Date.now());
      const data = await resp.json();
      launchData = data.launches || {};
      console.log('[CMS] Loaded launch data for', Object.keys(launchData).length, 'launches');
    } catch (err) {
      console.error('[CMS] Failed to load launches.json:', err);
      launchData = {};
    }
  }

  async function loadChrisSays() {
    try {
      const resp = await fetch('cms/chris-says.json?v=' + Date.now());
      const data = await resp.json();
      chrisSaysData = data.entries || {};
      console.log('[CMS] Loaded Chris Says for', Object.keys(chrisSaysData).length, 'launches');
    } catch (err) {
      console.error('[CMS] Failed to load chris-says.json:', err);
      chrisSaysData = {};
    }
  }

  function getLaunch(uuid) {
    return launchData[uuid] || null;
  }

  function getChrisSays(uuid) {
    return chrisSaysData[uuid] || [];
  }

  return { loadAll, getLaunch, getChrisSays };

})();
