// components/PerfilPublico.tsx
/**
 * Qué hace: el «Perfil público» del cliente y su obligación de completarlo.
 *
 * - PerfilPublico (Mi cuenta → app/(tabs)/perfil.tsx): tarjeta plegable con la foto pequeña, «Perfil público» y
 *   «@usuario · Completo» (o «Faltan datos»); dentro, la foto grande («Toca la foto para cambiarla», opcional), usuario,
 *   nombre, país, provincia o región, fecha de nacimiento (la edad se calcula; mínimo 14 años) y «Guardar perfil» /
 *   «Deshacer». Campos redondeados y centrados con ✓ verde cuando están bien; desplegables con ⌃⌄ (los nativos del móvil,
 *   invisibles encima del campo).
 * - PerfilObligatorio (montado una vez en app/_layout.tsx): con sesión iniciada y el perfil sin completar, una pantalla
 *   «Completa tu perfil» tapa la tienda hasta que se guarda completo (o se cierra la sesión). No sale en Mi cuenta (allí está
 *   la tarjeta), ni en las políticas (se pueden leer antes de dar los datos), ni al cambiar la contraseña, ni en el panel de
 *   administración. Mientras está
 *   abierta, Blue se esconde (usePerfilObligatorioVisible, components/Campanita.tsx).
 *
 * Datos: tabla perfiles_cliente (cada cliente ve y edita SOLO su fila; el administrador las lee en Administración →
 * Usuarios) y fotos en el almacén «avatares», carpeta del propio cliente (supabase/migrations/20261030150000_perfiles_cliente
 * _completo.sql). Al guardar se actualizan también los datos de la cuenta (nombre, usuario, país y foto), que es de donde el
 * Foro saca el nombre. Si la tabla aún no existe (migración sin aplicar), no se enseña nada ni se exige nada; si existe sin la
 * columna de la foto, todo funciona sin foto.
 */
import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, usePathname, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { trackEvent } from "../lib/analytics";
import { pickMediaFilesWeb, reducirImagenWeb } from "../lib/admin/products.utils";
import CargaMarca from "./marca/CargaMarca";
import SmartImage from "./SmartImage";

const P = {
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  line: "#E3EAF2",
  accent: "#1EA7E8",
  danger: "#DC2626",
  ok: "#2E9E5B",
  fondo: "#F4F9FD",
};

export type DatosPerfil = { usuario: string; nombre: string; pais: string; provincia: string; fecha: string; foto: string };
const DATOS_VACIOS: DatosPerfil = { usuario: "", nombre: "", pais: "", provincia: "", fecha: "", foto: "" };
const PAIS_ESPANA = "España";
const EDAD_MINIMA = 14;
const FECHA_MINIMA = "1900-01-01";
const ALMACEN_FOTOS = "avatares";

const PAISES = [
  "España", "Andorra", "Portugal", "Francia", "Italia", "Alemania", "Reino Unido", "Irlanda", "Países Bajos", "Bélgica",
  "Luxemburgo", "Suiza", "Austria", "Polonia", "Rumanía", "Bulgaria", "Grecia", "Suecia", "Noruega", "Dinamarca", "Finlandia",
  "Ucrania", "Rusia", "Marruecos", "Argelia", "Túnez", "Senegal", "Nigeria", "Guinea Ecuatorial", "Estados Unidos", "Canadá",
  "México", "Cuba", "República Dominicana", "Puerto Rico", "Guatemala", "Honduras", "El Salvador", "Nicaragua", "Costa Rica",
  "Panamá", "Colombia", "Venezuela", "Ecuador", "Perú", "Bolivia", "Chile", "Argentina", "Uruguay", "Paraguay", "Brasil",
  "China", "Japón", "India", "Pakistán", "Filipinas", "Australia", "Otro país",
];

const PROVINCIAS_ES = [
  "Álava", "Albacete", "Alicante", "Almería", "Asturias", "Ávila", "Badajoz", "Baleares", "Barcelona", "Burgos", "Cáceres",
  "Cádiz", "Cantabria", "Castellón", "Ceuta", "Ciudad Real", "Córdoba", "A Coruña", "Cuenca", "Girona", "Granada", "Guadalajara",
  "Guipúzcoa", "Huelva", "Huesca", "Jaén", "La Rioja", "Las Palmas", "León", "Lleida", "Lugo", "Madrid", "Málaga", "Melilla",
  "Murcia", "Navarra", "Ourense", "Palencia", "Pontevedra", "Salamanca", "Santa Cruz de Tenerife", "Segovia", "Sevilla", "Soria",
  "Tarragona", "Teruel", "Toledo", "Valencia", "Valladolid", "Vizcaya", "Zamora", "Zaragoza",
];

