// components/admin/PanelUI.tsx
/**
 * Qué hace: las piezas visuales comunes del panel de Administración con el diseño de «Usuarios y participación»
 * (app/admin/users.tsx) y de Pedidos (app/admin/pedidos.tsx): cifras en tarjetas que filtran, buscador de 16 px,
 * pastillas de filtro de 44 px con su recuento (en el móvil, en una fila deslizable), secciones con icono y título,
 * filas compactas con su etiqueta de color, bloques del detalle y acciones de texto con icono.
 *
 * Tamaños (constants/theme.ts): ninguna letra de menos de 13 px, todo lo que se toca de 44 px y a 8 px de lo de al lado,
 * campos de 16 px y 48 de alto; grises desde COLORES_TEXTO.secundario y el azul de texto (#0A78B4) en la letra azul de
 * menos de 17 px.
 *
 * Conectado con: app/admin/categories.tsx, app/admin/services.tsx y app/admin/envios.tsx (rediseño del 2026-11-16,
 * prueba PANRED1 de pruebas/perfil-datos.mjs) y app/admin/products.tsx, app/admin/reservas.tsx y app/admin/escaparate.tsx
 * (tanda 2, prueba PANRED2; de ella son EtiquetaFila y Miniatura) y app/admin/chats.tsx, app/admin/cotizaciones.tsx y
 * app/admin/inventario.tsx (tanda 3, prueba PANRED3; de ella son FilaCifras, FilaLista y DetalleFila) y app/admin/blog.tsx,
 * app/admin/flash-news.tsx y app/admin/policies.tsx (tanda 4, prueba PANRED4; de ella son BotonesFila y fechaPanel) y
 * app/admin/index.tsx, app/admin/aprendizajes.tsx, app/admin/conocimiento.tsx, app/admin/auditorias.tsx,
 * app/admin/marca-seo.tsx, app/admin/redes-sociales.tsx y app/admin/analytics.tsx (tanda 5, prueba PANRED5, con las piezas
 * de siempre). app/admin/pedidos.tsx tiene sus propias copias de las mismas piezas (mismo aspecto).
 */
import React from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CAMPO, COLORES_TEXTO, TACTIL, TAMANOS } from "../../constants/theme";

export type IoniconName = React.ComponentProps<typeof Ionicons>["name"];
export type Ancho = number | `${number}%`;

// Los mismos colores que Usuarios y Pedidos.
export const PANEL = {
  bg: "#FFFFFF",
  bg2: "#F4F9FD",
  card: "#F6FAFD",
  border: "#E3EAF2",
  text: COLORES_TEXTO.texto,
  muted: COLORES_TEXTO.secundario,
  accent: COLORES_TEXTO.azulMarca,
  accentDark: COLORES_TEXTO.azulTexto,
  accent2: "#EAF6FD",
  accentBorder: "#BEE6FA",
  success: "#15803D",
  danger: "#B91C1C",
  dangerBg: "#FFE4E6",
  warning: "#92400E",
  gold: "#B8860B",
};

// Etiquetas de estado: texto oscuro sobre fondo claro (4,5:1 o más), como en Pedidos.
export const TONOS = {
  amarillo: { color: "#92400E", fondo: "#FEF3C7" },
  verde: { color: "#166534", fondo: "#DCFCE7" },
  azul: { color: COLORES_TEXTO.azulTexto, fondo: "#E0F2FE" },
  indigo: { color: "#3730A3", fondo: "#E0E7FF" },
  turquesa: { color: "#115E59", fondo: "#CCFBF1" },
  gris: { color: COLORES_TEXTO.secundario, fondo: "#EEF2F6" },
  rojo: { color: "#B91C1C", fondo: "#FFE4E6" },
} as const;
export type Tono = keyof typeof TONOS;

// Una etiqueta de estado de color (cápsula pequeña de la fila).
export function EtiquetaColor({ texto, tono, nativeID }: { texto: string; tono: Tono; nativeID?: string }) {
  const t = TONOS[tono];
  return (
    <View nativeID={nativeID} style={{ borderRadius: 999, backgroundColor: t.fondo, paddingHorizontal: 9, paddingVertical: 2, alignSelf: "flex-start" }}>
      <Text style={{ color: t.color, fontWeight: "900", fontSize: TAMANOS.minimo, lineHeight: 18 }}>{texto}</Text>
    </View>
  );
}

