/**
 * Archivo: components/blue/PiezasBlue.tsx
 * Función: piezas que se ven de Blue (el asistente flotante): la tarjeta de consejo, los botones de su panel, el aviso
 *          del selector de secciones, y los iconos, títulos, filas y avisos de su panel.
 * Para qué sirve: que Blue (components/AsistenteBlue.tsx) y su guía usen las mismas piezas sin copiarlas. Se separó de
 *          components/AsistenteBlue.tsx en la tanda 6 de «ordenar el proyecto» (2026-11-18), sin cambiar nada.
 * Conectado con: components/blue/DatosBlue.tsx y components/blue/AyudasBlue.tsx.
 * Utilizado por: components/AsistenteBlue.tsx y components/blue/*.
 * Dependencias: react, react-native, @expo/vector-icons.
 * Estado: ACTIVO
 */
import React, { useEffect, useRef, useState } from "react";
import { Animated, Dimensions, Easing, Platform, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import MarcaAnimada from "../marca/MarcaAnimada";
import { COLORES_TEXTO, colorTextoAzul, TACTIL, TAMANOS } from "../../constants/temaTienda";
import { COLORS, CONSEJO_VISIBLE_MS, CRISTAL, ContenidoConsejo, MomentoBlue, TEXTO_CRISTAL, sitioConsejo } from "./DatosBlue";
import { USA_NATIVO, limitar } from "./AyudasBlue";

// Tarjeta del consejo de un primer momento (mejora 12): discreta, en cristal como los mensajes de Blue, con su X de 44 px,
// el botón del consejo si lo tiene («Ir a pagar», «Ver Mis pedidos») con «Ahora no», y «No volver a mostrar consejos».
// Nunca tapa «Comprar ya» / «Añadir a la cesta», «Ir a pagar» ni la barra de comparar (sitioConsejo): si no hay sitio
// libre, se esconde hasta que lo haya. Se cierra sola a los 20 s a la vista.
export function ConsejoBlue({
  detalle,
  momento,
  oculto,
  alturaBarra,
  onSeguir,
  onCerrar,
  onSolo,
  onApagar,
}: {
  detalle: ContenidoConsejo;
  momento: MomentoBlue;
  oculto: boolean;
  alturaBarra: number;
  onSeguir: () => void;
  onCerrar: () => void;
  onSolo: () => void;
  onApagar: () => void;
}) {
  const web = Platform.OS === "web";
  const [alto, setAlto] = useState(0);
  const [top, setTop] = useState<number | null>(web ? null : 0);
  useEffect(() => {
    if (!web || typeof document === "undefined") return;
    const mirar = () => setTop(sitioConsejo(alto || 180)?.top ?? null);
    mirar();
    const t = setInterval(mirar, 600);
    document.addEventListener("scroll", mirar, { capture: true, passive: true });
    window.addEventListener("resize", mirar);
    return () => {
      clearInterval(t);
      document.removeEventListener("scroll", mirar, { capture: true });
      window.removeEventListener("resize", mirar);
    };
  }, [web, alto, alturaBarra]);
  const visible = !oculto && top !== null;
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(onSolo, CONSEJO_VISIBLE_MS);
    return () => clearTimeout(t);
  }, [visible, onSolo]);
  // Si en un minuto no ha encontrado sitio libre, se retira: no deja a Blue sin turno en esa pantalla.
  useEffect(() => {
    const t = setTimeout(onSolo, 60000);
    return () => clearTimeout(t);
  }, [onSolo]);
  const boton = { minHeight: TACTIL.minimo, minWidth: TACTIL.minimo, alignItems: "center" as const, justifyContent: "center" as const };
  return (
    <View
      nativeID="blue-consejo"
      pointerEvents="box-none"
      style={{
        position: (web ? "fixed" : "absolute") as "absolute",
        left: 16,
        right: 16,
        ...(web ? { top: top ?? 0 } : { bottom: 90 }),
        alignItems: "center",
        zIndex: 100000,
        elevation: 21,
        opacity: visible ? 1 : 0,
      }}
    >
      <View
        nativeID={`blue-consejo-${momento}`}
        pointerEvents={visible ? "auto" : "none"}
        accessibilityRole="alert"
        onLayout={(e) => setAlto(Math.round(e.nativeEvent.layout.height))}
        style={{ ...CRISTAL, backgroundColor: "rgba(255,255,255,0.94)", width: "100%", maxWidth: 360, paddingLeft: 14, paddingVertical: 6, paddingRight: 2, gap: 4 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons name="sparkles-outline" size={18} color={COLORS.accent} />
          <Text nativeID="blue-consejo-titulo" style={{ ...TEXTO_CRISTAL, fontWeight: "900", fontSize: 15, flex: 1 }}>
            {detalle.titulo}
          </Text>
          <Pressable nativeID="blue-consejo-cerrar" onPress={onCerrar} accessibilityRole="button" accessibilityLabel="Cerrar el consejo" style={boton}>
            <Ionicons name="close" size={20} color={COLORS.muted} />
          </Pressable>
        </View>
        {detalle.texto ? (
          <Text nativeID="blue-consejo-texto" style={{ ...TEXTO_CRISTAL, fontSize: 14, lineHeight: 20, fontWeight: "600", paddingRight: 12 }}>
            {detalle.texto}
          </Text>
        ) : null}
        {detalle.pasos ? (
          <View nativeID="blue-consejo-pasos" style={{ gap: 6, paddingRight: 12 }}>
            {detalle.pasos.map((p, i) => (
              <View key={p} nativeID={`blue-consejo-paso-${i + 1}`} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.accentSoft, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: colorTextoAzul(TAMANOS.minimo), fontWeight: "900", fontSize: TAMANOS.minimo }}>{i + 1}</Text>
                </View>
                <Text style={{ ...TEXTO_CRISTAL, fontSize: 14, fontWeight: "700", flex: 1 }}>{p}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {detalle.accion ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingRight: 12, marginTop: 2 }}>
            <Pressable
              nativeID="blue-consejo-seguir"
              onPress={onSeguir}
              accessibilityRole="button"
              style={{ ...boton, paddingHorizontal: 18, borderRadius: 999, backgroundColor: COLORS.accent, flexDirection: "row", gap: 6 }}
            >
              <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 15 }}>{detalle.accion.texto}</Text>
              <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
            </Pressable>
            <Pressable nativeID="blue-consejo-ahora-no" onPress={onCerrar} accessibilityRole="button" style={{ ...boton, paddingHorizontal: 10 }}>
              <Text style={{ color: COLORS.muted, fontWeight: "800", fontSize: 14 }}>Ahora no</Text>
            </Pressable>
          </View>
        ) : null}
        <Pressable nativeID="blue-consejo-apagar" onPress={onApagar} accessibilityRole="button" style={{ ...boton, alignSelf: "flex-start" }}>
          <Text style={{ color: COLORS.muted, fontWeight: "700", fontSize: TAMANOS.minimo, textDecorationLine: "underline" }}>No volver a mostrar consejos</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function BotonPanel({
  icono,
  texto,
  principal,
  onPress,
}: {
  icono: React.ComponentProps<typeof Ionicons>["name"];
  texto: string;
  principal?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      // Que un lector de pantalla lo anuncie como botón (con su texto).
      accessibilityRole="button"
      style={({ pressed }) => ({
        opacity: pressed ? 0.88 : 1,
        minHeight: 48,
        borderRadius: 999,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        borderWidth: principal ? 0 : 1.5,
        borderColor: COLORS.accent,
        backgroundColor: principal ? COLORS.accentDark : COLORS.bg,
      })}
    >
      <Ionicons name={icono} size={17} color={principal ? "#FFFFFF" : COLORS.accentDark} />
      <Text style={{ color: principal ? "#FFFFFF" : COLORS.accentDark, fontWeight: "900", fontSize: 14.5 }}>{texto}</Text>
    </Pressable>
  );
}

// --- Aviso de Blue en el Foro --------------------------------------------------------------
// Señala el botón azul del selector de pestañas (data-testid "selector-pestanas", en
// app/(tabs)/chat-global.tsx) con un aro y una flecha, y explica qué hace y que las pestañas
// se pueden ordenar manteniendo pulsada una y arrastrándola. No bloquea nada: solo se cierra con
// «Entendido» (o a los 20 s).
export function AvisoSelector({ onCerrar }: { onCerrar: () => void }) {
  const [caja, setCaja] = useState<Caja | null>(null);
  const { width, height } = Dimensions.get("window");
  const latido = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const medir = () => setCaja(medirObjetivo(['[data-testid="selector-pestanas"]']));
    const t1 = setTimeout(medir, 200);
    const t2 = setTimeout(medir, 900);
    const t3 = setTimeout(onCerrar, 20000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [onCerrar]);

  useEffect(() => {
    const bucle = Animated.loop(
      Animated.sequence([
        Animated.timing(latido, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: USA_NATIVO }),
        Animated.timing(latido, { toValue: 0, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: USA_NATIVO }),
      ])
    );
    bucle.start();
    return () => bucle.stop();
  }, [latido]);

  // Sin el botón a la vista no hay nada que señalar.
  if (!caja) return null;
  // Mensaje alargado, como los de Blue flotante (no una tarjeta gorda).
  const ancho = Math.min(width - 24, 340);
  const bote = latido.interpolate({ inputRange: [0, 1], outputRange: [0, 7] });
  const escala = latido.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const flechaX = limitar(caja.x + caja.w / 2 - 16, 8, width - 40);

  return (
    <View pointerEvents="box-none" style={{ position: (Platform.OS === "web" ? "fixed" : "absolute") as "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 99999 }}>
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: caja.x - 6,
          top: caja.y - 6,
          width: caja.w + 12,
          height: caja.h + 12,
          borderRadius: (caja.h + 12) / 2,
          borderWidth: 3,
          borderColor: COLORS.accent,
          transform: [{ scale: escala }],
        }}
      />
      <Animated.View pointerEvents="none" style={{ position: "absolute", left: flechaX, top: caja.y - 46, transform: [{ translateY: bote }] }}>
        <Ionicons name="arrow-down-circle" size={32} color={COLORS.accent} />
      </Animated.View>
      {/* Mensaje de Blue: Blue pequeño a la izquierda y el texto en un párrafo alargado; al tocarlo
          se cierra. Sale una sola vez por dispositivo. */}
      <Pressable
        onPress={onCerrar}
        accessibilityRole="button"
        accessibilityLabel="Entendido"
        style={[
          CRISTAL,
          {
            position: "absolute",
            right: 12,
            bottom: Math.max(12, height - caja.y + 54),
            width: ancho,
            backgroundColor: "rgba(255,255,255,0.94)",
            paddingVertical: 8,
            paddingHorizontal: 10,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          },
        ]}
      >
        <MarcaAnimada cual="carga" ancho={44} tocable={false} />
        <Text style={[TEXTO_CRISTAL, { flex: 1, fontWeight: "800", fontSize: 13, lineHeight: 18 }]}>
          {/* Texto azul de 13 px: azul oscuro legible (COLORES_TEXTO.azulTexto, regla del azul). */}
          <Text style={{ color: COLORES_TEXTO.azulTexto, fontWeight: "900" }}>Blue · </Text>
          Toca el botón azul para cambiar de pestaña. Para ordenarlas, mantén pulsada una y arrástrala.
          <Text style={{ color: COLORES_TEXTO.azulTexto, fontWeight: "900" }}>  Entendido ›</Text>
        </Text>
      </Pressable>
    </View>
  );
}

