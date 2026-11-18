/**
 * Archivo: components/admin/servicios/VideosServicios.tsx
 * Función: editor de los vídeos de la página Servicios (Administración → Servicios): añadir, quitar y ordenar los enlaces
 *          de vídeo que ve el cliente.
 * Para qué sirve: lo que antes estaba dentro de app/admin/services.tsx (EditorVideosServicios). Se separó en la tanda 6
 *          de «ordenar el proyecto» (2026-11-18), sin cambiar nada.
 * Conectado con: lib/supabase.ts (ajustes de la tienda), app/servicios.tsx (enlaceVideo, esEnlaceCorto, leerVideosServicios),
 *          components/admin/servicios/PiezasServicios.tsx.
 * Utilizado por: app/admin/services.tsx.
 * Dependencias: react, react-native, @expo/vector-icons.
 * Estado: ACTIVO
 */
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { supabase } from "../../../lib/supabase";
import { enlaceVideo, esEnlaceCorto } from "../../../app/servicios";
import CargaMarca from "../../marca/CargaMarca";
import { TAMANOS } from "../../../constants/temaTienda";
import { AvisoPanel, BotonIconoPanel } from "../../../lib/admin/productos.componentes";
import { COLORS, ChipButton } from "./PiezasServicios";

// «Nuestros Servicios» (dueño, 2026-11-09): los vídeos de cómo trabajamos que salen en la página Servicios. Se pegan
// enlaces de Instagram o TikTok (site_settings.videos_servicios, migración 20261109130000); null = falta la migración.
export function EditorVideosServicios({ isMobile }: { isMobile: boolean }) {
  const [filas, setFilas] = useState<{ url: string; titulo: string }[] | null>(null);
  const [falta, setFalta] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ tono: "success" | "warning"; texto: string } | null>(null);

  useEffect(() => {
    supabase
      .from("site_settings")
      .select("videos_servicios")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          setFalta(true);
          setFilas([]);
          return;
        }
        const v = (data as { videos_servicios?: unknown } | null)?.videos_servicios;
        setFilas(Array.isArray(v) ? v.map((x) => ({ url: String(x?.url ?? ""), titulo: String(x?.titulo ?? "") })) : []);
      });
  }, []);

  async function guardar() {
    if (!filas || guardando) return;
    setGuardando(true);
    setAviso(null);
    // Los enlaces cortos de las apps (vm.tiktok.com/…, instagram.com/share/…) se cambian por el largo, que lleva el
    // número del vídeo (api/video-enlace.ts).
    const llenas = await Promise.all(
      filas
        .filter((f) => f.url.trim() || f.titulo.trim())
        .map(async (f) => {
          if (!esEnlaceCorto(f.url)) return { ...f, url: f.url.trim() };
          try {
            const r = await fetch(`/api/video-enlace?url=${encodeURIComponent(f.url.trim())}`);
            const largo = r.ok ? String(((await r.json()) as { url?: string }).url ?? "") : "";
            return enlaceVideo(largo) ? { ...f, url: largo } : f;
          } catch {
            return f;
          }
        })
    );
    const mala = llenas.findIndex((f) => !enlaceVideo(f.url));
    if (mala >= 0) {
      setFilas(llenas);
      setGuardando(false);
      setAviso({
        tono: "warning",
        texto: esEnlaceCorto(llenas[mala].url)
          ? `No hemos podido abrir el enlace corto del vídeo ${mala + 1}. Ábrelo en el navegador y copia la dirección completa (con /reel/… o /video/número).`
          : `El vídeo ${mala + 1} no es un enlace de Instagram (reel o publicación) ni de TikTok (vídeo). Cópialo desde «Compartir → Copiar enlace».`,
      });
      return;
    }
    const videos = llenas.map((f) => ({ url: f.url.trim(), ...(f.titulo.trim() ? { titulo: f.titulo.trim() } : null) }));
    const { error } = await supabase.from("site_settings").update({ videos_servicios: videos }).eq("id", 1);
    setGuardando(false);
    if (error) {
      setAviso({ tono: "warning", texto: "No se han podido guardar los vídeos. Inténtalo de nuevo." });
      return;
    }
    setFilas(videos.map((v) => ({ url: v.url, titulo: v.titulo ?? "" })));
    setAviso({ tono: "success", texto: videos.length ? `Guardado: ${videos.length} ${videos.length === 1 ? "vídeo" : "vídeos"} en la página Servicios.` : "Guardado: sin vídeos, el apartado no sale en la tienda." });
  }

  const estiloCampo = {
    width: "100%" as const,
    minHeight: 46,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    fontSize: 16,
    color: COLORS.text,
    backgroundColor: COLORS.cardSoft,
  };

  return (
    <View
      nativeID="servicios-videos"
      style={{ gap: 10, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, backgroundColor: "#FFFFFF" }}
    >
      <View style={{ alignItems: "center", gap: 4 }}>
        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16, textAlign: "center" }}>
          Nuestros Servicios · vídeos{filas?.length ? ` (${filas.filter((f) => f.url.trim()).length})` : ""}
        </Text>
        <Text style={{ color: COLORS.muted, fontSize: TAMANOS.minimo, lineHeight: 18, textAlign: "center" }}>
          Salen al final de la página Servicios para que los clientes vean cómo trabajáis. Pega el enlace de un reel de
          Instagram o un vídeo de TikTok (de un minuto como máximo). Cuántos los ven: Analítica → «Nuestros Servicios».
        </Text>
      </View>
      {filas === null ? (
        <CargaMarca texto="Cargando vídeos…" />
      ) : falta ? (
        <AvisoPanel tone="warning" text="Para guardar vídeos falta aplicar en la base de datos la migración 20261109130000_servicios_videos." />
      ) : (
        <>
          {filas.map((f, i) => {
            const enlace = f.url.trim() ? enlaceVideo(f.url) : null;
            const corto = esEnlaceCorto(f.url);
            return (
              <View key={i} style={{ gap: 6, padding: 10, borderRadius: 14, backgroundColor: COLORS.cardSoft }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Ionicons
                    name={enlace ? (enlace.plataforma === "Instagram" ? "logo-instagram" : "logo-tiktok") : "videocam-outline"}
                    size={20}
                    color={f.url.trim() && !enlace && !corto ? COLORS.danger : COLORS.text}
                  />
                  <TextInput
                    nativeID={`servicios-video-url-${i}`}
                    value={f.url}
                    onChangeText={(v) => setFilas((prev) => (prev ?? []).map((x, j) => (j === i ? { ...x, url: v } : x)))}
                    placeholder="https://www.instagram.com/reel/…"
                    placeholderTextColor={COLORS.muted2}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={{ ...estiloCampo, flex: 1, width: 0, minWidth: 0 }}
                  />
                  <BotonIconoPanel
                    icon="trash-outline"
                    label={`Quitar el vídeo ${i + 1}`}
                    variant="danger"
                    onPress={() => setFilas((prev) => (prev ?? []).filter((_, j) => j !== i))}
                  />
                </View>
                <TextInput
                  nativeID={`servicios-video-titulo-${i}`}
                  value={f.titulo}
                  onChangeText={(v) => setFilas((prev) => (prev ?? []).map((x, j) => (j === i ? { ...x, titulo: v } : x)))}
                  placeholder="Título (opcional): Limpieza de una PS4"
                  placeholderTextColor={COLORS.muted2}
                  maxLength={80}
                  style={{ ...estiloCampo, textAlign: "center" }}
                />
                {corto ? (
                  <Text style={{ color: COLORS.muted, fontSize: TAMANOS.minimo, lineHeight: 19 }}>Enlace corto de la app: al guardar se cambia por el completo.</Text>
                ) : f.url.trim() && !enlace ? (
                  <Text style={{ color: COLORS.danger, fontSize: TAMANOS.minimo, lineHeight: 19 }}>Este enlace no es de un vídeo de Instagram o TikTok.</Text>
                ) : null}
              </View>
            );
          })}
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
            {filas.length < 12 ? (
              <ChipButton icon="add" label="Añadir vídeo" onPress={() => setFilas((prev) => [...(prev ?? []), { url: "", titulo: "" }])} isMobile={isMobile} />
            ) : null}
            <ChipButton icon="save-outline" label={guardando ? "Guardando…" : "Guardar vídeos"} variant="primary" disabled={guardando} onPress={guardar} isMobile={isMobile} />
          </View>
        </>
      )}
      {aviso ? <AvisoPanel tone={aviso.tono} text={aviso.texto} /> : null}
    </View>
  );
}
