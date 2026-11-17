/**
 * Archivo: app/comparar.tsx
 * Función: pantalla «Comparar productos», en la dirección /comparar (admite ?ids=a,b,c).
 * Para qué sirve: el cliente ve uno al lado del otro hasta 3 productos (precio, estado, categoría, entrega estimada, revisión y garantía si constan) y los añade a la cesta o los quita.
 * Conectado con: components/CarruselProductosCategoria.tsx (lista de comparados), components/BarraBusqueda.tsx (portadas), components/CabeceraMarca.tsx, components/marca/*, components/ImagenInteligente.tsx, components/PerfilPublico.tsx, lib/supabase.ts (tabla products, perfil del cliente), lib/envio.ts (entrega estimada), lib/analiticaPropia.ts, constants/temaTienda.ts.
 * Utilizado por: Expo Router (dirección /comparar); lo abre BarraComparar (components/CarruselProductosCategoria.tsx, montada en app/_layout.tsx) desde el Catálogo (app/catalogo.tsx) y las fichas (app/producto/[id].tsx).
 * Dependencias: react, react-native, expo-router, @expo/vector-icons.
 * Estado: ACTIVO
 */
/**
 * Notas:
 * Qué hace: «Comparar 2-3 productos» (mejora 8, aprobada por el dueño el 2026-11-14). Pone uno al lado del otro hasta 3
 * productos elegidos con «Comparar» (tarjetas del catálogo y ficha) y enseña, por filas: foto y título, precio (el más
 * bajo, señalado con discreción), estado, categoría, entrega estimada y, SOLO si el dueño lo ha marcado en ese producto,
 * «Revisado por nuestro equipo» y «Garantía de N meses» (products.revisado / garantia_meses; sin marcar, nada). Cada
 * producto con «Añadir a la cesta» (lleva a la cesta con ?add=, que lo añade con su reserva) y «Ver» (su ficha), y
 * «Quitar». Lo que ya no se vende sale como «Ya no está a la venta» y se puede quitar.
 *
 * Enlace compartible: /comparar?ids=a,b,c. Sin ?ids= se usa lo elegido en este dispositivo y se pone en la dirección; con
 * ?ids= (un enlace compartido), lo que se compara en el dispositivo pasa a ser eso. Como mucho 3.
 *
 * Diseño (móvil a 360 px): filas por atributo con los productos en columnas iguales (2 o 3), sin desplazamiento lateral ni
 * nada que ensanche la página; el nombre de cada fila sale una vez. Sin recuadros de adorno: líneas finas entre filas.
 *
 * Datos (cuota de Supabase): una consulta de products («*» con su categoría, solo esos 2-3 ids: así trae revisado y
 * garantia_meses si ya existen, sin errores si no) y sus portadas pequeñas (portadasDeProductos). Quitar no vuelve a
 * pedir nada. La entrega estimada usa el código postal del perfil como la ficha (lib/envio.ts → entregaEstimada).
 *
 * Analítica propia (Administración → Analítica → «Comparador (30 días)»; sin datos de nadie): comparar_abierto (cuántos
 * productos y sus ids, una vez por visita a la página) y comparar_anadir_cesta (id).
 *
 * Conectado con: components/CarruselProductosCategoria.tsx (useComparar, quitarDeComparar, fijarComparados; la barra que trae
 * aquí), components/BarraBusqueda.tsx (portadasDeProductos), lib/supabase.ts (products, filaPerfilCliente), lib/envio.ts,
 * components/EtiquetasCabeceraWeb.tsx (título «Comparar productos»), app/(tabs)/cesta.tsx (?add=) y app/admin/analytics.tsx.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StatusBar, Text, useWindowDimensions, View } from "react-native";
import type { Href } from "expo-router";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import SmartImage from "../components/ImagenInteligente";
import CabeceraMarca from "../components/CabeceraMarca";
import CargaMarca from "../components/marca/CargaMarca";
import MarcaAnimada from "../components/marca/MarcaAnimada";
import { portadasDeProductos } from "../components/BarraBusqueda";
import { COMPARAR_MAX, fijarComparados, quitarDeComparar, useComparar, type ProductoComparar } from "../components/CarruselProductosCategoria";
import { direccionesDeFila } from "../components/PerfilPublico";
import { filaPerfilCliente, supabase } from "../lib/supabase";
import { trackEvent } from "../lib/analiticaPropia";
import { cargarTarifas, entregaEstimada, limpiarCodigoPostal, tipoEntregaPorCodigo, type ZonaEnvio } from "../lib/envio";
import { COLORES_TEXTO, TACTIL, TAMANOS, colorTextoAzul } from "../constants/temaTienda";

const COLORS = {
  bg: "#FFFFFF",
  bg2: "#F4F9FD",
  tile: "#F6FAFD",
  border: "#E3EAF2",
  text: "#0B2138",
  accent: "#1EA7E8",
  verde: "#15803D",
};

type FilaComparar = {
  id: string;
  titulo: string;
  precio: number;
  imagen: string | null;
  estado: string;
  categoria: string | null;
  disponible: boolean;
  soloMano: boolean;
  revisado: boolean;
  garantiaMeses: number | null;
};

// Precio siempre con dos decimales, coma decimal y miles con punto (155,00€ · 1.299,00€).
function fmtEUR(n: number) {
  const v = Number(n);
  const cents = Math.round((Number.isFinite(v) ? v : 0) * 100);
  const [ent, dec] = (Math.abs(cents) / 100).toFixed(2).split(".");
  return `${cents < 0 ? "-" : ""}${ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}€`;
}

// El mismo texto que el estado de la ficha (debajo del título). Sin estado guardado no se inventa ninguno.
function textoEstado(c: unknown): string {
  const v = String(c ?? "").trim().toUpperCase();
  if (v === "NEW") return "Nuevo";
  const nombres: Record<string, string> = { LIKE_NEW: "Como nuevo", GOOD: "Bueno", FAIR: "Regular", PARTS: "Para piezas" };
  return nombres[v] ? `Segunda mano · ${nombres[v]}` : "Segunda mano";
}

/** Los ids de ?ids= (sin repetidos, con forma de id y como mucho 3). null = la dirección no trae ?ids=. */
function idsDeParam(v: unknown): string[] | null {
  const s = Array.isArray(v) ? v.join(",") : typeof v === "string" ? v : null;
  if (s === null) return null;
  const out: string[] = [];
  for (const trozo of s.split(",")) {
    const id = trozo.trim();
    if (/^[0-9A-Za-z-]{1,64}$/.test(id) && !out.includes(id)) out.push(id);
    if (out.length >= COMPARAR_MAX) break;
  }
  return out;
}

