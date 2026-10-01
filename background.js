import './extractor.js';
import {
  NO_PERMISSION,
  addProduct,
  getProducts,
  getSettings,
  originPattern,
  productUrl,
  recordPrice,
  updateProduct,
} from './store.js';

const ALARM = 'check-prices';
const { formatPrice } = globalThis.PriceExtractor;

async function scheduleChecks() {
  const { intervalHours } = await getSettings();
  const period = intervalHours * 60;
  const existing = await chrome.alarms.get(ALARM);
  if (existing?.periodInMinutes === period) return;
  await chrome.alarms.create(ALARM, { periodInMinutes: period });
}

async function updateBadge() {
  const unseen = (await getProducts()).filter((p) => p.dropUnseen).length;
  await chrome.action.setBadgeBackgroundColor({ color: '#188038' });
  await chrome.action.setBadgeText({ text: unseen ? String(unseen) : '' });
}

// El service worker no tiene DOMParser, así que el HTML se analiza en un documento offscreen.
let creatingOffscreen;
async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (contexts.length) return;
  creatingOffscreen ??= chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['DOM_PARSER'],
    justification: 'Leer el precio del HTML de las páginas de productos',
  });
  try {
    await creatingOffscreen;
  } finally {
    creatingOffscreen = null;
  }
}

async function readPrice(product) {
  if (!(await chrome.permissions.contains({ origins: [originPattern(product.url)] }))) {
    throw new Error(NO_PERMISSION);
  }
  const res = await fetch(product.url, { credentials: 'include', cache: 'no-store' });
  if (!res.ok) throw new Error(`La tienda respondió con un error (${res.status}).`);
  const html = await res.text();
  await ensureOffscreen();
  const data = await chrome.runtime.sendMessage({
    target: 'offscreen',
    type: 'parse',
    html,
    url: product.url,
    selector: product.selector,
  });
  if (data?.price == null) {
    throw new Error(product.selector
      ? 'No encontré el precio donde lo marcaste. Puede que la página haya cambiado.'
      : 'No encontré el precio en la página.');
  }
  return data;
}

async function notifyDrop(product, price, { old, dropped, hitTarget }) {
  const { notifyAnyDrop } = await getSettings();
  if (!hitTarget && !(dropped && notifyAnyDrop)) return;
  const fmt = (v) => formatPrice(v, product.currency);
  const pct = old ? Math.round((1 - price / old) * 100) : 0;
  await chrome.notifications.create(`producto:${product.id}`, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    priority: 2,
    title: hitTarget ? '🎯 ¡Llegó a tu precio objetivo!' : `📉 Bajó de precio${pct > 0 ? ` un ${pct}%` : ''}`,
    message: `${product.title}\nAhora ${fmt(price)} (antes ${fmt(old)})`,
  });
}

async function checkProduct(id) {
  const product = (await getProducts()).find((p) => p.id === id);
  if (!product) return;
  try {
    const data = await readPrice(product);
    const change = await updateProduct(id, (p) => recordPrice(p, data.price, data.currency));
    if (change?.changed) await notifyDrop(product, data.price, change);
  } catch (err) {
    await updateProduct(id, (p) => {
      p.lastChecked = Date.now();
      p.lastError = err.message;
    });
  }
}

let checkingAll = null;
function checkAll() {
  checkingAll ??= (async () => {
    for (const product of await getProducts()) await checkProduct(product.id);
  })().finally(() => (checkingAll = null));
  return checkingAll;
}

chrome.runtime.onInstalled.addListener(() => {
  scheduleChecks();
  updateBadge();
});
chrome.runtime.onStartup.addListener(() => {
  scheduleChecks();
  updateBadge();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) checkAll();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.products) updateBadge();
  if (changes.settings) scheduleChecks();
});

chrome.notifications.onClicked.addListener(async (notificationId) => {
  const id = notificationId.replace(/^producto:/, '');
  const product = (await getProducts()).find((p) => p.id === id);
  if (product) {
    await chrome.tabs.create({ url: product.url });
    await updateProduct(id, (p) => (p.dropUnseen = false));
  }
  chrome.notifications.clear(notificationId);
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target === 'offscreen') return;
  const handlers = {
    track: () => addProduct(msg.product),
    picked: () => addProduct({ ...msg.product, url: productUrl(msg.product.pageUrl, msg.product.url) }),
    check: () => (msg.id ? checkProduct(msg.id) : checkAll()),
  };
  const handler = handlers[msg?.type];
  if (!handler) return;
  handler().then(
    () => sendResponse({ ok: true }),
    (err) => sendResponse({ ok: false, error: err.message }),
  );
  return true;
});
