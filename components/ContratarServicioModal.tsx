// components/ContratarServicioModal.tsx
/**
 * Qué hace: modal ("pop") que se abre al pulsar "Contratar servicio ahora"
 * en la ficha de un servicio (app/servicio/[id].tsx). Es el formulario para
 * clientes que quieren contratar ese servicio: la opción del servicio (si
 * tiene, p. ej. «Básica» o «Completa», con su precio), datos de contacto
 * (nombre, apellido, método de contacto y su dato), ciudad, dónde podemos
 * recogerlo, disponibilidad horaria y un comentario libre con los detalles.
 * Al enviarlo se guarda directamente en Supabase (tabla "service_requests",
 * ver sql/service_requests.sql) — no se envía ningún email.
 *
 * Cómo funciona:
 * - Opciones del servicio (dueño, 2026-11-08): las escribe el administrador
 *   en Administración → Servicios (services.modalidades, migración
 *   20261108230000). Se eligen con el desplegable del propio móvil
 *   (SelectorIOS: en el iPhone, la rueda de iOS); sale elegida la que el
 *   cliente tenía en la ficha. El precio de la solicitud lo pone la base de
 *   datos, no el navegador.
 * - Con sesión, los datos se rellenan solos (dueño, 2026-11-08): de su última
 *   solicitud de servicio (nombre, apellido, contacto y ciudad) y, si no
 *   tiene, de su perfil (nombre, localidad) y del email de su cuenta. Solo se
 *   rellena lo que está vacío.
 * - El botón de enviar siempre responde (dueño, 2026-11-08): si falta algo
 *   dice «Te falta: apellido y contacto» y, al tocarlo, lleva al primer campo
 *   vacío.
 * - Tras enviar, UNA sola píldora azul (lección «una sola píldora azul por
 *   pantalla»): «Ver en Mis seguimientos» con sesión; «Cerrar» va como texto.
 * - Analítica (Administración → Analítica, #analitica-contratar-servicio):
 *   ventana abierta, solicitud enviada, cerrada sin enviar y qué faltaba, por
 *   servicio. trackEvent respeta a quien rechazó la analítica.
 *
 * Conectado con:
 * - sql/service_requests.sql y supabase/migrations/20261108230000_servicios_opciones.sql.
 * - app/servicio/[id].tsx → quien monta y abre este modal (servicio, opciones y la opción elegida en la ficha).
 * - app/admin/services.tsx (pestaña "Solicitudes") → donde se revisa cada envío, con su opción.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Modal, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { supabase } from "../lib/supabase";
import { trackEvent } from "../lib/analytics";
import { SelectorIOS } from "../lib/admin/products.components";

const COLORS = {
  bg: "#FFFFFF",
  card: "#F6FAFD",
  cardSoft: "#F8FBFE",
  border: "#E3EAF2",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  muted2: "rgba(11,33,56,0.62)",
  accent: "#1EA7E8",
  accent2: "#EAF6FD",
  accentBorder: "#BEE6FA",
  accentDark: "#1EA7E8",
  success: "#15803D",
  successBg: "#DCFCE7",
  successBorder: "#86EFAC",
  danger: "#B91C1C",
  dangerBg: "#FFE4E6",
  dangerBorder: "#FDA4AF",
};

const modalColumnStyle = { width: "100%", maxWidth: 560, alignSelf: "center" } as const;

// --- Opciones de un servicio (services.modalidades) ---------------------------------------------------------------
export type ModalidadServicio = { nombre: string; precio_eur: number };

// Lee las opciones tal como vienen de la base de datos, descartando lo que no tenga nombre o precio válido.
export function leerModalidades(valor: unknown): ModalidadServicio[] {
  if (!Array.isArray(valor)) return [];
  const vistas = new Set<string>();
  const out: ModalidadServicio[] = [];
  for (const v of valor) {
    const nombre = typeof v?.nombre === "string" ? v.nombre.trim() : "";
    const precio = Number(v?.precio_eur);
    if (!nombre || !Number.isFinite(precio) || precio < 0 || vistas.has(nombre)) continue;
    vistas.add(nombre);
    out.push({ nombre, precio_eur: Math.round(precio * 100) / 100 });
  }
  return out;
}

// Precio con dos decimales, coma decimal y miles con punto (45,00€ · 1.299,00€).
export function fmtEURServicio(n: number) {
  const v = Number(n);
  const cents = Math.round((Number.isFinite(v) ? v : 0) * 100);
  const [ent, dec] = (Math.abs(cents) / 100).toFixed(2).split(".");
  return `${cents < 0 ? "-" : ""}${ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}€`;
}

type MetodoContacto = "whatsapp" | "gmail" | "instagram" | "facebook" | "tiktok";
type Disponibilidad = "manana" | "mediodia" | "tardenoche";

const METODO_OPTIONS: { value: MetodoContacto; label: string; prefix: string; placeholder: string }[] = [
  { value: "whatsapp", label: "WhatsApp", prefix: "+34", placeholder: "600 000 000" },
  { value: "gmail", label: "Gmail", prefix: "", placeholder: "tucorreo@gmail.com" },
  { value: "instagram", label: "Instagram", prefix: "@", placeholder: "usuario" },
  { value: "facebook", label: "Facebook", prefix: "@", placeholder: "usuario" },
  { value: "tiktok", label: "TikTok", prefix: "@", placeholder: "usuario" },
];

const DISPONIBILIDAD_OPTIONS: { value: Disponibilidad; label: string }[] = [
  { value: "manana", label: "Mañana" },
  { value: "mediodia", label: "Mediodía" },
  { value: "tardenoche", label: "Tarde y noche" },
];

// Campos obligatorios, en el orden del formulario (para «Te falta: …» y para llevar al primero que falte).
type CampoObligatorio = "nombre" | "apellido" | "metodo" | "contacto" | "ciudad";
const NOMBRE_CAMPO: Record<CampoObligatorio, string> = {
  nombre: "nombre",
  apellido: "apellido",
  metodo: "método de contacto",
  contacto: "contacto",
  ciudad: "ciudad",
};

// «nombre, apellido y contacto»
function enumerar(partes: string[]) {
  if (partes.length <= 1) return partes.join("");
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}

// ¿Falta una columna? (migración sin aplicar): se repite sin ella.
function faltaColumna(error: unknown) {
  const e = error as { code?: string; message?: string } | null;
  return !!e && (e.code === "42703" || e.code === "PGRST204" || /column .* does not exist|Could not find the .* column/i.test(e.message ?? ""));
}

function AnimatedPressable({
  onPress,
  disabled,
  children,
  style,
  nativeID,
}: {
  onPress: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  style?: any;
  nativeID?: string;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  function pressIn() {
    Animated.spring(scale, { toValue: 0.95, useNativeDriver: true, speed: 30, bounciness: 6 }).start();
  }
  function pressOut() {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 6 }).start();
  }

  return (
    <Pressable nativeID={nativeID} onPress={onPress} disabled={disabled} onPressIn={pressIn} onPressOut={pressOut}>
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 13 }}>{children}</Text>;
}

function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  prefix,
  flex,
  inputRef,
  onLayoutY,
  nativeID,
  marcado,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  prefix?: string;
  flex?: number;
  inputRef?: React.RefObject<TextInput | null>;
  onLayoutY?: (y: number) => void;
  nativeID?: string;
  // Falta y el cliente ya intentó enviar: borde de aviso.
  marcado?: boolean;
}) {
  return (
    <View style={{ gap: 6, flex }} onLayout={onLayoutY ? (e) => onLayoutY(e.nativeEvent.layout.y) : undefined}>
      <FieldLabel>{label}</FieldLabel>
      <View
        style={{
          flexDirection: "row",
          alignItems: multiline ? "flex-start" : "center",
          borderWidth: 1,
          borderColor: marcado ? COLORS.accent : COLORS.border,
          borderRadius: 14,
          backgroundColor: COLORS.cardSoft,
          paddingHorizontal: 14,
          paddingVertical: multiline ? 12 : 2,
        }}
      >
        {!!prefix && (
          <Text style={{ color: COLORS.muted, fontWeight: "800", fontSize: 16, marginRight: 2 }}>{prefix}</Text>
        )}
        <TextInput
          ref={inputRef}
          nativeID={nativeID}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={COLORS.muted2}
          multiline={!!multiline}
          style={{
            flex: 1,
            fontSize: 16,
            color: COLORS.text,
            paddingVertical: multiline ? 0 : 10,
            minHeight: multiline ? 80 : undefined,
            textAlignVertical: multiline ? "top" : "center",
          }}
        />
      </View>
    </View>
  );
}

function ChipGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  onLayoutY,
  nativeID,
  marcado,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  onLayoutY?: (y: number) => void;
  nativeID?: string;
  marcado?: boolean;
}) {
  return (
    <View nativeID={nativeID} style={{ gap: 8 }} onLayout={onLayoutY ? (e) => onLayoutY(e.nativeEvent.layout.y) : undefined}>
      <FieldLabel>{label}</FieldLabel>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <AnimatedPressable key={opt.value} onPress={() => onChange(opt.value)}>
              <View
                style={{
                  paddingVertical: 9,
                  paddingHorizontal: 14,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: active || marcado ? COLORS.accentBorder : COLORS.border,
                  backgroundColor: active ? COLORS.accent2 : COLORS.cardSoft,
                }}
              >
                <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 13 }}>{opt.label}</Text>
              </View>
            </AnimatedPressable>
          );
        })}
      </View>
    </View>
  );
}

export default function ContratarServicioModal({
  visible,
  service,
  modalidadInicial,
  onClose,
}: {
  visible: boolean;
  service: { id: string; title: string; modalidades?: ModalidadServicio[] } | null;
  // La opción que el cliente tenía elegida en la ficha (si el servicio tiene opciones).
  modalidadInicial?: string | null;
  onClose: () => void;
}) {
  const { width } = useWindowDimensions();
  const widthSafe = width && width > 0 ? width : 1024;
  const isMobile = widthSafe < 700;

  const modalidades = useMemo(() => service?.modalidades ?? [], [service]);
  const [modalidad, setModalidad] = useState<string>("");
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [metodo, setMetodo] = useState<MetodoContacto | null>(null);
  const [contacto, setContacto] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [direccion, setDireccion] = useState("");
  const [disponibilidad, setDisponibilidad] = useState<Disponibilidad | null>(null);
  const [comentario, setComentario] = useState("");

  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // El cliente ya tocó «Te falta…»: se marcan los campos que faltan.
  const [intentado, setIntentado] = useState(false);
  // Usuario con sesión (si lo hay): la solicitud queda vinculada a su Perfil → Seguimientos
  const [userId, setUserId] = useState<string | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const refs = {
    nombre: useRef<TextInput>(null),
    apellido: useRef<TextInput>(null),
    contacto: useRef<TextInput>(null),
    ciudad: useRef<TextInput>(null),
  };
  // Posición de cada campo dentro del formulario (para llevar al que falta).
  const posiciones = useRef<Record<string, number>>({});
  const enviadaRef = useRef(false);

  const etiqueta = service?.title ?? "servicio";
  const ruta = `/servicio/${service?.id ?? ""}`;

  // Al abrir: la opción de la ficha, la sesión y los datos que ya conocemos de este cliente.
  useEffect(() => {
    if (!visible || !service) return;
    enviadaRef.current = false;
    setModalidad(
      modalidadInicial && modalidades.some((m) => m.nombre === modalidadInicial) ? modalidadInicial : modalidades[0]?.nombre ?? ""
    );
    trackEvent("servicio_ventana", `Contratar: ventana abierta · ${service.title}`, { path: `/servicio/${service.id}` });
    let vivo = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const user = data.session?.user ?? null;
        if (!vivo) return;
        setUserId(user?.id ?? null);
        if (!user) return;
        // 1) Su última solicitud de servicio (el contacto que ya usó).
        const { data: ultima } = await supabase
          .from("service_requests")
          .select("nombre,apellido,metodo_contacto,contacto,ciudad")
          .eq("customer_user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        // 2) Su perfil (nombre completo y localidad).
        const { data: perfil } = await supabase
          .from("perfiles_cliente")
          .select("nombre,localidad,provincia")
          .eq("user_id", user.id)
          .maybeSingle();
        if (!vivo) return;
        const u = (ultima ?? null) as { nombre?: string; apellido?: string; metodo_contacto?: MetodoContacto | null; contacto?: string | null; ciudad?: string } | null;
        const p = (perfil ?? null) as { nombre?: string | null; localidad?: string | null; provincia?: string | null } | null;
        const partes = String(p?.nombre ?? "").trim().split(/\s+/).filter(Boolean);
        const nombrePerfil = partes[0] ?? "";
        const apellidoPerfil = partes.slice(1).join(" ");
        const metodoValido = METODO_OPTIONS.some((m) => m.value === u?.metodo_contacto) ? (u?.metodo_contacto as MetodoContacto) : null;
        setNombre((v) => v || u?.nombre || nombrePerfil);
        setApellido((v) => v || u?.apellido || apellidoPerfil);
        setCiudad((v) => v || u?.ciudad || p?.localidad || p?.provincia || "");
        if (metodoValido && u?.contacto) {
          setMetodo((v) => v ?? metodoValido);
          setContacto((v) => v || String(u.contacto));
        } else if (user.email) {
          setMetodo((v) => v ?? "gmail");
          setContacto((v) => v || String(user.email));
        }
      } catch {
        if (vivo) setUserId(null);
      }
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, service?.id]);

  const metodoOption = useMemo(() => METODO_OPTIONS.find((m) => m.value === metodo) ?? null, [metodo]);
  const opcionElegida = modalidades.find((m) => m.nombre === modalidad) ?? null;

  const faltan: CampoObligatorio[] = [
    ...(nombre.trim().length >= 2 ? [] : (["nombre"] as const)),
    ...(apellido.trim().length >= 2 ? [] : (["apellido"] as const)),
    ...(metodo ? [] : (["metodo"] as const)),
    ...(!metodo || contacto.trim().length >= 3 ? [] : (["contacto"] as const)),
    ...(ciudad.trim().length >= 2 ? [] : (["ciudad"] as const)),
  ];
  const isValid = faltan.length === 0;

  function reset() {
    setModalidad("");
    setNombre("");
    setApellido("");
    setMetodo(null);
    setContacto("");
    setCiudad("");
    setDireccion("");
    setDisponibilidad(null);
    setComentario("");
    setSending(false);
    setSent(false);
    setError(null);
    setIntentado(false);
  }

  function handleClose() {
    if (!enviadaRef.current && service) {
      trackEvent("servicio_ventana", `Contratar: cerrada sin enviar · ${service.title}`, { path: ruta });
    }
    onClose();
    setTimeout(reset, 250);
  }

  // Lleva al primer campo que falta y lo enfoca.
  function irAlQueFalta() {
    const primero = faltan[0];
    if (!primero) return;
    setIntentado(true);
    trackEvent("servicio_ventana", `Contratar: le faltaba · ${NOMBRE_CAMPO[primero]}`, { path: ruta, metadata: { faltan } });
    const y = posiciones.current[primero];
    if (typeof y === "number") scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
    const ref = primero === "metodo" ? null : refs[primero];
    setTimeout(() => ref?.current?.focus(), 250);
  }

  async function submit() {
    if (!service || sending) return;
    if (!isValid) {
      irAlQueFalta();
      return;
    }

    setSending(true);
    setError(null);

    const fila = {
      service_id: service.id,
      service_title: service.title,
      nombre: nombre.trim(),
      apellido: apellido.trim(),
      metodo_contacto: metodo,
      contacto: contacto.trim(),
      ciudad: ciudad.trim(),
      direccion: direccion.trim() || null,
      disponibilidad,
      comentario: comentario.trim() || null,
      // El trigger de la BD también lo fija con auth.uid(); invitado → null
      customer_user_id: userId,
    };
    try {
      // Con la opción elegida (su precio lo pone la base de datos); sin la migración 20261108230000, sin ella.
      let { error: insertError } = await supabase
        .from("service_requests")
        .insert(opcionElegida ? { ...fila, modalidad: opcionElegida.nombre } : fila);
      if (insertError && opcionElegida && faltaColumna(insertError)) {
        ({ error: insertError } = await supabase.from("service_requests").insert(fila));
      }

      if (insertError) throw insertError;
      enviadaRef.current = true;
      trackEvent("servicio_ventana", `Contratar: solicitud enviada · ${service.title}`, {
        path: ruta,
        metadata: { opcion: opcionElegida?.nombre ?? null, recogida: !!direccion.trim(), metodo },
      });
      setSent(true);
    } catch (e: any) {
      console.error("Error enviando la solicitud de servicio:", e);
      setError("No se pudo enviar la solicitud. Inténtalo de nuevo en unos instantes.");
    } finally {
      setSending(false);
    }
  }

  const marca = (campo: CampoObligatorio) => intentado && faltan.includes(campo);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(11,33,56,0.55)", padding: 16, justifyContent: "center" }}>
        <View
          style={{
            ...modalColumnStyle,
            maxHeight: "90%",
            borderRadius: 22,
            backgroundColor: COLORS.bg,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              padding: 16,
              borderBottomWidth: 1,
              borderBottomColor: COLORS.border,
            }}
          >
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 17, flex: 1 }} numberOfLines={1}>
              {sent ? "Solicitud enviada" : `Contratar: ${etiqueta}`}
            </Text>
            <Pressable onPress={handleClose} accessibilityLabel="Cerrar" style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, padding: 4 })}>
              <Ionicons name="close" size={22} color={COLORS.text} />
            </Pressable>
          </View>

          {sent ? (
            <View nativeID="contratar-enviada" style={{ padding: 24, alignItems: "center", gap: 12 }}>
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: COLORS.successBg,
                  borderWidth: 1,
                  borderColor: COLORS.successBorder,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="checkmark" size={28} color={COLORS.success} />
              </View>
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16, textAlign: "center" }}>
                ¡Solicitud recibida!
              </Text>
              <Text style={{ color: COLORS.muted, textAlign: "center", lineHeight: 20 }}>
                Nos pondremos en contacto contigo lo antes posible para confirmar los detalles de «{service?.title}
                {opcionElegida ? ` · ${opcionElegida.nombre}` : ""}».
              </Text>
              {userId ? (
                <AnimatedPressable
                  nativeID="contratar-ver-seguimientos"
                  onPress={() => {
                    handleClose();
                    router.push("/perfil?tab=seguimientos");
                  }}
                >
                  <View
                    style={{
                      marginTop: 4,
                      borderRadius: 999,
                      paddingVertical: 12,
                      paddingHorizontal: 24,
                      backgroundColor: COLORS.accentDark,
                    }}
                  >
                    <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>Ver en Mis seguimientos</Text>
                  </View>
                </AnimatedPressable>
              ) : (
                <Text style={{ color: COLORS.muted2, textAlign: "center", fontSize: 12.5, lineHeight: 18 }}>
                  Inicia sesión para seguir tu reparación en Perfil → Mis seguimientos
                </Text>
              )}
              {/* Una sola píldora azul por pantalla: con sesión, «Cerrar» es solo texto; sin sesión, es la acción. */}
              {userId ? (
                <Pressable
                  nativeID="contratar-cerrar"
                  onPress={handleClose}
                  accessibilityRole="button"
                  style={({ pressed }) => ({ minHeight: 44, justifyContent: "center", paddingHorizontal: 16, opacity: pressed ? 0.7 : 1 })}
                >
                  <Text style={{ color: COLORS.accent, fontWeight: "900", fontSize: 15 }}>Cerrar</Text>
                </Pressable>
              ) : (
                <AnimatedPressable nativeID="contratar-cerrar" onPress={handleClose}>
                  <View
                    style={{
                      marginTop: 4,
                      borderRadius: 999,
                      paddingVertical: 12,
                      paddingHorizontal: 24,
                      backgroundColor: COLORS.accent,
                    }}
                  >
                    <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>Cerrar</Text>
                  </View>
                </AnimatedPressable>
              )}
            </View>
          ) : (
            <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
              {/* La opción del servicio (Básica, Completa…), con el desplegable del propio móvil. */}
              {modalidades.length ? (
                <SelectorIOS
                  nativeID="contratar-opcion"
                  label="Opción del servicio"
                  value={modalidad}
                  onChange={setModalidad}
                  options={modalidades.map((m) => ({ value: m.nombre, label: `${m.nombre} · ${fmtEURServicio(m.precio_eur)}` }))}
                />
              ) : null}

              <View
                style={{ flexDirection: isMobile ? "column" : "row", gap: 12 }}
                onLayout={(e) => {
                  posiciones.current.fila = e.nativeEvent.layout.y;
                }}
              >
                <TextField
                  label="Nombre"
                  nativeID="contratar-nombre"
                  value={nombre}
                  onChangeText={setNombre}
                  placeholder="Tu nombre"
                  flex={isMobile ? undefined : 1}
                  inputRef={refs.nombre}
                  marcado={marca("nombre")}
                  onLayoutY={(y) => {
                    posiciones.current.nombre = (posiciones.current.fila ?? 0) + y;
                  }}
                />
                <TextField
                  label="Apellido"
                  nativeID="contratar-apellido"
                  value={apellido}
                  onChangeText={setApellido}
                  placeholder="Tu apellido"
                  flex={isMobile ? undefined : 1}
                  inputRef={refs.apellido}
                  marcado={marca("apellido")}
                  onLayoutY={(y) => {
                    posiciones.current.apellido = (posiciones.current.fila ?? 0) + y;
                  }}
                />
              </View>

              <ChipGroup
                label="Método de contacto"
                nativeID="contratar-metodo"
                options={METODO_OPTIONS}
                value={metodo}
                onChange={setMetodo}
                marcado={marca("metodo")}
                onLayoutY={(y) => {
                  posiciones.current.metodo = y;
                }}
              />

              {metodoOption && (
                <TextField
                  label={`Tu ${metodoOption.label}`}
                  nativeID="contratar-contacto"
                  value={contacto}
                  onChangeText={setContacto}
                  placeholder={metodoOption.placeholder}
                  prefix={metodoOption.prefix || undefined}
                  inputRef={refs.contacto}
                  marcado={marca("contacto")}
                  onLayoutY={(y) => {
                    posiciones.current.contacto = y;
                  }}
                />
              )}

              <TextField
                label="Ciudad"
                nativeID="contratar-ciudad"
                value={ciudad}
                onChangeText={setCiudad}
                placeholder="Tu ciudad"
                inputRef={refs.ciudad}
                marcado={marca("ciudad")}
                onLayoutY={(y) => {
                  posiciones.current.ciudad = y;
                }}
              />
              <TextField
                label="Dirección (opcional)"
                nativeID="contratar-direccion"
                value={direccion}
                onChangeText={setDireccion}
                placeholder="Dónde podemos recogerlo"
              />

              <ChipGroup
                label="Disponibilidad (opcional)"
                options={DISPONIBILIDAD_OPTIONS}
                value={disponibilidad}
                onChange={setDisponibilidad}
              />

              <TextField
                label="Cuéntanos qué necesitas (opcional)"
                value={comentario}
                onChangeText={setComentario}
                placeholder="Detalles del problema, modelo del dispositivo, urgencia…"
                multiline
              />

              {!!error && (
                <View style={{ borderRadius: 12, borderWidth: 1, borderColor: COLORS.dangerBorder, backgroundColor: COLORS.dangerBg, padding: 10 }}>
                  <Text style={{ color: COLORS.danger, fontWeight: "700", fontSize: 12.5 }}>{error}</Text>
                </View>
              )}

              {!userId ? (
                <Text style={{ color: COLORS.muted2, textAlign: "center", fontSize: 12.5, lineHeight: 18 }}>
                  Inicia sesión para seguir tu reparación en Perfil → Mis seguimientos
                </Text>
              ) : null}

              {/* Siempre responde: si falta algo lo dice y lleva al primer campo vacío. */}
              <AnimatedPressable nativeID="contratar-enviar" onPress={submit} disabled={sending}>
                <View
                  style={{
                    borderRadius: 999,
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                    alignItems: "center",
                    backgroundColor: COLORS.accentDark,
                    opacity: sending ? 0.7 : 1,
                  }}
                >
                  <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 15, textAlign: "center" }}>
                    {sending
                      ? "Enviando…"
                      : isValid
                        ? opcionElegida
                          ? `Enviar solicitud · ${fmtEURServicio(opcionElegida.precio_eur)}`
                          : "Enviar solicitud"
                        : `Te falta: ${enumerar(faltan.map((c) => NOMBRE_CAMPO[c]))}`}
                  </Text>
                </View>
              </AnimatedPressable>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}
