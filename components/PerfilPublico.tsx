// components/PerfilPublico.tsx
/**
 * Qué hace: «Mi perfil» del cliente (su perfil público: usuario y foto se ven en el Foro) y su obligación de completarlo.
 *
 * - PerfilPublico (Mi cuenta → app/(tabs)/perfil.tsx): tarjeta plegable con la foto pequeña, «Mi perfil» y
 *   «@usuario · Completo» (o «Faltan datos»); sale plegada si ya está completo y se pliega sola al guardarlo completo.
 *   Dentro: la foto grande («Toca la foto para cambiarla», opcional, con su recorte: RecortarFoto), usuario, nombre y
 *   apellidos (a lo ancho, para que se lean enteros), país y provincia o región, fecha de nacimiento y edad (se calcula;
 *   mínimo 14 años), «Guardar perfil» / «Deshacer» y, debajo, la cuenta (la sesión y «Cerrar sesión», que le pasa la
 *   pantalla en `cuenta`). Campos compactos, redondeados y centrados con ✓ verde cuando están bien; desplegables con ⌃⌄
 *   (los nativos del móvil, invisibles encima del campo).
 * - perfilesPublicos(ids): usuario y foto de varias personas para el Foro (función perfiles_publicos de la base de datos,
 *   que solo devuelve eso; si aún no existe, el Foro sigue como antes).
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
import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from "react-native";
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

// --- usuario y foto para el Foro ----------------------------------------------------------------------------------

export type PerfilForo = { usuario: string; foto: string };
// Lo ya pedido (null = esa persona no tiene usuario o no ha escrito en el Foro); se vuelve a pedir pasados 5 minutos.
const perfilesForo = new Map<string, { perfil: PerfilForo | null; hasta: number }>();
const VIGENCIA_PERFIL_FORO_MS = 5 * 60 * 1000;
let funcionForoDisponible = true;

// Usuario y foto de «Mi perfil» de quienes escriben en el Foro (función perfiles_publicos: solo esos dos datos y solo de
// quien ha escrito allí). Si la función aún no existe (migración sin aplicar), devuelve vacío y el Foro sigue como antes.
export async function perfilesPublicos(ids: string[]): Promise<Map<string, PerfilForo>> {
  const ahora = Date.now();
  const unicos = Array.from(new Set(ids.filter(Boolean)));
  const pedir = unicos.filter((id) => (perfilesForo.get(id)?.hasta ?? 0) <= ahora);
  for (let i = 0; funcionForoDisponible && i < pedir.length; i += 200) {
    const lote = pedir.slice(i, i + 200);
    const { data, error } = await supabase.rpc("perfiles_publicos", { ids: lote });
    if (error) {
      const codigo = String((error as { code?: unknown }).code ?? "");
      if (["PGRST202", "42883", "42501", "PGRST205"].includes(codigo)) funcionForoDisponible = false;
      break;
    }
    const hasta = Date.now() + VIGENCIA_PERFIL_FORO_MS;
    for (const id of lote) perfilesForo.set(id, { perfil: null, hasta });
    for (const fila of (Array.isArray(data) ? data : []) as { user_id?: unknown; usuario?: unknown; foto_url?: unknown }[]) {
      const usuario = textoDe(fila.usuario);
      if (typeof fila.user_id === "string" && usuario) perfilesForo.set(fila.user_id, { perfil: { usuario, foto: textoDe(fila.foto_url) }, hasta });
    }
  }
  const encontrados = new Map<string, PerfilForo>();
  for (const id of unicos) {
    const p = perfilesForo.get(id)?.perfil;
    if (p) encontrados.set(id, p);
  }
  return encontrados;
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
  ancho,
  sinHuecoDerecho,
  children,
}: {
  valido?: boolean;
  desplegable?: boolean;
  enfocado?: boolean;
  error?: boolean;
  encima?: React.ReactNode;
  /** Ancho fijo (la edad, junto a la fecha); sin él, ocupa lo que queda de la fila. */
  ancho?: number;
  /** Sin el hueco de las flechas (caja estrecha que no es desplegable). */
  sinHuecoDerecho?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        ...(ancho ? { width: ancho } : { flex: 1 }),
        minWidth: 0,
        minHeight: 48,
        borderRadius: 16,
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
      {sinHuecoDerecho && !desplegable ? null : (
        <View style={{ width: 22, alignItems: "center" }}>{desplegable ? <Ionicons name="chevron-expand" size={18} color={P.text} /> : null}</View>
      )}
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

