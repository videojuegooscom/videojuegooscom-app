/**
 * components/CatalogFilters.tsx
 *
 * Qué hace: filtros y orden del catálogo (app/catalogo.tsx), en filas de
 * chips centradas y sin recuadros: plataforma/categoría, estado (Nuevo /
 * Segunda mano y, dentro de segunda mano, la condición detallada), rango de
 * precio y orden. Además muestra el contador "N productos" y el botón
 * "Quitar filtros" cuando hay alguno activo.
 *
 * Solo pinta y avisa de los cambios: la pantalla es la que aplica los filtros
 * en la consulta a Supabase (para que la paginación sea correcta).
 */
import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

const COLORS = {
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  muted2: "rgba(11,33,56,0.48)",
  accent: "#1EA7E8",
  accent2: "#EAF6FD",
  accentBorder: "#BEE6FA",
  border: "#E3EAF2",
  chipBg: "#F6FAFD",
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
}) {
  const usedSelected = condition === "USED" || USED_DETAIL.some((d) => d.key === condition);

  return (
    <View style={{ alignItems: "center", gap: 14 }}>
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
            marginTop: -4,
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

      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          minHeight: 36,
        }}
      >
        {busy ? <ActivityIndicator size="small" color={COLORS.accent} /> : null}
        {total !== null ? (
          <Text style={{ color: COLORS.muted, fontWeight: "800", textAlign: "center" }}>
            {total === 1 ? "1 producto" : `${total} productos`}
          </Text>
        ) : null}
        {hasActiveFilters ? (
          <Pressable
            onPress={onClear}
            accessibilityRole="button"
            hitSlop={6}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, paddingVertical: 6 })}
          >
            <Text style={{ color: COLORS.accent, fontWeight: "900", textAlign: "center" }}>
              Quitar filtros
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
