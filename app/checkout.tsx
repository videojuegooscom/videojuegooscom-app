import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";

export default function Checkout() {
  return (
    <View style={{ flex: 1, padding: 16, gap: 12, justifyContent: "center" }}>
      <Text style={{ fontSize: 22, fontWeight: "900" }}>Checkout</Text>
      <Text style={{ opacity: 0.7 }}>
        Aquí conectaremos Stripe (modo real) y el webhook para marcar “Vendido”.
      </Text>

      <Link href="/" asChild>
        <Pressable style={{ padding: 12, alignItems: "center" }}>
          <Text style={{ opacity: 0.75 }}>← Volver a la tienda</Text>
        </Pressable>
      </Link>
    </View>
  );
}
