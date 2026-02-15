// app/admin/_layout.tsx
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack, router, usePathname } from "expo-router";
import { supabase } from "../../lib/supabase";

export default function AdminLayout() {
  const [ready, setReady] = useState(false);
  const pathname = usePathname();

  // Evita doble navegación / loops cuando onAuthStateChange dispara varias veces
  const navLockRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    async function checkAdmin() {
      try {
        const { data: sess, error: sessErr } = await supabase.auth.getSession();
        if (sessErr) throw sessErr;

        const userId = sess.session?.user?.id;

        // Sin sesión -> a login
        if (!userId) {
          if (!navLockRef.current && pathname !== "/admin/login") {
            navLockRef.current = true;
            router.replace("/admin/login");
            setTimeout(() => (navLockRef.current = false), 350);
          }
          if (mountedRef.current) setReady(true);
          return;
        }

        // Con sesión -> role admin
        const { data: profile, error: profErr } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", userId)
          .maybeSingle<{ role: string | null }>();

        const isAdmin = !profErr && (profile?.role ?? "") === "admin";

        if (!isAdmin) {
          if (!navLockRef.current) {
            navLockRef.current = true;
            router.replace("/");
            setTimeout(() => (navLockRef.current = false), 350);
          }
          if (mountedRef.current) setReady(true);
          return;
        }

        // OK
        if (mountedRef.current) setReady(true);
      } catch {
        // fallo -> login admin (seguridad)
        if (!navLockRef.current && pathname !== "/admin/login") {
          navLockRef.current = true;
          router.replace("/admin/login");
          setTimeout(() => (navLockRef.current = false), 350);
        }
        if (mountedRef.current) setReady(true);
      }
    }

    checkAdmin();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      // Re-chequea en login/logout
      checkAdmin();
    });

    return () => {
      mountedRef.current = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, [pathname]);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Importante: deja que Expo Router resuelva los screens dentro de /admin */}
      <Stack.Screen name="login" />
      <Stack.Screen name="index" />
      <Stack.Screen name="products" />
      <Stack.Screen name="categories" />
      <Stack.Screen name="inventario" />
    </Stack>
  );
}
