/**
 * Archivo: app/(tabs)/perfil.tsx
 * Función: pantalla «Mi cuenta» (pestaña Perfil), en la dirección /perfil (admite ?tab=seguimientos y ?filtro=).
 * Para qué sirve: el cliente inicia sesión o crea cuenta, completa su perfil, sigue sus pedidos y reparaciones (facturas, pagos, valoraciones), ve sus «me gusta» y avisos de precio; el administrador accede desde aquí al panel.
 * Conectado con: lib/supabase.ts (Supabase Auth, tablas profiles, pedidos, pedido_facturas y las de reparaciones), lib/envio.ts, lib/interaccion.ts, lib/reservas.ts, lib/abrirEnlaceExterno.ts, lib/analiticaPropia.ts, constants/temaTienda.ts, components/PerfilPublico.tsx, AsistenteBlue.tsx, CarruselProductosCategoria.tsx, VentanaValoracion.tsx, VisorFotos.tsx, PieDePagina.tsx, ImagenInteligente.tsx, components/marca/*; api/pago.ts y api/factura.ts.
 * Utilizado por: Expo Router (dirección /perfil, pestaña de app/(tabs)/_layout.tsx); la abren app/(tabs)/chat-global.tsx (iniciar sesión), app/(tabs)/blue-ia.tsx (facturas), app/producto/[id].tsx y components/AsistenteBlue.tsx.
 * Dependencias: react, react-native, expo-router, @expo/vector-icons, @react-native-async-storage/async-storage.
 * Estado: ACTIVO · ZONA DELICADA: no tocar sin revisión del dueño (inicio de sesión, cuenta, pagos y facturas)
 */
/**
 * Notas:
 * Qué hace: pantalla "Mi cuenta" (pestaña Perfil). Antes de iniciar sesión
 * muestra un formulario de acceso/registro; una vez hay sesión, muestra
 * «Mi perfil» (foto, usuario, nombre, país, provincia y edad:
 * components/PerfilPublico.tsx, que también obliga a completarlo en el resto
 * de la tienda) con la cuenta dentro (subtítulo «Tu cuenta está activa», el
 * correo de la sesión en un recuadro más; «Cerrar sesión» dentro del desplegable
 * «Inicio de sesión y seguridad» (dueño, 2026-11-18) y, al pie, si el rol es
 * admin, «Panel de control»; encima, «Mejoras en la
 * tienda», que abre la cajita de ideas de components/VentanaValoracion.tsx) y la
 * pestaña «Mis seguimientos»; se cambia de pestaña tocándola o deslizando el
 * dedo. Al final, el pie de página (con las redes sociales, una sola vez).
 * En «Mis pedidos», cada pedido se llama por su referencia («Pedido VZ-XXXX-XXXX · total · fecha»), nunca por su número
 * interno (dueño, 2026-11-11); «Preguntar a Blue» le pasa esa referencia (?pedido=VZ-…).
 *
 * Cómo funciona:
 * - Usa Supabase Auth (supabase.auth.signInWithPassword / signUp / signOut /
 *   getSession) para el login y registro.
 * - Tras autenticar, consulta la tabla "profiles" (columna "role") para saber
 *   si la cuenta es "admin" o "user" y así decidir qué se muestra.
 * - Sesión que cambia sola (2026-11-14): si Supabase la quita (SIGNED_OUT, p. ej. al no poder renovarla) se vuelve al
 *   acceso; si entra otra cuenta (SIGNED_IN) se vuelve a mirar; y al volver a esta pestaña «Mi perfil» se relee
 *   (prop `recargar` de components/PerfilPublico.tsx).
 * - El registro guarda nombre, usuario y país como metadata del usuario en
 *   Supabase (options.data en signUp).
 * - Toda la interfaz sigue el tema claro global: fondo blanco, azul claro
 *   como color de acento y textos en azul marino oscuro para contraste.
 * - Los textos de la pantalla de acceso son deliberadamente sobrios y
 *   funcionales (sin hablar de funciones futuras que aún no existen, como
 *   "chat global" o "perfil comunitario"): es lo primero que ve un cliente
 *   real de la tienda.
 * - Ya no hay una cabecera de página separada ("Acceso y registro" en gris
 *   arriba del todo): todo el contenido de acceso vive centrado, sin
 *   tarjetas ni burbujas envolventes.
 * - Solo hay UN botón de "Iniciar sesión": es el propio selector que está al
 *   lado de "Crear cuenta" (componente AuthPill). El primer toque abre el
 *   panel con los campos Email/Contraseña (formOpen) y, mientras ese modo
 *   sigue activo, el mismo botón crece y se pinta como el CTA azul grande
 *   (interpolando su Animated.Value pillAnimSignin/pillAnimSignup entre 0 y
 *   1): un segundo toque sobre él ya no cambia de modo, envía el formulario
 *   (handlePillPress). Lo mismo aplica a "Crear cuenta" en modo registro.
 *   Así no hay un botón duplicado "Iniciar sesión" arriba y otro abajo.
 * - El ancho de la tarjeta es responsive (cardMaxWidth vía
 *   useWindowDimensions): en móvil ocupa el ancho disponible, en pantallas
 *   grandes crece a una tarjeta centrada más ancha y con más aire (padding,
 *   tipografía), sin pasar a un layout de columnas.
 * - El ScrollView usa flexGrow:1 + justifyContent:"center" en su
 *   contentContainerStyle: cuando la tarjeta es más baja que la pantalla
 *   (caso normal, panel cerrado) queda centrada vertical y horizontalmente;
 *   si crece (panel abierto, mensajes de error, panel de admin...) el
 *   scroll sigue funcionando con normalidad desde arriba.
 * - El enlace "¿Olvidaste tu contraseña?" (solo en el modo "Iniciar sesión")
 *   llama a sendPasswordReset(), que usa
 *   supabase.auth.resetPasswordForEmail() y manda al cliente a
 *   app/reset-password.tsx por email. El mensaje de éxito es siempre igual,
 *   exista o no una cuenta con ese email (para no dejar comprobar por aquí
 *   qué emails están registrados).
 * - Sin sesión, debajo del subtítulo, la ventaja de tener cuenta (dueño, 2026-11-11): «Con tu cuenta, Blue te avisa
 *   de bajadas de precio y artículos nuevos» (#perfil-ventaja-avisos). Los avisos son solo con cuenta
 *   (components/AsistenteBlue.tsx), que deja aquí la pantalla a la que volver (VOLVER_TRAS_ACCESO_KEY).
 *
 * Conectado con:
 * - lib/supabase.ts → cliente de Supabase usado para todo el login/registro.
 * - app/reset-password.tsx → pantalla a la que llega el cliente desde el
 *   enlace de "olvidé mi contraseña".
 * - app/admin/index.tsx → se abre con router.push("/admin") cuando el rol es
 *   "admin" (botón "Panel de control", al pie de «Mi perfil»).
 * - app/(tabs)/chat-global.tsx → su modal de "inicia sesión para comentar"
 *   trae al usuario a esta pantalla para autenticarse.
 * - app/(tabs)/_layout.tsx → define esta pestaña dentro de la barra inferior.
 * - «Mis pedidos» → «Descargar factura» (facturas de VeoAura: tabla pedido_facturas, migración
 *   20261110100000; descarga por api/factura.ts y lib/abrirEnlaceExterno.ts → abrirDescarga). Se mide
 *   con «Pedidos: factura descargada» (app/admin/analytics.tsx). «Ver mis facturas» de Blue IA
 *   (app/(tabs)/blue-ia.tsx) abre /perfil?tab=seguimientos&filtro=facturas: el filtro «Facturas» ya puesto.
 * - «Reparaciones y Mantenimientos» → reparación por envío (migración 20261111100000): barra de nueve
 *   etapas (compacta: etapa actual y «Paso N de M»), plazo, «Esperando pieza», «Descargar etiqueta»
 *   (api/factura.ts?solicitud=…), cómo embalarlo y a dónde enviarlo (plegable, dirección de
 *   reparacion_envio_ajustes vía lib/envio.ts), fotos de recepción (components/VisorFotos.tsx) y
 *   «Aceptar presupuesto». Se mide con «Reparación por envío: …» (app/admin/analytics.tsx).
 *   Parte 2 (migración 20261111130000; sin ella no sale nada de esto): CobrosDeLaReparacion paga la
 *   etiqueta y, con la reparación lista y el presupuesto aceptado, «Pagar y enviármelo» (tarjeta por
 *   api/pago.ts con la misma regla que los pedidos, o Bizum/transferencia con los datos del dueño y el
 *   concepto VZ-…, y «Ya lo he pagado», que solo avisa); «Si no tiene arreglo» («Te lo compramos»
 *   abre app/vender.tsx con el modelo y la nota; «Devuélvemelo» paga solo la vuelta) y la garantía
 *   («Garantía hasta …» y «Ha vuelto a fallar», que crea una solicitud gratis enlazada). La vuelta de
 *   Stripe (?pago=ok&sesion=…) se confirma con el servidor.
 *   Bizum de Stripe (dueño, 2026-11-11): si el servidor dice que la página de pago online ofrece Bizum
 *   (GET /api/pago → bizum), el botón es «Pagar con tarjeta o Bizum» (si no, «Pagar con tarjeta»: nunca
 *   se promete Bizum online sin él); el Bizum/transferencia «a mano» solo sale si el dueño rellenó sus
 *   datos. En «Mis pedidos», «Pagado online con Bizum/tarjeta/Klarna» cuando se sabe (pedidos.pago_metodo).
 * - «Mis pedidos» → compras en mano (dueño, 2026-11-11; migración 20261111170000, pedidos.origen = 'tienda_fisica'):
 *   las manda VeoAura (api/escaparate-veoaura.ts, evento «venta_tienda») y salen como un pedido más, «Compra en tienda
 *   VZ-… · total · fecha», con la forma de pago, «Entregado» y «Descargar factura», sin barra de envío. Al abrir «Mis
 *   seguimientos» se pide a api/factura.ts («unir_compras_tienda») que una a la cuenta las que llegaron con su correo.
 * - Seguimiento paso a paso (mejora 5, 2026-11-14; migración 20261114160000): bajo la barra de cada pedido, los pasos
 *   dados con su fecha y hora reales (PasosDelPedido con lib/envio.ts → pasosDelPedido; sin hora conocida, sin fecha) y
 *   «Seguir el envío» (44 px) si la tienda puso el número de Correos o el enlace del transportista; en las reparaciones,
 *   «Última actualización» y «Seguir el envío» con el número de la vuelta. En «Me gusta», arriba, «Avisos de precio» con
 *   lo que sigue desde la ficha y «Quitar» (AvisosPrecioSeccion, migración 20261114160100).
 * - Valoración tras la entrega (mejora 11, 2026-11-15; migración 20261115100000): en los pedidos entregados hace 3 días o
 *   más (paso «entregado» de pedido_estados) y sin valorar, «Valorar compra» (44 px) abre ValorarPedidoModal
 *   (components/VentanaValoracion.tsx); valorado, «Tu valoración: ★★★★☆». Sin la migración no sale nada.
 * - Tamaños y colores (auditoría móvil y lección del 2026-11-12, constants/temaTienda.ts): toda la letra sale de TAMANOS (13 px
 *   como mínimo; 12 solo «SESIÓN ACTUAL», las etiquetas de la barra de etapas y las de los filtros cuando son cinco), lo
 *   que se toca mide 44 px (pestañas Mi cuenta / Mis seguimientos / Me gusta, «Preguntar por esto», enlaces), los campos
 *   16 px de letra, el gris de texto rgba(11,33,56,0.72) y el TEXTO azul pequeño en #0A78B4 (accentTexto); el azul de
 *   marca #1EA7E8 sigue en botones, iconos, puntos y rayas. La barra de etapas de 5 o 6 pasos alterna sus etiquetas
 *   arriba y abajo para que a 360 px no se parta ninguna palabra; la de 9 sigue compacta («Paso N de M»).
 * - constants/temaTienda.ts → TAMANOS, TACTIL, CAMPO y COLORES_TEXTO.
 */
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useScrollToTop } from "@react-navigation/native";
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
// Directamente de DatosBlue (no de AsistenteBlue): así Blue entero no viaja en el paquete de la tienda (carga más
// rápida, paso 2).
import { firmaPedidoSeg, marcarSeguimientosVistos } from "../../components/blue/DatosBlue";
import CarruselProductosCategoria, { columnasLista, NoticiasEstantes, RejillaTarjetas, TarjetaProducto } from "../../components/CarruselProductosCategoria";
import CargaMarca from "../../components/marca/CargaMarca";
import VisorFotos, { type FotoVisor } from "../../components/VisorFotos";
import {
  alCambiarRegalosEnvio,
  cargarAjustesReparacionEnvio,
  cargarMisEnviosGratis,
  cargarSeguimientoPedidos,
  datosPagoManual,
  enlaceSeguimientoEnvio,
  fechaHoraPaso,
  pasosDelPedido,
  textoRegaloEnvio,
  type AjustesReparacionEnvio,
  type HistorialPedidos,
  type RegaloEnvio,
} from "../../lib/envio";
import MarcaAnimada from "../../components/marca/MarcaAnimada";
import PerfilPublico from "../../components/PerfilPublico";
import VentanaValoracion, {
  VentanaMejoras,
  ValorarPedidoModal,
  cargarValoracionesPedidos,
  entregadoEnDe,
  estrellasDeNota,
  tocaValorarPedido,
  type ValoracionPedido,
} from "../../components/VentanaValoracion";
import PieDePagina from "../../components/PieDePagina";
import ImagenInteligente from "../../components/ImagenInteligente";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { marcarOrigenVender, medirCuentaCreada, medirEvento } from "../../lib/analiticaPropia";
import {
  CANALES_REPOSICION,
  fijarAvisoPrecio,
  fijarAvisoReposicion,
  CLAVE_ME_GUSTA_PRODUCTOS,
  CLAVE_ME_GUSTA_SERVICIOS,
  meGustaLocales,
  misAvisosPrecio,
  misAvisosReposicion,
  misMeGustaServidor,
  MOTIVO_NO_DISPONIBLE,
  motivoParaCliente,
  textoReposicion,
  type AvisoReposicion,
  type CanalReposicion,
} from "../../lib/interaccion";
import { abrirDescarga, abrirEnlaceExterno } from "../../lib/abrirEnlaceExterno";
import { avisoContrasenaCorta, CONTRASENA_MINIMA, mensajeAuthEnEspanol, pedirEnlaceContrasena, supabase } from "../../lib/supabase";
import { CAMPO, COLORES_TEXTO, TACTIL, TAMANOS } from "../../constants/temaTienda";
import { eurosReserva, fechaReserva, rellenarCondicionesReserva } from "../../lib/reservas";

// Ficha a la que volver tras iniciar sesión o registrarse (la deja «Comprar ya» de la ficha).
const VOLVER_TRAS_ACCESO_KEY = "videojuegoszaragoza:volver_tras_acceso";

const COLORS = {
  bg: "#FFFFFF",
  // bg2/card/cardSoft eran tonos grisáceos muy sutiles (#F4F9FD/#F6FAFD/
  // #F8FBFE) para distinguir tarjetas del fondo. A petición de Daniel, ahora
  // valen igual que "bg" (blanco puro): toda la pantalla queda de un blanco
  // limpio y uniforme, sin ese "fondo blanco grisáceo" — los bloques se
  // siguen distinguiendo por el espaciado, no por un tono de fondo distinto.
  cardSoft: "#FFFFFF",
  border: "#E3EAF2",
  text: COLORES_TEXTO.texto,
  // Gris de texto: el más claro permitido (constants/temaTienda.ts; antes 0.62).
  muted: COLORES_TEXTO.secundario,
  mutedSoft: COLORES_TEXTO.secundario,
  // Azul de marca (botones, iconos, fondos) y azul de texto (enlaces y texto azul de menos de 17 px).
  accent: COLORES_TEXTO.azulMarca,
  accentTexto: COLORES_TEXTO.azulTexto,
  danger: "#B91C1C",
  success: "#15803D",
};

type AccessState = "checking" | "idle" | "submitting" | "signingOut" | "resettingPassword";
type SessionRole = "admin" | "user" | "guest";
type AuthMode = "signin" | "signup";
type PerfilTab = "cuenta" | "seguimientos" | "megusta";
// Orden de las pestañas (deslizar el dedo pasa a la de al lado; en los extremos no hace nada).
const ORDEN_PESTANAS: PerfilTab[] = ["cuenta", "seguimientos", "megusta"];

function normalizeEmail(value: string) {
  return (value ?? "").trim().toLowerCase();
}

function isValidEmail(value: string) {
  const email = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Bloque de sección sin envoltorio visual (sin borde ni fondo): solo agrupa.
// La separación vertical entre apartados la pone el contenedor (sectionGap).
function SectionCard({
  children,
  padding = 18,
}: {
  children: React.ReactNode;
  padding?: number;
}) {
  return <View style={{ paddingHorizontal: padding, gap: 14 }}>{children}</View>;
}

// Botón de la cuenta al pie de «Mi perfil»: redondeado y de 48 px como «Guardar perfil» / «Deshacer» (sin icono, como
// ellos, para que «Panel de control» se lea entero en media fila); el principal, azul de marca. Ocupan la fila a partes
// iguales; en móviles estrechos la letra baja un punto.
function BotonCuenta({
  titulo,
  onPress,
  principal = false,
  cargando = false,
  textoCargando,
}: {
  titulo: string;
  onPress: () => void;
  principal?: boolean;
  cargando?: boolean;
  textoCargando?: string;
}) {
  const color = principal ? "#FFFFFF" : COLORS.text;
  const estrecho = useWindowDimensions().width < 380;
  return (
    <Pressable
      onPress={onPress}
      disabled={cargando}
      accessibilityRole="button"
      accessibilityLabel={titulo}
      style={({ pressed }) => ({
        flex: 1,
        minWidth: 0,
        minHeight: 48,
        borderRadius: 999,
        paddingHorizontal: 8,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        backgroundColor: principal ? COLORS.accent : "#FFFFFF",
        // El mismo borde en los dos (del color del fondo en el principal): así miden exactamente lo mismo.
        borderWidth: 1.5,
        borderColor: principal ? COLORS.accent : COLORS.border,
        opacity: cargando ? 0.6 : pressed ? 0.88 : 1,
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}
    >
      {cargando ? <ActivityIndicator size="small" color={color} /> : null}
      <Text numberOfLines={1} style={{ color, fontWeight: "900", fontSize: estrecho ? 14 : 15 }}>
        {cargando && textoCargando ? textoCargando : titulo}
      </Text>
    </Pressable>
  );
}

function InfoMessage({
  text,
  tone,
}: {
  text: string;
  tone: "error" | "success";
}) {
  // Mensaje limpio: solo texto centrado en su color, sin pastilla de fondo.
  const color = tone === "error" ? COLORS.danger : COLORS.success;

  return (
    <Text style={{ color, fontWeight: "800", lineHeight: 20, textAlign: "center" }}>{text}</Text>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ color: COLORS.text, fontWeight: "800", textAlign: "center" }}>
      {children}
    </Text>
  );
}

// Fila de etiqueta con, opcionalmente, el botón de cerrar (X) alineado a la
// derecha a la misma altura que el texto. Se usa solo en el campo "Email"
// de cada panel (login/registro) para que la X quede a la altura de ese
// encabezado, en la esquina derecha, en vez de flotar arriba del todo de
// la tarjeta.
function LabelRow({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose?: () => void;
}) {
  return (
    <View style={{ position: "relative", justifyContent: "center" }}>
      <Label>{children}</Label>
      {onClose ? (
        <Pressable
          onPress={onClose}
          hitSlop={8}
          style={{
            position: "absolute",
            right: 0,
            top: -7,
            width: 30,
            height: 30,
            borderRadius: 15,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(11,33,56,0.06)",
          }}
        >
          <Ionicons name="close" size={16} color={COLORS.text} />
        </Pressable>
      ) : null}
    </View>
  );
}

function Input({
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  returnKeyType,
  editable,
  autoCapitalize = "none",
  autoCorrect = false,
  textContentType,
  autoComplete,
  onSubmitEditing,
  onBlur,
  nativeID,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  keyboardType?: any;
  returnKeyType?: any;
  editable?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  autoCorrect?: boolean;
  textContentType?: any;
  autoComplete?: any;
  onSubmitEditing?: () => void;
  onBlur?: () => void;
  nativeID?: string;
}) {
  const isPasswordField = !!secureTextEntry;
  const [revealed, setRevealed] = useState(false);

  return (
    <View style={{ position: "relative", justifyContent: "center" }}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="rgba(11,33,56,0.40)"
        secureTextEntry={isPasswordField && !revealed}
        keyboardType={keyboardType}
        returnKeyType={returnKeyType}
        editable={editable}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        textContentType={textContentType}
        autoComplete={autoComplete}
        onSubmitEditing={onSubmitEditing}
        onBlur={onBlur}
        nativeID={nativeID}
        style={{
          borderWidth: 1,
          borderColor: COLORS.border,
          borderRadius: 14,
          paddingHorizontal: 12,
          paddingRight: isPasswordField ? 44 : 12,
          paddingVertical: 13,
          color: COLORS.text,
          backgroundColor: "#F8FBFE",
          // 16px mínimo: por debajo, el móvil hace zoom automático al
          // tocar la casilla (ver components/ConversacionProducto.tsx).
          fontSize: CAMPO.letra,
        }}
      />

      {isPasswordField ? (
        <Pressable
          onPress={() => setRevealed((prev) => !prev)}
          hitSlop={8}
          style={{
            position: "absolute",
            right: 12,
            height: "100%",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Ionicons
            name={revealed ? "eye-outline" : "eye-off-outline"}
            size={19}
            color={COLORS.mutedSoft}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

// Botón/pestaña combinados: es el selector de modo (Iniciar sesión / Crear
// cuenta) y, cuando su modo ya está activo, también el botón de envío del
// formulario — así no hace falta un segundo botón "Iniciar sesión" más
// abajo. `anim` (0 → 1) controla, con Animated.spring, tanto el ancho
// relativo (flex) como los colores: en 0 es una pestaña neutra pequeña, en 1
// es el CTA azul grande. El "pop" de pulsación (pressScale) es un
// Animated.Value aparte con useNativeDriver:true para que no choque con la
// animación de flex/color, que necesita useNativeDriver:false.
function AuthPill({
  title,
  anim,
  onPress,
  disabled,
  loading,
}: {
  title: string;
  anim: Animated.Value;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const pressScale = useRef(new Animated.Value(1)).current;

  function onPressIn() {
    Animated.spring(pressScale, {
      toValue: 0.96,
      useNativeDriver: true,
      speed: 50,
      bounciness: 6,
    }).start();
  }

  function onPressOut() {
    Animated.spring(pressScale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 30,
      bounciness: 6,
    }).start();
  }

  const flex = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] });
  // Elegida: azul suave (desde el 2026-11-26 el botón azul fuerte de enviar va abajo, debajo de «Contraseña»).
  const backgroundColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ["#F8FBFE", "#EAF6FD"],
  });
  const borderColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [COLORS.border, COLORS.accent],
  });
  const textColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [COLORS.text, COLORES_TEXTO.azulTexto],
  });
  const fontSize = anim.interpolate({ inputRange: [0, 1], outputRange: [13.5, 15] });

  return (
    // minWidth garantiza que, aunque el otro botón crezca al activarse, este
    // siempre tenga hueco de sobra para su texto completo (ni en móvil ni en
    // pantallas grandes se corta "Crear cuenta" a mitad).
    <Animated.View style={{ flex, minWidth: 118 }}>
      <Pressable onPress={onPress} disabled={disabled} onPressIn={onPressIn} onPressOut={onPressOut}>
        <Animated.View style={{ transform: [{ scale: pressScale }] }}>
          <Animated.View
            style={{
              borderRadius: 14,
              borderWidth: 1,
              borderColor,
              backgroundColor,
              paddingVertical: 13,
              paddingHorizontal: 8,
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 8,
              opacity: disabled ? 0.6 : 1,
            }}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.accent} />
            ) : (
              <Animated.Text
                style={{ color: textColor, fontWeight: "900", fontSize }}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {title}
              </Animated.Text>
            )}
          </Animated.View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

// Botón de envío al final del formulario, justo debajo de «Contraseña» (dueño, 2026-11-26: «si no, el usuario tiene
// que subir para darle a "Crear cuenta"»): a lo ancho, 52 px, azul de marca. Sin los datos completos se ve más suave y
// no envía (las pestañas de arriba siguen cambiando de modo y, pulsadas otra vez, también envían).
function BotonEnviarAcceso({
  nativeID,
  texto,
  activo,
  cargando,
  onPress,
}: {
  nativeID: string;
  texto: string;
  activo: boolean;
  cargando: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      nativeID={nativeID}
      onPress={onPress}
      disabled={cargando}
      accessibilityRole="button"
      accessibilityState={{ disabled: !activo || cargando, busy: cargando }}
      style={({ pressed }) => ({
        minHeight: 52,
        borderRadius: 14,
        backgroundColor: COLORS.accent,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 8,
        marginTop: 4,
        opacity: !activo ? 0.55 : pressed ? 0.88 : 1,
      })}
    >
      {cargando ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 16 }}>{texto}</Text>}
    </Pressable>
  );
}

// Aparición suave (fade + pequeño desplazamiento) para el panel de campos
// que revela AuthPill al abrirse. Se remonta cada vez que cambia formOpen o
// mode, así que la animación se dispara de nuevo en cada apertura/cambio.
function RevealPanel({ children }: { children: React.ReactNode }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [anim]);

  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

