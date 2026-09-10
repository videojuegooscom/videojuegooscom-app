// lib/openExternalLink.ts
/**
 * Qué hace: abre un enlace externo (redes sociales, WhatsApp...) intentando
 * que se abra en Google Chrome en vez de en el navegador que esté mostrando
 * la tienda ahora mismo. Daniel reportó que los enlaces le llevaban a
 * Safari — eso es el comportamiento normal de cualquier web: tocar un
 * enlace abre una pestaña en el MISMO navegador que ya está mostrando la
 * página (Safari en iPhone, incluso si la tienda está añadida a la
 * pantalla de inicio), nunca en otro navegador instalado, salvo que se le
 * pida expresamente al sistema operativo.
 *
 * Cómo funciona:
 * - iOS: Chrome registra sus propios "esquemas" de URL —
 *   googlechrome:// / googlechromes:// — que el sistema reconoce para abrir
 *   esa misma dirección directamente en Chrome si está instalado. Es el
 *   mecanismo que la propia Google documenta para este caso exacto:
 *   https://developer.chrome.com/docs/multidevice/android/ios-links.
 *   Se intenta ese esquema cambiando la pestaña actual; si el sistema lo
 *   reconoce, pasa a Chrome. Si Chrome NO está instalado, el esquema no
 *   hace nada (la pestaña se queda donde estaba) y, pasado un instante muy
 *   breve, se usa el enlace normal como red de seguridad — así nunca se
 *   queda la persona sin poder abrir el enlace.
 * - Android: existe el equivalente con una URL "intent://" pidiendo el
 *   paquete de Chrome (com.android.chrome) y su propio enlace de reserva
 *   (S.browser_fallback_url) por si no está instalado — Android abre solo
 *   ese enlace de reserva en ese caso, sin que haga falta ningún
 *   temporizador aquí.
 * - Escritorio, o una futura app nativa: sin ningún truco — se abre el
 *   enlace tal cual, es el propio usuario quien decide su navegador.
 * - mailto:, tel: y esquemas que no sean http(s): tampoco llevan truco —
 *   "abrir en Chrome" no tiene sentido para un enlace de correo o teléfono.
 *
 * Por qué no hace falta nada más: este es justo el mecanismo que Google
 * documenta y mantiene para forzar la apertura en Chrome desde una página
 * cualquiera — a diferencia de intentar abrir la app de OTRA empresa
 * (Instagram, Wallapop...), donde no hay ninguna garantía documentada del
 * esquema exacto de cada una (ver la nota larga de
 * components/SocialLinks.tsx sobre por qué ahí se confía en los enlaces
 * universales en vez de un truco casero).
 *
 * Conectado con:
 * - components/SocialLinks.tsx y app/(tabs)/blue-ia.tsx (chips de redes
 *   sociales) → sustituyen su Linking.openURL directo por esta función.
 * - app/(tabs)/index.tsx, app/producto/[id].tsx, app/servicio/[id].tsx,
 *   app/checkout.tsx → sus respectivas openWhatsApp() usan esta función
 *   para el enlace principal de wa.me (el enlace de reserva de
 *   api.whatsapp.com, por si wa.me fallara, se deja con Linking.openURL
 *   normal: es solo un plan B interno, no hace falta el truco de Chrome
 *   ahí también).
 */
import { Linking, Platform } from "react-native";

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function openExternalLink(url: string): void {
  if (Platform.OS !== "web" || typeof window === "undefined" || typeof navigator === "undefined") {
    Linking.openURL(url);
    return;
  }

  if (!isHttpUrl(url)) {
    Linking.openURL(url);
    return;
  }

  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);

  if (isIOS) {
    const chromeUrl = url.replace(/^https:/i, "googlechromes:").replace(/^http:/i, "googlechrome:");
    let settled = false;

    const openFallback = () => {
      if (settled) return;
      settled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.location.href = url;
    };

    // Si Chrome recoge el esquema, esta pestaña pasa a segundo plano — en
    // cuanto lo detectamos, cancelamos la red de seguridad para no abrir el
    // enlace dos veces.
    const onVisibilityChange = () => {
      if (document.hidden) settled = true;
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    window.setTimeout(openFallback, 900);
    window.location.href = chromeUrl;
    return;
  }

  if (isAndroid) {
    const isHttps = /^https:/i.test(url);
    const withoutScheme = url.replace(/^https?:\/\//i, "");
    const intentUrl = `intent://${withoutScheme}#Intent;scheme=${
      isHttps ? "https" : "http"
    };package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`;
    window.location.href = intentUrl;
    return;
  }

  Linking.openURL(url);
}