// Un filtro (o un desplegable, con su flecha). 44 px de alto.
export function Chip({
  label,
  onPress,
  activo,
  abierto,
  desplegable,
  nativeID,
}: {
  label: string;
  onPress: () => void;
  activo?: boolean;
  abierto?: boolean;
  desplegable?: boolean;
  nativeID?: string;
}) {
  return (
    <Pressable
      nativeID={nativeID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!activo, expanded: desplegable ? !!abierto : undefined }}
      {...(desplegable ? ({ "aria-expanded": !!abierto } as object) : null)}
      style={({ pressed }) => ({
        minHeight: TACTIL.minimo,
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 14,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: activo || abierto ? PANEL.accent : PANEL.border,
        backgroundColor: activo ? PANEL.accent2 : PANEL.bg,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text style={{ color: PANEL.text, fontWeight: activo ? "900" : "800", fontSize: TAMANOS.minimo }}>{label}</Text>
      {desplegable ? <Ionicons name={abierto ? "chevron-up" : "chevron-down"} size={16} color={PANEL.text} /> : null}
    </Pressable>
  );
}

// Fila de pastillas: en el móvil, deslizable de lado a lado (sin ensanchar la página); en el ordenador, en varias líneas.
export function FilaPastillas({ isMobile, nativeID, children }: { isMobile: boolean; nativeID?: string; children: React.ReactNode }) {
  const fila = (
    <View nativeID={nativeID} style={{ flexDirection: "row", flexWrap: isMobile ? "nowrap" : "wrap", gap: TACTIL.separacion }}>
      {children}
    </View>
  );
  if (!isMobile) return fila;
  return (
    <View style={{ marginHorizontal: -16 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
        {fila}
      </ScrollView>
    </View>
  );
}

// El nombre de una fila de pastillas («Fase», «En la tienda»…), delante de ellas y a su misma altura (44 px), para poder
// tener varias filas sin títulos aparte (Productos, rediseño PANRED2).
export function EtiquetaFila({ texto }: { texto: string }) {
  return (
    <View style={{ minHeight: TACTIL.minimo, justifyContent: "center", paddingRight: 2 }}>
      <Text style={{ color: PANEL.muted, fontWeight: "800", fontSize: TAMANOS.minimo }}>{texto}</Text>
    </View>
  );
}

// Una miniatura de la fila (foto pequeña con borde; sin foto, un icono). La foto la pone quien la usa como `children`.
export function Miniatura({ icono, ancho = 56, alto = 56, children }: { icono: IoniconName; ancho?: number; alto?: number; children?: React.ReactNode }) {
  return (
    <View style={{ width: ancho, height: alto, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: PANEL.border, backgroundColor: "#F8FBFE", alignItems: "center", justifyContent: "center" }}>
      {children ?? <Ionicons name={icono} size={22} color={PANEL.muted} />}
    </View>
  );
}

// Una cifra: el número grande y su etiqueta debajo. Al tocarla, filtra la lista.
export function Cifra({
  valor,
  etiqueta,
  nativeID,
  onPress,
  activa,
  icono,
  ancho,
  alerta,
}: {
  valor: string;
  etiqueta: string;
  nativeID?: string;
  onPress?: () => void;
  activa?: boolean;
  icono?: IoniconName;
  ancho: Ancho;
  alerta?: boolean;
}) {
  const estilo = {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: ancho,
    minWidth: 0,
    minHeight: 72,
    borderRadius: 16,
    backgroundColor: activa ? PANEL.accent2 : alerta ? PANEL.dangerBg : PANEL.card,
    borderWidth: 1,
    borderColor: activa ? PANEL.accentBorder : alerta ? PANEL.dangerBg : PANEL.card,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 2,
  };
  const contenido = (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, maxWidth: "100%" }}>
        {icono ? <Ionicons name={icono} size={18} color={alerta ? PANEL.danger : PANEL.accent} /> : null}
        <Text numberOfLines={1} style={{ color: alerta ? PANEL.danger : PANEL.text, fontWeight: "900", fontSize: TAMANOS.titulo3, flexShrink: 1 }}>
          {valor}
        </Text>
      </View>
      <Text
        numberOfLines={2}
        style={{ color: activa ? PANEL.accentDark : alerta ? PANEL.danger : PANEL.muted, fontWeight: activa ? "900" : "700", fontSize: TAMANOS.minimo, lineHeight: 17, textAlign: "center" }}
      >
        {etiqueta}
      </Text>
    </>
  );
  if (!onPress) {
    return (
      <View nativeID={nativeID} style={estilo}>
        {contenido}
      </View>
    );
  }
  return (
    <Pressable
      nativeID={nativeID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!activa }}
      accessibilityLabel={`${valor} ${etiqueta}`}
      style={({ pressed }) => ({ ...estilo, opacity: pressed ? 0.8 : 1 })}
    >
      {contenido}
    </Pressable>
  );
}

// Una sección: icono y título (sin recuadro).
export function Seccion({ icon, title, extra, nativeID, children }: { icon: IoniconName; title: string; extra?: string; nativeID?: string; children: React.ReactNode }) {
  return (
    <View nativeID={nativeID} style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Ionicons name={icon} size={20} color={PANEL.accent} />
        <Text style={{ flex: 1, color: PANEL.text, fontWeight: "900", fontSize: TAMANOS.destacado }}>{title}</Text>
        {extra ? <Text style={{ color: PANEL.muted, fontSize: TAMANOS.minimo, fontWeight: "800" }}>{extra}</Text> : null}
      </View>
      {children}
    </View>
  );
}

// Línea de detalle (13 px, gris permitido).
export function Detalle({ children, nativeID, color }: { children: React.ReactNode; nativeID?: string; color?: string }) {
  return (
    <Text nativeID={nativeID} style={{ color: color ?? PANEL.muted, fontWeight: "700", fontSize: TAMANOS.minimo, lineHeight: 19 }}>
      {children}
    </Text>
  );
}

// Un dato «Etiqueta: valor» del detalle.
export function Dato({ etiqueta, children, nativeID }: { etiqueta: string; children: React.ReactNode; nativeID?: string }) {
  return (
    <Text nativeID={nativeID} style={{ color: PANEL.text, fontSize: TAMANOS.minimo, lineHeight: 19 }}>
      <Text style={{ fontWeight: "800" }}>{etiqueta}: </Text>
      {children}
    </Text>
  );
}

// Una etiqueta pequeña de la fila: icono y texto con su color, sin cápsula.
export function Etiqueta({ icon, texto, color, nativeID }: { icon: IoniconName; texto: string; color: string; nativeID?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, maxWidth: "100%" }}>
      <Ionicons name={icon} size={15} color={color === PANEL.text ? PANEL.accent : color} />
      <Text nativeID={nativeID} style={{ color, fontWeight: "800", fontSize: TAMANOS.minimo, flexShrink: 1 }}>
        {texto}
      </Text>
    </View>
  );
}