export type Caja = { x: number; y: number; w: number; h: number };

// Caja en pantalla de los elementos visibles que cumplen los selectores (unión si son varios).
export function medirObjetivo(selectores?: string[]): Caja | null {
  if (!selectores?.length || Platform.OS !== "web" || typeof document === "undefined") return null;
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const sel of selectores) {
    let encontrados: Element[] = [];
    try {
      encontrados = Array.from(document.querySelectorAll(sel));
    } catch {
      // un selector que este navegador no entiende (p. ej. «:has» en uno muy antiguo): sin recuadro, no se rompe la guía
    }
    for (const el of encontrados) {
      const r = el.getBoundingClientRect();
      // Solo lo que se ve (las pantallas de otras pestañas también existen, ocultas).
      if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > window.innerHeight) continue;
      x1 = Math.min(x1, r.left);
      y1 = Math.min(y1, r.top);
      x2 = Math.max(x2, r.right);
      y2 = Math.max(y2, r.bottom);
    }
  }
  return Number.isFinite(x1) ? { x: x1, y: y1, w: x2 - x1, h: y2 - y1 } : null;
}

// --- Panel de Blue, pestaña «Noticias y avisos»: filas con icono (más imagen y menos letras) -------------------------

// Círculo con el icono de una fila.
export function IconoCirculoBlue({ icono }: { icono: React.ComponentProps<typeof Ionicons>["name"] }) {
  return (
    <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.accentSoft, alignItems: "center", justifyContent: "center" }}>
      <Ionicons name={icono} size={18} color={COLORS.accent} />
    </View>
  );
}

