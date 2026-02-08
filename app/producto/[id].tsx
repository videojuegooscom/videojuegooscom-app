import { useLocalSearchParams, Link } from "expo-router";
import { Pressable, Text, View } from "react-native";

const ACCENT = "#00AAE4";

export default function Producto() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <View style={{ flex: 1, padding: 16, gap: 12, justifyContent: "center" }}>
      <Text style={{ fontSize: 22, fontWeight: "900" }}>Producto</Text>
      <Text style={{ opacity: 0.75 }}>ID: {id}</Text>

      <View style={{ padding: 14, borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", gap: 6 }}>
        <Text style={{ fontSize: 18, fontWeight: "800" }}>Ejemplo ficha real</Text>
        <Text style={{ opacity: 0.7 }}>
          Aquí luego pondremos: fotos, condición, garantía, accesorios, y el estado (revisado, listo, etc.).
        </Text>
      </View>

      <Link href="/carrito" asChild>
        <Pressable style={{ padding: 14, borderRadius: 14, backgroundColor: ACCENT, alignItems: "center" }}>
          <Text style={{ color: "white", fontWeight: "900" }}>Añadir al carrito</Text>
        </Pressable>
      </Link>

      <Link href="/catalogo" asChild>
        <Pressable style={{ padding: 12, alignItems: "center" }}>
          <Text style={{ opacity: 0.75 }}>← Volver al catálogo</Text>
        </Pressable>
      </Link>
    </View>
  );
}
