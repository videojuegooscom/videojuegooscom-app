/**
 * Archivo: components/ficha/ExtrasFicha.tsx
 * Función: los bloques de ayuda de la ficha de producto: «Preguntar por este artículo» (chat de la tienda), «Avísame si
 *          baja de precio», las insignias de confianza (revisado y garantía) y la entrega estimada con su franja.
 * Para qué sirve: lo que antes estaba dentro de app/producto/[id].tsx (PreguntarArticulo, AvisoPrecioFicha,
 *          InsigniasConfianza y EntregaEstimadaFicha). Se separó en la tanda 6 de «ordenar el proyecto» (2026-11-18), sin
 *          cambiar nada. La reserva con señal (cobra dinero) se queda en app/producto/[id].tsx.
 * Conectado con: lib/supabase.ts, lib/interaccion.ts (avisos de precio), lib/envio.ts (entrega estimada y franjas),
 *          lib/analiticaPropia.ts, components/ConversacionProducto.tsx, components/ficha/DatosFicha.tsx.
 * Utilizado por: app/producto/[id].tsx.
 * Dependencias: react, react-native, expo-router, @expo/vector-icons, @react-native-async-storage/async-storage.
 * Estado: ACTIVO
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { Href } from "expo-router";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../../lib/supabase";
import { CAMPO, COLORES_TEXTO, TACTIL, TAMANOS, colorTextoAzul } from "../../constants/temaTienda";
import { fijarAvisoPrecio, misAvisosPrecio } from "../../lib/interaccion";
import { marcarOrigenRegistro, medirEvento } from "../../lib/analiticaPropia";
import { cargarAjustesFranjas, entregaEstimada, type TipoEntregaEstimada } from "../../lib/envio";
import { abrirChatProducto } from "../ConversacionProducto";
import { COLORS, pushRoute } from "./DatosFicha";

// --- «Avísame si baja de precio» (mejora 5, aprobada por el dueño el 2026-11-14) ------------------------------------
// SOLO CON CUENTA (ventaja de registrarse, como los avisos de Blue). Con cuenta: interruptor de 44 px que guarda o quita el
// aviso en avisos_precio. Sin cuenta: al tocarlo explica la ventaja y lleva a crear la cuenta (y de vuelta a esta ficha).
// Sin la migración o con la lectura fallida no sale nada: nunca un «desactivado» que no se sabe.
export const VOLVER_TRAS_ACCESO_FICHA_KEY = "videojuegoszaragoza:volver_tras_acceso";

// --- «Preguntar por este artículo» (mejora 10, aprobada por el dueño el 2026-11-15) --------------------------------------
// Con cuenta: abre el chat de la tienda de este producto (el que ya hay o uno nuevo) con la tarjeta del artículo arriba.
// Sin cuenta: explica la ventaja («te contestamos aquí y te avisamos») con «Crear cuenta gratis» y «Entrar»; al entrar vuelve
// a esta ficha con ?chat=1 (perfil.tsx, volver_tras_acceso) y abre el chat solo (abrirAlEntrar), una vez.
export function PreguntarArticulo({ productId, abrirAlEntrar }: { productId: string; abrirAlEntrar: boolean }) {
  const [abriendo, setAbriendo] = useState(false);
  const [invitacion, setInvitacion] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abiertoAlEntrar = useRef(false);

  const preguntar = useCallback(async () => {
    if (abriendo) return;
    setAbriendo(true);
    setError(null);
    try {
      const r = await abrirChatProducto(productId);
      if (r === "login") {
        setInvitacion(true);
        void medirEvento("chat_producto_invitacion", "Ficha: preguntar por el artículo sin cuenta", { path: `/producto/${productId}`, metadata: { productId } });
      }
    } catch {
      setError("No se ha podido abrir el chat. Inténtalo de nuevo.");
    } finally {
      setAbriendo(false);
    }
  }, [abriendo, productId]);

  // Vuelta tras crear la cuenta o entrar: abre el chat (si de verdad hay sesión) y quita ?chat=1 para no repetirlo.
  useEffect(() => {
    if (!abrirAlEntrar || abiertoAlEntrar.current) return;
    abiertoAlEntrar.current = true;
    router.setParams({ chat: undefined } as never);
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) void preguntar();
    });
  }, [abrirAlEntrar, preguntar]);

  const irAcceso = useCallback(
    (modo: "registro" | "entrar") => {
      marcarOrigenRegistro("chat_producto");
      AsyncStorage.setItem(VOLVER_TRAS_ACCESO_FICHA_KEY, JSON.stringify({ ruta: `/producto/${productId}?chat=1`, hasta: Date.now() + 30 * 60_000 })).catch(() => {});
      pushRoute(`/perfil?acceso=${modo}` as Href);
    },
    [productId]
  );

  return (
    <View style={{ gap: 8 }}>
      <Pressable
        nativeID="ficha-preguntar"
        onPress={preguntar}
        disabled={abriendo}
        accessibilityRole="button"
        accessibilityLabel="Preguntar por este artículo"
        style={({ pressed }) => ({
          opacity: pressed || abriendo ? 0.88 : 1,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 7,
          minHeight: 44,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: COLORS.border,
          backgroundColor: "#FFFFFF",
        })}
      >
        {abriendo ? <ActivityIndicator size="small" color={COLORS.accent} /> : <Ionicons name="chatbubble-ellipses-outline" size={16} color={COLORS.text} />}
        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 13.5 }}>Preguntar por este artículo</Text>
      </Pressable>
      {error ? (
        <Text accessibilityRole="alert" style={{ color: "#B91C1C", fontWeight: "800", fontSize: TAMANOS.minimo, textAlign: "center" }}>
          {error}
        </Text>
      ) : null}
      {invitacion ? (
        <View nativeID="ficha-chat-invitacion" style={{ alignItems: "center", gap: 8, borderRadius: 16, backgroundColor: COLORS.bg2, padding: 12 }}>
          <Text style={{ color: COLORES_TEXTO.texto, fontSize: TAMANOS.minimo, lineHeight: 19, textAlign: "center" }}>
            Pregunta con tu cuenta gratis: te contestamos aquí, con el artículo adjunto, y te avisamos cuando respondamos.
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: TACTIL.separacion }}>
            <Pressable
              nativeID="ficha-chat-crear-cuenta"
              onPress={() => irAcceso("registro")}
              accessibilityRole="button"
              style={({ pressed }) => ({ minHeight: TACTIL.minimo, justifyContent: "center", paddingHorizontal: 20, borderRadius: 999, backgroundColor: COLORS.accentDark, opacity: pressed ? 0.85 : 1 })}
            >
              <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 14 }}>Crear cuenta gratis</Text>
            </Pressable>
            <Pressable
              nativeID="ficha-chat-entrar"
              onPress={() => irAcceso("entrar")}
              accessibilityRole="button"
              style={({ pressed }) => ({ minHeight: TACTIL.minimo, justifyContent: "center", paddingHorizontal: 20, borderRadius: 999, borderWidth: 1.5, borderColor: COLORS.accent, backgroundColor: "#FFFFFF", opacity: pressed ? 0.85 : 1 })}
            >
              <Text style={{ color: colorTextoAzul(14), fontWeight: "900", fontSize: 14 }}>Entrar</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

export function AvisoPrecioFicha({ productId, precio }: { productId: string; precio: number }) {
  // "cargando" | "sin_cuenta" | "no" (sin migración o error de lectura: no se ofrece) | "listo"
  const [estado, setEstado] = useState<"cargando" | "sin_cuenta" | "no" | "listo">("cargando");
  const [activo, setActivo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [invitacion, setInvitacion] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const leer = useCallback(async () => {
    try {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session?.user) {
        setEstado("sin_cuenta");
        return;
      }
      const lista = await misAvisosPrecio();
      if (!lista) {
        setEstado("no");
        return;
      }
      setActivo(lista.some((a) => a.product_id === productId));
      setEstado("listo");
    } catch {
      setEstado("no");
    }
  }, [productId]);

  useEffect(() => {
    leer();
    // Al entrar o salir de la cuenta se vuelve a mirar; con cada renovación del token, nada (sesión estable).
    const { data } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === "SIGNED_IN" || evento === "SIGNED_OUT" || evento === "USER_UPDATED") leer();
    });
    return () => data?.subscription?.unsubscribe?.();
  }, [leer]);

  const alternar = useCallback(async () => {
    if (ocupado) return;
    if (estado === "sin_cuenta") {
      setInvitacion((v) => !v);
      if (!invitacion) void medirEvento("aviso_precio_invitacion", "Ficha: aviso de precio sin cuenta", { metadata: { productId } });
      return;
    }
    if (estado !== "listo") return;
    const nuevo = !activo;
    setOcupado(true);
    setMensaje(null);
    setActivo(nuevo);
    const r = await fijarAvisoPrecio(productId, nuevo);
    setOcupado(false);
    if (r === "ok") {
      setMensaje(nuevo ? "Hecho: Blue te avisará si baja de precio." : "Aviso quitado.");
      void medirEvento(nuevo ? "aviso_precio_activado" : "aviso_precio_desactivado", nuevo ? "Aviso de precio: activado" : "Aviso de precio: desactivado", {
        path: `/producto/${productId}`,
        metadata: { productId },
      });
    } else {
      setActivo(!nuevo);
      setMensaje(r === "limite" ? "Ya tienes 50 avisos de precio: quita alguno en Mi perfil." : r === "sin_sesion" ? "Inicia sesión para activar el aviso." : "No se ha podido guardar. Inténtalo de nuevo.");
    }
  }, [ocupado, estado, activo, invitacion, productId]);

  const crearCuenta = useCallback(() => {
    void medirEvento("aviso_precio_crear_cuenta", "Ficha: crear cuenta por el aviso de precio", { metadata: { productId } });
    marcarOrigenRegistro("aviso_precio");
    AsyncStorage.setItem(VOLVER_TRAS_ACCESO_FICHA_KEY, JSON.stringify({ ruta: `/producto/${productId}`, hasta: Date.now() + 30 * 60_000 })).catch(() => {});
    pushRoute("/perfil?acceso=registro" as Href);
  }, [productId]);

  if (estado === "cargando" || estado === "no" || !(precio > 0)) return null;
  const encendido = estado === "listo" && activo;
  return (
    <View nativeID="ficha-aviso-precio" style={{ gap: 8, alignItems: "stretch" }}>
      <Pressable
        nativeID="ficha-aviso-precio-boton"
        onPress={alternar}
        disabled={ocupado}
        accessibilityRole="switch"
        accessibilityState={{ checked: encendido, disabled: ocupado }}
        aria-checked={encendido}
        accessibilityLabel="Avísame si baja de precio"
        style={({ pressed }) => ({
          minHeight: TACTIL.minimo,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          paddingHorizontal: 14,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: encendido ? COLORS.accentBorder : COLORS.border,
          backgroundColor: encendido ? COLORS.accent2 : "#FFFFFF",
          opacity: pressed || ocupado ? 0.85 : 1,
        })}
      >
        <Ionicons name={encendido ? "notifications" : "notifications-outline"} size={16} color={encendido ? COLORS.accent : COLORS.text} />
        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 13.5, flexShrink: 1 }}>Avísame si baja de precio</Text>
        {/* El interruptor dibujado (todo el botón es el que se toca). */}
        <View style={{ width: 34, height: 20, borderRadius: 10, padding: 2, backgroundColor: encendido ? COLORS.accent : "#CBD5E1", alignItems: encendido ? "flex-end" : "flex-start" }}>
          <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: "#FFFFFF" }} />
        </View>
      </Pressable>
      {estado === "sin_cuenta" && invitacion ? (
        <View nativeID="ficha-aviso-precio-invitacion" style={{ alignItems: "center", gap: 8 }}>
          <Text style={{ color: COLORES_TEXTO.texto, fontSize: TAMANOS.minimo, lineHeight: 19, textAlign: "center" }}>
            Los avisos de precio son solo con cuenta: créala gratis y Blue te avisará si este artículo baja de precio.
          </Text>
          <Pressable
            nativeID="ficha-aviso-precio-crear-cuenta"
            onPress={crearCuenta}
            accessibilityRole="button"
            style={({ pressed }) => ({ minHeight: TACTIL.minimo, justifyContent: "center", paddingHorizontal: 20, borderRadius: 999, backgroundColor: COLORS.accentDark, opacity: pressed ? 0.85 : 1 })}
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 14 }}>Crear cuenta gratis</Text>
          </Pressable>
        </View>
      ) : null}
      {mensaje ? (
        <Text nativeID="ficha-aviso-precio-mensaje" style={{ color: COLORES_TEXTO.secundario, fontSize: TAMANOS.minimo, lineHeight: 18, textAlign: "center" }}>
          {mensaje}
        </Text>
      ) : null}
    </View>
  );
}

