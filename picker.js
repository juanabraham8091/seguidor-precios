// Modo "marcar el precio": el usuario hace clic sobre el precio en la página y lo guardamos.
(() => {
  if (window.__seguidorPickerActivo) return;
  window.__seguidorPickerActivo = true;

  const Z = '2147483647';
  const box = document.createElement('div');
  Object.assign(box.style, {
    position: 'fixed', zIndex: Z, pointerEvents: 'none', display: 'none',
    border: '2px solid #188038', background: 'rgba(24,128,56,.12)', borderRadius: '4px',
  });
  const banner = document.createElement('div');
  Object.assign(banner.style, {
    position: 'fixed', top: '12px', left: '50%', transform: 'translateX(-50%)', zIndex: Z,
    pointerEvents: 'none', maxWidth: '90vw', textAlign: 'center',
    background: '#202124', color: '#fff', font: '14px/1.4 system-ui, sans-serif',
    padding: '10px 16px', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,.3)',
  });
  banner.textContent = 'Haz clic sobre el precio del producto · Esc para cancelar';
  document.documentElement.append(box, banner);

  function toast(text) {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed', bottom: '20px', right: '20px', zIndex: Z, maxWidth: '360px',
      background: '#202124', color: '#fff', font: '14px/1.4 system-ui, sans-serif',
      padding: '12px 16px', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,.3)',
    });
    el.textContent = text;
    document.documentElement.append(el);
    setTimeout(() => el.remove(), 5000);
  }

  function cssPath(el) {
    const unique = (sel) => {
      try {
        const found = document.querySelectorAll(sel);
        return found.length === 1 && found[0] === el;
      } catch {
        return false;
      }
    };
    if (el.id && unique(`#${CSS.escape(el.id)}`)) return `#${CSS.escape(el.id)}`;
    const classes = [...el.classList]
      .filter((c) => !/\d{3,}|hover|active|focus/.test(c))
      .map((c) => `.${CSS.escape(c)}`)
      .join('');
    if (classes && unique(el.localName + classes)) return el.localName + classes;

    const parts = [];
    for (let node = el; node && node !== document.documentElement; node = node.parentElement) {
      if (node !== el && node.id && document.querySelectorAll(`#${CSS.escape(node.id)}`).length === 1) {
        parts.unshift(`#${CSS.escape(node.id)}`);
        break;
      }
      let part = node.localName;
      const siblings = [...(node.parentElement?.children || [])].filter((s) => s.localName === node.localName);
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
      parts.unshift(part);
    }
    return parts.join(' > ');
  }

  const block = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  function onMove(e) {
    const r = e.target.getBoundingClientRect();
    Object.assign(box.style, {
      display: 'block', top: `${r.top}px`, left: `${r.left}px`, width: `${r.width}px`, height: `${r.height}px`,
    });
  }

  function onClick(e) {
    block(e);
    const el = e.target;
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    const price = PriceExtractor.parsePrice(text);
    if (price == null || price <= 0 || text.length > 60) {
      banner.textContent = 'Eso no parece un precio. Haz clic justo sobre el número.';
      return;
    }
    const data = PriceExtractor.extract(document, cssPath(el), location.href);
    data.selector = cssPath(el);
    data.price ??= price;
    data.currency ??= PriceExtractor.detectCurrency(text);
    data.pageUrl = location.href;
    stop();
    chrome.runtime.sendMessage({ type: 'picked', product: data })
      .then((res) => {
        if (!res?.ok) throw new Error();
        toast(`✓ Siguiendo este precio: ${PriceExtractor.formatPrice(data.price, data.currency)}. Te avisaré cuando baje.`);
      })
      .catch(() => toast('No se pudo guardar el precio. Inténtalo otra vez.'));
  }

  function onKey(e) {
    if (e.key !== 'Escape') return;
    stop();
    toast('Cancelado.');
  }

  const listeners = [
    ['mousemove', onMove], ['click', onClick], ['keydown', onKey],
    ['mousedown', block], ['mouseup', block], ['pointerdown', block], ['pointerup', block],
  ];
  listeners.forEach(([type, fn]) => document.addEventListener(type, fn, true));

  function stop() {
    listeners.forEach(([type, fn]) => document.removeEventListener(type, fn, true));
    box.remove();
    banner.remove();
    window.__seguidorPickerActivo = false;
  }
})();
