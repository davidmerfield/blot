// Add "copy" buttons to all <pre> blocks and wire copy-to-clipboard + toast
function preCopy () {
  const pres = document.querySelectorAll('pre');

  // Reuse existing toast root if present, otherwise create it
  let toastRoot = document.querySelector('#toast-root');
  if (!toastRoot) {
    toastRoot = document.createElement('div');
    toastRoot.id = 'toast-root';
    document.body.appendChild(toastRoot);
  }

  // Reuse existing showToast if defined; else define it
  window.showToast ||= function showToast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    toastRoot.appendChild(t);
    void t.offsetWidth;
    t.classList.add('toast--in');
    const hide = () => {
      t.classList.remove('toast--in');
      t.classList.add('toast--out');
      t.addEventListener('transitionend', () => t.remove(), { once: true });
    };
    setTimeout(hide, 1800);
  };

  pres.forEach(pre => {
    if (pre.dataset.copyBtnInjected === '1') return;
    pre.dataset.copyBtnInjected = '1';

    // Ensure positioning context
    if (getComputedStyle(pre).position === 'static') {
      pre.style.position = 'relative';
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pre-copy-btn';
    btn.setAttribute('aria-label', 'Copy code to clipboard');
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const text = pre.textContent;
      try { await navigator.clipboard.writeText(text); } catch {}
      showToast('Copied to your clipboard');
    });

    pre.appendChild(btn);
  });
}

preCopy();
