(function (root) {
  'use strict';

  const clients = new Map();

  function createClient(base = location.origin) {
    const origin = new URL(base || location.origin, location.href).origin;
    if (clients.has(origin)) return clients.get(origin);
    const key = `resort-staff:${origin}`;
    let pending = null;
    let code = sessionStorage.getItem(key);

    function signIn() {
      if (code) return Promise.resolve(code);
      if (pending) return pending;
      pending = new Promise((resolve, reject) => {
        const dialog = document.createElement('dialog');
        dialog.className = 'resort-staff-login';
        dialog.setAttribute('aria-label', 'Staff sign-in');
        dialog.innerHTML = `
          <form>
            <h2>Staff sign-in</h2>
            <p>Use your shared staff access code.</p>
            <label>Access code<input type="password" autocomplete="off" maxlength="256" required></label>
            <p role="alert"></p>
            <button type="submit">Sign in</button>
            <button type="button" data-cancel>Cancel</button>
          </form>`;
        const form = dialog.querySelector('form');
        const input = dialog.querySelector('input');
        const error = dialog.querySelector('[role="alert"]');
        const submit = dialog.querySelector('[type="submit"]');
        let submitting = false;
        form.addEventListener('submit', async event => {
          event.preventDefault();
          if (submitting) return;
          submitting = true;
          submit.disabled = true;
          error.textContent = '';
          try {
            const response = await fetch(`${origin}/admin/verify`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ code: input.value.trim() }),
              signal: AbortSignal.timeout(15000),
            });
            if (!response.ok) throw new Error(`Sign-in failed (${response.status}). Please try again.`);
            const data = await response.json();
            if (!data.valid) throw new Error('Invalid staff code.');
            code = input.value.trim();
            sessionStorage.setItem(key, code);
            dialog.close();
            dialog.remove();
            resolve(code);
          } catch (failure) {
            error.textContent = failure.message;
          } finally {
            submitting = false;
            submit.disabled = false;
          }
        });
        function cancel(event) {
          if (event) event.preventDefault();
          if (submitting) return;
          dialog.close();
          dialog.remove();
          reject(new Error('Staff sign-in cancelled. Refresh to sign in.'));
        }
        dialog.addEventListener('cancel', cancel);
        dialog.querySelector('[data-cancel]').addEventListener('click', () => cancel());
        document.body.append(dialog);
        dialog.showModal();
      }).finally(() => { pending = null; });
      return pending;
    }

    function logout() {
      code = null;
      sessionStorage.removeItem(key);
      document.dispatchEvent(new CustomEvent('staff-signed-out'));
    }

    async function request(url, options = {}) {
      const target = new URL(url, location.href);
      if (target.origin !== origin) throw new Error('Staff requests must use the configured backend origin.');
      const verifiedCode = await signIn();
      const headers = new Headers(options.headers);
      headers.set('X-Auth-Code', verifiedCode);
      const response = await fetch(target, {
        ...options, headers, signal: options.signal || AbortSignal.timeout(15000),
      });
      if (response.status === 401) {
        logout();
        throw new Error('Staff code changed or expired. Sign in again before retrying.');
      }
      return response;
    }

    const client = { signIn, request, logout };
    clients.set(origin, client);
    return client;
  }

  root.ResortStaff = { createClient };
})(window);
