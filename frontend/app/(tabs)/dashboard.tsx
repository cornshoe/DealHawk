import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { apiFetch } from "@/src/api/client";
import { colors, spacing, radius, categoryOptions, scoreColor, recommendationColor } from "@/src/theme";

type TopDeal = {
  deal_id: string;
  title: string;
  price: number;
  category: string;
  status: string;
  analysis?: {
    deal_score: number;
    estimated_resale_value: number;
    expected_profit: number;
    recommendation: string;
  } | null;
};

type DashboardData = {
  total_deals: number;
  potential_profit: number;
  by_status: Record<string, number>;
  top_deals: TopDeal[];
};

export default function Dashboard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [category, setCategory] = useState("all");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setErr(null);
      const d = await apiFetch<DashboardData>("/dashboard");
      setData(d);
    } catch (e: any) {
      setErr(e?.message || "Failed to load");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const filtered = (data?.top_deals || []).filter(
    (d) => category === "all" || d.category === category
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>DEALHAWK</Text>
          <Text style={styles.subtitle}>Command Center</Text>
        </View>
        <Pressable
          testID="dashboard-analyze-fab"
          onPress={() => router.push("/(tabs)/analyze")}
          style={styles.headerCta}
        >
          <Ionicons name="flash" size={16} color="#fff" />
          <Text style={styles.headerCtaTxt}>SCAN</Text>
        </Pressable>
      </View>

      <View style={styles.chipsRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsContent}
        >
          {categoryOptions.map((c) => {
            const active = c.key === category;
            return (
              <Pressable
                key={c.key}
                testID={`dashboard-chip-${c.key}`}
                onPress={() => setCategory(c.key)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipTxt, active && styles.chipTxtActive]}>{c.label}</Text>
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
            <Text style={styles.muted}>Scanning market…</Text>
          </View>
        ) : err ? (
          <View style={styles.center}>
            <Ionicons name="alert-circle" size={32} color={colors.error} />
            <Text style={styles.error}>{err}</Text>
            <Pressable onPress={load} style={styles.retryBtn}>
              <Text style={styles.retryTxt}>RETRY</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.statsRow}>
              <View style={styles.statCard} testID="dashboard-stat-deals">
                <Text style={styles.statLabel}>TRACKED</Text>
                <Text style={styles.statVal}>{data?.total_deals ?? 0}</Text>
              </View>
              <View style={styles.statCard} testID="dashboard-stat-profit">
                <Text style={styles.statLabel}>PROFIT POT.</Text>
                <Text style={[styles.statVal, { color: colors.success }]}>
                  ${(data?.potential_profit ?? 0).toFixed(0)}
                </Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>TOP DEALS</Text>
            {filtered.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="search" size={48} color={colors.onSurfaceTertiary} />
                <Text style={styles.emptyTitle}>No deals yet</Text>
                <Text style={styles.muted}>Start analyzing listings to fill your board.</Text>
                <Pressable
                  testID="dashboard-empty-cta"
                  onPress={() => router.push("/(tabs)/analyze")}
                  style={styles.primaryBtn}
                >
                  <Text style={styles.primaryBtnTxt}>ANALYZE A LISTING</Text>
                </Pressable>
              </View>
            ) : (
              filtered.map((d) => (
                <Pressable
                  key={d.deal_id}
                  testID={`dashboard-deal-${d.deal_id}`}
                  onPress={() => router.push(`/deal/${d.deal_id}` as any)}
                  style={styles.dealCard}
                >
                  <View
                    style={[
                      styles.scoreBadge,
                      { backgroundColor: scoreColor(d.analysis?.deal_score || 0) },
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
                          { color: recommendationColor(d.analysis?.recommendation) },
                        ]}
                      >
                        {(d.analysis?.recommendation || "—").toUpperCase()}
                      </Text>
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
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  brand: { color: colors.onSurface, fontSize: 22, fontWeight: "800", letterSpacing: 3 },
  subtitle: { color: colors.onSurfaceTertiary, fontSize: 11, letterSpacing: 2 },
  headerCta: {
    flexDirection: "row",
    backgroundColor: colors.brand,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.md,
    alignItems: "center",
    gap: 6,
  },
  headerCtaTxt: { color: "#fff", fontWeight: "800", letterSpacing: 1.5, fontSize: 12 },
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
  statsRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.lg },
  statCard: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statLabel: { color: colors.onSurfaceTertiary, fontSize: 11, letterSpacing: 1.5, fontWeight: "700" },
  statVal: { color: colors.onSurface, fontSize: 28, fontWeight: "800", marginTop: 4 },
  sectionTitle: {
    color: colors.onSurfaceTertiary,
    fontSize: 12,
    letterSpacing: 2,
    fontWeight: "700",
    marginBottom: spacing.md,
  },
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
  center: { alignItems: "center", padding: spacing.xxl, gap: spacing.md },
  empty: { alignItems: "center", padding: spacing.xxl, gap: spacing.md },
  emptyTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "700" },
  muted: { color: colors.onSurfaceTertiary, fontSize: 13, textAlign: "center" },
  error: { color: colors.error },
  retryBtn: {
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  retryTxt: { color: "#fff", fontWeight: "800", letterSpacing: 1.5 },
  primaryBtn: {
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  primaryBtnTxt: { color: "#fff", fontWeight: "800", letterSpacing: 1.5, fontSize: 13 },
});