const textoDe = (v: unknown) => (typeof v === "string" ? v.trim() : "");

// Tabla/columna inexistente (migración aún sin aplicar).
function faltaEsquema(error: unknown) {
  const code = String((error as { code?: unknown })?.code ?? "");
  return ["42P01", "42703", "PGRST205", "PGRST204"].includes(code);
}

// Edad cumplida a partir de «AAAA-MM-DD» (null si la fecha no existe).
function edadDeFecha(fecha: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!m) return null;
  const [a, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const f = new Date(Date.UTC(a, mes - 1, dia));
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== mes - 1 || f.getUTCDate() !== dia) return null;
  const hoy = new Date();
  let edad = hoy.getFullYear() - a;
  if (hoy.getMonth() + 1 < mes || (hoy.getMonth() + 1 === mes && hoy.getDate() < dia)) edad -= 1;
  return edad;
}

// Hoy hace 14 años, en «AAAA-MM-DD» (la fecha más reciente que se puede elegir).
function fechaMaximaPerfil(): string {
  const h = new Date();
  return `${h.getFullYear() - EDAD_MINIMA}-${String(h.getMonth() + 1).padStart(2, "0")}-${String(h.getDate()).padStart(2, "0")}`;
}

function fechaBonita(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return fecha;
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).replace(/\./g, "");
}

// Lo que no vale de lo escrito (un campo vacío no es un error aquí: eso lo dice «faltan»).
function erroresPerfil(d: DatosPerfil): Partial<Record<keyof DatosPerfil, string>> {
  const e: Partial<Record<keyof DatosPerfil, string>> = {};
  const nombre = d.nombre.trim();
  if (nombre && (nombre.length < 2 || nombre.length > 60)) e.nombre = "El nombre debe tener entre 2 y 60 letras.";
  const usuario = d.usuario.trim();
  if (usuario && !/^[A-Za-z0-9._-]{3,24}$/.test(usuario)) {
    e.usuario = "El usuario debe tener de 3 a 24 caracteres: letras, números, punto, guion o guion bajo.";
  }
  const provincia = d.provincia.trim();
  if (provincia && (provincia.length < 2 || provincia.length > 60)) e.provincia = "La provincia debe tener entre 2 y 60 letras.";
  if (d.fecha) {
    const edad = edadDeFecha(d.fecha);
    if (edad === null || d.fecha < FECHA_MINIMA) e.fecha = "Elige una fecha de nacimiento válida.";
    else if (edad < EDAD_MINIMA) e.fecha = `Para tener cuenta hay que tener ${EDAD_MINIMA} años o más.`;
  }
  return e;
}

// Datos obligatorios que aún faltan (la foto es opcional).
function faltan(d: DatosPerfil): string[] {
  const lista: string[] = [];
  if (!d.usuario.trim()) lista.push("usuario");
  if (!d.nombre.trim()) lista.push("nombre");
  if (!d.pais.trim()) lista.push("país");
  if (!d.provincia.trim()) lista.push(d.pais === PAIS_ESPANA || !d.pais ? "provincia" : "región");
  if (!d.fecha) lista.push("fecha de nacimiento");
  return lista;
}

export function perfilCompleto(d: DatosPerfil): boolean {
  return faltan(d).length === 0 && Object.keys(erroresPerfil(d)).length === 0;
}

// --- lectura y avisos compartidos --------------------------------------------------------------------------------

type Lectura = { disponible: false } | { disponible: true; conFoto: boolean; datos: DatosPerfil | null };

