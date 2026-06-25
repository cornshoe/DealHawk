import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import { useAuth } from "@/src/contexts/AuthContext";
import { apiFetch } from "@/src/api/client";
import { colors, spacing, radius } from "@/src/theme";

export default function Profile() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const [pushStatus, setPushStatus] = useState<"idle" | "registering" | "ready" | "denied" | "error">(
    "idle"
  );
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (Platform.OS === "web" || !user) return;
      try {
        setPushStatus("registering");
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== "granted") {
          setPushStatus("denied");
          return;
        }
        const token = await Notifications.getDevicePushTokenAsync();
        await apiFetch("/register-push", {
          method: "POST",
          body: JSON.stringify({
            user_id: user.user_id,
            platform: Platform.OS,
            device_token: token.data,
          }),
        });
        setPushStatus("ready");
      } catch {
        setPushStatus("error");
      }
    })();
  }, [user]);

  const sendTest = async () => {
    setMsg(null);
    try {
      await apiFetch("/reminders/test", { method: "POST" });
      setMsg("Test reminder queued. Build the app to receive on device.");
    } catch (e: any) {
      setMsg(e?.message || "Failed");
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>PROFILE</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}>
        <View style={styles.card}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={32} color={colors.brand} />
          </View>
          <Text style={styles.name} testID="profile-name">{user?.name || "—"}</Text>
          <Text style={styles.email} testID="profile-email">{user?.email}</Text>
        </View>

        <Text style={styles.sectionTitle}>NOTIFICATIONS</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Ionicons name="notifications" size={20} color={colors.brand} />
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={styles.rowTitle}>Push reminders</Text>
              <Text style={styles.rowSub}>
                {pushStatus === "ready"
                  ? "Active for this device"
                  : pushStatus === "denied"
                  ? "Permission denied"
                  : pushStatus === "registering"
                  ? "Registering…"
                  : pushStatus === "error"
                  ? "Tap to retry on next open"
                  : "Available after device build"}
              </Text>
            </View>
          </View>
          <Pressable testID="profile-test-push" onPress={sendTest} style={styles.secBtn}>
            <Ionicons name="send" size={14} color={colors.brand} />
            <Text style={styles.secBtnTxt}>SEND TEST REMINDER</Text>
          </Pressable>
          {msg ? <Text style={styles.msg}>{msg}</Text> : null}
        </View>

        <Text style={styles.sectionTitle}>ABOUT</Text>
        <View style={styles.card}>
          <Text style={styles.about}>
            DealHawk AI never connects to Facebook, does not scrape Marketplace, and does not contact
            sellers on your behalf. You enter listings manually — we score them.
          </Text>
        </View>

        <Pressable testID="profile-logout" onPress={logout} style={styles.logout}>
          <Ionicons name="log-out" size={18} color={colors.error} />
          <Text style={styles.logoutTxt}>LOG OUT</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  title: { color: colors.onSurface, fontSize: 22, fontWeight: "800", letterSpacing: 3 },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  name: { color: colors.onSurface, fontSize: 20, fontWeight: "800" },
  email: { color: colors.onSurfaceTertiary, fontSize: 13, marginTop: 4 },
  sectionTitle: {
    color: colors.onSurfaceTertiary,
    fontSize: 11,
    letterSpacing: 1.5,
    fontWeight: "700",
    marginBottom: spacing.sm,
  },
  row: { flexDirection: "row", alignItems: "center" },
  rowTitle: { color: colors.onSurface, fontSize: 14, fontWeight: "700" },
  rowSub: { color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 2 },
  secBtn: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.md,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.brandTertiary,
  },
  secBtnTxt: { color: colors.brand, fontWeight: "800", letterSpacing: 1.5, fontSize: 12 },
  msg: { color: colors.success, fontSize: 12, marginTop: spacing.sm, textAlign: "center" },
  about: { color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 20 },
  logout: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.error,
  },
  logoutTxt: { color: colors.error, fontWeight: "800", letterSpacing: 1.5 },
});
