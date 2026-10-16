// components/VenderAhoraModal.tsx
/**
 * Qué hace: modal ("pop") que se abre al pulsar "Vender ahora". Es el
 * formulario para clientes que quieren vender su consola/electrónica: datos
 * de contacto (nombre, apellido, género), qué artículo es, si funciona bien
 * o no (con su pregunta según la respuesta), ciudad, precio esperado, cómo
 * prefieren que les contactemos y cómo se entrega el artículo. Al enviarlo
 * se guarda directamente en Supabase — no se envía ningún email.
 *
 * Cómo funciona:
 * - Ocupa el ancho completo (hasta un máximo cómodo de lectura) tanto en
 *   móvil como en escritorio, con una animación de entrada tipo "pop"
 *   (fade + spring de escala) hecha con Animated.
 * - Responsive: en móvil todo va en una sola columna a ancho completo. A
 *   partir de tablet/escritorio (ancho >= 700) el modal crece hasta un
 *   máximo mayor y varios campos se colocan en pareja (Nombre/Apellido,
 *   Ciudad/Precio, selector+campo condicional de contacto y de entrega)
 *   para aprovechar el ancho sin que el formulario se vea como una columna
 *   interminable.
 * - Todo el texto (títulos, subtítulos, preguntas/labels, botones y chips)
 *   va centrado para que se vea más cuidado; lo único que NO se centra es
 *   lo que el usuario escribe dentro de los campos de texto, que siempre
 *   empieza por la izquierda como es normal al escribir.
 * - En móvil los espaciados y tamaños son un poco más ajustados (paddings
 *   menores, título algo más pequeño) para una sensación más "premium" y
 *   menos apretada; los TextInput mantienen fontSize 16 siempre — por
 *   debajo de 16px los navegadores móviles hacen zoom automático al
 *   enfocar el campo, así que no se puede reducir sin que vuelva ese salto.
 * - Cada pregunta de "elegir una opción" (Sí/No, género, método de
 *   contacto, opción de venta, disponibilidad) usa SelectField: un botón
 *   compacto "Elegir" con un icono de flecha (Ionicons chevron, no un
 *   emoji) que al tocarlo despliega justo debajo las opciones en forma de
 *   chips; al elegir una, el botón pasa a mostrar el valor elegido y se
 *   pliega otra vez.
 * - Todos los botones y desplegables (SelectField y sus chips, la casilla
 *   de mayor de edad, el chip de "+ Añadir @gmail.com", la X de cerrar, el
 *   botón "Cerrar" final y el propio botón de enviar) tienen una pequeña
 *   animación "pop" tipo Apple al pulsarlos: se encogen levemente
 *   (Animated.spring) al tocar y vuelven a su tamaño al soltar, usando el
 *   componente AnimatedPressable definido más abajo.
 * - Cada campo (de texto o de elegir una opción) baja de intensidad de
 *   color y muestra una marca de verificación en verde (Ionicons
 *   checkmark-circle, no un emoji) en cuanto tiene un valor válido y no se
 *   está editando en ese momento. Al volver a tocarlo para corregirlo
 *   recupera su color normal; al salir de él (tocar otro campo, o elegir
 *   una opción y cerrarse el desplegable) vuelve a atenuarse si sigue
 *   siendo válido. Los campos que aún están vacíos se quedan como estaban.
 *   La pregunta (FieldLabel) de cada campo también se atenúa a la vez que
 *   su campo, vía la prop "dim".
 * - Nombre, apellido y el dato de contacto (teléfono/email/usuario, según
 *   el método elegido) piden un mínimo de caracteres para evitar datos
 *   claramente incompletos o erróneos; el resto de campos solo exige que
 *   no estén vacíos, como hasta ahora.
 * - "¿Todo funciona perfectamente?" (Sí/No). Si es Sí, pide el motivo de la
 *   venta; si es No, pide una breve descripción del problema.
 * - "Método de contacto" (WhatsApp/Gmail/Instagram/Facebook/TikTok) cambia
 *   el campo siguiente: WhatsApp añade el prefijo "+34" fijo antes del
 *   número, Gmail ofrece autocompletar "@gmail.com" con un chip si el
 *   usuario no lo ha escrito, y las redes sociales anteponen "@" de forma
 *   fija. Es obligatorio elegir un método y rellenar su dato de contacto:
 *   sin eso no hay forma de contactar al cliente y el formulario no sirve.
 * - "Opción de venta" (recogida en domicilio / el cliente se desplaza a
 *   entregarlo). Si es domicilio pide la dirección completa; si es entrega
 *   pide la disponibilidad horaria (Mañana/Medio día/Tarde noche).
 * - Fotos y vídeo del artículo (opcional): hasta 10 imágenes + 1 vídeo de
 *   hasta 20 segundos, con SellMediaPicker (ver components/
 *   SellRequestMedia.tsx). No cuentan para el progreso/obligatoriedad del
 *   formulario — un cliente puede enviar la solicitud sin adjuntar nada.
 *   Se suben a Storage DESPUÉS de guardar la solicitud (hace falta su id
 *   para enlazarlos); si la subida falla, la solicitud ya guardada no se
 *   pierde, solo se avisa en la pantalla de confirmación.
 * - El botón final es un progreso animado: se calculan 13 pasos
 *   obligatorios (nombre, apellido, género, artículo, funciona/no,
 *   motivo-o-problema según corresponda, ciudad, precio, método de
 *   contacto y su dato, opción de venta, dirección-o-disponibilidad según
 *   corresponda, y confirmar mayoría de edad). El botón se rellena de
 *   color (con transición animada) según el % completado, se ve
 *   apagado/desactivado por debajo del 100% y solo se puede pulsar
 *   exactamente al llegar al 100%; mientras tanto muestra debajo del texto
 *   "Enviar Formulario" un "XX% completado".
 * - Al pulsar "Enviar formulario" hace un INSERT en la tabla pública
 *   "sell_requests" (ver sql/sell_requests.sql) con status inicial "nuevo".
 *   Cualquiera puede insertar (política RLS pública de solo INSERT); nadie
 *   sin rol admin puede leer esas filas.
 * - Tras un envío correcto muestra una pantalla de confirmación dentro del
 *   propio modal y se puede cerrar con "Cerrar".
 * - Chat automático (septiembre): si quien envía el formulario tiene sesión
 *   iniciada, justo después de guardar la solicitud se abre (o reutiliza)
 *   una conversación centrada en ESE artículo
 *   (get_or_create_sell_request_chat, ver migración en Supabase — no hay ya
 *   un .sql local por cada cambio, ver sql/README.md) y se manda como
 *   primer mensaje un resumen del formulario (artículo, funciona o no,
 *   ciudad, precio esperado), para no repetirlo por chat. La confirmación
 *   muestra entonces "Ir al chat con nosotros" en vez del "Cerrar" de
 *   siempre. Sin sesión (el formulario sigue siendo público, no la exige)
 *   no se puede crear la conversación — se invita a iniciar sesión para
 *   poder seguir la venta por chat la próxima vez.
 * - Sigue el tema claro global de la app (fondo blanco, texto azul marino,
 *   acentos azul claro). El fondo oscuro semitransparente detrás de la
 *   tarjeta se mantiene oscuro a propósito, igual que en el resto de
 *   modales del panel admin.
 *
 * Conectado con:
 * - lib/supabase.ts → cliente usado para el INSERT.
 * - app/(tabs)/index.tsx → abre este modal desde el botón "Vender ahora".
 * - app/admin/cotizaciones.tsx → panel donde el admin ve lo que aquí se
 *   envía.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { router, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { leerOrigenVender, marcarOrigenVender, trackEvent } from "../lib/analytics";
import { activarNotificaciones, estadoNotificaciones, type EstadoNotificaciones } from "../lib/notificaciones";
import {
  SellMediaPicker,
  uploadSellRequestMedia,
  type LocalSellMedia,
} from "./SellRequestMedia";

const COLORS = {
  bg2: "#F4F9FD",
  card: "#F6FAFD",
  cardSoft: "#F8FBFE",
  border: "#E3EAF2",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  muted2: "rgba(11,33,56,0.48)",
  accent: "#1EA7E8",
  accentDark: "#1EA7E8",
  accent2: "#EAF6FD",
  accentBorder: "#BEE6FA",
  success: "#15803D",
  successBg: "#DCFCE7",
  successBorder: "#86EFAC",
  danger: "#B91C1C",
  dangerBg: "#FFE4E6",
  dangerBorder: "#FDA4AF",
};

// Tamaño mínimo de fuente en los campos de texto: por debajo de 16px los
// navegadores móviles hacen zoom automático al enfocar el campo.
const INPUT_FONT_SIZE = 16;

// Solo dos formas de contacto: el correo de Gmail y el chat propio de la tienda.
type MetodoContacto = "gmail" | "chat";
type OpcionVenta = "domicilio" | "entrega";
type Disponibilidad = "manana" | "mediodia" | "tardenoche";
type Genero = "masculino" | "femenino";

// Contexto ligero solo para saber si estamos en móvil, y así los
// subcomponentes (definidos fuera del componente principal) puedan ajustar
// tamaños/paddings sin tener que recibir la prop en cada uso.
const IsMobileContext = React.createContext(false);
function useIsMobile() {
  return React.useContext(IsMobileContext);
}

// Envoltorio de Pressable con una pequeña animación "pop" tipo Apple: al
// pulsar se encoge levemente (Animated.spring) y al soltar vuelve a su
// tamaño normal. Se reparte en dos capas para no romper el posicionamiento
// de los botones que usan position:"absolute" (como la X de cerrar): el
// Pressable exterior lleva SOLO tamaño/posición (containerStyle) y el
// Animated.View interior lleva todo lo visual (color, borde, padding...) y
// es el que realmente se anima. style/children admiten función, igual que
// el Pressable normal de React Native, para poder usar el estado "pressed".
function AnimatedPressable({
  onPress,
  disabled,
  containerStyle,
  style,
  children,
}: {
  onPress?: () => void;
  disabled?: boolean;
  containerStyle?: any;
  // Sin "any" en la unión: así TypeScript sabe que la función recibe { pressed }.
  style?: object | ((state: { pressed: boolean }) => object);
  children?: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode);
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const [pressed, setPressed] = useState(false);

  function onPressIn() {
    setPressed(true);
    Animated.spring(scale, {
      toValue: 0.95,
      useNativeDriver: true,
      speed: 50,
      bounciness: 6,
    }).start();
  }

  function onPressOut() {
    setPressed(false);
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 30,
      bounciness: 6,
    }).start();
  }

  const resolvedStyle = typeof style === "function" ? style({ pressed }) : style;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={containerStyle}
    >
      <Animated.View style={[resolvedStyle as any, { transform: [{ scale }] }]}>
        {typeof children === "function" ? children({ pressed }) : children}
      </Animated.View>
    </Pressable>
  );
}

function softShadow() {
  return Platform.select<any>({
    ios: {
      shadowColor: "#000",
      shadowOpacity: 0.28,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 10 },
    },
    android: { elevation: 6 },
    default: {},
  });
}

// Brillo de colores con efecto «Siri» alrededor de lo que envuelve: un borde de degradado que gira
// (azul de marca, violeta, rosa, naranja y turquesa) con un resplandor suave por fuera. Se enciende
// cada vez que cambia `encender` (si es > 0), dura unos segundos y se apaga solo. Va DETRÁS del
// contenido (que debe tener fondo opaco), así que solo se ve el borde y el resplandor. Solo web;
// con «reducir movimiento» no gira (queda fijo).
const SIRI_DEGRADADO =
  "conic-gradient(from 0deg, #1EA7E8, #7C5CFF, #FF4FA3, #FF9A3C, #3CE0C5, #1EA7E8)";
const SIRI_MS = 3200;
function SiriGlow({
  encender,
  radio = 14,
  style,
  children,
}: {
  encender: number;
  radio?: number;
  style?: object;
  children: React.ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const opacidad = useRef(new Animated.Value(0)).current;
  const giro = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!encender || Platform.OS !== "web") return;
    let reducido = false;
    try {
      reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      // sin matchMedia
    }
    setVisible(true);
    opacidad.setValue(0);
    giro.setValue(0);
    const vuelta = reducido
      ? null
      : Animated.loop(Animated.timing(giro, { toValue: 1, duration: 2400, easing: Easing.linear, useNativeDriver: false }));
    vuelta?.start();
    Animated.timing(opacidad, { toValue: 1, duration: 260, useNativeDriver: false }).start();
    const apagar = setTimeout(() => {
      Animated.timing(opacidad, { toValue: 0, duration: 700, useNativeDriver: false }).start(() => {
        setVisible(false);
        vuelta?.stop();
      });
    }, SIRI_MS);
    return () => {
      clearTimeout(apagar);
      vuelta?.stop();
    };
  }, [encender, opacidad, giro]);

  const rotar = giro.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  // Capa cuadrada grande y centrada que gira dentro de un marco recortado con las esquinas del campo.
  const capa = (margen: number, extra: object, op: number) => (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: -margen,
        right: -margen,
        top: -margen,
        bottom: -margen,
        borderRadius: radio + margen,
        overflow: "hidden",
        opacity: opacidad.interpolate({ inputRange: [0, 1], outputRange: [0, op] }),
        ...extra,
      }}
    >
      <Animated.View
        style={
          {
            position: "absolute",
            width: 600,
            height: 600,
            left: "50%",
            top: "50%",
            marginLeft: -300,
            marginTop: -300,
            backgroundImage: SIRI_DEGRADADO,
            transform: [{ rotate: rotar }],
          } as object
        }
      />
    </Animated.View>
  );

  return (
    <View style={[{ position: "relative" }, style]}>
      {visible ? (
        <>
          {capa(8, { filter: "blur(9px)" } as object, 0.7)}
          {capa(2.5, {}, 1)}
        </>
      ) : null}
      <View style={{ position: "relative" }}>{children}</View>
    </View>
  );
}

// dim=true atenúa también la pregunta (no solo el campo/desplegable de
// debajo) cuando ese campo ya está completo, siguiendo el mismo lenguaje
// visual de "completado" que FieldInput/SelectField.
function FieldLabel({ children, dim }: { children: React.ReactNode; dim?: boolean }) {
  const isMobile = useIsMobile();
  return (
    <Text
      style={{
        color: dim ? COLORS.muted : COLORS.text,
        fontWeight: "900",
        fontSize: isMobile ? 13 : 14,
        lineHeight: isMobile ? 18 : 19,
        textAlign: "center",
      }}
    >
      {children}
    </Text>
  );
}

// Campo de texto con "estado de completado": cuando tiene un valor válido
// (filled=true) y no se está escribiendo en él ahora mismo, baja de
// intensidad (borde/fondo/texto más suaves) y muestra un check verde a la
// derecha; al tocarlo para corregirlo (onFocus) recupera su aspecto normal
// de inmediato, y al salir (onBlur) se vuelve a atenuar si sigue siendo
// válido. containerStyle es para el diseño del contenedor exterior (p.ej.
// flex:1 dentro de una fila); style sigue afectando solo al TextInput.
function FieldInput({
  filled,
  containerStyle,
  style,
  onFocus,
  onBlur,
  ...rest
}: React.ComponentProps<typeof TextInput> & { filled?: boolean; containerStyle?: any }) {
  const isMobile = useIsMobile();
  const [focused, setFocused] = useState(false);
  const completed = !!filled && !focused;

  return (
    <View style={[{ justifyContent: "center" }, containerStyle]}>
      <TextInput
        placeholderTextColor="rgba(11,33,56,0.40)"
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          {
            borderWidth: 1,
            borderColor: COLORS.border,
            borderRadius: 14,
            paddingHorizontal: isMobile ? 11 : 12,
            paddingRight: completed ? (isMobile ? 34 : 38) : isMobile ? 11 : 12,
            paddingVertical: isMobile ? 10 : 12,
            color: completed ? COLORS.muted : COLORS.text,
            backgroundColor: completed ? COLORS.card : COLORS.cardSoft,
            fontSize: INPUT_FONT_SIZE,
            // Todo centrado, también lo que escribe el cliente en cada recuadro.
            textAlign: "center",
          },
          style,
        ]}
        {...rest}
      />
      {completed && (
        <View style={{ position: "absolute", right: isMobile ? 10 : 12, top: isMobile ? 10 : 12 }}>
          <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
        </View>
      )}
    </View>
  );
}

// Selector "Elegir ⌄": un botón compacto y centrado que muestra el valor
// elegido (o "Elegir" con un icono de flecha si no hay nada elegido
// todavía) y, al tocarlo, despliega justo debajo las opciones en forma de
// chips. Al elegir una se pliega de nuevo. compact=true lo deja con un
// ancho contenido (para no estirarse una fila entera en pantallas anchas);
// compact=false lo estira al 100% del contenedor (para cuando ya va dentro
// de una columna de una fila de dos).
function SelectField<T extends string>({
  options,
  value,
  onChange,
  compact,
}: {
  options: { label: string; value: T }[];
  value: T | null;
  onChange: (v: T) => void;
  compact?: boolean;
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  // Cada vez que se despliega, las opciones se iluminan unos segundos con el efecto «Siri».
  const [brillo, setBrillo] = useState(0);
  const cajaRef = useRef<View>(null);
  const selected = options.find((o) => o.value === value);

  // Al desplegar, el scroll se adapta solo para que el desplegable (botón y opciones) quede a la
  // vista y centrado, también cuando está al final del formulario o tapado por el teclado.
  useEffect(() => {
    if (!open || Platform.OS !== "web") return;
    const t = setTimeout(() => {
      const nodo = cajaRef.current as unknown as HTMLElement | null;
      nodo?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    }, 90);
    return () => clearTimeout(t);
  }, [open]);
  // "Completado": ya hay un valor elegido y el desplegable está cerrado. En
  // ese caso el botón baja de intensidad y muestra un check en vez de la
  // flecha; al volver a tocarlo (se abre) recupera el aspecto normal para
  // poder corregir la elección.
  const completed = !!value && !open;

  return (
    <View ref={cajaRef} style={{ gap: 8, alignItems: compact ? "center" : "stretch" }}>
      <AnimatedPressable
        onPress={() => {
          const siguiente = !open;
          setOpen(siguiente);
          if (siguiente) setBrillo((b) => b + 1);
        }}
        containerStyle={{
          alignSelf: compact ? "center" : "stretch",
          width: compact ? undefined : "100%",
          minWidth: compact ? 180 : undefined,
          maxWidth: compact ? 340 : undefined,
        }}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: completed ? COLORS.border : value ? COLORS.accentBorder : COLORS.border,
          backgroundColor: completed ? COLORS.card : value ? COLORS.accent2 : COLORS.cardSoft,
          paddingVertical: isMobile ? 10 : 12,
          paddingHorizontal: isMobile ? 12 : 14,
          opacity: pressed ? 0.9 : 1,
        })}
      >
        <Text
          numberOfLines={1}
          style={{
            color: completed ? COLORS.muted : COLORS.text,
            fontWeight: "900",
            fontSize: INPUT_FONT_SIZE,
            flexShrink: 1,
            textAlign: "center",
          }}
        >
          {selected ? selected.label : "Elegir"}
        </Text>
        {completed ? (
          <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
        ) : (
          <Ionicons
            name={open ? "chevron-up-outline" : "chevron-down-outline"}
            size={18}
            color={COLORS.text}
          />
        )}
      </AnimatedPressable>

      {open && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
          {options.map((opt) => {
            const active = value === opt.value;
            return (
              <SiriGlow key={opt.value} encender={brillo} style={{ flexGrow: 1, minWidth: 96 }}>
                <AnimatedPressable
                  onPress={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  style={({ pressed }) => ({
                    borderRadius: 14,
                    paddingVertical: isMobile ? 10 : 12,
                    paddingHorizontal: 12,
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: active ? COLORS.accentBorder : COLORS.border,
                    backgroundColor: active ? COLORS.accent2 : COLORS.cardSoft,
                    opacity: pressed ? 0.9 : 1,
                  })}
                >
                  <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 14, textAlign: "center" }}>
                    {opt.label}
                  </Text>
                </AnimatedPressable>
              </SiriGlow>
            );
          })}
        </View>
      )}
    </View>
  );
}

// Igual que SelectField pero para la pregunta Sí/No (funcionaBien es
// boolean, no un string), reutilizando el mismo botón "Elegir".
function YesNoSelect({
  value,
  onChange,
  compact,
}: {
  value: boolean | null;
  onChange: (v: boolean) => void;
  compact?: boolean;
}) {
  const mapped: "si" | "no" | null = value === null ? null : value ? "si" : "no";
  return (
    <SelectField
      options={[
        { label: "Sí", value: "si" as const },
        { label: "No", value: "no" as const },
      ]}
      value={mapped}
      onChange={(v) => onChange(v === "si")}
      compact={compact}
    />
  );
}

function Checkbox({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
}) {
  const isMobile = useIsMobile();
  const boxSize = isMobile ? 22 : 24;
  return (
    <View style={{ alignItems: "center" }}>
      <AnimatedPressable
        onPress={onToggle}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <View
          style={{
            width: boxSize,
            height: boxSize,
            borderRadius: 7,
            borderWidth: 1.5,
            borderColor: checked ? COLORS.accentDark : COLORS.border,
            backgroundColor: checked ? COLORS.accent : COLORS.cardSoft,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {checked ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
        </View>
        <Text
          style={{
            color: COLORS.text,
            fontWeight: "800",
            fontSize: isMobile ? 13 : 14,
            lineHeight: 19,
          }}
        >
          {label}
        </Text>
      </AnimatedPressable>
    </View>
  );
}

const METODO_OPTIONS: { label: string; value: MetodoContacto }[] = [
  { label: "Gmail", value: "gmail" },
  { label: "Chat de la tienda", value: "chat" },
];

const OPCION_VENTA_OPTIONS: { label: string; value: OpcionVenta }[] = [
  { label: "Quiero que lo recojan en mi domicilio", value: "domicilio" },
  { label: "Me desplazo a entregarlo", value: "entrega" },
];

const DISPONIBILIDAD_OPTIONS: { label: string; value: Disponibilidad }[] = [
  { label: "Mañana", value: "manana" },
  { label: "Medio día", value: "mediodia" },
  { label: "Tarde noche", value: "tardenoche" },
];

const GENERO_OPTIONS: { label: string; value: Genero }[] = [
  { label: "Masculino", value: "masculino" },
  { label: "Femenino", value: "femenino" },
];

// Valida el dato de contacto según el método elegido: un email de Gmail necesita al menos 3
// caracteres antes de la "@"; el chat de la tienda no pide ningún dato (se habla dentro de la
// propia tienda, con la cuenta de la persona).
function contactoEsValido(metodo: MetodoContacto | null, valor: string): boolean {
  if (metodo === "chat") return true;
  const raw = valor.trim();
  if (!metodo || !raw) return false;
  return raw.split("@")[0].trim().length >= 3;
}

/**
 * Identificador de la solicitud generado en el navegador. Se crea aquí (y no lo devuelve
 * la base de datos) porque un visitante sin sesión puede INSERTAR en "sell_requests" pero
 * no LEERLA (RLS: solo el admin y el propio cliente con sesión), y pedir la fila insertada
 * (`.insert().select()`) hacía fallar el envío entero para quien no tiene cuenta.
 */
