// app/admin/escaparate.tsx
/**
 * Qué hace: pantalla de administración "Escaparate VeoAura". Reúne en un sitio todo el
 * puente con VeoAura:
 * - Ventas en la tienda: cada artículo de VeoAura pedido en la tienda (y su anulación) y si
 *   ya se le ha avisado a VeoAura (puente de vuelta, api/escaparate-retorno.ts). Lo que siga
 *   pendiente o con error hay que tenerlo en cuenta para no venderlo dos veces.
 * - En el escaparate: los artículos que llegaron de VeoAura, si están a la venta, vendidos o
 *   retirados, con sus visitas y «me gusta».
 * - Últimos mensajes: el registro del puente (escaparate_registro), con los fallos a la vista.
 *
 * Cómo funciona: al abrirla (y con «Enviar ahora») despierta api/escaparate-retorno.ts, que
 * apunta y envía los avisos pendientes; después lee las tablas. Solo el administrador puede
 * leerlas (RLS con is_admin()).
 *
 * Conectado con:
 * - app/admin/index.tsx → tarjeta "Escaparate VeoAura" que lleva aquí.
 * - app/admin/_layout.tsx → registra esta ruta ("escaparate") en el Stack.
 * - components/Campanita.tsx → al admin le avisa Blue si hay ventas sin confirmar.
 * - supabase/migrations/20261015100000_escaparate_novedades_retorno.sql (escaparate_salida).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StatusBar, Text, View, useWindowDimensions } from "react-native";
import { router, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import CargaMarca from "../../components/marca/CargaMarca";

const COLORS = {
  bg: "#FFFFFF",
  bg2: "#F4F9FD",
  border: "#E3EAF2",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  muted2: "rgba(11,33,56,0.48)",
  accent: "#1EA7E8",
  success: "#15803D",
  danger: "#B91C1C",
  warn: "#B45309",
};

type Salida = {
  id: string;
  creado_en: string;
  evento: "pedido" | "pedido_anulado";
  id_veoaura: string;
  pedido_id: string;
  estado: "pendiente" | "enviando" | "enviado" | "error" | "descartado";
  intentos: number;
  enviado_en: string | null;
  detalle: string | null;
};

type Articulo = {
  id: string;
  id_veoaura: string;
  title: string;
  price_eur: number | string | null;
  is_active: boolean | null;
  vendido_en: string | null;
  retirado_en: string | null;
  view_count: number | null;
  like_count: number | null;
};

type Registro = {
  id: number;
  recibido_en: string;
  evento: string | null;
  resultado: string;
  http: number | null;
  detalle: string | null;
};

const ESTADO_SALIDA: Record<Salida["estado"], { texto: string; color: string }> = {
  pendiente: { texto: "Pendiente de avisar", color: COLORS.warn },
  enviando: { texto: "Avisando…", color: COLORS.warn },
  enviado: { texto: "Avisado a VeoAura", color: COLORS.success },
  error: { texto: "Error al avisar", color: COLORS.danger },
  descartado: { texto: "Cancelado antes de avisar", color: COLORS.muted },
};

// Precio siempre con dos decimales, coma decimal y miles con punto (155,00€ · 1.299,00€).
function fmtEUR(value: number) {
  const v = Number(value);
  const cents = Math.round((Number.isFinite(v) ? v : 0) * 100);
  const [ent, dec] = (Math.abs(cents) / 100).toFixed(2).split(".");
  return `${cents < 0 ? "-" : ""}${ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}€`;
}

function fmtFechaHora(iso: string | null) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("es-ES", {
      timeZone: "Europe/Madrid",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso.slice(0, 16).replace("T", " ");
  }
}

function estadoArticulo(a: Articulo): { texto: string; color: string } {
  if (a.is_active) return { texto: "A la venta", color: COLORS.success };
  if (a.vendido_en && (!a.retirado_en || a.vendido_en > a.retirado_en)) return { texto: "Vendido", color: COLORS.muted };
  return { texto: "Retirado", color: COLORS.warn };
}

function smartBackAdminHome() {
  try {
    if (typeof router.canGoBack === "function" && router.canGoBack()) {
      router.back();
      return;
    }
  } catch {
    // ignore
  }
  router.replace("/admin");
}

function Titulo({ texto, sub }: { texto: string; sub?: string }) {
  return (
    <View style={{ alignItems: "center", gap: 4, marginTop: 8 }}>
      <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 17, textAlign: "center" }}>{texto}</Text>
      {sub ? <Text style={{ color: COLORS.muted, fontSize: 12.5, lineHeight: 18, textAlign: "center" }}>{sub}</Text> : null}
    </View>
  );
}

function Fila({ children }: { children: React.ReactNode }) {
  return <View style={{ borderTopWidth: 1, borderTopColor: COLORS.border, paddingVertical: 12, gap: 4, alignItems: "center" }}>{children}</View>;
}

export default function AdminEscaparate() {
  const { width } = useWindowDimensions();
  const isMobile = (width || 1024) < 700;
  const pagePadding = isMobile ? 12 : 16;
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [salidas, setSalidas] = useState<Salida[]>([]);
  const [articulos, setArticulos] = useState<Articulo[]>([]);
  const [registro, setRegistro] = useState<Registro[]>([]);
  const [numeros, setNumeros] = useState<Record<string, number>>({});

  // Despierta el puente de vuelta: apunta y envía lo pendiente. Devuelve si está configurado.
  const despertar = useCallback(async (): Promise<boolean | null> => {
    if (Platform.OS !== "web") return null;
    try {
      const r = await fetch("/api/escaparate-retorno", { method: "POST" });
      const datos: any = await r.json().catch(() => null);
      return typeof datos?.configurado === "boolean" ? datos.configurado : null;
    } catch {
      return null;
    }
  }, []);

  const cargar = useCallback(async () => {
    setErr(null);
    try {
      const [rs, ra, rr] = await Promise.all([
        supabase
          .from("escaparate_salida")
          .select("id,creado_en,evento,id_veoaura,pedido_id,estado,intentos,enviado_en,detalle")
          .order("creado_en", { ascending: false })
          .limit(60),
        supabase
          .from("products")
          .select("id,id_veoaura,title,price_eur,is_active,vendido_en,retirado_en,view_count,like_count")
          .not("id_veoaura", "is", null)
          .order("novedad_en", { ascending: false })
          .limit(300),
        supabase
          .from("escaparate_registro")
          .select("id,recibido_en,evento,resultado,http,detalle")
          .order("recibido_en", { ascending: false })
          .limit(30),
      ]);
      if (rs.error || ra.error || rr.error) throw rs.error ?? ra.error ?? rr.error;
      const listaSalidas = (rs.data ?? []) as Salida[];
      setSalidas(listaSalidas);
      setArticulos((ra.data ?? []) as Articulo[]);
      setRegistro((rr.data ?? []) as Registro[]);

      const ids = [...new Set(listaSalidas.map((s) => s.pedido_id))];
      if (ids.length) {
        const { data } = await supabase.from("pedidos").select("id,numero").in("id", ids);
        setNumeros(Object.fromEntries(((data ?? []) as { id: string; numero: number }[]).map((p) => [p.id, p.numero])));
      }
    } catch (e) {
      console.error("Error cargando el escaparate:", e);
      setErr("No se ha podido cargar el escaparate. Si es la primera vez, falta aplicar la migración del puente de vuelta.");
    }
  }, []);

  const enviarAhora = useCallback(async () => {
    setEnviando(true);
    setAviso(null);
    const configurado = await despertar();
    if (configurado === false) {
      setAviso("Falta configurar en Vercel VEOAURA_RETORNO_URL y VEOAURA_RETORNO_SECRETO: los avisos quedan pendientes hasta entonces.");
    }
    await cargar();
    setEnviando(false);
  }, [cargar, despertar]);

  useEffect(() => {
    (async () => {
      await enviarAhora();
      setLoading(false);
    })();
  }, [enviarAhora]);

  const porVeoaura = useMemo(() => new Map(articulos.map((a) => [a.id_veoaura, a])), [articulos]);
  const sinConfirmar = salidas.filter((s) => s.estado === "pendiente" || s.estado === "error" || s.estado === "enviando").length;
  const aLaVenta = articulos.filter((a) => a.is_active).length;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />

      {/* Cabecera fija y compacta (volver al panel + título centrado), igual en todo el panel. */}
      <View
        style={{
          backgroundColor: COLORS.bg2,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.border,
          paddingHorizontal: pagePadding,
          paddingTop: (isMobile ? 10 : 12) + insets.top,
          paddingBottom: isMobile ? 10 : 12,
        }}
      >
        <View style={{ width: "100%", maxWidth: 860, alignSelf: "center", minHeight: 40, justifyContent: "center" }}>
          <Pressable
            onPress={smartBackAdminHome}
            accessibilityRole="button"
            accessibilityLabel="Volver al panel"
            hitSlop={8}
            style={({ pressed }) => ({
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: 40,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Ionicons name="chevron-back" size={24} color={COLORS.text} />
          </Pressable>
          <Text style={{ color: COLORS.text, fontSize: isMobile ? 19 : 22, fontWeight: "900", textAlign: "center", paddingHorizontal: 44 }}>
            Escaparate VeoAura
          </Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: pagePadding, paddingBottom: 48 + insets.bottom, alignItems: "center" }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ width: "100%", maxWidth: 860, gap: 14 }}>
          <Text style={{ color: COLORS.muted, lineHeight: 20, textAlign: "center" }}>
            {aLaVenta} a la venta · {articulos.length} recibidos de VeoAura
            {sinConfirmar ? ` · ${sinConfirmar} ventas sin confirmar a VeoAura` : ""}
          </Text>

          <Pressable
            onPress={enviarAhora}
            disabled={enviando}
            accessibilityRole="button"
            style={({ pressed }) => ({
              alignSelf: "center",
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingVertical: 11,
              paddingHorizontal: 18,
              borderRadius: 999,
              backgroundColor: COLORS.accent,
              opacity: pressed || enviando ? 0.75 : 1,
            })}
          >
            {enviando ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="sync-outline" size={16} color="#FFFFFF" />}
            <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>{enviando ? "Enviando…" : "Enviar ahora y actualizar"}</Text>
          </Pressable>

          {aviso ? <Text style={{ color: COLORS.warn, fontWeight: "800", textAlign: "center", lineHeight: 20 }}>{aviso}</Text> : null}
          {err ? <Text style={{ color: COLORS.danger, fontWeight: "800", textAlign: "center", lineHeight: 20 }}>{err}</Text> : null}

          {loading ? (
            <View style={{ alignItems: "center", paddingVertical: 24 }}>
              <CargaMarca texto="Cargando el escaparate…" />
            </View>
          ) : (
            <>
              <Titulo
                texto="Ventas en la tienda"
                sub="Artículos de VeoAura pedidos aquí. Hasta que ponga «Avisado a VeoAura», no lo vendas también en la tienda física."
              />
              {salidas.length === 0 ? (
                <Text style={{ color: COLORS.muted, textAlign: "center" }}>Todavía no hay pedidos de artículos de VeoAura.</Text>
              ) : (
                salidas.map((s) => {
                  const art = porVeoaura.get(s.id_veoaura);
                  const est = ESTADO_SALIDA[s.estado];
                  const numero = numeros[s.pedido_id];
                  return (
                    <Fila key={s.id}>
                      <Text style={{ color: COLORS.text, fontWeight: "800", textAlign: "center" }}>
                        {art?.title ?? "Artículo de VeoAura"}
                      </Text>
                      <Text style={{ color: COLORS.muted, fontSize: 12.5, textAlign: "center" }}>
                        {s.evento === "pedido" ? "Pedido" : "Pedido cancelado"}
                        {numero ? ` #${numero}` : ""} · {fmtFechaHora(s.creado_en)}
                      </Text>
                      <Text style={{ color: est.color, fontWeight: "900", fontSize: 12.5, textAlign: "center" }}>
                        {est.texto}
                        {s.estado === "enviado" && s.enviado_en ? ` · ${fmtFechaHora(s.enviado_en)}` : ""}
                        {s.estado === "error" ? ` · intento ${s.intentos}` : ""}
                      </Text>
                      {s.detalle && s.estado !== "enviado" ? (
                        <Text style={{ color: COLORS.muted2, fontSize: 12, textAlign: "center" }}>{s.detalle}</Text>
                      ) : null}
                    </Fila>
                  );
                })
              )}

              <Titulo texto="En el escaparate" sub="Lo que ha llegado de VeoAura, con sus visitas y «me gusta» en la tienda." />
              {articulos.length === 0 ? (
                <Text style={{ color: COLORS.muted, textAlign: "center" }}>Todavía no ha llegado nada de VeoAura.</Text>
              ) : (
                articulos.map((a) => {
                  const est = estadoArticulo(a);
                  return (
                    <Fila key={a.id}>
                      <Pressable
                        onPress={() => (a.is_active ? router.push(`/producto/${a.id}` as Href) : undefined)}
                        disabled={!a.is_active}
                        accessibilityRole={a.is_active ? "link" : undefined}
                      >
                        <Text style={{ color: COLORS.text, fontWeight: "800", textAlign: "center" }}>{a.title}</Text>
                      </Pressable>
                      <Text style={{ color: COLORS.muted, fontSize: 12.5, textAlign: "center" }}>
                        {fmtEUR(Number(a.price_eur ?? 0))} · {Number(a.view_count ?? 0)} visitas · {Number(a.like_count ?? 0)} me gusta
                      </Text>
                      <Text style={{ color: est.color, fontWeight: "900", fontSize: 12.5, textAlign: "center" }}>{est.texto}</Text>
                    </Fila>
                  );
                })
              )}

              <Titulo texto="Últimos mensajes" sub="Registro del puente: lo que llega de VeoAura y lo que se le envía." />
              {registro.length === 0 ? (
                <Text style={{ color: COLORS.muted, textAlign: "center" }}>Sin mensajes todavía.</Text>
              ) : (
                registro.map((r) => {
                  const ok = r.resultado === "ok";
                  return (
                    <Fila key={r.id}>
                      <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 13, textAlign: "center" }}>
                        {fmtFechaHora(r.recibido_en)} · {r.evento ?? "—"}
                      </Text>
                      <Text style={{ color: ok ? COLORS.success : COLORS.danger, fontWeight: "900", fontSize: 12.5, textAlign: "center" }}>
                        {ok ? "Correcto" : `Error${r.http ? ` ${r.http}` : ""}`}
                        {r.detalle ? ` · ${r.detalle}` : ""}
                      </Text>
                    </Fila>
                  );
                })
              )}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