// --- Ficha de confianza (mejora 4, aprobada por el dueño el 2026-11-14) -------------------------------------------
// «Revisado por nuestro equipo» y «Garantía de N meses» los marca el dueño en cada producto (Administración → Productos,
// migración 20261114140000): si no lo ha marcado, no se enseña nada (ninguna promesa por defecto). La entrega estimada usa
// los plazos de siempre (lib/envio.ts → entregaEstimada) y siempre dice «estimada».

const VERDE_CONFIANZA = "#15803D";

export function InsigniasConfianza({ revisado, garantiaMeses }: { revisado: boolean; garantiaMeses: number | null }) {
  if (!revisado && !garantiaMeses) return null;
  const chip = {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 32,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#CDEBD6",
    backgroundColor: "#F1FAF4",
    flexShrink: 1,
  } as const;
  const texto = { color: COLORES_TEXTO.texto, fontWeight: "800", fontSize: TAMANOS.minimo + 0.5, lineHeight: 18, flexShrink: 1 } as const;
  return (
    <View nativeID="ficha-confianza" style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, maxWidth: "100%" }}>
      {revisado ? (
        <View nativeID="ficha-revisado" style={chip}>
          <Ionicons name="checkmark-circle" size={16} color={VERDE_CONFIANZA} />
          <Text style={texto}>Revisado por nuestro equipo</Text>
        </View>
      ) : null}
      {garantiaMeses ? (
        <View nativeID="ficha-garantia" style={chip}>
          <Ionicons name="shield-checkmark-outline" size={16} color={VERDE_CONFIANZA} />
          <Text style={texto}>
            Garantía de {garantiaMeses} {garantiaMeses === 1 ? "mes" : "meses"}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export function EntregaEstimadaFicha({
  tipo,
  cp,
  origen,
  campoAbierto,
  onAbrirCampo,
  cpEscrito,
  onCpEscrito,
  onIrPerfil,
  regalo = null,
}: {
  tipo: TipoEntregaEstimada;
  cp: string | null;
  origen: "escrito" | "perfil" | null;
  campoAbierto: boolean;
  onAbrirCampo: () => void;
  cpEscrito: string;
  onCpEscrito: (v: string) => void;
  onIrPerfil: () => void;
  /** Envío gratis regalado por la tienda a este cliente que vale para este artículo (texto ya escrito), o null. */
  regalo?: string | null;
}) {
  const azul = colorTextoAzul(14);
  // Las franjas del dueño (dueño, 2026-11-15): «Llega hoy entre las 17:15 y las 19:00 si lo pides antes de las 16:30».
  const [, setFranjasCargadas] = useState(false);
  useEffect(() => {
    let vivo = true;
    cargarAjustesFranjas().then(() => {
      if (vivo) setFranjasCargadas(true);
    });
    return () => {
      vivo = false;
    };
  }, []);
  const enlace = (texto: string, onPress: () => void, id: string) => (
    <Pressable
      nativeID={id}
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({ minHeight: TACTIL.minimo, justifyContent: "center", paddingHorizontal: 4, opacity: pressed ? 0.7 : 1 })}
    >
      <Text style={{ color: azul, fontWeight: "900", fontSize: 14, textDecorationLine: "underline" }}>{texto}</Text>
    </Pressable>
  );
  const textoTitulo = { color: COLORES_TEXTO.texto, fontWeight: "900", fontSize: TAMANOS.cuerpo, lineHeight: 20, flexShrink: 1 } as const;
  const textoDetalle = { color: COLORES_TEXTO.secundario, fontWeight: "700", fontSize: TAMANOS.minimo, lineHeight: 18 } as const;

  let cuerpo: React.ReactNode;
  if (tipo === "sin_cp") {
    const local = entregaEstimada("mismo_dia").titulo ?? "";
    const resto = entregaEstimada("peninsula").titulo ?? "";
    const enMinuscula = (t: string) => t.replace(/^Llega/, "llega");
    cuerpo = (
      <>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons name="cube-outline" size={18} color={COLORES_TEXTO.texto} />
          <Text nativeID="ficha-entrega-titulo" style={textoTitulo}>
            Entrega estimada
          </Text>
        </View>
        <Text nativeID="ficha-entrega-local" style={{ ...textoDetalle, color: COLORES_TEXTO.texto }}>
          Zaragoza y Cuarte de Huerva: {enMinuscula(local)}
        </Text>
        <Text nativeID="ficha-entrega-resto" style={{ ...textoDetalle, color: COLORES_TEXTO.texto }}>
          Resto de España: {enMinuscula(resto)}
        </Text>
        <Text nativeID="ficha-entrega-detalle" style={textoDetalle}>
          Si lo pides hoy, sin contar domingos.
        </Text>
      </>
    );
  } else {
    const e = entregaEstimada(tipo);
    cuerpo = (
      <>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons
            name={tipo === "mismo_dia" ? "bicycle-outline" : tipo === "peninsula" ? "cube-outline" : "information-circle-outline"}
            size={18}
            color={COLORES_TEXTO.texto}
          />
          <Text nativeID="ficha-entrega-titulo" style={textoTitulo}>
            {e.titulo ?? "Entrega estimada"}
          </Text>
        </View>
        <Text nativeID="ficha-entrega-detalle" style={textoDetalle}>
          {e.detalle}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 4 }}>
          <Text nativeID="ficha-entrega-cp-actual" style={textoDetalle}>
            Código postal {cp}
            {origen === "perfil" ? " (de tu perfil)" : ""} ·
          </Text>
          {campoAbierto ? null : enlace("Cambiar", onAbrirCampo, "ficha-entrega-cambiar")}
        </View>
      </>
    );
  }

  return (
    <View
      nativeID="ficha-entrega"
      {...({ dataSet: { tipo } } as object)}
      style={{
        width: "100%",
        maxWidth: 460,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.bg2,
        paddingVertical: 12,
        paddingHorizontal: 14,
        gap: 6,
      }}
    >
      {cuerpo}
      {regalo ? (
        <View nativeID="ficha-entrega-regalo" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {/* El mismo verde que «A la venta» (contraste AA sobre el fondo claro). */}
          <Ionicons name="gift-outline" size={16} color="#166534" />
          <Text style={{ ...textoDetalle, color: "#166534", fontWeight: "900", flexShrink: 1 }}>{regalo}</Text>
        </View>
      ) : null}
      {tipo === "sin_cp" && !campoAbierto ? enlace("Indica tu código postal", onAbrirCampo, "ficha-entrega-cp-boton") : null}
      {campoAbierto ? (
        <View style={{ gap: 4, marginTop: 4 }}>
          <TextInput
            nativeID="ficha-entrega-cp"
            value={cpEscrito}
            onChangeText={onCpEscrito}
            placeholder="Código postal (5 cifras)"
            placeholderTextColor="rgba(11,33,56,0.45)"
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={5}
            autoComplete="postal-code"
            accessibilityLabel="Código postal para calcular la entrega"
            style={{
              height: CAMPO.alto,
              fontSize: CAMPO.letra,
              borderWidth: 1,
              borderColor: COLORS.border,
              borderRadius: 12,
              paddingHorizontal: 12,
              color: COLORES_TEXTO.texto,
              backgroundColor: "#FFFFFF",
            }}
          />
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 4 }}>
            <Text style={textoDetalle}>Solo para calcular la entrega: no se guarda.</Text>
            {enlace("Guárdalo en Mi perfil", onIrPerfil, "ficha-entrega-perfil")}
          </View>
        </View>
      ) : null}
    </View>
  );
}