async function leerPerfil(uid: string): Promise<Lectura> {
  const columnas = "nombre,usuario,pais,provincia,fecha_nacimiento";
  const pedir = (cols: string) => supabase.from("perfiles_cliente").select(cols).eq("user_id", uid).maybeSingle();
  let conFoto = true;
  let r = await pedir(`${columnas},foto_url`);
  // Tabla creada con la migración anterior (sin la columna de la foto): sin foto.
  if (r.error && faltaEsquema(r.error) && /foto_url/.test(String(r.error.message ?? ""))) {
    conFoto = false;
    r = await pedir(columnas);
  }
  if (r.error) {
    if (faltaEsquema(r.error)) return { disponible: false };
    throw r.error;
  }
  const fila = r.data as Record<string, unknown> | null;
  if (!fila) return { disponible: true, conFoto, datos: null };
  return {
    disponible: true,
    conFoto,
    datos: {
      usuario: textoDe(fila.usuario),
      nombre: textoDe(fila.nombre),
      pais: textoDe(fila.pais),
      provincia: textoDe(fila.provincia),
      fecha: textoDe(fila.fecha_nacimiento),
      foto: textoDe(fila.foto_url),
    },
  };
}

// Al guardar el perfil en cualquier sitio, la pantalla obligatoria vuelve a mirar si ya está completo.
const oyentesGuardado = new Set<() => void>();
const avisarPerfilGuardado = () => oyentesGuardado.forEach((f) => f());

// ¿Está abierta «Completa tu perfil»? (Blue se esconde mientras tanto.)
let obligatorioVisible = false;
const oyentesVisible = new Set<() => void>();
function fijarObligatorioVisible(v: boolean) {
  if (obligatorioVisible === v) return;
  obligatorioVisible = v;
  oyentesVisible.forEach((f) => f());
}
const suscribirVisible = (f: () => void) => {
  oyentesVisible.add(f);
  return () => {
    oyentesVisible.delete(f);
  };
};
export function usePerfilObligatorioVisible(): boolean {
  return useSyncExternalStore(suscribirVisible, () => obligatorioVisible, () => false);
}

// --- piezas de la tarjeta ----------------------------------------------------------------------------------------

// Caja redondeada de cada dato: ✓ verde a la izquierda cuando está bien, flechas ⌃⌄ a la derecha en los desplegables y,
// encima, el control nativo invisible (`encima`) para que todo el campo sea tocable.
function CajaPerfil({
  valido,
  desplegable,
  enfocado,
  error,
  encima,
  children,
}: {
  valido?: boolean;
  desplegable?: boolean;
  enfocado?: boolean;
  error?: boolean;
  encima?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: 56,
        borderRadius: 18,
        borderWidth: 1.5,
        borderColor: error ? P.danger : enfocado ? P.accent : P.line,
        backgroundColor: "#FFFFFF",
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 10,
        gap: 4,
        position: "relative",
      }}
    >
      <View style={{ width: 22, alignItems: "center" }}>{valido ? <Ionicons name="checkmark" size={20} color={P.ok} /> : null}</View>
      <View style={{ flex: 1, minWidth: 0, justifyContent: "center" }}>{children}</View>
      <View style={{ width: 22, alignItems: "center" }}>{desplegable ? <Ionicons name="chevron-expand" size={18} color={P.text} /> : null}</View>
      {encima}
    </View>
  );
}

const ESTILO_NATIVO_INVISIBLE = {
  position: "absolute" as const,
  top: 0,
  left: 0,
  width: "100%",
  height: "100%",
  opacity: 0,
  cursor: "pointer",
  // 16 px: con menos, Safari (iPhone) hace zoom al abrir el selector.
  fontSize: 16,
};

const ESTILO_TEXTO_PERFIL = { textAlign: "center" as const, fontSize: 17, fontWeight: "800" as const, color: P.text };

