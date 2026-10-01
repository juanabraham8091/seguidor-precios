// Datos guardados en chrome.storage.local, compartidos por el popup y el service worker.

export const DEFAULT_SETTINGS = { intervalHours: 6, notifyAnyDrop: true };
export const NO_PERMISSION = 'NO_PERMISSION';
const HISTORY_LIMIT = 60;

export function originPattern(url) {
  const u = new URL(url);
  return `${u.protocol}//${u.hostname}/*`;
}

/** URL con la que se guarda el producto: la canónica si es del mismo sitio, sin #ancla. */
export function productUrl(pageUrl, canonical) {
  let url = pageUrl;
  try {
    if (canonical && new URL(canonical).hostname === new URL(pageUrl).hostname) url = canonical;
    const u = new URL(url);
    u.hash = '';
    return u.href;
  } catch {
    return pageUrl;
  }
}

export async function getProducts() {
  const { products = [] } = await chrome.storage.local.get('products');
  return products;
}

async function setProducts(products) {
  await chrome.storage.local.set({ products });
}

export async function addProduct(data) {
  const products = await getProducts();
  const now = Date.now();
  const existing = products.find((p) => p.url === data.url);
  if (existing) {
    if (data.selector) existing.selector = data.selector;
    if (data.target !== undefined) existing.target = data.target;
    if (data.price != null) recordPrice(existing, data.price, data.currency);
    await setProducts(products);
    return existing;
  }
  const product = {
    id: crypto.randomUUID(),
    url: data.url,
    title: data.title || data.url,
    image: data.image || null,
    currency: data.currency || null,
    selector: data.selector || null,
    target: data.target ?? null,
    price: data.price,
    initialPrice: data.price,
    lowestPrice: data.price,
    history: [{ t: now, p: data.price }],
    added: now,
    lastChecked: now,
    lastError: null,
    dropUnseen: false,
  };
  products.unshift(product);
  await setProducts(products);
  return product;
}

/** Registra un precio nuevo en el producto (lo modifica) y dice qué cambió. */
export function recordPrice(product, price, currency) {
  const old = product.price;
  product.lastChecked = Date.now();
  product.lastError = null;
  if (currency) product.currency = currency;
  if (price === old) return { changed: false };

  product.price = price;
  product.lowestPrice = Math.min(product.lowestPrice ?? price, price);
  product.history.push({ t: Date.now(), p: price });
  if (product.history.length > HISTORY_LIMIT) product.history.splice(0, product.history.length - HISTORY_LIMIT);

  const dropped = old != null && price < old;
  if (dropped) product.dropUnseen = true;
  const hitTarget = product.target != null && price <= product.target && (old == null || old > product.target);
  return { changed: true, dropped, hitTarget, old };
}

/** Lee, modifica con `fn` y guarda un producto. Devuelve lo que devuelva `fn`. */
export async function updateProduct(id, fn) {
  const products = await getProducts();
  const product = products.find((p) => p.id === id);
  if (!product) return undefined;
  const result = fn(product);
  await setProducts(products);
  return result;
}

export async function removeProduct(id) {
  await setProducts((await getProducts()).filter((p) => p.id !== id));
}

export async function markAllSeen() {
  const products = await getProducts();
  if (!products.some((p) => p.dropUnseen)) return;
  products.forEach((p) => (p.dropUnseen = false));
  await setProducts(products);
}

export async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...settings };
}

export async function saveSettings(settings) {
  await chrome.storage.local.set({ settings });
}
