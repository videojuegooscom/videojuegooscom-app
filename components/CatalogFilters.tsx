/**
 * components/CatalogFilters.tsx
 *
 * Qué hace: filtros y orden del catálogo (app/catalogo.tsx). A la vista solo
 * queda un botón "Filtros" (icono options-outline + número de filtros
 * activos) junto al contador "N productos". Al pulsarlo se abre un panel
 * blanco (deslizable desde abajo en móvil, centrado en escritorio) con TODOS
 * los filtros en chips: plataforma, estado (Nuevo / Segunda mano y su
 * condición detallada), precio y orden, más "Quitar filtros" y "Ver N
 * productos".
 *
 * Solo pinta y avisa de los cambios: la pantalla es la que aplica los filtros
 * en la consulta a Supabase (para que la paginación sea correcta). Por eso el
 * número de "Ver N productos" se actualiza solo mientras se eligen filtros.
 */
import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, Text, View } from "react-native";

const COLORS = {
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  muted2: "rgba(11,33,56,0.48)",
  accent: "#1EA7E8",
  accent2: "#EAF6FD",
  accentBorder: "#BEE6FA",
  border: "#E3EAF2",
  chipBg: "#F6FAFD",
  white: "#FFFFFF",
};

export type ConditionFilter = "ALL" | "NEW" | "USED" | "LIKE_NEW" | "GOOD" | "FAIR" | "PARTS";
export type PriceFilter = "ALL" | "UP_25" | "25_100" | "100_300" | "OVER_300";
export type SortKey = "NEWEST" | "PRICE_ASC" | "PRICE_DESC" | "MOST_VIEWED";

export type CatalogCategoryOption = { id: string; name: string; slug: string };

/** Condiciones de segunda mano (todo lo que no es "NEW"). */
export const USED_CONDITIONS = ["LIKE_NEW", "GOOD", "FAIR", "PARTS"] as const;

const USED_DETAIL: { key: ConditionFilter; label: string }[] = [
  { key: "LIKE_NEW", label: "Como nuevo" },
  { key: "GOOD", label: "Bueno" },
  { key: "FAIR", label: "Regular" },
  { key: "PARTS", label: "Para piezas" },
];

const PRICE_OPTIONS: { key: PriceFilter; label: string }[] = [
  { key: "ALL", label: "Cualquier precio" },
  { key: "UP_25", label: "Hasta 25 €" },
  { key: "25_100", label: "25–100 €" },
  { key: "100_300", label: "100–300 €" },
  { key: "OVER_300", label: "Más de 300 €" },
];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "NEWEST", label: "Novedades" },
  { key: "PRICE_ASC", label: "Precio más bajo" },
  { key: "PRICE_DESC", label: "Precio más alto" },
  { key: "MOST_VIEWED", label: "Más vistos" },
];

function softShadow() {
  return Platform.select<any>({
    ios: {
      shadowColor: "#0B2138",
      shadowOpacity: 0.18,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 10 },
    },
    android: { elevation: 8 },
    default: { boxShadow: "0 18px 48px rgba(11,33,56,0.18)" },
  });
}

export function Chip({
  label,
  active,
  onPress,
  isMobile,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
  isMobile?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      style={({ pressed }) => ({
        opacity: pressed ? 0.88 : 1,
        borderRadius: 999,
        paddingVertical: isMobile ? 8 : 10,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: active ? COLORS.accentBorder : COLORS.border,
        backgroundColor: active ? COLORS.accent2 : COLORS.chipBg,
      })}
    >
      <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: isMobile ? 13 : 14 }}>
        {label}
      </Text>
    </Pressable>
  );
}

function ChipRow({
  title,
  isMobile,
  children,
}: {
  title: string;
  isMobile: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={{ alignItems: "center", gap: 8 }}>
      <Text
        style={{
          color: COLORS.muted2,
          fontSize: 12,
          fontWeight: "800",
          letterSpacing: 0.4,
          textTransform: "uppercase",
          textAlign: "center",
        }}
      >
        {title}
      </Text>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: isMobile ? 8 : 10,
        }}
      >
        {children}
      </View>
    </View>
  );
}

function productsLabel(total: number) {
  return total === 1 ? "1 producto" : `${total} productos`;
}

