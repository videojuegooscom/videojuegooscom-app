/**
 * components/panel/PantallaDiferida.tsx
 *
 * Qué hace: carga más rápida, paso 1 (dueño, 2026-11-21: «paso 1 ya y el paso 2 después»). Las pantallas de
 * Administración ya no van dentro del paquete que descarga cada cliente al abrir la tienda: cada una es su propio
 * trozo (como el conversor HEIC) y se descarga solo cuando el administrador la abre. Mientras llega, sale la misma
 * animación de carga de la marca que en el resto del panel.
 *
 * Candado de versiones: si se publica una versión nueva mientras alguien tiene el panel abierto, el trozo antiguo ya
 * no existe y su descarga falla. Entonces la página se recarga sola UNA vez (para traer la versión nueva); si vuelve a
 * fallar (sin conexión), se enseña «No se ha podido abrir esta sección · Reintentar», sin pantalla en blanco.
 *
 * Solo en el navegador: en la web estática (servidor) se pinta la carga; el panel ya se protege en el navegador
 * (app/admin/_layout.tsx, «Verificando acceso»), así que ninguna pantalla del panel se pinta en el servidor.
 *
 * Conectado con: las rutas app/admin/*.tsx (cada una llama a pantallaDiferida con su import() de components/panel/),
 * components/marca/CargaMarca.tsx y pruebas/perfil-datos.mjs (sección PANEL).
 */
import React, { Component, Suspense, lazy, useEffect, useState, type ComponentType, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import CargaMarca from "../marca/CargaMarca";
import { COLORES_TEXTO, TACTIL, TAMANOS } from "../../constants/temaTienda";

const CLAVE_RECARGA = "vz:panel:recarga-version";

// La descarga de un trozo que ya no existe (versión nueva publicada): se recarga UNA vez por minuto como mucho.
function recargarUnaVez(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const antes = Number(window.sessionStorage.getItem(CLAVE_RECARGA) ?? 0);
    if (Date.now() - antes < 60_000) return false;
    window.sessionStorage.setItem(CLAVE_RECARGA, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

class LimiteCarga extends Component<{ children: ReactNode; onReintentar: () => void }, { fallo: boolean }> {
  state = { fallo: false };
  static getDerivedStateFromError() {
    return { fallo: true };
  }
  componentDidCatch() {
    recargarUnaVez();
  }
  render() {
    if (!this.state.fallo) return this.props.children;
    return (
      <View nativeID="panel-carga-fallo" style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 10, backgroundColor: "#FFFFFF" }}>
        <Text style={{ color: COLORES_TEXTO.texto, fontWeight: "900", fontSize: TAMANOS.cuerpo, textAlign: "center" }}>No se ha podido abrir esta sección</Text>
        <Text style={{ color: COLORES_TEXTO.secundario, fontSize: TAMANOS.minimo, lineHeight: 19, textAlign: "center", maxWidth: 320 }}>
          Revisa la conexión y vuelve a intentarlo.
        </Text>
        <Pressable
          nativeID="panel-carga-reintentar"
          accessibilityRole="button"
          onPress={() => {
            this.setState({ fallo: false });
            this.props.onReintentar();
          }}
          style={({ pressed }) => ({ minHeight: TACTIL.minimo, justifyContent: "center", paddingHorizontal: 16, opacity: pressed ? 0.6 : 1 })}
        >
          <Text style={{ color: COLORES_TEXTO.azulTexto, fontWeight: "800", fontSize: TAMANOS.cuerpo }}>Reintentar</Text>
        </Pressable>
      </View>
    );
  }
}

// Devuelve el componente de la ruta: descarga su pantalla de components/panel/ al abrirla.
export function pantallaDiferida<P extends object>(cargar: () => Promise<{ default: ComponentType<P> }>): ComponentType<P> {
  const crear = () => lazy(cargar);
  function Ruta(props: P) {
    const [enNavegador, setEnNavegador] = useState(false);
    // Al reintentar se vuelve a pedir el trozo (un lazy nuevo: el que falló se queda con su error).
    const [Perezosa, setPerezosa] = useState(() => crear());
    useEffect(() => setEnNavegador(true), []);
    const cargando = (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" }}>
        <CargaMarca />
      </View>
    );
    if (!enNavegador) return cargando;
    return (
      <LimiteCarga onReintentar={() => setPerezosa(() => crear())}>
        <Suspense fallback={cargando}>
          <Perezosa {...props} />
        </Suspense>
      </LimiteCarga>
    );
  }
  return Ruta;
}
