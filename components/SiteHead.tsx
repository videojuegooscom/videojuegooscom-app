// components/SiteHead.tsx
/**
 * Qué hace: aplica, en cualquier pantalla de la app, el título de pestaña y
 * la <meta name="description"> que se editan desde el panel de
 * administración (app/admin/marca-seo.tsx) — y, si hay un logo subido, lo
 * usa también como icono de la pestaña (favicon) y como imagen al compartir
 * el enlace (og:image). Es la mitad "aplicar" de esa pantalla: ella guarda
 * en la tabla "site_settings", este componente la lee y la pone en el
 * <head> real del documento.
 *
 * Por qué DOM directo y no <Head> de expo-router: el componente <Head> de
 * expo-router (react-helmet por debajo) solo pinta algo cuando la pantalla
 * donde vive está "enfocada" (usa useIsFocused() de React Navigation) — está
 * pensado para poner un título DISTINTO en cada pantalla, montado dentro de
 * cada una. Aquí el título/descripción son los mismos en TODA la tienda (un
 * único ajuste global, no uno por página), así que se aplican una vez desde
 * la raíz (app/_layout.tsx, junto a la campanita) escribiendo directamente
 * en el <head> del navegador — sin depender de en qué pantalla esté el
 * visitante ni de si esa pantalla tiene foco.
 *
 * Cómo funciona: en cuanto la app arranca en web, pide la fila única de
 * "site_settings" (lectura pública, no hace falta estar logueado) y:
 * - pone document.title y <meta property="og:title">.
 * - pone/actualiza <meta name="description"> y <meta property="og:description">.
 * - si hay logo_url, lo pone como <link rel="icon">,
 *   <link rel="apple-touch-icon"> y <meta property="og:image">.
 * upsertMeta()/upsertLink() reutilizan la etiqueta si ya existe (a partir
 * del favicon fijo que trae app.json) en vez de duplicarla.
 *
 * IMPORTANTE — alcance real (decisión tomada con Daniel): esto es lo que ve
 * cualquier persona con el navegador abierto y lo que indexa Google (su
 * rastreador SÍ ejecuta JavaScript, así que ve este cambio). Lo que NO
 * cubre es la tarjeta que WhatsApp o Facebook arman al pegar el enlace —
 * esos programas NO ejecutan JavaScript y necesitarían las etiquetas ya
 * escritas en el HTML antes de esto (una función de Vercel aparte). Si en
 * algún momento se quiere ese nivel, es un paso siguiente, no está aquí.
 *
 * Conectado con:
 * - lib/supabase.ts → lee "site_settings".
 * - app/admin/marca-seo.tsx → desde donde se edita seo_title,
 *   seo_description y logo_url.
 * - app/_layout.tsx → la monta una única vez, junto a Campanita/CookieConsentBanner.
 */
import { useEffect } from "react";
import { Platform } from "react-native";
import { supabase } from "../lib/supabase";

function upsertMeta(attr: "name" | "property", key: string, content: string) {
  if (typeof document === "undefined") return;

  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertLink(rel: string, href: string) {
  if (typeof document === "undefined") return;

  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

export default function SiteHead() {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;

    let alive = true;

    async function applySiteHead() {
      try {
        const { data, error } = await supabase
          .from("site_settings")
          .select("seo_title, seo_description, logo_url")
          .eq("id", 1)
          .maybeSingle();

        if (!alive || error || !data) return;

        const title = String((data as any).seo_title ?? "").trim();
        const description = String((data as any).seo_description ?? "").trim();
        const logoUrl = String((data as any).logo_url ?? "").trim();

        if (title) {
          document.title = title;
          upsertMeta("property", "og:title", title);
        }

        if (description) {
          upsertMeta("name", "description", description);
          upsertMeta("property", "og:description", description);
        }

        if (logoUrl) {
          upsertLink("icon", logoUrl);
          upsertLink("apple-touch-icon", logoUrl);
          upsertMeta("property", "og:image", logoUrl);
        }
      } catch {
        // Silencioso: si falla, la app se queda con el título/favicon
        // estáticos de siempre (app.json) — nunca debe romper la pantalla.
      }
    }

    applySiteHead();

    return () => {
      alive = false;
    };
  }, []);

  return null;
}
