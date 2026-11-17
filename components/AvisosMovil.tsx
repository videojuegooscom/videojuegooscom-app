/**
 * Archivo: components/AvisosMovil.tsx
 * Función: componente de Administración «Avisos en este móvil» (notificaciones push del dueño).
 * Para qué sirve: activa, prueba y desactiva los avisos push en el móvil del administrador y muestra los dispositivos y las cifras de avisos enviados.
 * Conectado con: lib/notificaciones.ts, lib/supabase.ts (nombreDispositivo, haceCuanto), constants/temaTienda.ts, api/pago.ts (envía los avisos), public/sw-avisos.js, tablas admin_avisos_suscripciones y admin_avisos_registro.
 * Utilizado por: app/admin/pedidos.tsx y app/admin/index.tsx.
 * Dependencias: react, react-native, expo-router, @expo/vector-icons.
 * Estado: ACTIVO
 */
/**
 * Notas:
 * Qué hace: la tarjeta «Avisos en este móvil» de Administración (dueño, 2026-11-15: «He recibido un pedido nuevo con pago
 * por la app y no me he enterado hasta que no he entrado a pedidos. Quiero que me llegue una notificación a mi móvil»).
 * Con un toque en «Activar avisos en este móvil» registra el service worker (public/sw-avisos.js), el navegador pide
 * permiso (en el iPhone tiene que ser con un toque) y guarda la suscripción de este dispositivo en
 * admin_avisos_suscripciones (solo la dirección del servicio de avisos y sus claves públicas, con el nombre legible del
 * dispositivo). Desde entonces, cada pedido pagado o nuevo y cada servicio pagado llega al móvil con su resumen
 * (api/pago.ts). Botones «Enviar aviso de prueba» y «Desactivar en este móvil», la lista de dispositivos con avisos y,
 * como Administración espejo, cuántos avisos salieron en 7 días (y pruebas, activaciones y desactivaciones) y el último.
 * Esas cifras salen de admin_avisos_registro y de las fechas de los dispositivos (la analítica de la tienda no cuenta al
 * administrador); sin nombres ni datos de clientes.
 * Estados: «Avisos sin configurar» (faltan las 3 claves en Vercel), iPhone sin instalar (cómo «Añadir a pantalla de
 * inicio» y abrir desde ahí), avisos bloqueados (cómo quitarlo) y navegador sin avisos. Sin la migración, lo dice.
 * `compacta` (inicio del panel): solo el estado y el botón principal, con «Ver en Pedidos».
 * `plegable` (Administración → Pedidos, rediseño del 2026-11-15): una línea discreta «Avisos en este móvil · activos / no
 * activos / sin configurar / bloqueados» (#avisos-cabecera, 44 px) que despliega la tarjeta entera al tocarla.
 * Tamaños: botones de 44 px (TACTIL), textos de 13 px o más, azul de texto pequeño en azulTexto (constants/temaTienda.ts).
 * Conectado con: app/admin/pedidos.tsx (arriba), app/admin/index.tsx (compacta), lib/notificaciones.ts, lib/supabase.ts
 * (nombreDispositivo, haceCuanto), api/pago.ts (?avisos=clave y «avisos_prueba»), migración
 * 20261115110000_avisos_movil.sql y pruebas/perfil-datos.mjs (sección AVISOM).
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { haceCuanto, nombreDispositivo, supabase } from "../lib/supabase";
import {
  claveAvisosPush,
  registrarServiceWorkerAvisos,
  soporteAvisosPush,
  suscribirAvisosPush,
  suscripcionActual,
  type SoporteAvisosPush,
} from "../lib/notificaciones";
import { COLORES_TEXTO, TACTIL, TAMANOS } from "../constants/temaTienda";

const C = {
  fondo: "#F4F9FD",
  borde: "#E3EAF2",
  texto: COLORES_TEXTO.texto,
  suave: COLORES_TEXTO.secundario,
  azul: COLORES_TEXTO.azulTexto,
  verde: "#15803D",
  rojo: "#B91C1C",
};

type Dispositivo = { id: string; endpoint: string; etiqueta: string; activada_en: string; ultimo_envio_ok: string | null; fallos: number };
type Resumen = { avisos: number; pruebas: number; activaciones: number; desactivaciones: number; ultimo: { titulo: string; referencia: string | null; creado_en: string } | null };

const SIETE_DIAS = 7 * 86_400_000;

function plural(n: number, uno: string, varios: string) {
  return `${n} ${n === 1 ? uno : varios}`;
}

function Boton({ id, texto, icono, principal, onPress, ocupado, peligro }: { id: string; texto: string; icono: keyof typeof Ionicons.glyphMap; principal?: boolean; onPress: () => void; ocupado?: boolean; peligro?: boolean }) {
  const color = principal ? "#FFFFFF" : peligro ? C.rojo : C.azul;
  return (
    <Pressable
      nativeID={id}
      onPress={onPress}
      disabled={ocupado}
      accessibilityRole="button"
      accessibilityLabel={texto}
      style={({ pressed }) => ({
        minHeight: TACTIL.minimo,
        paddingHorizontal: 16,
        borderRadius: 999,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        backgroundColor: principal ? C.azul : "#FFFFFF",
        borderWidth: principal ? 0 : 1,
        borderColor: C.borde,
        opacity: ocupado ? 0.6 : pressed ? 0.85 : 1,
      })}
    >
      <Ionicons name={icono} size={18} color={color} />
      <Text style={{ color, fontWeight: "900", fontSize: TAMANOS.cuerpo, textAlign: "center" }}>{ocupado ? "Un momento…" : texto}</Text>
    </Pressable>
  );
}

export default function AvisosMovil({ compacta = false, plegable = false }: { compacta?: boolean; plegable?: boolean }) {
  // `plegable` (Administración → Pedidos, rediseño 2026-11-15): una línea discreta «Avisos en este móvil · activos / no
  // activos» que se despliega al tocarla (#avisos-cabecera); plegada de entrada para no empujar los pedidos.
  const [abierta, setAbierta] = useState(!plegable);
  const [clave, setClave] = useState<string | null | undefined>(undefined);
  const [soporte, setSoporte] = useState<SoporteAvisosPush>("no-disponible");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [dispositivos, setDispositivos] = useState<Dispositivo[] | null>(null);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [sinTabla, setSinTabla] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const registro = useRef<ServiceWorkerRegistration | null>(null);

  const cargarLista = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("admin_avisos_suscripciones")
        .select("id,endpoint,etiqueta,activada_en,ultimo_envio_ok,fallos")
        .eq("activa", true)
        .order("activada_en", { ascending: false })
        .limit(20);
      if (error) {
        setSinTabla(true);
        setDispositivos([]);
        return;
      }
      setSinTabla(false);
      setDispositivos((data ?? []) as Dispositivo[]);
      if (compacta) return;
      const desde = new Date(Date.now() - SIETE_DIAS).toISOString();
      const [reg, ultimo, act, des] = await Promise.all([
        supabase.from("admin_avisos_registro").select("tipo").gte("creado_en", desde).limit(1000),
        supabase.from("admin_avisos_registro").select("titulo,referencia,creado_en").neq("tipo", "prueba").order("creado_en", { ascending: false }).limit(1),
        supabase.from("admin_avisos_suscripciones").select("id", { count: "exact", head: true }).gte("activada_en", desde),
        supabase.from("admin_avisos_suscripciones").select("id", { count: "exact", head: true }).gte("desactivada_en", desde),
      ]);
      const tipos = ((reg.data ?? []) as { tipo: string }[]).map((r) => r.tipo);
      const u = ((ultimo.data ?? []) as { titulo: string; referencia: string | null; creado_en: string }[])[0] ?? null;
      setResumen({
        avisos: tipos.filter((t) => t !== "prueba").length,
        pruebas: tipos.filter((t) => t === "prueba").length,
        activaciones: act.count ?? 0,
        desactivaciones: des.count ?? 0,
        ultimo: u,
      });
    } catch {
      setDispositivos([]);
    }
  }, [compacta]);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    let vivo = true;
    (async () => {
      const s = soporteAvisosPush();
      const k = await claveAvisosPush();
      if (!vivo) return;
      setSoporte(s);
      setClave(k);
      if (k && s === "ok") {
        const sub = await suscripcionActual();
        if (vivo) setEndpoint(sub?.endpoint ?? null);
        // Listo para el toque (en el iPhone, pedir permiso tiene que ir pegado al toque).
        registro.current = await registrarServiceWorkerAvisos();
      }
      await cargarLista();
    })();
    return () => {
      vivo = false;
    };
  }, [cargarLista]);

  const activoAqui = !!endpoint && !!dispositivos?.some((d) => d.endpoint === endpoint);

  const activar = useCallback(async () => {
    if (!clave || ocupado) return;
    setOcupado("activar");
    setMensaje(null);
    try {
      const reg = registro.current ?? (await registrarServiceWorkerAvisos());
      if (!reg) {
        setMensaje({ tipo: "error", texto: "Este navegador no ha dejado preparar los avisos. Recarga la página y vuelve a probar." });
        return;
      }
      registro.current = reg;
      const sub = await suscribirAvisosPush(reg, clave);
      if (sub === "bloqueadas") {
        setSoporte("bloqueadas");
        setMensaje({ tipo: "error", texto: "Has bloqueado los avisos de esta web. Mira abajo cómo volver a permitirlos." });
        return;
      }
      if (sub === "error") {
        setMensaje({ tipo: "error", texto: "No se han podido activar los avisos. Vuelve a intentarlo en un momento." });
        return;
      }
      const j = sub.toJSON();
      const { data: s } = await supabase.auth.getSession();
      const uid = s.session?.user?.id;
      if (!uid || !j.endpoint || !j.keys?.p256dh || !j.keys?.auth) {
        setMensaje({ tipo: "error", texto: "No se han podido activar los avisos: vuelve a entrar en tu cuenta y prueba otra vez." });
        return;
      }
      const ahora = new Date().toISOString();
      const etiqueta = nombreDispositivo(navigator.userAgent ?? "", Number(navigator.maxTouchPoints ?? 0));
      const { error } = await supabase
        .from("admin_avisos_suscripciones")
        .upsert(
          { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_id: uid, etiqueta, activa: true, activada_en: ahora, desactivada_en: null, fallos: 0 },
          { onConflict: "endpoint" }
        );
      if (error) {
        setMensaje({ tipo: "error", texto: "No se ha podido guardar este móvil. Si acabas de publicar los avisos, falta aplicar su migración." });
        return;
      }
      setEndpoint(j.endpoint);
      setMensaje({ tipo: "ok", texto: "Avisos activados en este móvil. Envía una prueba para comprobar que llega." });
      await cargarLista();
    } catch {
      setMensaje({ tipo: "error", texto: "No se han podido activar los avisos. Vuelve a intentarlo en un momento." });
    } finally {
      setOcupado(null);
    }
  }, [clave, ocupado, cargarLista]);

  const probar = useCallback(async () => {
    if (!endpoint || ocupado) return;
    setOcupado("prueba");
    setMensaje(null);
    try {
      const { data: s } = await supabase.auth.getSession();
      const r = await fetch("/api/pago", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.session?.access_token ?? ""}` },
        body: JSON.stringify({ accion: "avisos_prueba", endpoint }),
      });
      const d = (await r.json().catch(() => null)) as { ok?: boolean; entregados?: number; error?: string } | null;
      if (r.ok && d?.ok && Number(d.entregados) > 0) setMensaje({ tipo: "ok", texto: "Aviso de prueba enviado. Te llegará en unos segundos." });
      else if (r.ok && d?.ok) setMensaje({ tipo: "error", texto: "El servicio de avisos no lo ha aceptado. Desactiva y vuelve a activar los avisos en este móvil." });
      else setMensaje({ tipo: "error", texto: d?.error ? `No se ha enviado: ${d.error}.` : "No se ha podido enviar la prueba. Vuelve a intentarlo." });
      await cargarLista();
    } catch {
      setMensaje({ tipo: "error", texto: "No se ha podido enviar la prueba. Revisa la conexión." });
    } finally {
      setOcupado(null);
    }
  }, [endpoint, ocupado, cargarLista]);

  const desactivar = useCallback(async () => {
    if (!endpoint || ocupado) return;
    setOcupado("desactivar");
    setMensaje(null);
    try {
      const sub = await suscripcionActual();
      await sub?.unsubscribe().catch(() => false);
      const { error } = await supabase
        .from("admin_avisos_suscripciones")
        .update({ activa: false, desactivada_en: new Date().toISOString() })
        .eq("endpoint", endpoint);
      setEndpoint(null);
      setMensaje(error ? { tipo: "error", texto: "Este móvil ya no recibirá avisos, pero no se ha podido apuntar. Recarga para comprobarlo." } : { tipo: "ok", texto: "Avisos desactivados en este móvil." });
      await cargarLista();
    } catch {
      setMensaje({ tipo: "error", texto: "No se han podido desactivar. Vuelve a intentarlo." });
    } finally {
      setOcupado(null);
    }
  }, [endpoint, ocupado, cargarLista]);

  if (Platform.OS !== "web") return null;

  const estado =
    clave === undefined
      ? "Comprobando…"
      : clave === null
        ? "Avisos sin configurar"
        : activoAqui
          ? "Activos en este móvil"
          : soporte === "instalar"
            ? "Primero, añade la tienda a la pantalla de inicio"
            : soporte === "bloqueadas"
              ? "Avisos bloqueados en este navegador"
              : soporte === "no-disponible"
                ? "Este navegador no admite avisos"
                : "Desactivados en este móvil";
  const colorEstado = activoAqui ? C.verde : clave === null || soporte === "bloqueadas" ? C.rojo : C.suave;
  const puedeActivar = !!clave && soporte === "ok" && !activoAqui;
  const nOtros = (dispositivos ?? []).filter((d) => d.endpoint !== endpoint).length;
  // Estado corto de la cabecera plegable.
  const estadoCorto =
    clave === undefined
      ? "comprobando…"
      : clave === null
        ? "sin configurar"
        : activoAqui
          ? "activos"
          : soporte === "bloqueadas"
            ? "bloqueados"
            : "no activos";

  if (plegable && !abierta) {
    return (
      <View nativeID="avisos-movil" style={{ width: "100%", backgroundColor: C.fondo, borderWidth: 1, borderColor: C.borde, borderRadius: 14 }}>
        <CabeceraPlegable abierta={false} onPress={() => setAbierta(true)} activoAqui={activoAqui} corto={estadoCorto} color={colorEstado} />
      </View>
    );
  }

  return (
    <View
      nativeID="avisos-movil"
      style={{ width: "100%", backgroundColor: C.fondo, borderWidth: 1, borderColor: C.borde, borderRadius: plegable ? 14 : 16, padding: plegable ? 0 : 14, paddingBottom: plegable ? 14 : 14, gap: 10 }}
    >
      {plegable ? <CabeceraPlegable abierta onPress={() => setAbierta(false)} activoAqui={activoAqui} corto={estadoCorto} color={colorEstado} /> : null}
      <View style={{ gap: 10, paddingHorizontal: plegable ? 14 : 0 }}>
      {plegable ? (
        // Desplegada: el título ya está en la cabecera; aquí, el estado entero.
        <Text nativeID="avisos-estado" style={{ color: colorEstado, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 18 }}>
          {estado}
        </Text>
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Ionicons name={activoAqui ? "notifications" : "notifications-outline"} size={22} color={activoAqui ? C.verde : C.azul} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: C.texto, fontWeight: "900", fontSize: TAMANOS.destacado }}>Avisos en este móvil</Text>
            <Text nativeID="avisos-estado" style={{ color: colorEstado, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 18 }}>
              {estado}
            </Text>
          </View>
        </View>
      )}

      {/* La explicación, solo mientras no están activos aquí (después sobra y empuja los pedidos hacia abajo). */}
      {!compacta && !activoAqui ? (
        <Text style={{ color: C.suave, fontSize: TAMANOS.minimo, lineHeight: 19 }}>
          {clave === null
            ? "Faltan las 3 claves de los avisos en Vercel (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY y VAPID_SUBJECT). Cuando estén, aquí sale «Activar avisos en este móvil»."
            : "Te avisamos al momento de cada pedido pagado o nuevo y de cada servicio pagado, con el resumen: artículo, importe, cliente (nombre e inicial) y entrega."}
        </Text>
      ) : null}

      {sinTabla && clave ? (
        <Text style={{ color: C.rojo, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 18 }}>Falta aplicar la migración de los avisos (20261115110000_avisos_movil).</Text>
      ) : null}

      {clave && soporte === "instalar" ? (
        <View nativeID="avisos-instalar" style={{ gap: 4 }}>
          <Text style={{ color: C.texto, fontSize: TAMANOS.minimo, lineHeight: 19 }}>
            En el iPhone, los avisos solo llegan con la tienda instalada (iOS 16.4 o posterior):
          </Text>
          <Text style={{ color: C.texto, fontSize: TAMANOS.minimo, lineHeight: 19 }}>1. En Safari, toca Compartir (el cuadrado con la flecha hacia arriba).</Text>
          <Text style={{ color: C.texto, fontSize: TAMANOS.minimo, lineHeight: 19 }}>2. Elige «Añadir a pantalla de inicio» y toca «Añadir».</Text>
          <Text style={{ color: C.texto, fontSize: TAMANOS.minimo, lineHeight: 19 }}>
            3. Abre la tienda desde su icono nuevo, entra en Administración → Pedidos y toca «Activar avisos en este móvil».
          </Text>
        </View>
      ) : null}
      {clave && soporte === "bloqueadas" ? (
        <Text nativeID="avisos-bloqueadas" style={{ color: C.texto, fontSize: TAMANOS.minimo, lineHeight: 19 }}>
          Para volver a permitirlos: en el iPhone, Ajustes → Notificaciones → VideojuegosZaragoza; en Android u ordenador, el candado junto a la dirección → Notificaciones → Permitir. Después, recarga esta pantalla.
        </Text>
      ) : null}
      {clave && soporte === "no-disponible" ? (
        <Text style={{ color: C.texto, fontSize: TAMANOS.minimo, lineHeight: 19 }}>Prueba con Safari (iPhone, con la tienda en la pantalla de inicio), Chrome o Firefox actualizados.</Text>
      ) : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: TACTIL.separacion }}>
        {puedeActivar ? <Boton id="avisos-activar" texto="Activar avisos en este móvil" icono="notifications-outline" principal onPress={activar} ocupado={ocupado === "activar"} /> : null}
        {activoAqui && !compacta ? (
          <>
            <Boton id="avisos-prueba" texto="Enviar aviso de prueba" icono="paper-plane-outline" principal onPress={probar} ocupado={ocupado === "prueba"} />
            <Boton id="avisos-desactivar" texto="Desactivar en este móvil" icono="notifications-off-outline" peligro onPress={desactivar} ocupado={ocupado === "desactivar"} />
          </>
        ) : null}
        {compacta ? <Boton id="avisos-ver-pedidos" texto="Ver en Pedidos" icono="receipt-outline" onPress={() => router.push("/admin/pedidos")} /> : null}
      </View>

      {mensaje ? (
        <Text nativeID="avisos-mensaje" accessibilityLiveRegion="polite" style={{ color: mensaje.tipo === "ok" ? C.verde : C.rojo, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 18 }}>
          {mensaje.texto}
        </Text>
      ) : null}

      {compacta ? (
        nOtros > 0 || activoAqui ? (
          <Text style={{ color: C.suave, fontSize: TAMANOS.minimo }}>{plural((dispositivos ?? []).length, "dispositivo con avisos", "dispositivos con avisos")}</Text>
        ) : null
      ) : (
        <>
          {dispositivos && dispositivos.length > 0 ? (
            <View nativeID="avisos-dispositivos" style={{ gap: 6 }}>
              <Text style={{ color: C.texto, fontWeight: "900", fontSize: TAMANOS.minimo }}>Dispositivos con avisos ({dispositivos.length})</Text>
              {dispositivos.map((d) => (
                <View key={d.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 }}>
                  <Ionicons name={/iPhone|Android/.test(d.etiqueta) ? "phone-portrait-outline" : "desktop-outline"} size={18} color={C.suave} />
                  <Text style={{ flex: 1, minWidth: 0, color: C.texto, fontSize: TAMANOS.minimo, lineHeight: 18 }}>
                    <Text style={{ fontWeight: "800" }}>{d.etiqueta}</Text>
                    {d.endpoint === endpoint ? " (este móvil)" : ""}
                    {` · activado ${haceCuanto(d.activada_en)}`}
                    {d.ultimo_envio_ok ? ` · último aviso ${haceCuanto(d.ultimo_envio_ok)}` : ""}
                    {d.fallos > 0 ? ` · ${plural(d.fallos, "fallo", "fallos")} seguidos` : ""}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          {resumen ? (
            <View nativeID="avisos-resumen" style={{ gap: 2 }}>
              <Text style={{ color: C.suave, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 18 }}>
                {`Últimos 7 días: ${plural(resumen.avisos, "aviso enviado", "avisos enviados")} · ${plural(resumen.pruebas, "prueba", "pruebas")} · ${plural(resumen.activaciones, "activación", "activaciones")} · ${plural(resumen.desactivaciones, "desactivación", "desactivaciones")}`}
              </Text>
              <Text style={{ color: C.suave, fontSize: TAMANOS.minimo, lineHeight: 18 }}>
                {resumen.ultimo
                  ? `Último aviso: ${resumen.ultimo.titulo}${resumen.ultimo.referencia ? ` · ${resumen.ultimo.referencia}` : ""} · ${haceCuanto(resumen.ultimo.creado_en)}`
                  : "Aún no ha salido ningún aviso de pedidos."}
              </Text>
            </View>
          ) : null}
        </>
      )}
      </View>
    </View>
  );
}

// Cabecera de la tarjeta plegable: «Avisos en este móvil · activos» (o «no activos», «sin configurar», «bloqueados»), con
// su flecha; toda la línea se toca (44 px).
function CabeceraPlegable({ abierta, onPress, activoAqui, corto, color }: { abierta: boolean; onPress: () => void; activoAqui: boolean; corto: string; color: string }) {
  return (
    <Pressable
      nativeID="avisos-cabecera"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ expanded: abierta }}
      aria-expanded={abierta}
      accessibilityLabel={`Avisos en este móvil: ${corto}. ${abierta ? "Plegar" : "Desplegar"}`}
      style={({ pressed }) => ({ minHeight: TACTIL.minimo, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 6, opacity: pressed ? 0.8 : 1 })}
    >
      <Ionicons name={activoAqui ? "notifications" : "notifications-outline"} size={18} color={activoAqui ? C.verde : C.azul} />
      <Text style={{ flex: 1, minWidth: 0, color: C.texto, fontWeight: "800", fontSize: TAMANOS.minimo }}>
        Avisos en este móvil
        <Text nativeID="avisos-estado-corto" style={{ color, fontWeight: "900" }}>{` · ${corto}`}</Text>
      </Text>
      <Ionicons name={abierta ? "chevron-up" : "chevron-down"} size={18} color={C.suave} />
    </Pressable>
  );
}
