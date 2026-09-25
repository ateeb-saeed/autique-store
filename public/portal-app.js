// Makes the admin / logistics portal installable as its own app.
// Load with: <script src="/portal-app.js" data-app-name="autique admin" data-icon="/icons/admin-192.png" data-sw="/admin/sw.js"></script>
(() => {
  const cfg = document.currentScript.dataset;
  const appName = cfg.appName;
  let installPrompt = null;
  const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(cfg.sw).catch(err => console.warn('Service worker not registered:', err.message));
    });
  }

  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; });
  window.addEventListener('appinstalled', () => { installPrompt = null; closeModal(); updateButtons(); });

  function updateButtons() {
    document.querySelectorAll('[data-install-app]').forEach(b => b.classList.toggle('hidden', isStandalone()));
  }

  function closeModal() { const m = document.getElementById('portal-app-modal'); if (m) m.remove(); }

  function showInstallHelp() {
    const ua = navigator.userAgent;
    const ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const android = /android/i.test(ua);
    const block = (mine, title, steps) => `<div class="app-steps ${mine ? 'mine' : ''}"><b>${title}${mine ? ' (this device)' : ''}</b><ol>${steps.map(s => `<li>${s}</li>`).join('')}</ol></div>`;
    const el = document.createElement('div');
    el.id = 'portal-app-modal';
    el.className = 'app-modal-bg';
    el.innerHTML = `<div class="app-modal" role="dialog" aria-modal="true" aria-labelledby="portal-app-title">
      <div class="app-modal-head"><img src="${cfg.icon}" alt=""><div><h3 id="portal-app-title">Install ${appName}</h3><p class="hint-text" style="margin:0">Opens as its own app, separate from the customer store.</p></div></div>
      ${block(ios, 'iPhone or iPad', ['Open this page in <b>Safari</b>.', 'Tap the <b>Share</b> button (a square with an arrow).', 'Tap <b>Add to Home Screen</b>, then <b>Add</b>.'])}
      ${block(android, 'Android', ['Open this page in <b>Chrome</b>.', 'Tap the <b>three dots</b> menu at the top right.', 'Tap <b>Install app</b> (or <b>Add to Home screen</b>).'])}
      ${block(!ios && !android, 'Windows or Mac', ['Open this page in <b>Chrome</b> or <b>Edge</b>.', `Click the <b>install icon</b> at the right end of the address bar (or the menu, then <b>Install ${appName}</b>).`])}
      <div class="actions"><button class="btn" data-close-app>Close</button>${installPrompt ? '<button class="btn btn-primary" data-install-now>Install now</button>' : ''}</div>
    </div>`;
    el.addEventListener('click', async ev => {
      if (ev.target === el || ev.target.closest('[data-close-app]')) closeModal();
      if (ev.target.closest('[data-install-now]') && installPrompt) {
        installPrompt.prompt();
        await installPrompt.userChoice;
        installPrompt = null;
        closeModal();
      }
    });
    document.body.appendChild(el);
    el.querySelector('.btn').focus();
  }

  document.addEventListener('click', ev => { if (ev.target.closest('[data-install-app]')) { ev.preventDefault(); showInstallHelp(); } });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape') closeModal(); });
  updateButtons();
})();
