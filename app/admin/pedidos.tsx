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
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StatusBar, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { openExternalLink } from "../../lib/openExternalLink";
import { supabase } from "../../lib/supabase";

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
};

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
  border: "#E3EAF2",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  accent: "#1EA7E8",
  accentDark: "#0E86C4",
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

export default function PedidosAdmin() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [filtro, setFiltro] = useState<Estado | "activos" | "todos">("activos");
  const [guardando, setGuardando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const { data, error } = await supabase
      .from("pedidos")
      .select(
        "id,numero,created_at,estado,entrega,nombre,email,telefono,direccion,codigo_postal,ciudad,notas,total_eur,pedido_items(id,product_id,titulo,precio_eur)"
      )
      .order("created_at", { ascending: false })
      .limit(200);
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
    return pedidos.filter((p) => p.estado === filtro);
  }, [pedidos, filtro]);

  async function cambiarEstado(p: Pedido, estado: Estado) {
    if (p.estado === estado) return;
    setGuardando(p.id);
    const { error } = await supabase.from("pedidos").update({ estado }).eq("id", p.id);
    if (error) {
      setErr("No se pudo cambiar el estado del pedido.");
    } else {
      setPedidos((prev) => prev.map((x) => (x.id === p.id ? { ...x, estado } : x)));
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
  ];

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, alignItems: "center" }}>
        <View style={{ width: "100%", maxWidth: 760, gap: 14 }}>
          <View style={{ alignItems: "center", gap: 4 }}>
            <Pressable onPress={() => router.replace("/admin")} style={{ paddingVertical: 6 }}>
              <Text style={{ color: COLORS.accent, fontWeight: "800", textAlign: "center" }}>← Panel</Text>
            </Pressable>
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 24, textAlign: "center" }}>Pedidos</Text>
            <Text style={{ color: COLORS.muted, textAlign: "center" }}>
              {loading ? "Cargando…" : `${visibles.length} de ${pedidos.length} pedidos`}
            </Text>
          </View>

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
            <ActivityIndicator style={{ marginTop: 20 }} />
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
                  {fmtFecha(p.created_at)} · {p.entrega === "recogida" ? "Recogida en tienda" : "Envío a domicilio"}
                </Text>

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