const ESTILO_TEXTO_PERFIL = { textAlign: "center" as const, fontSize: 15.5, fontWeight: "800" as const, color: P.text };

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
  cuenta,
  onDisponible,
}: {
  uid: string;
  /** «tarjeta»: en Mi cuenta, plegable. «obligatorio»: dentro de «Completa tu perfil». */
  modo?: "tarjeta" | "obligatorio";
  alCompletar?: () => void;
  /** La cuenta (sesión y «Cerrar sesión»): va dentro de «Mi perfil», debajo de los datos. */
  cuenta?: React.ReactNode;
  /** Dice si «Mi perfil» se puede enseñar (si la tabla aún no existe, la pantalla enseña la cuenta por su cuenta). */
  onDisponible?: (disponible: boolean) => void;
}) {
  const obligatorio = modo === "obligatorio";
  const [estado, setEstado] = useState<"cargando" | "no-disponible" | "listo">("cargando");
  const [recorte, setRecorte] = useState<string | null>(null); // foto elegida, a la espera de recortarla
  useEffect(() => {
    if (estado !== "cargando") onDisponible?.(estado === "listo");
  }, [estado, onDisponible]);
  const [conFoto, setConFoto] = useState(true);
  const [datos, setDatos] = useState<DatosPerfil>(DATOS_VACIOS);
  const [guardado, setGuardado] = useState<DatosPerfil>(DATOS_VACIOS);
  const [guardando, setGuardando] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [enfocado, setEnfocado] = useState<keyof DatosPerfil | null>(null);
  const [abierto, setAbierto] = useState(true);
  // Fecha y edad en la misma fila a partir de este ancho de pantalla (más estrecha, la fecha no se leería entera).
  const fechaYEdadJuntas = useWindowDimensions().width >= 370;

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

  // Foto: se elige, se recorta (RecortarFoto: encuadre cuadrado de 320 px en JPEG) y se sube a la carpeta del cliente; se
  // guarda con «Guardar perfil».
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
    const foto = elegidas.items.find((it) => it.kind === "image");
    for (const it of elegidas.items) {
      if (it === foto) continue;
      try {
        URL.revokeObjectURL(it.previewUrl);
      } catch {
        // nada
      }
    }
    if (!foto) {
      if (elegidas.skipped.length) setAviso({ tipo: "error", texto: "Esa foto no se puede usar. Prueba con una JPG o PNG." });
      return;
    }
    // En la web se recorta antes de subirla; fuera de la web, se reduce tal cual.
    if (Platform.OS === "web") {
      setRecorte(foto.previewUrl);
      return;
    }
    await subirFoto(await reducirImagenWeb(foto.file, LADO_FOTO, 0.85, true));
  };

  const subirFoto = async (archivo: File) => {
    setSubiendoFoto(true);
    try {
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
      perfilesForo.delete(uid); // el Foro vuelve a pedir su usuario y su foto
      setAviso({ tipo: "ok", texto: "Perfil guardado." });
      trackEvent("perfil_guardado", "Perfil: guardado");
      avisarPerfilGuardado();
      if (perfilCompleto(limpio)) {
        alCompletar?.();
        // Guardado completo: en Mi cuenta el desplegable se cierra solo (si falta algo, se queda abierto para verlo).
        if (!obligatorio) setAbierto(false);
      }
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
        style={[ESTILO_TEXTO_PERFIL, { paddingVertical: 7, ...sinOutline }]}
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
      <Text numberOfLines={1} style={[ESTILO_TEXTO_PERFIL, { paddingVertical: 7, color: datos[campo] ? P.text : marcador }]}>
        {datos[campo] || placeholder}
      </Text>
    </CajaPerfil>
  );

  const cajaEdad =
    edad !== null && edad >= 0 ? (
      <CajaPerfil valido={edad >= EDAD_MINIMA} ancho={fechaYEdadJuntas ? 112 : undefined} sinHuecoDerecho={fechaYEdadJuntas}>
        <Text accessibilityLabel="Edad" numberOfLines={1} style={[ESTILO_TEXTO_PERFIL, { paddingVertical: 7 }]}>
          {`${edad} Años`}
        </Text>
      </CajaPerfil>
    ) : null;

  const formulario = (
    <View style={{ width: "100%", maxWidth: 460, gap: 10 }}>
      {conFoto ? (
        <View style={{ alignItems: "center", gap: 6, paddingBottom: 2 }}>
          <Pressable
            nativeID="perfil-foto"
            onPress={elegirFoto}
            disabled={subiendoFoto}
            accessibilityRole="button"
            accessibilityLabel={datos.foto ? "Cambiar la foto de perfil" : "Añadir una foto de perfil"}
            style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, position: "relative" })}
          >
            <Foto uri={datos.foto} lado={104} alt="Tu foto de perfil" />
            <View
              style={{
                position: "absolute",
                right: 0,
                bottom: 0,
                width: 34,
                height: 34,
                borderRadius: 17,
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
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", minHeight: datos.foto ? 44 : 0 }}>
            <Text style={{ color: P.muted, fontWeight: "800", fontSize: 13.5, textAlign: "center" }}>
              {subiendoFoto ? "Subiendo la foto…" : datos.foto ? "Toca la foto para cambiarla" : "Toca para añadir tu foto (opcional)"}
            </Text>
            {datos.foto && !subiendoFoto ? (
              <Pressable onPress={() => cambiar("foto", "")} accessibilityRole="button" style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 8 }}>
                <Text style={{ color: P.muted, fontWeight: "800", fontSize: 13.5, textDecorationLine: "underline" }}>Quitar foto</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* Usuario y nombre a lo ancho: así el nombre y los apellidos se leen enteros. */}
      <View style={{ flexDirection: "row" }}>{campoTexto("usuario", "Usuario", "Nombre de usuario")}</View>
      <View style={{ flexDirection: "row" }}>{campoTexto("nombre", "Nombre y apellidos", "Nombre")}</View>

      <View style={{ flexDirection: "row", gap: 10 }}>
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
              style={[ESTILO_TEXTO_PERFIL, { paddingVertical: 7, ...sinOutline }]}
            />
          </CajaPerfil>
        )}
      </View>

      {/* La edad sale al elegir la fecha: a su lado si cabe; en pantallas estrechas, debajo. */}
      <View style={{ flexDirection: "row", gap: 10 }}>
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
          <Text numberOfLines={1} style={[ESTILO_TEXTO_PERFIL, { paddingVertical: 7, color: datos.fecha ? P.text : marcador }]}>
            {datos.fecha ? fechaBonita(datos.fecha) : "Fecha de nacimiento"}
          </Text>
        </CajaPerfil>
        {fechaYEdadJuntas ? cajaEdad : null}
      </View>
      {!fechaYEdadJuntas && cajaEdad ? <View style={{ flexDirection: "row" }}>{cajaEdad}</View> : null}

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
            minHeight: 48,
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: P.accent,
            opacity: !puedeGuardar ? 0.5 : pressed ? 0.88 : 1,
          })}
        >
          <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 16 }}>
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
              minHeight: 48,
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

  const ventanaRecorte = recorte ? (
    <RecortarFoto
      uri={recorte}
      onCancelar={() => {
        revocar(recorte);
        setRecorte(null);
        // Analítica propia (Administración → Usuarios): cuántos encuadran su foto y cuántos lo dejan.
        trackEvent("perfil_foto_cancelada", "Perfil: recorte de foto cancelado");
      }}
      onListo={(archivo) => {
        revocar(recorte);
        setRecorte(null);
        trackEvent("perfil_foto_encuadrada", "Perfil: foto encuadrada");
        void subirFoto(archivo);
      }}
    />
  ) : null;

  if (obligatorio) {
    return (
      <View nativeID="perfil-obligatorio-formulario" style={{ width: "100%", alignItems: "center" }}>
        {formulario}
        {ventanaRecorte}
      </View>
    );
  }

  return (
    <View nativeID="perfil-datos" style={{ gap: 14, alignItems: "center" }}>
      {/* Cabecera plegable: foto pequeña, «Mi perfil» y «@usuario · Completo». */}
      <Pressable
        nativeID="perfil-cabecera"
        onPress={() => setAbierto((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={abierto ? "Plegar mi perfil" : "Abrir mi perfil"}
        {...({ "aria-expanded": abierto } as object)}
        style={({ pressed }) => ({
          width: "100%",
          maxWidth: 460,
          minHeight: 62,
          borderRadius: 20,
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
        <Foto uri={guardado.foto} lado={40} alt="Foto de perfil" />
        <View style={{ flex: 1, minWidth: 0, alignItems: "center" }}>
          <Text style={{ color: P.text, fontWeight: "900", fontSize: 17, textAlign: "center" }}>Mi perfil</Text>
          <Text numberOfLines={1} style={{ color: P.muted, fontWeight: "800", fontSize: 13.5, textAlign: "center", marginTop: 1 }}>
            {guardado.usuario ? `@${guardado.usuario}` : "Sin usuario"} · {guardadoCompleto ? "Completo" : "Faltan datos"}
          </Text>
        </View>
        <View style={{ width: 40, alignItems: "center" }}>
          <Ionicons name={abierto ? "chevron-up" : "chevron-down"} size={20} color={P.muted} />
        </View>
      </Pressable>
      {/* Recién guardado y ya plegado: se dice aquí (dentro ya no se ve). */}
      {!abierto && aviso?.tipo === "ok" ? (
        <Text accessibilityRole="alert" style={{ color: P.ok, fontWeight: "800", textAlign: "center" }}>
          {aviso.texto}
        </Text>
      ) : null}
      {abierto ? (
        <>
          {formulario}
          {cuenta ? (
            <View style={{ width: "100%", maxWidth: 460, borderTopWidth: 1, borderTopColor: P.line, paddingTop: 14 }}>{cuenta}</View>
          ) : null}
        </>
      ) : null}
      {ventanaRecorte}
    </View>
  );
}

function revocar(url: string) {
  try {
    URL.revokeObjectURL(url);
  } catch {
    // nada
  }
}

// --- recortar la foto (web) ---------------------------------------------------------------------------------------

// La foto que se guarda: 320 × 320 px en JPEG (nítida en la foto grande de «Mi perfil» y ligera para el Foro, que enseña
// muchas a la vez).
const LADO_FOTO = 320;
const ZOOM_MAX = 4;

// La persona encuadra su foto: la arrastra para moverla y la acerca o aleja (− / + o la barra). El círculo marca lo que
// se verá en el Foro y en su perfil; se guarda el cuadrado entero (LADO_FOTO px, JPEG, fondo blanco si la foto tiene huecos).
function RecortarFoto({ uri, onCancelar, onListo }: { uri: string; onCancelar: () => void; onListo: (archivo: File) => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [fallo, setFallo] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [desplazamiento, setDesplazamiento] = useState({ x: 0, y: 0 }); // en px de la vista, desde el centro
  const [lado, setLado] = useState(280); // lado de la vista cuadrada en pantalla
  const [preparando, setPreparando] = useState(false);
  const arrastre = useRef<{ id: number; x: number; y: number; dx: number; dy: number } | null>(null);

  useEffect(() => {
    const i = new window.Image();
    i.onload = () => setImg(i);
    i.onerror = () => setFallo(true);
    i.src = uri;
  }, [uri]);

  // Tamaño de la foto en la vista: a zoom 1 la cubre entera (el lado corto mide lo que la vista).
  const base = img ? lado / Math.min(img.naturalWidth || 1, img.naturalHeight || 1) : 1;
  const ancho = img ? img.naturalWidth * base * zoom : lado;
  const alto = img ? img.naturalHeight * base * zoom : lado;
  // Sin dejar huecos: la foto siempre cubre el cuadrado.
  const limitar = useCallback(
    (d: { x: number; y: number }, z: number) => {
      if (!img) return { x: 0, y: 0 };
      const w = img.naturalWidth * base * z;
      const h = img.naturalHeight * base * z;
      const mx = Math.max(0, (w - lado) / 2);
      const my = Math.max(0, (h - lado) / 2);
      return { x: Math.min(mx, Math.max(-mx, d.x)), y: Math.min(my, Math.max(-my, d.y)) };
    },
    [img, base, lado]
  );
  const cambiarZoom = (z: number) => {
    const nuevo = Math.min(ZOOM_MAX, Math.max(1, Math.round(z * 100) / 100));
    setZoom(nuevo);
    setDesplazamiento((d) => limitar({ x: (d.x * nuevo) / zoom, y: (d.y * nuevo) / zoom }, nuevo));
  };

  const usar = async () => {
    if (!img || preparando) return;
    setPreparando(true);
    try {
      const lienzo = document.createElement("canvas");
      lienzo.width = LADO_FOTO;
      lienzo.height = LADO_FOTO;
      const ctx = lienzo.getContext("2d");
      if (!ctx) throw new Error("sin lienzo");
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, LADO_FOTO, LADO_FOTO);
      ctx.imageSmoothingQuality = "high";
      const escala = LADO_FOTO / lado;
      const x = (lado - ancho) / 2 + desplazamiento.x;
      const y = (lado - alto) / 2 + desplazamiento.y;
      ctx.drawImage(img, x * escala, y * escala, ancho * escala, alto * escala);
      const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, "image/jpeg", 0.88));
      if (!blob) throw new Error("sin foto");
      onListo(new File([blob], "perfil.jpg", { type: "image/jpeg" }));
    } catch {
      setFallo(true);
      setPreparando(false);
    }
  };

  const vista = (
    <div
      onPointerDown={(e) => {
        if (!img) return;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        arrastre.current = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: desplazamiento.x, dy: desplazamiento.y };
      }}
      onPointerMove={(e) => {
        const a = arrastre.current;
        if (!a || a.id !== e.pointerId) return;
        setDesplazamiento(limitar({ x: a.dx + e.clientX - a.x, y: a.dy + e.clientY - a.y }, zoom));
      }}
      onPointerUp={() => {
        arrastre.current = null;
      }}
      onPointerCancel={() => {
        arrastre.current = null;
      }}
      onWheel={(e) => cambiarZoom(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08))}
      aria-label="Arrastra la foto para encuadrarla"
      style={{
        position: "relative",
        width: lado,
        height: lado,
        overflow: "hidden",
        borderRadius: 18,
        background: "#0B2138",
        touchAction: "none",
        cursor: img ? "grab" : "default",
        userSelect: "none",
      }}
    >
      {img ? (
        <img
          src={uri}
          alt=""
          draggable={false}
          style={{
            position: "absolute",
            left: (lado - ancho) / 2 + desplazamiento.x,
            top: (lado - alto) / 2 + desplazamiento.y,
            width: ancho,
            height: alto,
            maxWidth: "none",
            pointerEvents: "none",
          }}
        />
      ) : null}
      {/* Fuera del círculo, oscurecido: lo de dentro es lo que se verá. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          boxShadow: "0 0 0 999px rgba(11,33,56,0.55)",
          border: "2px solid rgba(255,255,255,0.9)",
          pointerEvents: "none",
        }}
      />
    </div>
  );

  const botonZoom = (icono: "remove" | "add", etiqueta: string, z: number) => (
    <Pressable
      onPress={() => cambiarZoom(z)}
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        borderWidth: 1.5,
        borderColor: P.line,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#FFFFFF",
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Ionicons name={icono} size={22} color={P.text} />
    </Pressable>
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancelar}>
      <View
        nativeID="perfil-recorte"
        style={{ flex: 1, backgroundColor: "rgba(11,33,56,0.55)", alignItems: "center", justifyContent: "center", padding: 16 }}
      >
        <View
          onLayout={(e) => {
            const nuevo = Math.max(200, Math.min(320, Math.floor(e.nativeEvent.layout.width - 32)));
            if (nuevo === lado) return;
            setLado(nuevo);
            setDesplazamiento({ x: 0, y: 0 });
          }}
          style={{ width: "100%", maxWidth: 380, backgroundColor: "#FFFFFF", borderRadius: 24, padding: 16, gap: 12, alignItems: "center" }}
        >
          <Text accessibilityRole="header" style={{ color: P.text, fontWeight: "900", fontSize: 18, textAlign: "center" }}>
            Encuadra tu foto
          </Text>
          <Text style={{ color: P.muted, fontWeight: "700", textAlign: "center", lineHeight: 19 }}>
            Arrástrala para moverla y acércala o aléjala. Se verá lo que queda dentro del círculo.
          </Text>
          {fallo ? (
            <Text accessibilityRole="alert" style={{ color: P.danger, fontWeight: "800", textAlign: "center" }}>
              No se ha podido preparar esta foto. Prueba con otra.
            </Text>
          ) : img ? (
            vista
          ) : (
            <View style={{ width: lado, height: lado, alignItems: "center", justifyContent: "center" }}>
              <ActivityIndicator color={P.accent} />
            </View>
          )}
          {!fallo ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, alignSelf: "stretch" }}>
              {botonZoom("remove", "Alejar", zoom / 1.25)}
              <View style={{ flex: 1, minWidth: 0 }}>
                <input
                  type="range"
                  aria-label="Acercar o alejar"
                  min={1}
                  max={ZOOM_MAX}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => cambiarZoom(Number(e.target.value))}
                  style={{ width: "100%", accentColor: P.accent, cursor: "pointer" }}
                />
              </View>
              {botonZoom("add", "Acercar", zoom * 1.25)}
            </View>
          ) : null}
          <View style={{ flexDirection: "row", gap: 10, alignSelf: "stretch" }}>
            <Pressable
              onPress={onCancelar}
              accessibilityRole="button"
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 46,
                borderRadius: 999,
                borderWidth: 1.5,
                borderColor: P.line,
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ color: P.text, fontWeight: "900", fontSize: 15.5 }}>Cancelar</Text>
            </Pressable>
            <Pressable
              onPress={usar}
              disabled={!img || fallo || preparando}
              accessibilityRole="button"
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 46,
                borderRadius: 999,
                backgroundColor: P.accent,
                alignItems: "center",
                justifyContent: "center",
                opacity: !img || fallo || preparando ? 0.5 : pressed ? 0.88 : 1,
              })}
            >
              <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 15.5 }}>{preparando ? "Preparando…" : "Usar foto"}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
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