export default function PerfilScreen() {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [formOpen, setFormOpen] = useState(false);

  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");

  const [registerName, setRegisterName] = useState("");
  const [registerUsername, setRegisterUsername] = useState("");
  const [registerCountry, setRegisterCountry] = useState("");

  const [msg, setMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [state, setState] = useState<AccessState>("checking");
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [sessionRole, setSessionRole] = useState<SessionRole>("guest");

  // Pestañas del perfil con sesión: "Mi cuenta" | "Mis seguimientos" (?tab=seguimientos) | "Me gusta" (?tab=megusta)
  // ?aviso=… lo manda quien trae aquí para iniciar sesión (p. ej. "Hablar con el equipo").
  // ?acceso=registro | entrar → abre directamente el formulario de crear cuenta o de iniciar
  // sesión (lo usa la guía de Blue, components/AsistenteBlue.tsx).
  // ?filtro=facturas (con ?tab=seguimientos) → «Mis pedidos» con el filtro «Facturas» ya puesto («Ver mis facturas» de
  // Blue IA, app/(tabs)/blue-ia.tsx; dueño, 2026-11-11).
  const {
    tab: tabParam,
    aviso: avisoParam,
    acceso: accesoParam,
    filtro: filtroParam,
  } = useLocalSearchParams<{ tab?: string; aviso?: string; acceso?: string; filtro?: string }>();
  const aviso = typeof avisoParam === "string" ? avisoParam.slice(0, 160) : "";
  useEffect(() => {
    if (accesoParam === "registro" || accesoParam === "entrar") {
      setMode(accesoParam === "registro" ? "signup" : "signin");
      setFormOpen(true);
    }
  }, [accesoParam]);
  const [perfilTab, setPerfilTab] = useState<PerfilTab>(
    tabParam === "seguimientos" || tabParam === "megusta" ? tabParam : "cuenta"
  );
  useEffect(() => {
    if (tabParam === "seguimientos" || tabParam === "megusta") setPerfilTab(tabParam);
  }, [tabParam]);
  const isLogged = sessionRole !== "guest";
  const showSeguimientos = isLogged && perfilTab === "seguimientos";
  const showMeGusta = isLogged && perfilTab === "megusta";

  // Cambiar de pestaña tocándola o deslizando el dedo sobre su contenido: hacia la izquierda, la siguiente («Mis
  // seguimientos», «Me gusta»); hacia la derecha, la anterior. Abrir «Mis seguimientos» y «Me gusta» se mide (analítica
  // propia, Administración → Usuarios y Analítica).
  const [desliz] = useState(() => new Animated.Value(0));
  const perfilTabRef = useRef<PerfilTab>(perfilTab);
  useEffect(() => {
    perfilTabRef.current = perfilTab;
  }, [perfilTab]);
  const cambiarPestana = useCallback((t: PerfilTab, como: "tocar" | "deslizar") => {
    if (perfilTabRef.current !== t && t === "seguimientos") {
      medirEvento("seguimientos_abiertos", "Perfil: Mis seguimientos", { metadata: { como } });
    }
    if (perfilTabRef.current !== t && t === "megusta") {
      medirEvento("megusta_abiertos", "Perfil: Me gusta", { metadata: { como } });
    }
    perfilTabRef.current = t;
    setPerfilTab(t);
  }, []);
  // Al soltar: cambia con un deslizamiento largo (60 px) o con uno corto y rápido hacia el mismo lado (como en las apps del
  // móvil); si no, el contenido vuelve a su sitio.
  const soltarDedo = useCallback(
    (dx: number, vx: number) => {
      const rapido = Math.abs(dx) > 24 && Math.abs(vx) > 0.35 && Math.sign(vx) === Math.sign(dx);
      const actual = ORDEN_PESTANAS.indexOf(perfilTabRef.current);
      const destino: PerfilTab | null = Math.abs(dx) > 60 || rapido ? ORDEN_PESTANAS[actual + (dx < 0 ? 1 : -1)] ?? null : null;
      if (destino && destino !== perfilTabRef.current) {
        cambiarPestana(destino, "deslizar");
        // Entra desde el lado del gesto.
        desliz.setValue(dx < 0 ? 70 : -70);
      }
      Animated.spring(desliz, { toValue: 0, useNativeDriver: false, speed: 18, bounciness: 4 }).start();
    },
    [cambiarPestana, desliz]
  );
  // El dedo en la web: dónde tocó, sus últimas posiciones (para la distancia y la velocidad) y hacia dónde va, que se decide
  // con sus primeros 8 px. La distancia cuenta desde que toca (PanResponder la pone a 0 al reconocer el gesto y un
  // deslizamiento corto se quedaba sin llegar). En horizontal, la página no se mueve arriba o abajo mientras se desliza
  // (aunque el pulgar vaya en diagonal); en vertical, se desplaza como siempre y no cambia de pestaña.
  const zonaDeslizable = useRef<View>(null);
  const dedo = useRef<{ x0: number; y0: number; eje: "h" | "v" | null; muestras: { x: number; t: number }[]; reconocido: boolean }>({
    x0: 0,
    y0: 0,
    eje: null,
    muestras: [],
    reconocido: false,
  });
  const recorrido = useCallback(() => {
    const d = dedo.current;
    const ultima = d.muestras[d.muestras.length - 1];
    if (!ultima || d.muestras.length < 2) return null;
    // Velocidad de los últimos 100 ms (px/ms).
    const antes = d.muestras.find((m) => ultima.t - m.t <= 100) ?? ultima;
    return { dx: ultima.x - d.x0, vx: ultima.t > antes.t ? (ultima.x - antes.x) / (ultima.t - antes.t) : 0 };
  }, []);
  useEffect(() => {
    const zona = zonaDeslizable.current as unknown as HTMLElement | null;
    if (Platform.OS !== "web" || !isLogged || !zona?.addEventListener) return;
    const inicio = (e: TouchEvent) => {
      const t = e.touches[0];
      // Con dos dedos (acercar la página) no es un cambio de pestaña.
      dedo.current = {
        x0: t?.clientX ?? 0,
        y0: t?.clientY ?? 0,
        eje: e.touches.length === 1 ? null : "v",
        muestras: t ? [{ x: t.clientX, t: e.timeStamp }] : [],
        reconocido: false,
      };
    };
    const mover = (e: TouchEvent) => {
      const d = dedo.current;
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      d.muestras.push({ x: t.clientX, t: e.timeStamp });
      if (d.muestras.length > 8) d.muestras.shift();
      const dx = t.clientX - d.x0;
      const dy = t.clientY - d.y0;
      if (d.eje === null && Math.hypot(dx, dy) >= 8) d.eje = Math.abs(dx) > Math.abs(dy) * 1.2 ? "h" : "v";
      if (d.eje === "h" && e.cancelable) e.preventDefault();
    };
    // Horizontal pero tan rápido que no llegó a reconocerse (casi sin movimientos entre tocar y soltar): se decide aquí.
    const fin = () => {
      const r = recorrido();
      if (dedo.current.eje === "h" && !dedo.current.reconocido && r) soltarDedo(r.dx, r.vx);
    };
    zona.addEventListener("touchstart", inicio, { passive: true });
    zona.addEventListener("touchmove", mover, { passive: false });
    zona.addEventListener("touchend", fin);
    return () => {
      zona.removeEventListener("touchstart", inicio);
      zona.removeEventListener("touchmove", mover);
      zona.removeEventListener("touchend", fin);
    };
  }, [isLogged, recorrido, soltarDedo]);
  const gestoPestanas = useMemo(
    () =>
      PanResponder.create({
        // Solo un gesto horizontal: el desplazamiento vertical de la página sigue igual. En la web, en cuanto el dedo
        // se ha movido 8 px más en horizontal que en vertical (lo mismo que decide `dedo`).
        onMoveShouldSetPanResponder: (_e, g) => {
          if (!isLogged) return false;
          if (Platform.OS !== "web") return Math.abs(g.dx) > 18 && Math.abs(g.dx) > Math.abs(g.dy) * 2;
          const eje = dedo.current.eje ?? (Math.hypot(g.dx, g.dy) >= 8 ? (Math.abs(g.dx) > Math.abs(g.dy) * 1.2 ? "h" : "v") : null);
          return eje === "h";
        },
        onPanResponderGrant: () => {
          dedo.current.reconocido = true;
        },
        // Empezado el gesto, el desplazamiento de la página no se lo quita (si no, en diagonal se quedaba a medias).
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_e, g) => {
          // El contenido acompaña un poco al dedo (con resistencia) para que se note que se puede deslizar.
          const dx = recorrido()?.dx ?? g.dx;
          const actual = ORDEN_PESTANAS.indexOf(perfilTabRef.current);
          const posible = dx < 0 ? actual < ORDEN_PESTANAS.length - 1 : actual > 0;
          desliz.setValue(Math.max(-90, Math.min(90, dx * (posible ? 0.35 : 0.12))));
        },
        onPanResponderRelease: (_e, g) => {
          const r = recorrido() ?? { dx: g.dx, vx: g.vx };
          soltarDedo(r.dx, r.vx);
        },
        onPanResponderTerminate: () => {
          Animated.spring(desliz, { toValue: 0, useNativeDriver: false }).start();
        },
      }),
    [isLogged, desliz, recorrido, soltarDedo]
  );
  // ¿Se enseña «Mi perfil»? (null mientras carga; false si la tabla aún no existe: entonces la cuenta sale en su tarjeta).
  const [perfilDisponible, setPerfilDisponible] = useState<boolean | null>(null);
  // «Mejoras en la tienda» abierta desde Mi cuenta.
  const [mejorasAbierta, setMejorasAbierta] = useState(false);

  const isChecking = state === "checking";
  const isSubmitting = state === "submitting";
  const isSigningOut = state === "signingOut";
  const isResettingPassword = state === "resettingPassword";

  // Responsive: tarjeta centrada más ancha y con más aire en pantallas
  // grandes, sin pasar a un layout de columnas (móvil sigue con el ancho
  // disponible y su padding compacto habitual).
  const { width } = useWindowDimensions();
  const widthSafe = width > 0 ? width : 1024;
  const isMobile = widthSafe < 700;
  const isDesktop = widthSafe >= 1024;
  const cardMaxWidth = isMobile ? undefined : isDesktop ? 620 : 560;
  const cardPadding = isMobile ? 18 : isDesktop ? 26 : 22;
  const heroTitleSize = isMobile ? 24 : isDesktop ? 30 : 27;
  const pagePadding = isMobile ? 16 : 24;
  // Aire entre apartados: 36px en móvil, 48px en escritorio.
  const sectionGap = isMobile ? 36 : 48;

  // pillAnimSignin/pillAnimSignup: 0 = pestaña neutra pequeña, 1 = CTA
  // grande activo. Solo uno de los dos vale 1 a la vez (o ninguno, si el
  // panel todavía no se ha abierto) — ver AuthPill y el useEffect de abajo.
  const pillAnimSignin = useRef(new Animated.Value(0)).current;
  const pillAnimSignup = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const targetSignin = formOpen && mode === "signin" ? 1 : 0;
    const targetSignup = formOpen && mode === "signup" ? 1 : 0;

    Animated.parallel([
      Animated.spring(pillAnimSignin, {
        toValue: targetSignin,
        useNativeDriver: false,
        speed: 14,
        bounciness: 6,
      }),
      Animated.spring(pillAnimSignup, {
        toValue: targetSignup,
        useNativeDriver: false,
        speed: 14,
        bounciness: 6,
      }),
    ]).start();
  }, [formOpen, mode, pillAnimSignin, pillAnimSignup]);

  const clearMessages = useCallback(() => {
    if (msg) setMsg(null);
    if (okMsg) setOkMsg(null);
  }, [msg, okMsg]);

  const hydrateSessionState = useCallback(async () => {
    setState("checking");
    setMsg(null);
    setOkMsg(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        setSessionEmail(null);
        setSessionUserId(null);
        setSessionRole("guest");
        setState("idle");
        return;
      }

      const currentEmail = normalizeEmail(session.user.email ?? "");
      const userId = session.user.id;

      setSessionEmail(currentEmail || null);
      setSessionUserId(userId);

      const { data: profile, error: profErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle<{ role: string | null }>();

      if (profErr) {
        setSessionRole("user");
        setState("idle");
        return;
      }

      const role = String(profile?.role ?? "").trim().toLowerCase();
      setSessionRole(role === "admin" ? "admin" : "user");
      setState("idle");
    } catch (error: any) {
      setSessionEmail(null);
      setSessionUserId(null);
      setSessionRole("guest");
      setState("idle");
      setMsg(mensajeAuthEnEspanol(error, "No se ha podido comprobar tu sesión. Recarga la página."));
    }
  }, []);

  useEffect(() => {
    hydrateSessionState();
  }, [hydrateSessionState]);

  // Cambio de correo confirmado (Mi perfil → «Inicio de sesión y seguridad»): al renovarse la sesión, se ve el nuevo.
  // Y la sesión que cambia sola (2026-11-14): si Supabase la quita (p. ej. no pudo renovarla), la pantalla deja de enseñar
  // «Mi perfil» de una sesión que ya no existe; si entra otra cuenta, se vuelve a mirar todo.
  const usuarioActual = useRef<string | null>(null);
  usuarioActual.current = sessionUserId;
  const estadoAcceso = useRef(state);
  estadoAcceso.current = state;
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((evento, sesion) => {
      const nuevo = sesion?.user?.email;
      if ((evento === "USER_UPDATED" || evento === "TOKEN_REFRESHED") && nuevo) setSessionEmail(normalizeEmail(nuevo));
      if (evento === "SIGNED_OUT" && usuarioActual.current) {
        setSessionEmail(null);
        setSessionUserId(null);
        setSessionRole("guest");
      }
      // (Al entrar desde esta misma pantalla ya lo hace signIn: no se repite mientras se está entrando.)
      if (evento === "SIGNED_IN" && sesion?.user?.id && sesion.user.id !== usuarioActual.current && estadoAcceso.current === "idle") {
        // Fuera del aviso de Supabase (dentro no se puede consultar la base de datos).
        setTimeout(() => {
          if (estadoAcceso.current === "idle" && sesion.user.id !== usuarioActual.current) void hydrateSessionState();
        }, 0);
      }
    });
    return () => data.subscription.unsubscribe();
  }, [hydrateSessionState]);

  // Al volver a Mi cuenta desde otra pestaña, «Mi perfil» se vuelve a leer (components/PerfilPublico.tsx, sin «Cargando…»).
  const [recargarPerfil, setRecargarPerfil] = useState(0);
  useFocusEffect(useCallback(() => setRecargarPerfil((n) => n + 1), []));

  // «Comprar ya» sin sesión deja aquí la ficha a la que volver: en cuanto hay sesión (al iniciar
  // sesión o al crear la cuenta) se vuelve a esa ficha. La marca caduca a los 30 minutos.
  useEffect(() => {
    if (!sessionEmail) return;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(VOLVER_TRAS_ACCESO_KEY);
        if (!raw) return;
        await AsyncStorage.removeItem(VOLVER_TRAS_ACCESO_KEY);
        const v = JSON.parse(raw) as { ruta?: string; hasta?: number };
        if (v?.ruta && typeof v.ruta === "string" && v.ruta.startsWith("/") && Date.now() < Number(v.hasta ?? 0)) {
          router.replace(v.ruta as never);
        }
      } catch {
        // sin marca válida: se queda en el perfil
      }
    })();
  }, [sessionEmail]);

  const canSubmitLogin = useMemo(() => {
    return isValidEmail(email) && pass.trim().length >= 6 && state === "idle";
  }, [email, pass, state]);

  const canSubmitRegister = useMemo(() => {
    return (
      registerName.trim().length >= 2 &&
      registerUsername.trim().length >= 3 &&
      registerCountry.trim().length >= 2 &&
      isValidEmail(email) &&
      pass.trim().length >= CONTRASENA_MINIMA &&
      state === "idle"
    );
  }, [registerCountry, registerName, registerUsername, email, pass, state]);

  // Contraseña nueva de menos de 8 al crear la cuenta: se cuenta una vez por visita al salir del campo (Administración →
  // Usuarios, «Contraseñas de al menos 8»), nunca la contraseña.
  const cortaMedida = useRef(false);
  const medirContrasenaCorta = useCallback(() => {
    if (cortaMedida.current || !avisoContrasenaCorta(pass)) return;
    cortaMedida.current = true;
    void medirEvento("contrasena_corta", "Contraseña: más corta del mínimo", { metadata: { motivo: "registro" } });
  }, [pass]);

  const signIn = useCallback(async () => {
    const e = normalizeEmail(email);
    const p = pass.trim();

    clearMessages();

    if (!e || !p) {
      setMsg("Introduce tu email y tu contraseña.");
      return;
    }

    if (!isValidEmail(e)) {
      setMsg("Introduce un email válido.");
      return;
    }

    // Para entrar vale la de 6 de siempre: las cuentas antiguas pueden tener una de 6 o 7 (el mínimo de 8 es para las nuevas).
    if (p.length < 6) {
      setMsg("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    setState("submitting");

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: e,
        password: p,
      });

      if (error) {
        setMsg(mensajeAuthEnEspanol(error, "No se ha podido iniciar sesión. Inténtalo de nuevo en unos minutos."));
        setState("idle");
        return;
      }

      const userId = data.user?.id;
      const currentEmail = normalizeEmail(data.user?.email ?? e);

      if (!userId) {
        setMsg("No se pudo iniciar sesión correctamente.");
        setState("idle");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle<{ role: string | null }>();

      const role = String(profile?.role ?? "").trim().toLowerCase();

      setSessionEmail(currentEmail);
      setSessionUserId(userId);
      setSessionRole(role === "admin" ? "admin" : "user");
      setPass("");
      setOkMsg(
        role === "admin"
          ? "Sesión iniciada correctamente. Esta cuenta tiene acceso interno."
          : "Sesión iniciada correctamente."
      );
      setState("idle");
    } catch (error: any) {
      setMsg(mensajeAuthEnEspanol(error, "No se ha podido iniciar sesión. Inténtalo de nuevo en unos minutos."));
      setState("idle");
    }
  }, [clearMessages, email, pass]);

  const signUp = useCallback(async () => {
    const e = normalizeEmail(email);
    const p = pass.trim();
    const fullName = registerName.trim();
    const username = registerUsername.trim();
    const country = registerCountry.trim();

    clearMessages();

    if (!fullName || !username || !country || !e || !p) {
      setMsg("Completa todos los campos del registro.");
      return;
    }

    if (!isValidEmail(e)) {
      setMsg("Introduce un email válido.");
      return;
    }

    if (p.length < CONTRASENA_MINIMA) {
      setMsg(`La contraseña debe tener al menos ${CONTRASENA_MINIMA} caracteres.`);
      return;
    }

    setState("submitting");

    try {
      const { error } = await supabase.auth.signUp({
        email: e,
        password: p,
        options: {
          data: {
            full_name: fullName,
            username,
            country,
          },
        },
      });

      if (error) {
        setMsg(mensajeAuthEnEspanol(error, "No se ha podido crear la cuenta. Inténtalo de nuevo en unos minutos."));
        setState("idle");
        return;
      }

      // Analítica propia: cuenta creada y, si la visita llegó de Instagram o TikTok, de cuál (sin ningún dato de la persona).
      medirCuentaCreada();
      setOkMsg("Cuenta creada. Si te hemos enviado un correo para confirmarla, ábrelo antes de iniciar sesión (mira también en Spam).");
      setMode("signin");
      setPass("");
      setState("idle");
    } catch (error: any) {
      setMsg(mensajeAuthEnEspanol(error, "No se ha podido crear la cuenta. Inténtalo de nuevo en unos minutos."));
      setState("idle");
    }
  }, [clearMessages, email, pass, registerCountry, registerName, registerUsername]);

  // Un único botón por modo hace dos cosas según el estado: si el panel
  // todavía no está abierto, el primer toque solo lo abre (y fija el modo).
  // Si ya está abierto y el modo pulsado ya es el activo, ese mismo toque
  // ahora significa "enviar" (equivale al botón grande que antes iba debajo
  // del formulario). Si está abierto pero el modo pulsado es el otro, solo
  // cambia de modo (signin <-> signup) sin cerrar el panel.
  const handlePillPress = useCallback(
    (target: AuthMode) => {
      clearMessages();

      if (!formOpen) {
        setMode(target);
        setFormOpen(true);
        return;
      }

      if (mode !== target) {
        setMode(target);
        return;
      }

      if (target === "signin") {
        if (canSubmitLogin) signIn();
      } else if (canSubmitRegister) {
        signUp();
      }
    },
    [formOpen, mode, clearMessages, canSubmitLogin, canSubmitRegister, signIn, signUp]
  );

  // Envía el enlace de "olvidé mi contraseña" (ver app/reset-password.tsx).
  // El mensaje de éxito es siempre el mismo exista o no una cuenta con ese
  // email: así nadie puede usar este formulario para comprobar qué emails
  // están registrados en la tienda.
  const sendPasswordReset = useCallback(async () => {
    const e = normalizeEmail(email);

    clearMessages();

    if (!isValidEmail(e)) {
      setMsg("Escribe tu email arriba y pulsa de nuevo para recibir el enlace.");
      return;
    }

    setState("resettingPassword");

    // Mensajes de Supabase en español y medición (Administración → Usuarios, «Recuperar contraseña»): nunca el correo.
    const r = await pedirEnlaceContrasena(e);
    if (r.ok) {
      void medirEvento("contrasena_enlace_pedido", "Contraseña: enlace pedido", { metadata: { desde: "perfil" } });
      setOkMsg("Si ese email tiene una cuenta, te hemos enviado un enlace para crear una contraseña nueva (mira también en Spam).");
    } else {
      void medirEvento("contrasena_enlace_error", "Contraseña: no se pudo pedir el enlace", { metadata: { desde: "perfil", motivo: r.motivo } });
      setMsg(r.mensaje);
    }
    setState("idle");
  }, [clearMessages, email]);

  const signOut = useCallback(async () => {
    clearMessages();
    setState("signingOut");

    try {
      await supabase.auth.signOut();
      setSessionEmail(null);
      setSessionUserId(null);
      setSessionRole("guest");
      setEmail("");
      setPass("");
      setMode("signin");
      setFormOpen(false);
      setOkMsg("Sesión cerrada correctamente.");
      setState("idle");
    } catch (error: any) {
      setMsg(mensajeAuthEnEspanol(error, "No se ha podido cerrar la sesión. Inténtalo de nuevo."));
      setState("idle");
    }
  }, [clearMessages]);

  const openAdminPanel = useCallback(() => {
    router.push("/admin");
  }, []);

  // Tocar «Perfil» abajo estando ya en Perfil sube arriba del todo, como Inicio y la Cesta (dueño, 2026-11-19).
  const paginaRef = useRef<ScrollView>(null);
  useScrollToTop(paginaRef);

  // «Cerrar sesión» (dueño, 2026-11-18): dentro del desplegable «Inicio de sesión y seguridad» de «Mi perfil»
  // (components/PerfilPublico.tsx); si «Mi perfil» no se puede enseñar, va con lo demás de la cuenta.
  const botonSalir = (
    <View nativeID="perfil-salir" style={{ flexDirection: "row" }}>
      <BotonCuenta titulo="Cerrar sesión" onPress={signOut} cargando={isSigningOut} textoCargando="Cerrando…" />
    </View>
  );

  // Al final de «Mi perfil» (abierta o plegada): «Mejoras en la tienda» y, al administrador, el aviso del panel y «Panel
  // de control», donde estaba. «Tu cuenta está activa» es el subtítulo de «Mi perfil» y el correo de la sesión va en su
  // recuadro, con los datos (components/PerfilPublico.tsx).
  const accionesCuenta = (
    <View nativeID="perfil-cuenta" style={{ gap: 8, alignItems: "center" }}>
      {/* «Mejoras en la tienda»: la cajita de ideas (components/VentanaValoracion.tsx), con la sesión ya iniciada. */}
      <Pressable
        nativeID="perfil-mejoras"
        onPress={() => setMejorasAbierta(true)}
        accessibilityRole="button"
        accessibilityLabel="Mejoras en la tienda: cuéntanos qué mejorarías"
        style={({ pressed }) => ({ minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, opacity: pressed ? 0.7 : 1 })}
      >
        <Ionicons name="bulb-outline" size={19} color={COLORS.accent} />
        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: TAMANOS.cuerpo }}>Mejoras en la tienda</Text>
        <Ionicons name="chevron-forward" size={16} color={COLORS.accent} />
      </Pressable>
      <VentanaMejoras visible={mejorasAbierta} onClose={() => setMejorasAbierta(false)} origen="perfil" />
      {sessionRole === "admin" ? (
        <Text style={{ color: COLORS.muted, fontSize: TAMANOS.minimo, fontWeight: "700", lineHeight: 17, textAlign: "center" }}>
          Esta cuenta tiene acceso al panel de administración.
        </Text>
      ) : null}
      {sessionRole === "admin" ? (
        <View style={{ flexDirection: "row", gap: 10, alignSelf: "stretch" }}>
          <BotonCuenta titulo="Panel de control" principal onPress={openAdminPanel} />
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />

      {/* paddingBottom 0: el hueco de abajo del iPhone ya lo deja la barra de secciones; si no, salía un trozo blanco
          encima de ella (dueño, 2026-11-28), que Inicio no tiene. */}
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg, paddingBottom: 0 }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            ref={paginaRef}
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            // Formulario de acceso: el primer toque fuera del teclado ya pulsa el botón
            // y al arrastrar la página se cierra el teclado.
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{
              flexGrow: 1,
              paddingHorizontal: pagePadding,
              paddingTop: isMobile ? 28 : 40,
              paddingBottom: 32,
              // + 8px de margen del pie = sectionGap.
              gap: sectionGap - 8,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {/* «Mis seguimientos» en el ordenador: hasta 960 px para que las tarjetas de pedidos cancelados se lean como
                «Tus pedidos» (lo demás de la pestaña ya va centrado con su máximo de 460 px y no cambia). */}
            <View
              style={{
                width: "100%",
                maxWidth: showSeguimientos && isDesktop ? 960 : cardMaxWidth,
                alignSelf: "center",
                gap: sectionGap,
              }}
            >
              {/* Las pestañas van pegadas a su contenido (no cuentan como apartado). Con sesión, deslizar el dedo a la
                  izquierda o a la derecha sobre esta zona cambia de pestaña (gestoPestanas). */}
              <Animated.View
                ref={zonaDeslizable}
                nativeID="perfil-deslizable"
                {...gestoPestanas.panHandlers}
                style={{ gap: 18, transform: [{ translateX: desliz }] }}
              >
              {isLogged ? <PerfilTabs value={perfilTab} onChange={(t) => cambiarPestana(t, "tocar")} /> : null}

              {showSeguimientos ? (
                // En el móvil, sin el margen extra de la tarjeta (ya hay 16 px de la página): las tarjetas de pedidos usan
                // todo el ancho útil, como en «Tus pedidos».
                <SectionCard padding={isMobile ? 0 : cardPadding}>
                  <SeguimientosSeccion filtroInicial={filtroParam === "facturas" ? "facturas" : undefined} />
                </SectionCard>
              ) : showMeGusta ? (
                <>
                  {/* «Avisos de precio» (mejora 5): lo que sigue con «Avísame si baja de precio», para quitarlo. */}
                  <AvisosPrecioSeccion cardPadding={cardPadding} />
                  <SectionCard padding={cardPadding}>
                    <MeGustaSeccion />
                  </SectionCard>
                </>
              ) : (
              <>
              {/* «Mi perfil» (foto, usuario, nombre, país, provincia y edad) con la cuenta dentro, debajo de los datos. Si la
                  tabla perfiles_cliente aún no está creada (migración sin aplicar), se oculta y la cuenta sale en su tarjeta. */}
              {isLogged && sessionUserId ? (
                <SectionCard padding={cardPadding}>
                  {perfilDisponible ? (
                    <>
                      {msg ? <InfoMessage text={msg} tone="error" /> : null}
                      {okMsg ? <InfoMessage text={okMsg} tone="success" /> : null}
                    </>
                  ) : null}
                  <PerfilPublico
                    uid={sessionUserId}
                    correo={sessionEmail}
                    cuenta={accionesCuenta}
                    cerrarSesion={botonSalir}
                    onDisponible={setPerfilDisponible}
                    recargar={recargarPerfil}
                  />
                </SectionCard>
              ) : null}
              {/* Envío gratis regalado por la tienda (dueño, 2026-11-23): solo si tiene alguno vigente. */}
              {isLogged && sessionUserId ? <EnvioGratisSeccion cardPadding={cardPadding} /> : null}
              {!isLogged || !sessionUserId || perfilDisponible === false ? (
              <SectionCard padding={cardPadding}>
                <View style={{ gap: 12, alignItems: "center" }}>
                    {sessionRole === "guest" ? <MarcaAnimada cual="logo-mini" ancho={96} /> : null}
                    {sessionRole === "guest" && aviso ? (
                      <Text style={{ color: "#1EA7E8", fontWeight: "800", textAlign: "center" }}>
                        {aviso}
                      </Text>
                    ) : null}
                    <Text
                      style={{
                        color: COLORS.text,
                        fontSize: heroTitleSize,
                        fontWeight: "900",
                        textAlign: "center",
                      }}
                    >
                      {sessionRole === "guest" ? "Inicia sesión o regístrate" : "Tu cuenta está activa"}
                    </Text>

                    {/* Sin sesión, sin subtítulo (dueño, 2026-11-26: «Accede con tu email y contraseña…» sobraba). */}
                    {sessionRole === "guest" ? null : (
                      <Text style={{ color: COLORS.muted, lineHeight: 22, maxWidth: 460, textAlign: "center" }}>
                        Has iniciado sesión correctamente.
                      </Text>
                    )}
                    {/* La ventaja de tener cuenta (dueño, 2026-11-11): los avisos de Blue de bajadas y novedades. */}
                    {sessionRole === "guest" ? (
                      // Centrado, como el resto de la cabecera (dueño, 2026-11-26): la campana encima y el texto debajo,
                      // en un recuadro azul muy suave.
                      <View
                        nativeID="perfil-ventaja-avisos"
                        style={{ alignItems: "center", gap: 6, width: "100%", maxWidth: 460, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 16, backgroundColor: "#EAF6FD" }}
                      >
                        <Ionicons name="notifications-outline" size={20} color={COLORS.accent} />
                        <Text style={{ color: COLORS.text, fontWeight: "700", fontSize: TAMANOS.minimo, lineHeight: 19, textAlign: "center" }}>
                          Con tu cuenta, Blue te avisa de bajadas de precio y artículos nuevos
                        </Text>
                      </View>
                    ) : null}
                </View>

                {msg ? <InfoMessage text={msg} tone="error" /> : null}
                {okMsg ? <InfoMessage text={okMsg} tone="success" /> : null}

                {isChecking ? (
                  <CargaMarca texto="Comprobando sesión…" />
                ) : null}

                {sessionRole === "guest" ? (
                  <>
                    {/* nativeID: sin sesión, la guía de Blue enmarca estas dos pestañas. */}
                    <View nativeID="perfil-acceso" style={{ flexDirection: "row", justifyContent: "center", gap: 10 }}>
                      <AuthPill
                        title="Crear cuenta"
                        anim={pillAnimSignup}
                        onPress={() => handlePillPress("signup")}
                        disabled={
                          isChecking ||
                          isSigningOut ||
                          isResettingPassword ||
                          (isSubmitting && mode !== "signup")
                        }
                        loading={isSubmitting && formOpen && mode === "signup"}
                      />
                      <AuthPill
                        title="Iniciar sesión"
                        anim={pillAnimSignin}
                        onPress={() => handlePillPress("signin")}
                        disabled={
                          isChecking ||
                          isSigningOut ||
                          isResettingPassword ||
                          (isSubmitting && mode !== "signin")
                        }
                        loading={isSubmitting && formOpen && mode === "signin"}
                      />
                    </View>

                    {formOpen && mode === "signin" ? (
                      <RevealPanel>
                        <View style={{ gap: 12 }}>
                          <View style={{ gap: 8 }}>
                            <LabelRow
                              onClose={() => {
                                clearMessages();
                                setFormOpen(false);
                              }}
                            >
                              Email
                            </LabelRow>
                            <Input
                              value={email}
                              onChangeText={(text) => {
                                setEmail(text);
                                clearMessages();
                              }}
                              placeholder="tu@email.com"
                              keyboardType="email-address"
                              returnKeyType="next"
                              editable={!isChecking && !isSigningOut && !isResettingPassword}
                              textContentType="username"
                              autoComplete="email"
                            />
                          </View>

                          <View style={{ gap: 8 }}>
                            <Label>Contraseña</Label>
                            <Input
                              value={pass}
                              onChangeText={(text) => {
                                setPass(text);
                                clearMessages();
                              }}
                              placeholder="Tu contraseña"
                              secureTextEntry
                              returnKeyType="go"
                              editable={!isChecking && !isSigningOut && !isResettingPassword}
                              textContentType="password"
                              autoComplete="password"
                              onSubmitEditing={() => {
                                if (canSubmitLogin) signIn();
                              }}
                            />
                          </View>

                          <BotonEnviarAcceso
                            nativeID="acceso-enviar-signin"
                            texto="Iniciar sesión"
                            activo={canSubmitLogin}
                            cargando={isSubmitting}
                            onPress={() => {
                              clearMessages();
                              if (canSubmitLogin) signIn();
                            }}
                          />

                          <Pressable
                            onPress={sendPasswordReset}
                            disabled={isSubmitting || isResettingPassword}
                            hitSlop={6}
                            style={({ pressed }) => ({
                              alignSelf: "center",
                              minHeight: TACTIL.minimo,
                              justifyContent: "center",
                              opacity: isSubmitting || isResettingPassword ? 0.5 : pressed ? 0.6 : 1,
                            })}
                          >
                            <Text style={{ color: COLORS.accentTexto, fontWeight: "800", fontSize: TAMANOS.minimo }}>
                              {isResettingPassword ? "Enviando enlace..." : "¿Olvidaste tu contraseña?"}
                            </Text>
                          </Pressable>
                        </View>
                      </RevealPanel>
                    ) : null}

                    {formOpen && mode === "signup" ? (
                      <RevealPanel>
                        <View style={{ gap: 12 }}>
                          <View style={{ gap: 8 }}>
                            <Label>Nombre visible</Label>
                            <Input
                              value={registerName}
                              onChangeText={(text) => {
                                setRegisterName(text);
                                clearMessages();
                              }}
                              placeholder="Nombre y apellidos"
                              editable={!isChecking && !isSigningOut && !isResettingPassword}
                              autoCapitalize="words"
                              textContentType="name"
                              autoComplete="name"
                            />
                          </View>

                          <View style={{ gap: 8 }}>
                            <Label>Nombre de usuario</Label>
                            <Input
                              value={registerUsername}
                              onChangeText={(text) => {
                                setRegisterUsername(text);
                                clearMessages();
                              }}
                              placeholder="Nombre de usuario"
                              editable={!isChecking && !isSigningOut && !isResettingPassword}
                              autoCapitalize="none"
                              autoCorrect={false}
                            />
                          </View>

                          <View style={{ gap: 8 }}>
                            <Label>País</Label>
                            <Input
                              value={registerCountry}
                              onChangeText={(text) => {
                                setRegisterCountry(text);
                                clearMessages();
                              }}
                              placeholder="País de residencia"
                              editable={!isChecking && !isSigningOut && !isResettingPassword}
                              autoCapitalize="words"
                            />
                          </View>

                          <View style={{ gap: 8 }}>
                            <LabelRow
                              onClose={() => {
                                clearMessages();
                                setFormOpen(false);
                              }}
                            >
                              Email
                            </LabelRow>
                            <Input
                              value={email}
                              onChangeText={(text) => {
                                setEmail(text);
                                clearMessages();
                              }}
                              placeholder="tu@email.com"
                              keyboardType="email-address"
                              returnKeyType="next"
                              editable={!isChecking && !isSigningOut && !isResettingPassword}
                              textContentType="emailAddress"
                              autoComplete="email"
                            />
                          </View>

                          <View style={{ gap: 8 }}>
                            <Label>Contraseña</Label>
                            <Input
                              value={pass}
                              onChangeText={(text) => {
                                setPass(text);
                                clearMessages();
                              }}
                              placeholder={`Mínimo ${CONTRASENA_MINIMA} caracteres`}
                              secureTextEntry
                              returnKeyType="go"
                              editable={!isChecking && !isSigningOut && !isResettingPassword}
                              textContentType="newPassword"
                              autoComplete="password-new"
                              nativeID="registro-contrasena"
                              onBlur={medirContrasenaCorta}
                              onSubmitEditing={() => {
                                if (canSubmitRegister) signUp();
                                else medirContrasenaCorta();
                              }}
                            />
                            {/* Mientras escribe una contraseña corta: cuántos caracteres le faltan (el botón se activa al llegar). */}
                            {avisoContrasenaCorta(pass) ? (
                              <Text nativeID="registro-contrasena-aviso" style={{ color: COLORS.muted, fontWeight: "700", fontSize: TAMANOS.minimo, textAlign: "center" }}>
                                {avisoContrasenaCorta(pass)}
                              </Text>
                            ) : null}
                          </View>

                          <BotonEnviarAcceso
                            nativeID="acceso-enviar-signup"
                            texto="Crear cuenta"
                            activo={canSubmitRegister}
                            cargando={isSubmitting}
                            onPress={() => {
                              clearMessages();
                              if (canSubmitRegister) signUp();
                              else medirContrasenaCorta();
                            }}
                          />
                        </View>
                      </RevealPanel>
                    ) : null}

                    {/* Vender, antes de crear la cuenta o entrar (dueño, 2026-11-26: sustituye a «¿Quién está detrás de la
                        tienda?», que sigue en el pie y en Inicio). Lleva a Vender y se mide en Administración → Analítica
                        («Vender: desde Perfil»). */}
                    <Pressable
                      nativeID="perfil-vender"
                      onPress={() => {
                        void medirEvento("perfil_vender", "Vender: desde Perfil", {
                          path: "/perfil",
                          metadata: { desde: "acceso", modo: formOpen ? mode : "ninguno" },
                        });
                        marcarOrigenVender("perfil", 120);
                        router.push("/vender");
                      }}
                      accessibilityRole="link"
                      style={({ pressed }) => ({
                        alignSelf: "center",
                        minHeight: 44,
                        justifyContent: "center",
                        paddingHorizontal: 8,
                        opacity: pressed ? 0.7 : 1,
                      })}
                    >
                      <Text style={{ color: COLORS.muted, fontSize: TAMANOS.minimo, textAlign: "center", lineHeight: 20 }}>
                        ¿Tienes una consola o un móvil que ya no usas?{" "}
                        <Text style={{ color: COLORS.accentTexto, fontWeight: "900" }}>Te lo tasamos en menos de 30 minutos →</Text>
                      </Text>
                    </Pressable>
                  </>
                ) : (
                  <View style={{ gap: 12 }}>
                    <View style={{ gap: 8, alignItems: "center" }}>
                      <Text
                        style={{ color: COLORS.muted, fontSize: TAMANOS.legal, fontWeight: "800", textAlign: "center" }}
                      >
                        SESIÓN ACTUAL
                      </Text>
                      <Text
                        style={{ color: COLORS.text, fontSize: 16, fontWeight: "900", textAlign: "center" }}
                      >
                        {sessionEmail || "No hay sesión iniciada"}
                      </Text>
                    </View>

                    {accionesCuenta}
                    {botonSalir}
                  </View>
                )}
              </SectionCard>
              ) : null}
              </>
              )}
              </Animated.View>

              <CarruselProductosCategoria />
              {/* «Recientes noticias que creemos que podrían interesarte» (dueño, 2026-11-27). */}
              <NoticiasEstantes pantalla="perfil" />
              {/* Las redes sociales ya salen en el pie de página (PieDePagina): no se repiten. */}
            </View>

            <PieDePagina sidePadding={pagePadding} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

// ============================================================================
// Pestañas del perfil y sección "Mis seguimientos" (pedidos + reparaciones)
// ----------------------------------------------------------------------------
// Lee "pedidos" + "pedido_items" (user_id = cliente): si la tabla aún no existe
// (migración pendiente) esa parte se oculta sin error. Lee "service_requests"
// (customer_user_id = cliente): si faltan las columnas de seguimiento, usa solo
// lo que exista. "Preguntar por esto" abre Blue IA con ?pedido= o ?reparacion=.
// El panel admin (app/admin/services.tsx) cambia la etapa de cada reparación.
// Números de seguimiento (migración 20261031170000): cada pedido y cada
// reparación tiene el suyo («VZ-XXXX-XXXX»). Si la tienda se lo da al cliente
// (p. ej. una ficha creada en VeoAura, api/escaparate-veoaura.ts), el cliente lo
// escribe aquí y vincular_seguimiento lo pasa a su cuenta. Sin la migración no
// sale el campo.
// ============================================================================

// Colores de «Mis seguimientos» (constants/temaTienda.ts, lección del 2026-11-12): el gris de texto no baja de 0.72
// (muted); mutedSoft solo para el texto de ejemplo de los campos y los iconos de relleno. Azul: accent / accentDark son
// el azul de marca (puntos y línea de la barra, iconos, botones y fondos); accentTexto es el TEXTO azul pequeño (todos los
// de esta pestaña miden menos de 17 px), en el azul más oscuro #0A78B4.
const SEG = {
  text: COLORES_TEXTO.texto,
  muted: COLORES_TEXTO.secundario,
  mutedSoft: "rgba(11,33,56,0.45)",
  line: "#E3EAF2",
  accent: COLORES_TEXTO.azulMarca,
  accentDark: COLORES_TEXTO.azulMarca,
  accentTexto: COLORES_TEXTO.azulTexto,
  danger: "#DC2626",
  ok: "#15803D",
};
// Letra de «Mis seguimientos» (TAMANOS de constants/temaTienda.ts): 13 px lo secundario, 15 lo normal y 20 los títulos; 12
// solo las etiquetas de la barra de etapas (y las de los filtros cuando son cinco).

// Selector de pestañas centrado con subrayado azul en la activa.
function PerfilTabs({ value, onChange }: { value: PerfilTab; onChange: (t: PerfilTab) => void }) {
  const { width } = useWindowDimensions();
  const tabs: { key: PerfilTab; label: string }[] = [
    { key: "cuenta", label: "Mi cuenta" },
    { key: "seguimientos", label: "Mis seguimientos" },
    { key: "megusta", label: "Me gusta" },
  ];
  return (
    // nativeID: la guía de Blue (components/AsistenteBlue.tsx) enmarca estas pestañas. Las tres caben en 360 px.
    <View nativeID="perfil-pestanas" role="tablist" style={{ flexDirection: "row", justifyContent: "center", gap: width < 400 ? 18 : 28, paddingTop: 4 }}>
      {tabs.map((t) => {
        const active = value === t.key;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            role="tab"
            aria-selected={active}
            hitSlop={6}
            // 44 px de alto (TACTIL.minimo; antes 26): el texto y su subrayado, centrados en la zona que se toca.
            style={({ pressed }) => ({ minHeight: TACTIL.minimo, alignItems: "center", justifyContent: "center", gap: 6, opacity: pressed ? 0.7 : 1 })}
          >
            <Text style={{ color: active ? SEG.text : SEG.muted, fontWeight: "900", fontSize: TAMANOS.cuerpo }}>{t.label}</Text>
            <View
              style={{
                height: 3,
                width: 28,
                borderRadius: 2,
                backgroundColor: active ? SEG.accent : "transparent",
              }}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

// Etapas de envío (reparación por envío, migración 20261111100000): etiqueta, en_camino, presupuesto, esperando_pieza y
// enviada (de vuelta), además de las de siempre.
type EtapaReparacion =
  | "solicitado"
  | "etiqueta"
  | "en_camino"
  | "recibido"
  | "diagnostico"
  | "presupuesto"
  | "esperando_pieza"
  | "reparando"
  | "listo"
  | "enviada"
  | "entregado"
  | "cancelado";
const ETAPAS_REPARACION: EtapaReparacion[] = ["solicitado", "recibido", "diagnostico", "reparando", "listo", "entregado"];
// Por Correos (dueño, 2026-11-11): Etiqueta lista → En camino → Recibida → Diagnóstico → Presupuesto → Reparando → Lista
// → Enviada de vuelta → Entregada.
const ETAPAS_ENVIO: EtapaReparacion[] = ["etiqueta", "en_camino", "recibido", "diagnostico", "presupuesto", "reparando", "listo", "enviada", "entregado"];
const ETIQUETA_REPARACION: Record<EtapaReparacion, string> = {
  solicitado: "Solicitada",
  etiqueta: "Etiqueta lista",
  en_camino: "En camino",
  recibido: "Recibida",
  diagnostico: "Diagnóstico",
  presupuesto: "Presupuesto",
  esperando_pieza: "Esperando pieza",
  reparando: "En reparación",
  listo: "Lista para recoger",
  enviada: "Enviada de vuelta",
  entregado: "Entregada",
  cancelado: "Cancelada",
};
// En la barra de progreso (seis etapas en un móvil): «Reparando» en vez de «En reparación», para que quepa en su columna
// (dueño, 2026-11-10: «arregla las etiquetas de la barra de reparaciones», se juntaban).
const ETIQUETA_BARRA_REPARACION: Record<EtapaReparacion, string> = { ...ETIQUETA_REPARACION, reparando: "Reparando" };

// Etapas que no están en la barra de una reparación: en qué punto de la barra se enseñan.
const EN_LA_BARRA: Partial<Record<EtapaReparacion, EtapaReparacion>> = {
  etiqueta: "solicitado",
  en_camino: "solicitado",
  presupuesto: "diagnostico",
  esperando_pieza: "reparando",
  enviada: "listo",
};

// La barra de una reparación: por Correos, sus nueve etapas; si no, las seis de siempre. «Esperando pieza» se enseña en el
// sitio de «Reparando» con su nombre.
function barraDeReparacion(r: { seguimiento: EtapaReparacion; entrega_modo?: string | null }): { etiquetas: string[]; actual: number } {
  const porEnvio = r.entrega_modo === "correos";
  const etapas = porEnvio ? ETAPAS_ENVIO : ETAPAS_REPARACION;
  const etiquetas = etapas.map((e) => (porEnvio && e === "listo" ? "Lista" : ETIQUETA_BARRA_REPARACION[e]));
  const enBarra = etapas.includes(r.seguimiento) ? r.seguimiento : EN_LA_BARRA[r.seguimiento] ?? "solicitado";
  const actual = etapas.indexOf(enBarra);
  if (r.seguimiento === "esperando_pieza" && actual >= 0) etiquetas[actual] = "Esperando pieza";
  return { etiquetas, actual };
}

type EstadoPedido = "pendiente" | "confirmado" | "preparado" | "enviado" | "entregado" | "cancelado";
const ETAPAS_PEDIDO: EstadoPedido[] = ["pendiente", "confirmado", "preparado", "enviado", "entregado"];

function etiquetasPedido(entrega: string | null): string[] {
  return ["Pendiente", "Confirmado", "Preparando", entrega === "recogida" ? "Listo para recoger" : "Enviado", "Entregado"];
}

type PedidoSeg = {
  id: string;
  numero: number | null;
  created_at: string;
  estado: EstadoPedido;
  entrega: "envio" | "recogida" | null;
  total_eur: number | null;
  items: string[];
  // Portada del primer artículo del pedido que la tenga (miniatura en «Mis pedidos»).
  foto?: string | null;
  codigo_seguimiento?: string | null;
  // Pago con tarjeta (Stripe; migraciones 20261105120000 y 20261106100000): solo los escribe el servidor.
  pago_estado?: string | null;
  pago_modo?: string | null;
  // Con qué se pagó online, según Stripe: card, klarna o bizum (migración 20261111150000; puede no venir).
  pago_metodo?: string | null;
  pagado_eur?: number | string | null;
  pagado_en?: string | null;
  devuelto_eur?: number | string | null;
  devuelto_en?: string | null;
  // Factura emitida por VeoAura (migración 20261110100000; puede no existir aún): la última de este pedido.
  factura?: { numero_factura: string | null; pdf: boolean } | null;
  // Venta en mano registrada en VeoAura (migración 20261111170000; puede no venir): origen 'tienda_fisica' y cómo se pagó.
  origen?: string | null;
  venta_forma_pago?: string | null;
  // Número de envío de Correos o enlace del transportista (migración 20261114160000; puede no venir): «Seguir el envío».
  envio_seguimiento?: string | null;
  // Código de entrega de 4 cifras (solo en curso y en mano o el mismo día; migración 20261121120000).
  entrega_codigo?: string | null;
  // Primer artículo del pedido con producto: el chat de la tienda abre con su tarjeta (valoración baja, mejora 11).
  primerProducto?: string | null;
  // Título de ese artículo (para «Avisarme cuando haya otro» tras una cancelación).
  primerTitulo?: string | null;
  // Motivo de la cancelación y su hora (migración 20261116100000; pueden no venir).
  cancelacion_motivo?: string | null;
  cancelado_en?: string | null;
  // Cancelados: ¿el primer artículo sigue a la venta? y su categoría (products; si no se puede leer, sin «Volver a comprar»).
  articuloALaVenta?: boolean;
  articuloCategoria?: string | null;
};

// «Pagado con Bizum · Entregado» bajo el título «Compra en tienda VZ-…» (venta en mano que manda VeoAura, evento
// «venta_tienda»): ya entregada y pagada, sin barra de envío. Solo texto con su icono, sin burbuja, como la línea del pago online.
const FORMA_PAGO_TIENDA: Record<string, string> = {
  efectivo: "en efectivo",
  tarjeta: "con tarjeta",
  bizum: "con Bizum",
  transferencia: "por transferencia",
  otro: "",
};
function CompraEnTienda({ p }: { p: PedidoSeg }) {
  const forma = FORMA_PAGO_TIENDA[p.venta_forma_pago ?? ""] ?? "";
  return (
    <View nativeID={`seguimiento-tienda-${p.numero ?? p.id}`} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, flexWrap: "wrap" }}>
      <Ionicons name="storefront-outline" size={16} color={SEG.ok} />
      <Text style={{ color: SEG.ok, fontWeight: "800", fontSize: TAMANOS.minimo, textAlign: "center", flexShrink: 1 }}>
        {/* «Compra en tienda» ya va en el título del pedido. */}
        {`Pagado${forma ? ` ${forma}` : ""} · Entregado`}
      </Text>
    </View>
  );
}

// Una vez por sesión de la app: pide al servidor que una a esta cuenta las compras en mano que VeoAura mandó con su
// correo (api/factura.ts, «unir_compras_tienda»; solo con el correo confirmado). Devuelve cuántas ha unido.
const cuentasYaUnidas = new Set<string>();
async function unirComprasEnTienda(uid: string, token: string): Promise<number> {
  if (cuentasYaUnidas.has(uid)) return 0;
  cuentasYaUnidas.add(uid);
  try {
    const r = await fetch("/api/factura", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ accion: "unir_compras_tienda" }),
    });
    const d = (await r.json().catch(() => null)) as { ok?: boolean; unidas?: number } | null;
    return r.ok && d?.ok ? Number(d.unidas ?? 0) : 0;
  } catch {
    return 0;
  }
}

// Factura del pedido (la emite VeoAura, la tienda no factura): el apartado «Factura» sale SIEMPRE en cada pedido (dueño,
// 2026-11-10: «que el apartado de factura aparezca aunque no haya ninguna factura»): con factura, «Descargar factura F-…»
// por api/factura.ts; sin ella, en qué punto está (pagado, pendiente de pago o cancelado). facturasOk = false (la tabla
// aún no existe): el mismo apartado, sin botón.
function FacturaDelPedido({ p, facturasOk }: { p: PedidoSeg; facturasOk: boolean }) {
  const [estado, setEstado] = useState<"listo" | "pidiendo">("listo");
  const [aviso, setAviso] = useState<string | null>(null);
  const pagado = p.estado === "entregado" || (p.pago_estado === "pagado" && !p.devuelto_en);
  if (!p.factura || !facturasOk) {
    // Igual que la línea del pago (PagoDelPedido): icono de 16 y texto corto de 13,5 en negrita, sin burbuja (lección
    // «iconos sin burbuja»): las dos líneas se leen como un mismo bloque «pago · factura».
    const texto =
      p.estado === "cancelado" ? "Sin factura · pedido cancelado" : pagado ? "Factura en preparación" : "Factura al completar el pago";
    return (
      <View nativeID={`seguimiento-factura-espera-${p.numero ?? p.id}`} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, flexWrap: "wrap" }}>
        <Ionicons name="document-text-outline" size={16} color={SEG.muted} />
        <Text style={{ color: SEG.muted, fontWeight: "800", fontSize: TAMANOS.minimo, textAlign: "center", flexShrink: 1 }}>{texto}</Text>
      </View>
    );
  }
  const numero = p.factura.numero_factura ?? "";

  async function descargar() {
    if (estado === "pidiendo") return;
    setEstado("pidiendo");
    setAviso(null);
    try {
      const { data } = await supabase.auth.getSession();
      const r = await fetch(`/api/factura?pedido=${encodeURIComponent(p.id)}`, {
        headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
      });
      const d = (await r.json().catch(() => null)) as { ok?: boolean; url?: string; error?: string } | null;
      if (r.ok && d?.ok && d.url) {
        void medirEvento("factura_descargada", "Pedidos: factura descargada");
        abrirDescarga(d.url);
      } else if (r.status === 409) {
        setAviso("La factura se está generando. Inténtalo de nuevo en unos minutos.");
      } else {
        setAviso("No hemos podido descargar la factura. Inténtalo de nuevo más tarde.");
      }
    } catch {
      setAviso("No hemos podido descargar la factura: revisa tu conexión.");
    } finally {
      setEstado("listo");
    }
  }

  return (
    <View style={{ alignItems: "center", gap: 4 }}>
      <Pressable
        nativeID={`seguimiento-factura-${p.numero ?? p.id}`}
        onPress={descargar}
        disabled={estado === "pidiendo"}
        accessibilityRole="button"
        accessibilityLabel={`Descargar factura ${numero}`}
        hitSlop={6}
        style={({ pressed }) => ({ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6, opacity: pressed || estado === "pidiendo" ? 0.6 : 1 })}
      >
        {estado === "pidiendo" ? <ActivityIndicator size="small" color={SEG.accent} /> : <Ionicons name="download-outline" size={16} color={SEG.accentDark} />}
        <Text style={{ color: SEG.accentTexto, fontWeight: "800", fontSize: TAMANOS.minimo }}>Descargar factura {numero}</Text>
      </Pressable>
      {aviso ? (
        <Text accessibilityRole="alert" style={{ color: SEG.muted, fontSize: TAMANOS.minimo, textAlign: "center", maxWidth: 360 }}>
          {aviso}
        </Text>
      ) : null}
    </View>
  );
}

