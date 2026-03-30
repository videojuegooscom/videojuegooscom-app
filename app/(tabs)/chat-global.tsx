import React from "react";
import { SafeAreaView, Text, View } from "react-native";

export default function ChatGlobalScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#071E33" }}>
      <View style={{ flex: 1, padding: 16, justifyContent: "center" }}>
        <Text style={{ color: "#FFFFFF", fontSize: 24, fontWeight: "900" }}>
          Chat Global
        </Text>
        <Text style={{ color: "rgba(255,255,255,0.72)", marginTop: 10, lineHeight: 22 }}>
          Chat de comunidad, soporte público o conversaciones
          globales según el enfoque final que quieras darle.
        </Text>
      </View>
    </SafeAreaView>
  );
}