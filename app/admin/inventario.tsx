import { Link } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";

const ACCENT = "#00AAE4";

const MOCK = [
  { id: "001", title: "PS5 Slim 1TB", status: "TO_REVIEW" },
  { id: "002", title: "Switch OLED", status: "READY_TO_LIST" },
  { id: "003", title: "DualSense (mando)", status: "IN_REPAIR" },
];

export default function Inventario() {
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: "900" }}>Inventario</Text>
      <Text style={{ opacity: 0.7 }}>Código interno + estado. Esto será tu “cerebro”.</Text>

      {MOCK.map((i) => (
        <View key={i.id} style={{ padding: 14, borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", gap: 6 }}>
          <Text style={{ fontWeight: "900" }}>{i.id} · {i.title}</Text>
          <Text style={{ opacity: 0.75 }}>Estado: {i.status}</Text>
        </View>
      ))}

      <Link href="/admin" asChild>
        <Pressable style={{ padding: 12, alignItems: "center" }}>
          <Text style={{ opacity: 0.75 }}>← Volver</Text>
        </Pressable>
      </Link>
    </ScrollView>
  );
}