/** Los productos pedidos, por id (también los que ya no están: «Ya no está a la venta»). null = no se han podido leer. */
async function cargarFilas(ids: string[], guardados: ProductoComparar[]): Promise<Map<string, FilaComparar> | null> {
  try {
    let res = await supabase.from("products").select("*,category:categories(id,name,slug)").in("id", ids);
    if (res.error) res = await supabase.from("products").select("*").in("id", ids);
    if (res.error || !Array.isArray(res.data)) return null;
    const portadas = await portadasDeProductos(ids).catch(() => new Map<string, string>());
    const filas = new Map<string, FilaComparar>();
    for (const r of res.data as unknown as Record<string, unknown>[]) {
      const id = String(r.id ?? "");
      if (!ids.includes(id)) continue;
      const g = Number(r.garantia_meses);
      const cat = r.category && typeof r.category === "object" ? (r.category as Record<string, unknown>) : null;
      const imagenes = Array.isArray(r.images) ? (r.images as unknown[]).filter((u): u is string => typeof u === "string" && !!u.trim()) : [];
      filas.set(id, {
        id,
        titulo: String(r.title ?? "").trim() || "Producto",
        precio: Number(r.price_eur ?? 0) || 0,
        imagen: portadas.get(id) ?? imagenes[0] ?? null,
        estado: textoEstado(r.condition),
        categoria: typeof cat?.name === "string" && cat.name.trim() ? cat.name.trim() : null,
        disponible: r.status === "PUBLISHED" && r.is_active === true,
        soloMano: r.solo_entrega_mano === true,
        revisado: r.revisado === true,
        garantiaMeses: r.garantia_meses != null && Number.isInteger(g) && g >= 1 && g <= 36 ? g : null,
      });
    }
    // Lo que la base de datos ya no da (retirado o borrado): con lo que se guardó al elegirlo, si lo hay.
    for (const id of ids) {
      if (filas.has(id)) continue;
      const g = guardados.find((x) => x.id === id);
      filas.set(id, {
        id,
        titulo: g?.titulo || "Producto no disponible",
        precio: g?.precio ?? 0,
        imagen: g?.imagen ?? null,
        estado: "",
        categoria: null,
        disponible: false,
        soloMano: false,
        revisado: false,
        garantiaMeses: null,
      });
    }
    return filas;
  } catch {
    return null;
  }
}

