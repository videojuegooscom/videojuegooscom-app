// app/admin/_layout.tsx
/**
 * Qué hace: layout "guardián" de todas las rutas /admin. Antes de mostrar
 * cualquier pantalla de administración comprueba que hay sesión y que el
 * rol es "admin"; si no, redirige fuera del panel. Mientras comprueba (o
 * redirige), muestra una pantalla de carga ("Verificando acceso").
 *
 * Cómo funciona:
 * - validateAccess() usa supabase.auth.getSession() y luego consulta la
 *   tabla "profiles" (columna "role"). Sin sesión → router.replace("/perfil")
 *   (inicio de sesión de la app). Con sesión pero sin rol "admin" (o si el
 *   perfil falla) → router.replace("/"). Nunca cierra la sesión del cliente.
 * - Se suscribe a supabase.auth.onAuthStateChange() para revalidar si la
 *   sesión cambia mientras el panel está abierto.
 * - safeNavigate() evita navegaciones duplicadas con un pequeño bloqueo
 *   temporal (navLockRef).
 * - Sigue el tema claro global en su pantalla de carga: fondo blanco, la
 *   mascota de "cargando" (CargaMarca, como en el resto de la tienda) y el
 *   texto centrado, sin recuadro alrededor.
 *
 * Conectado con:
 * - lib/supabase.ts → cliente de Supabase para sesión y perfil.
 * - components/marca/CargaMarca.tsx → animación de carga de la marca.
 * - app/(tabs)/perfil.tsx → destino sin sesión (inicio de sesión de la app).
 * - app/admin/index.tsx, app/admin/products.tsx,
 *   app/admin/services.tsx, app/admin/categories.tsx, app/admin/inventario.tsx,
 *   app/admin/cotizaciones.tsx, app/admin/chats.tsx, app/admin/flash-news.tsx,
 *   app/admin/policies.tsx, app/admin/blog.tsx, app/admin/analytics.tsx,
 *   app/admin/users.tsx, app/admin/cliente/[userId].tsx, app/admin/marca-seo.tsx,
 *   app/admin/redes-sociales.tsx, app/admin/aprendizajes.tsx, app/admin/pedidos.tsx,
 *   app/admin/escaparate.tsx
 *   → las rutas hijas que este layout protege (Stack.Screen).
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { StatusBar, Text, View } from "react-native";
import { Stack, router } from "expo-router";
import { supabase } from "../../lib/supabase";
import CargaMarca from "../../components/marca/CargaMarca";

const COLORS = {
  bg: "#FFFFFF",
  muted: "rgba(11,33,56,0.62)",
};

type GuardState = {
  ready: boolean;
  hasSession: boolean;
  isAdmin: boolean;
};

export default function AdminLayout() {
  const [guard, setGuard] = useState<GuardState>({
    ready: false,
    hasSession: false,
    isAdmin: false,
  });

  const mountedRef = useRef(true);
  const navLockRef = useRef(false);

  const safeNavigate = useCallback((target: "/perfil" | "/") => {
    if (navLockRef.current) return;
    navLockRef.current = true;
    router.replace(target);
    setTimeout(() => {
      navLockRef.current = false;
    }, 350);
  }, []);

  // Nunca se cierra la sesión del visitante: un cliente que abre /admin por
  // error sigue con su sesión iniciada en la tienda y solo se le redirige.
  const deny = useCallback(
    (hasSession: boolean) => {
      if (mountedRef.current) {
        setGuard({ ready: true, hasSession, isAdmin: false });
      }
      safeNavigate(hasSession ? "/" : "/perfil");
    },
    [safeNavigate]
  );

  const validateAccess = useCallback(async () => {
    let hasSession = false;
    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      const user = session?.user ?? null;

      if (!user) {
        deny(false);
        return;
      }
      hasSession = true;

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle<{ role: string | null }>();

      const role = String(profile?.role ?? "").trim().toLowerCase();
      if (profileError || role !== "admin") {
        deny(true);
        return;
      }

      if (mountedRef.current) {
        setGuard({
          ready: true,
          hasSession: true,
          isAdmin: true,
        });
      }
    } catch {
      deny(hasSession);
    }
  }, [deny]);

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

  // Mientras se comprueba (o mientras se redirige a quien no es admin) no se
  // monta ninguna pantalla del panel.
  if (!guard.ready || !guard.isAdmin) {
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
        <CargaMarca texto="Verificando acceso" />
        <Text
          style={{
            color: COLORS.muted,
            textAlign: "center",
            lineHeight: 20,
            maxWidth: 320,
          }}
        >
          Comprobando sesión y permisos del panel de administración…
        </Text>
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="products" />
      <Stack.Screen name="services" />
      <Stack.Screen name="categories" />
      <Stack.Screen name="inventario" />
      <Stack.Screen name="cotizaciones" />
      <Stack.Screen name="chats" />
      <Stack.Screen name="flash-news" />
      <Stack.Screen name="conocimiento" />
      <Stack.Screen name="auditorias" />
      <Stack.Screen name="policies" />
      <Stack.Screen name="blog" />
      <Stack.Screen name="analytics" />
      <Stack.Screen name="users" />
      <Stack.Screen name="cliente/[userId]" />
      <Stack.Screen name="marca-seo" />
      <Stack.Screen name="redes-sociales" />
      <Stack.Screen name="aprendizajes" />
      <Stack.Screen name="pedidos" />
      <Stack.Screen name="escaparate" />
    </Stack>
  );
}