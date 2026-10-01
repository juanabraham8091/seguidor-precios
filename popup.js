import {
  NO_PERMISSION,
  getProducts,
  getSettings,
  markAllSeen,
  originPattern,
  productUrl,
  removeProduct,
  saveSettings,
  updateProduct,
} from './store.js';

const { formatPrice } = globalThis.PriceExtractor;
const $ = (sel) => document.querySelector(sel);
const SVG = 'http://www.w3.org/2000/svg';

let activeTab = null;
let scan = { state: 'loading' };
let currentTracked = null;
// Productos que bajaron desde la última vez que se abrió el popup (se resaltan).
const highlighted = new Set();

function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function showStatus(text) {
  $('#status').textContent = text;
}

function timeAgo(ms) {
  if (!ms) return '';
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return 'revisado ahora';
  if (min < 60) return `revisado hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `revisado hace ${h} h`;
  return `revisado hace ${Math.round(h / 24)} d`;
}

function productImage(src) {
  const placeholder = () => el('div', { className: 'img-placeholder', textContent: '🏷️' });
  if (!src) return placeholder();
  const img = el('img', { src, alt: '' });
  img.addEventListener('error', () => img.replaceWith(placeholder()), { once: true });
  return img;
}

function productHead(image, title, price) {
  return el('div', { className: 'product-head' }, [
    productImage(image),
    el('div', {}, [
      el('div', { className: 'title', textContent: title, title }),
      el('div', { className: 'big-price', textContent: price }),
    ]),
  ]);
}

function sparkline(history) {
  const prices = history.map((h) => h.p);
  if (prices.length < 2) return null;
  const w = 60;
  const h = 18;
  const min = Math.min(...prices);
  const range = Math.max(...prices) - min || 1;
  const points = prices
    .map((p, i) => `${((i / (prices.length - 1)) * w).toFixed(1)},${(h - 2 - ((p - min) / range) * (h - 4)).toFixed(1)}`)
    .join(' ');
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('width', w);
  svg.setAttribute('height', h);
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('class', `spark ${prices.at(-1) < prices[0] ? 'down' : 'up'}`);
  const line = document.createElementNS(SVG, 'polyline');
  line.setAttribute('points', points);
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', 'currentColor');
  line.setAttribute('stroke-width', '1.5');
  line.setAttribute('stroke-linejoin', 'round');
  svg.append(line);
  return svg;
}

// ---------- Página actual ----------

async function scanActiveTab() {
  [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab || !/^https?:/.test(activeTab.url || '')) return { state: 'not-web' };
  try {
    const target = { tabId: activeTab.id };
    await chrome.scripting.executeScript({ target, files: ['extractor.js'] });
    const [{ result }] = await chrome.scripting.executeScript({ target, func: () => PriceExtractor.extract(document) });
    result.url = productUrl(activeTab.url, result.url);
    return { state: result.price != null ? 'found' : 'not-found', data: result };
  } catch {
    return { state: 'blocked' };
  }
}

function track(data, targetValue) {
  const target = Number(targetValue);
  // El permiso se pide en el mismo clic (Chrome lo exige) y, a la vez, el service worker
  // guarda el producto por si el diálogo de permisos cierra esta ventana.
  const permission = chrome.permissions.request({ origins: [originPattern(data.url)] });
  const saved = chrome.runtime.sendMessage({
    type: 'track',
    product: { ...data, target: targetValue !== '' && target > 0 ? target : null },
  });
  Promise.all([permission, saved])
    .then(([granted]) => {
      showStatus(granted
        ? '✓ Listo. Revisaré el precio y te avisaré cuando baje.'
        : 'Guardado, pero sin permiso no puedo revisar el precio. Puedes darlo desde la lista.');
    })
    .catch((err) => showStatus(`Error: ${err.message}`));
}

function startPicker() {
  const permission = chrome.permissions.request({ origins: [originPattern(activeTab.url)] });
  chrome.scripting
    .executeScript({ target: { tabId: activeTab.id }, files: ['extractor.js', 'picker.js'] })
    .then(() => permission)
    .finally(() => window.close());
}

function renderCurrent(products) {
  const box = $('#current');
  const message = (text, className = 'muted') => box.replaceChildren(el('p', { className, textContent: text }));

  if (scan.state === 'loading') return message('Buscando el precio en esta página…');
  if (scan.state === 'not-web') return message('Abre la página de un producto en cualquier tienda online para seguir su precio.');
  if (scan.state === 'blocked') return message('Chrome no permite leer esta página.');

  const { data } = scan;
  const tracked = products.find((p) => p.url === data.url);
  currentTracked = Boolean(tracked);
  if (tracked) {
    return box.replaceChildren(
      productHead(tracked.image, tracked.title, formatPrice(tracked.price, tracked.currency)),
      el('p', { className: 'ok', textContent: '✓ Ya sigues este producto. Te avisaré cuando baje.' }),
    );
  }

  const pick = (text, className) => {
    const btn = el('button', { className, textContent: text });
    btn.addEventListener('click', startPicker);
    return btn;
  };

  if (scan.state === 'found') {
    const target = el('input', { type: 'number', min: '0', step: 'any', placeholder: 'Opcional' });
    const follow = el('button', { className: 'primary', textContent: 'Seguir precio' });
    follow.addEventListener('click', () => {
      follow.disabled = true;
      track(data, target.value);
    });
    return box.replaceChildren(
      productHead(data.image, data.title, formatPrice(data.price, data.currency)),
      el('label', { className: 'row' }, ['Avísame si baja de', target]),
      follow,
      pick('¿No es el precio correcto? Márcalo tú en la página', 'link'),
    );
  }

  box.replaceChildren(
    el('p', { textContent: 'No encontré el precio automáticamente en esta página.' }),
    pick('Marcar el precio en la página', 'primary'),
    el('p', { className: 'hint', textContent: 'Se cerrará esta ventana y podrás hacer clic sobre el precio.' }),
  );
}

// ---------- Lista ----------

function productItem(p) {
  const fmt = (v) => formatPrice(v, p.currency);
  const change = p.initialPrice ? ((p.price - p.initialPrice) / p.initialPrice) * 100 : 0;

  const priceLine = el('div', { className: 'price-line' }, [el('strong', { textContent: fmt(p.price) })]);
  if (Math.round(change) !== 0) {
    priceLine.append(el('span', {
      className: `change ${change < 0 ? 'down' : 'up'}`,
      textContent: `${change < 0 ? '▼' : '▲'} ${Math.abs(Math.round(change))}%`,
      title: `Cuando empezaste a seguirlo: ${fmt(p.initialPrice)}`,
    }));
  }
  const spark = sparkline(p.history);
  if (spark) priceLine.append(spark);

  const target = el('input', { type: 'number', min: '0', step: 'any', value: p.target ?? '', placeholder: '—' });
  target.addEventListener('change', () => {
    const value = Number(target.value);
    updateProduct(p.id, (x) => (x.target = target.value !== '' && value > 0 ? value : null));
  });

  const body = el('div', { className: 'body' }, [
    el('a', { className: 'title', href: p.url, target: '_blank', textContent: p.title, title: p.title }),
    priceLine,
    el('div', { className: 'meta' }, [
      `Más bajo: ${fmt(p.lowestPrice)}`, ' · ',
      el('label', {}, ['Objetivo: ', target]),
    ]),
    el('div', { className: 'meta', textContent: timeAgo(p.lastChecked) }),
  ]);

  if (p.lastError === NO_PERMISSION) {
    const grant = el('button', { className: 'link', textContent: 'Dar permiso' });
    grant.addEventListener('click', async () => {
      if (await chrome.permissions.request({ origins: [originPattern(p.url)] })) {
        chrome.runtime.sendMessage({ type: 'check', id: p.id });
      }
    });
    body.append(el('div', { className: 'error' }, ['Falta permiso para revisar esta tienda. ', grant]));
  } else if (p.lastError) {
    body.append(el('div', { className: 'error', textContent: p.lastError }));
  }

  const refresh = el('button', { className: 'icon-btn', textContent: '↻', title: 'Revisar ahora' });
  refresh.addEventListener('click', () => {
    refresh.disabled = true;
    chrome.runtime.sendMessage({ type: 'check', id: p.id });
  });
  const remove = el('button', { className: 'icon-btn', textContent: '✕', title: 'Dejar de seguir' });
  remove.addEventListener('click', () => {
    if (confirm(`¿Dejar de seguir "${p.title}"?`)) removeProduct(p.id);
  });

  return el('li', { className: highlighted.has(p.id) ? 'drop' : '' }, [
    productImage(p.image),
    body,
    el('div', { className: 'actions' }, [refresh, remove]),
  ]);
}

function renderList(products) {
  $('#count').textContent = products.length === 1 ? '1 producto' : `${products.length} productos`;
  $('#check-all').hidden = !products.length;
  const list = $('#list');
  if (!products.length) {
    list.replaceChildren(el('li', {
      className: 'empty',
      textContent: 'Todavía no sigues ningún producto. Abre la página de un producto y pulsa "Seguir precio".',
    }));
    return;
  }
  list.replaceChildren(...products.map(productItem));
}

$('#check-all').addEventListener('click', async () => {
  const btn = $('#check-all');
  btn.disabled = true;
  btn.textContent = 'Revisando…';
  await chrome.runtime.sendMessage({ type: 'check' });
  btn.disabled = false;
  btn.textContent = '↻ Revisar todos';
  showStatus('Precios revisados.');
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local' || !changes.products) return;
  const products = changes.products.newValue || [];
  renderList(products);
  // La tarjeta de la página solo se redibuja si cambió si la sigues o no, para no borrar lo que escribes.
  if (scan.data && products.some((p) => p.url === scan.data.url) !== currentTracked) renderCurrent(products);
});

// ---------- Ajustes ----------

async function initSettings() {
  const settings = await getSettings();
  $('#interval').value = String(settings.intervalHours);
  $('#notify-any').checked = settings.notifyAnyDrop;
  const persist = () => saveSettings({
    intervalHours: Number($('#interval').value),
    notifyAnyDrop: $('#notify-any').checked,
  });
  $('#interval').addEventListener('change', persist);
  $('#notify-any').addEventListener('change', persist);
}

async function init() {
  const products = await getProducts();
  products.filter((p) => p.dropUnseen).forEach((p) => highlighted.add(p.id));
  renderList(products);
  renderCurrent(products);
  initSettings();
  scan = await scanActiveTab();
  renderCurrent(await getProducts());
  markAllSeen();
}

init();
