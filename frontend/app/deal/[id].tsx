import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Image,
  Platform,
  Modal,
  Linking,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Polyline, Circle, Line as SvgLine } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { apiFetch } from "@/src/api/client";
import { useTheme } from "@/src/contexts/ThemeContext";
import {
  spacing,
  radius,
  statusOptions,
  scoreColor,
  recommendationColor,
  ColorPalette,
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
  listing_url: string;
  images: string[];
  status: string;
  created_at: string;
  updated_at: string;
  last_checked_at?: string | null;
  price_history?: Array<{ price: number; at: string }>;
  inferred_fields?: string[];
  analysis?: {
    deal_score: number;
    inferred_title?: string | null;
    estimated_resale_value: number;
    max_price_to_pay: number;
    expected_profit: number;
    risk_warning: string;
    red_flags: string[];
    suggested_negotiation_message: string;
    recommendation: string;
    reasoning?: string;
    market_data?: {
      buyer_demand?: string;
      seller_competition?: string;
      local_price_range?: string;
      notes?: string;
    } | null;
  } | null;
};

function relTime(iso?: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "—";
  const diffSec = Math.floor((Date.now() - t) / 1000);
  if (diffSec < 60) return "just now";
  const m = Math.floor(diffSec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  const y = Math.floor(d / 365);
  return `${y}y ago`;
}

const VALID_STATUSES = ["new", "watching", "messaged", "purchased", "sold", "skipped"];

function normalizeDeal(raw: any): Deal | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw.analysis && typeof raw.analysis === "object" ? raw.analysis : null;
  const md = a?.market_data && typeof a.market_data === "object" ? a.market_data : null;
  const status = typeof raw.status === "string" && VALID_STATUSES.includes(raw.status)
    ? raw.status
    : "new";
  return {
    deal_id: typeof raw.deal_id === "string" ? raw.deal_id : "",
    title: typeof raw.title === "string" ? raw.title : "",
    price: typeof raw.price === "number" && !isNaN(raw.price) ? raw.price : 0,
    location: typeof raw.location === "string" ? raw.location : "",
    category: typeof raw.category === "string" ? raw.category : "other",
    condition: typeof raw.condition === "string" ? raw.condition : "",
    seller_description:
      typeof raw.seller_description === "string" ? raw.seller_description : "",
    notes: typeof raw.notes === "string" ? raw.notes : "",
    listing_url: typeof raw.listing_url === "string" ? raw.listing_url : "",
    images: Array.isArray(raw.images) ? raw.images.filter((x: any) => typeof x === "string") : [],
    status,
    created_at: typeof raw.created_at === "string" ? raw.created_at : "",
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : "",
    last_checked_at:
      typeof raw.last_checked_at === "string" ? raw.last_checked_at : null,
    price_history: Array.isArray(raw.price_history)
      ? raw.price_history.filter(
          (p: any) => p && typeof p === "object" && typeof p.price === "number"
        )
      : [],
    inferred_fields: Array.isArray(raw.inferred_fields)
      ? raw.inferred_fields.filter((x: any) => typeof x === "string")
      : [],
    analysis: a
      ? {
          deal_score: typeof a.deal_score === "number" ? a.deal_score : 0,
          inferred_title:
            typeof a.inferred_title === "string" ? a.inferred_title : null,
          estimated_resale_value:
            typeof a.estimated_resale_value === "number" ? a.estimated_resale_value : 0,
          max_price_to_pay:
            typeof a.max_price_to_pay === "number" ? a.max_price_to_pay : 0,
          expected_profit:
            typeof a.expected_profit === "number" ? a.expected_profit : 0,
          risk_warning: typeof a.risk_warning === "string" ? a.risk_warning : "",
          red_flags: Array.isArray(a.red_flags)
            ? a.red_flags.filter((x: any) => typeof x === "string")
            : [],
          suggested_negotiation_message:
            typeof a.suggested_negotiation_message === "string"
              ? a.suggested_negotiation_message
              : "",
          recommendation:
            typeof a.recommendation === "string" ? a.recommendation : "watch",
          reasoning: typeof a.reasoning === "string" ? a.reasoning : "",
          market_data: md
            ? {
                buyer_demand: typeof md.buyer_demand === "string" ? md.buyer_demand : "",
                seller_competition:
                  typeof md.seller_competition === "string" ? md.seller_competition : "",
                local_price_range:
                  typeof md.local_price_range === "string" ? md.local_price_range : "",
                notes: typeof md.notes === "string" ? md.notes : "",
              }
            : null,
        }
      : null,
  };
}

