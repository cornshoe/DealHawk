import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { apiFetch } from "@/src/api/client";
import { useTheme } from "@/src/contexts/ThemeContext";
import { spacing, radius, statusOptions, scoreColor, recommendationColor, ColorPalette } from "@/src/theme";

function relTime(iso?: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "";
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  return `${Math.floor(d / 30)}mo`;
}

type Deal = {
  deal_id: string;
  title: string;
  price: number;
  category: string;
  status: string;
  analysis?: { deal_score: number; expected_profit: number; recommendation: string } | null;
  created_at: string;
};

export default function Board() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [status, setStatus] = useState("new");
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<Deal[]>(`/deals?status=${status}&sort=profit`);
      setDeals(d);
    } catch {
      setDeals([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [status]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>DEAL BOARD</Text>
        <Text style={styles.subtitle}>Track each opportunity through the funnel.</Text>
      </View>

      <View style={styles.chipsRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsContent}
        >
          {statusOptions.map((s) => {
            const active = s.key === status;
            return (
              <Pressable
                key={s.key}
                testID={`board-chip-${s.key}`}
                onPress={() => setStatus(s.key)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipTxt, active && styles.chipTxtActive]}>{s.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.brand}
          />
        }
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.brand} />
          </View>
        ) : deals.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="albums-outline" size={48} color={colors.onSurfaceTertiary} />
            <Text style={styles.emptyTitle}>Board is empty</Text>
            <Text style={styles.muted}>Save analyzed deals to start tracking.</Text>
            <Pressable
              testID="board-empty-cta"
              onPress={() => router.push("/(tabs)/analyze")}
              style={styles.primaryBtn}
            >
              <Text style={styles.primaryBtnTxt}>FIND A DEAL</Text>
            </Pressable>
          </View>
        ) : (
          deals.map((d) => (
            <Pressable
              key={d.deal_id}
              testID={`board-deal-${d.deal_id}`}
              onPress={() => router.push(`/deal/${d.deal_id}` as any)}
              style={styles.dealCard}
            >
              <View
                style={[
                  styles.scoreBadge,
                  { backgroundColor: scoreColor(d.analysis?.deal_score || 0, colors) },
                ]}
              >
                <Text style={styles.scoreTxt}>{d.analysis?.deal_score ?? "-"}</Text>
              </View>
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <Text style={styles.dealTitle} numberOfLines={1}>
                  {d.title}
                </Text>
                <View style={styles.dealMeta}>
                  <Text style={styles.dealMetaTxt}>${d.price}</Text>
                  <Text style={styles.dot}>•</Text>
                  <Text
                    style={[
                      styles.dealMetaTxt,
                      { color: recommendationColor(d.analysis?.recommendation, colors) },
                    ]}
                  >
                    {(d.analysis?.recommendation || "—").toUpperCase()}
                  </Text>
                  {d.created_at ? (
                    <>
                      <Text style={styles.dot}>•</Text>
                      <Text style={styles.dealMetaTxt}>{relTime(d.created_at)}</Text>
                    </>
                  ) : null}
                </View>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.profitLbl}>PROFIT</Text>
                <Text style={styles.profitVal}>
                  ${Math.round(d.analysis?.expected_profit ?? 0)}
                </Text>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors: ColorPalette) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  title: { color: colors.onSurface, fontSize: 22, fontWeight: "800", letterSpacing: 3 },
  subtitle: { color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 4, letterSpacing: 1 },
  chipsRow: { height: 56, justifyContent: "center" },
  chipsContent: { paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: "center" },
  chip: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    justifyContent: "center",
    flexShrink: 0,
  },
  chipActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  chipTxt: { color: colors.onSurfaceTertiary, fontSize: 12, fontWeight: "600", letterSpacing: 1 },
  chipTxtActive: { color: colors.brand },
  dealCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scoreBadge: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreTxt: { color: "#fff", fontWeight: "800", fontSize: 20 },
  dealTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "700" },
  dealMeta: { flexDirection: "row", alignItems: "center", marginTop: 4, gap: 6 },
  dealMetaTxt: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: "600" },
  dot: { color: colors.onSurfaceTertiary, fontSize: 12 },
  profitLbl: { color: colors.onSurfaceTertiary, fontSize: 10, letterSpacing: 1 },
  profitVal: { color: colors.success, fontSize: 16, fontWeight: "800" },
  center: { padding: spacing.xxl, alignItems: "center" },
  empty: { alignItems: "center", padding: spacing.xxl, gap: spacing.md },
  emptyTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "700" },
  muted: { color: colors.onSurfaceTertiary, fontSize: 13, textAlign: "center" },
  primaryBtn: {
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  primaryBtnTxt: { color: "#fff", fontWeight: "800", letterSpacing: 1.5, fontSize: 13 },
});
