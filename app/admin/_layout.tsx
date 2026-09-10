// app/admin/_layout.tsx
/**
 * Qué hace: layout "guardián" de todas las rutas /admin. Antes de mostrar
 * cualquier pantalla de administración comprueba que hay sesión y que el
 * rol es "admin"; si no, redirige a /admin/login. Mientras comprueba,
 * muestra una pantalla de carga ("Verificando acceso").
 *
 * Cómo funciona:
 * - validateAccess() usa supabase.auth.getSession() y luego consulta la
 *   tabla "profiles" (columna "role"). Si no hay sesión, el perfil falla o
 *   el rol no es "admin", cierra sesión y hace router.replace("/admin/login").
 * - Se suscribe a supabase.auth.onAuthStateChange() para revalidar si la
 *   sesión cambia mientras el panel está abierto.
 * - safeNavigate() evita navegaciones duplicadas con un pequeño bloqueo
 *   temporal (navLockRef).
 * - Sigue el tema claro global en su pantalla de carga: fondo blanco, azul
 *   claro de acento y texto en azul marino oscuro.
 *
 * Conectado con:
 * - lib/supabase.ts → cliente de Supabase para sesión y perfil.
 * - app/admin/login, app/admin/index.tsx, app/admin/products.tsx,
 *   app/admin/services.tsx, app/admin/categories.tsx, app/admin/inventario.tsx,
 *   app/admin/cotizaciones.tsx, app/admin/chats.tsx, app/admin/flash-news.tsx,
 *   app/admin/policies.tsx, app/admin/blog.tsx, app/admin/analytics.tsx,
 *   app/admin/users.tsx → las rutas hijas que este layout protege
 *   (Stack.Screen).
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StatusBar, Text, View } from "react-native";
import { Stack, router, usePathname } from "expo-router";
import { supabase } from "../../lib/supabase";

const COLORS = {
  bg: "#FFFFFF",
  bg2: "#F4F9FD",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  border: "#E3EAF2",
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
        <StatusBar barStyle="dark-content" />
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
            Comprobando sesión y permisos del panel de administración…
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
      <Stack.Screen name="services" />
      <Stack.Screen name="categories" />
      <Stack.Screen name="inventario" />
      <Stack.Screen name="cotizaciones" />
      <Stack.Screen name="chats" />
      <Stack.Screen name="flash-news" />
      <Stack.Screen name="policies" />
      <Stack.Screen name="blog" />
      <Stack.Screen name="analytics" />
      <Stack.Screen name="users" />
      <Stack.Screen name="marca-seo" />
    </Stack>
  );
}