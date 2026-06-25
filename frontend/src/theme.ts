// Centralized design tokens — dark (default) + light palette
const darkPalette = {
  surface: "#0F0F13",
  onSurface: "#F3F4F6",
  surfaceSecondary: "#1C1C22",
  onSurfaceSecondary: "#D1D5DB",
  surfaceTertiary: "#272730",
  onSurfaceTertiary: "#9CA3AF",
  brand: "#EA580C",
  brandPrimary: "#EA580C",
  brandSecondary: "#C2410C",
  brandTertiary: "rgba(234, 88, 12, 0.15)",
  onBrandPrimary: "#FFFFFF",
  onBrandTertiary: "#F97316",
  success: "#10B981",
  warning: "#F59E0B",
  error: "#EF4444",
  info: "#3B82F6",
  border: "#272730",
  borderStrong: "#3F3F46",
  divider: "#1F2937",
};

const lightPalette: typeof darkPalette = {
  surface: "#F8FAFC",
  onSurface: "#0F172A",
  surfaceSecondary: "#FFFFFF",
  onSurfaceSecondary: "#1F2937",
  surfaceTertiary: "#E2E8F0",
  onSurfaceTertiary: "#475569",
  brand: "#EA580C",
  brandPrimary: "#EA580C",
  brandSecondary: "#C2410C",
  brandTertiary: "rgba(234, 88, 12, 0.12)",
  onBrandPrimary: "#FFFFFF",
  onBrandTertiary: "#C2410C",
  success: "#059669",
  warning: "#D97706",
  error: "#DC2626",
  info: "#2563EB",
  border: "#E2E8F0",
  borderStrong: "#CBD5E1",
  divider: "#E2E8F0",
};

export type ColorPalette = typeof darkPalette;
export const darkColors = darkPalette;
export const lightColors = lightPalette;
// Default export kept for backward compatibility (dark)
export const colors = darkPalette;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = {
  sm: 6,
  md: 12,
  lg: 20,
  pill: 999,
};

export const fonts = {
  display: "BarlowCondensed_700Bold",
  body: "DMSans_400Regular",
  bodyMedium: "DMSans_500Medium",
  bodyBold: "DMSans_700Bold",
};

export const recommendationColor = (rec?: string, c: ColorPalette = colors) => {
  switch (rec) {
    case "buy":
      return c.success;
    case "negotiate":
      return c.brand;
    case "watch":
      return c.info;
    case "skip":
      return c.error;
    default:
      return c.onSurfaceTertiary;
  }
};

export const scoreColor = (score: number, c: ColorPalette = colors) => {
  if (score >= 8) return c.success;
  if (score >= 6) return c.brand;
  if (score >= 4) return c.warning;
  return c.error;
};

export const statusOptions = [
  { key: "new", label: "New" },
  { key: "watching", label: "Watching" },
  { key: "messaged", label: "Messaged" },
  { key: "purchased", label: "Purchased" },
  { key: "sold", label: "Sold" },
  { key: "skipped", label: "Skipped" },
];

export const categoryOptions = [
  { key: "all", label: "All" },
  { key: "electronics", label: "Electronics" },
  { key: "furniture", label: "Furniture" },
  { key: "vehicles", label: "Vehicles" },
  { key: "tools", label: "Tools" },
  { key: "collectibles", label: "Collectibles" },
  { key: "appliances", label: "Appliances" },
  { key: "free", label: "Free" },
  { key: "other", label: "Other" },
];
