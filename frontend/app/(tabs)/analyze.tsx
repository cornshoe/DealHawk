import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { apiFetch } from "@/src/api/client";
import { useTheme } from "@/src/contexts/ThemeContext";
import { spacing, radius, categoryOptions, ColorPalette } from "@/src/theme";

const CATS = categoryOptions.filter((c) => c.key !== "all");

export default function Analyze() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ url?: string }>();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState("electronics");
  const [condition, setCondition] = useState("");
  const [sellerDesc, setSellerDesc] = useState("");
  const [notes, setNotes] = useState("");
  const [listingUrl, setListingUrl] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Prefill URL when shared from external app via dealhawk://analyze?url=...
  useEffect(() => {
    if (params?.url && typeof params.url === "string") {
      setListingUrl(params.url);
    }
  }, [params?.url]);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      setErr("Photo permission denied");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.6,
      allowsMultipleSelection: false,
    });
    if (!res.canceled && res.assets[0]?.base64) {
      const mime = res.assets[0].mimeType || "image/jpeg";
      setImages((curr) => [...curr, `data:${mime};base64,${res.assets[0].base64}`].slice(0, 4));
    }
  };

  const removeImage = (i: number) => {
    setImages((curr) => curr.filter((_, idx) => idx !== i));
  };

  const submit = async () => {
    setErr(null);
    if (!title.trim() && images.length === 0) {
      setErr("Add a title or at least one photo");
      return;
    }
    let num: number | null = null;
    if (price.trim()) {
      const parsed = parseFloat(price);
      if (isNaN(parsed)) {
        setErr("Price must be a number");
        return;
      }
      num = parsed;
    } else if (images.length === 0) {
      setErr("Add a price or at least one photo (AI can read price tags)");
      return;
    }
    setBusy(true);
    try {
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      const payload = {
        title: title.trim(),
        price: num,
        location: location.trim(),
        category,
        condition: condition.trim(),
        seller_description: sellerDesc.trim(),
        notes: notes.trim(),
        images,
      };
      const analysis = await apiFetch<any>("/analyze", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const deal = await apiFetch<any>("/deals", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          price: num ?? 0,
          location: location.trim(),
          category,
          condition: condition.trim(),
          seller_description: sellerDesc.trim(),
          notes: notes.trim(),
          listing_url: listingUrl.trim(),
          images,
          analysis,
          status: "new",
        }),
      });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Reset form
      setTitle("");
      setPrice("");
      setLocation("");
      setCondition("");
      setSellerDesc("");
      setNotes("");
      setListingUrl("");
      setImages([]);
      router.push(`/deal/${deal.deal_id}` as any);
    } catch (e: any) {
      setErr(e?.message || "Analysis failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={[styles.container, { paddingTop: insets.top }]}
    >
      <View style={styles.header}>
        <Text style={styles.title}>ANALYZE DEAL</Text>
        <Text style={styles.subtitle}>Paste listing details — AI will score it.</Text>
      </View>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 160 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label}>PHOTOS ({images.length}/4)</Text>
        <Text style={styles.helper}>Add photos first — AI can identify the item from them.</Text>
        <View style={styles.imagesRow}>
          {images.map((uri, i) => (
            <View key={i} style={styles.imgWrap}>
              <Image source={{ uri }} style={styles.img} />
              <Pressable
                testID={`analyze-img-remove-${i}`}
                onPress={() => removeImage(i)}
                style={styles.imgRm}
              >
                <Ionicons name="close" size={14} color="#fff" />
              </Pressable>
            </View>
          ))}
          {images.length < 4 && (
            <Pressable testID="analyze-img-add" onPress={pickImage} style={styles.imgAdd}>
              <Ionicons name="add" size={28} color={colors.onSurfaceTertiary} />
              <Text style={styles.muted}>Add</Text>
            </Pressable>
          )}
        </View>

        <Text style={styles.label}>LISTING URL</Text>
        <Text style={styles.helper}>Paste the Facebook Marketplace link so you can re-check it later.</Text>
        <TextInput
          testID="analyze-url"
          value={listingUrl}
          onChangeText={setListingUrl}
          placeholder="https://facebook.com/marketplace/item/..."
          placeholderTextColor={colors.onSurfaceTertiary}
          style={styles.input}
          autoCapitalize="none"
          keyboardType="url"
          autoCorrect={false}
        />

        <Text style={styles.label}>TITLE</Text>
        <TextInput
          testID="analyze-title"
          value={title}
          onChangeText={setTitle}
          placeholder={images.length > 0 ? "Optional — AI will identify from photos" : "e.g. iPhone 13 Pro 256GB Unlocked"}
          placeholderTextColor={colors.onSurfaceTertiary}
          style={styles.input}
        />

        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>PRICE (USD){images.length > 0 ? "" : " *"}</Text>
            <TextInput
              testID="analyze-price"
              value={price}
              onChangeText={setPrice}
              keyboardType="decimal-pad"
              placeholder={images.length > 0 ? "Optional" : "500"}
              placeholderTextColor={colors.onSurfaceTertiary}
              style={styles.input}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>LOCATION</Text>
            <LocationAutocomplete value={location} onChange={setLocation} />
          </View>
        </View>

        <Text style={styles.label}>CATEGORY</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.sm, paddingVertical: 4 }}
          style={{ marginBottom: spacing.md }}
        >
          {CATS.map((c) => {
            const active = c.key === category;
            return (
              <Pressable
                key={c.key}
                testID={`analyze-cat-${c.key}`}
                onPress={() => setCategory(c.key)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipTxt, active && styles.chipTxtActive]}>{c.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Text style={styles.label}>CONDITION</Text>
        <TextInput
          testID="analyze-condition"
          value={condition}
          onChangeText={setCondition}
          placeholder="Like new, used, fair…"
          placeholderTextColor={colors.onSurfaceTertiary}
          style={styles.input}
        />

        <Text style={styles.label}>SELLER DESCRIPTION</Text>
        <TextInput
          testID="analyze-seller-desc"
          value={sellerDesc}
          onChangeText={setSellerDesc}
          placeholder="Paste the seller's listing description"
          placeholderTextColor={colors.onSurfaceTertiary}
          style={[styles.input, styles.textArea]}
          multiline
        />

        <Text style={styles.label}>YOUR NOTES</Text>
        <TextInput
          testID="analyze-notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="Anything you noticed, e.g. seller's response, scratches…"
          placeholderTextColor={colors.onSurfaceTertiary}
          style={[styles.input, styles.textArea]}
          multiline
        />

        {err ? <Text style={styles.errBox}>{err}</Text> : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Pressable
          testID="analyze-submit"
          onPress={submit}
          disabled={busy}
          style={[styles.cta, busy && { opacity: 0.7 }]}
        >
          {busy ? (
            <>
              <ActivityIndicator color="#fff" />
              <Text style={styles.ctaTxt}>ANALYZING…</Text>
            </>
          ) : (
            <>
              <Ionicons name="flash" size={18} color="#fff" />
              <Text style={styles.ctaTxt}>ANALYZE DEAL</Text>
            </>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function LocationAutocomplete({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [text, setText] = useState(value);
  const [items, setItems] = useState<{ label: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef<any>(null);
  const dismissed = useRef(false);

  useEffect(() => {
    setText(value);
  }, [value]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (dismissed.current) {
      dismissed.current = false;
      return;
    }
    if (!text || text.trim().length < 2) {
      setItems([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        setLoading(true);
        const r = await apiFetch<{ results: { label: string }[] }>(
          `/locations/search?q=${encodeURIComponent(text.trim())}`
        );
        const arr = Array.isArray(r?.results) ? r.results.filter((x: any) => x && typeof x.label === "string") : [];
        setItems(arr);
        setOpen(arr.length > 0);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [text]);

  const pick = (label: string) => {
    dismissed.current = true;
    setText(label);
    onChange(label);
    setOpen(false);
  };

  return (
    <View style={{ position: "relative" }}>
      <TextInput
        testID="analyze-location"
        value={text}
        onChangeText={(t) => {
          setText(t);
          onChange(t);
        }}
        placeholder="Start typing city…"
        placeholderTextColor={colors.onSurfaceTertiary}
        style={styles.input}
        autoCapitalize="words"
      />
      {open && (
        <View style={styles.locDropdown} testID="location-dropdown">
          {loading && (
            <View style={styles.locItem}>
              <ActivityIndicator color={colors.brand} size="small" />
            </View>
          )}
          {items.map((it, i) => (
            <Pressable
              key={`${it.label}-${i}`}
              testID={`location-item-${i}`}
              onPress={() => pick(it.label)}
              style={[styles.locItem, i < items.length - 1 && styles.locItemBorder]}
            >
              <Ionicons name="location" size={14} color={colors.brand} />
              <Text style={styles.locTxt} numberOfLines={1}>
                {it.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const makeStyles = (colors: ColorPalette) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { padding: spacing.lg, paddingBottom: spacing.sm },
  title: { color: colors.onSurface, fontSize: 22, fontWeight: "800", letterSpacing: 3 },
  subtitle: { color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 4, letterSpacing: 1 },
  label: {
    color: colors.onSurfaceTertiary,
    fontSize: 11,
    letterSpacing: 1.5,
    fontWeight: "700",
    marginTop: spacing.md,
    marginBottom: 6,
  },
  helper: { color: colors.onSurfaceTertiary, fontSize: 12, marginBottom: 8, marginTop: -2 },
  input: {
    backgroundColor: colors.surfaceSecondary,
    color: colors.onSurface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 14,
  },
  textArea: { minHeight: 80, textAlignVertical: "top" },
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
  imagesRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  imgWrap: { width: 72, height: 72, borderRadius: radius.md, overflow: "hidden", position: "relative" },
  img: { width: "100%", height: "100%" },
  imgRm: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(0,0,0,0.7)",
    borderRadius: radius.pill,
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  imgAdd: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  muted: { color: colors.onSurfaceTertiary, fontSize: 11 },
  errBox: {
    color: colors.error,
    backgroundColor: "rgba(239,68,68,0.1)",
    padding: spacing.md,
    borderRadius: radius.sm,
    marginTop: spacing.md,
    fontSize: 13,
  },
  footer: {
    position: "absolute",
    bottom: 64,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cta: {
    backgroundColor: colors.brand,
    paddingVertical: 16,
    borderRadius: radius.md,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  ctaTxt: { color: "#fff", fontWeight: "800", letterSpacing: 2, fontSize: 14 },
  locDropdown: {
    position: "absolute",
    top: 52,
    left: 0,
    right: 0,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    zIndex: 50,
    overflow: "hidden",
  },
  locItem: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
  },
  locItemBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  locTxt: { color: colors.onSurface, fontSize: 13, flex: 1 },
});
