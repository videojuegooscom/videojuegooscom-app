// app/app/(admin)/_layout.tsx
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Slot, router, usePathname } from "expo-router";
import { supabase } from "../../lib/supabase";

export default function AdminLayout() {
  const [ready, setReady] = useState(false);
  const pathname = usePathname();

  // Evita doble navegación / loops cuando onAuthStateChange dispara varias veces
  const navLockRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    async function checkAdmin() {
      try {
        const { data: sess, error: sessErr } = await supabase.auth.getSession();
        if (sessErr) throw sessErr;

        const session = sess.session;
        const userId = session?.user?.id;

        // Si NO hay sesión -> mandar a login admin
        if (!userId) {
          if (!navLockRef.current && pathname !== "/admin/login") {
            navLockRef.current = true;
            router.replace("/admin/login");
            setTimeout(() => (navLockRef.current = false), 350);
          }
          if (mounted) setReady(true);
          return;
        }

        // Si hay sesión -> comprobar role
        const { data: profile, error: profErr } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", userId)
          .maybeSingle<{ role: string | null }>();

        if (profErr || profile?.role !== "admin") {
          // No admin -> fuera al público
          if (!navLockRef.current) {
            navLockRef.current = true;
            router.replace("/");
            setTimeout(() => (navLockRef.current = false), 350);
          }
          if (mounted) setReady(true);
          return;
        }

        // Admin OK
        if (mounted) setReady(true);
      } catch {
        // Si algo falla, por seguridad lo mandamos a login admin
        if (!navLockRef.current && pathname !== "/admin/login") {
          navLockRef.current = true;
          router.replace("/admin/login");
          setTimeout(() => (navLockRef.current = false), 350);
        }
        if (mounted) setReady(true);
      }
    }

    checkAdmin();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      checkAdmin();
    });

    return () => {
      mounted = false;
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

  return <Slot />;
}
