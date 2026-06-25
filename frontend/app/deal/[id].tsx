import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Image,
  Platform,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { apiFetch } from "@/src/api/client";
import {
  colors,
  spacing,
  radius,
  statusOptions,
  scoreColor,
  recommendationColor,
} from "@/src/theme";

type Deal = {
  deal_id: string;
  title: string;
  price: number;
  location: string;
  category: string;
  condition: string;
  seller_description: string;
  notes: string;
  images: string[];
  status: string;
  analysis?: {
    deal_score: number;
    estimated_resale_value: number;
    max_price_to_pay: number;
    expected_profit: number;
    risk_warning: string;
    red_flags: string[];
    suggested_negotiation_message: string;
    recommendation: string;
    reasoning?: string;
  } | null;
};

export default function DealDetail() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<Deal>(`/deals/${id}`);
      setDeal(d);
    } catch (e: any) {
      setErr(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const updateStatus = async (s: string) => {
    if (!deal) return;
    try {
      const updated = await apiFetch<Deal>(`/deals/${deal.deal_id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: s }),
      });
      setDeal(updated);
    } catch (e: any) {
      setErr(e?.message || "Update failed");
    }
  };

  const deleteDeal = async () => {
    if (!deal) return;
    try {
      await apiFetch(`/deals/${deal.deal_id}`, { method: "DELETE" });
      router.back();
    } catch (e: any) {
      setErr(e?.message || "Delete failed");
    }
  };

  const copyMessage = async () => {
    if (!deal?.analysis?.suggested_negotiation_message) return;
    if (Platform.OS === "web") {
      try {
        if (typeof navigator !== "undefined" && navigator.clipboard) {
          await navigator.clipboard.writeText(deal.analysis.suggested_negotiation_message);
        }
      } catch {}
    } else {
      await Clipboard.setStringAsync(deal.analysis.suggested_negotiation_message);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }
  if (!deal) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.muted}>{err || "Deal not found"}</Text>
      </View>
    );
  }

  const a = deal.analysis;
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerBar}>
        <Pressable testID="deal-back" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>DEAL DETAIL</Text>
        <Pressable testID="deal-delete" onPress={deleteDeal} style={styles.iconBtn}>
          <Ionicons name="trash-outline" size={20} color={colors.error} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        {/* Hero score */}
        <LinearGradient
          colors={["#1F1F28", colors.surface]}
          style={styles.hero}
        >
          <View
            style={[
              styles.scoreRing,
              { borderColor: scoreColor(a?.deal_score || 0) },
            ]}
            testID="deal-score-ring"
          >
            <Text style={[styles.scoreNum, { color: scoreColor(a?.deal_score || 0) }]}>
              {a?.deal_score ?? "—"}
            </Text>
            <Text style={styles.scoreLbl}>/10</Text>
          </View>
          <Text style={styles.dealTitle}>{deal.title}</Text>
          <Text style={styles.dealSub}>
            ${deal.price} • {deal.location || "no location"} • {deal.category}
          </Text>
          <View
            style={[
              styles.recPill,
              { backgroundColor: recommendationColor(a?.recommendation) },
            ]}
          >
            <Text style={styles.recTxt}>{(a?.recommendation || "—").toUpperCase()}</Text>
          </View>
        </LinearGradient>

        <View style={{ padding: spacing.lg }}>
          {a && (
            <>
              <View style={styles.metricsRow}>
                <View style={styles.metric}>
                  <Text style={styles.metricLbl}>RESALE</Text>
                  <Text style={styles.metricVal}>${a.estimated_resale_value.toFixed(0)}</Text>
                </View>
                <View style={styles.metric}>
                  <Text style={styles.metricLbl}>MAX PAY</Text>
                  <Text style={styles.metricVal}>${a.max_price_to_pay.toFixed(0)}</Text>
                </View>
                <View style={styles.metric}>
                  <Text style={styles.metricLbl}>PROFIT</Text>
                  <Text style={[styles.metricVal, { color: colors.success }]}>
                    ${a.expected_profit.toFixed(0)}
                  </Text>
                </View>
              </View>

              {a.risk_warning ? (
                <View style={styles.risk}>
                  <Ionicons name="warning" size={16} color={colors.warning} />
                  <Text style={styles.riskTxt}>{a.risk_warning}</Text>
                </View>
              ) : null}

              {a.red_flags?.length ? (
                <>
                  <Text style={styles.sectionTitle}>RED FLAGS</Text>
                  {a.red_flags.map((f, i) => (
                    <View key={i} style={styles.flagRow}>
                      <Ionicons name="alert-circle" size={14} color={colors.error} />
                      <Text style={styles.flagTxt}>{f}</Text>
                    </View>
                  ))}
                </>
              ) : null}

              {a.suggested_negotiation_message ? (
                <>
                  <Text style={styles.sectionTitle}>NEGOTIATION MESSAGE</Text>
                  <View style={styles.msgBox}>
                    <Text style={styles.msgTxt}>{a.suggested_negotiation_message}</Text>
                    <Pressable
                      testID="deal-copy-message"
                      onPress={copyMessage}
                      style={styles.copyBtn}
                    >
                      <Ionicons
                        name={copied ? "checkmark" : "copy"}
                        size={14}
                        color={colors.brand}
                      />
                      <Text style={styles.copyTxt}>{copied ? "COPIED" : "COPY"}</Text>
                    </Pressable>
                  </View>
                </>
              ) : null}

              {a.reasoning ? (
                <>
                  <Text style={styles.sectionTitle}>REASONING</Text>
                  <Text style={styles.body}>{a.reasoning}</Text>
                </>
              ) : null}
            </>
          )}

          {deal.images.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>PHOTOS</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {deal.images.map((uri, i) => (
                  <Image key={i} source={{ uri }} style={styles.thumb} />
                ))}
              </ScrollView>
            </>
          )}

          <Text style={styles.sectionTitle}>STATUS</Text>
          <View style={styles.statusGrid}>
            {statusOptions.map((s) => {
              const active = s.key === deal.status;
              return (
                <Pressable
                  key={s.key}
                  testID={`deal-status-${s.key}`}
                  onPress={() => updateStatus(s.key)}
                  style={[styles.statusBtn, active && styles.statusBtnActive]}
                >
                  <Text style={[styles.statusTxt, active && styles.statusTxtActive]}>
                    {s.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {deal.seller_description ? (
            <>
              <Text style={styles.sectionTitle}>SELLER DESCRIPTION</Text>
              <Text style={styles.body}>{deal.seller_description}</Text>
            </>
          ) : null}
          {deal.notes ? (
            <>
              <Text style={styles.sectionTitle}>YOUR NOTES</Text>
              <Text style={styles.body}>{deal.notes}</Text>
            </>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  center: { alignItems: "center", justifyContent: "center" },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  iconBtn: { padding: 8 },
  headerTitle: { color: colors.onSurface, fontWeight: "800", letterSpacing: 2, fontSize: 13 },
  hero: {
    alignItems: "center",
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  scoreRing: {
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 6,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
  },
  scoreNum: { fontSize: 56, fontWeight: "900" },
  scoreLbl: { color: colors.onSurfaceTertiary, fontSize: 12, marginTop: -4 },
  dealTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "800", textAlign: "center" },
  dealSub: { color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 4 },
  recPill: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  recTxt: { color: "#fff", fontWeight: "800", letterSpacing: 2, fontSize: 12 },
  metricsRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.lg },
  metric: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metricLbl: { color: colors.onSurfaceTertiary, fontSize: 10, letterSpacing: 1, fontWeight: "700" },
  metricVal: { color: colors.onSurface, fontSize: 18, fontWeight: "800", marginTop: 2 },
  risk: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "rgba(245,158,11,0.1)",
    borderColor: colors.warning,
    borderWidth: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  riskTxt: { color: colors.warning, fontSize: 13, flex: 1 },
  sectionTitle: {
    color: colors.onSurfaceTertiary,
    fontSize: 11,
    letterSpacing: 1.5,
    fontWeight: "700",
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  flagRow: { flexDirection: "row", gap: 8, alignItems: "flex-start", marginBottom: 6 },
  flagTxt: { color: colors.onSurfaceSecondary, fontSize: 13, flex: 1 },
  msgBox: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  msgTxt: { color: colors.onSurface, fontSize: 13, lineHeight: 20 },
  copyBtn: {
    marginTop: spacing.sm,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.sm,
  },
  copyTxt: { color: colors.brand, fontWeight: "800", letterSpacing: 1, fontSize: 11 },
  body: { color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 20 },
  thumb: { width: 100, height: 100, borderRadius: radius.md, marginRight: spacing.sm },
  statusGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  statusBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  statusBtnActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  statusTxt: { color: colors.onSurfaceTertiary, fontWeight: "700", letterSpacing: 1, fontSize: 11 },
  statusTxtActive: { color: colors.brand },
  muted: { color: colors.onSurfaceTertiary },
});