export default function CatalogFilters({
  isMobile,
  categories,
  categoryId,
  onCategoryChange,
  condition,
  onConditionChange,
  price,
  onPriceChange,
  sort,
  onSortChange,
  total,
  busy,
  hasActiveFilters,
  onClear,
  extraTitle,
  extraActiveCount = 0,
  extraContent,
}: {
  isMobile: boolean;
  categories: CatalogCategoryOption[];
  categoryId: string | null;
  onCategoryChange: (cat: CatalogCategoryOption | null) => void;
  condition: ConditionFilter;
  onConditionChange: (c: ConditionFilter) => void;
  price: PriceFilter;
  onPriceChange: (p: PriceFilter) => void;
  sort: SortKey;
  onSortChange: (s: SortKey) => void;
  total: number | null;
  busy: boolean;
  hasActiveFilters: boolean;
  onClear: () => void;
  /** Sección extra opcional dentro del panel (p. ej. estado interno para admin). */
  extraTitle?: string;
  extraActiveCount?: number;
  extraContent?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const usedSelected = condition === "USED" || USED_DETAIL.some((d) => d.key === condition);

  // Filtros activos (el orden no cuenta como filtro).
  const activeCount =
    (categoryId ? 1 : 0) + (condition !== "ALL" ? 1 : 0) + (price !== "ALL" ? 1 : 0) + extraActiveCount;

  const seeLabel = busy || total === null ? "Ver productos" : `Ver ${productsLabel(total)}`;

  return (
    <View style={{ alignItems: "center" }}>
      {/* Barra visible: botón de filtros + contador. */}
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          minHeight: 40,
        }}
      >
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={
            activeCount > 0 ? `Filtros, ${activeCount} activos` : "Filtros"
          }
          style={({ pressed }) => ({
            opacity: pressed ? 0.85 : 1,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            borderRadius: 999,
            paddingVertical: 10,
            paddingHorizontal: 16,
            borderWidth: 1,
            borderColor: activeCount > 0 ? COLORS.accentBorder : COLORS.border,
            backgroundColor: activeCount > 0 ? COLORS.accent2 : COLORS.white,
          })}
        >
          <Ionicons name="options-outline" size={18} color={COLORS.text} />
          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 14 }}>Filtros</Text>
          {activeCount > 0 ? (
            <View
              style={{
                minWidth: 20,
                height: 20,
                borderRadius: 10,
                paddingHorizontal: 6,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: COLORS.accent,
              }}
            >
              <Text style={{ color: COLORS.white, fontWeight: "900", fontSize: 12 }}>{activeCount}</Text>
            </View>
          ) : null}
        </Pressable>

        {busy ? <ActivityIndicator size="small" color={COLORS.accent} /> : null}
        {total !== null ? (
          <Text style={{ color: COLORS.muted, fontWeight: "800", textAlign: "center" }}>
            {productsLabel(total)}
          </Text>
        ) : null}
      </View>

      {/* Panel de filtros: hoja inferior en móvil, ventana centrada en escritorio. */}
      <Modal
        visible={open}
        transparent
        animationType={isMobile ? "slide" : "fade"}
        onRequestClose={() => setOpen(false)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: isMobile ? "flex-end" : "center",
            alignItems: "center",
            padding: isMobile ? 0 : 20,
          }}
        >
          {/* Fondo oscuro: tocarlo cierra el panel. */}
          <Pressable
            onPress={() => setOpen(false)}
            accessibilityLabel="Cerrar filtros"
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              backgroundColor: "rgba(11,33,56,0.45)",
            }}
          />

          <View
            style={{
              width: "100%",
              maxWidth: isMobile ? undefined : 560,
              maxHeight: isMobile ? "88%" : "86%",
              backgroundColor: COLORS.white,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderBottomLeftRadius: isMobile ? 0 : 24,
              borderBottomRightRadius: isMobile ? 0 : 24,
              overflow: "hidden",
              ...softShadow(),
            }}
          >
            {/* Cabecera: asa (móvil), título centrado y X. */}
            <View style={{ alignItems: "center", paddingTop: isMobile ? 10 : 18, paddingBottom: 12 }}>
              {isMobile ? (
                <View
                  style={{
                    width: 40,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: COLORS.border,
                    marginBottom: 10,
                  }}
                />
              ) : null}
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 18, textAlign: "center" }}>
                Filtros
              </Text>
              <Pressable
                onPress={() => setOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Cerrar"
                hitSlop={10}
                style={({ pressed }) => ({
                  position: "absolute",
                  right: 14,
                  top: isMobile ? 18 : 14,
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: pressed ? COLORS.chipBg : "transparent",
                })}
              >
                <Ionicons name="close" size={22} color={COLORS.text} />
              </Pressable>
            </View>

            <ScrollView
              style={{ flexGrow: 0 }}
              contentContainerStyle={{
                paddingHorizontal: isMobile ? 16 : 24,
                paddingTop: 4,
                paddingBottom: 18,
                gap: 18,
              }}
              showsVerticalScrollIndicator={false}
            >
              {extraContent ? (
                <ChipRow title={extraTitle ?? "Más filtros"} isMobile={isMobile}>
                  {extraContent}
                </ChipRow>
              ) : null}

              {categories.length > 0 ? (
                <ChipRow title="Plataforma" isMobile={isMobile}>
                  <Chip
                    label="Todas"
                    active={!categoryId}
                    onPress={() => onCategoryChange(null)}
                    isMobile={isMobile}
                  />
                  {categories.map((c) => (
                    <Chip
                      key={c.id}
                      label={c.name}
                      active={categoryId === c.id}
                      onPress={() => onCategoryChange(c)}
                      isMobile={isMobile}
                    />
                  ))}
                </ChipRow>
              ) : null}

              <ChipRow title="Estado" isMobile={isMobile}>
                <Chip
                  label="Todos"
                  active={condition === "ALL"}
                  onPress={() => onConditionChange("ALL")}
                  isMobile={isMobile}
                />
                <Chip
                  label="Nuevo"
                  active={condition === "NEW"}
                  onPress={() => onConditionChange("NEW")}
                  isMobile={isMobile}
                />
                <Chip
                  label="Segunda mano"
                  active={usedSelected}
                  onPress={() => onConditionChange("USED")}
                  isMobile={isMobile}
                />
              </ChipRow>

              {/* Condición detallada: solo aparece al elegir "Segunda mano". */}
              {usedSelected ? (
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    justifyContent: "center",
                    gap: isMobile ? 8 : 10,
                    marginTop: -8,
                  }}
                >
                  {USED_DETAIL.map((d) => (
                    <Chip
                      key={d.key}
                      label={d.label}
                      active={condition === d.key}
                      onPress={() => onConditionChange(condition === d.key ? "USED" : d.key)}
                      isMobile={isMobile}
                    />
                  ))}
                </View>
              ) : null}

              <ChipRow title="Precio" isMobile={isMobile}>
                {PRICE_OPTIONS.map((o) => (
                  <Chip
                    key={o.key}
                    label={o.label}
                    active={price === o.key}
                    onPress={() => onPriceChange(o.key)}
                    isMobile={isMobile}
                  />
                ))}
              </ChipRow>

              <ChipRow title="Ordenar por" isMobile={isMobile}>
                {SORT_OPTIONS.map((o) => (
                  <Chip
                    key={o.key}
                    label={o.label}
                    active={sort === o.key}
                    onPress={() => onSortChange(o.key)}
                    isMobile={isMobile}
                  />
                ))}
              </ChipRow>
            </ScrollView>

            {/* Pie del panel: quitar filtros + ver resultados. */}
            <View
              style={{
                borderTopWidth: 1,
                borderTopColor: COLORS.border,
                paddingHorizontal: isMobile ? 16 : 24,
                paddingTop: 12,
                paddingBottom: isMobile ? 22 : 18,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
              }}
            >
              {hasActiveFilters ? (
                <Pressable
                  onPress={onClear}
                  accessibilityRole="button"
                  hitSlop={6}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.7 : 1,
                    paddingVertical: 12,
                    paddingHorizontal: 10,
                  })}
                >
                  <Text style={{ color: COLORS.accent, fontWeight: "900", textAlign: "center" }}>
                    Quitar filtros
                  </Text>
                </Pressable>
              ) : null}

              <Pressable
                onPress={() => setOpen(false)}
                accessibilityRole="button"
                style={({ pressed }) => ({
                  opacity: pressed ? 0.9 : 1,
                  flex: 1,
                  maxWidth: 320,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  borderRadius: 999,
                  paddingVertical: 13,
                  paddingHorizontal: 18,
                  backgroundColor: COLORS.accent,
                })}
              >
                {busy ? <ActivityIndicator size="small" color={COLORS.white} /> : null}
                <Text style={{ color: COLORS.white, fontWeight: "900", textAlign: "center" }}>
                  {seeLabel}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