// Foto redonda (o silueta si no hay).
function Foto({ uri, lado, alt }: { uri: string; lado: number; alt: string }) {
  return (
    <View
      style={{
        width: lado,
        height: lado,
        borderRadius: lado / 2,
        overflow: "hidden",
        backgroundColor: P.fondo,
        borderWidth: 1.5,
        borderColor: P.line,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {uri ? (
        <SmartImage uri={uri} alt={alt} contentFit="cover" style={{ width: "100%", height: "100%" }} />
      ) : (
        <Ionicons name="person" size={Math.round(lado * 0.5)} color="rgba(11,33,56,0.28)" />
      )}
    </View>
  );
}

// --- la tarjeta ----------------------------------------------------------------------------------------------------

export default function PerfilPublico({
  uid,
  modo = "tarjeta",
  alCompletar,
}: {
  uid: string;
  /** «tarjeta»: en Mi cuenta, plegable. «obligatorio»: dentro de «Completa tu perfil». */
  modo?: "tarjeta" | "obligatorio";
  alCompletar?: () => void;
}) {
  const obligatorio = modo === "obligatorio";
  const [estado, setEstado] = useState<"cargando" | "no-disponible" | "listo">("cargando");
  const [conFoto, setConFoto] = useState(true);
  const [datos, setDatos] = useState<DatosPerfil>(DATOS_VACIOS);
  const [guardado, setGuardado] = useState<DatosPerfil>(DATOS_VACIOS);
  const [guardando, setGuardando] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [enfocado, setEnfocado] = useState<keyof DatosPerfil | null>(null);
  const [abierto, setAbierto] = useState(true);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const l = await leerPerfil(uid);
        if (!vivo) return;
        if (!l.disponible) {
          setEstado("no-disponible");
          return;
        }
        setConFoto(l.conFoto);
        if (l.datos) {
          setDatos(l.datos);
          setGuardado(l.datos);
          // Completo: en Mi cuenta se enseña plegado (se abre al tocarlo).
          if (!obligatorio && perfilCompleto(l.datos)) setAbierto(false);
        } else {
          // Todavía sin guardar: se rellena con lo que escribió al registrarse (queda pendiente de guardar).
          const { data: s } = await supabase.auth.getSession();
          const meta = (s.session?.user?.user_metadata ?? {}) as Record<string, unknown>;
          if (!vivo) return;
          setDatos({ ...DATOS_VACIOS, nombre: textoDe(meta.full_name), usuario: textoDe(meta.username), pais: textoDe(meta.country) });
          setGuardado(DATOS_VACIOS);
        }
        setEstado("listo");
      } catch {
        if (vivo) setEstado("listo");
      }
    })();
    return () => {
      vivo = false;
    };
  }, [uid, obligatorio]);

  const errores = useMemo(() => erroresPerfil(datos), [datos]);
  const primerError = Object.values(errores)[0];
  const pendientes = faltan(datos);
  const completo = pendientes.length === 0 && !primerError;
  const guardadoCompleto = perfilCompleto(guardado);
  const hayCambios = (Object.keys(DATOS_VACIOS) as (keyof DatosPerfil)[]).some((k) => datos[k].trim() !== guardado[k].trim());
  // En Mi cuenta se puede guardar a medias; en «Completa tu perfil», solo completo.
  const puedeGuardar = (obligatorio ? completo : hayCambios && !primerError) && !guardando && !subiendoFoto;
  const esEspana = datos.pais === PAIS_ESPANA;
  const edad = datos.fecha ? edadDeFecha(datos.fecha) : null;

  const cambiar = useCallback((campo: keyof DatosPerfil, valor: string) => {
    setAviso(null);
    setDatos((d) => {
      const nuevo = { ...d, [campo]: valor };
      // Las provincias son las de España: al cambiar de país se borra la que no corresponda.
      if (campo === "pais" && (valor === PAIS_ESPANA) !== (d.pais === PAIS_ESPANA)) nuevo.provincia = "";
      return nuevo;
    });
  }, []);

  // Foto: se elige, se reduce a 512 px en JPEG y se sube a la carpeta del cliente; se guarda con «Guardar perfil».
  const elegirFoto = async () => {
    if (subiendoFoto || guardando) return;
    setAviso(null);
    let elegidas: Awaited<ReturnType<typeof pickMediaFilesWeb>>;
    try {
      elegidas = await pickMediaFilesWeb({ soloImagenes: true });
    } catch (e: unknown) {
      setAviso({ tipo: "error", texto: e instanceof Error ? e.message : "No se ha podido abrir el selector de fotos." });
      return;
    }
    for (const it of elegidas.items) {
      try {
        URL.revokeObjectURL(it.previewUrl);
      } catch {
        // nada
      }
    }
    const foto = elegidas.items.find((it) => it.kind === "image");
    if (!foto) {
      if (elegidas.skipped.length) setAviso({ tipo: "error", texto: "Esa foto no se puede usar. Prueba con una JPG o PNG." });
      return;
    }
    setSubiendoFoto(true);
    try {
      const archivo = await reducirImagenWeb(foto.file, 512, 0.85, true);
      const ruta = `${uid}/${Date.now()}.jpg`;
      const { error } = await supabase.storage
        .from(ALMACEN_FOTOS)
        .upload(ruta, archivo, { cacheControl: "31536000", upsert: false, contentType: "image/jpeg" });
      if (error) throw error;
      cambiar("foto", supabase.storage.from(ALMACEN_FOTOS).getPublicUrl(ruta).data.publicUrl);
    } catch {
      setAviso({ tipo: "error", texto: "No se ha podido subir la foto. Inténtalo de nuevo." });
    } finally {
      setSubiendoFoto(false);
    }
  };

  const guardar = async () => {
    if (!puedeGuardar) return;
    setGuardando(true);
    setAviso(null);
    const limpio: DatosPerfil = {
      usuario: datos.usuario.trim(),
      nombre: datos.nombre.trim(),
      pais: datos.pais.trim(),
      provincia: datos.provincia.trim(),
      fecha: datos.fecha,
      foto: conFoto ? datos.foto.trim() : "",
    };
    try {
      const { error } = await supabase.from("perfiles_cliente").upsert(
        {
          user_id: uid,
          nombre: limpio.nombre || null,
          usuario: limpio.usuario || null,
          pais: limpio.pais || null,
          provincia: limpio.provincia || null,
          fecha_nacimiento: limpio.fecha || null,
          ...(conFoto ? { foto_url: limpio.foto || null } : {}),
        },
        { onConflict: "user_id" }
      );
      if (error) {
        const codigo = String((error as { code?: string }).code ?? "");
        setAviso({
          tipo: "error",
          texto:
            codigo === "23505"
              ? "Ese nombre de usuario ya está en uso. Prueba con otro."
              : codigo === "23514"
              ? `Revisa los datos: el usuario debe tener de 3 a 24 caracteres y hay que tener ${EDAD_MINIMA} años o más.`
              : faltaEsquema(error)
              ? "Esta función todavía no está disponible."
              : "No se ha podido guardar. Inténtalo de nuevo.",
        });
        return;
      }
      // El Foro enseña el nombre que está en los datos de la cuenta: se mantienen al día (si falla, el perfil ya está guardado).
      try {
        await supabase.auth.updateUser({
          data: {
            ...(limpio.nombre ? { full_name: limpio.nombre } : {}),
            ...(limpio.usuario ? { username: limpio.usuario } : {}),
            ...(limpio.pais ? { country: limpio.pais } : {}),
            ...(conFoto ? { avatar_url: limpio.foto || null } : {}),
          },
        });
      } catch {
        // no pasa nada
      }
      setDatos(limpio);
      setGuardado(limpio);
      setAviso({ tipo: "ok", texto: "Perfil guardado." });
      trackEvent("perfil_guardado", "Perfil: guardado");
      avisarPerfilGuardado();
      if (perfilCompleto(limpio)) alCompletar?.();
    } catch {
      setAviso({ tipo: "error", texto: "No se ha podido guardar. Inténtalo de nuevo." });
    } finally {
      setGuardando(false);
    }
  };

  if (estado === "no-disponible") return null;
  if (estado === "cargando") return <CargaMarca texto="Cargando tu perfil…" />;

  const web = Platform.OS === "web";
  const opcionesPais = datos.pais && !PAISES.includes(datos.pais) ? [datos.pais, ...PAISES] : PAISES;
  const opcionesProvincia = datos.provincia && !PROVINCIAS_ES.includes(datos.provincia) ? [datos.provincia, ...PROVINCIAS_ES] : PROVINCIAS_ES;
  const marcador = "rgba(11,33,56,0.40)";
  const sinOutline = Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : {};

  const campoTexto = (campo: "nombre" | "usuario", placeholder: string, etiqueta: string) => (
    <CajaPerfil valido={!!datos[campo].trim() && !errores[campo]} enfocado={enfocado === campo} error={!!errores[campo]}>
      <TextInput
        value={datos[campo]}
        onChangeText={(t) => cambiar(campo, t)}
        onFocus={() => setEnfocado(campo)}
        onBlur={() => setEnfocado((e) => (e === campo ? null : e))}
        placeholder={placeholder}
        placeholderTextColor={marcador}
        accessibilityLabel={etiqueta}
        maxLength={campo === "usuario" ? 24 : 60}
        autoCapitalize={campo === "usuario" ? "none" : "words"}
        autoCorrect={false}
        style={[ESTILO_TEXTO_PERFIL, { paddingVertical: 10, ...sinOutline }]}
      />
    </CajaPerfil>
  );

  const campoSelector = (campo: "pais" | "provincia", placeholder: string, etiqueta: string, opciones: string[]) => (
    <CajaPerfil
      valido={!!datos[campo].trim() && !errores[campo]}
      desplegable
      enfocado={enfocado === campo}
      encima={
        web ? (
          <select
            aria-label={etiqueta}
            value={datos[campo]}
            onChange={(e) => cambiar(campo, e.target.value)}
            onFocus={() => setEnfocado(campo)}
            onBlur={() => setEnfocado((v) => (v === campo ? null : v))}
            style={ESTILO_NATIVO_INVISIBLE}
          >
            <option value="">{placeholder}</option>
            {opciones.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : null
      }
    >
      <Text numberOfLines={1} style={[ESTILO_TEXTO_PERFIL, { paddingVertical: 10, color: datos[campo] ? P.text : marcador }]}>
        {datos[campo] || placeholder}
      </Text>
    </CajaPerfil>
  );

  const formulario = (
    <View style={{ width: "100%", maxWidth: 460, gap: 12 }}>
      {conFoto ? (
        <View style={{ alignItems: "center", gap: 8, paddingBottom: 4 }}>
          <Pressable
            nativeID="perfil-foto"
            onPress={elegirFoto}
            disabled={subiendoFoto}
            accessibilityRole="button"
            accessibilityLabel={datos.foto ? "Cambiar la foto de perfil" : "Añadir una foto de perfil"}
            style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, position: "relative" })}
          >
            <Foto uri={datos.foto} lado={132} alt="Tu foto de perfil" />
            <View
              style={{
                position: "absolute",
                right: 4,
                bottom: 4,
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: P.accent,
                borderWidth: 2,
                borderColor: "#FFFFFF",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {subiendoFoto ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Ionicons name="camera" size={18} color="#FFFFFF" />}
            </View>
          </Pressable>
          <Text style={{ color: P.muted, fontWeight: "800", textAlign: "center" }}>
            {subiendoFoto ? "Subiendo la foto…" : datos.foto ? "Toca la foto para cambiarla" : "Toca para añadir tu foto (opcional)"}
          </Text>
          {datos.foto && !subiendoFoto ? (
            <Pressable onPress={() => cambiar("foto", "")} accessibilityRole="button" style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 12 }}>
              <Text style={{ color: P.muted, fontWeight: "800", textDecorationLine: "underline" }}>Quitar foto</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={{ flexDirection: "row", gap: 12 }}>
        {campoTexto("usuario", "Usuario", "Nombre de usuario")}
        {campoTexto("nombre", "Nombre", "Nombre")}
      </View>

      <View style={{ flexDirection: "row", gap: 12 }}>
        {campoSelector("pais", "País", "País", opcionesPais)}
        {esEspana || !datos.pais ? (
          campoSelector("provincia", "Provincia", "Provincia", opcionesProvincia)
        ) : (
          <CajaPerfil valido={!!datos.provincia.trim() && !errores.provincia} enfocado={enfocado === "provincia"} error={!!errores.provincia}>
            <TextInput
              value={datos.provincia}
              onChangeText={(t) => cambiar("provincia", t)}
              onFocus={() => setEnfocado("provincia")}
              onBlur={() => setEnfocado((e) => (e === "provincia" ? null : e))}
              placeholder="Región"
              placeholderTextColor={marcador}
              accessibilityLabel="Provincia o región"
              maxLength={60}
              autoCapitalize="words"
              style={[ESTILO_TEXTO_PERFIL, { paddingVertical: 10, ...sinOutline }]}
            />
          </CajaPerfil>
        )}
      </View>

      <View style={{ flexDirection: "row" }}>
        <CajaPerfil
          valido={!!datos.fecha && !errores.fecha}
          desplegable
          enfocado={enfocado === "fecha"}
          error={!!errores.fecha}
          encima={
            web ? (
              <input
                type="date"
                aria-label="Fecha de nacimiento"
                value={datos.fecha}
                min={FECHA_MINIMA}
                max={fechaMaximaPerfil()}
                onChange={(e) => cambiar("fecha", e.target.value)}
                onFocus={() => setEnfocado("fecha")}
                onBlur={() => setEnfocado((v) => (v === "fecha" ? null : v))}
                style={ESTILO_NATIVO_INVISIBLE}
              />
            ) : null
          }
        >
          <Text numberOfLines={1} style={[ESTILO_TEXTO_PERFIL, { paddingVertical: 10, color: datos.fecha ? P.text : marcador }]}>
            {datos.fecha ? fechaBonita(datos.fecha) : "Fecha de nacimiento"}
          </Text>
        </CajaPerfil>
      </View>

      <View style={{ flexDirection: "row" }}>
        <CajaPerfil valido={edad !== null && edad >= EDAD_MINIMA}>
          <Text accessibilityLabel="Edad" style={[ESTILO_TEXTO_PERFIL, { paddingVertical: 10, color: edad !== null ? P.text : marcador }]}>
            {edad !== null && edad >= 0 ? `${edad} Años` : "Edad"}
          </Text>
        </CajaPerfil>
      </View>

      {primerError ? (
        <Text style={{ color: P.danger, fontWeight: "800", textAlign: "center", lineHeight: 19 }}>{primerError}</Text>
      ) : aviso ? (
        <Text accessibilityRole="alert" style={{ color: aviso.tipo === "ok" ? P.ok : P.danger, fontWeight: "800", textAlign: "center", lineHeight: 19 }}>
          {aviso.texto}
        </Text>
      ) : pendientes.length ? (
        <Text style={{ color: P.muted, fontWeight: "800", textAlign: "center", lineHeight: 19 }}>Falta: {pendientes.join(", ")}.</Text>
      ) : null}

      <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <Pressable
          onPress={guardar}
          disabled={!puedeGuardar}
          accessibilityRole="button"
          accessibilityLabel={obligatorio ? "Guardar y continuar" : "Guardar perfil"}
          style={({ pressed }) => ({
            flex: 1,
            minHeight: 56,
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: P.accent,
            opacity: !puedeGuardar ? 0.5 : pressed ? 0.88 : 1,
          })}
        >
          <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 17 }}>
            {guardando ? "Guardando…" : obligatorio ? "Guardar y continuar" : "Guardar perfil"}
          </Text>
        </Pressable>
        {!obligatorio ? (
          <Pressable
            onPress={() => {
              setDatos(guardado);
              setAviso(null);
            }}
            disabled={!hayCambios || guardando}
            accessibilityRole="button"
            accessibilityLabel="Deshacer los cambios"
            style={({ pressed }) => ({
              minHeight: 56,
              paddingHorizontal: 22,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#FFFFFF",
              borderWidth: 1.5,
              borderColor: P.line,
              opacity: !hayCambios || guardando ? 0.5 : pressed ? 0.88 : 1,
            })}
          >
            <Text style={{ color: P.text, fontWeight: "900", fontSize: 16 }}>Deshacer</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  if (obligatorio) return <View nativeID="perfil-obligatorio-formulario" style={{ width: "100%", alignItems: "center" }}>{formulario}</View>;

  return (
    <View nativeID="perfil-datos" style={{ gap: 18, alignItems: "center" }}>
      {/* Cabecera plegable: foto pequeña, «Perfil público» y «@usuario · Completo». */}
      <Pressable
        nativeID="perfil-cabecera"
        onPress={() => setAbierto((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={abierto ? "Plegar el perfil público" : "Abrir el perfil público"}
        {...({ "aria-expanded": abierto } as object)}
        style={({ pressed }) => ({
          width: "100%",
          maxWidth: 460,
          minHeight: 76,
          borderRadius: 22,
          borderWidth: 1.5,
          borderColor: abierto ? P.accent : P.line,
          backgroundColor: "#FFFFFF",
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 12,
          gap: 10,
          opacity: pressed ? 0.9 : 1,
        })}
      >
        <Foto uri={guardado.foto} lado={48} alt="Foto de perfil" />
        <View style={{ flex: 1, minWidth: 0, alignItems: "center" }}>
          <Text style={{ color: P.text, fontWeight: "900", fontSize: 18, textAlign: "center" }}>Perfil público</Text>
          <Text numberOfLines={1} style={{ color: P.muted, fontWeight: "800", textAlign: "center", marginTop: 2 }}>
            {guardado.usuario ? `@${guardado.usuario}` : "Sin usuario"} · {guardadoCompleto ? "Completo" : "Faltan datos"}
          </Text>
        </View>
        <View style={{ width: 48, alignItems: "center" }}>
          <Ionicons name={abierto ? "chevron-up" : "chevron-down"} size={22} color={P.muted} />
        </View>
      </Pressable>
      {abierto ? formulario : null}
    </View>
  );
}

// --- «Completa tu perfil» (obligatorio) --------------------------------------------------------------------------

// Donde no se exige: Mi cuenta (allí está la tarjeta), las políticas (se leen antes de dar datos), cambiar la contraseña y
// el panel de administración (es trabajo de la tienda, no una cuenta de cliente).
const SIN_OBLIGACION = /^\/(perfil|politicas|reset-password|admin)(\/|$)/;

export function PerfilObligatorio() {
  const pathname = usePathname() ?? "";
  const insets = useSafeAreaInsets();
  const [uid, setUid] = useState<string | null>(null);
  const [incompleto, setIncompleto] = useState(false);
  const [revisar, setRevisar] = useState(0);

  useEffect(() => {
    let vivo = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (vivo) setUid(data.session?.user?.id ?? null);
      })
      .catch(() => {});
    const { data } = supabase.auth.onAuthStateChange((_evento, sesion) => setUid(sesion?.user?.id ?? null));
    return () => {
      vivo = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const f = () => setRevisar((n) => n + 1);
    oyentesGuardado.add(f);
    return () => {
      oyentesGuardado.delete(f);
    };
  }, []);

  // Una lectura al iniciar sesión (y otra al guardar el perfil en cualquier sitio), no en cada pantalla.
  useEffect(() => {
    if (!uid) {
      setIncompleto(false);
      return;
    }
    let vivo = true;
    leerPerfil(uid)
      .then((l) => {
        if (vivo) setIncompleto(l.disponible && !(l.datos && perfilCompleto(l.datos)));
      })
      .catch(() => {
        if (vivo) setIncompleto(false);
      });
    return () => {
      vivo = false;
    };
  }, [uid, revisar]);

  const visible = !!uid && incompleto && !SIN_OBLIGACION.test(pathname);
  useEffect(() => {
    fijarObligatorioVisible(visible);
    if (visible) trackEvent("perfil_obligatorio_visto", "Perfil: completar (obligatorio)");
  }, [visible]);
  useEffect(() => () => fijarObligatorioVisible(false), []);

  if (!visible || !uid) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
      <View nativeID="perfil-obligatorio" style={{ flex: 1, backgroundColor: P.fondo }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1, alignItems: "center", paddingHorizontal: 16, paddingTop: insets.top + 28, paddingBottom: insets.bottom + 32, gap: 14 }}
        >
          <Text accessibilityRole="header" {...({ "aria-level": 1 } as object)} style={{ color: P.text, fontWeight: "900", fontSize: 26, textAlign: "center" }}>
            Completa tu perfil
          </Text>
          <Text style={{ color: P.muted, fontWeight: "700", fontSize: 15, lineHeight: 21, textAlign: "center", maxWidth: 420 }}>
            Para usar tu cuenta necesitamos estos datos. La foto es opcional.
          </Text>
          <View style={{ width: "100%", maxWidth: 480, backgroundColor: "#FFFFFF", borderRadius: 24, paddingVertical: 18, paddingHorizontal: 14 }}>
            <PerfilPublico uid={uid} modo="obligatorio" alCompletar={() => setIncompleto(false)} />
          </View>
          <Pressable
            onPress={() => router.push("/politicas/privacidad" as Href)}
            accessibilityRole="link"
            style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 12 }}
          >
            <Text style={{ color: P.accent, fontWeight: "800", textAlign: "center" }}>Cómo tratamos tus datos</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              trackEvent("perfil_obligatorio_salir", "Perfil: cerrar sesión desde completar");
              supabase.auth.signOut().catch(() => {});
            }}
            accessibilityRole="button"
            style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 12 }}
          >
            <Text style={{ color: P.muted, fontWeight: "800", textAlign: "center", textDecorationLine: "underline" }}>Cerrar sesión</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}