function newSellRequestId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

type SellRequestPayload = {
  id: string;
  nombre: string;
  apellido: string;
  articulo: string;
  funciona_bien: boolean;
  motivo_venta: string | null;
  descripcion_problema: string | null;
  ciudad: string;
  precio_estimado: string;
  // El chat no tiene valor propio en la base de datos (su restricción solo admite los de antes):
  // se guarda como null y en «contacto» el texto «Chat de la tienda».
  metodo_contacto: "gmail" | null;
  contacto: string | null;
  opcion_venta: OpcionVenta;
  direccion: string | null;
  disponibilidad: Disponibilidad | null;
  mayor_edad: boolean;
  genero: Genero;
  status: "nuevo";
};

export default function VenderAhoraModal({
  visible,
  onClose,
  comoPagina = false,
}: {
  visible: boolean;
  onClose: () => void;
  // true = se pinta como una página completa (app/vender.tsx): sin ventana emergente ni
  // fondo oscuro, con más aire entre apartados y la flecha de volver arriba a la izquierda.
  comoPagina?: boolean;
}) {
  const { width } = useWindowDimensions();
  const widthSafe = width && width > 0 ? width : 1024;
  const isMobile = widthSafe < 700;
  const isDesktopish = widthSafe >= 1024;
  // A partir de tablet/escritorio se usan parejas de campos en fila.
  const twoCol = !isMobile;
  // El modal crece en pantallas anchas para aprovechar mejor el ancho.
  const modalMaxWidth = isDesktopish ? 860 : isMobile ? 640 : 720;

  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");

  const [articulo, setArticulo] = useState("");
  const [funcionaBien, setFuncionaBien] = useState<boolean | null>(null);
  const [motivoVenta, setMotivoVenta] = useState("");
  const [descripcionProblema, setDescripcionProblema] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [precioEstimado, setPrecioEstimado] = useState("");

  const [metodoContacto, setMetodoContacto] = useState<MetodoContacto | null>(null);
  const [contactoValor, setContactoValor] = useState("");
  // Sesión iniciada (el chat de la tienda la necesita) y estado de los avisos del navegador.
  const [haySesion, setHaySesion] = useState(false);
  const [estadoNotif, setEstadoNotif] = useState<EstadoNotificaciones>("no-disponibles");
  useEffect(() => {
    let vivo = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (vivo) setHaySesion(!!data.session?.user);
      })
      .catch(() => {});
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, sesion) => setHaySesion(!!sesion?.user));
    return () => {
      vivo = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);
  // Al elegir el chat se mira si ya están activados los avisos (si lo están, no se muestra nada).
  useEffect(() => {
    if (metodoContacto === "chat") setEstadoNotif(estadoNotificaciones());
  }, [metodoContacto]);

  const [opcionVenta, setOpcionVenta] = useState<OpcionVenta | null>(null);
  const [direccion, setDireccion] = useState("");
  const [disponibilidad, setDisponibilidad] = useState<Disponibilidad | null>(null);

  const [mayorEdad, setMayorEdad] = useState(false);
  const [genero, setGenero] = useState<Genero | null>(null);

  const [mediaImages, setMediaImages] = useState<LocalSellMedia[]>([]);
  const [mediaVideo, setMediaVideo] = useState<LocalSellMedia | null>(null);
  const [mediaUploadFailed, setMediaUploadFailed] = useState(false);

  const [sending, setSending] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  // Con sesión iniciada, handleSubmit abre automáticamente un chat centrado
  // en este artículo (get_or_create_sell_request_chat) y guarda aquí su id
  // para el botón "Ir al chat" de la pantalla de confirmación. Sin sesión
  // se queda a null: no se puede crear una conversación sin una cuenta real.
  const [sentChatId, setSentChatId] = useState<string | null>(null);

  // Validez "reforzada" (con mínimo de caracteres) para nombre, apellido y
  // dato de contacto — se usan tanto para el check verde/atenuado de cada
  // campo como para el progreso y la validación al enviar. El resto de
  // campos solo exige que no estén vacíos, como hasta ahora.
  const nombreValido = nombre.trim().length >= 2;
  const apellidoValido = apellido.trim().length >= 2;
  const contactoValido = contactoEsValido(metodoContacto, contactoValor);

  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  // Escala "pop" del botón de enviar. Es un caso especial: el botón tiene
  // capas de fondo (pista + relleno de progreso) que van por fuera del
  // Pressable interior, así que la animación de escala se aplica al
  // Animated.View exterior que envuelve todas esas capas, mientras que
  // quien dispara el press-in/press-out sigue siendo el Pressable interior.
  const submitScale = useRef(new Animated.Value(1)).current;

  function submitPressIn() {
    Animated.spring(submitScale, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 50,
      bounciness: 6,
    }).start();
  }

  function submitPressOut() {
    Animated.spring(submitScale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 30,
      bounciness: 6,
    }).start();
  }

  useEffect(() => {
    if (visible) {
      scaleAnim.setValue(0.9);
      fadeAnim.setValue(0);

      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 7,
          tension: 90,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 180,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, scaleAnim, fadeAnim]);

  // Progreso del formulario: 13 pasos obligatorios con el mismo peso cada
  // uno (el método de contacto y su dato cuentan como obligatorios: sin
  // forma de contactar al cliente el formulario no sirve). El botón de
  // enviar solo se activa al llegar exactamente al 100%.
  const progress = useMemo(() => {
    const steps: boolean[] = [
      nombreValido,
      apellidoValido,
      !!genero,
      !!articulo.trim(),
      funcionaBien !== null,
      funcionaBien === true
        ? !!motivoVenta.trim()
        : funcionaBien === false
          ? !!descripcionProblema.trim()
          : false,
      !!ciudad.trim(),
      !!precioEstimado.trim(),
      !!metodoContacto,
      contactoValido,
      !!opcionVenta,
      opcionVenta === "domicilio"
        ? !!direccion.trim()
        : opcionVenta === "entrega"
          ? !!disponibilidad
          : false,
      mayorEdad,
    ];

    const total = steps.length;
    const completed = steps.filter(Boolean).length;
    const percent = Math.round((completed / total) * 100);

    return { percent, canSubmit: completed === total };
  }, [
    nombreValido,
    apellidoValido,
    genero,
    articulo,
    funcionaBien,
    motivoVenta,
    descripcionProblema,
    ciudad,
    precioEstimado,
    metodoContacto,
    contactoValido,
    opcionVenta,
    direccion,
    disponibilidad,
    mayorEdad,
  ]);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress.percent,
      duration: 260,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [progress.percent, progressAnim]);

  const fillWidth = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
  });
  const buttonOpacity = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: [0.55, 1],
  });

  // Embudo: el formulario se ha abierto (y desde dónde: la guía de Blue u otro sitio).
  useEffect(() => {
    if (!visible) return;
    trackEvent("vender_abierto", "Vender: abierto");
    if (leerOrigenVender() === "guia") trackEvent("vender_abierto_guia", "Vender: abierto desde la guía");
  }, [visible]);

  function resetForm() {
    marcarOrigenVender(null);
    setNombre("");
    setApellido("");
    setArticulo("");
    setFuncionaBien(null);
    setMotivoVenta("");
    setDescripcionProblema("");
    setCiudad("");
    setPrecioEstimado("");
    setMetodoContacto(null);
    setContactoValor("");
    setOpcionVenta(null);
    setDireccion("");
    setDisponibilidad(null);
    setMayorEdad(false);
    setGenero(null);

    // Libera los blobs de previsualización antes de vaciar el estado.
    mediaImages.forEach((item) => {
      try {
        URL.revokeObjectURL(item.previewUrl);
      } catch {
        // ignore
      }
    });
    if (mediaVideo) {
      try {
        URL.revokeObjectURL(mediaVideo.previewUrl);
      } catch {
        // ignore
      }
    }
    setMediaImages([]);
    setMediaVideo(null);
    setMediaUploadFailed(false);

    setFormErr(null);
    setSent(false);
    setSentChatId(null);
  }

  function handleClose() {
    if (sending) return;
    onClose();
    // Pequeño margen para que no se vea el formulario "vaciándose" antes
    // de que termine la animación de cierre del Modal.
    setTimeout(resetForm, 250);
  }

  function buildContacto(): string | null {
    if (!metodoContacto) return null;
    if (metodoContacto === "chat") return "Chat de la tienda";
    const raw = contactoValor.trim();
    if (!raw) return null;
    return raw.includes("@") ? raw : `${raw}@gmail.com`;
  }

  async function handleSubmit() {
    if (sending || !progress.canSubmit) return;

    const cleanNombre = nombre.trim();
    const cleanApellido = apellido.trim();
    const cleanArticulo = articulo.trim();
    const cleanCiudad = ciudad.trim();
    const cleanPrecio = precioEstimado.trim();
    const cleanMotivo = motivoVenta.trim();
    const cleanProblema = descripcionProblema.trim();
    const cleanDireccion = direccion.trim();

    if (!cleanNombre) {
      setFormErr("Indica tu nombre.");
      return;
    }

    if (!nombreValido) {
      setFormErr("Tu nombre es demasiado corto.");
      return;
    }

    if (!cleanApellido) {
      setFormErr("Indica tu apellido.");
      return;
    }

    if (!apellidoValido) {
      setFormErr("Tu apellido es demasiado corto.");
      return;
    }

    if (!genero) {
      setFormErr("Indica tu género.");
      return;
    }

    if (!cleanArticulo) {
      setFormErr("Cuéntanos qué artículo quieres vender.");
      return;
    }

    if (funcionaBien === null) {
      setFormErr("Indica si el artículo funciona perfectamente o no.");
      return;
    }

    if (funcionaBien && !cleanMotivo) {
      setFormErr("Indica el motivo de la venta.");
      return;
    }

    if (!funcionaBien && !cleanProblema) {
      setFormErr("Describe brevemente qué le sucede al artículo.");
      return;
    }

    if (!cleanCiudad) {
      setFormErr("Indica en qué ciudad te encuentras.");
      return;
    }

    if (!cleanPrecio) {
      setFormErr("Indica cuánto estimas recibir por tu artículo.");
      return;
    }

    if (!metodoContacto) {
      setFormErr("Indica cómo prefieres que te contactemos.");
      return;
    }

    // El chat de la tienda necesita una cuenta: sin sesión no se puede abrir la conversación.
    if (metodoContacto === "chat" && !haySesion) {
      setFormErr("Para hablar por el chat necesitas iniciar sesión. Inicia sesión desde Perfil o elige Gmail.");
      return;
    }

    if (metodoContacto === "gmail" && !contactoValor.trim()) {
      setFormErr("Completa tu dato de contacto.");
      return;
    }

    if (!contactoValido) {
      setFormErr("Revisa tu dato de contacto: parece incompleto.");
      return;
    }

    if (!opcionVenta) {
      setFormErr("Indica cómo prefieres entregar el artículo.");
      return;
    }

    if (opcionVenta === "domicilio" && !cleanDireccion) {
      setFormErr("Indica tu dirección completa (calle, número, puerta y letra).");
      return;
    }

    if (opcionVenta === "entrega" && !disponibilidad) {
      setFormErr("Indica tu disponibilidad para entregarlo.");
      return;
    }

    if (!mayorEdad) {
      setFormErr("Debes confirmar que eres mayor de 18 años para continuar.");
      return;
    }

    setFormErr(null);
    setSending(true);

    const requestId = newSellRequestId();
    const payload: SellRequestPayload = {
      id: requestId,
      nombre: cleanNombre,
      apellido: cleanApellido,
      articulo: cleanArticulo,
      funciona_bien: funcionaBien,
      motivo_venta: funcionaBien ? cleanMotivo : null,
      descripcion_problema: !funcionaBien ? cleanProblema : null,
      ciudad: cleanCiudad,
      precio_estimado: cleanPrecio,
      metodo_contacto: metodoContacto === "gmail" ? "gmail" : null,
      contacto: buildContacto(),
      opcion_venta: opcionVenta,
      direccion: opcionVenta === "domicilio" ? cleanDireccion : null,
      disponibilidad: opcionVenta === "entrega" ? disponibilidad : null,
      mayor_edad: mayorEdad,
      genero,
      status: "nuevo",
    };

    try {
      // Sin .select(): sin sesión no se puede leer la fila recién creada (ver newSellRequestId).
      const { error } = await supabase.from("sell_requests").insert(payload);
      if (error) throw error;
      const insertedRow = { id: requestId };

      // La solicitud ya está guardada. Si hay fotos/vídeo, se suben aparte:
      // un fallo aquí no debe hacer parecer que se perdió toda la solicitud.
      if (insertedRow?.id && (mediaImages.length > 0 || mediaVideo)) {
        try {
          await uploadSellRequestMedia(insertedRow.id, mediaImages, mediaVideo);
        } catch (mediaErr) {
          console.error("Error subiendo fotos/vídeo de la solicitud:", mediaErr);
          setMediaUploadFailed(true);
        }
      }

      // Chat automático: con sesión iniciada, se abre (o reutiliza) ya la
      // conversación centrada en este artículo y se manda un primer mensaje
      // con el resumen del formulario, para no repetirlo por chat — así se
      // puede seguir la venta directamente aquí en vez de por otra red
      // social. Sin sesión no se puede (product_chats exige un cliente
      // real): se deja sentChatId a null y la confirmación de abajo invita
      // a iniciar sesión.
      let openedChatId: string | null = null;
      if (insertedRow?.id) {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          if (sessionData.session?.user) {
            const { data: chatId, error: chatErr } = await supabase.rpc(
              "get_or_create_sell_request_chat",
              { p_sell_request_id: insertedRow.id }
            );
            if (chatErr) throw chatErr;

            openedChatId = String(chatId);

            const resumen = [
              `Quiero vender: ${cleanArticulo}`,
              funcionaBien
                ? `Funciona bien. Motivo de venta: ${cleanMotivo}`
                : `No funciona bien: ${cleanProblema}`,
              `Ciudad: ${cleanCiudad}`,
              `Precio esperado: ${cleanPrecio}`,
            ].join("\n");

            await supabase
              .from("product_chat_messages")
              .insert({ chat_id: openedChatId, body: resumen });
          }
        } catch (chatCreateErr) {
          // La solicitud ya está guardada de todas formas: si falla abrir
          // el chat, no se pierde nada, solo no se abre la conversación.
          console.error("Error abriendo el chat de la solicitud de venta:", chatCreateErr);
          openedChatId = null;
        }
      }

      setSentChatId(openedChatId);
      setSent(true);
      trackEvent("vender_enviado", "Vender: enviado");
      if (leerOrigenVender() === "guia") trackEvent("vender_enviado_guia", "Vender: enviado desde la guía");
    } catch (e: any) {
      setFormErr(
        e?.message ?? "No se pudo enviar el formulario. Inténtalo de nuevo en unos segundos."
      );
    } finally {
      setSending(false);
    }
  }

  const showGmailHint = metodoContacto === "gmail" && !contactoValor.includes("@");
  const insets = useSafeAreaInsets();
  // Espacio entre apartados y entre campos emparejados: amplio en la página, el de siempre
  // en la ventana emergente.
  // Entre filas de campos: aire claro pero sin alargar el formulario de más (los campos ya van
  // en columnas).
  const gapCampos = comoPagina ? (isMobile ? 22 : 26) : isMobile ? 12 : 14;

  // Rejilla de campos: filas con columnas iguales que aprovechan el ancho. En el móvil, 2
  // columnas (Nombre | Apellido, Género | ¿Todo funciona?, Ciudad | Precio…); en pantallas
  // anchas, hasta 3 (Nombre | Apellido | Género, ¿Todo funciona? | motivo…). Los textos largos
  // (artículo, dirección, fotos) ocupan toda la fila. Dentro de cada fila los recuadros quedan
  // alineados abajo aunque una etiqueta ocupe dos líneas.
  const tresColumnas = !isMobile;
  const filaStyle = { flexDirection: "row" as const, gap: isMobile ? 12 : 16, alignItems: "stretch" as const };
  const campoStyle = { flex: 1, minWidth: 0, gap: 6, justifyContent: "flex-end" as const };
  // Dato que depende de un desplegable (número, correo, dirección, disponibilidad): al lado en
  // pantallas anchas; en el móvil, debajo y a todo el ancho para que no salga cortado.
  const campoDatoStyle = tresColumnas ? campoStyle : { width: "100%" as const, gap: 6 };
  // Pantallas anchas: «Contacto» y «Opción de venta» comparten fila mientras no hayan elegido;
  // al elegir, cada uno pasa a su propia fila (desplegable | dato) para que nada salga truncado.
  const contactoYOpcionEnFila = tresColumnas && !metodoContacto && !opcionVenta;

  const campoGenero = (
    <View style={campoStyle}>
      <FieldLabel dim={!!genero}>Género</FieldLabel>
      <SelectField
        options={GENERO_OPTIONS}
        value={genero}
        onChange={(v) => {
          setGenero(v);
          setFormErr(null);
        }}
        compact={twoCol}
      />
    </View>
  );

  const campoCiudad = (
    <View style={campoStyle}>
      <FieldLabel dim={!!ciudad.trim()}>¿En qué ciudad te encuentras?</FieldLabel>
      <FieldInput
        value={ciudad}
        onChangeText={(v) => {
          setCiudad(v);
          setFormErr(null);
        }}
        placeholder="Ej: Zaragoza"
        filled={!!ciudad.trim()}
      />
    </View>
  );

  const campoPrecio = (
    <View style={campoStyle}>
      <FieldLabel dim={!!precioEstimado.trim()}>¿Cuánto estimas recibir por tu artículo?</FieldLabel>
      <FieldInput
        value={precioEstimado}
        onChangeText={(v) => {
          setPrecioEstimado(v);
          setFormErr(null);
        }}
        placeholder="Ej: 150€"
        filled={!!precioEstimado.trim()}
      />
    </View>
  );

  const campoFunciona = (
    <View style={campoStyle}>
      <FieldLabel dim={funcionaBien !== null}>¿Todo funciona perfectamente?</FieldLabel>
      <YesNoSelect
        value={funcionaBien}
        onChange={(v) => {
          setFuncionaBien(v);
          setFormErr(null);
        }}
        compact={twoCol}
      />
    </View>
  );

  const campoMotivoOProblema =
    funcionaBien === true ? (
      <View style={{ gap: 6 }}>
        <FieldLabel dim={!!motivoVenta.trim()}>¿Cuál es el motivo de la venta?</FieldLabel>
        <FieldInput
          value={motivoVenta}
          onChangeText={(v) => {
            setMotivoVenta(v);
            setFormErr(null);
          }}
          placeholder="Ej: ya no lo uso, cambio de consola..."
          multiline
          filled={!!motivoVenta.trim()}
        />
      </View>
    ) : funcionaBien === false ? (
      <View style={{ gap: 6 }}>
        <FieldLabel dim={!!descripcionProblema.trim()}>
          ¿Puedes hacernos una breve descripción de qué es lo que le sucede?
        </FieldLabel>
        <FieldInput
          value={descripcionProblema}
          onChangeText={(v) => {
            setDescripcionProblema(v);
            setFormErr(null);
          }}
          placeholder="Ej: no lee discos, la batería no carga..."
          multiline
          filled={!!descripcionProblema.trim()}
        />
      </View>
    ) : null;

  // Página completa o ventana emergente. Es una función (no un componente) para que React
  // no vuelva a montar el formulario en cada pulsación y los campos no pierdan el foco.
  const envolver = (hijos: React.ReactNode) =>
    comoPagina ? (
      <View style={{ flex: 1, backgroundColor: "#FFFFFF", paddingTop: insets.top }}>{hijos}</View>
    ) : (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.60)",
            padding: isMobile ? 10 : 20,
            justifyContent: "center",
          }}
        >
          {hijos}
        </View>
      </Modal>
    );

  return (
    <IsMobileContext.Provider value={isMobile}>
      {envolver(
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: comoPagina ? "flex-start" : "center", paddingBottom: comoPagina ? 48 + insets.bottom : 0 }}
            keyboardShouldPersistTaps="handled"
          >
            <Animated.View
              style={{
                width: "100%",
                maxWidth: modalMaxWidth,
                alignSelf: "center",
                opacity: fadeAnim,
                transform: [{ scale: scaleAnim }],
              }}
            >
              <View
                style={
                  comoPagina
                    ? {
                        // Página: sin tarjeta, fondo limpio y mucho más aire entre apartados.
                        padding: isMobile ? 18 : 26,
                        paddingTop: isMobile ? 14 : 20,
                        gap: gapCampos,
                      }
                    : {
                        borderRadius: 22,
                        borderWidth: 1,
                        borderColor: COLORS.border,
                        backgroundColor: COLORS.bg2,
                        padding: isMobile ? 14 : 22,
                        gap: gapCampos,
                        ...softShadow(),
                      }
                }
              >
                {sent ? (
                  <View style={{ alignItems: "center", gap: 12, paddingVertical: comoPagina ? 64 : 10, paddingHorizontal: comoPagina ? 20 : 0 }}>
                    <View
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 28,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: COLORS.successBg,
                        borderWidth: 1,
                        borderColor: COLORS.successBorder,
                      }}
                    >
                      <Ionicons name="checkmark" size={28} color={COLORS.success} />
                    </View>

                    <Text
                      style={{
                        color: COLORS.text,
                        fontWeight: "900",
                        fontSize: 18,
                        textAlign: "center",
                      }}
                    >
                      ¡Formulario enviado!
                    </Text>

                    <Text style={{ color: COLORS.muted, textAlign: "center", lineHeight: 20 }}>
                      {sentChatId
                        ? "Hemos recibido los datos de tu artículo. Sigamos por chat para continuar con la venta."
                        : "Hemos recibido los datos de tu artículo. Nuestro equipo lo revisará y se pondrá en contacto contigo."}
                    </Text>

                    {mediaUploadFailed && (
                      <Text
                        style={{
                          color: COLORS.danger,
                          textAlign: "center",
                          lineHeight: 19,
                          fontSize: 13,
                          fontWeight: "700",
                        }}
                      >
                        Tu solicitud se guardó correctamente, pero no pudimos subir tus fotos o tu
                        vídeo. Puedes enviarlos directamente por el método de contacto que elegiste.
                      </Text>
                    )}

                    {!sentChatId && (
                      <Text
                        style={{
                          color: COLORS.muted,
                          textAlign: "center",
                          lineHeight: 19,
                          fontSize: 13,
                        }}
                      >
                        Inicia sesión para continuar la conversación por chat con nosotros, en vez de
                        por otra red social.
                      </Text>
                    )}

                    {sentChatId ? (
                      <AnimatedPressable
                        onPress={() => {
                          const targetChatId = sentChatId;
                          handleClose();
                          router.push({
                            pathname: "/chat/[chatId]",
                            params: { chatId: targetChatId },
                          } as unknown as Href);
                        }}
                        containerStyle={{ marginTop: 4 }}
                        style={({ pressed }) => ({
                          opacity: pressed ? 0.9 : 1,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 8,
                          borderRadius: 999,
                          paddingVertical: 12,
                          paddingHorizontal: 20,
                          backgroundColor: COLORS.accent,
                        })}
                      >
                        <Ionicons name="chatbubble-ellipses-outline" size={16} color="#FFFFFF" />
                        <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>Ir al chat con nosotros</Text>
                      </AnimatedPressable>
                    ) : (
                      <AnimatedPressable
                        onPress={() => {
                          handleClose();
                          router.push("/perfil" as Href);
                        }}
                        containerStyle={{ marginTop: 4 }}
                        style={({ pressed }) => ({
                          opacity: pressed ? 0.9 : 1,
                          borderRadius: 999,
                          paddingVertical: 12,
                          paddingHorizontal: 20,
                          backgroundColor: COLORS.accent,
                        })}
                      >
                        <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>Iniciar sesión</Text>
                      </AnimatedPressable>
                    )}

                    <AnimatedPressable
                      onPress={handleClose}
                      style={({ pressed }) => ({
                        opacity: pressed ? 0.85 : 1,
                        borderRadius: 999,
                        paddingVertical: 10,
                        paddingHorizontal: 18,
                        backgroundColor: "transparent",
                      })}
                    >
                      <Text style={{ color: COLORS.muted, fontWeight: "800" }}>Cerrar</Text>
                    </AnimatedPressable>
                  </View>
                ) : (
                  <>
                    <AnimatedPressable
                      onPress={handleClose}
                      containerStyle={{
                        position: "absolute",
                        top: comoPagina ? 6 : isMobile ? 12 : 16,
                        // En la página, la flecha de volver va arriba a la izquierda.
                        ...(comoPagina ? { left: isMobile ? 14 : 22 } : { right: isMobile ? 12 : 16 }),
                        zIndex: 2,
                        width: 32,
                        height: 32,
                      }}
                      style={({ pressed }) => ({
                        flex: 1,
                        opacity: pressed ? 0.8 : 1,
                        borderRadius: 16,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: COLORS.card,
                        borderWidth: 1,
                        borderColor: COLORS.border,
                      })}
                    >
                      <Ionicons name={comoPagina ? "chevron-back" : "close"} size={18} color={COLORS.text} />
                    </AnimatedPressable>

                    <View style={{ alignItems: "center", paddingHorizontal: 34 }}>
                      <Text
                        style={{
                          color: COLORS.text,
                          fontSize: isMobile ? 18 : 21,
                          fontWeight: "900",
                          lineHeight: isMobile ? 24 : 26,
                          textAlign: "center",
                        }}
                      >
                        Vender mi artículo
                      </Text>
                      <Text
                        style={{
                          color: COLORS.muted,
                          marginTop: 4,
                          lineHeight: 20,
                          textAlign: "center",
                        }}
                      >
                        Cuéntanos lo básico y te contactamos con una propuesta.
                      </Text>
                    </View>

                    {/* Nombre + Apellido (+ Género cuando caben 3 columnas) */}
                    <View style={filaStyle}>
                      <View style={campoStyle}>
                        <FieldLabel dim={nombreValido}>Nombre</FieldLabel>
                        <FieldInput
                          value={nombre}
                          onChangeText={(v) => {
                            setNombre(v);
                            setFormErr(null);
                          }}
                          placeholder="Tu nombre"
                          filled={nombreValido}
                        />
                      </View>
                      <View style={campoStyle}>
                        <FieldLabel dim={apellidoValido}>Apellido</FieldLabel>
                        <FieldInput
                          value={apellido}
                          onChangeText={(v) => {
                            setApellido(v);
                            setFormErr(null);
                          }}
                          placeholder="Tu apellido"
                          filled={apellidoValido}
                        />
                      </View>
                      {tresColumnas ? campoGenero : null}
                    </View>

                    {/* Móvil: Género y Ciudad comparten fila (2 columnas). */}
                    {!tresColumnas ? (
                      <View style={filaStyle}>
                        {campoGenero}
                        {campoCiudad}
                      </View>
                    ) : null}

                    <View style={{ gap: 6 }}>
                      <FieldLabel dim={!!articulo.trim()}>¿Qué artículo de electrónica o relacionado quieres vender?</FieldLabel>
                      <FieldInput
                        value={articulo}
                        onChangeText={(v) => {
                          setArticulo(v);
                          setFormErr(null);
                        }}
                        placeholder="Ej: PlayStation 5 con dos mandos"
                        multiline
                        filled={!!articulo.trim()}
                      />
                    </View>

                    {/* Pantallas anchas: «¿Todo funciona?» y, a su lado, el motivo o el problema.
                        Móvil: «¿Todo funciona?» con el precio, y el motivo o el problema debajo. */}
                    {tresColumnas ? (
                      <>
                        <View style={filaStyle}>
                          {campoFunciona}
                          {campoCiudad}
                          {campoPrecio}
                        </View>
                        {campoMotivoOProblema}
                      </>
                    ) : (
                      <>
                        <View style={filaStyle}>
                          {campoFunciona}
                          {campoPrecio}
                        </View>
                        {campoMotivoOProblema}
                      </>
                    )}

                    {/* Método de contacto + su campo condicional en pareja cuando hay uno elegido */}
                    {/* Pantallas anchas: «Contacto» y «Opción de venta» comparten fila (2 columnas). */}
                    <View style={contactoYOpcionEnFila ? { ...filaStyle, alignItems: "flex-start" } : { gap: gapCampos }}>
                    {/* En el móvil el dato va DEBAJO del desplegable, a todo el ancho: en media fila el
                        correo y la dirección salían cortados. En pantallas anchas, al lado. */}
                    <View style={{ ...filaStyle, flexDirection: metodoContacto && tresColumnas ? "row" : "column", ...(contactoYOpcionEnFila ? { flex: 1, minWidth: 0 } : { gap: gapCampos }) }}>
                      <View style={metodoContacto && tresColumnas ? campoStyle : { width: "100%", gap: 6 }}>
                        <FieldLabel dim={!!metodoContacto}>¿Cómo prefieres que te contactemos?</FieldLabel>
                        <SelectField
                          options={METODO_OPTIONS}
                          value={metodoContacto}
                          onChange={(v) => {
                            setMetodoContacto(v);
                            setContactoValor("");
                            setFormErr(null);
                          }}
                          compact={twoCol && !metodoContacto}
                        />
                      </View>

                      {metodoContacto === "gmail" && (
                        <View style={campoDatoStyle}>
                          <FieldLabel dim={contactoValido}>Tu email de Gmail</FieldLabel>
                          <FieldInput
                            value={contactoValor}
                            onChangeText={(v) => {
                              setContactoValor(v);
                              setFormErr(null);
                            }}
                            placeholder="tunombre@gmail.com"
                            keyboardType="email-address"
                            autoCapitalize="none"
                            autoCorrect={false}
                            filled={contactoValido}
                          />
                          {showGmailHint && (
                            <AnimatedPressable
                              onPress={() =>
                                setContactoValor((v) => (v.includes("@") ? v : `${v}@gmail.com`))
                              }
                              containerStyle={{ alignSelf: "center" }}
                              style={({ pressed }) => ({
                                paddingVertical: 6,
                                paddingHorizontal: 10,
                                borderRadius: 999,
                                borderWidth: 1,
                                borderColor: COLORS.accentBorder,
                                backgroundColor: COLORS.accent2,
                                opacity: pressed ? 0.85 : 1,
                              })}
                            >
                              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
                                + Añadir @gmail.com
                              </Text>
                            </AnimatedPressable>
                          )}
                        </View>
                      )}

                      {/* Chat de la tienda: no pide ningún dato. Si no hay sesión, se avisa; si los avisos
                          del navegador no están activados, se ofrece activarlos (si ya lo están, no sale
                          nada). */}
                      {metodoContacto === "chat" && (!haySesion || (estadoNotif !== "activadas" && estadoNotif !== "no-disponibles")) && (
                        <View style={{ ...campoDatoStyle, alignItems: "center", gap: 10 }}>
                          {!haySesion ? (
                            <Text style={{ color: COLORS.muted, fontSize: 13, lineHeight: 19, textAlign: "center", fontWeight: "700" }}>
                              Para hablar por el chat necesitas iniciar sesión. Si prefieres no hacerlo, elige Gmail.
                            </Text>
                          ) : null}
                          {estadoNotif === "pendientes" ? (
                            <>
                              <Text style={{ color: COLORS.text, fontSize: 13.5, lineHeight: 19, textAlign: "center", fontWeight: "800" }}>
                                Activa las notificaciones y te avisamos en cuanto te escribamos.
                              </Text>
                              <AnimatedPressable
                                onPress={async () => setEstadoNotif(await activarNotificaciones())}
                                containerStyle={{ alignSelf: "stretch" }}
                                style={{
                                  minHeight: 48,
                                  borderRadius: 999,
                                  backgroundColor: COLORS.accent,
                                  flexDirection: "row",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  gap: 8,
                                  paddingHorizontal: 16,
                                }}
                              >
                                <Ionicons name="notifications-outline" size={18} color="#FFFFFF" />
                                <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 15 }}>Activar notificaciones</Text>
                              </AnimatedPressable>
                            </>
                          ) : null}
                          {estadoNotif === "bloqueadas" ? (
                            <Text style={{ color: COLORS.muted, fontSize: 13, lineHeight: 19, textAlign: "center", fontWeight: "700" }}>
                              Tienes las notificaciones bloqueadas en este navegador. Actívalas en los ajustes del sitio para enterarte al momento.
                            </Text>
                          ) : null}
                          {estadoNotif === "instalar" ? (
                            <Text style={{ color: COLORS.muted, fontSize: 13, lineHeight: 19, textAlign: "center", fontWeight: "700" }}>
                              En iPhone, para recibir avisos instala antes la tienda en tu pantalla de inicio (botón «Instalar la tienda como app» del panel de Blue).
                            </Text>
                          ) : null}
                        </View>
                      )}
                    </View>

                    {/* Opción de venta + su campo condicional en pareja cuando hay una elegida */}
                    <View style={{ ...filaStyle, flexDirection: opcionVenta && tresColumnas ? "row" : "column", ...(contactoYOpcionEnFila ? { flex: 1, minWidth: 0 } : { gap: gapCampos }) }}>
                      <View style={opcionVenta && tresColumnas ? campoStyle : { width: "100%", gap: 6 }}>
                        <FieldLabel dim={!!opcionVenta}>Opción de venta</FieldLabel>
                        <SelectField
                          options={OPCION_VENTA_OPTIONS}
                          value={opcionVenta}
                          onChange={(v) => {
                            setOpcionVenta(v);
                            setFormErr(null);
                          }}
                          compact={twoCol && !opcionVenta}
                        />
                      </View>

                      {opcionVenta === "domicilio" && (
                        <View style={campoDatoStyle}>
                          <FieldLabel dim={!!direccion.trim()}>Dirección completa</FieldLabel>
                          <FieldInput
                            value={direccion}
                            onChangeText={(v) => {
                              setDireccion(v);
                              setFormErr(null);
                            }}
                            placeholder="Calle, número, puerta y letra"
                            multiline
                            filled={!!direccion.trim()}
                          />
                        </View>
                      )}

                      {opcionVenta === "entrega" && (
                        <View style={campoDatoStyle}>
                          <FieldLabel dim={!!disponibilidad}>Disponibilidad diaria</FieldLabel>
                          <SelectField
                            options={DISPONIBILIDAD_OPTIONS}
                            value={disponibilidad}
                            onChange={(v) => {
                              setDisponibilidad(v);
                              setFormErr(null);
                            }}
                          />
                        </View>
                      )}
                    </View>
                    </View>

                    {/* Fotos y vídeo: opcional, no cuenta para el progreso del formulario */}
                    <View style={{ gap: 6 }}>
                      <FieldLabel dim={mediaImages.length > 0 || !!mediaVideo}>
                        Fotos y vídeo del artículo (opcional)
                      </FieldLabel>
                      <SellMediaPicker
                        images={mediaImages}
                        video={mediaVideo}
                        onImagesChange={setMediaImages}
                        onVideoChange={setMediaVideo}
                        disabled={sending}
                      />
                    </View>

                    <Checkbox
                      checked={mayorEdad}
                      onToggle={() => {
                        setMayorEdad((v) => !v);
                        setFormErr(null);
                      }}
                      label="Confirmo que soy mayor de 18 años"
                    />

                    {!!formErr && (
                      <View
                        style={{
                          borderRadius: 14,
                          borderWidth: 1,
                          borderColor: COLORS.dangerBorder,
                          backgroundColor: COLORS.dangerBg,
                          padding: 10,
                        }}
                      >
                        <Text
                          style={{
                            color: COLORS.danger,
                            fontWeight: "800",
                            lineHeight: 20,
                            textAlign: "center",
                          }}
                        >
                          {formErr}
                        </Text>
                      </View>
                    )}

                    {/* Botón de enviar: se rellena de color según el % completado y solo
                        se puede pulsar al llegar al 100%. */}
                    <Animated.View
                      style={{
                        opacity: buttonOpacity,
                        borderRadius: 14,
                        overflow: "hidden",
                        borderWidth: 1,
                        borderColor: COLORS.accentDark,
                        marginTop: 4,
                        transform: [{ scale: submitScale }],
                      }}
                    >
                      <View
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          backgroundColor: COLORS.accentDark,
                        }}
                      />
                      <Animated.View
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          bottom: 0,
                          width: fillWidth,
                          backgroundColor: COLORS.accent,
                        }}
                      />

                      <Pressable
                        onPress={handleSubmit}
                        onPressIn={submitPressIn}
                        onPressOut={submitPressOut}
                        disabled={sending || !progress.canSubmit}
                        style={({ pressed }) => ({
                          paddingVertical: isMobile ? 13 : 14,
                          alignItems: "center",
                          opacity: pressed && progress.canSubmit ? 0.9 : 1,
                        })}
                      >
                        {sending ? (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                            <ActivityIndicator color="#FFFFFF" />
                            <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 15 }}>
                              Enviando…
                            </Text>
                          </View>
                        ) : (
                          <View style={{ alignItems: "center" }}>
                            <Text
                              style={{
                                color: "#FFFFFF",
                                fontWeight: "900",
                                fontSize: 15,
                                textAlign: "center",
                              }}
                            >
                              Enviar Formulario
                            </Text>
                            {progress.percent < 100 && (
                              <Text
                                style={{
                                  color: "rgba(255,255,255,0.85)",
                                  fontWeight: "800",
                                  fontSize: 12,
                                  marginTop: 2,
                                }}
                              >
                                {progress.percent}% completado
                              </Text>
                            )}
                          </View>
                        )}
                      </Pressable>
                    </Animated.View>
                  </>
                )}
              </View>
            </Animated.View>
          </ScrollView>
      )}
    </IsMobileContext.Provider>
  );
}
