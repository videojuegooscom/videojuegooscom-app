/**
 * Archivo: components/foro/PiezasForo.tsx
 * Función: piezas comunes del Foro (pantalla app/(tabs)/chat-global.tsx) y de sus Noticias: colores, moderación (quién es
 *          administrador, silenciar, confirmar eliminar), normas, claves guardadas, avatar y ayudas de tablas y preferencias.
 * Para qué sirve: que el Foro y sus Noticias (components/foro/NoticiasForo.tsx) usen las mismas piezas sin copiarlas. Se
 *          separó de app/(tabs)/chat-global.tsx en la tanda 6 de «ordenar el proyecto» (2026-11-17), sin cambiar nada.
 * Conectado con: lib/supabase.ts (profiles, foro_silencios, preferencias_usuario), lib/analiticaPropia.ts,
 *          constants/temaTienda.ts, components/ImagenInteligente.tsx.
 * Utilizado por: app/(tabs)/chat-global.tsx y components/foro/NoticiasForo.tsx.
 * Dependencias: react, react-native, expo-router, @expo/vector-icons, @react-native-async-storage/async-storage.
 * Estado: ACTIVO
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";
import ImagenInteligente from "../ImagenInteligente";
import { CAMPO, COLORES_TEXTO } from "../../constants/temaTienda";
import { medirEvento } from "../../lib/analiticaPropia";
import { supabase } from "../../lib/supabase";

// --- Moderación: los administradores pueden eliminar mensajes del Foro y comentarios de noticias ------------------
// (la base de datos solo se lo deja a ellos: política chat_messages_delete_admin y noticias_comentarios_admin_update).

// ¿La sesión es de un administrador? (profiles.role; se pregunta una vez por cuenta).
const rolesAdminForo = new Map<string, Promise<boolean>>();
export function useEsAdminForo(): boolean {
  const [esAdmin, setEsAdmin] = useState(false);
  useEffect(() => {
    let vivo = true;
    const mirar = (uid: string | null) => {
      if (!uid) {
        setEsAdmin(false);
        return;
      }
      let pregunta = rolesAdminForo.get(uid);
      if (!pregunta) {
        pregunta = Promise.resolve(
          supabase
            .from("profiles")
            .select("role")
            .eq("id", uid)
            .maybeSingle<{ role: string | null }>()
        ).then(
          ({ data, error }) => {
            if (error) rolesAdminForo.delete(uid); // se vuelve a preguntar la próxima vez
            return String(data?.role ?? "").trim().toLowerCase() === "admin";
          },
          () => {
            rolesAdminForo.delete(uid);
            return false;
          }
        );
        rolesAdminForo.set(uid, pregunta);
      }
      pregunta.then((v) => {
        if (vivo) setEsAdmin(v);
      });
    };
    supabase.auth
      .getSession()
      .then(({ data }) => mirar(data.session?.user?.id ?? null))
      .catch(() => {});
    const { data } = supabase.auth.onAuthStateChange((_evento, sesion) => mirar(sesion?.user?.id ?? null));
    return () => {
      vivo = false;
      data.subscription.unsubscribe();
    };
  }, []);
  return esAdmin;
}

// --- Silenciar usuario (administradores) ---------------------------------------------------------------------------
// Tabla foro_silencios (supabase/migrations/20261031110000_foro_silencios_y_moderacion.sql): hasta cuándo una persona no
// puede escribir en el Foro ni comentar noticias. Lo hace cumplir la base de datos; aquí solo se elige y se avisa.

const DIAS_SILENCIO = [1, 3, 7] as const;

function fechaHoraCorta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).replace(/\./g, "");
}

// Lo que ve la persona silenciada junto al cuadro de escribir.
export function textoSilencio(hasta: string): string {
  return `Un administrador te ha silenciado en el Foro hasta el ${fechaHoraCorta(hasta)}: hasta entonces no puedes escribir ni comentar noticias.`;
}

// Junto al aviso de silencio, el enlace a las Normas del Foro (app/politicas/[slug].tsx, «normas-foro»; se editan en
// Administración → Políticas): así la persona sabe por qué. Administración → Usuarios cuenta quién las abre.
export function EnlaceNormasForo({ desde }: { desde: "foro" | "comentarios" }) {
  return (
    <Pressable
      onPress={() => {
        medirEvento("foro_normas_abiertas", "Foro: normas abiertas", { metadata: { desde } });
        router.push("/politicas/normas-foro" as Href);
      }}
      accessibilityRole="link"
      accessibilityLabel="Leer las normas del Foro"
      style={({ pressed }) => ({
        minHeight: 44,
        alignSelf: "center",
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 12,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Ionicons name="document-text-outline" size={17} color={COLORS.accent} />
      <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 13.5, textDecorationLine: "underline", textAlign: "center" }}>
        Leer las normas del Foro
      </Text>
    </Pressable>
  );
}

// ¿Existe ya la tabla de silencios? (si la migración aún no está aplicada, no se ofrece «Silenciar»)
export function faltaTablaSilencios(error: unknown): boolean {
  const code = String((error as { code?: unknown } | null)?.code ?? "");
  return code === "PGRST205" || code === "42P01" || /foro_silencios/.test(String((error as { message?: unknown } | null)?.message ?? ""));
}

export function SilenciarUsuario({
  usuario,
  userId,
  onCerrar,
}: {
  usuario: string;
  userId: string;
  onCerrar: () => void;
}) {
  const [dias, setDias] = useState<(typeof DIAS_SILENCIO)[number]>(3);
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [hecho, setHecho] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const silenciar = async () => {
    if (guardando) return;
    setGuardando(true);
    setError(null);
    const hasta = new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toISOString();
    const { data, error: fallo } = await supabase
      .from("foro_silencios")
      .upsert({ user_id: userId, hasta, motivo: motivo.trim() || null }, { onConflict: "user_id" })
      .select("user_id");
    setGuardando(false);
    if (fallo || !Array.isArray(data) || data.length === 0) {
      console.error("Error silenciando en el Foro:", fallo);
      setError(
        faltaTablaSilencios(fallo)
          ? "Falta preparar la base de datos para silenciar (el SQL que pega el dueño)."
          : "No se ha podido silenciar. Inténtalo de nuevo."
      );
      return;
    }
    setHecho(`${usuario} no podrá escribir en el Foro ni comentar noticias hasta el ${fechaHoraCorta(hasta)}.`);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCerrar}>
      <View
        nativeID="foro-silenciar"
        style={{ flex: 1, backgroundColor: "rgba(11,33,56,0.55)", alignItems: "center", justifyContent: "center", padding: 16 }}
      >
        <View style={{ width: "100%", maxWidth: 380, backgroundColor: "#FFFFFF", borderRadius: 24, padding: 18, gap: 12, alignItems: "center" }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(30,167,232,0.12)", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="volume-mute-outline" size={24} color="#1EA7E8" />
          </View>
          <Text accessibilityRole="header" {...({ "aria-level": 2 } as object)} style={{ color: "#0B2138", fontWeight: "900", fontSize: 18, textAlign: "center" }}>
            Silenciar a {usuario}
          </Text>
          {hecho ? (
            <Text accessibilityRole="alert" style={{ color: "#15803D", fontWeight: "800", lineHeight: 20, textAlign: "center" }}>
              {hecho}
            </Text>
          ) : (
            <>
              <Text style={{ color: COLORS.muted, fontWeight: "700", lineHeight: 20, textAlign: "center" }}>
                No podrá escribir en el Foro ni comentar noticias, y verá un enlace a las Normas del Foro. Sus mensajes siguen ahí
                (elimínalos aparte si hace falta).
              </Text>
              <View style={{ flexDirection: "row", gap: 8, alignSelf: "stretch" }}>
                {DIAS_SILENCIO.map((d) => {
                  const activo = dias === d;
                  return (
                    <Pressable
                      key={d}
                      onPress={() => setDias(d)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: activo }}
                      style={({ pressed }) => ({
                        flex: 1,
                        minHeight: 44,
                        borderRadius: 999,
                        borderWidth: 1.5,
                        borderColor: activo ? "#1EA7E8" : "#E3EAF2",
                        backgroundColor: activo ? "#EAF6FD" : "#FFFFFF",
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: pressed ? 0.85 : 1,
                      })}
                    >
                      <Text style={{ color: activo ? COLORS.accentText : "#0B2138", fontWeight: "900" }}>{d === 1 ? "1 día" : `${d} días`}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <TextInput
                value={motivo}
                onChangeText={(t) => setMotivo(t.slice(0, 200))}
                placeholder="Motivo (opcional, solo lo ve la tienda)"
                placeholderTextColor="rgba(11,33,56,0.40)"
                accessibilityLabel="Motivo del silencio"
                maxLength={200}
                style={{
                  alignSelf: "stretch",
                  minHeight: CAMPO.alto,
                  borderWidth: 1,
                  borderColor: "#E3EAF2",
                  borderRadius: 14,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  fontSize: CAMPO.letra,
                  color: "#0B2138",
                }}
              />
            </>
          )}
          {error ? (
            <Text accessibilityRole="alert" style={{ color: "#DC2626", fontWeight: "800", textAlign: "center" }}>
              {error}
            </Text>
          ) : null}
          <View style={{ flexDirection: "row", gap: 10, alignSelf: "stretch" }}>
            <Pressable
              onPress={onCerrar}
              disabled={guardando}
              accessibilityRole="button"
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 46,
                borderRadius: 999,
                borderWidth: 1.5,
                borderColor: "#E3EAF2",
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ color: "#0B2138", fontWeight: "900", fontSize: 15.5 }}>{hecho ? "Cerrar" : "Cancelar"}</Text>
            </Pressable>
            {hecho ? null : (
              <Pressable
                onPress={silenciar}
                disabled={guardando}
                accessibilityRole="button"
                style={({ pressed }) => ({
                  flex: 1,
                  minHeight: 46,
                  borderRadius: 999,
                  backgroundColor: "#1EA7E8",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: guardando ? 0.6 : pressed ? 0.88 : 1,
                })}
              >
                <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 15.5 }}>{guardando ? "Silenciando…" : "Silenciar"}</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

// «¿Eliminar…?»: confirma antes de borrar (no se puede deshacer) y enseña qué se va a borrar.
export function ConfirmarEliminar({
  que,
  autor,
  texto,
  eliminando,
  error,
  onCancelar,
  onConfirmar,
}: {
  que: "mensaje" | "comentario";
  autor: string;
  texto: string;
  eliminando: boolean;
  error: string | null;
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancelar}>
      <View
        nativeID="foro-confirmar-eliminar"
        style={{ flex: 1, backgroundColor: "rgba(11,33,56,0.55)", alignItems: "center", justifyContent: "center", padding: 16 }}
      >
        <View style={{ width: "100%", maxWidth: 380, backgroundColor: "#FFFFFF", borderRadius: 24, padding: 18, gap: 12, alignItems: "center" }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(220,38,38,0.10)", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="trash-outline" size={24} color="#DC2626" />
          </View>
          <Text accessibilityRole="header" {...({ "aria-level": 2 } as object)} style={{ color: "#0B2138", fontWeight: "900", fontSize: 18, textAlign: "center" }}>
            {que === "mensaje" ? "¿Eliminar este mensaje?" : "¿Eliminar este comentario?"}
          </Text>
          <View style={{ alignSelf: "stretch", backgroundColor: "#F1F6FA", borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, gap: 2 }}>
            <Text numberOfLines={1} style={{ color: "#0B2138", fontWeight: "900", textAlign: "center" }}>
              {autor}
            </Text>
            <Text numberOfLines={3} style={{ color: COLORS.muted, lineHeight: 20, textAlign: "center" }}>
              {texto}
            </Text>
          </View>
          <Text style={{ color: COLORS.muted, fontWeight: "700", lineHeight: 20, textAlign: "center" }}>
            {que === "mensaje"
              ? "Desaparece del Foro para todos, con sus reacciones. No se puede deshacer."
              : "Desaparece de la noticia para todos."}
          </Text>
          {error ? (
            <Text accessibilityRole="alert" style={{ color: "#DC2626", fontWeight: "800", textAlign: "center" }}>
              {error}
            </Text>
          ) : null}
          <View style={{ flexDirection: "row", gap: 10, alignSelf: "stretch" }}>
            <Pressable
              onPress={onCancelar}
              disabled={eliminando}
              accessibilityRole="button"
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 46,
                borderRadius: 999,
                borderWidth: 1.5,
                borderColor: "#E3EAF2",
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ color: "#0B2138", fontWeight: "900", fontSize: 15.5 }}>Cancelar</Text>
            </Pressable>
            <Pressable
              onPress={onConfirmar}
              disabled={eliminando}
              accessibilityRole="button"
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 46,
                borderRadius: 999,
                backgroundColor: "#DC2626",
                alignItems: "center",
                justifyContent: "center",
                opacity: eliminando ? 0.6 : pressed ? 0.88 : 1,
              })}
            >
              <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 15.5 }}>{eliminando ? "Eliminando…" : "Eliminar"}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export const COLORS = {
  bg: "#FFFFFF",
  bg3: "#F6FAFD",
  card: "#EAF6FD",
  border: "#E3EAF2",
  borderSoft: "#E3EAF2",
  text: COLORES_TEXTO.texto,
  // Grises de texto: el más claro permitido (constants/temaTienda.ts → COLORES_TEXTO.secundario).
  muted: COLORES_TEXTO.secundario,
  soft: COLORES_TEXTO.secundario,
  accent: "#1EA7E8",
  // Texto azul de menos de 17 px (categorías, enlaces, contadores): azul oscuro legible.
  accentText: COLORES_TEXTO.azulTexto,
  accentSoft: "#EAF6FD",
  accentBorder: "#BEE6FA",
  bubbleMine: "rgba(0,170,228,0.22)",
  bubbleOther: "#F1F6FA",
  overlay: "rgba(3,10,18,0.76)",
};

export function isMissingRelationError(error: unknown, relationName: string) {
  const msg = String((error as { message?: string } | null)?.message ?? "").toLowerCase();
  const rel = relationName.toLowerCase();

  return (
    msg.includes(rel) &&
    (msg.includes("does not exist") ||
      msg.includes("relation") ||
      msg.includes("could not find the table"))
  );
}

// Marca de "ya lo he visto" para la pestaña Nuestras Novedades: mismo
// número que NOVEDADES_CONTENT_VERSION en components/AsistenteBlue.tsx. Cuando
// el contenido de esta pestaña cambie de verdad, se sube el número ahí Y
// aquí — así la campanita vuelve a avisar una vez a cada dispositivo que no
// haya vuelto a entrar desde entonces.
export const NOVEDADES_SEEN_KEY = "videojuegoszaragoza:novedades_seen_version";
export const NOVEDADES_CONTENT_VERSION = 1;

// Claves del dispositivo que también lee Blue para contar noticias nuevas.
export const NOTICIAS_AVISOS_KEY = "videojuegoszaragoza:noticias_avisos";
export const NOTICIAS_VISTAS_KEY = "videojuegoszaragoza:noticias_vistas_hasta";

// Marca que deja «Compartir en el Foro» dentro del mensaje: [noticia:<uuid>].
const MARCA_NOTICIA_RE =
  /\[noticia:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/i;

export function idNoticiaDeTexto(texto: string): string | null {
  const m = MARCA_NOTICIA_RE.exec(texto ?? "");
  return m ? m[1].toLowerCase() : null;
}

// Texto del mensaje sin la marca (para citas y respuestas).
export function textoSinMarca(texto: string): string {
  return (texto ?? "").replace(new RegExp(MARCA_NOTICIA_RE.source, "gi"), "").trim();
}

// Tabla aún no creada (migración pendiente): la función se oculta sin errores.
export function faltaTabla(error: unknown, tabla: string) {
  const code = String((error as { code?: string } | null)?.code ?? "");
  return code === "PGRST205" || code === "42P01" || isMissingRelationError(error, tabla);
}

// Se pone a false en cuanto se detecta que la tabla preferencias_usuario no existe. Va en un objeto (tanda 6): la cambian
// el Foro (app/(tabs)/chat-global.tsx) y guardarPreferencias, y una variable importada no se puede reasignar.
export const tablaPreferencias = { disponible: true };

// Mismo nombre visible que pone el trigger de chat_messages en el Foro:
// full_name → username → parte del email antes de la @.
export function nombreVisibleForo(
  user: { email?: string | null; user_metadata?: Record<string, any> } | null | undefined
) {
  const meta = user?.user_metadata ?? {};
  const completo = typeof meta.full_name === "string" ? meta.full_name.trim() : "";
  const usuario = typeof meta.username === "string" ? meta.username.trim() : "";
  const correo = (user?.email ?? "").split("@")[0] ?? "";
  return (completo || usuario || correo || "usuario").slice(0, 60);
}

export async function leerAvisosDispositivo(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(NOTICIAS_AVISOS_KEY)) === "1";
  } catch {
    return false;
  }
}

// Guarda (upsert) mi fila de preferencias_usuario. Devuelve si se guardó.
export async function guardarPreferencias(userId: string, cambios: Record<string, unknown>) {
  if (!tablaPreferencias.disponible) return false;
  const { error } = await supabase
    .from("preferencias_usuario")
    .upsert(
      { user_id: userId, ...cambios, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
  if (error) {
    if (faltaTabla(error, "preferencias_usuario")) tablaPreferencias.disponible = false;
    return false;
  }
  return true;
}

export function AvatarCircle({
  username,
  foto,
  size = 42,
}: {
  username: string;
  foto?: string;
  size?: number;
}) {
  if (foto) {
    return (
      <View style={{ width: size, height: size, borderRadius: 999, overflow: "hidden", borderWidth: 1, borderColor: "#E3EAF2", backgroundColor: "#F1F6FA" }}>
        <ImagenInteligente uri={foto} alt={`Foto de ${username}`} contentFit="cover" style={{ width: "100%", height: "100%" }} />
      </View>
    );
  }
  const palette = [
    "rgba(0,170,228,0.20)",
    "rgba(34,197,94,0.18)",
    "rgba(216,176,74,0.18)",
    "#E3EAF2",
  ];
  const index = username.length % palette.length;
  const bg = palette[index];

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: "#E3EAF2",
      }}
    >
      <Text style={{ color: COLORS.text, fontWeight: "900" }}>
        {username.slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}