function volver() {
  try {
    if (typeof router.canGoBack === "function" && router.canGoBack()) {
      router.back();
      return;
    }
  } catch {
    // sin historial: al catálogo
  }
  router.replace("/catalogo" as Href);
}

export default function CompararScreen() {
  const { width } = useWindowDimensions();
  const ancho = width && width > 0 ? width : 1024;
  const isMobile = ancho < 700;
  const pagePadding = isMobile ? 12 : 16;

  const params = useLocalSearchParams<{ ids?: string }>();
  const idsParam = useMemo(() => idsDeParam(params.ids), [params.ids]);
  const { lista, leido } = useComparar();
  const listaRef = useRef(lista);
  listaRef.current = lista;

  // Sin ?ids=: lo elegido en este dispositivo (y se pone en la dirección, para poder compartirla).
  const ids = useMemo(() => idsParam ?? (leido ? lista.map((p) => p.id) : null), [idsParam, leido, lista]);
  const clave = ids ? ids.join(",") : null;
  useEffect(() => {
    if (idsParam === null && leido && lista.length) router.setParams({ ids: lista.map((p) => p.id).join(",") });
  }, [idsParam, leido, lista]);

  const [filas, setFilas] = useState<Map<string, FilaComparar>>(new Map());
  const filasRef = useRef(filas);
  filasRef.current = filas;
  const [error, setError] = useState(false);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    if (!clave) return;
    const faltan = clave.split(",").filter((id) => !filasRef.current.has(id));
    if (!faltan.length) return;
    let vivo = true;
    setError(false);
    cargarFilas(faltan, listaRef.current).then((m) => {
      if (!vivo) return;
      if (!m) {
        setError(true);
        return;
      }
      setFilas((prev) => new Map([...prev, ...m]));
    });
    return () => {
      vivo = false;
    };
  }, [clave, intento]);

  const columnas = useMemo(() => (ids ?? []).map((id) => filas.get(id)).filter((f): f is FilaComparar => !!f), [ids, filas]);
  const cargando = !!ids && ids.length > 0 && columnas.length < ids.length && !error;

  // Con un enlace (compartido o no), lo que se compara en este dispositivo pasa a ser lo de la página.
  useEffect(() => {
    if (!leido || cargando || !ids) return;
    void fijarComparados(columnas.map((f) => ({ id: f.id, titulo: f.titulo, precio: f.precio, imagen: f.imagen })));
  }, [leido, cargando, ids, columnas]);

  // comparar_abierto: una vez por visita a la página, cuando ya se ven los productos (cuántos y cuáles; solo ids).
  const medido = useRef(false);
  useEffect(() => {
    if (medido.current || cargando || !columnas.length) return;
    medido.current = true;
    void trackEvent("comparar_abierto", "Comparar: comparación abierta", {
      path: "/comparar",
      metadata: { n: columnas.length, ids: columnas.map((f) => f.id) },
    });
  }, [cargando, columnas]);

  // Entrega estimada con el código postal de la dirección predeterminada del perfil (como la ficha), solo con sesión.
  const [cp, setCp] = useState<string | null>(null);
  const [zonas, setZonas] = useState<ZonaEnvio[] | null>(null);
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const { data: s } = await supabase.auth.getSession();
        const uid = s.session?.user?.id;
        if (!uid) return;
        const { data } = await filaPerfilCliente(uid);
        if (!vivo || !data) return;
        const fila = data as Record<string, unknown>;
        const lista2 = direccionesDeFila(fila);
        const pred = lista2?.find((d) => d.predeterminada) ?? lista2?.[0] ?? null;
        const c = limpiarCodigoPostal(pred?.codigoPostal || (typeof fila.codigo_postal === "string" ? fila.codigo_postal : ""));
        if (c.length === 5) {
          setCp(c);
          const z = await cargarTarifas();
          if (vivo) setZonas(z);
        }
      } catch {
        // Sin perfil: se enseñan los dos plazos.
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);
  const tipoEntrega = tipoEntregaPorCodigo(cp, zonas);

  const [aviso, setAviso] = useState<string | null>(null);
  const quitar = (id: string) => {
    quitarDeComparar(id, "comparar");
    router.setParams({ ids: (ids ?? []).filter((x) => x !== id).join(",") });
  };
  const anadirCesta = (id: string) => {
    void trackEvent("comparar_anadir_cesta", "Comparar: añadido a la cesta", { path: "/comparar", metadata: { id } });
    router.push(`/cesta?add=${encodeURIComponent(id)}` as Href);
  };
  const compartir = async () => {
    if (!ids?.length) return;
    const origen = Platform.OS === "web" && typeof window !== "undefined" ? window.location.origin : "https://videojuegoszaragoza.com";
    const url = `${origen}/comparar?ids=${ids.join(",")}`;
    const nav: any = typeof navigator !== "undefined" ? navigator : null;
    try {
      if (nav?.share) {
        await nav.share({ title: "Comparar productos", url });
        return;
      }
      if (nav?.clipboard?.writeText) {
        await nav.clipboard.writeText(url);
        setAviso("Enlace copiado");
        setTimeout(() => setAviso(null), 2500);
      }
    } catch {
      // Compartir cancelado o sin permiso: no pasa nada.
    }
  };

  // Columnas iguales: a 360 px con 3 productos, ≈ 106 px cada una (los textos se parten en líneas, nunca se salen).
  const hueco = isMobile ? 8 : 16;
  const anchoTabla = Math.min(ancho, 1000) - 2 * pagePadding;
  const anchoColumna = columnas.length ? (anchoTabla - hueco * (columnas.length - 1)) / columnas.length : anchoTabla;
  const estrecha = anchoColumna < 150;

  // Precio más bajo (solo entre lo que se vende, con al menos 2 precios distintos).
  const masBarato = useMemo(() => {
    const precios = columnas.filter((f) => f.disponible && f.precio > 0).map((f) => f.precio);
    if (precios.length < 2) return null;
    const min = Math.min(...precios);
    return min < Math.max(...precios) ? min : null;
  }, [columnas]);
  const hayConfianza = columnas.some((f) => f.disponible && (f.revisado || f.garantiaMeses));
  // Con 2 o más que se envían y ninguno «solo en mano», la entrega es la misma para todos: se enseña una vez.
  const disponibles = columnas.filter((f) => f.disponible);
  const entregaUnica = disponibles.length >= 2 && disponibles.every((f) => !f.soloMano) ? disponibles[0] : null;
  const notaEntrega = cp && tipoEntrega !== "sin_cp" ? `Código postal ${cp} (de tu perfil)` : null;

  const etiqueta = { color: COLORES_TEXTO.secundario, fontWeight: "800", fontSize: TAMANOS.minimo, textAlign: "center" } as const;
  const valor = { color: COLORES_TEXTO.texto, fontWeight: "800", fontSize: estrecha ? TAMANOS.minimo : 14.5, lineHeight: estrecha ? 17 : 20, textAlign: "center" } as const;

  const filaTabla = (id: string, nombre: string | null, celda: (f: FilaComparar) => React.ReactNode, nota?: string | null) => (
    <View nativeID={`comparar-fila-${id}`} style={{ borderTopWidth: 1, borderTopColor: COLORS.border, paddingVertical: 12, gap: 8 }}>
      {nombre ? <Text style={etiqueta}>{nombre}</Text> : null}
      {nota ? <Text style={{ ...etiqueta, fontWeight: "700", marginTop: -4 }}>{nota}</Text> : null}
      <View style={{ flexDirection: "row", gap: hueco }}>
        {columnas.map((f) => (
          <View key={f.id} nativeID={`comparar-${id}-${f.id}`} style={{ flex: 1, minWidth: 0, alignItems: "center", gap: 6 }}>
            {celda(f)}
          </View>
        ))}
      </View>
    </View>
  );

  const entregaDe = (f: FilaComparar): React.ReactNode => {
    if (!f.disponible) return null;
    if (f.soloMano) return <Text style={valor}>Solo entrega en mano en Zaragoza o Cuarte de Huerva</Text>;
    if (tipoEntrega === "sin_cp") {
      const local = (entregaEstimada("mismo_dia").titulo ?? "").replace(/^Llega/, "llega");
      const resto = (entregaEstimada("peninsula").titulo ?? "").replace(/^Llega/, "llega");
      return (
        <>
          <Text style={valor}>Zaragoza y Cuarte: {local}</Text>
          <Text style={{ ...valor, fontWeight: "700", color: COLORES_TEXTO.secundario }}>Resto de España: {resto}</Text>
        </>
      );
    }
    const e = entregaEstimada(tipoEntrega);
    return <Text style={valor}>{e.titulo ?? e.detalle}</Text>;
  };

  const botonSecundario = (id: string, texto: string, icono: keyof typeof Ionicons.glyphMap, onPress: () => void, label: string) => (
    <Pressable
      nativeID={id}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        minHeight: TACTIL.minimo,
        alignSelf: "stretch",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
        paddingHorizontal: 6,
        borderRadius: 999,
        borderWidth: 1.5,
        borderColor: COLORS.accent,
        backgroundColor: "#FFFFFF",
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Ionicons name={icono} size={16} color={COLORES_TEXTO.azulTexto} />
      <Text style={{ color: COLORES_TEXTO.azulTexto, fontWeight: "900", fontSize: 14 }}>{texto}</Text>
    </Pressable>
  );

  let cuerpo: React.ReactNode;
  if (!ids || cargando) {
    cuerpo = (
      <View style={{ paddingVertical: 40, alignItems: "center" }}>
        <CargaMarca texto="Cargando la comparación…" />
      </View>
    );
  } else if (error) {
    cuerpo = (
      <View nativeID="comparar-error" style={{ paddingVertical: 24, alignItems: "center", gap: 12 }}>
        <Text style={{ color: COLORES_TEXTO.texto, fontWeight: "900", fontSize: TAMANOS.cuerpo, textAlign: "center" }}>No se han podido cargar los productos.</Text>
        <Pressable
          onPress={() => setIntento((n) => n + 1)}
          accessibilityRole="button"
          style={({ pressed }) => ({ minHeight: TACTIL.minimo, paddingHorizontal: 22, borderRadius: 999, backgroundColor: COLORS.accent, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.85 : 1 })}
        >
          <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: TAMANOS.cuerpo }}>Reintentar</Text>
        </Pressable>
      </View>
    );
  } else if (!columnas.length) {
    cuerpo = (
      <View nativeID="comparar-vacio" style={{ paddingVertical: 16, alignItems: "center", gap: 12 }}>
        <MarcaAnimada cual="tienda" ancho={120} />
        <Text style={{ color: COLORES_TEXTO.texto, fontWeight: "900", fontSize: TAMANOS.destacado, textAlign: "center" }}>Aún no has elegido productos</Text>
        <Text style={{ color: COLORES_TEXTO.secundario, fontSize: TAMANOS.minimo + 1, lineHeight: 20, textAlign: "center", maxWidth: 420 }}>
          En el catálogo o en la ficha de un producto, toca «Comparar» en 2 o 3 productos.
        </Text>
        <Pressable
          nativeID="comparar-ir-catalogo"
          onPress={() => router.push("/catalogo" as Href)}
          accessibilityRole="button"
          style={({ pressed }) => ({ minHeight: TACTIL.minimo, paddingHorizontal: 22, borderRadius: 999, backgroundColor: COLORS.accent, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.85 : 1 })}
        >
          <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: TAMANOS.cuerpo }}>Ir al catálogo</Text>
        </Pressable>
      </View>
    );
  } else {
    const altoFoto = isMobile ? (estrecha ? 96 : 130) : 190;
    cuerpo = (
      <View nativeID="comparar-tabla" style={{ width: "100%" }}>
        {/* Foto, título (abre la ficha) y «Quitar». */}
        <View nativeID="comparar-cabecera" style={{ flexDirection: "row", gap: hueco, paddingBottom: 4 }}>
          {columnas.map((f) => (
            // Las fichas de una fila miden lo mismo (flexGrow) y los «Quitar» quedan a la misma altura.
            <View key={f.id} nativeID={`comparar-col-${f.id}`} style={{ flex: 1, minWidth: 0, alignItems: "center", gap: 4 }}>
              <Pressable
                onPress={() => router.push(`/producto/${f.id}` as Href)}
                accessibilityRole="link"
                accessibilityLabel={f.titulo}
                style={({ pressed }) => ({ width: "100%", flexGrow: 1, alignItems: "center", gap: 8, borderRadius: 14, backgroundColor: COLORS.tile, padding: estrecha ? 6 : 10, opacity: pressed ? 0.9 : 1 })}
              >
                <View style={{ width: "100%", height: altoFoto, borderRadius: 10, overflow: "hidden", backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", opacity: f.disponible ? 1 : 0.5 }}>
                  {f.imagen ? (
                    <SmartImage
                      uri={f.imagen}
                      alt={f.titulo}
                      ancho={Math.round(Math.min(400, anchoColumna * 2))}
                      priority="high"
                      contentFit="contain"
                      style={{ width: "100%", height: "100%" }}
                    />
                  ) : (
                    <Ionicons name="game-controller-outline" size={28} color={COLORES_TEXTO.secundario} />
                  )}
                </View>
                <Text numberOfLines={4} style={{ color: COLORES_TEXTO.texto, fontWeight: "800", fontSize: estrecha ? TAMANOS.minimo : 14.5, lineHeight: estrecha ? 17 : 19, textAlign: "center" }}>
                  {f.titulo}
                </Text>
              </Pressable>
              <Pressable
                nativeID={`comparar-quitar-${f.id}`}
                onPress={() => quitar(f.id)}
                accessibilityRole="button"
                accessibilityLabel={`Quitar ${f.titulo} de la comparación`}
                style={({ pressed }) => ({ minHeight: TACTIL.minimo, minWidth: TACTIL.minimo, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingHorizontal: 8, opacity: pressed ? 0.6 : 1 })}
              >
                <Ionicons name="close-circle-outline" size={17} color={COLORES_TEXTO.secundario} />
                <Text style={{ color: COLORES_TEXTO.secundario, fontWeight: "800", fontSize: TAMANOS.minimo }}>Quitar</Text>
              </Pressable>
            </View>
          ))}
        </View>

        {filaTabla("precio", "Precio", (f) =>
          f.disponible ? (
            <>
              <Text style={{ color: colorTextoAzul(estrecha ? 16 : 20), fontWeight: "900", fontSize: estrecha ? 16 : 20, textAlign: "center" }}>{fmtEUR(f.precio)}</Text>
              {masBarato !== null && f.precio === masBarato ? (
                <View nativeID={`comparar-mas-barato-${f.id}`} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Ionicons name="pricetag-outline" size={13} color={COLORES_TEXTO.azulTexto} />
                  <Text style={{ color: COLORES_TEXTO.azulTexto, fontWeight: "800", fontSize: TAMANOS.minimo }}>Precio más bajo</Text>
                </View>
              ) : null}
            </>
          ) : (
            <Text nativeID={`comparar-retirado-${f.id}`} style={{ ...valor, color: "#B91C1C" }}>
              Ya no está a la venta
            </Text>
          )
        )}
        {filaTabla("estado", "Estado", (f) => (f.disponible && f.estado ? <Text style={valor}>{f.estado}</Text> : null))}
        {filaTabla("categoria", "Categoría", (f) => (f.disponible && f.categoria ? <Text style={valor}>{f.categoria}</Text> : null))}
        {/* La entrega es la misma para todo lo que se envía: si lo es para todos, se dice una vez y no en cada columna. */}
        {entregaUnica ? (
          <View nativeID="comparar-fila-entrega" style={{ borderTopWidth: 1, borderTopColor: COLORS.border, paddingVertical: 12, gap: 6, alignItems: "center" }}>
            <Text style={etiqueta}>Entrega estimada</Text>
            {notaEntrega ? <Text style={{ ...etiqueta, fontWeight: "700", marginTop: -2 }}>{notaEntrega}</Text> : null}
            <View nativeID="comparar-entrega-todos" style={{ alignItems: "center", gap: 2 }}>
              {entregaDe(entregaUnica)}
            </View>
          </View>
        ) : (
          filaTabla("entrega", "Entrega estimada", entregaDe, notaEntrega)
        )}
        {/* Revisión y garantía: la fila solo sale si el dueño lo ha marcado en alguno; en los demás, nada. */}
        {hayConfianza
          ? filaTabla("confianza", "Revisión y garantía", (f) =>
              f.disponible ? (
                <>
                  {f.revisado ? (
                    <View nativeID={`comparar-revisado-${f.id}`} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, flexWrap: "wrap" }}>
                      <Ionicons name="checkmark-circle" size={15} color={COLORS.verde} />
                      <Text style={{ ...valor, flexShrink: 1 }}>Revisado por nuestro equipo</Text>
                    </View>
                  ) : null}
                  {f.garantiaMeses ? (
                    <View nativeID={`comparar-garantia-${f.id}`} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, flexWrap: "wrap" }}>
                      <Ionicons name="shield-checkmark-outline" size={15} color={COLORS.verde} />
                      <Text style={{ ...valor, flexShrink: 1 }}>
                        Garantía de {f.garantiaMeses} {f.garantiaMeses === 1 ? "mes" : "meses"}
                      </Text>
                    </View>
                  ) : null}
                </>
              ) : null
            )
          : null}
        {filaTabla("acciones", null, (f) =>
          f.disponible ? (
            <>
              <Pressable
                nativeID={`comparar-anadir-${f.id}`}
                onPress={() => anadirCesta(f.id)}
                accessibilityRole="button"
                accessibilityLabel={`Añadir ${f.titulo} a la cesta`}
                style={({ pressed }) => ({
                  minHeight: TACTIL.minimo,
                  alignSelf: "stretch",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                  paddingHorizontal: 6,
                  borderRadius: 999,
                  backgroundColor: COLORS.accent,
                  opacity: pressed ? 0.88 : 1,
                })}
              >
                <Ionicons name="bag-add-outline" size={16} color="#FFFFFF" />
                <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 14 }}>{estrecha ? "Añadir" : "Añadir a la cesta"}</Text>
              </Pressable>
              {botonSecundario(`comparar-ver-${f.id}`, "Ver", "eye-outline", () => router.push(`/producto/${f.id}` as Href), `Ver ${f.titulo}`)}
            </>
          ) : null
        )}
      </View>
    );
  }

  const n = columnas.length;
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />
      <View style={{ backgroundColor: COLORS.bg2, paddingHorizontal: pagePadding, paddingTop: isMobile ? 12 : 14, paddingBottom: isMobile ? 12 : 14, alignItems: "center" }}>
        <View style={{ width: "100%", maxWidth: 1000 }}>
          <CabeceraMarca onBack={volver} />
        </View>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: pagePadding, paddingBottom: 40, alignItems: "center" }}>
        <View style={{ width: "100%", maxWidth: 1000, gap: 14 }}>
          <Text
            accessibilityRole="header"
            {...({ "aria-level": 1 } as object)}
            style={{ color: COLORES_TEXTO.texto, fontSize: isMobile ? 24 : 28, fontWeight: "900", lineHeight: isMobile ? 30 : 32, textAlign: "center" }}
          >
            Comparar productos
          </Text>
          {cuerpo}
          {n > 0 && !cargando && !error ? (
            <View style={{ alignItems: "center", gap: 10 }}>
              {n === 1 ? (
                <Text nativeID="comparar-pista" style={{ color: COLORES_TEXTO.secundario, fontSize: TAMANOS.minimo + 1, textAlign: "center" }}>
                  Añade otro producto para compararlo.
                </Text>
              ) : null}
              <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 10, width: "100%", maxWidth: 520 }}>
                {n < COMPARAR_MAX ? (
                  <View style={{ flexGrow: 1, flexBasis: 200 }}>
                    {botonSecundario("comparar-anadir-otro", "Añadir otro producto", "add-circle-outline", () => router.push("/catalogo" as Href), "Añadir otro producto")}
                  </View>
                ) : null}
                <View style={{ flexGrow: 1, flexBasis: 200 }}>
                  {botonSecundario("comparar-compartir", "Compartir comparación", "share-social-outline", compartir, "Compartir comparación")}
                </View>
              </View>
              {aviso ? (
                <Text nativeID="comparar-aviso" style={{ color: COLORES_TEXTO.secundario, fontSize: TAMANOS.minimo, textAlign: "center" }}>
                  {aviso}
                </Text>
              ) : null}
            </View>
          ) : null}
          <View style={{ alignItems: "center", paddingTop: 8 }}>
            <Pressable
              onPress={volver}
              accessibilityRole="button"
              accessibilityLabel="Volver atrás"
              style={({ pressed }) => ({
                width: "100%",
                maxWidth: 320,
                minHeight: 52,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                borderRadius: 999,
                borderWidth: 1.5,
                borderColor: COLORS.accent,
                backgroundColor: "#FFFFFF",
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Ionicons name="chevron-back" size={20} color={COLORS.accent} />
              <Text style={{ color: colorTextoAzul(16), fontWeight: "900", fontSize: 16 }}>Volver atrás</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