// «Pagado online con Bizum · 240,00€ · 6 nov 2026» (tarjeta, Bizum o Klarna, si se sabe) debajo del total (y, si se
// devolvió, «Devuelto …»): solo texto con su icono, sin burbuja, como el resto de «Mis seguimientos».
const METODO_ONLINE: Record<string, string> = { card: " con tarjeta", bizum: " con Bizum", klarna: " con Klarna" };
function PagoDelPedido({ p }: { p: PedidoSeg }) {
  if (p.pago_estado !== "pagado") return null;
  const devuelto = !!p.devuelto_en;
  const con = METODO_ONLINE[p.pago_metodo ?? ""] ?? "";
  return (
    <View nativeID={`seguimiento-pago-${p.numero ?? p.id}`} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, flexWrap: "wrap" }}>
      <Ionicons name={devuelto ? "return-down-back-outline" : "card"} size={16} color={devuelto ? SEG.muted : SEG.ok} />
      <Text style={{ color: devuelto ? SEG.muted : SEG.ok, fontWeight: "800", fontSize: TAMANOS.minimo, textAlign: "center", flexShrink: 1 }}>
        {devuelto
          ? `Pago devuelto · ${segEuros(Number(p.devuelto_eur))} · ${segFecha(p.devuelto_en ?? null)}`
          : `Pagado online${con} · ${segEuros(Number(p.pagado_eur))} · ${segFecha(p.pagado_en ?? null)}`}
        {p.pago_modo === "prueba" ? " (de prueba)" : ""}
      </Text>
    </View>
  );
}