// Un bloque del detalle: título con su icono y su contenido.
export function Bloque({ icono, titulo, nativeID, ancho, children }: { icono: IoniconName; titulo: string; nativeID?: string; ancho: Ancho; children: React.ReactNode }) {
  return (
    <View nativeID={nativeID} style={{ flexGrow: 1, flexShrink: 1, flexBasis: ancho, minWidth: 0, borderRadius: 16, backgroundColor: PANEL.card, padding: 12, gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Ionicons name={icono} size={18} color={PANEL.accent} />
        <Text style={{ flex: 1, color: PANEL.text, fontWeight: "900", fontSize: TAMANOS.cuerpo }}>{titulo}</Text>
      </View>
      {children}
    </View>
  );
}

// Un bloque de un formulario (a todo lo ancho, uno debajo de otro): el mismo Bloque dentro de una fila, para que su ancho
// no se lea como alto en una columna.
export function BloqueFormulario({ icono, titulo, nativeID, children }: { icono: IoniconName; titulo: string; nativeID?: string; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: "row" }}>
      <Bloque icono={icono} titulo={titulo} nativeID={nativeID} ancho="100%">
        <View style={{ gap: 10 }}>{children}</View>
      </Bloque>
    </View>
  );
}

// Un enlace o acción de texto con su icono, sin burbuja (44 px de alto).
export function AccionTexto({
  nativeID,
  icono,
  texto,
  onPress,
  color = PANEL.accentDark,
  disabled,
  rol = "button",
  etiqueta,
}: {
  nativeID?: string;
  icono: IoniconName;
  texto: string;
  onPress: () => void;
  color?: string;
  disabled?: boolean;
  rol?: "button" | "link";
  etiqueta?: string;
}) {
  return (
    <Pressable
      nativeID={nativeID}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole={rol}
      accessibilityLabel={etiqueta}
      style={({ pressed }) => ({ minHeight: TACTIL.minimo, flexDirection: "row", alignItems: "center", gap: 6, opacity: pressed || disabled ? 0.6 : 1 })}
    >
      <Ionicons name={icono} size={18} color={color === PANEL.accentDark ? PANEL.accent : color} />
      <Text style={{ color, fontWeight: "800", fontSize: TAMANOS.cuerpo, flexShrink: 1 }}>{texto}</Text>
    </Pressable>
  );
}

