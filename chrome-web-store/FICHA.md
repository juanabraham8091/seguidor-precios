# Ficha para la Chrome Web Store: Seguidor de Precios

Textos listos para copiar y pegar en el panel de desarrollador de la Chrome Web Store
(https://chrome.google.com/webstore/devconsole).

## Archivos de esta carpeta

| Archivo | Dónde se sube |
|---|---|
| `extension-para-chrome-web-store.zip` | **Paquete** → "Subir nuevo paquete" (lleva `manifest.json` en la raíz, como pide la tienda) |
| `icono-128x128.png` | Ficha → Icono de la tienda |
| `captura-1280x800.png` | Ficha → Capturas de pantalla |
| `promo-440x280.png` | Ficha → Recuadro promocional pequeño |

---

## 1. Ficha de Play Store

**Nombre** (se toma del manifest): Seguidor de Precios

**Resumen** (se toma del manifest): Sigue el precio de cualquier producto y recibe un aviso cuando baje o llegue al precio que quieres.

**Categoría:** Estilo de vida → Compras

**Idioma:** Español

**Descripción** (copiar todo el bloque):

```
Sigue el precio de cualquier producto y recibe un aviso cuando baje o llegue al precio que quieres pagar.

CÓMO SE USA
1. Abre la página de un producto en cualquier tienda online.
2. Pulsa el icono: verás el producto con su precio actual.
3. Si quieres, escribe tu precio objetivo y pulsa "Seguir precio".

FUNCIONES
• Detección automática del precio en Amazon, eBay, MercadoLibre, tiendas Shopify y WooCommerce, y la mayoría de tiendas online.
• Marcar el precio a mano con un clic, para las tiendas donde no se detecta solo.
• Revisión automática cada 1, 3, 6, 12 o 24 horas.
• Avisos cuando un precio baja o llega a tu precio objetivo.
• Lista de productos con precio actual, cambio en %, precio más bajo, mini gráfico del historial y precio objetivo editable.
• Reconoce monedas y formatos como RD$ 1,299.00, $1.299,50 o 49,99 €.

PRIVACIDAD
Todo se guarda en tu navegador. La extensión no tiene servidor y no envía tus datos a ningún sitio. Solo pide acceso, tienda por tienda, a los sitios de los productos que decides seguir.
```

**Sitio web oficial:** https://github.com/juanabraham8091/seguidor-precios

**URL de asistencia:** https://github.com/juanabraham8091/seguidor-precios/issues

---

## 2. Prácticas de privacidad

**Descripción del propósito único:**
> Seguir el precio de productos de tiendas online y avisar al usuario cuando el precio baja o llega al precio objetivo que eligió.

**Justificación de permisos** (un cuadro por permiso):

**activeTab**
> Leer el nombre, la imagen y el precio del producto en la página que el usuario tiene abierta cuando pulsa el icono de la extensión.

**scripting**
> Inyectar en esa página el código que lee el precio y el modo "marcar el precio", con el que el usuario hace clic sobre el precio cuando no se detecta solo.

**storage**
> Guardar en el navegador la lista de productos seguidos, su historial de precios y los ajustes.

**alarms**
> Revisar los precios periódicamente (cada 1 a 24 horas, según elija el usuario).

**notifications**
> Avisar al usuario cuando un precio baja o llega a su precio objetivo.

**offscreen**
> Analizar con DOMParser el HTML de las páginas de producto descargadas, porque el service worker no tiene DOMParser.

**Permiso de host (optional_host_permissions)**
> Es opcional y se pide sitio por sitio, solo cuando el usuario decide seguir un producto de esa tienda. Sirve para volver a cargar la página del producto en segundo plano y leer el precio actual. No se accede a ningún otro sitio.

**¿Usas código remoto?** → **No, no uso código remoto.**

**Uso de datos.** Marca estas casillas:
- ☑️ Historial web (direcciones de los productos que el usuario decide seguir)
- ☑️ Contenido del sitio web (nombre, imagen y precio de esos productos)

Todo se guarda solo en el navegador del usuario (chrome.storage.local). No hay servidor propio y no se envía, vende ni comparte ningún dato.

Y marca las tres certificaciones:
- ☑️ No vendo ni transfiero datos de usuarios a terceros, fuera de los casos de uso aprobados.
- ☑️ No uso ni transfiero datos de usuarios para fines no relacionados con el propósito único del elemento.
- ☑️ No uso ni transfiero datos de usuarios para determinar la solvencia o con fines de préstamo.

**URL de la política de privacidad:**
https://github.com/juanabraham8091/seguidor-precios/blob/main/PRIVACIDAD.md

---

## 3. Distribución

- **Visibilidad:** Pública (aparece en búsquedas) u Oculta (solo con el enlace).
- **Regiones:** Todas.
- **Precio:** Gratis.
