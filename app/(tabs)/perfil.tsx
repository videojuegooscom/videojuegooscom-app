import React from "react";
import { SafeAreaView, Text, View } from "react-native";

export default function PerfilScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#071E33" }}>
      <View style={{ flex: 1, padding: 16, justifyContent: "center" }}>
        <Text style={{ color: "#FFFFFF", fontSize: 24, fontWeight: "900" }}>
          Perfil
        </Text>
        <Text style={{ color: "rgba(255,255,255,0.72)", marginTop: 10, lineHeight: 22 }}>
          Aquí construiremos el área de cuenta, acceso, pedidos, datos del usuario
          y acceso admin si corresponde.
        </Text>
      </View>
    </SafeAreaView>
  );
}