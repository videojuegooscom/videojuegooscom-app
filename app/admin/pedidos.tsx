// app/admin/pedidos.tsx
/**
 * Qué hace: pantalla de administración "Pedidos". Lista los pedidos que los clientes
 * confirman en app/checkout.tsx, con sus artículos, el tipo de entrega y los datos de
 * contacto, y permite cambiar el estado (pendiente → confirmado → preparado → enviado →
 * entregado, o cancelado).
 *
 * Cómo funciona:
 * - Lee "pedidos" y "pedido_items" (supabase/migrations/20261013120000_pedidos.sql).
 *   Solo el administrador puede verlos todos y cambiar el estado (RLS con is_admin()).
 * - Los pedidos no se borran: se cancelan.
 * - Si la tabla aún no existe (migración sin aplicar) lo dice en pantalla.
 *
 * Conectado con:
 * - app/admin/index.tsx → tarjeta "Pedidos" que lleva aquí.
 * - app/admin/_layout.tsx → registra esta ruta ("pedidos") en el Stack.
 * - app/checkout.tsx → crea los pedidos con la función crear_pedido.
 * - api/escaparate-retorno.ts → al cambiar el estado se le avisa, por si el pedido lleva
 *   artículos de VeoAura (al cancelarlo, VeoAura los vuelve a poner a la venta).
 * - Números de seguimiento (migración 20261031170000): cada pedido enseña el suyo, si es una ficha
 *   creada en VeoAura (api/escaparate-veoaura.ts, evento «seguimiento») y si el cliente ya lo tiene
 *   en su cuenta; recuento arriba y filtros «Sin cuenta» y «De VeoAura».
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, StatusBar, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { openExternalLink } from "../../lib/openExternalLink";
import { supabase } from "../../lib/supabase";
import CargaMarca from "../../components/marca/CargaMarca";

type Estado = "pendiente" | "confirmado" | "preparado" | "enviado" | "entregado" | "cancelado";

type PedidoItem = { id: string; product_id: string | null; titulo: string; precio_eur: number };

type Pedido = {
  id: string;
  numero: number;
  created_at: string;
  estado: Estado;
  entrega: "envio" | "recogida";
  nombre: string;
  email: string;
  telefono: string;
  direccion: string | null;
  codigo_postal: string | null;
  ciudad: string | null;
  notas: string | null;
  total_eur: number;
  pedido_items: PedidoItem[];
  // Número de seguimiento (migración 20261031170000; puede no existir aún): el cliente lo escribe en «Mis seguimientos»
  // para añadir el pedido a su cuenta. id_veoaura: la ficha se creó en VeoAura.
  user_id?: string | null;
  codigo_seguimiento?: string | null;
  id_veoaura?: string | null;
  vinculado_en?: string | null;
  // Nota interna: «Asignado desde el chat» si lo creó el administrador desde Administración → Chat.
  nota_admin?: string | null;
};

// La pone api/asignar-seguimiento.ts al asignar un seguimiento desde el chat.
const NOTA_ASIGNADO_CHAT = "Asignado desde el chat";

const ESTADOS: { value: Estado; label: string }[] = [
  { value: "pendiente", label: "Pendiente" },
  { value: "confirmado", label: "Confirmado" },
  { value: "preparado", label: "Preparado" },
  { value: "enviado", label: "Enviado" },
  { value: "entregado", label: "Entregado" },
  { value: "cancelado", label: "Cancelado" },
];

const COLORS = {
  bg: "#FFFFFF",
  bg2: "#F4F9FD",
  border: "#E3EAF2",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  accent: "#1EA7E8",
  accentDark: "#1EA7E8",
  accent2: "#EAF6FD",
  danger: "#B91C1C",
  gold: "#B8860B",
};

// Precio siempre con dos decimales, coma decimal y miles con punto (155,00€ · 1.299,00€).
function fmtEUR(n: number) {
  const v = Number(n);
  const cents = Math.round((Number.isFinite(v) ? v : 0) * 100);
  const [ent, dec] = (Math.abs(cents) / 100).toFixed(2).split(".");
  return `${cents < 0 ? "-" : ""}${ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}€`;
}

function fmtFecha(iso: string) {
  try {
    return new Date(iso).toLocaleString("es-ES", {
      timeZone: "Europe/Madrid",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// Número de seguimiento del pedido: de dónde viene (VeoAura) y si el cliente ya lo tiene en su cuenta. Si no, el número
// es lo que hay que darle para que lo añada en Perfil → «Mis seguimientos».
function EtiquetaNumero({
  codigo,
  veoaura,
  enCuenta,
  vinculadoEn,
  desdeChat,
}: {
  codigo: string;
  veoaura: boolean;
  enCuenta: boolean;
  vinculadoEn: string | null;
  desdeChat: boolean;
}) {
  return (
    <View style={{ alignItems: "center", gap: 2 }}>
      <Text selectable style={{ color: COLORS.text, fontWeight: "900", fontSize: 14, letterSpacing: 1 }}>
        Nº de seguimiento {codigo}
      </Text>
      <Text style={{ color: COLORS.muted, fontWeight: "800", fontSize: 12, textAlign: "center" }}>
        {[
          veoaura ? "Ficha de VeoAura" : null,
          enCuenta
            ? vinculadoEn
              ? `El cliente lo añadió a su cuenta el ${fmtFecha(vinculadoEn)}`
              : desdeChat
                ? "Asignado desde el chat: ya está en la cuenta del cliente"
                : "En la cuenta del cliente"
            : "Aún no está en ninguna cuenta: dale este número al cliente",
        ]
          .filter(Boolean)
          .join(" · ")}
      </Text>
    </View>
  );
}

export default function PedidosAdmin() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [filtro, setFiltro] = useState<Estado | "activos" | "todos" | "sin_vincular" | "veoaura">("activos");
  const [guardando, setGuardando] = useState<string | null>(null);
  // false = aún no hay números de seguimiento (migración sin aplicar): no se enseñan.
  const [numerosOk, setNumerosOk] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const base =
      "id,numero,created_at,estado,entrega,nombre,email,telefono,direccion,codigo_postal,ciudad,notas,total_eur,pedido_items(id,product_id,titulo,precio_eur)";
    const consulta = (columnas: string) => supabase.from("pedidos").select(columnas).order("created_at", { ascending: false }).limit(200);
    let res: { data: unknown[] | null; error: { code?: string; message?: string } | null } = await consulta(
      `${base},user_id,codigo_seguimiento,id_veoaura,vinculado_en,nota_admin`
    );
    const sinNumeros = !!res.error && (res.error.code === "42703" || /codigo_seguimiento|id_veoaura|vinculado_en/.test(String(res.error.message ?? "")));
    if (sinNumeros) res = await consulta(base);
    setNumerosOk(!res.error && !sinNumeros);
    const { data, error } = res;
    if (error) {
      const msg = String(error.message ?? "").toLowerCase();
      setErr(
        msg.includes("pedidos") && (msg.includes("does not exist") || msg.includes("could not find"))
          ? "Los pedidos aún no están activados en la base de datos (falta aplicar la migración de pedidos)."
          : "No se han podido cargar los pedidos."
      );
      setPedidos([]);
    } else {
      setPedidos((data ?? []) as unknown as Pedido[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const visibles = useMemo(() => {
    if (filtro === "todos") return pedidos;
    if (filtro === "activos") return pedidos.filter((p) => p.estado !== "entregado" && p.estado !== "cancelado");
    if (filtro === "sin_vincular") return pedidos.filter((p) => !p.user_id);
    if (filtro === "veoaura") return pedidos.filter((p) => !!p.id_veoaura);
    return pedidos.filter((p) => p.estado === filtro);
  }, [pedidos, filtro]);

  // Números de seguimiento: cuántos pedidos vienen de VeoAura y cuántos ya están en la cuenta de su cliente.
  const resumenNumeros = useMemo(() => {
    const deVeoaura = pedidos.filter((p) => !!p.id_veoaura);
    return {
      veoaura: deVeoaura.length,
      veoauraVinculados: deVeoaura.filter((p) => !!p.user_id).length,
      sinVincular: pedidos.filter((p) => !p.user_id).length,
      anadidosConNumero: pedidos.filter((p) => !!p.vinculado_en).length,
      desdeChat: pedidos.filter((p) => p.nota_admin === NOTA_ASIGNADO_CHAT).length,
    };
  }, [pedidos]);

  async function cambiarEstado(p: Pedido, estado: Estado) {
    if (p.estado === estado) return;
    setGuardando(p.id);
    const { error } = await supabase.from("pedidos").update({ estado }).eq("id", p.id);
    if (error) {
      setErr("No se pudo cambiar el estado del pedido.");
    } else {
      setPedidos((prev) => prev.map((x) => (x.id === p.id ? { ...x, estado } : x)));
      // Si se cancela un pedido con artículos de VeoAura, el servidor se lo avisa a VeoAura
      // (api/escaparate-retorno.ts). No se espera.
      if (Platform.OS === "web") fetch("/api/escaparate-retorno", { method: "POST" }).catch(() => {});
    }
    setGuardando(null);
  }

  function whatsapp(p: Pedido) {
    const tel = p.telefono.replace(/[^\d]/g, "");
    const conPrefijo = tel.length === 9 ? `34${tel}` : tel;
    const texto = encodeURIComponent(`Hola ${p.nombre}, te escribimos por tu pedido nº ${p.numero} en Videojuegoszaragoza.com.`);
    openExternalLink(`https://wa.me/${conPrefijo}?text=${texto}`);
  }

  const chips: { value: typeof filtro; label: string }[] = [
    { value: "activos", label: "En curso" },
    ...ESTADOS,
    { value: "todos", label: "Todos" },
    ...(numerosOk
      ? [
          { value: "sin_vincular" as const, label: `Sin cuenta (${resumenNumeros.sinVincular})` },
          { value: "veoaura" as const, label: `De VeoAura (${resumenNumeros.veoaura})` },
        ]
      : []),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />

      {/* Cabecera fija y compacta (volver al panel + título centrado), igual en todo el panel. */}
      <View
        style={{
          backgroundColor: COLORS.bg2,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.border,
          paddingHorizontal: 16,
          paddingTop: 10 + insets.top,
          paddingBottom: 10,
        }}
      >
        <View style={{ width: "100%", maxWidth: 760, alignSelf: "center", minHeight: 40, justifyContent: "center" }}>
          <Pressable
            onPress={() => router.replace("/admin")}
            accessibilityRole="button"
            accessibilityLabel="Volver al panel"
            hitSlop={8}
            style={({ pressed }) => ({
              position: "absolute",
              // Por encima del título, que va después y ocupa todo el ancho (si no, se queda el toque).
              zIndex: 1,
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
          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 20, textAlign: "center", paddingHorizontal: 44 }}>
            Pedidos
          </Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 48 + insets.bottom, alignItems: "center" }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ width: "100%", maxWidth: 760, gap: 14 }}>
          <Text style={{ color: COLORS.muted, textAlign: "center" }}>
            {loading ? "Cargando…" : `${visibles.length} de ${pedidos.length} pedidos`}
          </Text>
          {numerosOk && !loading ? (
            <Text nativeID="pedidos-numeros" style={{ color: COLORS.muted, fontWeight: "800", fontSize: 12.5, lineHeight: 18, textAlign: "center" }}>
              Números de seguimiento · de VeoAura: {resumenNumeros.veoaura} (en la cuenta del cliente: {resumenNumeros.veoauraVinculados}) ·
              añadidos con su número: {resumenNumeros.anadidosConNumero} · sin cuenta: {resumenNumeros.sinVincular} · asignados desde
              el chat: {resumenNumeros.desdeChat}
            </Text>
          ) : null}

          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
            {chips.map((c) => {
              const activo = filtro === c.value;
              return (
                <Pressable
                  key={c.value}
                  onPress={() => setFiltro(c.value)}
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: activo ? COLORS.accent : COLORS.border,
                    backgroundColor: activo ? COLORS.accent2 : "#FFFFFF",
                  }}
                >
                  <Text style={{ color: activo ? COLORS.accentDark : COLORS.text, fontWeight: "800", fontSize: 13 }}>
                    {c.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {err ? (
            <Text style={{ color: COLORS.danger, fontWeight: "800", textAlign: "center" }}>{err}</Text>
          ) : null}

          {loading ? (
            <View style={{ alignItems: "center", paddingVertical: 24 }}>
              <CargaMarca texto="Cargando pedidos…" />
            </View>
          ) : visibles.length === 0 && !err ? (
            <Text style={{ color: COLORS.muted, textAlign: "center", marginTop: 20 }}>
              No hay pedidos en esta lista.
            </Text>
          ) : (
            visibles.map((p) => (
              <View
                key={p.id}
                style={{ gap: 8, alignItems: "center", paddingVertical: 16, borderTopWidth: 1, borderTopColor: COLORS.border }}
              >
                <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 17, textAlign: "center" }}>
                  Pedido nº {p.numero} · {fmtEUR(p.total_eur)}
                </Text>
                <Text style={{ color: COLORS.muted, textAlign: "center" }}>
                  {fmtFecha(p.created_at)} · {p.entrega === "recogida" ? "Entrega en mano" : "Envío a domicilio"}
                </Text>
                {p.codigo_seguimiento ? (
                  <EtiquetaNumero
                    codigo={p.codigo_seguimiento}
                    veoaura={!!p.id_veoaura}
                    enCuenta={!!p.user_id}
                    vinculadoEn={p.vinculado_en ?? null}
                    desdeChat={p.nota_admin === NOTA_ASIGNADO_CHAT}
                  />
                ) : null}

                {(p.pedido_items ?? []).map((it) => (
                  <Text key={it.id} style={{ color: COLORS.text, textAlign: "center" }}>
                    {it.titulo} · <Text style={{ color: COLORS.gold, fontWeight: "800" }}>{fmtEUR(it.precio_eur)}</Text>
                  </Text>
                ))}

                <Text style={{ color: COLORS.text, fontWeight: "800", textAlign: "center" }}>{p.nombre}</Text>
                <Text style={{ color: COLORS.muted, textAlign: "center" }}>
                  {p.telefono} · {p.email}
                </Text>
                {p.entrega === "envio" && (p.direccion || p.ciudad) ? (
                  <Text style={{ color: COLORS.muted, textAlign: "center" }}>
                    {[p.direccion, [p.codigo_postal, p.ciudad].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
                  </Text>
                ) : null}
                {p.notas ? (
                  <Text style={{ color: COLORS.muted, fontStyle: "italic", textAlign: "center" }}>“{p.notas}”</Text>
                ) : null}

                <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6, marginTop: 4 }}>
                  {ESTADOS.map((e) => {
                    const activo = p.estado === e.value;
                    return (
                      <Pressable
                        key={e.value}
                        disabled={guardando === p.id}
                        onPress={() => cambiarEstado(p, e.value)}
                        style={{
                          paddingVertical: 6,
                          paddingHorizontal: 10,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: activo ? (e.value === "cancelado" ? COLORS.danger : COLORS.accent) : COLORS.border,
                          backgroundColor: activo ? (e.value === "cancelado" ? "#FFE4E6" : COLORS.accent2) : "#FFFFFF",
                          opacity: guardando === p.id ? 0.5 : 1,
                        }}
                      >
                        <Text
                          style={{
                            color: activo ? (e.value === "cancelado" ? COLORS.danger : COLORS.accentDark) : COLORS.muted,
                            fontWeight: "800",
                            fontSize: 12.5,
                          }}
                        >
                          {e.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Pressable
                  onPress={() => whatsapp(p)}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.88 : 1,
                    marginTop: 4,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    paddingVertical: 8,
                    paddingHorizontal: 14,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                  })}
                >
                  <Ionicons name="logo-whatsapp" size={16} color={COLORS.text} />
                  <Text style={{ color: COLORS.text, fontWeight: "800" }}>Escribir al cliente</Text>
                </Pressable>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}
