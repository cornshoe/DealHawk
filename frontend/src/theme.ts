// Centralized design tokens — sourced from /app/design_guidelines.json
export const colors = {
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
  display: "BarlowCondensed_700Bold", // condensed display
  body: "DMSans_400Regular",
  bodyMedium: "DMSans_500Medium",
  bodyBold: "DMSans_700Bold",
};

export const recommendationColor = (rec?: string) => {
  switch (rec) {
    case "buy":
      return colors.success;
    case "negotiate":
      return colors.brand;
    case "watch":
      return colors.info;
    case "skip":
      return colors.error;
    default:
      return colors.onSurfaceTertiary;
  }
};

export const scoreColor = (score: number) => {
  if (score >= 8) return colors.success;
  if (score >= 6) return colors.brand;
  if (score >= 4) return colors.warning;
  return colors.error;
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
