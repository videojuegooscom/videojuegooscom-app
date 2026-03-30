import React from "react";
import { SafeAreaView, Text, View } from "react-native";

export default function CestaScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#071E33" }}>
      <View style={{ flex: 1, padding: 16, justifyContent: "center" }}>
        <Text style={{ color: "#FFFFFF", fontSize: 24, fontWeight: "900" }}>
          Cesta
        </Text>
        <Text style={{ color: "rgba(255,255,255,0.72)", marginTop: 10, lineHeight: 22 }}>
          Aquí irá la cesta principal de la tienda con productos, resumen,
          cantidades y acceso limpio a checkout.
        </Text>
      </View>
    </SafeAreaView>
  );
}