// Lee el producto y su precio de un documento HTML.
// Es un script clásico que se carga en cuatro sitios: inyectado en la página,
// en el documento offscreen (para el HTML descargado), en el service worker y en el popup.
(() => {
  // Selectores de tiendas conocidas, por si la página no trae datos estructurados.
  const SITE_SELECTORS = [
    '#corePrice_feature_div .a-offscreen',
    '#corePriceDisplay_desktop_feature_div .a-offscreen',
    '.priceToPay .a-offscreen',
    '.apexPriceToPay .a-offscreen',
    '#priceblock_dealprice',
    '#priceblock_ourprice',
    '.x-price-primary',
    '[data-testid="price"]',
  ];

  const SYMBOLS = [
    ['RD$', 'DOP'], ['US$', 'USD'], ['R$', 'BRL'], ['MX$', 'MXN'], ['CA$', 'CAD'], ['A$', 'AUD'],
    ['€', 'EUR'], ['£', 'GBP'], ['₹', 'INR'], ['¥', 'JPY'], ['$', '$'],
  ];

  const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

  /** Convierte "RD$ 1,299.00", "$1.299,50" o "49,99 €" en un número. */
  function parsePrice(text) {
    if (typeof text === 'number') return Number.isFinite(text) ? text : null;
    const match = clean(text).replace(/\s/g, '').match(/\d[\d.,]*/);
    if (!match) return null;
    let s = match[0].replace(/[.,]+$/, '');
    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');
    if (lastDot >= 0 && lastComma >= 0) {
      // Hay los dos: el último que aparece es el separador decimal.
      const decimal = lastDot > lastComma ? '.' : ',';
      const thousands = decimal === '.' ? ',' : '.';
      s = s.split(thousands).join('').replace(decimal, '.');
    } else if (lastDot >= 0 || lastComma >= 0) {
      // Solo uno: si aparece una vez y no va seguido de 3 cifras es decimal ("49.99", "49,9");
      // si no, es separador de miles ("1.299", "1,299,000").
      const parts = s.split(lastDot >= 0 ? '.' : ',');
      s = parts.length === 2 && parts[1].length !== 3 ? parts.join('.') : parts.join('');
    }
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  }

  function detectCurrency(text) {
    const s = clean(text);
    if (!s) return null;
    const code = s.match(/\b(USD|EUR|DOP|MXN|COP|ARS|CLP|PEN|BRL|GBP|CAD|UYU|GTQ|CRC)\b/);
    if (code) return code[1];
    const found = SYMBOLS.find(([symbol]) => s.includes(symbol));
    return found ? found[1] : null;
  }

  // Símbolos que se muestran tal cual para evitar confusiones (por ejemplo, pesos dominicanos vs. dólares).
  const DISPLAY_SYMBOLS = { DOP: 'RD$', USD: 'US$' };

  function formatPrice(value, currency) {
    if (value == null) return '—';
    const digits = { minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 };
    const number = () => new Intl.NumberFormat(undefined, digits).format(value);
    if (DISPLAY_SYMBOLS[currency]) return DISPLAY_SYMBOLS[currency] + number();
    if (/^[A-Z]{3}$/.test(currency || '')) {
      try {
        return new Intl.NumberFormat(undefined, { style: 'currency', currency, currencyDisplay: 'narrowSymbol', ...digits }).format(value);
      } catch {
        // Código de moneda desconocido: seguimos con el formato simple.
      }
    }
    return (currency && currency !== '$' ? `${currency} ` : '$') + number();
  }

  function toNumber(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string' && /^\s*\d+(\.\d+)?\s*$/.test(value)) return parseFloat(value);
    return parsePrice(value);
  }

  function findProduct(node) {
    if (!node || typeof node !== 'object') return null;
    if (Array.isArray(node)) {
      for (const item of node) {
        const found = findProduct(item);
        if (found) return found;
      }
      return null;
    }
    const types = [].concat(node['@type'] || []);
    if (types.includes('Product') || types.includes('ProductGroup')) return node;
    return findProduct(node['@graph']) || findProduct(node.mainEntity);
  }

  function offerPrice(offers) {
    for (const offer of [].concat(offers || [])) {
      if (!offer || typeof offer !== 'object') continue;
      const spec = [].concat(offer.priceSpecification || [])[0] || {};
      const price = toNumber(offer.price ?? offer.lowPrice ?? spec.price);
      if (price != null && price > 0) return { price, currency: offer.priceCurrency || spec.priceCurrency || null };
      const nested = offerPrice(offer.offers);
      if (nested) return nested;
    }
    return null;
  }

  function imageUrl(image) {
    const first = [].concat(image || [])[0];
    return typeof first === 'string' ? first : first?.url || first?.contentUrl || null;
  }

  /**
   * Devuelve { title, image, url, price, currency, source }.
   * Si se pasa `selector` (elegido por el usuario), el precio sale solo de ahí.
   */
  function extract(doc, selector = null, baseUrl = doc.baseURI) {
    const abs = (u) => {
      try { return u ? new URL(u, baseUrl).href : null; } catch { return null; }
    };
    const meta = (...names) => {
      for (const name of names) {
        const el = doc.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
        if (el?.getAttribute('content')) return clean(el.getAttribute('content'));
      }
      return null;
    };
    const valueOf = (el) => clean(el.getAttribute('content') || el.textContent);

    const result = {
      title: meta('og:title', 'twitter:title') || clean(doc.querySelector('h1')?.textContent) || clean(doc.title),
      image: abs(meta('og:image', 'twitter:image')),
      url: abs(doc.querySelector('link[rel="canonical"]')?.getAttribute('href') || meta('og:url')),
      price: null,
      currency: null,
      source: null,
    };

    const setPrice = (text, source) => {
      const price = parsePrice(text);
      if (price == null || price <= 0) return false;
      Object.assign(result, { price, currency: detectCurrency(text) || result.currency, source });
      return true;
    };

    let product = null;
    for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        product = findProduct(JSON.parse(script.textContent));
      } catch {
        continue;
      }
      if (product) break;
    }
    if (product) {
      if (product.name) result.title = clean(product.name);
      result.image = abs(imageUrl(product.image)) || result.image;
    }

    if (selector) {
      let el = null;
      try { el = doc.querySelector(selector); } catch { /* selector no válido */ }
      if (el) setPrice(el.textContent, 'selector');
    } else {
      const offer = product && offerPrice(product.offers);
      if (offer) {
        Object.assign(result, { price: offer.price, currency: offer.currency, source: 'json-ld' });
      }
      if (result.price == null) {
        const amount = toNumber(meta('product:price:amount', 'og:price:amount'));
        if (amount != null && amount > 0) {
          Object.assign(result, { price: amount, currency: meta('product:price:currency', 'og:price:currency'), source: 'meta' });
        }
      }
      if (result.price == null) {
        const el = doc.querySelector('[itemprop="price"]');
        if (el && setPrice(valueOf(el), 'microdata')) {
          const currency = doc.querySelector('[itemprop="priceCurrency"]');
          if (currency) result.currency = valueOf(currency) || result.currency;
        }
      }
      if (result.price == null) {
        for (const sel of SITE_SELECTORS) {
          const el = doc.querySelector(sel);
          if (el && setPrice(el.textContent, 'site')) break;
        }
      }
    }

    result.title = (result.title || '').slice(0, 200);
    return result;
  }

  globalThis.PriceExtractor = { extract, parsePrice, detectCurrency, formatPrice };
})();