// Código de entrega (contracargos, parte 2; dueño 2026-11-21): en las entregas en mano y del mismo día, el cliente se lo
// dice a quien le entrega y así queda confirmado que lo ha recibido. Sobrio: etiqueta pequeña, las 4 cifras grandes y
// espaciadas (fáciles de leer en voz alta) y una línea de ayuda; sin fondos de color ni burbujas.
function CodigoEntrega({ p }: { p: PedidoSeg }) {
  if (!p.entrega_codigo || p.estado === "entregado" || p.estado === "cancelado") return null;
  return (
    <View
      nativeID={`seguimiento-codigo-${p.numero ?? p.id}`}
      accessible
      accessibilityLabel={`Código de entrega: ${p.entrega_codigo.split("").join(" ")}. Díselo a quien te lo entregue.`}
      style={{ alignItems: "center", gap: 4, width: "100%", maxWidth: 460, alignSelf: "center", paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: SEG.line }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Ionicons name="keypad-outline" size={16} color={SEG.muted} />
        <Text style={{ color: SEG.muted, fontWeight: "800", fontSize: TAMANOS.minimo, letterSpacing: 0.4 }}>Código de entrega</Text>
      </View>
      <Text nativeID={`seguimiento-codigo-cifras-${p.numero ?? p.id}`} selectable style={{ color: SEG.text, fontWeight: "900", fontSize: 28, letterSpacing: 10, paddingLeft: 10, fontVariant: ["tabular-nums"] }}>
        {p.entrega_codigo}
      </Text>
      <Text style={{ color: SEG.muted, fontSize: TAMANOS.minimo, lineHeight: 19, textAlign: "center" }}>Díselo a quien te lo entregue para confirmar la entrega.</Text>
    </View>
  );
}

// «15 de noviembre» (hora de Madrid); con otro año, «15 de noviembre de 2025». Vacío sin fecha válida.
function fechaLargaSeg(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const anio = (x: Date) => x.toLocaleString("es-ES", { timeZone: "Europe/Madrid", year: "numeric" });
  return d.toLocaleDateString("es-ES", { timeZone: "Europe/Madrid", day: "numeric", month: "long", ...(anio(d) !== anio(new Date()) ? { year: "numeric" } : {}) });
}

// El reembolso de un pedido cancelado, con las columnas que ya lee «Mis pedidos» (pago_estado, pago_metodo, pagado_eur,
// devuelto_eur y devuelto_en; las escribe solo el servidor con Stripe): emitido, en curso o «No se ha realizado ningún
// cargo». Textos de gran tienda (dueño, 2026-11-16): frases completas, sin coloquialismos ni repetir la etiqueta de encima.
const REEMBOLSO_A: Record<string, string> = { card: "a tu tarjeta", klarna: "a tu cuenta de Klarna", bizum: "a tu Bizum" };
function reembolsoDelCancelado(p: PedidoSeg): { estado: "emitido" | "en_curso" | "sin_cobro"; titulo: string; detalle: string | null } {
  if (p.pago_estado !== "pagado") return { estado: "sin_cobro", titulo: "No se ha realizado ningún cargo", detalle: null };
  const pagado = Number(p.pagado_eur ?? p.total_eur ?? 0);
  if (p.devuelto_en) {
    const devuelto = Number(p.devuelto_eur ?? 0) > 0 ? Number(p.devuelto_eur) : pagado;
    const a = REEMBOLSO_A[p.pago_metodo ?? ""] ?? "por el mismo medio de pago";
    return {
      estado: "emitido",
      titulo: `Hemos reembolsado ${segEuros(devuelto)} ${a} el ${fechaLargaSeg(p.devuelto_en)}${p.pago_modo === "prueba" ? " (de prueba)" : ""}`,
      detalle: p.pago_metodo === "klarna" ? "Klarna actualizará tus plazos de pago." : "El importe puede tardar entre 5 y 10 días hábiles en aparecer en tu cuenta.",
    };
  }
  return { estado: "en_curso", titulo: `Estamos tramitando la devolución de ${segEuros(pagado)} por el mismo medio de pago`, detalle: null };
}

// Pedido cancelado (dueño, 2026-11-16: «que se vea profesional, estilo Amazon»; adaptado a móvil y ordenador el mismo día):
// un solo título con su icono rojo («Cancelado el 15 de noviembre») y debajo, en gris, la referencia, el día y el total
// (sin tachar), el artículo con su foto, dos pasos discretos («Pedido recibido» y «Cancelado» con su hora), el motivo (solo
// si lo hay, en su versión para el cliente: motivoParaCliente; nunca notas internas), «Pago · No se ha realizado ningún
// cargo» o el reembolso, «Volver a comprar» (solo si sigue a
// la venta) y «Ver artículos parecidos» (48 px), el interruptor «Avisarme cuando haya otro» si el artículo ya no está
// disponible (avisos_reposicion, lib/interaccion.ts; Blue avisa en la app cuando entra otro) y «¿Necesitas ayuda?». En el
// ordenador (tarjeta de 760 px o más): franja gris con «Pedido realizado · Total · Pedido nº» y las acciones en una
// columna fija de 264 px a la derecha.
// Analítica sin datos personales: aviso_reposicion_activado (canal) / _desactivado, y cancelado_volver_comprar /
// cancelado_ver_parecidos (solo el id del artículo; Administración → Analítica, «Pedidos cancelados: recuperación»).
// Se prueba con las secciones CANDIS y CANCAV de pruebas/perfil-datos.mjs.
function CancelacionDelPedido({
  p,
  historial,
  aviso,
  avisosOk,
  onGuardado,
  onAyuda,
}: {
  p: PedidoSeg;
  historial: HistorialPedidos | null;
  aviso: AvisoReposicion | null;
  avisosOk: boolean;
  onGuardado: (a: AvisoReposicion) => void;
  onAyuda: () => void;
}) {
  const ref = p.numero ?? p.id;
  // La hora de la cancelación: la columna cancelado_en o, si no viene, el último «cancelado» del historial.
  const canceladoEn = p.cancelado_en ?? [...(historial?.[p.id] ?? [])].reverse().find((c) => c.estado === "cancelado")?.creado_en ?? null;
  const fechaCancel = fechaLargaSeg(canceladoEn);
  const reembolso = reembolsoDelCancelado(p);
  const titulo = p.primerTitulo ?? p.items[0] ?? "";
  // Ancha (ordenador, la tarjeta mide 760 px o más): franja gris con los datos del pedido en columnas y, a la derecha, una
  // columna fija con las acciones. Si no, la tarjeta de móvil (todo en una columna y los botones a lo ancho).
  const [anchoTarjeta, setAnchoTarjeta] = useState(0);
  const ancha = anchoTarjeta >= 760;
  // Estrecho: las tres opciones del canal, una debajo de otra (en el móvil o en la columna de acciones del ordenador, a
  // 16 px no caben en una fila sin cortarse).
  const anchoVentana = useWindowDimensions().width;
  const estrecho = ancha || anchoVentana < 520;
  const activo = !!aviso?.activo;
  const [canal, setCanal] = useState<CanalReposicion>(aviso?.canal ?? "app");
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  useEffect(() => {
    if (aviso?.canal) setCanal(aviso.canal);
  }, [aviso?.canal]);
  const ofreceAviso = avisosOk && p.cancelacion_motivo === MOTIVO_NO_DISPONIBLE && !!(p.primerTitulo ?? p.items[0]);
  const modelo = textoReposicion(p.primerTitulo ?? p.items[0] ?? "");
  const nombreCanal = (c: CanalReposicion) => (c === "app" ? "en la app" : c === "correo" ? "por correo" : "en la app y por correo");

  async function guardar(cambios: { activo: boolean; canal: CanalReposicion }) {
    if (ocupado) return;
    setOcupado(true);
    setMensaje(null);
    const r = await fijarAvisoReposicion({ pedidoId: p.id, productId: p.primerProducto ?? null, titulo: p.primerTitulo ?? p.items[0] ?? "" }, cambios, aviso);
    setOcupado(false);
    if (r === "sin_sesion" || r === "error") {
      setMensaje({ ok: false, texto: r === "sin_sesion" ? "Inicia sesión para activar el aviso." : "No hemos podido guardar el aviso. Inténtalo de nuevo." });
      return;
    }
    onGuardado(r);
    if (cambios.activo !== activo) {
      void medirEvento(cambios.activo ? "aviso_reposicion_activado" : "aviso_reposicion_desactivado", cambios.activo ? "Pedidos: aviso de reposición activado" : "Pedidos: aviso de reposición apagado", {
        metadata: cambios.activo ? { canal: cambios.canal } : {},
      });
    }
    setMensaje({
      ok: true,
      texto: cambios.activo ? `Aviso activado: te avisaremos ${nombreCanal(cambios.canal)} cuando tengamos otro «${r.texto}».` : "Aviso desactivado. Puedes volver a activarlo cuando quieras.",
    });
  }

  // «Ver artículos parecidos»: el catálogo de su categoría (si se sabe) o la búsqueda por el modelo del artículo.
  function verParecidos() {
    const destino = p.articuloCategoria ? "categoria" : titulo ? "busqueda" : "catalogo";
    void medirEvento("cancelado_ver_parecidos", "Pedido cancelado: ver artículos parecidos", { metadata: { product_id: p.primerProducto ?? null, destino } });
    if (p.articuloCategoria) router.push(`/catalogo?cat=${encodeURIComponent(p.articuloCategoria)}`);
    else if (titulo) router.push(`/catalogo?query=${encodeURIComponent(modelo || titulo)}`);
    else router.push("/catalogo");
  }
  function volverAComprar() {
    if (!p.primerProducto) return;
    void medirEvento("cancelado_volver_comprar", "Pedido cancelado: volver a comprar", { metadata: { product_id: p.primerProducto } });
    router.push(`/producto/${p.primerProducto}`);
  }
  const puedeRecomprar = !!p.primerProducto && !!p.articuloALaVenta;

  // Un bloque de información con su icono (sin burbuja): «Motivo» y «Pago» o «Reembolso».
  const bloque = (id: string, icono: React.ComponentProps<typeof Ionicons>["name"], color: string, etiqueta: string, cuerpo: React.ReactNode) => (
    <View nativeID={id} style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
      <Ionicons name={icono} size={18} color={color} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={{ color: SEG.muted, fontWeight: "700", fontSize: TAMANOS.minimo, lineHeight: 18 }}>{etiqueta}</Text>
        {cuerpo}
      </View>
    </View>
  );

  // Estado: un solo título con su icono rojo («Cancelado el 15 de noviembre» o «Pedido cancelado» si no hay fecha).
  const estadoUI = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Ionicons name="close-circle" size={18} color={SEG.danger} />
      <Text nativeID={`cancelado-fecha-${ref}`} style={{ color: SEG.text, fontWeight: "800", fontSize: TAMANOS.destacado, lineHeight: 22, flexShrink: 1 }}>
        {fechaCancel ? `Cancelado el ${fechaCancel}` : "Pedido cancelado"}
      </Text>
    </View>
  );

  // Cabecera del ordenador: franja gris con «Pedido realizado», «Total» y «Pedido nº» en columnas (estilo «Tus pedidos»).
  const datoCabecera = (etiqueta: string, valor: string, id?: string, derecha = false) => (
    <View nativeID={id} style={{ gap: 2, alignItems: derecha ? "flex-end" : "flex-start", flexShrink: 1 }}>
      <Text style={{ color: SEG.muted, fontWeight: "700", fontSize: TAMANOS.minimo, letterSpacing: 0.3, textTransform: "uppercase" }}>{etiqueta}</Text>
      <Text style={{ color: SEG.text, fontWeight: "700", fontSize: 14 }}>{valor}</Text>
    </View>
  );
  const cabeceraAncha = (
    <View
      nativeID={`cancelado-cabecera-${ref}`}
      style={{ flexDirection: "row", alignItems: "flex-start", gap: 40, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: "#F5F8FB", borderBottomWidth: 1, borderBottomColor: SEG.line }}
    >
      {datoCabecera("Pedido realizado", segFecha(p.created_at))}
      {p.total_eur != null ? (
        <View style={{ gap: 2 }}>
          <Text style={{ color: SEG.muted, fontWeight: "700", fontSize: TAMANOS.minimo, letterSpacing: 0.3, textTransform: "uppercase" }}>Total</Text>
          <Text nativeID={`cancelado-total-${ref}`} style={{ color: SEG.text, fontWeight: "700", fontSize: 14 }}>
            {segEuros(p.total_eur)}
          </Text>
        </View>
      ) : null}
      <View style={{ flex: 1 }} />
      {p.codigo_seguimiento ? datoCabecera("Pedido nº", p.codigo_seguimiento, `mis-pedidos-titulo-${ref}`, true) : null}
    </View>
  );
  // Cabecera del móvil: el estado y, debajo en gris, la referencia, el día y el total (sin tachar: no es un descuento).
  const cabeceraMovil = (
    <View nativeID={`cancelado-cabecera-${ref}`} style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14, gap: 4, borderBottomWidth: 1, borderBottomColor: SEG.line }}>
      {estadoUI}
      <Text nativeID={`mis-pedidos-titulo-${ref}`} style={{ color: SEG.muted, fontWeight: "600", fontSize: TAMANOS.minimo, lineHeight: 19 }}>
        Pedido{p.codigo_seguimiento ? ` ${p.codigo_seguimiento}` : ""} · Realizado el {segFecha(p.created_at)}
        {p.total_eur != null ? (
          <>
            {" · "}
            <Text nativeID={`cancelado-total-${ref}`} style={{ color: SEG.text, fontWeight: "700" }}>
              {segEuros(p.total_eur)}
            </Text>
          </>
        ) : null}
      </Text>
    </View>
  );

  // El artículo con su foto (56 px).
  const articuloUI = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <MiniaturaSeguimiento nativeID={`seguimiento-mini-${ref}`} foto={p.foto} icono="cube-outline" alt={p.items[0] ?? "Artículo del pedido"} />
      <Text nativeID={`cancelado-articulo-${ref}`} numberOfLines={3} style={{ color: SEG.text, fontWeight: "700", fontSize: TAMANOS.cuerpo, lineHeight: 20, flex: 1, minWidth: 0 }}>
        {p.items.length ? p.items.join(" · ") : "Artículo del pedido"}
      </Text>
    </View>
  );

  // Dos pasos discretos (puntos de 8 px y línea fina): cuándo llegó y cuándo se canceló (con su hora, si se sabe; nunca
  // inventada).
  const pasosUI = (
    <View nativeID={`pasos-pedido-${ref}`} style={{ gap: 6, maxWidth: ancha ? 460 : undefined }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: SEG.accent }} />
        <View style={{ flex: 1, height: 1, backgroundColor: "#E9C9C9" }} />
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: SEG.danger }} />
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
        <View nativeID={`paso-${ref}-pendiente`} style={{ flexShrink: 1 }}>
          <Text style={{ color: SEG.text, fontWeight: "700", fontSize: TAMANOS.minimo, lineHeight: 18 }}>Pedido recibido</Text>
          {fechaHoraPaso(p.created_at) ? (
            <Text nativeID={`paso-${ref}-pendiente-fecha`} style={{ color: SEG.muted, fontSize: TAMANOS.minimo, lineHeight: 18 }}>
              {fechaHoraPaso(p.created_at)}
            </Text>
          ) : null}
        </View>
        <View nativeID={`paso-${ref}-cancelado`} style={{ flexShrink: 1, alignItems: "flex-end" }}>
          <Text style={{ color: SEG.danger, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 18 }}>Cancelado</Text>
          {fechaHoraPaso(canceladoEn) ? (
            <Text nativeID={`paso-${ref}-cancelado-fecha`} style={{ color: SEG.muted, fontSize: TAMANOS.minimo, lineHeight: 18, textAlign: "right" }}>
              {fechaHoraPaso(canceladoEn)}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );

  // El motivo (solo si lo hay: en los antiguos no se rellena con un texto genérico; la ayuda ya va al final), tal como lo
  // lee el cliente («A petición tuya»…), y el pago: «Pago · No se ha realizado ningún cargo» si no hubo cobro;
  // «Reembolso» solo cuando lo hubo.
  const motivoCliente = motivoParaCliente(p.cancelacion_motivo);
  const infoUI = (
    <View style={{ gap: 14, borderTopWidth: 1, borderTopColor: SEG.line, paddingTop: 14 }}>
      {motivoCliente
        ? bloque(
            `cancelacion-motivo-${ref}`,
            "information-circle-outline",
            SEG.muted,
            "Motivo de la cancelación",
            <Text style={{ color: SEG.text, fontSize: TAMANOS.cuerpo, lineHeight: 21 }}>{motivoCliente}</Text>
          )
        : null}
      {bloque(
        `cancelacion-devolucion-${ref}`,
        reembolso.estado === "sin_cobro" ? "checkmark-circle-outline" : reembolso.estado === "emitido" ? "return-down-back-outline" : "time-outline",
        reembolso.estado === "en_curso" ? SEG.accent : SEG.ok,
        reembolso.estado === "sin_cobro" ? "Pago" : "Reembolso",
        <>
          <Text nativeID={`cancelado-reembolso-${ref}`} style={{ color: reembolso.estado === "en_curso" ? SEG.text : SEG.ok, fontWeight: "700", fontSize: TAMANOS.cuerpo, lineHeight: 21 }}>
            {reembolso.titulo}
          </Text>
          {reembolso.detalle ? <Text style={{ color: SEG.muted, fontSize: TAMANOS.minimo, lineHeight: 19 }}>{reembolso.detalle}</Text> : null}
        </>
      )}
    </View>
  );

  // Qué hacer ahora: «Volver a comprar» (relleno, el azul de marca de los botones principales; solo si sigue a la venta) y
  // «Ver artículos parecidos» (contorno). Uno debajo del otro a lo ancho, de 48 px.
  const botonesUI = (
    <View nativeID={`cancelado-botones-${ref}`} style={{ gap: 10 }}>
      {puedeRecomprar ? (
        <Pressable
          nativeID={`cancelado-recomprar-${ref}`}
          onPress={volverAComprar}
          accessibilityRole="button"
          accessibilityLabel="Volver a comprar"
          style={({ pressed }) => ({
            minHeight: CAMPO.alto,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            paddingHorizontal: 16,
            borderRadius: 999,
            backgroundColor: SEG.accent,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Ionicons name="refresh" size={17} color="#FFFFFF" />
          <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: TAMANOS.cuerpo }}>Volver a comprar</Text>
        </Pressable>
      ) : null}
      <Pressable
        nativeID={`cancelado-parecidos-${ref}`}
        onPress={verParecidos}
        accessibilityRole="button"
        accessibilityLabel="Ver artículos parecidos"
        style={({ pressed }) => ({
          minHeight: CAMPO.alto,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          paddingHorizontal: 16,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: SEG.accent,
          backgroundColor: "#FFFFFF",
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Ionicons name="grid-outline" size={17} color={SEG.accent} />
        <Text style={{ color: SEG.accentTexto, fontWeight: "800", fontSize: TAMANOS.cuerpo }}>Ver artículos parecidos</Text>
      </Pressable>
    </View>
  );

  const avisoUI = ofreceAviso ? (
        <View style={{ gap: 10, borderTopWidth: 1, borderTopColor: SEG.line, paddingTop: 12 }}>
          <Pressable
            nativeID={`cancelacion-aviso-${ref}`}
            onPress={() => guardar({ activo: !activo, canal })}
            disabled={ocupado}
            accessibilityRole="switch"
            accessibilityState={{ checked: activo, disabled: ocupado }}
            aria-checked={activo}
            accessibilityLabel={`Avisarme cuando haya otro ${modelo}`}
            style={({ pressed }) => ({
              minHeight: TACTIL.minimo,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingVertical: 6,
              opacity: pressed || ocupado ? 0.8 : 1,
            })}
          >
            <Ionicons name={activo ? "notifications" : "notifications-outline"} size={20} color={activo ? SEG.accent : SEG.text} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: SEG.text, fontWeight: "700", fontSize: TAMANOS.cuerpo, lineHeight: 20 }}>Avisarme cuando haya otro</Text>
              <Text numberOfLines={2} style={{ color: SEG.muted, fontSize: TAMANOS.minimo, lineHeight: 18 }}>
                {modelo}
              </Text>
            </View>
            {ocupado ? <ActivityIndicator size="small" color={SEG.accent} /> : null}
            {/* El interruptor dibujado (se toca toda la fila, de 44 px). */}
            <View style={{ width: 46, height: 28, borderRadius: 14, padding: 3, backgroundColor: activo ? SEG.accent : "#CBD5E1", alignItems: activo ? "flex-end" : "flex-start" }}>
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: "#FFFFFF" }} />
            </View>
          </Pressable>

          {activo ? (
            <View nativeID={`cancelacion-canal-${ref}`} style={{ gap: 8 }}>
              <Text style={{ color: SEG.text, fontWeight: "800", fontSize: TAMANOS.minimo }}>¿Cómo quieres que te avisemos?</Text>
              <View
                role="radiogroup"
                aria-label="¿Cómo quieres que te avisemos?"
                style={{ flexDirection: estrecho ? "column" : "row", borderRadius: 14, borderWidth: 1, borderColor: SEG.line, backgroundColor: "#F4F9FD", padding: 3, gap: 3 }}
              >
                {CANALES_REPOSICION.map((c) => {
                  const elegido = canal === c.valor;
                  return (
                    <Pressable
                      key={c.valor}
                      nativeID={`cancelacion-canal-${ref}-${c.valor}`}
                      onPress={() => {
                        if (elegido) return;
                        setCanal(c.valor);
                        void guardar({ activo: true, canal: c.valor });
                      }}
                      disabled={ocupado}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: elegido, disabled: ocupado }}
                      aria-checked={elegido}
                      accessibilityLabel={c.texto}
                      style={({ pressed }) => ({
                        flex: estrecho ? undefined : 1,
                        minWidth: 0,
                        minHeight: TACTIL.minimo,
                        flexDirection: estrecho ? "row" : "column",
                        alignItems: "center",
                        justifyContent: estrecho ? "flex-start" : "center",
                        gap: estrecho ? 10 : 2,
                        paddingVertical: 6,
                        paddingHorizontal: estrecho ? 12 : 4,
                        borderRadius: 11,
                        backgroundColor: elegido ? "#FFFFFF" : "transparent",
                        borderWidth: 1,
                        borderColor: elegido ? SEG.accent : "transparent",
                        opacity: pressed ? 0.85 : 1,
                      })}
                    >
                      <Ionicons name={c.icono} size={18} color={elegido ? SEG.accent : SEG.muted} />
                      <Text style={{ flexShrink: 1, color: elegido ? SEG.text : SEG.muted, fontWeight: elegido ? "900" : "700", fontSize: CAMPO.letra, textAlign: estrecho ? "left" : "center" }}>
                        {c.texto}
                      </Text>
                      {estrecho ? (
                        <Ionicons name={elegido ? "radio-button-on" : "radio-button-off"} size={20} color={elegido ? SEG.accent : SEG.muted} style={{ marginLeft: "auto" }} />
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
        </View>
      ) : null;

  const mensajeUI = mensaje ? (
    <Text
      nativeID={`cancelacion-mensaje-${ref}`}
      accessibilityLiveRegion="polite"
      aria-live="polite"
      style={{ color: mensaje.ok ? SEG.ok : SEG.danger, fontWeight: "700", fontSize: TAMANOS.minimo, lineHeight: 19 }}
    >
      {mensaje.texto}
    </Text>
  ) : null;

  // La ayuda (el mismo destino que «Preguntar por esto»: Blue IA con la referencia del pedido): al pie en el móvil y al
  // final de la columna de acciones en el ordenador.
  const ayudaUI = (
    <Pressable
      nativeID={`cancelado-ayuda-${ref}`}
      onPress={onAyuda}
      accessibilityRole="button"
      accessibilityLabel="¿Necesitas ayuda? Escríbenos por el chat"
      style={({ pressed }) => ({
        minHeight: TACTIL.minimo,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: ancha ? 0 : 16,
        paddingVertical: 10,
        borderTopWidth: 1,
        borderTopColor: SEG.line,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Ionicons name="chatbubble-ellipses-outline" size={18} color={SEG.accent} />
      {/* En dos líneas limpias (sin partir «Escríbenos por el chat» por la mitad). */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: SEG.text, fontWeight: "700", fontSize: 14, lineHeight: 19 }}>¿Necesitas ayuda?</Text>
        <Text style={{ color: SEG.accentTexto, fontWeight: "700", fontSize: 14, lineHeight: 19 }}>Escríbenos por el chat</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={SEG.muted} />
    </Pressable>
  );

  return (
    <View
      nativeID={`cancelacion-pedido-${ref}`}
      onLayout={(e) => setAnchoTarjeta(Math.round(e.nativeEvent.layout.width))}
      style={{ width: "100%", maxWidth: 960, alignSelf: "center", borderRadius: 14, borderWidth: 1, borderColor: SEG.line, backgroundColor: "#FFFFFF", overflow: "hidden" }}
    >
      {ancha ? (
        <>
          {cabeceraAncha}
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 32, padding: 20 }}>
            <View nativeID={`cancelado-contenido-${ref}`} style={{ flex: 1, minWidth: 0, gap: 16 }}>
              {estadoUI}
              {articuloUI}
              {pasosUI}
              {infoUI}
            </View>
            <View nativeID={`cancelado-acciones-${ref}`} style={{ width: 264, flexShrink: 0, gap: 12 }}>
              {botonesUI}
              {avisoUI}
              {mensajeUI}
              {ayudaUI}
            </View>
          </View>
        </>
      ) : (
        <>
          {cabeceraMovil}
          <View nativeID={`cancelado-contenido-${ref}`} style={{ padding: 16, gap: 16 }}>
            {articuloUI}
            {pasosUI}
            {infoUI}
            <View nativeID={`cancelado-acciones-${ref}`} style={{ gap: 12 }}>
              {botonesUI}
              {avisoUI}
              {mensajeUI}
            </View>
          </View>
          {ayudaUI}
        </>
      )}
    </View>
  );
}

type ReparacionSeg = {
  id: string;
  created_at: string;
  // Portada del servicio contratado (miniatura en «Reparaciones y Mantenimientos»).
  foto?: string | null;
  service_title: string;
  seguimiento: EtapaReparacion;
  seguimiento_nota: string | null;
  seguimiento_actualizado: string | null;
  codigo_seguimiento?: string | null;
  // Reparación por envío (migración 20261111100000; sin ella no vienen y todo sale como antes).
  entrega_modo?: string | null;
  aparatos?: number | null;
  etiqueta_eur?: number | null;
  etiqueta_lista?: boolean;
  etiqueta_pagada_en?: string | null;
  presupuesto_eur?: number | null;
  presupuesto_aceptado_en?: string | null;
  fotos_recepcion?: number;
  espera_pieza_hasta?: string | null;
  // Parte 2 (migración 20261111130000; sin ella no vienen): cobros, «sin arreglo» y garantía. Los importes y «pagado»
  // los pone la base de datos o el servidor; el cliente solo avisa, elige y pide la garantía.
  etiqueta_avisada_en?: string | null;
  pago_estado?: string | null;
  pago_modo?: string | null;
  pagado_eur?: number | null;
  pagado_en?: string | null;
  pago_avisado_en?: string | null;
  diagnostico_resultado?: string | null;
  oferta_compra_eur?: number | null;
  vuelta_eur?: number | null;
  sin_arreglo_eleccion?: string | null;
  vuelta_seguimiento?: string | null;
  entregado_en?: string | null;
  garantia_de?: string | null;
  // Lo que se copia a una garantía (la base de datos lo vuelve a poner desde la original).
  datos?: { service_id: string | null; nombre: string; apellido: string; ciudad: string; metodo_contacto: string | null; contacto: string | null; codigo_postal: string | null };
};

// Número de seguimiento que da la tienda (p. ej. al crear en VeoAura la ficha de una reparación o de un pedido): al
// escribirlo, ese pedido o esa reparación pasan a esta cuenta (función vincular_seguimiento, migración 20261031170000).
const MOTIVOS_SEGUIMIENTO: Record<string, string> = {
  formato: "Ese número no tiene el formato de la tienda: «VZ-» y 8 letras o números (por ejemplo, VZ-7K3M-9QPD).",
  no_existe: "No encontramos ese número. Revisa que esté bien escrito.",
  otra_cuenta: "Ese número ya está añadido a otra cuenta. Si es tuyo, escríbenos desde Blue IA.",
  demasiados_intentos: "Has realizado demasiados intentos seguidos. Vuelve a intentarlo dentro de una hora.",
  sin_sesion: "Inicia sesión para añadir el número.",
};

// Uno solo para pedidos y reparaciones (el número dice qué es) y PLEGADO: en el móvil ya no ocupa la pantalla dos veces
// (dueño, 2026-11-10: «mejorar esta pestaña para la versión móvil»). Desde 2026-11-16 va AL FINAL de la pestaña, debajo de
// pedidos y reparaciones (arriba estorbaba), como una línea discreta: «¿Tienes un número de seguimiento de un pedido o una
// reparación? Añádelo aquí» (44 px); abierto, «Añadir un número de seguimiento» lo vuelve a plegar.
function AnadirNumeroSeguimiento({ onAnadido }: { onAnadido: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const puede = codigo.replace(/[^A-Z0-9]/g, "").length >= 10 && !enviando;

  async function anadir() {
    if (!puede) return;
    setEnviando(true);
    setAviso(null);
    try {
      const { data, error } = await supabase.rpc("vincular_seguimiento", { p_codigo: codigo });
      if (error) throw error;
      const r = (data ?? {}) as { ok?: boolean; motivo?: string; tipo?: "pedido" | "reparacion"; titulo?: string; numero?: number };
      if (r.ok && r.tipo) {
        medirEvento("seguimiento_numero_anadido", "Perfil: número de seguimiento añadido", { metadata: { tipo: r.tipo } });
        // La referencia escrita, con el formato de la tienda (como la normaliza vincular_seguimiento): «VZ-7K3M-9QPD».
        const limpio = codigo.toUpperCase().replace(/[^A-Z0-9]/g, "");
        const referencia = `VZ-${limpio.slice(2, 6)}-${limpio.slice(6, 10)}`;
        setCodigo("");
        setAviso({
          ok: true,
          texto:
            r.tipo === "pedido"
              ? `Listo: el pedido ${referencia} ya está en «Mis pedidos».`
              : `Listo: «${r.titulo ?? "tu reparación"}» ya está en «Reparaciones y Mantenimientos».`,
        });
        onAnadido();
      } else {
        medirEvento("seguimiento_numero_fallido", "Perfil: número de seguimiento no válido", { metadata: { motivo: r.motivo ?? "desconocido" } });
        setAviso({ ok: false, texto: MOTIVOS_SEGUIMIENTO[r.motivo ?? ""] ?? "No hemos podido añadir el número. Inténtalo de nuevo." });
      }
    } catch (e) {
      console.error("Error añadiendo el número de seguimiento:", e);
      setAviso({ ok: false, texto: "No hemos podido añadir el número. Inténtalo de nuevo." });
    } finally {
      setEnviando(false);
    }
  }

  if (!abierto) {
    return (
      <Pressable
        nativeID="seguimiento-anadir-abrir"
        onPress={() => {
          setAbierto(true);
          // Administración → Analítica (embudo): cuántos abren el campo frente a cuántos lo añaden.
          medirEvento("seguimiento_numero_abierto", "Perfil: abre «añadir número de seguimiento»");
        }}
        accessibilityRole="button"
        accessibilityLabel="¿Tienes un número de seguimiento de un pedido o una reparación? Añádelo aquí"
        hitSlop={6}
        style={({ pressed }) => ({ minHeight: 44, maxWidth: 460, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", opacity: pressed ? 0.7 : 1 })}
      >
        {/* Una línea discreta al final de la pestaña (dueño, 2026-11-16: arriba estorbaba): la pregunta en gris y «Añádelo
            aquí» en el azul de los enlaces. */}
        <Text style={{ color: SEG.muted, fontWeight: "600", fontSize: TAMANOS.minimo, lineHeight: 20, textAlign: "center", flexShrink: 1 }}>
          ¿Tienes un número de seguimiento de un pedido o una reparación?{" "}
          <Text style={{ color: SEG.accentTexto, fontWeight: "800", textDecorationLine: "underline" }}>Añádelo aquí</Text>
        </Text>
      </Pressable>
    );
  }

  return (
    <View nativeID="seguimiento-anadir" style={{ width: "100%", maxWidth: 460, gap: 8, alignItems: "center" }}>
      {/* Abierto se puede volver a plegar (dueño, 2026-11-10: «al darle se queda así y ya no puede volver a cerrar»). */}
      <Pressable
        nativeID="seguimiento-anadir-cerrar"
        onPress={() => {
          setAbierto(false);
          setAviso(null);
        }}
        accessibilityRole="button"
        accessibilityLabel="Cerrar «añadir número de seguimiento»"
        hitSlop={6}
        style={({ pressed }) => ({ minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, opacity: pressed ? 0.7 : 1 })}
      >
        <Text style={{ color: SEG.accentTexto, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 20, textAlign: "center", flexShrink: 1 }}>
          Añadir un número de seguimiento <Ionicons name="chevron-up" size={16} color={SEG.accentDark} style={{ verticalAlign: "middle" }} />
        </Text>
      </Pressable>
      <Text style={{ color: SEG.muted, fontSize: TAMANOS.minimo, textAlign: "center" }}>Introduce el número que te hemos facilitado para un pedido o una reparación.</Text>
      <View style={{ flexDirection: "row", gap: 8, width: "100%" }}>
        <TextInput
          value={codigo}
          onChangeText={(t) => {
            setCodigo(t.toUpperCase().slice(0, 16));
            setAviso(null);
          }}
          onSubmitEditing={anadir}
          placeholder="VZ-XXXX-XXXX"
          placeholderTextColor={SEG.mutedSoft}
          autoCapitalize="characters"
          autoCorrect={false}
          accessibilityLabel="Número de seguimiento"
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: CAMPO.alto,
            borderWidth: 1,
            borderColor: SEG.line,
            borderRadius: 14,
            paddingHorizontal: 14,
            fontSize: CAMPO.letra,
            fontWeight: "800",
            letterSpacing: 1,
            color: SEG.text,
            textAlign: "center",
            backgroundColor: "#FFFFFF",
          }}
        />
        <Pressable
          onPress={anadir}
          disabled={!puede}
          accessibilityRole="button"
          accessibilityLabel="Añadir el número de seguimiento"
          style={({ pressed }) => ({
            minHeight: 48,
            paddingHorizontal: 18,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: SEG.accentDark,
            opacity: !puede ? 0.45 : pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>{enviando ? "Añadiendo…" : "Añadir"}</Text>
        </Pressable>
      </View>
      {aviso ? (
        <Text accessibilityRole="alert" style={{ color: aviso.ok ? SEG.ok : SEG.danger, fontWeight: "800", textAlign: "center", lineHeight: 19 }}>
          {aviso.texto}
        </Text>
      ) : null}
    </View>
  );
}

// Filtro de «Mis pedidos» (dueño, 2026-11-10: «filtrar con un emoticono a mis pedidos en curso, cancelados y mis
// facturas»): una fila de iconos con su texto y su recuento, sin burbuja (lección «iconos sin burbuja»); el elegido en
// el azul de la tienda y subrayado, el resto en gris; 44 px para el dedo. «Facturas» solo si ya hay facturas.
// Filtros: Todos, En curso, Completados (entregados; añadido el mismo día), Cancelados y Facturas.
// «Completados» (dueño, 2026-11-10): los entregados.
type FiltroPedidos = "todos" | "curso" | "completados" | "cancelados" | "facturas";
function pasaFiltroPedido(p: PedidoSeg, f: FiltroPedidos) {
  if (f === "curso") return p.estado !== "cancelado" && p.estado !== "entregado";
  if (f === "completados") return p.estado === "entregado";
  if (f === "cancelados") return p.estado === "cancelado";
  if (f === "facturas") return !!p.factura;
  return true;
}
const TEXTO_FILTRO_VACIO: Record<FiltroPedidos, string> = {
  todos: "",
  curso: "No tienes pedidos en curso ahora mismo.",
  completados: "Todavía no tienes pedidos completados.",
  cancelados: "No tienes pedidos cancelados.",
  facturas: "Todavía no tienes facturas. Aparecerán aquí en cuanto se emitan.",
};
function FiltrosPedidos({
  pedidos,
  facturasOk,
  actual,
  onCambiar,
}: {
  pedidos: PedidoSeg[];
  facturasOk: boolean;
  actual: FiltroPedidos;
  onCambiar: (f: FiltroPedidos) => void;
}) {
  const opciones: { f: FiltroPedidos; icono: React.ComponentProps<typeof Ionicons>["name"]; texto: string }[] = [
    { f: "todos", icono: "albums-outline", texto: "Todos" },
    { f: "curso", icono: "time-outline", texto: "En curso" },
    { f: "completados", icono: "checkmark-circle-outline", texto: "Completados" },
    { f: "cancelados", icono: "close-circle-outline", texto: "Cancelados" },
    ...(facturasOk ? [{ f: "facturas" as const, icono: "document-text-outline" as const, texto: "Facturas" }] : []),
  ];
  return (
    // Los cuatro en UNA fila también en el móvil: icono encima del texto, como la barra de abajo de la tienda.
    <View nativeID="seguimiento-filtros" accessibilityRole="tablist" style={{ flexDirection: "row", justifyContent: "center", width: "100%", maxWidth: 460 }}>
      {opciones.map((o) => {
        const elegido = o.f === actual;
        const n = pedidos.filter((p) => pasaFiltroPedido(p, o.f)).length;
        // Número y nombre del elegido en el azul de texto (texto pequeño); el icono y la raya, en el de marca.
        const color = elegido ? SEG.accentTexto : SEG.muted;
        return (
          <Pressable
            key={o.f}
            nativeID={`seguimiento-filtro-${o.f}`}
            onPress={() => {
              onCambiar(o.f);
              // Administración → Analítica: qué filtro se usa.
              medirEvento("seguimientos_filtro", `Perfil: filtro de pedidos · ${o.texto}`);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: elegido }}
            // En la web, el lector de pantalla también sabe cuál está elegido.
            {...({ "aria-selected": elegido } as object)}
            accessibilityLabel={`${o.texto}: ${n}`}
            // Cada uno mide lo que su nombre y reparten lo que sobra (con anchos iguales «Completados» no cabía).
            style={({ pressed }) => ({
              flexGrow: 1,
              flexShrink: 0,
              flexBasis: "auto",
              paddingHorizontal: 3,
              // 44 px de ancho como mínimo («Todos» medía 40).
              minWidth: TACTIL.minimo,
              minHeight: 52,
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              paddingVertical: 4,
              borderBottomWidth: 2,
              borderBottomColor: elegido ? SEG.accent : "transparent",
              opacity: pressed ? 0.7 : 1,
            })}
          >
            {/* Arriba el icono con su número; debajo el nombre (así «Cancelados» cabe a 360-390 px). */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name={o.icono} size={19} color={elegido ? SEG.accent : SEG.muted} />
              <Text style={{ color, fontWeight: "900", fontSize: TAMANOS.minimo }}>{n}</Text>
            </View>
            {/* Nombre de 13 px; con cinco filtros, 12 (tamaño de etiqueta) para que «Completados» y «Cancelados» quepan a 360 px. */}
            <Text numberOfLines={1} style={{ color, fontWeight: elegido ? "900" : "800", fontSize: opciones.length > 4 ? TAMANOS.legal : TAMANOS.minimo, textAlign: "center" }}>
              {o.texto}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Miniatura del artículo o del servicio (dueño, 2026-11-10), como en la cesta: la portada entera sobre blanco, por el
// optimizador (ancho), o su icono si no hay foto. Va a la izquierda de lo que compraste o del servicio.
function MiniaturaSeguimiento({ nativeID, foto, icono, alt }: { nativeID: string; foto?: string | null; icono: React.ComponentProps<typeof Ionicons>["name"]; alt: string }) {
  return (
    <View
      nativeID={nativeID}
      style={{ width: 56, height: 56, borderRadius: 12, overflow: "hidden", backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: SEG.line, alignItems: "center", justifyContent: "center", flexShrink: 0 }}
    >
      {foto ? (
        <ImagenInteligente uri={foto} alt={alt} ancho={56} contentFit="contain" style={{ width: "100%", height: "100%" }} />
      ) : (
        <Ionicons name={icono} size={24} color={SEG.mutedSoft} />
      )}
    </View>
  );
}

// Lo secundario de cada pedido o reparación en UNA línea discreta: la entrega y el número de seguimiento (para dárselo a
// la tienda si pregunta por él). «Envío a domicilio · Nº de seguimiento VZ-…».
function DatosDelSeguimiento({ entrega, codigo }: { entrega: string | null; codigo?: string | null }) {
  const partes = [entrega, codigo ? `Nº de seguimiento ${codigo}` : null].filter(Boolean);
  if (!partes.length) return null;
  return (
    <Text style={{ color: SEG.muted, fontSize: TAMANOS.minimo, fontWeight: "800", letterSpacing: 0.3, textAlign: "center" }}>{partes.join(" · ")}</Text>
  );
}

// --- Reparación por envío en «Mis seguimientos» (dueño, 2026-11-11; migración 20261111100000) --------------------------
// Plazo, «Esperando pieza», la etiqueta de Correos (descarga por api/factura.ts?solicitud=… con enlace firmado), cómo
// embalarlo y a dónde enviarlo (plegable), las fotos de cuando llegó (visor de fotos) y el presupuesto con «Aceptar
// presupuesto» (la base de datos solo le deja al cliente aceptar el suyo). Todo icono + texto, sin burbujas; la única
// píldora azul es «Aceptar presupuesto» cuando toca.
const PASOS_EMBALAJE = [
  "Quita discos, tarjetas, fundas y accesorios que no hagan falta para la reparación.",
  "Envuélvelo en plástico de burbujas o papel y mételo en una caja rígida, sin que se mueva al agitarla.",
  "Dentro, una nota con tu nombre y tu número de seguimiento.",
  "Cierra la caja con cinta, pega la etiqueta en una cara lisa y llévala a Correos.",
];

function fechaCorta(fecha: string | null | undefined) {
  if (!fecha) return "";
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(fecha) ? `${fecha}T12:00:00` : fecha);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

async function pedirArchivoReparacion(solicitud: string, tipo: "etiqueta" | "fotos"): Promise<{ ok: boolean; status: number; url?: string; fotos?: FotoVisor[] }> {
  const { data } = await supabase.auth.getSession();
  const r = await fetch(`/api/factura?solicitud=${encodeURIComponent(solicitud)}&tipo=${tipo}`, {
    headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
  });
  const d = (await r.json().catch(() => null)) as { ok?: boolean; url?: string; fotos?: FotoVisor[] } | null;
  return { ok: r.ok && !!d?.ok, status: r.status, url: d?.url, fotos: Array.isArray(d?.fotos) ? d.fotos : undefined };
}

function LineaIcono({ id, icono, color, children }: { id?: string; icono: React.ComponentProps<typeof Ionicons>["name"]; color?: string; children: React.ReactNode }) {
  return (
    <View nativeID={id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, maxWidth: 460 }}>
      <Ionicons name={icono} size={16} color={color ?? SEG.muted} />
      <Text style={{ color: color ?? SEG.text, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 19, textAlign: "center", flexShrink: 1 }}>{children}</Text>
    </View>
  );
}

function EnvioDeLaReparacion({
  r,
  ajustes,
  onAceptado,
}: {
  r: ReparacionSeg;
  ajustes: AjustesReparacionEnvio | null;
  onAceptado: (id: string, fecha: string) => void;
}) {
  const porEnvio = r.entrega_modo === "correos";
  const [embalajeAbierto, setEmbalajeAbierto] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [fotos, setFotos] = useState<FotoVisor[]>([]);
  const [visor, setVisor] = useState<number | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [aceptando, setAceptando] = useState(false);
  const terminado = r.seguimiento === "enviada" || r.seguimiento === "entregado" || r.seguimiento === "cancelado";

  // Las fotos de cuando llegó (enlaces firmados de unos minutos).
  useEffect(() => {
    if (!r.fotos_recepcion) return;
    let vivo = true;
    pedirArchivoReparacion(r.id, "fotos")
      .then((d) => {
        if (vivo && d.ok && d.fotos) setFotos(d.fotos);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [r.id, r.fotos_recepcion]);

  async function descargarEtiqueta() {
    if (descargando) return;
    setDescargando(true);
    setAviso(null);
    try {
      const d = await pedirArchivoReparacion(r.id, "etiqueta");
      if (d.ok && d.url) {
        void medirEvento("reparacion_envio", "Reparación por envío: etiqueta descargada");
        abrirDescarga(d.url);
      } else {
        setAviso(d.status === 404 ? "La etiqueta aún no está lista: te avisamos en cuanto la tengas." : "No hemos podido descargar la etiqueta. Inténtalo de nuevo en un rato.");
      }
    } catch {
      setAviso("No hemos podido descargar la etiqueta: revisa tu conexión.");
    } finally {
      setDescargando(false);
    }
  }

  async function aceptarPresupuesto() {
    if (aceptando) return;
    setAceptando(true);
    setAviso(null);
    try {
      const { data, error } = await supabase
        .from("service_requests")
        .update({ presupuesto_aceptado_en: new Date().toISOString() })
        .eq("id", r.id)
        .select("presupuesto_aceptado_en");
      const fecha = (data as { presupuesto_aceptado_en?: string | null }[] | null)?.[0]?.presupuesto_aceptado_en;
      if (error || !fecha) throw error ?? new Error("sin respuesta");
      void medirEvento("reparacion_envio", "Reparación por envío: presupuesto aceptado");
      setConfirmando(false);
      onAceptado(r.id, fecha);
    } catch {
      setAviso("No hemos podido aceptar el presupuesto. Inténtalo de nuevo o pregúntanos.");
    } finally {
      setAceptando(false);
    }
  }

  const hayPresupuesto = r.presupuesto_eur != null && Number.isFinite(Number(r.presupuesto_eur));
  if (!porEnvio && !hayPresupuesto && !r.espera_pieza_hasta && !fotos.length) return null;

  return (
    <View nativeID={`seguimiento-envio-${r.id}`} style={{ width: "100%", maxWidth: 460, gap: 8, alignItems: "center" }}>
      {porEnvio && !terminado ? (
        <LineaIcono id={`seguimiento-plazo-${r.id}`} icono="time-outline">
          Reparación en {ajustes?.plazo_horas ?? 72} h desde que llega
        </LineaIcono>
      ) : null}
      {porEnvio && r.seguimiento === "listo" && ajustes?.dias_custodia ? (
        <LineaIcono id={`seguimiento-custodia-${r.id}`} icono="shield-checkmark-outline">
          La guardamos {ajustes.dias_custodia} {ajustes.dias_custodia === 1 ? "día" : "días"} mientras decides
        </LineaIcono>
      ) : null}
      {r.espera_pieza_hasta && !terminado ? (
        <LineaIcono id={`seguimiento-pieza-${r.id}`} icono="hourglass-outline" color="#92660B">
          Esperando pieza · llegada aprox. {fechaCorta(r.espera_pieza_hasta)}
        </LineaIcono>
      ) : null}

      {porEnvio ? (
        <>
          <LineaIcono id={`seguimiento-etiqueta-coste-${r.id}`} icono="pricetag-outline">
            Etiqueta de Correos{r.etiqueta_eur != null ? ` · ${segEuros(Number(r.etiqueta_eur))}` : ""}
            {r.etiqueta_pagada_en ? " · pagada" : ""}
            {r.aparatos && r.aparatos > 1 ? ` · ${r.aparatos} aparatos` : ""}
          </LineaIcono>
          {r.etiqueta_lista && !terminado ? (
            <Pressable
              nativeID={`seguimiento-etiqueta-${r.id}`}
              onPress={descargarEtiqueta}
              disabled={descargando}
              accessibilityRole="button"
              accessibilityLabel="Descargar etiqueta de Correos"
              hitSlop={6}
              style={({ pressed }) => ({ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6, opacity: pressed || descargando ? 0.6 : 1 })}
            >
              {descargando ? <ActivityIndicator size="small" color={SEG.accent} /> : <Ionicons name="download-outline" size={18} color={SEG.accentDark} />}
              <Text style={{ color: SEG.accentTexto, fontWeight: "900", fontSize: TAMANOS.cuerpo }}>Descargar etiqueta</Text>
            </Pressable>
          ) : null}
          {!terminado && ["solicitado", "etiqueta", "en_camino"].includes(r.seguimiento) ? (
            <>
              {/* Plegable: el mismo enlace lo abre y lo vuelve a cerrar. */}
              <Pressable
                nativeID={`seguimiento-embalaje-boton-${r.id}`}
                onPress={() => setEmbalajeAbierto((v) => !v)}
                accessibilityRole="button"
                accessibilityState={{ expanded: embalajeAbierto }}
                hitSlop={6}
                style={({ pressed }) => ({ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6, opacity: pressed ? 0.7 : 1 })}
              >
                <Ionicons name="cube-outline" size={17} color={SEG.accentDark} />
                <Text style={{ color: SEG.accentTexto, fontWeight: "800", fontSize: TAMANOS.minimo }}>Cómo embalarlo y a dónde enviarlo</Text>
                <Ionicons name={embalajeAbierto ? "chevron-up" : "chevron-down"} size={16} color={SEG.accentDark} />
              </Pressable>
              {embalajeAbierto ? (
                <View nativeID={`seguimiento-embalaje-${r.id}`} style={{ gap: 6, alignSelf: "stretch" }}>
                  {PASOS_EMBALAJE.map((t, i) => (
                    <Text key={i} style={{ color: SEG.text, fontSize: TAMANOS.minimo, lineHeight: 19 }}>
                      {i + 1}. {t}
                    </Text>
                  ))}
                  {ajustes?.direccion_taller ? (
                    <View nativeID={`seguimiento-taller-${r.id}`} style={{ gap: 2, alignItems: "center", paddingTop: 4 }}>
                      <Text style={{ color: SEG.muted, fontSize: TAMANOS.minimo, fontWeight: "800" }}>ENVÍALO A</Text>
                      <Text selectable style={{ color: SEG.text, fontWeight: "800", fontSize: TAMANOS.cuerpo, lineHeight: 20, textAlign: "center" }}>
                        {ajustes.direccion_taller}
                      </Text>
                    </View>
                  ) : null}
                  <Text
                    accessibilityRole="link"
                    onPress={() => router.push("/politicas/reparacion-envio")}
                    // 44 px de zona táctil: 20 de línea + 12 arriba y abajo.
                    style={{ color: SEG.accentTexto, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 20, paddingVertical: 12, textAlign: "center", textDecorationLine: "underline" }}
                  >
                    Condiciones de reparación por envío
                  </Text>
                </View>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}

      {fotos.length ? (
        <View nativeID={`seguimiento-fotos-${r.id}`} style={{ alignItems: "center", gap: 6 }}>
          <Text style={{ color: SEG.muted, fontSize: TAMANOS.minimo, fontWeight: "800" }}>ASÍ NOS LLEGÓ</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {fotos.map((f, i) => (
              <Pressable
                key={f.id}
                nativeID={`seguimiento-foto-${r.id}-${i}`}
                onPress={() => setVisor(i)}
                accessibilityRole="button"
                accessibilityLabel={`Ver la foto ${i + 1} de cómo llegó`}
                style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
              >
                <MiniaturaSeguimiento nativeID={`seguimiento-foto-mini-${r.id}-${i}`} foto={f.url} icono="image-outline" alt={`Foto ${i + 1} de cómo llegó`} />
              </Pressable>
            ))}
          </View>
          <VisorFotos visible={visor !== null} images={fotos} initialIndex={visor ?? 0} onClose={() => setVisor(null)} />
        </View>
      ) : null}

      {hayPresupuesto ? (
        r.presupuesto_aceptado_en ? (
          <LineaIcono id={`seguimiento-presupuesto-${r.id}`} icono="checkmark-circle" color={SEG.ok}>
            Presupuesto aceptado · {segEuros(Number(r.presupuesto_eur))} · {fechaCorta(r.presupuesto_aceptado_en)}
          </LineaIcono>
        ) : (
          <View style={{ alignItems: "center", gap: 6 }}>
            <LineaIcono id={`seguimiento-presupuesto-${r.id}`} icono="document-text-outline">
              Presupuesto: {segEuros(Number(r.presupuesto_eur))}
            </LineaIcono>
            {r.seguimiento === "presupuesto" ? (
              <>
                {confirmando ? (
                  <Text nativeID={`seguimiento-presupuesto-confirmar-texto-${r.id}`} style={{ color: SEG.text, fontSize: TAMANOS.minimo, lineHeight: 19, textAlign: "center", maxWidth: 360 }}>
                    Al aceptarlo empezamos la reparación por {segEuros(Number(r.presupuesto_eur))}.
                  </Text>
                ) : null}
                <Pressable
                  nativeID={`seguimiento-aceptar-${r.id}`}
                  onPress={() => (confirmando ? aceptarPresupuesto() : setConfirmando(true))}
                  disabled={aceptando}
                  accessibilityRole="button"
                  style={({ pressed }) => ({
                    borderRadius: 999,
                    minHeight: 44,
                    paddingHorizontal: 22,
                    justifyContent: "center",
                    backgroundColor: SEG.accentDark,
                    opacity: pressed || aceptando ? 0.85 : 1,
                  })}
                >
                  <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>
                    {aceptando ? "Aceptando…" : confirmando ? "Sí, aceptar presupuesto" : "Aceptar presupuesto"}
                  </Text>
                </Pressable>
                {confirmando ? (
                  <Pressable
                    nativeID={`seguimiento-aceptar-cancelar-${r.id}`}
                    onPress={() => setConfirmando(false)}
                    accessibilityRole="button"
                    hitSlop={6}
                    style={({ pressed }) => ({ minHeight: 44, justifyContent: "center", opacity: pressed ? 0.7 : 1 })}
                  >
                    <Text style={{ color: SEG.accentTexto, fontWeight: "800", fontSize: TAMANOS.minimo }}>Ahora no</Text>
                  </Pressable>
                ) : null}
              </>
            ) : null}
          </View>
        )
      ) : null}

      {aviso ? (
        <Text accessibilityRole="alert" style={{ color: SEG.muted, fontSize: TAMANOS.minimo, textAlign: "center", maxWidth: 360 }}>
          {aviso}
        </Text>
      ) : null}
    </View>
  );
}

// --- Reparación por envío, parte 2 (dueño, 2026-11-11; migración 20261111130000) ---------------------------------------
// Pagar la etiqueta y «Pagar y enviármelo» (o la vuelta si no tiene arreglo): con tarjeta (api/pago.ts, el importe lo pone
// la base de datos) o por Bizum/transferencia (los datos del dueño y el concepto = número VZ-…; «Ya lo he pagado» solo
// avisa). «Si no tiene arreglo»: «Te lo compramos» (Vender con el modelo y la nota) o «Devuélvemelo». Garantía: «Garantía
// hasta …» y «Ha vuelto a fallar» (una solicitud nueva gratis enlazada; la base de datos comprueba que es suya, está
// entregada y en plazo). Todo icono + texto; la única píldora azul de la tarjeta es «Pagar con tarjeta» (o «Pagar con
// tarjeta o Bizum» si la página de pago online ofrece Bizum) cuando toca.

type ConceptoPago = "etiqueta" | "reparacion";
type GarantiaSeg = { hasta: Date | null; puede: boolean; abierta: boolean };

const FORMA_PAGO: Record<string, string> = { tarjeta: "con tarjeta", prueba: "con tarjeta (de prueba)", bizum: "por Bizum", transferencia: "por transferencia" };

function sumarMeses(fecha: string | null | undefined, meses: number): Date | null {
  if (!fecha) return null;
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return null;
  d.setMonth(d.getMonth() + meses);
  return d;
}

/** La garantía de una reparación entregada: desde la entrega de la original (una garantía no alarga la garantía). */
function garantiaDe(r: ReparacionSeg, todas: ReparacionSeg[], meses: number, ahora = new Date()): GarantiaSeg | null {
  if (r.seguimiento !== "entregado") return null;
  const raiz = (r.garantia_de && todas.find((x) => x.id === r.garantia_de)) || r;
  const hasta = sumarMeses(raiz.entregado_en ?? raiz.seguimiento_actualizado, meses);
  const abierta = todas.some((x) => x.garantia_de === raiz.id && x.seguimiento !== "entregado" && x.seguimiento !== "cancelado");
  return { hasta, puede: !!hasta && hasta.getTime() >= ahora.getTime() && !abierta, abierta };
}

// «Mantenimiento Playstation 5» → «Playstation 5» (el modelo para Vender); si no hay nada que quitar, el título tal cual.
function modeloDelServicio(titulo: string) {
  const limpio = titulo.replace(/^(mantenimiento|reparaci[oó]n|limpieza|sustituci[oó]n|cambio)( de| del)?\s+/i, "").trim();
  return (limpio || titulo).slice(0, 60);
}

function BotonTexto({ id, icono, texto, onPress, disabled }: { id: string; icono: React.ComponentProps<typeof Ionicons>["name"]; texto: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      nativeID={id}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      hitSlop={6}
      style={({ pressed }) => ({ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 4, opacity: pressed || disabled ? 0.6 : 1 })}
    >
      <Ionicons name={icono} size={17} color={SEG.accentDark} />
      <Text style={{ color: SEG.accentTexto, fontWeight: "800", fontSize: TAMANOS.minimo }}>{texto}</Text>
    </Pressable>
  );
}

function PagoDeLaSolicitud({
  r,
  concepto,
  importe,
  titulo,
  ajustes,
  tarjeta,
  bizum = false,
  avisadoEn,
  onAvisado,
}: {
  r: ReparacionSeg;
  concepto: ConceptoPago;
  importe: number;
  titulo: string;
  ajustes: AjustesReparacionEnvio | null;
  tarjeta: boolean;
  bizum?: boolean;
  avisadoEn: string | null | undefined;
  onAvisado: (patch: Partial<ReparacionSeg>) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const manual = datosPagoManual(ajustes);
  const campo = concepto === "etiqueta" ? "etiqueta_avisada_en" : "pago_avisado_en";
  const id = `${concepto}-${r.id}`;

  async function pagarConTarjeta() {
    if (ocupado) return;
    setOcupado(true);
    setAviso(null);
    try {
      const { data } = await supabase.auth.getSession();
      const resp = await fetch("/api/pago", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
        body: JSON.stringify({ accion: "crear", solicitud: r.id, concepto }),
      });
      const d = (await resp.json().catch(() => null)) as { ok?: boolean; url?: string; pagado?: boolean } | null;
      if (resp.ok && d?.pagado) {
        onAvisado(concepto === "etiqueta" ? { etiqueta_pagada_en: new Date().toISOString() } : { pago_estado: "pagado" });
      } else if (resp.ok && d?.url && typeof window !== "undefined") {
        // Se mide antes de salir a Stripe (como mucho medio segundo de espera).
        await Promise.race([
          Promise.resolve(medirEvento("reparacion_envio", `Reparación por envío: pago con tarjeta · ${concepto === "etiqueta" ? "etiqueta" : "reparación"}`)).catch(() => {}),
          new Promise((fin) => setTimeout(fin, 500)),
        ]);
        window.location.assign(d.url);
        return;
      } else {
        setAviso(
          manual
            ? `No hemos podido abrir el pago online. Inténtalo de nuevo en un rato o ${manual.bizum && manual.iban ? "paga por Bizum o transferencia" : manual.bizum ? "paga por Bizum" : "paga por transferencia"} con los datos de aquí debajo.`
            : "No hemos podido abrir el pago online. Inténtalo de nuevo en un rato o pregúntanos aquí debajo."
        );
      }
    } catch {
      setAviso("No hemos podido abrir el pago: revisa tu conexión.");
    }
    setOcupado(false);
  }

  async function yaPagado() {
    if (ocupado) return;
    setOcupado(true);
    setAviso(null);
    try {
      const { data, error } = await supabase
        .from("service_requests")
        .update({ [campo]: new Date().toISOString() })
        .eq("id", r.id)
        .select(campo);
      const fecha = (data as Record<string, string | null>[] | null)?.[0]?.[campo];
      if (error || !fecha) throw error ?? new Error("sin respuesta");
      void medirEvento("reparacion_envio", `Reparación por envío: aviso de pago · ${concepto === "etiqueta" ? "etiqueta" : "reparación"}`);
      onAvisado({ [campo]: fecha } as Partial<ReparacionSeg>);
    } catch {
      setAviso("No hemos podido guardar tu aviso. Inténtalo de nuevo o pregúntanos.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <View nativeID={`seguimiento-pago-${id}`} style={{ alignItems: "center", gap: 6, alignSelf: "stretch" }}>
      <LineaIcono id={`seguimiento-pago-importe-${id}`} icono="card-outline">
        {titulo} · {segEuros(importe)}
      </LineaIcono>
      {avisadoEn ? (
        <LineaIcono id={`seguimiento-pago-avisado-${id}`} icono="hourglass-outline" color={SEG.muted}>
          Nos avisaste del pago el {fechaCorta(avisadoEn)}: lo confirmamos en cuanto nos llegue
        </LineaIcono>
      ) : null}
      {tarjeta ? (
        <Pressable
          nativeID={`seguimiento-pagar-tarjeta-${id}`}
          onPress={pagarConTarjeta}
          disabled={ocupado}
          accessibilityRole="button"
          style={({ pressed }) => ({ borderRadius: 999, minHeight: 44, paddingHorizontal: 22, justifyContent: "center", backgroundColor: SEG.accentDark, opacity: pressed || ocupado ? 0.85 : 1 })}
        >
          <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>{ocupado ? "Abriendo el pago…" : bizum ? "Pagar con tarjeta o Bizum" : "Pagar con tarjeta"}</Text>
        </Pressable>
      ) : null}
      {manual && !avisadoEn ? (
        <>
          <Pressable
            nativeID={`seguimiento-pago-manual-boton-${id}`}
            onPress={() => setAbierto((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: abierto }}
            hitSlop={6}
            style={({ pressed }) => ({ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6, opacity: pressed ? 0.7 : 1 })}
          >
            <Ionicons name="phone-portrait-outline" size={17} color={SEG.accentDark} />
            <Text style={{ color: SEG.accentTexto, fontWeight: "800", fontSize: TAMANOS.minimo }}>
              {manual.bizum && manual.iban ? "Pagar por Bizum o transferencia" : manual.bizum ? "Pagar por Bizum" : "Pagar por transferencia"}
            </Text>
            <Ionicons name={abierto ? "chevron-up" : "chevron-down"} size={16} color={SEG.accentDark} />
          </Pressable>
          {abierto ? (
            <View nativeID={`seguimiento-pago-manual-${id}`} style={{ alignItems: "center", gap: 4, alignSelf: "stretch" }}>
              {manual.bizum ? (
                <Text selectable style={{ color: SEG.text, fontSize: TAMANOS.minimo, textAlign: "center" }}>
                  <Text style={{ fontWeight: "800" }}>Bizum: </Text>
                  {manual.bizum}
                </Text>
              ) : null}
              {manual.iban ? (
                <Text selectable style={{ color: SEG.text, fontSize: TAMANOS.minimo, textAlign: "center" }}>
                  <Text style={{ fontWeight: "800" }}>IBAN: </Text>
                  {manual.iban}
                </Text>
              ) : null}
              {manual.titular ? (
                <Text selectable style={{ color: SEG.text, fontSize: TAMANOS.minimo, textAlign: "center" }}>
                  <Text style={{ fontWeight: "800" }}>Titular: </Text>
                  {manual.titular}
                </Text>
              ) : null}
              <Text selectable nativeID={`seguimiento-pago-concepto-${id}`} style={{ color: SEG.text, fontSize: TAMANOS.minimo, textAlign: "center" }}>
                <Text style={{ fontWeight: "800" }}>Concepto: </Text>
                {r.codigo_seguimiento ?? "tu número de seguimiento"}
              </Text>
              <BotonTexto id={`seguimiento-ya-pagado-${id}`} icono="checkmark-done-outline" texto={ocupado ? "Guardando…" : "Ya lo he pagado"} onPress={yaPagado} disabled={ocupado} />
            </View>
          ) : null}
        </>
      ) : null}
      {!tarjeta && !manual && !avisadoEn ? (
        <LineaIcono id={`seguimiento-pago-sin-forma-${id}`} icono="chatbubble-ellipses-outline" color={SEG.muted}>
          Para pagarlo, pregúntanos aquí debajo y te lo explicamos
        </LineaIcono>
      ) : null}
      {aviso ? (
        <Text accessibilityRole="alert" style={{ color: SEG.muted, fontSize: TAMANOS.minimo, textAlign: "center", maxWidth: 360 }}>
          {aviso}
        </Text>
      ) : null}
    </View>
  );
}

function CobrosDeLaReparacion({
  r,
  ajustes,
  tarjeta,
  bizum = false,
  garantia,
  onCambio,
  onGarantiaPedida,
}: {
  r: ReparacionSeg;
  ajustes: AjustesReparacionEnvio | null;
  tarjeta: boolean;
  bizum?: boolean;
  garantia: GarantiaSeg | null;
  onCambio: (id: string, patch: Partial<ReparacionSeg>) => void;
  onGarantiaPedida: () => void;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pidiendoGarantia, setPidiendoGarantia] = useState(false);
  const porEnvio = r.entrega_modo === "correos";
  const sinArreglo = r.diagnostico_resultado === "sin_arreglo";
  const cancelada = r.seguimiento === "cancelado";
  const terminada = r.seguimiento === "enviada" || r.seguimiento === "entregado" || cancelada;
  const pagado = r.pago_estado === "pagado";
  const etiqueta = Number(r.etiqueta_eur ?? 0);
  const presupuesto = Number(r.presupuesto_eur ?? 0);
  const vuelta = Number(r.vuelta_eur ?? 0);
  const cambiar = (patch: Partial<ReparacionSeg>) => onCambio(r.id, patch);

  async function elegir(eleccion: "comprar" | "devolver") {
    if (ocupado) return;
    setOcupado(true);
    setAviso(null);
    try {
      const { data, error } = await supabase.from("service_requests").update({ sin_arreglo_eleccion: eleccion }).eq("id", r.id).select("sin_arreglo_eleccion");
      if (error || !(data as { sin_arreglo_eleccion?: string }[] | null)?.[0]?.sin_arreglo_eleccion) throw error ?? new Error("sin respuesta");
      void medirEvento("reparacion_envio", eleccion === "comprar" ? "Reparación por envío: sin arreglo · te lo compramos" : "Reparación por envío: sin arreglo · devuélvemelo");
      cambiar({ sin_arreglo_eleccion: eleccion });
      if (eleccion === "comprar") abrirVender();
    } catch {
      setAviso("No hemos podido guardar tu elección. Inténtalo de nuevo o pregúntanos.");
    } finally {
      setOcupado(false);
    }
  }

  function abrirVender() {
    const oferta = r.oferta_compra_eur != null ? ` Nos ofrecisteis ${segEuros(Number(r.oferta_compra_eur))}.` : "";
    const nota = `Sin arreglo tras el diagnóstico (${r.codigo_seguimiento ?? "reparación"}).${oferta}`;
    router.push(`/vender?articulo=${encodeURIComponent(modeloDelServicio(r.service_title))}&nota=${encodeURIComponent(nota)}`);
  }

  async function pedirGarantia() {
    if (ocupado) return;
    setOcupado(true);
    setAviso(null);
    try {
      const d = r.datos;
      const { error } = await supabase.from("service_requests").insert({
        service_id: d?.service_id ?? null,
        service_title: r.service_title,
        nombre: d?.nombre || "Cliente",
        apellido: d?.apellido || "Cliente",
        ciudad: d?.ciudad || "—",
        metodo_contacto: d?.metodo_contacto ?? null,
        contacto: d?.contacto ?? null,
        entrega_modo: porEnvio ? "correos" : "recogida",
        ...(porEnvio ? { aparatos: r.aparatos ?? 1, codigo_postal: d?.codigo_postal ?? null, condiciones_aceptadas_en: new Date().toISOString() } : null),
        comentario: "Ha vuelto a fallar (garantía)",
        garantia_de: r.id,
      });
      if (error) {
        const m = String((error as { message?: string }).message ?? "");
        setAviso(/garantía|cuenta|entregada/i.test(m) ? m : "No hemos podido pedir la garantía. Inténtalo de nuevo o pregúntanos.");
        return;
      }
      void medirEvento("reparacion_envio", "Reparación por envío: garantía pedida");
      setPidiendoGarantia(false);
      onGarantiaPedida();
    } catch {
      setAviso("No hemos podido pedir la garantía: revisa tu conexión.");
    } finally {
      setOcupado(false);
    }
  }

  const bloques: React.ReactNode[] = [];
  if (r.garantia_de) {
    bloques.push(
      <LineaIcono key="g" id={`seguimiento-es-garantia-${r.id}`} icono="shield-checkmark-outline" color={SEG.ok}>
        Garantía de tu reparación · sin coste
      </LineaIcono>
    );
  }
  // 1) La etiqueta (por Correos, mientras no esté pagada y cueste algo).
  if (porEnvio && !terminada && !r.etiqueta_pagada_en && etiqueta > 0) {
    bloques.push(
      <PagoDeLaSolicitud key="e" r={r} concepto="etiqueta" importe={etiqueta} titulo="Pagar la etiqueta" ajustes={ajustes} tarjeta={tarjeta} bizum={bizum} avisadoEn={r.etiqueta_avisada_en} onAvisado={cambiar} />
    );
  }
  // 2) Sin arreglo: qué hacemos con el aparato.
  if (sinArreglo && !cancelada) {
    bloques.push(
      <View key="s" nativeID={`seguimiento-sin-arreglo-${r.id}`} style={{ alignItems: "center", gap: 6, alignSelf: "stretch" }}>
        <LineaIcono icono="alert-circle-outline" color="#92660B">
          Tras el diagnóstico, no tiene arreglo
        </LineaIcono>
        {r.oferta_compra_eur != null ? (
          <LineaIcono id={`seguimiento-oferta-${r.id}`} icono="pricetag-outline">
            Te lo compramos por {segEuros(Number(r.oferta_compra_eur))}
          </LineaIcono>
        ) : null}
        {!r.sin_arreglo_eleccion ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", columnGap: 16 }}>
            <BotonTexto id={`seguimiento-te-lo-compramos-${r.id}`} icono="cash-outline" texto="Te lo compramos" onPress={() => elegir("comprar")} disabled={ocupado} />
            <BotonTexto id={`seguimiento-devuelvemelo-${r.id}`} icono="return-down-back-outline" texto="Devuélvemelo" onPress={() => elegir("devolver")} disabled={ocupado} />
          </View>
        ) : r.sin_arreglo_eleccion === "comprar" ? (
          <>
            <LineaIcono id={`seguimiento-eleccion-${r.id}`} icono="checkmark-circle" color={SEG.ok}>
              Has elegido «Te lo compramos»
            </LineaIcono>
            <BotonTexto id={`seguimiento-abrir-vender-${r.id}`} icono="open-outline" texto="Abrir Vender ahora" onPress={abrirVender} />
          </>
        ) : (
          <LineaIcono id={`seguimiento-eleccion-${r.id}`} icono="checkmark-circle" color={SEG.ok}>
            {porEnvio ? `Has elegido «Devuélvemelo»: solo pagas la vuelta${vuelta > 0 ? ` (${segEuros(vuelta)})` : ""}` : "Has elegido «Devuélvemelo»: te escribimos para dártelo"}
          </LineaIcono>
        )}
      </View>
    );
    if (r.sin_arreglo_eleccion === "devolver" && porEnvio && vuelta > 0 && !pagado && !terminada) {
      bloques.push(
        <PagoDeLaSolicitud key="v" r={r} concepto="reparacion" importe={vuelta} titulo="Pagar la vuelta" ajustes={ajustes} tarjeta={tarjeta} bizum={bizum} avisadoEn={r.pago_avisado_en} onAvisado={cambiar} />
      );
    }
  }
  // 3) Reparación lista con el presupuesto aceptado: «Pagar y enviármelo» (la vuelta va incluida).
  if (porEnvio && !sinArreglo && r.seguimiento === "listo" && r.presupuesto_aceptado_en && presupuesto > 0 && !pagado) {
    bloques.push(
      <PagoDeLaSolicitud key="r" r={r} concepto="reparacion" importe={presupuesto} titulo="Pagar y enviármelo" ajustes={ajustes} tarjeta={tarjeta} bizum={bizum} avisadoEn={r.pago_avisado_en} onAvisado={cambiar} />
    );
  }
  if (pagado) {
    bloques.push(
      <LineaIcono key="p" id={`seguimiento-pagado-${r.id}`} icono="card" color={SEG.ok}>
        Pagado{r.pagado_eur != null ? ` · ${segEuros(Number(r.pagado_eur))}` : ""}
        {r.pago_modo && FORMA_PAGO[r.pago_modo] ? ` ${FORMA_PAGO[r.pago_modo]}` : ""}
        {r.pagado_en ? ` · ${fechaCorta(r.pagado_en)}` : ""}
      </LineaIcono>
    );
    if (r.seguimiento === "listo") {
      bloques.push(
        <LineaIcono key="pe" id={`seguimiento-pendiente-envio-${r.id}`} icono="cube-outline" color={SEG.muted}>
          Te lo enviamos en cuanto salga: te avisamos con el número de Correos
        </LineaIcono>
      );
    }
  }
  if (r.vuelta_seguimiento && (r.seguimiento === "enviada" || r.seguimiento === "entregado")) {
    bloques.push(
      <LineaIcono key="vs" id={`seguimiento-vuelta-${r.id}`} icono="paper-plane-outline">
        Enviada por Correos · nº {r.vuelta_seguimiento}
      </LineaIcono>
    );
    // Mejora 5: el mismo «Seguir el envío» que los pedidos (localizador de Correos).
    if (r.seguimiento === "enviada") bloques.push(<BotonSeguirEnvio key="se" id={`seguir-envio-rep-${r.id}`} numero={r.vuelta_seguimiento} tipo="reparacion" />);
  }
  // 4) Garantía (entregada).
  if (garantia?.hasta) {
    bloques.push(
      <View key="ga" nativeID={`seguimiento-garantia-${r.id}`} style={{ alignItems: "center", gap: 4, alignSelf: "stretch" }}>
        <LineaIcono id={`seguimiento-garantia-hasta-${r.id}`} icono="shield-checkmark-outline" color={garantia.puede || garantia.abierta ? SEG.text : SEG.muted}>
          {garantia.puede || garantia.abierta ? `Garantía hasta el ${fechaCorta(garantia.hasta.toISOString())}` : `Garantía terminada el ${fechaCorta(garantia.hasta.toISOString())}`}
        </LineaIcono>
        {garantia.abierta ? (
          <LineaIcono id={`seguimiento-garantia-abierta-${r.id}`} icono="time-outline" color={SEG.muted}>
            Ya estamos con tu garantía: la ves arriba en Mis seguimientos
          </LineaIcono>
        ) : garantia.puede ? (
          pidiendoGarantia ? (
            <View style={{ alignItems: "center", gap: 2 }}>
              <Text nativeID={`seguimiento-garantia-confirmar-${r.id}`} style={{ color: SEG.text, fontSize: TAMANOS.minimo, lineHeight: 19, textAlign: "center", maxWidth: 360 }}>
                {porEnvio ? "Lo volvemos a revisar gratis, también la etiqueta de Correos." : "Lo volvemos a revisar gratis."}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", columnGap: 16 }}>
                <BotonTexto id={`seguimiento-garantia-si-${r.id}`} icono="checkmark-outline" texto={ocupado ? "Pidiendo…" : "Sí, pedir la garantía"} onPress={pedirGarantia} disabled={ocupado} />
                <BotonTexto id={`seguimiento-garantia-no-${r.id}`} icono="close-outline" texto="Ahora no" onPress={() => setPidiendoGarantia(false)} />
              </View>
            </View>
          ) : (
            <BotonTexto id={`seguimiento-ha-vuelto-a-fallar-${r.id}`} icono="refresh-outline" texto="Ha vuelto a fallar" onPress={() => setPidiendoGarantia(true)} />
          )
        ) : null}
      </View>
    );
  }
  if (!bloques.length && !aviso) return null;
  return (
    <View nativeID={`seguimiento-cobros-${r.id}`} style={{ width: "100%", maxWidth: 460, gap: 10, alignItems: "center" }}>
      {bloques}
      {aviso ? (
        <Text accessibilityRole="alert" style={{ color: SEG.muted, fontSize: TAMANOS.minimo, textAlign: "center", maxWidth: 360 }}>
          {aviso}
        </Text>
      ) : null}
    </View>
  );
}

function segFecha(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

// Precio siempre con dos decimales, coma decimal y miles con punto (155,00€ · 1.299,00€).
function segEuros(n: number | null) {
  if (n == null || !Number.isFinite(Number(n))) return "";
  const cents = Math.round(Number(n) * 100);
  const [ent, dec] = (Math.abs(cents) / 100).toFixed(2).split(".");
  return `${cents < 0 ? "-" : ""}${ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}€`;
}

// Tabla/columna inexistente (migración aún sin aplicar)
function faltaEsquema(error: any) {
  const code = String(error?.code ?? "");
  return ["42P01", "42703", "PGRST205", "PGRST204"].includes(code);
}

// Línea de progreso: puntos unidos, etapa actual en azul; cancelado en rojo.
// `antes`: qué se dice cuando aún no se ha llegado a la primera etapa (actual = -1; p. ej. «Solicitada» antes de la etiqueta).
function LineaProgreso({ etiquetas, actual, cancelado, antes }: { etiquetas: string[]; actual: number; cancelado: boolean; antes?: string }) {
  if (cancelado) {
    return (
      <View style={{ width: "100%", maxWidth: 460, alignItems: "center", gap: 6, paddingVertical: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", width: "100%", paddingHorizontal: 18 }}>
          {etiquetas.map((_, i) => (
            <React.Fragment key={i}>
              {i > 0 ? <View style={{ flex: 1, height: 2, backgroundColor: "rgba(220,38,38,0.25)" }} /> : null}
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "rgba(220,38,38,0.4)" }} />
            </React.Fragment>
          ))}
        </View>
        <Text style={{ color: SEG.danger, fontWeight: "900", fontSize: TAMANOS.minimo }}>Cancelado</Text>
      </View>
    );
  }

  // Más de siete etapas (reparación por envío: nueve): ni alternadas caben a 360 px sin juntarse. Se enseñan los puntos y,
  // debajo, la etapa actual destacada con «Paso N de M» y la siguiente (dueño, 2026-11-11).
  if (etiquetas.length > 7) {
    const n = etiquetas.length;
    const siguiente = actual + 1 < n ? etiquetas[actual + 1] : null;
    return (
      <View nativeID={`linea-compacta-${n}`} style={{ width: "100%", maxWidth: 460, gap: 8, paddingVertical: 4, alignItems: "center" }}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 18, alignSelf: "stretch" }}>
          {etiquetas.map((_, i) => (
            <React.Fragment key={i}>
              {i > 0 ? <View style={{ flex: 1, height: 2, backgroundColor: i <= actual ? SEG.accent : SEG.line }} /> : null}
              <View
                style={{
                  width: i === actual ? 16 : 10,
                  height: i === actual ? 16 : 10,
                  borderRadius: 8,
                  backgroundColor: i <= actual ? SEG.accent : SEG.line,
                  borderWidth: i === actual ? 3 : 0,
                  borderColor: "rgba(30,167,232,0.25)",
                }}
              />
            </React.Fragment>
          ))}
        </View>
        <Text nativeID="linea-actual" style={{ color: SEG.accentTexto, fontWeight: "900", fontSize: TAMANOS.cuerpo, textAlign: "center" }}>
          {actual >= 0 ? etiquetas[actual] : antes ?? "Solicitada"}
        </Text>
        <Text nativeID="linea-paso" style={{ color: SEG.muted, fontWeight: "800", fontSize: TAMANOS.minimo, textAlign: "center" }}>
          {actual >= 0 ? `Paso ${actual + 1} de ${n}` : `${n} pasos`}
          {siguiente ? ` · Después: ${siguiente}` : ""}
        </Text>
      </View>
    );
  }

  // Con 12 px, cinco etiquetas en su columna ya no caben a 360 px («Confirmado», «Preparando»): de cinco etapas en
  // adelante (pedidos y reparaciones) se alternan arriba y abajo, cada una con el ancho de dos columnas.
  const alternar = etiquetas.length > 4;
  return (
    <View style={{ width: "100%", maxWidth: 460, gap: 8, paddingVertical: 4 }}>
      {alternar ? filaEtiquetas(0) : null}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 18 }}>
        {etiquetas.map((_, i) => {
          const esActual = i === actual;
          return (
            <React.Fragment key={i}>
              {i > 0 ? <View style={{ flex: 1, height: 2, backgroundColor: i <= actual ? SEG.accent : SEG.line }} /> : null}
              <View
                style={{
                  width: esActual ? 16 : 10,
                  height: esActual ? 16 : 10,
                  borderRadius: 8,
                  backgroundColor: i <= actual ? SEG.accent : SEG.line,
                  borderWidth: esActual ? 3 : 0,
                  borderColor: "rgba(30,167,232,0.25)",
                }}
              />
            </React.Fragment>
          );
        })}
      </View>
      {alternar ? filaEtiquetas(1) : filaEtiquetas(null)}
    </View>
  );

  // Etiquetas bajo (o sobre) los puntos, cada una centrada en su punto. Con cinco o seis etapas (pedidos y reparaciones) se alternan:
  // las pares encima de la barra y las impares debajo, y cada una tiene el ancho de DOS columnas, así «Diagnóstico» o
  // «Lista para recoger» no se parten a media palabra ni se montan sobre la de al lado (dueño, 2026-11-10).
  function filaEtiquetas(paridad: 0 | 1 | null) {
    // 12 px (TAMANOS.legal, tamaño de etiqueta; antes 10,5): la actual en el azul de texto, las pasadas en negro y las
    // que faltan en el gris de texto.
    const estilo = (i: number) => ({
      textAlign: "center" as const,
      fontSize: TAMANOS.legal,
      lineHeight: 15,
      color: i === actual ? SEG.accentTexto : i < actual ? SEG.text : SEG.muted,
      fontWeight: (i === actual ? "900" : "700") as "900" | "700",
    });
    if (paridad === null) {
      return (
        <View nativeID={`linea-etiquetas-${etiquetas.length}`} style={{ flexDirection: "row" }}>
          {etiquetas.map((t, i) => (
            <View key={i} style={{ flex: 1, minWidth: 0, paddingHorizontal: 1 }}>
              <Text nativeID={`linea-etiqueta-${etiquetas.length}-${i}`} numberOfLines={2} style={estilo(i)}>
                {t}
              </Text>
            </View>
          ))}
        </View>
      );
    }
    // Alternadas: cada etiqueta, centrada justo encima o debajo de su punto (los puntos van a 23 px de cada borde:
    // 18 de margen + la mitad del punto) y con el ancho de dos columnas.
    const ultima = etiquetas.length - 1;
    return (
      <View style={{ paddingHorizontal: 23 }}>
        <View nativeID={`linea-etiquetas-${etiquetas.length}-${paridad === 0 ? "arriba" : "abajo"}`} style={{ height: 30, position: "relative" }}>
          {etiquetas.map((t, i) =>
            i % 2 === paridad ? (
              <Text
                key={i}
                nativeID={`linea-etiqueta-${etiquetas.length}-${i}`}
                numberOfLines={2}
                style={{
                  ...estilo(i),
                  position: "absolute",
                  left: `${(i / ultima) * 100}%`,
                  width: 104,
                  marginLeft: -52,
                  // Las de arriba, pegadas a la barra por abajo; las de abajo, por arriba.
                  ...(paridad === 0 ? { bottom: 0 } : { top: 0 }),
                }}
              >
                {t}
              </Text>
            ) : null
          )}
        </View>
      </View>
    );
  }
}

// --- Seguimiento del pedido paso a paso (mejora 5, 2026-11-14) ------------------------------------------------------
// Debajo de la barra, los pasos que ya se han dado con su fecha y hora reales (lib/envio.ts → pasosDelPedido: «Pedido
// recibido», «Pagado», «Confirmado»… según pedido_estados, migración 20261114160000). Un paso sin hora conocida (anterior a
// la migración o que se saltó) sale sin fecha, nunca inventada; el siguiente, en gris «Siguiente: …».
function PasosDelPedido({ p, historial }: { p: PedidoSeg; historial: HistorialPedidos | null }) {
  const pasos = pasosDelPedido(p, historial?.[p.id]);
  const hechos = pasos.filter((x) => x.hecho);
  const siguiente = pasos.find((x) => !x.hecho);
  const ref = p.numero ?? p.id;
  return (
    <View nativeID={`pasos-pedido-${ref}`} style={{ width: "100%", maxWidth: 460, gap: 0, paddingHorizontal: 8 }}>
      {hechos.map((x, i) => {
        const color = x.tipo === "cancelado" ? SEG.danger : x.actual ? SEG.accentTexto : SEG.text;
        const fecha = fechaHoraPaso(x.fecha);
        return (
          <View key={x.clave} nativeID={`paso-${ref}-${x.clave}`} style={{ flexDirection: "row", alignItems: "stretch", gap: 10 }}>
            {/* El punto y la línea que une los pasos. */}
            <View style={{ width: 14, alignItems: "center" }}>
              <View style={{ width: 2, flex: 1, backgroundColor: i === 0 ? "transparent" : SEG.accent, opacity: 0.5 }} />
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: x.tipo === "cancelado" ? SEG.danger : SEG.accent }} />
              <View style={{ width: 2, flex: 1, backgroundColor: i === hechos.length - 1 ? "transparent" : SEG.accent, opacity: 0.5 }} />
            </View>
            <View style={{ flex: 1, minWidth: 0, flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8, paddingVertical: 4 }}>
              <Text style={{ color, fontWeight: x.actual ? "900" : "800", fontSize: TAMANOS.minimo }}>{x.etiqueta}</Text>
              {fecha ? (
                <Text nativeID={`paso-${ref}-${x.clave}-fecha`} style={{ color: SEG.muted, fontWeight: "700", fontSize: TAMANOS.minimo }}>
                  {fecha}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
      {siguiente && p.estado !== "cancelado" ? (
        <Text nativeID={`paso-${ref}-siguiente`} style={{ color: SEG.muted, fontWeight: "700", fontSize: TAMANOS.minimo, paddingLeft: 24, paddingTop: 2 }}>
          Siguiente: {siguiente.etiqueta}
        </Text>
      ) : null}
    </View>
  );
}

// «Seguir el envío» (44 px): abre el localizador de Correos con el número o el enlace del transportista. Sin número válido, nada.
function BotonSeguirEnvio({ id, numero, tipo }: { id: string; numero: string | null | undefined; tipo: "pedido" | "reparacion" }) {
  const enlace = enlaceSeguimientoEnvio(numero);
  if (!enlace) return null;
  return (
    <Pressable
      nativeID={id}
      onPress={() => {
        void medirEvento("seguir_envio", "Mis seguimientos: seguir el envío", { metadata: { tipo } });
        abrirEnlaceExterno(enlace);
      }}
      accessibilityRole="link"
      accessibilityLabel="Seguir el envío"
      style={({ pressed }) => ({
        minHeight: TACTIL.minimo,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        paddingHorizontal: 18,
        borderRadius: 999,
        borderWidth: 1.5,
        borderColor: SEG.accent,
        backgroundColor: "#FFFFFF",
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Ionicons name="navigate-outline" size={16} color={SEG.accent} />
      <Text style={{ color: SEG.accentTexto, fontWeight: "900", fontSize: TAMANOS.minimo }}>Seguir el envío</Text>
    </Pressable>
  );
}

// «Valorar compra» (44 px, mejora 11): en los pedidos entregados hace 3 días o más y sin valorar. Se mide una vez por
// pedido y visita como valoracion_pedida (origen mis_pedidos), sin datos personales.
const valoracionPedidaVista = new Set<string>();
function BotonValorarCompra({ id, pedidoId, onPress }: { id: string; pedidoId: string; onPress: () => void }) {
  useEffect(() => {
    if (valoracionPedidaVista.has(pedidoId)) return;
    valoracionPedidaVista.add(pedidoId);
    void medirEvento("valoracion_pedida", "Valoración del pedido: pedida", { metadata: { origen: "mis_pedidos" } });
  }, [pedidoId]);
  return (
    <Pressable
      nativeID={id}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Valorar compra"
      style={({ pressed }) => ({
        minHeight: TACTIL.minimo,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        paddingHorizontal: 18,
        borderRadius: 999,
        backgroundColor: SEG.accent,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Ionicons name="star-outline" size={16} color="#FFFFFF" />
      <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: TAMANOS.minimo }}>Valorar compra</Text>
    </Pressable>
  );
}

function PreguntarBoton({ onPress }: { onPress: () => void }) {
  return (
    // 44 px de alto (TACTIL.minimo; antes 23) para el dedo.
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      hitSlop={6}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, minHeight: TACTIL.minimo, justifyContent: "center", paddingHorizontal: 4 })}
    >
      <Text style={{ color: SEG.accentTexto, fontWeight: "900", fontSize: TAMANOS.minimo }}>Preguntar por esto</Text>
    </Pressable>
  );
}

function SegVacio({
  cual,
  texto,
  boton,
  destino,
}: {
  cual: "tienda" | "taller";
  texto: string;
  boton: string;
  destino: "/catalogo" | "/servicios";
}) {
  return (
    <View style={{ alignItems: "center", gap: 10, paddingVertical: 6 }}>
      <MarcaAnimada cual={cual} ancho={110} />
      <Text style={{ color: SEG.muted, textAlign: "center", lineHeight: 20, maxWidth: 360 }}>{texto}</Text>
      <Pressable
        onPress={() => router.push(destino)}
        style={({ pressed }) => ({
          borderRadius: 999,
          minHeight: TACTIL.minimo,
          justifyContent: "center",
          paddingVertical: 12,
          paddingHorizontal: 22,
          backgroundColor: SEG.accentDark,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>{boton}</Text>
      </Pressable>
    </View>
  );
}

function SegTitulo({ children }: { children: React.ReactNode }) {
  return <Text style={{ color: SEG.text, fontWeight: "900", fontSize: TAMANOS.titulo3, textAlign: "center" }}>{children}</Text>;
}

function SegSeparador() {
  return <View style={{ height: 1, backgroundColor: SEG.line, width: "100%", maxWidth: 460 }} />;
}

// --- «Mis reservas» (Reservar con señal, mejora 14, 2026-11-15) -------------------------------------------------------
// Las reservas del cliente (RLS: solo las suyas) con su estado y vencimiento. Sin reservas (o sin la migración
// 20261115150000_reservas_senal aplicada), no sale nada. A la vuelta de Stripe (?reserva=ok&sesion=…), «pagada» solo lo
// dice el servidor (api/pago.ts, «confirmar»), y se mide reserva_pagada sin datos personales.
type FilaMiReserva = {
  id: string;
  producto_titulo: string | null;
  dias: number;
  porcentaje: number | string;
  senal_eur: number | string;
  vence_en: string;
  estado: string;
  creado_en: string;
  precio_eur?: number | string | null;
  condiciones_texto?: string | null;
  al_vencer_texto?: string | null;
};

// Los datos de la reserva para rellenar las marcas de su copia (las nuevas ya vienen rellenadas del servidor).
function datosDeMiReserva(f: FilaMiReserva) {
  const pct = Number(f.porcentaje);
  const senal = Number(f.senal_eur);
  const precio = Number(f.precio_eur);
  return { porcentaje: pct, dias: f.dias, vence: f.vence_en, senal_eur: senal, precio_eur: Number.isFinite(precio) && precio > 0 ? precio : pct > 0 ? Math.round((senal * 10000) / pct) / 100 : senal };
}

const ESTADO_RESERVA: Record<string, string> = {
  pendiente_pago: "Pendiente de pago",
  activa: "Reservado",
  completada: "Compra completada",
  vencida: "Vencida",
  cancelada: "Cancelada",
};

function MisReservasSenal() {
  const [filas, setFilas] = useState<FilaMiReserva[] | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const { data: s } = await supabase.auth.getSession();
      const uid = s.session?.user?.id;
      if (!uid) return setFilas(null);
      const { data, error } = await supabase
        .from("reservas")
        .select("id,producto_titulo,dias,porcentaje,senal_eur,precio_eur,vence_en,estado,creado_en,condiciones_texto,al_vencer_texto")
        .eq("user_id", uid)
        .order("creado_en", { ascending: false })
        .limit(20);
      // Sin la tabla (migración sin aplicar) o sin permiso: no se enseña nada.
      setFilas(error ? null : ((data ?? []) as FilaMiReserva[]).filter((f) => f.estado !== "pendiente_pago" || Date.parse(f.creado_en) > Date.now() - 32 * 60_000));
    } catch {
      setFilas(null);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Vuelta de Stripe tras pagar la señal.
  useEffect(() => {
    if (typeof window === "undefined" || !window.location?.search) return;
    const q = new URLSearchParams(window.location.search);
    if (q.get("reserva") !== "ok") return;
    const sesion = q.get("sesion") ?? "";
    let vivo = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const resp = await fetch("/api/pago", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
          body: JSON.stringify({ accion: "confirmar", sesion }),
        });
        const d = (await resp.json().catch(() => null)) as { pagado?: boolean; reserva?: string } | null;
        if (!vivo) return;
        if (resp.ok && d?.pagado && d.reserva) {
          void medirEvento("reserva_pagada", "Reserva con señal: señal pagada");
          setAviso({ ok: true, texto: "Señal recibida ✓ Tu reserva está activa: la ves aquí con su vencimiento." });
          cargar();
        } else setAviso({ ok: false, texto: "Aún no nos consta el pago de la señal. Si te lo han cobrado, en unos minutos aparecerá aquí." });
      } catch {
        if (vivo) setAviso({ ok: false, texto: "No hemos podido comprobar el pago: revisa tu conexión." });
      } finally {
        try {
          q.delete("reserva");
          q.delete("sesion");
          window.history.replaceState(null, "", `${window.location.pathname}${q.toString() ? `?${q.toString()}` : ""}`);
        } catch {
          // sin historial
        }
      }
    })();
    return () => {
      vivo = false;
    };
  }, [cargar]);

  if (!aviso && (!filas || filas.length === 0)) return null;
  return (
    <View nativeID="mis-reservas" style={{ gap: 14, alignItems: "center", width: "100%" }}>
      {aviso ? (
        <LineaIcono id="mis-reservas-aviso" icono={aviso.ok ? "checkmark-circle" : "information-circle-outline"} color={aviso.ok ? SEG.ok : SEG.muted}>
          {aviso.texto}
        </LineaIcono>
      ) : null}
      {filas && filas.length ? (
        <>
          <SegTitulo>Mis reservas ({filas.length})</SegTitulo>
          {filas.map((f, i) => {
            const vencida = f.estado === "activa" && Date.parse(f.vence_en) <= Date.now();
            const estado = vencida ? "Vencida" : ESTADO_RESERVA[f.estado] ?? f.estado;
            return (
              <View key={f.id} nativeID={`mi-reserva-${f.id}`} style={{ gap: 6, alignItems: "center", width: "100%", maxWidth: 460 }}>
                {i > 0 ? <SegSeparador /> : null}
                <Text style={{ color: SEG.text, fontWeight: "900", fontSize: TAMANOS.cuerpo, textAlign: "center" }}>{f.producto_titulo ?? "Artículo reservado"}</Text>
                <Text nativeID={`mi-reserva-estado-${f.id}`} style={{ color: f.estado === "activa" && !vencida ? SEG.ok : SEG.muted, fontWeight: "800", fontSize: TAMANOS.cuerpo, textAlign: "center" }}>
                  {estado}
                </Text>
                <Text style={{ color: SEG.muted, fontSize: TAMANOS.minimo, lineHeight: 18, textAlign: "center" }}>
                  Señal {eurosReserva(Number(f.senal_eur))} ({Number(f.porcentaje)} %) · {f.dias} {f.dias === 1 ? "día" : "días"}
                  {f.estado === "activa" || f.estado === "pendiente_pago" ? ` · vence el ${fechaReserva(f.vence_en)}` : ""}
                </Text>
                {f.condiciones_texto ? (
                  <Pressable
                    nativeID={`mi-reserva-condiciones-ver-${f.id}`}
                    onPress={() => setAbierta((a) => (a === f.id ? null : f.id))}
                    accessibilityRole="button"
                    style={({ pressed }) => ({ minHeight: TACTIL.minimo, justifyContent: "center", paddingHorizontal: 4, opacity: pressed ? 0.6 : 1 })}
                  >
                    <Text style={{ color: SEG.accentTexto, fontWeight: "900", fontSize: TAMANOS.minimo }}>
                      {abierta === f.id ? "Ocultar las condiciones" : "Ver las condiciones aceptadas"}
                    </Text>
                  </Pressable>
                ) : null}
                {abierta === f.id && f.condiciones_texto ? (
                  <View nativeID={`mi-reserva-condiciones-${f.id}`} style={{ gap: 8, width: "100%" }}>
                    {f.al_vencer_texto ? (
                      <Text style={{ color: SEG.muted, fontSize: TAMANOS.minimo, lineHeight: 18 }}>
                        <Text style={{ fontWeight: "900", color: SEG.text }}>Qué pasa al vencer: </Text>
                        {rellenarCondicionesReserva(f.al_vencer_texto, datosDeMiReserva(f))}
                      </Text>
                    ) : null}
                    <Text style={{ color: SEG.muted, fontSize: TAMANOS.minimo, lineHeight: 18 }}>{rellenarCondicionesReserva(f.condiciones_texto, datosDeMiReserva(f))}</Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </>
      ) : null}
    </View>
  );
}

// --- «Me gusta» (dueño, 2026-11-03): los productos y servicios a los que el cliente ha dado «me gusta» -----------------
// Junta los de su cuenta (api/interaccion.ts, «mis_me_gusta»: los da en cualquier dispositivo) con los de este
// dispositivo (también los que dio sin sesión), los más recientes primero. Solo enseña lo que sigue a la venta, con la
// misma tarjeta que el Catálogo.
type FichaGustada = { id: string; titulo: string; precio: number; imagen: string | null };
const UUID_GUSTO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Portada (primera foto, la marcada como portada antes) de cada producto o servicio, por id. Si no se puede leer
// (artículo ya vendido u oculto, sin fotos), ese id no sale y se enseña el icono.
async function portadasDe(tipo: "producto" | "servicio", idsCrudos: string[]): Promise<Record<string, string>> {
  const ids = [...new Set(idsCrudos.filter((id) => UUID_GUSTO.test(id)))];
  const portada: Record<string, string> = {};
  if (!ids.length) return portada;
  try {
    const fotos =
      tipo === "producto"
        ? await supabase.from("product_media").select("product_id,public_url,is_cover,sort_order,kind").in("product_id", ids).order("is_cover", { ascending: false }).order("sort_order", { ascending: true })
        : await supabase.from("service_media").select("service_id,public_url,is_cover,sort_order").in("service_id", ids).order("is_cover", { ascending: false }).order("sort_order", { ascending: true });
    for (const m of (fotos.data ?? []) as { product_id?: string; service_id?: string; public_url: string | null; kind?: string | null }[]) {
      const id = m.product_id ?? m.service_id;
      if (id && m.public_url && !portada[id] && (!m.kind || m.kind === "image")) portada[id] = m.public_url;
    }
  } catch {
    // sin fotos: los iconos
  }
  return portada;
}

async function fichasGustadas(tipo: "producto" | "servicio", ids: string[]): Promise<FichaGustada[]> {
  if (!ids.length) return [];
  const tabla = tipo === "producto" ? "products" : "services";
  const { data, error } = await supabase.from(tabla).select("id,title,price_eur").in("id", ids).eq("status", "PUBLISHED").eq("is_active", true);
  if (error) throw error;
  const filas = (data ?? []) as { id: string; title: string; price_eur: number | null }[];
  const portada: Record<string, string> = {};
  if (filas.length) {
    const fotos =
      tipo === "producto"
        ? await supabase.from("product_media").select("product_id,public_url,is_cover,sort_order,kind").in("product_id", filas.map((f) => f.id)).order("is_cover", { ascending: false }).order("sort_order", { ascending: true })
        : await supabase.from("service_media").select("service_id,public_url,is_cover,sort_order").in("service_id", filas.map((f) => f.id)).order("is_cover", { ascending: false }).order("sort_order", { ascending: true });
    for (const m of (fotos.data ?? []) as { product_id?: string; service_id?: string; public_url: string | null; kind?: string | null }[]) {
      const id = m.product_id ?? m.service_id;
      if (id && m.public_url && !portada[id] && (!m.kind || m.kind === "image")) portada[id] = m.public_url;
    }
  }
  const porId = new Map(filas.map((f) => [f.id, f]));
  return ids
    .map((id) => porId.get(id))
    .filter((f): f is { id: string; title: string; price_eur: number | null } => !!f)
    .map((f) => ({ id: f.id, titulo: f.title, precio: Number(f.price_eur ?? 0), imagen: portada[f.id] ?? null }));
}

// --- «Avisos de precio» (mejora 5, 2026-11-14; migración 20261114160100) --------------------------------------------
// Los artículos que el cliente sigue con «Avísame si baja de precio» (tabla avisos_precio): título, precio al activarlo y
// ahora, y «Quitar» (44 px). Sin la tabla, sin ninguno o si la lectura falla, no sale (un error no es «no tienes avisos»).
type AvisoPrecioFila = { productId: string; titulo: string; precioAntes: number; precioAhora: number | null };
function AvisosPrecioSeccion({ cardPadding }: { cardPadding: number }) {
  const [filas, setFilas] = useState<AvisoPrecioFila[] | null>(null);
  const [quitando, setQuitando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    (async () => {
      const avisos = await misAvisosPrecio();
      if (!vivo || !avisos?.length) return;
      const { data } = await supabase.from("products").select("id,title,price_eur").in("id", avisos.map((a) => a.product_id));
      if (!vivo) return;
      const porId = new Map(((data ?? []) as { id: string; title: string; price_eur: number | string | null }[]).map((p) => [p.id, p]));
      setFilas(
        avisos.map((a) => {
          const p = porId.get(a.product_id);
          return { productId: a.product_id, titulo: p?.title ?? "Artículo ya vendido o retirado", precioAntes: a.precio_inicial, precioAhora: p ? Number(p.price_eur ?? 0) : null };
        })
      );
    })();
    return () => {
      vivo = false;
    };
  }, []);
  const quitar = useCallback(async (id: string) => {
    setQuitando(id);
    setError(null);
    const r = await fijarAvisoPrecio(id, false);
    setQuitando(null);
    if (r === "ok") {
      setFilas((f) => (f ?? []).filter((x) => x.productId !== id));
      void medirEvento("aviso_precio_desactivado", "Aviso de precio: desactivado", { path: "/perfil", metadata: { productId: id, donde: "perfil" } });
    } else setError("No se ha podido quitar el aviso. Inténtalo de nuevo.");
  }, []);
  if (!filas?.length) return null;
  return (
    <SectionCard padding={cardPadding}>
      <View nativeID="perfil-avisos-precio" style={{ gap: 10, alignItems: "center" }}>
        <SegTitulo>Avisos de precio ({filas.length})</SegTitulo>
        <Text style={{ color: SEG.muted, fontSize: TAMANOS.minimo, textAlign: "center", lineHeight: 18, maxWidth: 420 }}>
          Blue te avisa si alguno baja de precio.
        </Text>
        {filas.map((f) => (
          <View key={f.productId} nativeID={`perfil-aviso-precio-${f.productId}`} style={{ flexDirection: "row", alignItems: "center", gap: 10, width: "100%", maxWidth: 460 }}>
            <Pressable
              onPress={() => router.push(`/producto/${f.productId}` as never)}
              accessibilityRole="link"
              style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: TACTIL.minimo, justifyContent: "center", opacity: pressed ? 0.7 : 1 })}
            >
              <Text numberOfLines={2} style={{ color: SEG.text, fontWeight: "800", fontSize: TAMANOS.cuerpo }}>{f.titulo}</Text>
              <Text style={{ color: SEG.muted, fontSize: TAMANOS.minimo, fontWeight: "700" }}>
                {f.precioAhora === null
                  ? `Al activarlo: ${segEuros(f.precioAntes)}`
                  : f.precioAhora < f.precioAntes - 0.004
                    ? `Ha bajado: ${segEuros(f.precioAntes)} → ${segEuros(f.precioAhora)}`
                    : `Ahora: ${segEuros(f.precioAhora)}`}
              </Text>
            </Pressable>
            <Pressable
              nativeID={`perfil-aviso-precio-quitar-${f.productId}`}
              onPress={() => quitar(f.productId)}
              disabled={quitando === f.productId}
              accessibilityRole="button"
              accessibilityLabel={`Quitar el aviso de precio de ${f.titulo}`}
              style={({ pressed }) => ({ minHeight: TACTIL.minimo, minWidth: TACTIL.minimo, paddingHorizontal: 12, justifyContent: "center", alignItems: "center", opacity: pressed || quitando === f.productId ? 0.6 : 1 })}
            >
              <Text style={{ color: SEG.danger, fontWeight: "900", fontSize: TAMANOS.minimo }}>Quitar</Text>
            </Pressable>
          </View>
        ))}
        {error ? <Text style={{ color: SEG.danger, fontSize: TAMANOS.minimo, textAlign: "center" }}>{error}</Text> : null}
      </View>
    </SectionCard>
  );
}

// --- «Tu envío gratis» (dueño, 2026-11-23; migración 20261123160000) --------------------------------------------------
// Los regalos de envío gratis vigentes que la tienda le ha dado a este cliente (de un artículo o de sus próximos N), con
// su caducidad. Sin ninguno, sin la migración o si la lectura falla, no sale.
function EnvioGratisSeccion({ cardPadding }: { cardPadding: number }) {
  const [regalos, setRegalos] = useState<RegaloEnvio[]>([]);
  const [titulos, setTitulos] = useState<Record<string, string>>({});
  useEffect(() => {
    let vivo = true;
    const cargar = async () => {
      const lista = await cargarMisEnviosGratis();
      if (!vivo) return;
      setRegalos(lista);
      const ids = lista.flatMap((r) => (r.modo === "articulo" && r.product_id ? [r.product_id] : []));
      if (!ids.length) return;
      const { data } = await supabase.from("products").select("id,title").in("id", ids);
      if (vivo) setTitulos(Object.fromEntries(((data ?? []) as { id: string; title: string }[]).map((p) => [p.id, p.title])));
    };
    void cargar();
    const quitar = alCambiarRegalosEnvio(() => void cargar());
    return () => {
      vivo = false;
      quitar();
    };
  }, []);
  if (!regalos.length) return null;
  return (
    <SectionCard padding={cardPadding}>
      <View nativeID="perfil-envio-gratis" style={{ gap: 10, alignItems: "center" }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "#DCFCE7", alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="gift-outline" size={22} color="#166534" />
        </View>
        <SegTitulo>Tu envío gratis</SegTitulo>
        <Text style={{ color: SEG.muted, fontSize: TAMANOS.minimo, textAlign: "center", lineHeight: 18, maxWidth: 420 }}>
          Un regalo de la tienda: se aplica solo al pagar, en cualquier envío a domicilio de España.
        </Text>
        {regalos.map((r) => {
          const titulo = r.product_id ? titulos[r.product_id] : null;
          return (
            <View key={r.id} nativeID={`perfil-envio-gratis-${r.id}`} style={{ flexDirection: "row", alignItems: "center", gap: 10, width: "100%", maxWidth: 460 }}>
              <Text style={{ flex: 1, minWidth: 0, color: SEG.text, fontWeight: "800", fontSize: TAMANOS.cuerpo, lineHeight: 21 }}>
                {textoRegaloEnvio(r, titulo)}
              </Text>
              {r.modo === "articulo" && r.product_id ? (
                <Pressable
                  nativeID={`perfil-envio-gratis-ver-${r.id}`}
                  onPress={() => router.push(`/producto/${r.product_id}` as never)}
                  accessibilityRole="link"
                  style={({ pressed }) => ({ minHeight: TACTIL.minimo, paddingHorizontal: 8, justifyContent: "center", opacity: pressed ? 0.7 : 1 })}
                >
                  <Text style={{ color: COLORES_TEXTO.azulTexto, fontWeight: "900", fontSize: TAMANOS.minimo }}>Ver</Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </View>
    </SectionCard>
  );
}

function MeGustaSeccion() {
  const { width } = useWindowDimensions();
  const isMobile = width < 700;
  const [estado, setEstado] = useState<"cargando" | "listo" | "error">("cargando");
  const [productos, setProductos] = useState<FichaGustada[]>([]);
  const [servicios, setServicios] = useState<FichaGustada[]>([]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [localesP, localesS, cuenta] = await Promise.all([
          meGustaLocales(CLAVE_ME_GUSTA_PRODUCTOS),
          meGustaLocales(CLAVE_ME_GUSTA_SERVICIOS),
          misMeGustaServidor(),
        ]);
        // Primero los de la cuenta (ya vienen del más reciente al más antiguo) y luego los de este dispositivo.
        const unir = (cuentaIds: string[], locales: string[]) => [...new Set([...cuentaIds, ...[...locales].reverse()])].filter((id) => UUID_GUSTO.test(id)).slice(0, 100);
        const [p, s] = await Promise.all([
          fichasGustadas("producto", unir(cuenta?.productos ?? [], localesP)),
          fichasGustadas("servicio", unir(cuenta?.servicios ?? [], localesS)),
        ]);
        if (!vivo) return;
        setProductos(p);
        setServicios(s);
        setEstado("listo");
      } catch (e) {
        console.error("Error cargando los «me gusta»:", e);
        if (vivo) setEstado("error");
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  if (estado === "cargando") {
    return (
      <View style={{ alignItems: "center", paddingVertical: 18 }}>
        <ActivityIndicator color={SEG.accent} />
      </View>
    );
  }
  if (estado === "error") {
    return <Text style={{ color: SEG.muted, textAlign: "center", lineHeight: 20 }}>No hemos podido cargar tus «me gusta». Inténtalo de nuevo en un rato.</Text>;
  }
  if (!productos.length && !servicios.length) {
    return (
      <View nativeID="perfil-me-gusta" style={{ gap: 14 }}>
        <SegTitulo>Me gusta</SegTitulo>
        <SegVacio
          cual="tienda"
          texto="Aún no tienes «me gusta». Toca el corazón de un artículo o de un servicio y lo tendrás aquí."
          boton="Ver el catálogo"
          destino="/catalogo"
        />
      </View>
    );
  }

  const bloque = (titulo: string, lista: FichaGustada[], ruta: "/producto" | "/servicio", id: string) =>
    lista.length ? (
      <View nativeID={id} style={{ gap: 12 }}>
        <SegTitulo>{titulo}</SegTitulo>
        <RejillaTarjetas columns={columnasLista(width, isMobile, lista.length)} gap={12}>
          {lista.map((f) => (
            <TarjetaProducto
              key={f.id}
              titulo={f.titulo}
              precioEUR={f.precio}
              imagenUrl={f.imagen}
              isMobile={isMobile}
              compact={isMobile && lista.length > 1}
              onPress={() => router.push(`${ruta}/${f.id}` as never)}
            />
          ))}
        </RejillaTarjetas>
      </View>
    ) : null;

  return (
    <View nativeID="perfil-me-gusta" style={{ gap: 18 }}>
      {bloque("Productos", productos, "/producto", "perfil-me-gusta-productos")}
      {productos.length && servicios.length ? <SegSeparador /> : null}
      {bloque("Servicios", servicios, "/servicio", "perfil-me-gusta-servicios")}
    </View>
  );
}

function SeguimientosSeccion({ filtroInicial }: { filtroInicial?: FiltroPedidos }) {
  const [cargando, setCargando] = useState(true);
  const [conSesion, setConSesion] = useState(false);
  const [pedidos, setPedidos] = useState<PedidoSeg[] | null>(null); // null = tabla aún no disponible
  // Hora de cada paso de los pedidos (pedido_estados; null sin la migración: los pasos salen sin hora).
  const [historial, setHistorial] = useState<HistorialPedidos | null>(null);
  // ¿Existen ya las facturas de VeoAura? (migración 20261110100000). Sin ellas no se enseña nada de facturas.
  const [facturasOk, setFacturasOk] = useState(false);
  const [reparaciones, setReparaciones] = useState<ReparacionSeg[]>([]);
  // ¿Existen ya los números de seguimiento? (migración 20261031170000). Sin ellos no se ofrece añadir uno.
  const [numerosOk, setNumerosOk] = useState(false);
  // Reseñas de los servicios entregados (migración 20261103210000): estrellas que ya les dio, por solicitud. null: aún
  // no se pueden valorar (sin la migración no sale el botón).
  const [valoradas, setValoradas] = useState<Record<string, number> | null>(null);
  const [valorando, setValorando] = useState<{ solicitudId: string; titulo: string } | null>(null);
  // Valoración tras la entrega (mejora 11): las de sus pedidos entregados (null sin la migración) y la que está valorando.
  const [valoracionesPed, setValoracionesPed] = useState<Record<string, ValoracionPedido> | null>(null);
  const [valorandoPedido, setValorandoPedido] = useState<{ id: string; referencia: string | null; productId?: string | null } | null>(null);
  // Filtro de «Mis pedidos» (dueño, 2026-11-10): todos, en curso, cancelados o los que tienen factura.
  // Llega ya puesto con ?filtro=facturas («Ver mis facturas» de Blue IA).
  const [filtroPedidos, setFiltroPedidos] = useState<FiltroPedidos>(filtroInicial ?? "todos");
  useEffect(() => {
    if (filtroInicial) setFiltroPedidos(filtroInicial);
  }, [filtroInicial]);
  // Reparación por envío: plazo y dirección del taller (reparacion_envio_ajustes; null sin la migración).
  const [ajustesEnvio, setAjustesEnvio] = useState<AjustesReparacionEnvio | null>(null);
  // Parte 2: ¿puede pagar con tarjeta? (api/pago.ts, la misma regla que los pedidos) y el aviso de la vuelta de Stripe.
  const [tarjeta, setTarjeta] = useState(false);
  // ¿La página de pago online ofrece también Bizum? (api/pago.ts; sin él, no se promete)
  const [bizumOnline, setBizumOnline] = useState(false);
  const [avisoPago, setAvisoPago] = useState<{ ok: boolean; texto: string } | null>(null);
  // «Avisarme cuando haya otro» de los pedidos cancelados, por pedido (null: aún no se puede, sin la migración).
  const [avisosReposicion, setAvisosReposicion] = useState<Record<string, AvisoReposicion> | null>(null);

  // Para recargar desde dentro de `cargar` (al unirse una compra en mano a la cuenta).
  const cargarRef = useRef<((silencioso?: boolean) => Promise<void>) | null>(null);
  // silencioso: al añadir un número se recarga sin volver a la pantalla de carga (el aviso de «Listo» sigue a la vista).
  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCargando(true);
    try {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id;
      if (!uid) {
        setConSesion(false);
        return;
      }
      setConSesion(true);

      // Lo que se enseña aquí queda «visto» (Blue deja de avisar de esos cambios): se apunta al final.
      const vistosPedidos: { id: string; estado: string }[] = [];
      const vistasReparaciones: { id: string; etapa: string; actualizado: string }[] = [];

      // Pedidos (la tabla puede no existir aún; el número de seguimiento, tampoco)
      const pedidosCon = (columnas: string) =>
        supabase.from("pedidos").select(columnas).eq("user_id", uid).order("created_at", { ascending: false }).limit(50);
      // Las compras en mano que VeoAura mandó con su correo pasan a su cuenta (una vez por sesión de la app); si se ha
      // unido alguna, se recarga sin la pantalla de carga.
      void unirComprasEnTienda(uid, data.session?.access_token ?? "").then((n) => {
        if (n > 0) cargarRef.current?.(true);
      });
      // Con el pago con tarjeta y las ventas en mano (si sus columnas aún no existen, como antes).
      const CON_PAGO = "id,numero,created_at,estado,entrega,total_eur,codigo_seguimiento,pago_estado,pago_modo,pagado_eur,pagado_en";
      let pedRes: { data: any[] | null; error: any } = await pedidosCon(`${CON_PAGO},origen,venta_forma_pago`);
      if (pedRes.error && faltaEsquema(pedRes.error)) pedRes = await pedidosCon(CON_PAGO);
      if (pedRes.error && faltaEsquema(pedRes.error)) pedRes = await pedidosCon("id,numero,created_at,estado,entrega,total_eur,codigo_seguimiento");
      let numeros = !pedRes.error;
      if (pedRes.error && faltaEsquema(pedRes.error)) {
        pedRes = await pedidosCon("id,numero,created_at,estado,entrega,total_eur");
        numeros = false;
      }

      if (pedRes.error) {
        if (!faltaEsquema(pedRes.error)) console.error("Error cargando pedidos:", pedRes.error);
        setPedidos(null);
      } else {
        const filas = (pedRes.data ?? []) as Omit<PedidoSeg, "items">[];
        const porPedido: Record<string, string[]> = {};
        // Miniatura de cada pedido (dueño, 2026-11-10): la portada del primer artículo que la tenga.
        const fotoPedido: Record<string, string> = {};
        const primerProducto: Record<string, string> = {};
        const primerTitulo: Record<string, string> = {};
        if (filas.length) {
          const itRes = await supabase
            .from("pedido_items")
            .select("pedido_id,titulo,product_id")
            .in("pedido_id", filas.map((p) => p.id));
          const items = (itRes.data ?? []) as { pedido_id: string; titulo: string; product_id?: string | null }[];
          for (const it of items) {
            (porPedido[it.pedido_id] ??= []).push(it.titulo);
          }
          const portadas = await portadasDe("producto", items.map((it) => it.product_id ?? "").filter(Boolean));
          for (const it of items) {
            const f = it.product_id ? portadas[it.product_id] : undefined;
            if (f && !fotoPedido[it.pedido_id]) fotoPedido[it.pedido_id] = f;
            if (it.product_id && !primerProducto[it.pedido_id]) {
              primerProducto[it.pedido_id] = it.product_id;
              primerTitulo[it.pedido_id] = it.titulo;
            }
          }
        }
        // Cancelados: el motivo (migración 20261116100000; sin la columna, sin él) y sus «Avisarme cuando haya otro».
        const canceladosIds = filas.filter((p) => p.estado === "cancelado").map((p) => p.id);
        const motivos: Record<string, string | null> = {};
        const canceladosEn: Record<string, string | null> = {};
        let avisosCancel: AvisoReposicion[] | null = null;
        // ¿Su artículo sigue a la venta? y su categoría, para «Volver a comprar» y «Ver artículos parecidos» (products:
        // con la sesión del cliente solo se leen los publicados; si no viene o falla, sin «Volver a comprar»).
        const articulos: Record<string, { venta: boolean; categoria: string | null }> = {};
        if (canceladosIds.length) {
          const mot = await supabase.from("pedidos").select("id,cancelacion_motivo,cancelado_en").in("id", canceladosIds);
          if (!mot.error) {
            for (const m of (mot.data ?? []) as { id: string; cancelacion_motivo: string | null; cancelado_en?: string | null }[]) {
              motivos[m.id] = m.cancelacion_motivo;
              canceladosEn[m.id] = m.cancelado_en ?? null;
            }
            avisosCancel = await misAvisosReposicion(canceladosIds);
          }
          const prodIds = [...new Set(canceladosIds.map((id) => primerProducto[id]).filter(Boolean))];
          if (prodIds.length) {
            const pr = await supabase.from("products").select("id,category_id,is_active,status").in("id", prodIds);
            if (!pr.error) {
              for (const f of (pr.data ?? []) as { id: string; category_id: string | null; is_active: boolean | null; status: string | null }[]) {
                articulos[f.id] = { venta: !!f.is_active && f.status === "PUBLISHED", categoria: f.category_id ?? null };
              }
            }
          }
        }
        setAvisosReposicion(avisosCancel ? Object.fromEntries(avisosCancel.map((a) => [a.pedido_id, a])) : null);
        // Las devoluciones (migración 20261106100000) solo se piden si hay algún pedido pagado con tarjeta.
        const pagados = filas.filter((p) => p.pago_estado === "pagado").map((p) => p.id);
        // Con qué se pagó online (pago_metodo, migración 20261111150000): si la columna aún no existe, sin él.
        const devueltos: Record<string, { devuelto_eur: number | null; devuelto_en: string | null; pago_metodo?: string | null }> = {};
        if (pagados.length) {
          let dev: { data: any[] | null; error: any } = await supabase.from("pedidos").select("id,devuelto_eur,devuelto_en,pago_metodo").in("id", pagados);
          if (dev.error) dev = await supabase.from("pedidos").select("id,devuelto_eur,devuelto_en").in("id", pagados);
          for (const d of (dev.error ? [] : dev.data ?? []) as { id: string; devuelto_eur: number | null; devuelto_en: string | null; pago_metodo?: string | null }[]) devueltos[d.id] = d;
        }
        // Facturas de VeoAura (migración 20261110100000): con la sesión del cliente, solo ve las de sus pedidos. Sin la
        // tabla (42P01/PGRST205) no se enseña nada y no falla.
        const facturas: Record<string, { numero_factura: string | null; pdf: boolean; orden: string }> = {};
        let conFacturas = false;
        if (filas.length) {
          const fac = await supabase
            .from("pedido_facturas")
            .select("pedido_id,numero_factura,pdf_path,fecha,recibida_en")
            .in("pedido_id", filas.map((p) => p.id));
          if (!fac.error) {
            conFacturas = true;
            for (const f of (fac.data ?? []) as { pedido_id: string; numero_factura: string | null; pdf_path: string | null; fecha: string | null; recibida_en: string | null }[]) {
              // La más reciente de cada pedido (la misma que da api/factura.ts).
              const orden = `${f.fecha ?? ""}|${f.recibida_en ?? ""}`;
              if (!facturas[f.pedido_id] || orden > facturas[f.pedido_id].orden) {
                facturas[f.pedido_id] = { numero_factura: f.numero_factura, pdf: !!f.pdf_path, orden };
              }
            }
          } else if (!faltaEsquema(fac.error)) {
            console.error("Error cargando las facturas:", fac.error);
          }
        }
        setFacturasOk(conFacturas);
        // Código de entrega (contracargos, parte 2; migración 20261121120000): solo de los pedidos en curso que se entregan
        // en mano o el mismo día en Zaragoza y Cuarte. Sin la columna, sin código y sin fallar.
        const codigos: Record<string, string> = {};
        const enCurso = filas.filter((p) => p.estado !== "entregado" && p.estado !== "cancelado").map((p) => p.id);
        if (enCurso.length) {
          const cod = await supabase.from("pedidos").select("id,entrega,zona_envio,entrega_codigo").in("id", enCurso);
          if (!cod.error) {
            for (const c of (cod.data ?? []) as { id: string; entrega: string; zona_envio: string | null; entrega_codigo: string | null }[]) {
              if (c.entrega_codigo && (c.entrega === "recogida" || ["mano", "local", "local_lejos"].includes(c.zona_envio ?? ""))) codigos[c.id] = c.entrega_codigo;
            }
          }
        }
        // La hora de cada paso y el número de envío (migración 20261114160000; sin ella, pasos sin hora y sin botón).
        const seg = await cargarSeguimientoPedidos(filas.map((p) => p.id));
        setHistorial(seg.historial);
        // Valoraciones de los entregados (migración 20261115100000; sin ella, null: no sale nada).
        const entregadosIds = filas.filter((p) => p.estado === "entregado").map((p) => p.id);
        setValoracionesPed(entregadosIds.length ? await cargarValoracionesPedidos(entregadosIds) : {});
        setPedidos(
          filas.map((p) => ({
            ...p,
            primerProducto: primerProducto[p.id] ?? null,
            primerTitulo: primerTitulo[p.id] ?? porPedido[p.id]?.[0] ?? null,
            cancelacion_motivo: motivos[p.id] ?? null,
            cancelado_en: canceladosEn[p.id] ?? null,
            articuloALaVenta: !!(primerProducto[p.id] && articulos[primerProducto[p.id]]?.venta),
            articuloCategoria: primerProducto[p.id] ? articulos[primerProducto[p.id]]?.categoria ?? null : null,
            envio_seguimiento: seg.numeros[p.id] ?? null,
            entrega_codigo: codigos[p.id] ?? null,
            ...devueltos[p.id],
            items: porPedido[p.id] ?? [],
            foto: fotoPedido[p.id] ?? null,
            factura: facturas[p.id] ? { numero_factura: facturas[p.id].numero_factura, pdf: facturas[p.id].pdf } : null,
          }))
        );
        for (const p of filas) vistosPedidos.push({ id: p.id, estado: firmaPedidoSeg(p.estado, devueltos[p.id]?.devuelto_en) });
      }

      // Reparaciones (las columnas de seguimiento y el número pueden no existir aún)
      const reparacionesCon = (columnas: string) =>
        supabase.from("service_requests").select(columnas).eq("customer_user_id", uid).order("created_at", { ascending: false }).limit(50);
      // select("*"): trae las columnas que existan (también las de la reparación por envío, migración 20261111100000) sin
      // pedir ninguna por su nombre, así antes de la migración no hay errores 400 en la consola.
      let repRes: { data: any[] | null; error: any } = await reparacionesCon("*");
      if (repRes.error && faltaEsquema(repRes.error)) {
        numeros = false;
        repRes = await reparacionesCon("id,created_at,service_title,status,seguimiento,seguimiento_nota,seguimiento_actualizado");
      }
      if (repRes.error && faltaEsquema(repRes.error)) {
        repRes = await reparacionesCon("id,created_at,service_title,status");
      }
      if (repRes.error) numeros = false;
      setNumerosOk(numeros);

      if (repRes.error) {
        console.error("Error cargando reparaciones:", repRes.error);
        setReparaciones([]);
      } else {
        // Miniatura de cada reparación: la portada del servicio contratado (si tiene).
        const fotosServicio = await portadasDe("servicio", (repRes.data ?? []).map((r: any) => String(r.service_id ?? "")).filter(Boolean));
        setReparaciones(
          (repRes.data ?? []).map((r: any) => ({
            id: r.id,
            created_at: r.created_at,
            foto: r.service_id ? fotosServicio[r.service_id] ?? null : null,
            service_title: r.service_title ?? "Servicio",
            seguimiento:
              r.seguimiento && r.seguimiento in ETIQUETA_REPARACION
                ? r.seguimiento
                : r.status === "descartado"
                ? "cancelado"
                : "solicitado",
            seguimiento_nota: r.seguimiento_nota ?? null,
            seguimiento_actualizado: r.seguimiento_actualizado ?? null,
            codigo_seguimiento: r.codigo_seguimiento ?? null,
            entrega_modo: r.entrega_modo ?? null,
            aparatos: r.aparatos ?? null,
            etiqueta_eur: r.etiqueta_eur ?? null,
            etiqueta_lista: !!r.etiqueta_path,
            etiqueta_pagada_en: r.etiqueta_pagada_en ?? null,
            presupuesto_eur: r.presupuesto_eur ?? null,
            presupuesto_aceptado_en: r.presupuesto_aceptado_en ?? null,
            fotos_recepcion: Array.isArray(r.recepcion_fotos) ? r.recepcion_fotos.length : 0,
            espera_pieza_hasta: r.espera_pieza_hasta ?? null,
            etiqueta_avisada_en: r.etiqueta_avisada_en ?? null,
            pago_estado: r.pago_estado ?? null,
            pago_modo: r.pago_modo ?? null,
            pagado_eur: r.pagado_eur ?? null,
            pagado_en: r.pagado_en ?? null,
            pago_avisado_en: r.pago_avisado_en ?? null,
            diagnostico_resultado: r.diagnostico_resultado ?? null,
            oferta_compra_eur: r.oferta_compra_eur ?? null,
            vuelta_eur: r.vuelta_eur ?? null,
            sin_arreglo_eleccion: r.sin_arreglo_eleccion ?? null,
            vuelta_seguimiento: r.vuelta_seguimiento ?? null,
            entregado_en: r.entregado_en ?? null,
            garantia_de: r.garantia_de ?? null,
            datos: {
              service_id: r.service_id ?? null,
              nombre: String(r.nombre ?? ""),
              apellido: String(r.apellido ?? ""),
              ciudad: String(r.ciudad ?? ""),
              metodo_contacto: r.metodo_contacto ?? null,
              contacto: r.contacto ?? null,
              codigo_postal: r.codigo_postal ?? null,
            },
          }))
        );
        // Ajustes de la reparación por envío (plazo, dirección del taller, formas de pago y garantía), solo si alguna va
        // por Correos o ya está entregada (la garantía vale también para las de recogida).
        if ((repRes.data ?? []).some((r: any) => r.entrega_modo === "correos" || r.seguimiento === "entregado")) {
          const aj = await cargarAjustesReparacionEnvio();
          setAjustesEnvio(aj);
          // ¿Tarjeta? Solo si hay algo que pagar ahora (como los pedidos: con la clave de prueba, solo el administrador).
          const porPagar = (repRes.data ?? []).some(
            (r: any) =>
              r.entrega_modo === "correos" &&
              r.seguimiento !== "cancelado" &&
              ((!r.etiqueta_pagada_en && Number(r.etiqueta_eur ?? 0) > 0) ||
                (r.pago_estado !== "pagado" && (r.seguimiento === "listo" || r.diagnostico_resultado === "sin_arreglo")))
          );
          if (aj?.parte2 && porPagar) {
            try {
              const resp = await fetch("/api/pago", { headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` } });
              const d = (await resp.json().catch(() => null)) as { disponible?: boolean; bizum?: boolean } | null;
              setTarjeta(resp.ok && d?.disponible === true);
              setBizumOnline(resp.ok && d?.disponible === true && d?.bizum === true);
            } catch {
              setTarjeta(false);
              setBizumOnline(false);
            }
          }
        }
        for (const r of repRes.data ?? []) {
          vistasReparaciones.push({
            id: String(r.id),
            etapa: String(r.seguimiento ?? "solicitado"),
            actualizado: String(r.seguimiento_actualizado ?? ""),
          });
        }
        // Las entregadas se pueden valorar una vez: ¿cuáles ya tienen su reseña? (si la columna aún no existe, ninguna
        // se ofrece).
        const entregadas = (repRes.data ?? []).filter((r: any) => r.seguimiento === "entregado").map((r: any) => String(r.id));
        if (!entregadas.length) setValoradas({});
        else {
          const res = await supabase.from("store_reviews").select("service_request_id,rating").eq("user_id", uid).in("service_request_id", entregadas);
          setValoradas(
            res.error
              ? null
              : Object.fromEntries(((res.data ?? []) as { service_request_id: string; rating: number }[]).map((f) => [f.service_request_id, f.rating]))
          );
        }
      }

      // Ya se han visto: Blue quita sus avisos de estado.
      await marcarSeguimientosVistos(uid, vistosPedidos, vistasReparaciones);
    } catch (e) {
      console.error("Error cargando seguimientos:", e);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargarRef.current = cargar;
    cargar();
  }, [cargar]);

  // Vuelta de Stripe (api/pago.ts?solicitud): «pagado» solo lo dice el servidor después de preguntárselo a Stripe.
  useEffect(() => {
    if (typeof window === "undefined" || !window.location?.search) return;
    const q = new URLSearchParams(window.location.search);
    const pago = q.get("pago");
    if (pago !== "ok" && pago !== "cancelado") return;
    const sesion = q.get("sesion") ?? "";
    const limpiar = () => {
      try {
        q.delete("pago");
        q.delete("sesion");
        window.history.replaceState(null, "", `${window.location.pathname}${q.toString() ? `?${q.toString()}` : ""}`);
      } catch {
        // sin historial
      }
    };
    if (pago === "cancelado") {
      setAvisoPago({ ok: false, texto: "Has cancelado el pago: puedes pagarlo cuando quieras desde aquí." });
      limpiar();
      return;
    }
    let vivo = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const resp = await fetch("/api/pago", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
          body: JSON.stringify({ accion: "confirmar", sesion }),
        });
        const d = (await resp.json().catch(() => null)) as { ok?: boolean; pagado?: boolean } | null;
        if (!vivo) return;
        if (resp.ok && d?.pagado) {
          void medirEvento("reparacion_envio", "Reparación por envío: pago con tarjeta confirmado");
          setAvisoPago({ ok: true, texto: "Pago recibido ✓ Gracias: ya lo ves en tu reparación." });
          cargar(true);
        } else {
          setAvisoPago({ ok: false, texto: "Aún no nos consta el pago. Si te lo han cobrado, en unos minutos aparecerá aquí." });
        }
      } catch {
        if (vivo) setAvisoPago({ ok: false, texto: "No hemos podido comprobar el pago: revisa tu conexión." });
      } finally {
        limpiar();
      }
    })();
    return () => {
      vivo = false;
    };
  }, [cargar]);

  // Dónde va «¿Tienes un número de seguimiento…?» se decide al cargar la primera vez: si cambiara mientras el cliente lo
  // usa (al añadir su primer pedido), el recuadro saltaría de arriba abajo, se plegaría y perdería el «Listo: …».
  const [numeroArriba, setNumeroArriba] = useState<boolean | null>(null);
  useEffect(() => {
    if (!cargando && numeroArriba === null) setNumeroArriba(!pedidos || pedidos.length === 0);
  }, [cargando, pedidos, numeroArriba]);

  if (cargando) return <CargaMarca texto="Cargando tus seguimientos…" />;
  if (!conSesion) return null;
  const sinPedidos = numeroArriba ?? (!pedidos || pedidos.length === 0);

  return (
    // Móvil (dueño, 2026-11-10): en cada pedido, primero lo que compraste y su estado, luego pago y factura, y entrega y
    // número de seguimiento en una línea. «Añadir un número de seguimiento», plegado: AL FINAL si hay pedidos y ARRIBA si
    // aún no hay ninguno (dueño, 2026-11-16).
    <View style={{ gap: 32, alignItems: "center" }}>
      {avisoPago ? (
        <LineaIcono id="seguimiento-pago-vuelta" icono={avisoPago.ok ? "checkmark-circle" : "information-circle-outline"} color={avisoPago.ok ? SEG.ok : SEG.muted}>
          {avisoPago.texto}
        </LineaIcono>
      ) : null}
      {/* Sin pedidos aún (dueño, 2026-11-16): «¿Tienes un número de seguimiento…?» arriba, como antes, porque ahí no
          estorba y quien compró en la tienda lo encuentra a la primera; con pedidos va al final. */}
      {numerosOk && sinPedidos ? <AnadirNumeroSeguimiento onAnadido={() => cargar(true)} /> : null}
      {/* Reservar con señal (mejora 14): sin reservas, no sale nada. */}
      <MisReservasSenal />
      {pedidos !== null ? (
        <View style={{ gap: 18, alignItems: "center", width: "100%" }}>
          <SegTitulo>Mis pedidos{pedidos.length ? ` (${pedidos.length})` : ""}</SegTitulo>
          {pedidos.length === 0 ? (
            <SegVacio
              cual="tienda"
              texto="Todavía no tienes pedidos. Cuando realices una compra, podrás seguirla aquí paso a paso."
              boton="Ver catálogo"
              destino="/catalogo"
            />
          ) : (
            <>
            <FiltrosPedidos pedidos={pedidos} facturasOk={facturasOk} actual={filtroPedidos} onCambiar={setFiltroPedidos} />
            {pedidos.filter((p) => pasaFiltroPedido(p, filtroPedidos)).length === 0 ? (
              <Text nativeID="seguimiento-filtro-vacio" style={{ color: SEG.muted, fontSize: TAMANOS.cuerpo, textAlign: "center", lineHeight: 20, maxWidth: 420 }}>
                {TEXTO_FILTRO_VACIO[filtroPedidos]}
              </Text>
            ) : null}
            {pedidos.filter((p) => pasaFiltroPedido(p, filtroPedidos)).map((p, i) => (
              <View key={p.id} nativeID={`seguimiento-pedido-${p.numero ?? p.id}`} style={{ gap: 10, alignItems: "center", width: "100%" }}>
                {/* La tarjeta del cancelado ya tiene su borde: sin la raya de 460 px encima (en el ordenador quedaba corta). */}
                {i > 0 && !(p.estado === "cancelado" && p.origen !== "tienda_fisica") ? <SegSeparador /> : null}
                {p.estado === "cancelado" && p.origen !== "tienda_fisica" ? (
                  // Cancelado (dueño, 2026-11-16): una sola tarjeta con todo (estado, pasos, motivo, reembolso, qué hacer y
                  // ayuda), sin la barra de cinco puntos ni la línea de la factura.
                  <CancelacionDelPedido
                    p={p}
                    historial={historial}
                    aviso={avisosReposicion?.[p.id] ?? null}
                    avisosOk={avisosReposicion !== null}
                    onGuardado={(a) => setAvisosReposicion((prev) => ({ ...(prev ?? {}), [p.id]: a }))}
                    onAyuda={() => router.push(`/blue-ia?pedido=${encodeURIComponent(p.codigo_seguimiento ?? "")}`)}
                  />
                ) : (
                <>
                {/* La referencia del pedido (VZ-XXXX-XXXX), como una empresa: nunca el número interno (dueño, 2026-11-11). */}
                <Text nativeID={`mis-pedidos-titulo-${p.numero ?? p.id}`} style={{ color: SEG.text, fontWeight: "900", fontSize: TAMANOS.cuerpo, textAlign: "center" }}>
                  {p.origen === "tienda_fisica" ? "Compra en tienda" : "Pedido"}
                  {p.codigo_seguimiento ? ` ${p.codigo_seguimiento}` : ""}
                  {p.total_eur != null ? ` · ${segEuros(p.total_eur)}` : ""}
                  {` · ${segFecha(p.created_at)}`}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12, maxWidth: 460, alignSelf: "center" }}>
                  <MiniaturaSeguimiento nativeID={`seguimiento-mini-${p.numero ?? p.id}`} foto={p.foto} icono="cube-outline" alt={p.items[0] ?? "Artículo del pedido"} />
                  {p.items.length ? (
                    <Text style={{ color: SEG.text, fontSize: TAMANOS.cuerpo, lineHeight: 20, flexShrink: 1 }}>{p.items.join(" · ")}</Text>
                  ) : null}
                </View>
                {p.origen === "tienda_fisica" ? (
                  // Compra en mano (llega de VeoAura): ya pagada y entregada, sin barra de envío; su forma de pago y su
                  // factura.
                  <>
                    <CompraEnTienda p={p} />
                    <FacturaDelPedido p={p} facturasOk={facturasOk} />
                  </>
                ) : (
                  <>
                    <LineaProgreso
                      etiquetas={etiquetasPedido(p.entrega)}
                      actual={Math.max(0, ETAPAS_PEDIDO.indexOf(p.estado))}
                      cancelado={p.estado === "cancelado"}
                    />
                    <PasosDelPedido p={p} historial={historial} />
                    <CodigoEntrega p={p} />
                    {p.entrega !== "recogida" && p.estado !== "cancelado" ? (
                      <BotonSeguirEnvio id={`seguir-envio-${p.numero ?? p.id}`} numero={p.envio_seguimiento} tipo="pedido" />
                    ) : null}
                    <PagoDelPedido p={p} />
                    <FacturaDelPedido p={p} facturasOk={facturasOk} />
                    {/* La referencia ya va en el título: aquí solo la entrega. */}
                    <DatosDelSeguimiento entrega={p.entrega ? (p.entrega === "recogida" ? "Entrega en mano" : "Envío a domicilio") : null} />
                  </>
                )}
                {/* Valoración tras la entrega (mejora 11): a los 3 días del paso «entregado»; una vez valorado, sus estrellas. */}
                {valoracionesPed && valoracionesPed[p.id] ? (
                  <Text
                    nativeID={`valoracion-pedido-${p.numero ?? p.id}`}
                    accessibilityLabel={`Tu valoración: ${valoracionesPed[p.id].nota} de 5 estrellas`}
                    style={{ color: SEG.text, fontSize: TAMANOS.cuerpo, fontWeight: "800", textAlign: "center" }}
                  >
                    Tu valoración: <Text style={{ color: "#B7791F", letterSpacing: 1 }}>{estrellasDeNota(valoracionesPed[p.id].nota)}</Text>
                  </Text>
                ) : valoracionesPed && tocaValorarPedido(p.estado, entregadoEnDe(historial?.[p.id]), false) ? (
                  <BotonValorarCompra
                    id={`valorar-compra-${p.numero ?? p.id}`}
                    pedidoId={p.id}
                    onPress={() => setValorandoPedido({ id: p.id, referencia: p.codigo_seguimiento ?? null, productId: p.primerProducto ?? null })}
                  />
                ) : null}
                <PreguntarBoton onPress={() => router.push(`/blue-ia?pedido=${encodeURIComponent(p.codigo_seguimiento ?? "")}`)} />
                </>
                )}
              </View>
            ))}
            </>
          )}
        </View>
      ) : null}

      <View style={{ gap: 18, alignItems: "center", width: "100%" }}>
        <SegTitulo>Reparaciones y Mantenimientos{reparaciones.length ? ` (${reparaciones.length})` : ""}</SegTitulo>
        {reparaciones.length === 0 ? (
          <SegVacio
            cual="taller"
            texto="No tienes ninguna reparación ni mantenimiento en curso. Cuando solicites uno, podrás seguir aquí su estado."
            boton="Ver servicios"
            destino="/servicios"
          />
        ) : (
          reparaciones.map((r, i) => (
            <View key={r.id} style={{ gap: 10, alignItems: "center", width: "100%" }}>
              {i > 0 ? <SegSeparador /> : null}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, maxWidth: 460, alignSelf: "center" }}>
                <MiniaturaSeguimiento nativeID={`seguimiento-mini-rep-${r.id}`} foto={r.foto} icono="construct-outline" alt={r.service_title} />
                <Text style={{ color: SEG.text, fontWeight: "900", fontSize: TAMANOS.cuerpo, lineHeight: 21, flexShrink: 1 }}>
                  {r.service_title} · {segFecha(r.created_at)}
                </Text>
              </View>
              {(() => {
                const barra = barraDeReparacion(r);
                return (
                  <LineaProgreso
                    etiquetas={barra.etiquetas}
                    actual={r.entrega_modo === "correos" ? barra.actual : Math.max(0, barra.actual)}
                    cancelado={r.seguimiento === "cancelado"}
                    antes="Solicitada · preparando tu etiqueta"
                  />
                );
              })()}
              {/* Mejora 5: la hora real del último cambio que apuntó el taller (seguimiento_actualizado). */}
              {r.seguimiento_actualizado && fechaHoraPaso(r.seguimiento_actualizado) ? (
                <Text nativeID={`rep-actualizado-${r.id}`} style={{ color: SEG.muted, fontWeight: "700", fontSize: TAMANOS.minimo, textAlign: "center" }}>
                  Última actualización: {fechaHoraPaso(r.seguimiento_actualizado)}
                </Text>
              ) : null}
              <EnvioDeLaReparacion
                r={r}
                ajustes={ajustesEnvio}
                onAceptado={(id, fecha) => setReparaciones((lista) => lista.map((x) => (x.id === id ? { ...x, presupuesto_aceptado_en: fecha } : x)))}
              />
              {ajustesEnvio?.parte2 ? (
                <CobrosDeLaReparacion
                  r={r}
                  ajustes={ajustesEnvio}
                  tarjeta={tarjeta}
                  bizum={bizumOnline}
                  garantia={garantiaDe(r, reparaciones, ajustesEnvio.garantia_meses)}
                  onCambio={(id, patch) => setReparaciones((lista) => lista.map((x) => (x.id === id ? { ...x, ...patch } : x)))}
                  onGarantiaPedida={() => cargar(true)}
                />
              ) : null}
              {r.seguimiento_nota ? (
                <View style={{ alignItems: "center", gap: 2, maxWidth: 460 }}>
                  <Text style={{ color: SEG.muted, fontSize: TAMANOS.minimo, fontWeight: "800" }}>
                    NOTA DEL TALLER{r.seguimiento_actualizado ? ` · ${segFecha(r.seguimiento_actualizado)}` : ""}
                  </Text>
                  <Text style={{ color: SEG.text, textAlign: "center", lineHeight: 20 }}>{r.seguimiento_nota}</Text>
                </View>
              ) : null}
              {/* Terminado: se pide su valoración (una vez); con ella, sus estrellas. */}
              {r.seguimiento === "entregado" && valoradas !== null ? (
                valoradas[r.id] ? (
                  <Text nativeID={`valorado-${r.id}`} style={{ color: SEG.muted, fontWeight: "800", fontSize: TAMANOS.minimo }}>
                    Tu valoración: <Text style={{ color: "#F5A524" }}>{"★".repeat(valoradas[r.id])}</Text>
                  </Text>
                ) : (
                  <Pressable
                    nativeID={`valorar-${r.id}`}
                    onPress={() => {
                      medirEvento("resena_servicio_pedida", "Seguimientos: valorar el servicio", { metadata: { solicitud: r.id } });
                      setValorando({ solicitudId: r.id, titulo: r.service_title });
                    }}
                    accessibilityRole="button"
                    style={({ pressed }) => ({
                      borderRadius: 999,
                      minHeight: 44,
                      paddingHorizontal: 22,
                      justifyContent: "center",
                      backgroundColor: SEG.accentDark,
                      opacity: pressed ? 0.85 : 1,
                    })}
                  >
                    <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>Valorar el servicio</Text>
                  </Pressable>
                )
              ) : null}
              <DatosDelSeguimiento entrega={r.entrega_modo === "correos" ? "Reparación por envío" : null} codigo={r.codigo_seguimiento} />
              <PreguntarBoton onPress={() => router.push(`/blue-ia?reparacion=${r.id}`)} />
            </View>
          ))
        )}
      </View>

      {/* Con pedidos, al final, debajo de pedidos y reparaciones: una línea discreta, plegada (arriba estorbaba). */}
      {numerosOk && !sinPedidos ? <AnadirNumeroSeguimiento onAnadido={() => cargar(true)} /> : null}

      <VentanaValoracion
        visible={!!valorando}
        servicio={valorando}
        onClose={() => setValorando(null)}
        onPublished={(resena) => {
          const id = valorando?.solicitudId;
          if (id) setValoradas((v) => ({ ...(v ?? {}), [id]: resena.rating }));
        }}
      />
      <ValorarPedidoModal
        visible={!!valorandoPedido}
        pedido={valorandoPedido}
        onClose={() => setValorandoPedido(null)}
        onValorado={(v) => setValoracionesPed((prev) => ({ ...(prev ?? {}), [v.pedido_id]: v }))}
      />
    </View>
  );
}
