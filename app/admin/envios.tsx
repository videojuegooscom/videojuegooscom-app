// app/admin/envios.tsx
/**
 * Qué hace: Administración → «Tarifas de envío» (dueño, 2026-11-04: «poder editar las tarifas de envío manualmente,
 * pero que siga haciéndose automáticamente; que pueda hacerse de ambas maneras sin problemas»).
 *
 * Cómo funciona:
 * - AUTOMÁTICO: la tienda calcula sola el envío de cada compra con estas tarifas (lib/envio.ts en la cesta y al pagar;
 *   la base de datos, con la misma regla, al guardar el pedido: supabase/migrations/20261104210000_tarifas_envio.sql).
 *   Entrega en mano → su precio; a domicilio → la zona del código postal (código exacto o rango, después el prefijo más
 *   largo y, si no, «Resto de la península»). Con «Gratis desde», a partir de ese importe en artículos es gratis. Sin
 *   código postal (un pedido asignado desde el chat) o en una venta de VeoAura, la base de datos no suma envío.
 * - A MANO: aquí se editan los precios, los códigos postales de cada zona, «gratis desde» y si se envía a cada zona
 *   (si no, al pagar se pide escribir antes). Y el envío de un pedido concreto se cambia en Administración → Pedidos
 *   (queda «a mano» y ya no se recalcula; «Volver al automático» lo devuelve a la tarifa).
 * - La «Calculadora» prueba un código postal y un importe con lo que hay escrito (antes de guardar).
 * - Los últimos 30 días (de la tabla de pedidos): cuántos pedidos van a cada zona, lo cobrado de envío, cuántos con
 *   el envío puesto a mano y cuántos sin zona.
 * - Sin la migración aplicada, la pantalla lo dice y la tienda sigue con el envío gratis.
 *
 * - Tamaños del móvil (grupo 5, 2026-11-13; constants/theme.ts): ningún texto de menos de 13 px, grises
 *   desde COLORES_TEXTO.secundario, texto azul pequeño en azulTexto, todo lo que se toca de 44 px y los
 *   campos de 16 px y 48 de alto.
 *
 * Conectado con: app/admin/index.tsx (tarjeta «Tarifas de envío»), app/admin/_layout.tsx (ruta), lib/envio.ts.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Switch,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import CargaMarca from "../../components/marca/CargaMarca";
import { CAMPO, COLORES_TEXTO, TACTIL, TAMANOS } from "../../constants/theme";
import {
  calcularEnvio,
  fijarAjustesFranjas,
  FRANJAS_POR_DEFECTO,
  fmtKg,
  horaCorta,
  normalizarAjustesFranjas,
  opcionesFranja,
  PESO_SIN_DATO_KG,
  type AjustesFranjas,
  type Entrega,
  type TramoEnvio,
  type ZonaEnvio,
} from "../../lib/envio";

// "on-drag" en web cierra el teclado con cualquier desplazamiento (también el del navegador al enfocar un campo).
const CIERRE_TECLADO: "none" | "on-drag" = Platform.OS === "web" ? "none" : "on-drag";

const COLORS = {
  bg: "#FFFFFF",
  bg2: "#F4F9FD",
  card: "#F6FAFD",
  border: "#E3EAF2",
  text: "#0B2138",
  muted: COLORES_TEXTO.secundario,
  accent: "#1EA7E8",
  accentText: COLORES_TEXTO.azulTexto,
  success: "#15803D",
  danger: "#B91C1C",
  dangerBg: "#FFE4E6",
};

const MIGRACION = "supabase/migrations/20261104210000_tarifas_envio.sql";

// Lo que se edita de cada zona (los importes como texto, con coma, tal y como se escriben). Tramos por kilos
// (migración 20261107120000_envio_por_kilos): «hasta X kg, Y €», como la tabla de Correos.
type TramoBorrador = { kg: string; precio: string };
type Borrador = { nombre: string; codigos: string; precio: string; gratisDesde: string; activa: boolean; tramos: TramoBorrador[] };

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

function fmtEUR(n: number) {
  const cents = Math.round((Number.isFinite(n) ? n : 0) * 100);
  const [ent, dec] = (Math.abs(cents) / 100).toFixed(2).split(".");
  return `${cents < 0 ? "-" : ""}${ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}€`;
}

// «5,90» → 5.9; vacío → null; texto que no es un importe → NaN.
function leerImporte(texto: string): number | null {
  const t = texto.trim().replace(/\s|€/g, "").replace(",", ".");
  if (!t) return null;
  return /^\d{1,5}(\.\d{1,2})?$/.test(t) ? Number(t) : NaN;
}
const aTexto = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));

function deZona(z: ZonaEnvio): Borrador {
  return {
    nombre: z.nombre,
    codigos: z.codigos ?? "",
    precio: aTexto(z.precio_eur),
    gratisDesde: aTexto(z.gratis_desde_eur),
    activa: z.activa,
    tramos: (z.tramos ?? []).map((t) => ({ kg: aTexto(t.hasta_kg), precio: t.precio_eur.toFixed(2).replace(".", ",") })),
  };
}

// «2,5» kg → 2.5; vacío → null; otra cosa → NaN.
function leerKg(texto: string): number | null {
  const t = texto.trim().replace(/\s|kg/gi, "").replace(",", ".");
  if (!t) return null;
  return /^\d{1,3}(\.\d{1,3})?$/.test(t) && Number(t) > 0 ? Number(t) : NaN;
}

// Los tramos escritos, ordenados por peso. null si alguno está mal escrito (las filas vacías no cuentan).
function leerTramos(filas: TramoBorrador[]): TramoEnvio[] | null {
  const salida: TramoEnvio[] = [];
  for (const f of filas) {
    if (!f.kg.trim() && !f.precio.trim()) continue;
    const kg = leerKg(f.kg);
    const precio = leerImporte(f.precio);
    if (kg === null || Number.isNaN(kg) || precio === null || Number.isNaN(precio) || precio > 999) return null;
    salida.push({ hasta_kg: kg, precio_eur: precio });
  }
  return salida.sort((a, b) => a.hasta_kg - b.hasta_kg);
}

const mismosTramos = (a: TramoEnvio[] | null, b: TramoEnvio[] | null) => JSON.stringify(a ?? []) === JSON.stringify(b ?? []);

export default function AdminEnvios() {
  const { width } = useWindowDimensions();
  const isMobile = (width > 0 ? width : 1024) < 700;
  const pagePadding = isMobile ? 14 : 20;
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [sinTabla, setSinTabla] = useState(false);
  const [zonas, setZonas] = useState<ZonaEnvio[]>([]);
  const [borradores, setBorradores] = useState<Record<string, Borrador>>({});
  const [pedidosPorZona, setPedidosPorZona] = useState<Record<string, number> | null>(null);
  const [resumen, setResumen] = useState<{ pedidos: number; cobrado: number; aMano: number; sinZona: number } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  // Calculadora.
  const [cEntrega, setCEntrega] = useState<Entrega>("envio");
  const [cCodigo, setCCodigo] = useState("");
  const [cImporte, setCImporte] = useState("");
  const [cPeso, setCPeso] = useState("");
  // ¿Existe la columna de tramos? (migración 20261107120000; sin ella no se enseñan ni se guardan).
  const [conTramos, setConTramos] = useState(false);
  // Artículos a la venta sin peso (cuentan PESO_SIN_DATO_KG en el envío). null = sin la columna de peso.
  const [sinPeso, setSinPeso] = useState<number | null>(null);
  // Artículos a la venta que solo se entregan en mano. null = sin la columna.
  const [soloMano, setSoloMano] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const { data, error } = await supabase.from("tarifas_envio").select("*").order("orden", { ascending: true });
      if (error) {
        // La tabla aún no existe (migración sin pegar) u otro fallo de lectura.
        setSinTabla(/does not exist|schema cache|42P01|PGRST205/i.test(`${error.code ?? ""} ${error.message ?? ""}`));
        if (!/does not exist|schema cache|42P01|PGRST205/i.test(`${error.code ?? ""} ${error.message ?? ""}`)) {
          setMsg({ tipo: "error", texto: "No se han podido cargar las tarifas. Inténtalo de nuevo." });
        }
        setZonas([]);
        return;
      }
      const brutas = (data ?? []) as Record<string, unknown>[];
      const filas: ZonaEnvio[] = brutas.map((r) => ({
        zona: String(r.zona ?? ""),
        nombre: String(r.nombre ?? ""),
        codigos: typeof r.codigos === "string" ? r.codigos : null,
        precio_eur: Number(r.precio_eur ?? 0) || 0,
        gratis_desde_eur: r.gratis_desde_eur === null || r.gratis_desde_eur === undefined ? null : Number(r.gratis_desde_eur),
        activa: r.activa !== false,
        orden: Number(r.orden ?? 0) || 0,
        tramos: Array.isArray(r.tramos)
          ? (r.tramos as Record<string, unknown>[])
              .map((t) => ({ hasta_kg: Number(t.hasta_kg) || 0, precio_eur: Number(t.precio_eur) || 0 }))
              .filter((t) => t.hasta_kg > 0)
              .sort((a, b) => a.hasta_kg - b.hasta_kg)
          : null,
      }));
      setConTramos(brutas.some((r) => "tramos" in r));
      setSinTabla(false);

      // Artículos a la venta sin peso (sin la columna de peso, no se enseña).
      const sp = await supabase.from("products").select("id", { count: "exact", head: true }).eq("is_active", true).is("peso_kg", null);
      setSinPeso(sp.error ? null : sp.count ?? 0);
      // Artículos que solo se entregan en mano (televisores sin su caja original; migración 20261107140000).
      const sm = await supabase.from("products").select("id", { count: "exact", head: true }).eq("is_active", true).eq("solo_entrega_mano", true);
      setSoloMano(sm.error ? null : sm.count ?? 0);
      setZonas(filas);
      setBorradores(Object.fromEntries(filas.map((z) => [z.zona, deZona(z)])));

      // Pedidos de los últimos 30 días por zona, cuántos con el envío a mano y lo cobrado de envío (sin las columnas
      // aún, no se enseña).
      const desde = new Date(Date.now() - 30 * 86400000).toISOString();
      const p = await supabase.from("pedidos").select("zona_envio,envio_eur,envio_manual").gte("created_at", desde).limit(2000);
      if (p.error) {
        setPedidosPorZona(null);
        setResumen(null);
      } else {
        const cuenta: Record<string, number> = {};
        const r30 = { pedidos: 0, cobrado: 0, aMano: 0, sinZona: 0 };
        for (const r of (p.data ?? []) as { zona_envio: string | null; envio_eur: number | string | null; envio_manual: boolean | null }[]) {
          const z = r.zona_envio ?? "sin_zona";
          cuenta[z] = (cuenta[z] ?? 0) + 1;
          r30.pedidos += 1;
          r30.cobrado += Number(r.envio_eur ?? 0) || 0;
          if (r.envio_manual) r30.aMano += 1;
          if (!r.zona_envio) r30.sinZona += 1;
        }
        setPedidosPorZona(cuenta);
        setResumen(r30);
      }
    } catch {
      setMsg({ tipo: "error", texto: "No se han podido cargar las tarifas. Inténtalo de nuevo." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const cambiar = (zona: string, campo: Exclude<keyof Borrador, "tramos">, valor: string | boolean) => {
    setMsg(null);
    setBorradores((b) => ({ ...b, [zona]: { ...b[zona], [campo]: valor } }));
  };
  // Tramos: cambiar una fila, añadir una vacía o quitarla.
  const cambiarTramo = (zona: string, i: number, campo: keyof TramoBorrador, valor: string) => {
    setMsg(null);
    setBorradores((b) => ({ ...b, [zona]: { ...b[zona], tramos: b[zona].tramos.map((t, j) => (j === i ? { ...t, [campo]: valor } : t)) } }));
  };
  const anadirTramo = (zona: string) => {
    setMsg(null);
    setBorradores((b) => ({ ...b, [zona]: { ...b[zona], tramos: [...b[zona].tramos, { kg: "", precio: "" }] } }));
  };
  const quitarTramo = (zona: string, i: number) => {
    setMsg(null);
    setBorradores((b) => ({ ...b, [zona]: { ...b[zona], tramos: b[zona].tramos.filter((_, j) => j !== i) } }));
  };

  // Lo escrito como zonas (para la calculadora y para saber qué ha cambiado). null en un importe mal escrito.
  const zonasEditadas = useMemo<ZonaEnvio[] | null>(() => {
    const salida: ZonaEnvio[] = [];
    for (const z of zonas) {
      const b = borradores[z.zona];
      if (!b) continue;
      const precio = leerImporte(b.precio);
      const gratis = leerImporte(b.gratisDesde);
      const tramos = leerTramos(b.tramos);
      if (precio === null || Number.isNaN(precio) || Number.isNaN(gratis as number) || tramos === null) return null;
      salida.push({
        ...z,
        nombre: b.nombre.trim(),
        codigos: z.zona === "mano" ? null : b.codigos.trim() || null,
        precio_eur: precio,
        gratis_desde_eur: gratis,
        activa: b.activa,
        tramos: tramos.length ? tramos : null,
      });
    }
    return salida;
  }, [zonas, borradores]);

  const cambiadas = useMemo(() => {
    if (!zonasEditadas) return [];
    return zonasEditadas.filter((e) => {
      const o = zonas.find((z) => z.zona === e.zona);
      return (
        !!o &&
        (o.nombre !== e.nombre ||
          (o.codigos ?? null) !== (e.codigos ?? null) ||
          o.precio_eur !== e.precio_eur ||
          o.gratis_desde_eur !== e.gratis_desde_eur ||
          o.activa !== e.activa ||
          !mismosTramos(o.tramos, e.tramos))
      );
    });
  }, [zonas, zonasEditadas]);

  const guardar = useCallback(async () => {
    if (!zonasEditadas) {
      setMsg({ tipo: "error", texto: "Revisa los importes y los tramos: solo números, con coma para los céntimos (5,90) y los kilos (2,5)." });
      return;
    }
    const mal = zonasEditadas.find((z) => z.nombre.length < 2 || z.precio_eur > 999);
    if (mal) {
      setMsg({ tipo: "error", texto: `Revisa «${mal.nombre || mal.zona}»: el nombre es obligatorio y el precio, de 0 a 999 €.` });
      return;
    }
    if (!cambiadas.length) {
      setMsg({ tipo: "ok", texto: "No hay cambios que guardar." });
      return;
    }
    setGuardando(true);
    setMsg(null);
    try {
      const { data: s } = await supabase.auth.getSession();
      for (const z of cambiadas) {
        const { error } = await supabase
          .from("tarifas_envio")
          .update({
            nombre: z.nombre,
            codigos: z.codigos,
            precio_eur: z.precio_eur,
            gratis_desde_eur: z.gratis_desde_eur,
            activa: z.activa,
            ...(conTramos ? { tramos: z.tramos } : {}),
            updated_at: new Date().toISOString(),
            updated_by: s.session?.user?.id ?? null,
          })
          .eq("zona", z.zona);
        if (error) throw error;
      }
      setZonas((prev) => prev.map((o) => cambiadas.find((c) => c.zona === o.zona) ?? o));
      setMsg({ tipo: "ok", texto: `Tarifas guardadas (${cambiadas.length}). Se aplican a los pedidos nuevos.` });
    } catch (e) {
      console.error("Error guardando las tarifas de envío:", e);
      setMsg({ tipo: "error", texto: "No se han podido guardar las tarifas. Inténtalo de nuevo." });
    } finally {
      setGuardando(false);
    }
  }, [zonasEditadas, cambiadas, conTramos]);

  const pruebaPeso = leerKg(cPeso);
  const prueba = useMemo(() => {
    const importe = leerImporte(cImporte);
    const peso = leerKg(cPeso);
    return calcularEnvio(zonasEditadas, {
      entrega: cEntrega,
      codigoPostal: cCodigo,
      productos: importe && !Number.isNaN(importe) ? importe : 0,
      pesoKg: peso && !Number.isNaN(peso) ? peso : null,
    });
  }, [zonasEditadas, cEntrega, cCodigo, cImporte, cPeso]);

  const campo = (props: React.ComponentProps<typeof TextInput>) => (
    <TextInput
      placeholderTextColor="rgba(11,33,56,0.35)"
      {...props}
      style={[
        {
          minHeight: CAMPO.alto,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: COLORS.border,
          backgroundColor: "#FFFFFF",
          paddingHorizontal: 12,
          color: COLORS.text,
          fontSize: CAMPO.letra,
          fontWeight: "700",
        },
        props.style,
      ]}
    />
  );

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
        <View style={{ width: "100%", maxWidth: 860, alignSelf: "center", minHeight: TACTIL.minimo, justifyContent: "center" }}>
          <Pressable
            onPress={smartBackAdminHome}
            accessibilityRole="button"
            accessibilityLabel="Volver al panel"
            hitSlop={8}
            style={({ pressed }) => ({ position: "absolute", zIndex: 1, left: 0, top: 0, bottom: 0, width: TACTIL.minimo, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.7 : 1 })}
          >
            <Ionicons name="chevron-back" size={24} color={COLORS.text} />
          </Pressable>
          <Text style={{ color: COLORS.text, fontSize: isMobile ? 19 : 22, fontWeight: "900", textAlign: "center", paddingHorizontal: 44 }}>
            Tarifas de envío
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <CargaMarca texto="Cargando…" />
        </View>
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: pagePadding, paddingBottom: 48 + insets.bottom, alignItems: "center" }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={CIERRE_TECLADO}
          >
            <View style={{ width: "100%", maxWidth: 860, gap: 16 }}>
              <View nativeID="envios-explicacion" style={{ gap: 6 }}>
                <Text style={{ color: COLORS.text, fontWeight: "800", lineHeight: 21, textAlign: "center" }}>
                  La tienda calcula sola el envío de cada compra con estas tarifas: por la entrega, el código postal y el importe.
                </Text>
                <Text style={{ color: COLORS.muted, lineHeight: 20, textAlign: "center" }}>
                  Aquí cambias los precios a mano. Si un pedido concreto necesita otro precio (un envío pesado, una isla…), cámbialo en Pedidos.
                </Text>
              </View>

              {resumen ? (
                <View nativeID="envios-resumen" style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", columnGap: 16, rowGap: 6 }}>
                  {(
                    [
                      { icon: "receipt-outline", texto: `${resumen.pedidos} ${resumen.pedidos === 1 ? "pedido" : "pedidos"} en 30 días` },
                      { icon: "cash-outline", texto: `${fmtEUR(resumen.cobrado)} de envío` },
                      { icon: "create-outline", texto: `${resumen.aMano} con el envío a mano` },
                      { icon: "help-circle-outline", texto: `${resumen.sinZona} sin zona` },
                    ] as { icon: React.ComponentProps<typeof Ionicons>["name"]; texto: string }[]
                  )
                    .concat(sinPeso !== null ? [{ icon: "barbell-outline", texto: `${sinPeso} ${sinPeso === 1 ? "artículo" : "artículos"} sin peso (cuentan ${fmtKg(PESO_SIN_DATO_KG)})` }] : [])
                    .concat(soloMano ? [{ icon: "hand-left-outline", texto: `${soloMano} solo en mano (no se envían)` }] : [])
                    .map((d) => (
                    <View key={d.icon} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Ionicons name={d.icon} size={16} color={COLORS.accent} />
                      <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 14 }}>{d.texto}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {sinTabla ? (
                <View nativeID="envios-sin-migracion" style={{ borderRadius: 14, backgroundColor: COLORS.dangerBg, padding: 12, gap: 4 }}>
                  <Text style={{ color: COLORS.danger, fontWeight: "900", textAlign: "center" }}>Falta preparar la base de datos</Text>
                  <Text style={{ color: COLORS.danger, lineHeight: 20, textAlign: "center" }}>
                    Pega en Supabase → SQL Editor el archivo {MIGRACION}. Hasta entonces el envío sigue siendo gratis en la tienda.
                  </Text>
                </View>
              ) : null}

              {zonas.map((z) => {
                const b = borradores[z.zona];
                if (!b) return null;
                const pedidos = pedidosPorZona ? pedidosPorZona[z.zona] ?? 0 : null;
                return (
                  <View key={z.zona} nativeID={`envio-zona-${z.zona}`} style={{ borderRadius: 20, backgroundColor: COLORS.card, padding: isMobile ? 14 : 18, gap: 10 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
                      <Ionicons name={z.zona === "mano" ? "hand-left-outline" : "cube-outline"} size={18} color={COLORS.accent} />
                      <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16, textAlign: "center", flexShrink: 1 }}>{b.nombre || z.zona}</Text>
                    </View>
                    {pedidos !== null ? (
                      <Text style={{ color: COLORS.muted, fontSize: TAMANOS.minimo, fontWeight: "700", textAlign: "center" }}>
                        {pedidos} {pedidos === 1 ? "pedido" : "pedidos"} en los últimos 30 días
                      </Text>
                    ) : null}

                    <Text style={{ color: COLORS.muted, fontWeight: "800", fontSize: TAMANOS.minimo }}>Nombre que ve el cliente</Text>
                    {campo({ value: b.nombre, onChangeText: (t) => cambiar(z.zona, "nombre", t), maxLength: 90, accessibilityLabel: `Nombre de ${z.zona}` })}

                    {z.zona !== "mano" ? (
                      <>
                        <Text style={{ color: COLORS.muted, fontWeight: "800", fontSize: TAMANOS.minimo }}>
                          Códigos postales (separados por comas; un rango con guion, 50001-50022; 2 cifras = toda la provincia; * = el resto)
                        </Text>
                        {campo({ value: b.codigos, onChangeText: (t) => cambiar(z.zona, "codigos", t), maxLength: 300, autoCapitalize: "none", accessibilityLabel: `Códigos postales de ${z.zona}` })}
                      </>
                    ) : null}

                    {/* Tramos por kilos (Correos): si hay, el envío es el del peso del pedido; si no, el precio fijo. */}
                    {conTramos && z.zona !== "mano" ? (
                      <View nativeID={`envio-tramos-${z.zona}`} style={{ gap: 6 }}>
                        <Text style={{ color: COLORS.muted, fontWeight: "800", fontSize: TAMANOS.minimo }}>
                          {b.tramos.length
                            ? "Precio por kilos (peso del pedido con embalaje): hasta X kg, Y €"
                            : "Precio por kilos: sin tramos, se cobra el precio fijo de abajo"}
                        </Text>
                        {b.tramos.map((t, i) => (
                          <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                            <View style={{ flex: 1 }}>
                              {campo({
                                nativeID: `envio-tramo-kg-${z.zona}-${i}`,
                                value: t.kg,
                                onChangeText: (v) => cambiarTramo(z.zona, i, "kg", v),
                                keyboardType: "decimal-pad",
                                placeholder: "Hasta kg",
                                accessibilityLabel: `Tramo ${i + 1} de ${z.zona}: hasta kilos`,
                              })}
                            </View>
                            <View style={{ flex: 1 }}>
                              {campo({
                                nativeID: `envio-tramo-precio-${z.zona}-${i}`,
                                value: t.precio,
                                onChangeText: (v) => cambiarTramo(z.zona, i, "precio", v),
                                keyboardType: "decimal-pad",
                                placeholder: "Precio (€)",
                                accessibilityLabel: `Tramo ${i + 1} de ${z.zona}: precio`,
                              })}
                            </View>
                            <Pressable
                              onPress={() => quitarTramo(z.zona, i)}
                              accessibilityRole="button"
                              accessibilityLabel={`Quitar el tramo ${i + 1} de ${z.zona}`}
                              hitSlop={6}
                              style={({ pressed }) => ({ width: 44, height: 44, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.6 : 1 })}
                            >
                              <Ionicons name="trash-outline" size={20} color={COLORS.danger} />
                            </Pressable>
                          </View>
                        ))}
                        <Pressable
                          nativeID={`envio-tramo-anadir-${z.zona}`}
                          onPress={() => anadirTramo(z.zona)}
                          accessibilityRole="button"
                          style={({ pressed }) => ({ alignSelf: "center", minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6, opacity: pressed ? 0.6 : 1 })}
                        >
                          <Ionicons name="add-circle-outline" size={18} color={COLORS.accent} />
                          <Text style={{ color: COLORS.accentText, fontWeight: "800" }}>Añadir tramo</Text>
                        </Pressable>
                      </View>
                    ) : null}

                    <View style={{ flexDirection: "row", gap: 10 }}>
                      <View style={{ flex: 1, gap: 6 }}>
                        <Text style={{ color: COLORS.muted, fontWeight: "800", fontSize: TAMANOS.minimo }}>
                          {conTramos && z.zona !== "mano" ? "Precio fijo (€), si no hay tramos" : "Precio (€)"}
                        </Text>
                        {campo({
                          nativeID: `envio-precio-${z.zona}`,
                          value: b.precio,
                          onChangeText: (t) => cambiar(z.zona, "precio", t),
                          keyboardType: "decimal-pad",
                          placeholder: "0,00",
                          accessibilityLabel: `Precio de ${z.zona}`,
                        })}
                      </View>
                      <View style={{ flex: 1, gap: 6 }}>
                        <Text style={{ color: COLORS.muted, fontWeight: "800", fontSize: TAMANOS.minimo }}>Gratis desde (€)</Text>
                        {campo({
                          nativeID: `envio-gratis-${z.zona}`,
                          value: b.gratisDesde,
                          onChangeText: (t) => cambiar(z.zona, "gratisDesde", t),
                          keyboardType: "decimal-pad",
                          placeholder: "Nunca",
                          accessibilityLabel: `Gratis desde, ${z.zona}`,
                        })}
                      </View>
                    </View>

                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <Text style={{ color: b.activa ? COLORS.text : COLORS.danger, fontWeight: "800", flexShrink: 1 }}>
                        {b.activa ? "Se puede pedir desde la web" : "No se envía desde la web (se pide escribir antes)"}
                      </Text>
                      <Switch
                        nativeID={`envio-activa-${z.zona}`}
                        value={b.activa}
                        onValueChange={(v) => cambiar(z.zona, "activa", v)}
                        accessibilityLabel={`Se envía a ${z.zona}`}
                      />
                    </View>
                  </View>
                );
              })}

              {zonas.length ? (
                <View style={{ alignItems: "center", gap: 8 }}>
                  <Pressable
                    nativeID="envios-guardar"
                    onPress={guardar}
                    disabled={guardando}
                    accessibilityRole="button"
                    style={({ pressed }) => ({
                      width: "100%",
                      maxWidth: 420,
                      minHeight: 50,
                      borderRadius: 999,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      backgroundColor: COLORS.accent,
                      opacity: guardando ? 0.6 : pressed ? 0.88 : 1,
                    })}
                  >
                    {guardando ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="save-outline" size={18} color="#FFFFFF" />}
                    <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 15 }}>
                      {cambiadas.length ? `Guardar cambios (${cambiadas.length})` : "Guardar cambios"}
                    </Text>
                  </Pressable>
                  {msg ? (
                    <Text nativeID="envios-mensaje" style={{ color: msg.tipo === "ok" ? COLORS.success : COLORS.danger, fontWeight: "800", textAlign: "center" }}>
                      {msg.texto}
                    </Text>
                  ) : null}
                </View>
              ) : msg ? (
                <Text style={{ color: COLORS.danger, fontWeight: "800", textAlign: "center" }}>{msg.texto}</Text>
              ) : null}

              {/* Calculadora: prueba un código postal y un importe con lo escrito (antes de guardar). */}
              {zonas.length ? (
                <View nativeID="envios-calculadora" style={{ borderRadius: 20, backgroundColor: COLORS.card, padding: isMobile ? 14 : 18, gap: 10 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <Ionicons name="calculator-outline" size={18} color={COLORS.accent} />
                    <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>Calculadora</Text>
                  </View>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", columnGap: 18 }}>
                    {(
                      [
                        { key: "envio", label: "A domicilio" },
                        { key: "recogida", label: "En mano" },
                      ] as const
                    ).map((op) => (
                      <Pressable
                        key={op.key}
                        onPress={() => setCEntrega(op.key)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: cEntrega === op.key }}
                        style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6 }}
                      >
                        <Ionicons name={cEntrega === op.key ? "radio-button-on" : "radio-button-off"} size={20} color={cEntrega === op.key ? COLORS.accent : COLORS.muted} />
                        <Text style={{ color: COLORS.text, fontWeight: "800" }}>{op.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      {campo({ nativeID: "envios-calc-cp", value: cCodigo, onChangeText: setCCodigo, keyboardType: "number-pad", placeholder: "Código postal", maxLength: 5, accessibilityLabel: "Código postal de prueba" })}
                    </View>
                    <View style={{ flex: 1 }}>
                      {campo({ nativeID: "envios-calc-importe", value: cImporte, onChangeText: setCImporte, keyboardType: "decimal-pad", placeholder: "Importe (€)", accessibilityLabel: "Importe de prueba" })}
                    </View>
                    {conTramos ? (
                      <View style={{ flex: 1 }}>
                        {campo({ nativeID: "envios-calc-peso", value: cPeso, onChangeText: setCPeso, keyboardType: "decimal-pad", placeholder: "Peso (kg)", accessibilityLabel: "Peso de prueba" })}
                      </View>
                    ) : null}
                  </View>
                  <Text nativeID="envios-calc-resultado" style={{ color: COLORS.text, fontWeight: "900", textAlign: "center", lineHeight: 21 }}>
                    {!zonasEditadas
                      ? "Revisa los importes de arriba."
                      : !prueba.zona
                        ? "Escribe un código postal de 5 cifras."
                        : `${prueba.zona.nombre}: ${prueba.precio === 0 ? "gratis" : fmtEUR(prueba.precio)}${prueba.gratisPorImporte ? " (por el importe)" : ""}${
                            prueba.zona.tramos && !prueba.gratisPorImporte
                              ? ` (con ${fmtKg(pruebaPeso && !Number.isNaN(pruebaPeso) ? pruebaPeso : PESO_SIN_DATO_KG)})`
                              : ""
                          }${prueba.disponible ? "" : " · no se envía desde la web"}`}
                  </Text>
                </View>
              ) : null}

              <EditorFranjas compacto={isMobile} />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

// --- Franjas de entrega en el mismo día (dueño, 2026-11-15; migración 20261115180000_franjas_entrega.sql) ------------
// El dueño cambia aquí las dos franjas, el margen de corte y qué franjas hay el sábado y el domingo (de lunes a viernes,
// las dos). La tienda las recibe del servidor (api/pago.ts) y, sin la migración, usa las de siempre (lib/envio.ts).
// Debajo, cuántos pedidos han elegido cada franja en los últimos 30 días.
type BorradorFranjas = Omit<AjustesFranjas, "margen_minutos"> & { margen: string };
const MIGRACION_FRANJAS = "supabase/migrations/20261115180000_franjas_entrega.sql";

function EditorFranjas({ compacto }: { compacto: boolean }) {
  const [cargando, setCargando] = useState(true);
  const [sinTabla, setSinTabla] = useState(false);
  const [guardado, setGuardado] = useState<AjustesFranjas>(FRANJAS_POR_DEFECTO);
  const [b, setB] = useState<BorradorFranjas>({ ...FRANJAS_POR_DEFECTO, margen: String(FRANJAS_POR_DEFECTO.margen_minutos) });
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [uso, setUso] = useState<{ manana: number; tarde: number } | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data, error } = await supabase
        .from("entrega_franjas_ajustes")
        .select("manana_desde,manana_hasta,tarde_desde,tarde_hasta,margen_minutos,sabado_manana,sabado_tarde,domingo_manana,domingo_tarde")
        .eq("id", 1)
        .maybeSingle();
      if (!vivo) return;
      if (error || !data) {
        setSinTabla(true);
      } else {
        const aj = normalizarAjustesFranjas(data as Record<string, unknown>);
        setGuardado(aj);
        setB({ ...aj, margen: String(aj.margen_minutos) });
      }
      // Uso en 30 días (sin la columna, nada).
      const desde = new Date(Date.now() - 30 * 86400000).toISOString();
      const r = await supabase.from("pedidos").select("entrega_franja").not("entrega_franja", "is", null).gte("created_at", desde).limit(1000);
      if (!vivo) return;
      if (!r.error && Array.isArray(r.data)) {
        const filas = r.data as { entrega_franja: string | null }[];
        setUso({ manana: filas.filter((f) => f.entrega_franja === "manana").length, tarde: filas.filter((f) => f.entrega_franja === "tarde").length });
      }
      setCargando(false);
    })().catch(() => {
      if (vivo) {
        setSinTabla(true);
        setCargando(false);
      }
    });
    return () => {
      vivo = false;
    };
  }, []);

  const margen = /^\d{1,3}$/.test(b.margen.trim()) ? Number(b.margen.trim()) : NaN;
  const horas = [b.manana_desde, b.manana_hasta, b.tarde_desde, b.tarde_hasta].map((h) => horaCorta(h));
  const aMin = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
  const error = horas.some((h) => !h)
    ? "Escribe las horas como 11:00."
    : aMin(horas[0]!) >= aMin(horas[1]!) || aMin(horas[2]!) >= aMin(horas[3]!)
      ? "Cada franja tiene que empezar antes de terminar."
      : aMin(horas[1]!) > aMin(horas[2]!)
        ? "La franja de mañana tiene que terminar antes de la de tarde."
        : !Number.isInteger(margen) || margen > 240
          ? "El margen va de 0 a 240 minutos."
          : null;
  const nuevo: AjustesFranjas | null = error
    ? null
    : {
        manana_desde: horas[0]!,
        manana_hasta: horas[1]!,
        tarde_desde: horas[2]!,
        tarde_hasta: horas[3]!,
        margen_minutos: margen,
        sabado_manana: b.sabado_manana,
        sabado_tarde: b.sabado_tarde,
        domingo_manana: b.domingo_manana,
        domingo_tarde: b.domingo_tarde,
      };
  const cambiado = !!nuevo && JSON.stringify(nuevo) !== JSON.stringify(guardado);
  const corte = (desde: string | null) => (desde && Number.isInteger(margen) ? (() => { const m = Math.max(0, aMin(desde) - margen); return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; })() : "—");
  const ahora = nuevo ? opcionesFranja(nuevo).map((o) => o.etiqueta).join(" · ") : "";

  async function guardar() {
    if (!nuevo || !cambiado) return;
    setGuardando(true);
    setMsg(null);
    const { data: u } = await supabase.auth.getUser();
    const { error: e } = await supabase
      .from("entrega_franjas_ajustes")
      .update({ ...nuevo, updated_at: new Date().toISOString(), updated_by: u?.user?.id ?? null })
      .eq("id", 1);
    setGuardando(false);
    if (e) {
      setMsg({ tipo: "error", texto: "No se han podido guardar las franjas." });
      return;
    }
    setGuardado(nuevo);
    fijarAjustesFranjas(nuevo);
    setMsg({ tipo: "ok", texto: "Franjas guardadas: la tienda ya las usa." });
  }

  const campoHora = (id: string, valor: string, poner: (t: string) => void, etiqueta: string) => (
    <TextInput
      nativeID={id}
      value={valor}
      onChangeText={(t) => {
        poner(t);
        setMsg(null);
      }}
      placeholder="00:00"
      maxLength={5}
      inputMode="numeric"
      accessibilityLabel={etiqueta}
      placeholderTextColor="rgba(11,33,56,0.45)"
      style={{ flex: 1, minWidth: 0, minHeight: CAMPO.alto, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, backgroundColor: "#FFFFFF", paddingHorizontal: 12, color: COLORS.text, fontSize: CAMPO.letra, fontWeight: "800", textAlign: "center" }}
    />
  );
  const interruptor = (id: string, texto: string, valor: boolean, poner: (v: boolean) => void) => (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, minHeight: TACTIL.minimo }}>
      <Text style={{ color: COLORS.text, fontWeight: "800", flexShrink: 1 }}>{texto}</Text>
      <Switch
        nativeID={id}
        value={valor}
        onValueChange={(v) => {
          poner(v);
          setMsg(null);
        }}
        accessibilityLabel={texto}
      />
    </View>
  );
  const fila = (titulo: string, desde: React.ReactNode, hasta: React.ReactNode) => (
    <View style={{ gap: 6 }}>
      <Text style={{ color: COLORS.muted, fontWeight: "800", fontSize: TAMANOS.minimo }}>{titulo}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {desde}
        <Text style={{ color: COLORS.muted, fontWeight: "900" }}>a</Text>
        {hasta}
      </View>
    </View>
  );

  return (
    <View nativeID="envios-franjas" style={{ borderRadius: 20, backgroundColor: COLORS.card, padding: compacto ? 14 : 18, gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <Ionicons name="time-outline" size={18} color={COLORS.accent} />
        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>Franjas de entrega el mismo día</Text>
      </View>
      <Text nativeID="envios-franjas-explicacion" style={{ color: COLORS.muted, fontSize: TAMANOS.minimo, lineHeight: 19, textAlign: "center" }}>
        Para la entrega a domicilio en Zaragoza y alrededores y la entrega en mano (Correos no). Al pagar, el cliente elige
        una franja de hoy o del siguiente día de reparto. El margen es hasta cuántos minutos antes de que empiece una franja se
        puede pedir para ella: con {Number.isInteger(margen) ? margen : "—"} minutos, la mañana se pide hasta las {corte(horas[0])} y la tarde hasta
        las {corte(horas[2])}. De lunes a viernes hay las dos franjas.
      </Text>
      {cargando ? (
        <ActivityIndicator color={COLORS.accent} />
      ) : sinTabla ? (
        <Text nativeID="envios-franjas-sin-migracion" style={{ color: COLORS.danger, fontWeight: "800", textAlign: "center", lineHeight: 20 }}>
          Falta aplicar la migración {MIGRACION_FRANJAS}: mientras, la tienda usa 11:00–12:45 y 17:15–19:00, 45 minutos de margen, el
          sábado las dos y el domingo solo la tarde.
        </Text>
      ) : (
        <>
          {fila(
            "Mañana",
            campoHora("envios-franja-manana-desde", b.manana_desde, (t) => setB((x) => ({ ...x, manana_desde: t })), "Mañana, desde"),
            campoHora("envios-franja-manana-hasta", b.manana_hasta, (t) => setB((x) => ({ ...x, manana_hasta: t })), "Mañana, hasta")
          )}
          {fila(
            "Tarde",
            campoHora("envios-franja-tarde-desde", b.tarde_desde, (t) => setB((x) => ({ ...x, tarde_desde: t })), "Tarde, desde"),
            campoHora("envios-franja-tarde-hasta", b.tarde_hasta, (t) => setB((x) => ({ ...x, tarde_hasta: t })), "Tarde, hasta")
          )}
          <View style={{ gap: 6 }}>
            <Text style={{ color: COLORS.muted, fontWeight: "800", fontSize: TAMANOS.minimo }}>Margen de corte (minutos antes de cada franja)</Text>
            <TextInput
              nativeID="envios-franja-margen"
              value={b.margen}
              onChangeText={(t) => {
                setB((x) => ({ ...x, margen: t }));
                setMsg(null);
              }}
              inputMode="numeric"
              maxLength={3}
              accessibilityLabel="Margen de corte en minutos"
              style={{ minHeight: CAMPO.alto, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, backgroundColor: "#FFFFFF", paddingHorizontal: 12, color: COLORS.text, fontSize: CAMPO.letra, fontWeight: "800", textAlign: "center" }}
            />
          </View>
          {interruptor("envios-franja-sabado-manana", "Sábado por la mañana", b.sabado_manana, (v) => setB((x) => ({ ...x, sabado_manana: v })))}
          {interruptor("envios-franja-sabado-tarde", "Sábado por la tarde", b.sabado_tarde, (v) => setB((x) => ({ ...x, sabado_tarde: v })))}
          {interruptor("envios-franja-domingo-manana", "Domingo por la mañana", b.domingo_manana, (v) => setB((x) => ({ ...x, domingo_manana: v })))}
          {interruptor("envios-franja-domingo-tarde", "Domingo por la tarde", b.domingo_tarde, (v) => setB((x) => ({ ...x, domingo_tarde: v })))}
          {error ? (
            <Text nativeID="envios-franjas-error" style={{ color: COLORS.danger, fontWeight: "800", textAlign: "center" }}>
              {error}
            </Text>
          ) : (
            <Text nativeID="envios-franjas-ahora" style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 19, textAlign: "center" }}>
              Ahora el cliente vería: {ahora || "ninguna franja"}
            </Text>
          )}
          <Pressable
            nativeID="envios-franjas-guardar"
            onPress={guardar}
            disabled={!cambiado || guardando}
            accessibilityRole="button"
            style={({ pressed }) => ({
              alignSelf: "center",
              width: "100%",
              maxWidth: 420,
              minHeight: 50,
              borderRadius: 999,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              backgroundColor: COLORS.accent,
              opacity: !cambiado || guardando ? 0.5 : pressed ? 0.88 : 1,
            })}
          >
            {guardando ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="save-outline" size={18} color="#FFFFFF" />}
            <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 15 }}>Guardar franjas</Text>
          </Pressable>
          {msg ? (
            <Text nativeID="envios-franjas-mensaje" style={{ color: msg.tipo === "ok" ? COLORS.success : COLORS.danger, fontWeight: "800", textAlign: "center" }}>
              {msg.texto}
            </Text>
          ) : null}
        </>
      )}
      {uso ? (
        <Text nativeID="envios-franjas-uso" style={{ color: COLORS.muted, fontWeight: "800", fontSize: TAMANOS.minimo, textAlign: "center" }}>
          Pedidos con franja (30 días) · mañana: {uso.manana} · tarde: {uso.tarde}
        </Text>
      ) : null}
    </View>
  );
}
