(function () {
  'use strict';
  const client = ResortStaff.createClient();
  const tools = document.getElementById('tools');
  const login = document.getElementById('sign-in');
  const message = document.getElementById('message');
  async function signIn() {
    message.textContent = '';
    try {
      const response = await client.request('/admin/checkouts');
      if (!response.ok) throw new Error(`Staff service unavailable (${response.status}).`);
      tools.hidden = false;
      login.hidden = true;
    } catch (error) {
      message.textContent = error.message;
    }
  }
  login.addEventListener('click', signIn);
  document.getElementById('sign-out').addEventListener('click', () => {
    client.logout();
    tools.hidden = true;
    login.hidden = false;
  });
  signIn();
})();
