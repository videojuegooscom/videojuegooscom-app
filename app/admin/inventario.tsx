/**
 * Qué hace: pantalla de inventario interno (fase opcional/futura). Muestra
 * una lista de ejemplo (MOCK) con código interno, título y estado de cada
 * unidad física, pensada como base para un control de stock más adelante.
 *
 * Cómo funciona: de momento es solo interfaz con datos de ejemplo
 * hardcodeados en el array MOCK; no lee ni escribe nada en Supabase todavía.
 * Sigue el tema claro global: fondo blanco, azul claro de acento y texto en
 * azul marino oscuro.
 *
 * Conectado con:
 * - app/admin/index.tsx → pantalla desde la que se entra aquí (tarjeta
 *   "Inventario", marcada como "Opcional") y a la que se vuelve con el
 *   enlace "← Volver".
 */
import { Link } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";

const ACCENT = "#1EA7E8";
const TEXT = "#0B2138";
const MUTED = "rgba(11,33,56,0.62)";
const BORDER = "#E3EAF2";
const CARD = "#F6FAFD";

const MOCK = [
  { id: "001", title: "PS5 Slim 1TB", status: "TO_REVIEW" },
  { id: "002", title: "Switch OLED", status: "READY_TO_LIST" },
  { id: "003", title: "DualSense (mando)", status: "IN_REPAIR" },
];

const STATUS_LABELS: Record<string, string> = {
  TO_REVIEW: "Por revisar",
  READY_TO_LIST: "Listo para publicar",
  IN_REPAIR: "En reparación",
};

function statusLabel(status: string) {
  return STATUS_LABELS[status] ?? status;
}

export default function Inventario() {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#FFFFFF" }}
      contentContainerStyle={{ padding: 16, paddingBottom: 32, alignItems: "center" }}
    >
      {/* Columna centrada: mismo criterio de ancho máximo que el resto del panel admin */}
      <View style={{ width: "100%", maxWidth: 720, gap: 12 }}>
        <Text style={{ fontSize: 22, fontWeight: "900", color: TEXT, textAlign: "center" }}>
          Inventario
        </Text>
        <Text style={{ color: MUTED, textAlign: "center" }}>
          Consulta el código interno y el estado de cada unidad en un solo vistazo.
        </Text>

        {MOCK.map((i) => (
          <View
            key={i.id}
            style={{
              padding: 14,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: BORDER,
              backgroundColor: CARD,
              gap: 6,
            }}
          >
            <Text style={{ fontWeight: "900", color: TEXT }}>
              {i.id} · {i.title}
            </Text>
            <Text style={{ color: ACCENT, fontWeight: "800" }}>Estado: {statusLabel(i.status)}</Text>
          </View>
        ))}

        <Link href="/admin" asChild>
          <Pressable style={{ padding: 12, alignItems: "center" }}>
            <Text style={{ color: MUTED, fontWeight: "800" }}>← Volver</Text>
          </Pressable>
        </Link>
      </View>
    </ScrollView>
  );
}
