// Analiza el HTML descargado por el service worker y devuelve el precio.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== 'offscreen' || msg.type !== 'parse') return;
  const doc = new DOMParser().parseFromString(msg.html, 'text/html');
  sendResponse(PriceExtractor.extract(doc, msg.selector, msg.url));
});
