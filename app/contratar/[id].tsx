// app/contratar/[id].tsx
/**
 * Qué hace: página «Contratar servicio» (dueño, 2026-11-09: «quiero que el pop que aparece al darle a "Contratar
 * servicio ahora" sea una página y que tenga nuestro diseño»). Es el formulario de siempre
 * (components/ContratarServicioModal.tsx) como página completa, igual que «Vender ahora» (app/vender.tsx): la cabecera
 * de la tienda, el título, el resumen del servicio con su foto, su opción y su precio, y el formulario con más aire.
 *
 * Cómo funciona: lee el servicio (publicado y activo) con fetchService de la ficha; ?opcion= trae la opción que el
 * cliente tenía elegida en la ficha. «Volver» y «Volver al servicio» regresan a la ficha (o a ella si se entró directo).
 *
 * Conectado con:
 * - app/servicio/[id].tsx → «Contratar servicio ahora» lleva aquí; de allí sale fetchService.
 * - components/ContratarServicioModal.tsx → el formulario (prop comoPagina).
 * - app/_layout.tsx → registra la ruta.
 */
import React, { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ContratarServicioModal from "../../components/ContratarServicioModal";
import CabeceraMarca from "../../components/CabeceraMarca";
import CargaMarca from "../../components/marca/CargaMarca";
import { fetchService } from "../servicio/[id]";

type ServicioCargado = NonNullable<Awaited<ReturnType<typeof fetchService>>>;

function volver(id: string) {
  try {
    if (typeof router.canGoBack === "function" && router.canGoBack()) {
      router.back();
      return;
    }
  } catch {
    // sin historial: se va a la ficha del servicio
  }
  router.replace((id ? `/servicio/${id}` : "/servicios") as any);
}

export default function ContratarServicioScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string; opcion?: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const opcion = typeof params.opcion === "string" ? params.opcion : null;

  const [servicio, setServicio] = useState<ServicioCargado | null>(null);
  const [estado, setEstado] = useState<"cargando" | "listo" | "no-existe">("cargando");

  useEffect(() => {
    let vivo = true;
    if (!id) {
      setEstado("no-existe");
      return;
    }
    setEstado("cargando");
    fetchService(id)
      .then((s) => {
        if (!vivo) return;
        setServicio(s);
        setEstado(s ? "listo" : "no-existe");
      })
      .catch(() => {
        if (vivo) setEstado("no-existe");
      });
    return () => {
      vivo = false;
    };
  }, [id]);

  if (estado === "cargando") {
    return (
      <View style={{ flex: 1, backgroundColor: "#FFFFFF", paddingTop: insets.top }}>
        <CargaMarca texto="Cargando el servicio…" />
      </View>
    );
  }

  if (estado === "no-existe" || !servicio) {
    return (
      <View style={{ flex: 1, backgroundColor: "#FFFFFF", paddingTop: insets.top, paddingHorizontal: 18, gap: 18 }}>
        <CabeceraMarca onBack={() => volver(id)} />
        <View style={{ alignItems: "center", gap: 14, paddingTop: 40 }}>
          <Text style={{ color: "#0B2138", fontWeight: "900", fontSize: 18, textAlign: "center" }}>Este servicio ya no está disponible</Text>
          <Pressable
            onPress={() => router.replace("/servicios" as any)}
            accessibilityRole="button"
            style={({ pressed }) => ({
              minHeight: 52,
              justifyContent: "center",
              paddingHorizontal: 28,
              borderRadius: 999,
              backgroundColor: "#1EA7E8",
              opacity: pressed ? 0.88 : 1,
            })}
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 16 }}>Ver servicios</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const portada = servicio.media.find((m) => m.isCover) ?? servicio.media[0] ?? null;
  return (
    <ContratarServicioModal
      visible
      comoPagina
      service={{
        id: servicio.id,
        title: servicio.title,
        modalidades: servicio.modalidades,
        precio: servicio.priceEUR,
        foto: portada?.publicUrl ?? null,
      }}
      modalidadInicial={opcion}
      onClose={() => volver(servicio.id)}
    />
  );
}