export default function DealDetail() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [refreshingAi, setRefreshingAi] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [priceDraft, setPriceDraft] = useState<number>(0);
  const [priceStep, setPriceStep] = useState<"initial" | "adjust">("initial");

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<Deal>(`/deals/${id}`);
      setDeal(normalizeDeal(d));
    } catch (e: any) {
      setErr(e?.message || "Failed to load");
      setDeal(null);
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
      setDeal(normalizeDeal(updated));
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

  const refreshMarketData = async () => {
    if (!deal || refreshingAi) return;
    setRefreshingAi(true);
    setErr(null);
    try {
      const updated = await apiFetch<Deal>(`/deals/${deal.deal_id}/refresh-analysis`, {
        method: "POST",
      });
      setDeal(normalizeDeal(updated));
    } catch (e: any) {
      setErr(e?.message || "Refresh failed");
    } finally {
      setRefreshingAi(false);
    }
  };

  const openListing = async () => {
    if (!deal?.listing_url) return;
    try {
      await Linking.openURL(deal.listing_url);
    } catch (e: any) {
      setErr("Could not open link");
    }
  };

  const startStatusRefresh = async () => {
    if (!deal?.listing_url) {
      setStatusModalOpen(true);
      return;
    }
    try {
      await Linking.openURL(deal.listing_url);
    } catch {}
    // Open the modal so when user returns, the choices are ready.
    setStatusModalOpen(true);
  };

  const submitStatusChoice = async (
    choice: "sold" | "active" | "price_changed",
    newPrice?: number
  ) => {
    if (!deal) return;
    const patch: any = { mark_checked: true };
    if (choice === "sold") patch.status = "sold";
    if (choice === "active") patch.status = deal.status === "new" ? "watching" : deal.status;
    if (choice === "price_changed" && typeof newPrice === "number") {
      patch.price = newPrice;
    }
    try {
      const updated = await apiFetch<Deal>(`/deals/${deal.deal_id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setDeal(normalizeDeal(updated));
    } catch (e: any) {
      setErr(e?.message || "Update failed");
    } finally {
      setStatusModalOpen(false);
      setPriceStep("initial");
    }
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
            <Text style={[styles.scoreNum, { color: scoreColor(a?.deal_score || 0, colors) }]}>
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
              { backgroundColor: recommendationColor(a?.recommendation, colors) },
            ]}
          >
            <Text style={styles.recTxt}>{(a?.recommendation || "—").toUpperCase()}</Text>
          </View>
        </LinearGradient>

        <View style={{ padding: spacing.lg }}>
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Ionicons name="calendar-outline" size={14} color={colors.onSurfaceTertiary} />
              <Text style={styles.metaTxt} testID="deal-added-ticker">
                Added {relTime(deal.created_at)}
              </Text>
            </View>
            {deal.last_checked_at ? (
              <View style={styles.metaItem}>
                <Ionicons name="refresh" size={14} color={colors.onSurfaceTertiary} />
                <Text style={styles.metaTxt} testID="deal-checked-ticker">
                  Checked {relTime(deal.last_checked_at)}
                </Text>
              </View>
            ) : null}
          </View>

          {Array.isArray(deal.inferred_fields) && deal.inferred_fields.length > 0 ? (
            <View style={styles.chipRow} testID="deal-inferred-chips">
              {deal.inferred_fields.map((f) => (
                <View key={f} style={styles.aiChip} testID={`inferred-chip-${f}`}>
                  <Ionicons name="sparkles" size={10} color={colors.brand} />
                  <Text style={styles.aiChipTxt}>{f.replace("_", " ")} from photo</Text>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.actionsRow}>
            <Pressable
              testID="deal-refresh-ai"
              onPress={refreshMarketData}
              disabled={refreshingAi}
              style={[styles.actionBtn, refreshingAi && { opacity: 0.6 }]}
            >
              {refreshingAi ? (
                <ActivityIndicator color={colors.brand} size="small" />
              ) : (
                <Ionicons name="sparkles" size={14} color={colors.brand} />
              )}
              <Text style={styles.actionTxt}>
                {refreshingAi ? "ANALYZING…" : "REFRESH MARKET DATA"}
              </Text>
            </Pressable>
            {deal.listing_url ? (
              <Pressable testID="deal-open-listing" onPress={openListing} style={styles.actionBtn}>
                <Ionicons name="open-outline" size={14} color={colors.brand} />
                <Text style={styles.actionTxt}>OPEN LISTING</Text>
              </Pressable>
            ) : null}
          </View>

          {deal.listing_url ? (
            <Pressable
              testID="deal-refresh-status"
              onPress={startStatusRefresh}
              style={styles.refreshStatusBtn}
            >
              <Ionicons name="repeat" size={16} color="#fff" />
              <Text style={styles.refreshStatusTxt}>REFRESH STATUS IN LISTING</Text>
            </Pressable>
          ) : null}

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

              {Array.isArray(a.red_flags) && a.red_flags.length > 0 ? (
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

              {a.market_data &&
              (a.market_data.buyer_demand ||
                a.market_data.seller_competition ||
                a.market_data.local_price_range ||
                a.market_data.notes) ? (
                <>
                  <Text style={styles.sectionTitle}>MARKET DATA {deal.location ? `• ${deal.location.toUpperCase()}` : ""}</Text>
                  <View style={styles.marketCard} testID="deal-market-data">
                    {a.market_data.local_price_range ? (
                      <View style={styles.marketRow}>
                        <Ionicons name="pricetag" size={14} color={colors.brand} />
                        <View style={styles.marketCol}>
                          <Text style={styles.marketLbl}>LOCAL PRICE RANGE</Text>
                          <Text style={styles.marketTxt}>{a.market_data.local_price_range}</Text>
                        </View>
                      </View>
                    ) : null}
                    {a.market_data.buyer_demand ? (
                      <View style={styles.marketRow}>
                        <Ionicons name="trending-up" size={14} color={colors.success} />
                        <View style={styles.marketCol}>
                          <Text style={styles.marketLbl}>BUYER DEMAND</Text>
                          <Text style={styles.marketTxt}>{a.market_data.buyer_demand}</Text>
                        </View>
                      </View>
                    ) : null}
                    {a.market_data.seller_competition ? (
                      <View style={styles.marketRow}>
                        <Ionicons name="people" size={14} color={colors.info} />
                        <View style={styles.marketCol}>
                          <Text style={styles.marketLbl}>SELLER COMPETITION</Text>
                          <Text style={styles.marketTxt}>{a.market_data.seller_competition}</Text>
                        </View>
                      </View>
                    ) : null}
                    {a.market_data.notes ? (
                      <View style={styles.marketRow}>
                        <Ionicons name="information-circle" size={14} color={colors.onSurfaceTertiary} />
                        <View style={styles.marketCol}>
                          <Text style={styles.marketLbl}>REGIONAL NOTES</Text>
                          <Text style={styles.marketTxt}>{a.market_data.notes}</Text>
                        </View>
                      </View>
                    ) : null}
                  </View>
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

          {Array.isArray(deal.price_history) && deal.price_history.length >= 1 ? (
            <>
              <Text style={styles.sectionTitle}>PRICE HISTORY</Text>
              <PriceHistoryChart history={deal.price_history} />
            </>
          ) : null}

          {Array.isArray(deal.images) && deal.images.length > 0 && (
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
            {(Array.isArray(statusOptions) ? statusOptions : []).map((s) => {
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

      <Modal
        visible={statusModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setStatusModalOpen(false);
          setPriceStep("initial");
        }}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => {
            setStatusModalOpen(false);
            setPriceStep("initial");
          }}
        >
          <Pressable style={styles.modalCard} onPress={() => {}}>
            {priceStep === "initial" ? (
              <>
                <Text style={styles.modalTitle}>Did it sell?</Text>
                <Text style={styles.modalSub}>
                  Tell us what you saw on the listing so we update your board.
                </Text>
                <Pressable
                  testID="status-modal-sold"
                  onPress={() => submitStatusChoice("sold")}
                  style={[styles.modalBtn, { borderColor: colors.error }]}
                >
                  <Ionicons name="checkmark-done" size={18} color={colors.error} />
                  <Text style={[styles.modalBtnTxt, { color: colors.error }]}>SOLD</Text>
                </Pressable>
                <Pressable
                  testID="status-modal-active"
                  onPress={() => submitStatusChoice("active")}
                  style={[styles.modalBtn, { borderColor: colors.success }]}
                >
                  <Ionicons name="pulse" size={18} color={colors.success} />
                  <Text style={[styles.modalBtnTxt, { color: colors.success }]}>STILL ACTIVE</Text>
                </Pressable>
                <Pressable
                  testID="status-modal-price-changed"
                  onPress={() => {
                    setPriceDraft(deal.price);
                    setPriceStep("adjust");
                  }}
                  style={[styles.modalBtn, { borderColor: colors.brand }]}
                >
                  <Ionicons name="cash" size={18} color={colors.brand} />
                  <Text style={[styles.modalBtnTxt, { color: colors.brand }]}>PRICE CHANGED</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.modalTitle}>Adjust new price</Text>
                <Text style={styles.modalSub}>Hold the buttons to change quickly.</Text>
                <View style={styles.priceAdjustRow}>
                  <PriceHoldButton
                    testID="status-modal-price-down"
                    icon="remove"
                    onPress={() => setPriceDraft((p) => Math.max(0, +(p - 1).toFixed(2)))}
                    onHoldStep={() => setPriceDraft((p) => Math.max(0, +(p - 5).toFixed(2)))}
                  />
                  <View style={styles.priceDisplay}>
                    <Text style={styles.priceDisplayLbl}>NEW PRICE</Text>
                    <Text style={styles.priceDisplayVal} testID="status-modal-price-value">
                      ${priceDraft.toFixed(2)}
                    </Text>
                    <Text style={styles.priceDelta}>
                      {priceDraft === deal.price
                        ? "no change"
                        : priceDraft > deal.price
                        ? `+$${(priceDraft - deal.price).toFixed(2)}`
                        : `−$${(deal.price - priceDraft).toFixed(2)}`}
                    </Text>
                  </View>
                  <PriceHoldButton
                    testID="status-modal-price-up"
                    icon="add"
                    onPress={() => setPriceDraft((p) => +(p + 1).toFixed(2))}
                    onHoldStep={() => setPriceDraft((p) => +(p + 5).toFixed(2))}
                  />
                </View>
                <Pressable
                  testID="status-modal-price-save"
                  onPress={() => submitStatusChoice("price_changed", priceDraft)}
                  style={[styles.modalBtn, { borderColor: colors.brand, backgroundColor: colors.brand }]}
                >
                  <Text style={[styles.modalBtnTxt, { color: "#fff" }]}>SAVE NEW PRICE</Text>
                </Pressable>
                <Pressable
                  onPress={() => setPriceStep("initial")}
                  style={[styles.modalBtn, { borderColor: colors.border }]}
                >
                  <Text style={[styles.modalBtnTxt, { color: colors.onSurfaceTertiary }]}>BACK</Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function PriceHoldButton({
  testID,
  icon,
  onPress,
  onHoldStep,
}: {
  testID: string;
  icon: "add" | "remove";
  onPress: () => void;
  onHoldStep: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [holding, setHolding] = useState(false);
  React.useEffect(() => {
    if (!holding) return;
    const t = setInterval(onHoldStep, 120);
    return () => clearInterval(t);
  }, [holding, onHoldStep]);
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      onPressIn={() => setHolding(true)}
      onPressOut={() => setHolding(false)}
      style={styles.priceBtn}
    >
      <Ionicons name={icon} size={28} color={colors.brand} />
    </Pressable>
  );
}

function PriceHistoryChart({ history }: { history: Array<{ price: number; at: string }> }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const W = 320;
  const H = 140;
  const padX = 28;
  const padY = 18;
  const pts = history
    .map((p) => ({ price: Number(p.price) || 0, t: new Date(p.at).getTime() }))
    .filter((p) => !isNaN(p.t))
    .sort((a, b) => a.t - b.t);

  if (pts.length === 0) {
    return (
      <View style={styles.chartEmpty}>
        <Text style={styles.muted}>No price data yet.</Text>
      </View>
    );
  }

  const minPrice = Math.min(...pts.map((p) => p.price));
  const maxPrice = Math.max(...pts.map((p) => p.price));
  const minT = pts[0].t;
  const maxT = pts[pts.length - 1].t;
  const xRange = Math.max(1, maxT - minT);
  const yRange = Math.max(1, maxPrice - minPrice);

  const mapX = (t: number) =>
    pts.length === 1 ? W / 2 : padX + ((t - minT) / xRange) * (W - padX * 2);
  const mapY = (p: number) =>
    pts.length === 1 ? H / 2 : H - padY - ((p - minPrice) / yRange) * (H - padY * 2);

  const polyPoints = pts.map((p) => `${mapX(p.t)},${mapY(p.price)}`).join(" ");
  const first = pts[0];
  const last = pts[pts.length - 1];
  const delta = last.price - first.price;
  const deltaPct = first.price > 0 ? (delta / first.price) * 100 : 0;
  const trendColor = delta > 0 ? colors.error : delta < 0 ? colors.success : colors.onSurfaceTertiary;
  const trendIcon = delta > 0 ? "trending-up" : delta < 0 ? "trending-down" : "remove";

  return (
    <View style={styles.chartCard} testID="deal-price-chart">
      <View style={styles.chartHeader}>
        <View>
          <Text style={styles.chartLbl}>CURRENT</Text>
          <Text style={styles.chartCurrent}>${last.price.toFixed(2)}</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Ionicons name={trendIcon as any} size={14} color={trendColor} />
            <Text style={[styles.chartDelta, { color: trendColor }]}>
              {delta === 0
                ? "stable"
                : `${delta > 0 ? "+" : ""}${delta.toFixed(2)} (${deltaPct.toFixed(1)}%)`}
            </Text>
          </View>
          <Text style={styles.muted}>
            {pts.length} {pts.length === 1 ? "point" : "points"}
          </Text>
        </View>
      </View>
      <Svg width={W} height={H} style={{ alignSelf: "center" }}>
        {/* gridlines */}
        <SvgLine x1={padX} y1={padY} x2={padX} y2={H - padY} stroke={colors.border} strokeWidth={1} />
        <SvgLine
          x1={padX}
          y1={H - padY}
          x2={W - padX}
          y2={H - padY}
          stroke={colors.border}
          strokeWidth={1}
        />
        {pts.length > 1 ? (
          <Polyline
            points={polyPoints}
            fill="none"
            stroke={colors.brand}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : null}
        {pts.map((p, i) => (
          <Circle
            key={i}
            cx={mapX(p.t)}
            cy={mapY(p.price)}
            r={i === pts.length - 1 ? 5 : 3.5}
            fill={i === pts.length - 1 ? colors.brand : colors.surfaceSecondary}
            stroke={colors.brand}
            strokeWidth={2}
          />
        ))}
      </Svg>
      <View style={styles.chartRange}>
        <Text style={styles.chartRangeTxt}>min ${minPrice.toFixed(0)}</Text>
        <Text style={styles.chartRangeTxt}>max ${maxPrice.toFixed(0)}</Text>
      </View>
    </View>
  );
}

const makeStyles = (colors: ColorPalette) =>
  StyleSheet.create({
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
  marketCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  marketRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  marketCol: { flex: 1 },
  marketLbl: {
    color: colors.onSurfaceTertiary,
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: "700",
    marginBottom: 2,
  },
  marketTxt: { color: colors.onSurface, fontSize: 13, lineHeight: 19 },
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
  metaRow: {
    flexDirection: "row",
    gap: spacing.lg,
    flexWrap: "wrap",
    marginBottom: spacing.md,
  },
  metaItem: { flexDirection: "row", gap: 6, alignItems: "center" },
  metaTxt: { color: colors.onSurfaceTertiary, fontSize: 12 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: spacing.md },
  aiChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.brand,
  },
  aiChipTxt: {
    color: colors.brand,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "capitalize",
  },
  actionsRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap", marginBottom: spacing.sm },
  actionBtn: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.brand,
  },
  actionTxt: { color: colors.brand, fontWeight: "800", fontSize: 11, letterSpacing: 1 },
  refreshStatusBtn: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    backgroundColor: colors.brand,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  refreshStatusTxt: { color: "#fff", fontWeight: "800", letterSpacing: 1.5, fontSize: 12 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: colors.surfaceSecondary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  modalTitle: {
    color: colors.onSurface,
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
  },
  modalSub: {
    color: colors.onSurfaceTertiary,
    fontSize: 13,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  modalBtn: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: 4,
  },
  modalBtnTxt: { fontWeight: "800", letterSpacing: 1.5, fontSize: 13 },
  priceAdjustRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: spacing.lg,
    gap: spacing.md,
  },
  priceBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.brandTertiary,
    borderWidth: 1,
    borderColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  priceDisplay: {
    flex: 1,
    alignItems: "center",
  },
  priceDisplayLbl: {
    color: colors.onSurfaceTertiary,
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: "700",
    marginBottom: 4,
  },
  priceDisplayVal: { color: colors.onSurface, fontSize: 32, fontWeight: "800" },
  priceDelta: { color: colors.brand, fontSize: 12, fontWeight: "600", marginTop: 2 },
  chartCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  chartHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.sm,
  },
  chartLbl: {
    color: colors.onSurfaceTertiary,
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: "700",
  },
  chartCurrent: { color: colors.onSurface, fontSize: 24, fontWeight: "800" },
  chartDelta: { fontSize: 12, fontWeight: "700" },
  chartRange: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
    paddingHorizontal: 4,
  },
  chartRangeTxt: { color: colors.onSurfaceTertiary, fontSize: 11, fontWeight: "600" },
  chartEmpty: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: "center",
  },
});
