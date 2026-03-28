// app/admin/_layout.tsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StatusBar, Text, View } from "react-native";
import { Stack, router, usePathname } from "expo-router";
import { supabase } from "../../lib/supabase";

const COLORS = {
  bg: "#071E33",
  bg2: "#061A2C",
  text: "#FFFFFF",
  muted: "rgba(255,255,255,0.72)",
  border: "rgba(255,255,255,0.10)",
};

type GuardState = {
  ready: boolean;
  hasSession: boolean;
  isAdmin: boolean;
};

export default function AdminLayout() {
  const pathname = usePathname();
  const isLoginRoute = pathname === "/admin/login";

  const [guard, setGuard] = useState<GuardState>({
    ready: false,
    hasSession: false,
    isAdmin: false,
  });

  const mountedRef = useRef(true);
  const navLockRef = useRef(false);

  const safeNavigate = useCallback((target: "/admin/login" | "/admin" | "/") => {
    if (navLockRef.current) return;
    navLockRef.current = true;
    router.replace(target);
    setTimeout(() => {
      navLockRef.current = false;
    }, 350);
  }, []);

  const validateAccess = useCallback(async () => {
    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      const user = session?.user ?? null;

      if (!user) {
        if (mountedRef.current) {
          setGuard({
            ready: true,
            hasSession: false,
            isAdmin: false,
          });
        }

        if (!isLoginRoute) {
          safeNavigate("/admin/login");
        }

        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle<{ role: string | null }>();

      if (profileError) {
        try {
          await supabase.auth.signOut();
        } catch {
          // ignore
        }

        if (mountedRef.current) {
          setGuard({
            ready: true,
            hasSession: true,
            isAdmin: false,
          });
        }

        if (!isLoginRoute) {
          safeNavigate("/admin/login");
        }

        return;
      }

      const role = String(profile?.role ?? "").trim().toLowerCase();
      const isAdmin = role === "admin";

      if (!isAdmin) {
        try {
          await supabase.auth.signOut();
        } catch {
          // ignore
        }

        if (mountedRef.current) {
          setGuard({
            ready: true,
            hasSession: true,
            isAdmin: false,
          });
        }

        if (!isLoginRoute) {
          safeNavigate("/admin/login");
        }

        return;
      }

      if (mountedRef.current) {
        setGuard({
          ready: true,
          hasSession: true,
          isAdmin: true,
        });
      }

      if (isLoginRoute) {
        safeNavigate("/admin");
      }
    } catch {
      try {
        await supabase.auth.signOut();
      } catch {
        // ignore
      }

      if (mountedRef.current) {
        setGuard({
          ready: true,
          hasSession: false,
          isAdmin: false,
        });
      }

      if (!isLoginRoute) {
        safeNavigate("/admin/login");
      }
    }
  }, [isLoginRoute, safeNavigate]);

  useEffect(() => {
    mountedRef.current = true;
    validateAccess();

    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      validateAccess();
    });

    return () => {
      mountedRef.current = false;
      authListener?.subscription?.unsubscribe?.();
    };
  }, [validateAccess]);

  if (!guard.ready) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: COLORS.bg,
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <StatusBar barStyle="light-content" />
        <View
          style={{
            minWidth: 240,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: COLORS.border,
            backgroundColor: COLORS.bg2,
            paddingHorizontal: 20,
            paddingVertical: 18,
            alignItems: "center",
            gap: 10,
          }}
        >
          <ActivityIndicator color={COLORS.text} />
          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
            Verificando acceso
          </Text>
          <Text
            style={{
              color: COLORS.muted,
              textAlign: "center",
              lineHeight: 20,
            }}
          >
            Comprobando sesión y permisos del panel admin…
          </Text>
        </View>
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="index" />
      <Stack.Screen name="products" />
      <Stack.Screen name="categories" />
      <Stack.Screen name="inventario" />
    </Stack>
  );
}