// El buscador del panel (16 px: con menos, Safari del iPhone hace zoom al escribir) con su lupa y el botón de borrar.
export function Buscador({
  nativeID,
  valor,
  onCambiar,
  placeholder,
  etiqueta,
}: {
  nativeID: string;
  valor: string;
  onCambiar: (t: string) => void;
  placeholder: string;
  etiqueta: string;
}) {
  return (
    <View
      nativeID={`${nativeID}-caja`}
      style={{ flexDirection: "row", alignItems: "center", minHeight: CAMPO.alto, borderRadius: 14, borderWidth: 1, borderColor: PANEL.border, backgroundColor: PANEL.card, paddingLeft: 14 }}
    >
      <Ionicons name="search" size={20} color={PANEL.accent} />
      <TextInput
        nativeID={nativeID}
        value={valor}
        onChangeText={onCambiar}
        placeholder={placeholder}
        placeholderTextColor={PANEL.muted}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={etiqueta}
        style={{ flex: 1, minWidth: 0, minHeight: CAMPO.alto, paddingHorizontal: 10, color: PANEL.text, fontSize: CAMPO.letra }}
      />
      {valor ? (
        <Pressable
          onPress={() => onCambiar("")}
          accessibilityRole="button"
          accessibilityLabel="Borrar la búsqueda"
          style={({ pressed }) => ({ width: TACTIL.minimo, height: TACTIL.minimo, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.7 : 1 })}
        >
          <Ionicons name="close-circle" size={20} color={PANEL.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

// «N de M …» y «Abrir todas / Cerrar todas» encima de la lista.
export function RecuentoLista({
  nativeID,
  texto,
  abiertas,
  onAlternar,
  idBoton,
  femenino,
}: {
  nativeID: string;
  texto: string;
  abiertas: boolean;
  onAlternar?: () => void;
  idBoton: string;
  femenino?: boolean;
}) {
  return (
    // 4 px debajo: con los 4 px de la primera fila, 8 px entre «Abrir todas» y ella.
    <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: 12, marginBottom: 4 }}>
      <Text nativeID={nativeID} style={{ flex: 1, minWidth: 140, color: PANEL.muted, fontWeight: "800", fontSize: TAMANOS.minimo }}>
        {texto}
      </Text>
      {onAlternar ? (
        <Pressable
          nativeID={idBoton}
          onPress={onAlternar}
          accessibilityRole="button"
          accessibilityState={{ expanded: abiertas }}
          {...({ "aria-expanded": abiertas } as object)}
          style={({ pressed }) => ({ minHeight: TACTIL.minimo, flexDirection: "row", alignItems: "center", gap: 4, opacity: pressed ? 0.7 : 1 })}
        >
          <Ionicons name={abiertas ? "contract-outline" : "expand-outline"} size={16} color={PANEL.accent} />
          <Text style={{ color: PANEL.accentDark, fontWeight: "800", fontSize: TAMANOS.minimo }}>
            {abiertas ? (femenino ? "Cerrar todas" : "Cerrar todos") : femenino ? "Abrir todas" : "Abrir todos"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// Lista vacía (con el filtro o la búsqueda de ahora).
export function ListaVacia({ nativeID, icono, titulo, texto }: { nativeID?: string; icono: IoniconName; titulo: string; texto: string }) {
  return (
    <View nativeID={nativeID} style={{ alignItems: "center", gap: 6, paddingVertical: 28 }}>
      <Ionicons name={icono} size={24} color={PANEL.muted} />
      <Text style={{ color: PANEL.text, fontWeight: "900", fontSize: TAMANOS.cuerpo, textAlign: "center" }}>{titulo}</Text>
      <Text style={{ color: PANEL.muted, fontSize: TAMANOS.cuerpo, lineHeight: 21, textAlign: "center" }}>{texto}</Text>
    </View>
  );
}

// La fila de cifras de arriba (las tarjetas que filtran), a 8 px entre sí (tanda 3, PANRED3).
export function FilaCifras({ nativeID, children }: { nativeID?: string; children: React.ReactNode }) {
  return (
    <View nativeID={nativeID} style={{ flexDirection: "row", flexWrap: "wrap", gap: TACTIL.separacion }}>
      {children}
    </View>
  );
}

// Una fila compacta de una lista (tanda 3, PANRED3: Chats, Cotizaciones e Inventario; el mismo aspecto que las de
// Categorías, Reservas y Productos): miniatura, título con su etiqueta de color, una línea de datos, etiquetas pequeñas y la
// flecha. Al tocarla se despliega su detalle (`children`) o, sin `desplegable`, se elige (la conversación de Chats, que se
// abre al lado). `derecha`: un botón de icono junto a la fila (editar, borrar), a 8 px. 4 px arriba y abajo: entre una
// fila y la siguiente quedan 8 px sin tocar.
export function FilaLista({
  nativeID,
  idFila,
  primera,
  abierta,
  activa,
  desplegable = true,
  onPress,
  etiquetaAccesible,
  miniatura,
  titulo,
  colorTitulo,
  etiqueta,
  subtitulo,
  idSubtitulo,
  lineasSubtitulo = 2,
  etiquetas,
  derecha,
  children,
}: {
  nativeID?: string;
  idFila?: string;
  primera?: boolean;
  abierta?: boolean;
  activa?: boolean;
  desplegable?: boolean;
  onPress: () => void;
  etiquetaAccesible?: string;
  miniatura?: React.ReactNode;
  titulo: React.ReactNode;
  colorTitulo?: string;
  etiqueta?: React.ReactNode;
  subtitulo?: React.ReactNode;
  idSubtitulo?: string;
  lineasSubtitulo?: number;
  etiquetas?: React.ReactNode;
  derecha?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <View nativeID={nativeID} style={{ borderTopWidth: primera ? 0 : 1, borderTopColor: PANEL.border, paddingVertical: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: TACTIL.separacion }}>
        <Pressable
          nativeID={idFila}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityState={desplegable ? { expanded: !!abierta } : { selected: !!activa }}
          {...(desplegable ? ({ "aria-expanded": !!abierta } as object) : null)}
          accessibilityLabel={etiquetaAccesible}
          style={({ pressed }) => ({
            flex: 1,
            minWidth: 0,
            minHeight: TACTIL.minimo,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            paddingVertical: 8,
            // El fondo de la elegida sobresale 8 px por la izquierda (el texto sigue alineado con el resto); por la
            // derecha no, para dejar los 8 px con el botón de al lado.
            paddingLeft: 8,
            paddingRight: 4,
            marginLeft: -8,
            borderRadius: 12,
            backgroundColor: activa ? PANEL.accent2 : "transparent",
            opacity: pressed ? 0.85 : 1,
          })}
        >
          {miniatura}
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: 8, rowGap: 4 }}>
              <Text style={{ color: colorTitulo ?? PANEL.text, fontWeight: "900", fontSize: TAMANOS.cuerpo, lineHeight: 21, flexShrink: 1 }}>{titulo}</Text>
              {etiqueta}
            </View>
            {subtitulo ? (
              <Text nativeID={idSubtitulo} numberOfLines={lineasSubtitulo} style={{ color: PANEL.muted, fontWeight: "700", fontSize: TAMANOS.minimo, lineHeight: 18 }}>
                {subtitulo}
              </Text>
            ) : null}
            {etiquetas ? <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 14, rowGap: 4 }}>{etiquetas}</View> : null}
          </View>
          <Ionicons name={desplegable ? (abierta ? "chevron-up" : "chevron-down") : "chevron-forward"} size={18} color={PANEL.muted} />
        </Pressable>
        {derecha}
      </View>
      {abierta && children ? children : null}
    </View>
  );
}

// El detalle desplegado de una fila: los bloques (uno al lado de otro en el ordenador) y, debajo, las acciones.
export function DetalleFila({
  nativeID,
  idAcciones,
  acciones,
  children,
}: {
  nativeID?: string;
  idAcciones?: string;
  acciones?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View nativeID={nativeID} style={{ gap: 12, paddingBottom: 16 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>{children}</View>
      {acciones ? (
        <View nativeID={idAcciones} style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 18, rowGap: TACTIL.separacion }}>
          {acciones}
        </View>
      ) : null}
    </View>
  );
}

// Los botones de icono junto a una fila (editar y borrar), a 8 px entre sí (tanda 4, PANRED4: Blog, Noticias Flash y
// Políticas).
export function BotonesFila({ nativeID, children }: { nativeID?: string; children: React.ReactNode }) {
  return (
    <View nativeID={nativeID} style={{ flexDirection: "row", alignItems: "center", gap: TACTIL.separacion }}>
      {children}
    </View>
  );
}

// Una fecha del panel en la hora de Madrid: en la fila, solo el día (y el año si no es el actual); con `conHora`, el día,
// el año y la hora (para el detalle). Sin fecha válida, «-» (tanda 4, PANRED4).
export function fechaPanel(iso: string | null | undefined, conHora = false) {
  if (!iso) return "-";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "-";
  const d = new Date(t);
  if (conHora) {
    return d.toLocaleString("es-ES", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
  }
  const otroAno = d.getFullYear() !== new Date().getFullYear();
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", ...(otroAno ? { year: "numeric" } : {}), timeZone: "Europe/Madrid" });
}

// Abiertas una a una o todas a la vez («Abrir todas»): con todas abiertas, las que se pliegan a mano se apuntan aparte.
export function useDesplegables(inicial: string[] = []) {
  const [abiertas, setAbiertas] = React.useState<Set<string>>(() => new Set(inicial));
  const [todas, setTodas] = React.useState(false);
  const [plegadas, setPlegadas] = React.useState<Set<string>>(() => new Set());
  const estaAbierta = React.useCallback((id: string) => (todas ? !plegadas.has(id) : abiertas.has(id)), [todas, plegadas, abiertas]);
  const alternar = React.useCallback(
    (id: string) => {
      const cambiar = (prev: Set<string>) => {
        const n = new Set(prev);
        if (n.has(id)) n.delete(id);
        else n.add(id);
        return n;
      };
      if (todas) setPlegadas(cambiar);
      else setAbiertas(cambiar);
    },
    [todas]
  );
  const abrir = React.useCallback((id: string) => {
    setAbiertas((prev) => new Set(prev).add(id));
    setPlegadas((prev) => {
      const n = new Set(prev);
      n.delete(id);
      return n;
    });
  }, []);
  const todasAbiertas = (ids: string[]) => ids.length > 0 && ids.every((id) => estaAbierta(id));
  const abrirOCerrarTodas = (ids: string[]) => {
    if (todasAbiertas(ids)) {
      setTodas(false);
      setAbiertas(new Set());
      setPlegadas(new Set());
    } else {
      setTodas(true);
      setPlegadas(new Set());
    }
  };
  return { estaAbierta, alternar, abrir, todasAbiertas, abrirOCerrarTodas };
}