// Título pequeño de cada apartado de la pestaña («Avisos», «Noticias», «Mis avisos»).
export function TituloSeccionBlue({ texto }: { texto: string }) {
  return (
    <Text accessibilityRole="header" style={{ color: COLORS.muted, fontSize: 12, fontWeight: "900", letterSpacing: 0.6, marginTop: 12, marginBottom: 2 }}>
      {texto.toUpperCase()}
    </Text>
  );
}

// Fila que solo informa (no se toca): icono y texto.
export function FilaBlue({ icono, titulo, apagada }: { icono: React.ComponentProps<typeof Ionicons>["name"]; titulo: string; apagada?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48, paddingVertical: 4 }}>
      <IconoCirculoBlue icono={icono} />
      <Text style={{ color: apagada ? COLORS.muted : COLORS.text, fontWeight: apagada ? "600" : "700", lineHeight: 20, flex: 1 }}>{titulo}</Text>
    </View>
  );
}

// Fila que se toca (≥ 48 px de alto): icono, aviso y una flecha; toda la fila es el botón.
export function Aviso({
  icono = "notifications-outline",
  titulo,
  detalle,
  accion,
  onPress,
}: {
  icono?: React.ComponentProps<typeof Ionicons>["name"];
  titulo: string;
  detalle?: string;
  accion: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${titulo}. ${accion}`}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingVertical: 6, opacity: pressed ? 0.7 : 1 })}
    >
      <IconoCirculoBlue icono={icono} />
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={{ color: COLORS.text, fontWeight: "800", lineHeight: 20 }}>{titulo}</Text>
        {detalle ? <Text style={{ color: COLORS.muted, fontSize: 12, lineHeight: 16 }}>{detalle}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={COLORS.accent} />
    </Pressable>
  );
}
