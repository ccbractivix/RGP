/* ========================================
   ROCKET TALK — TEMPLATE ENGINE
   ======================================== */

const TemplateEngine = (() => {

  let templates = {};

  async function load() {
    try {
      const resp = await fetch('cms/templates.json?v=' + Date.now());
      const data = await resp.json();
      templates = data.templates || {};
      console.log('[Templates] Loaded', Object.keys(templates).length, 'templates');
    } catch (err) {
      console.error('[Templates] Failed to load:', err);
      templates = {};
    }
  }

  function render(templateId, vars) {
    const tpl = templates[templateId];
    if (!tpl) {
      console.warn('[Templates] Template not found:', templateId);
      return '<em>Template not available</em>';
    }

    let body = tpl.body;
    body = body.replace(/\{\{mission_name\}\}/g, vars.mission_name || '');
    body = body.replace(/\{\{launch_vehicle\}\}/g, vars.launch_vehicle || '');
    body = body.replace(/\{\{event_date\}\}/g, vars.event_date || '');
    body = body.replace(/\{\{event_time\}\}/g, vars.event_time || '');
    body = formatText(body);
    return body;
  }

  function formatText(text) {
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
    text = text.replace(/\n/g, '<br>');
    return text;
  }

  return { load, render, formatText };

})();
