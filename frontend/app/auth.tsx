import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "@/src/contexts/AuthContext";
import { colors, spacing, radius } from "@/src/theme";

type Mode = "login" | "signup";

export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const { login, signup, loginWithGoogle } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr(null);
    setBusy(true);
    try {
      if (mode === "login") {
        await login(email.trim(), password);
      } else {
        await signup(email.trim(), password, name.trim() || undefined);
      }
    } catch (e: any) {
      setErr(e?.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setErr(null);
    setBusy(true);
    try {
      await loginWithGoogle();
    } catch (e: any) {
      setErr(e?.message || "Google login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <LinearGradient
          colors={[colors.brand, colors.brandSecondary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.logoBadge}
        >
          <Ionicons name="flash" size={32} color="#fff" />
        </LinearGradient>
        <Text style={styles.brand} testID="auth-brand">DEALHAWK AI</Text>
        <Text style={styles.tagline}>Strike on profitable Marketplace deals.</Text>

        <View style={styles.tabs} testID="auth-mode-tabs">
          <Pressable
            testID="auth-tab-login"
            style={[styles.tabBtn, mode === "login" && styles.tabBtnActive]}
            onPress={() => setMode("login")}
          >
            <Text style={[styles.tabTxt, mode === "login" && styles.tabTxtActive]}>LOG IN</Text>
          </Pressable>
          <Pressable
            testID="auth-tab-signup"
            style={[styles.tabBtn, mode === "signup" && styles.tabBtnActive]}
            onPress={() => setMode("signup")}
          >
            <Text style={[styles.tabTxt, mode === "signup" && styles.tabTxtActive]}>SIGN UP</Text>
          </Pressable>
        </View>

        {mode === "signup" && (
          <TextInput
            testID="auth-input-name"
            value={name}
            onChangeText={setName}
            placeholder="Name (optional)"
            placeholderTextColor={colors.onSurfaceTertiary}
            style={styles.input}
            autoCapitalize="words"
          />
        )}
        <TextInput
          testID="auth-input-email"
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor={colors.onSurfaceTertiary}
          style={styles.input}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          testID="auth-input-password"
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor={colors.onSurfaceTertiary}
          style={styles.input}
          secureTextEntry
        />

        {err ? (
          <Text testID="auth-error" style={styles.error}>
            {err}
          </Text>
        ) : null}

        <Pressable
          testID="auth-submit-button"
          style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
          onPress={submit}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnTxt}>
              {mode === "login" ? "LOG IN" : "CREATE ACCOUNT"}
            </Text>
          )}
        </Pressable>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerTxt}>OR</Text>
          <View style={styles.dividerLine} />
        </View>

        <Pressable testID="auth-google-button" style={styles.googleBtn} onPress={google} disabled={busy}>
          <Ionicons name="logo-google" size={18} color={colors.onSurface} />
          <Text style={styles.googleTxt}>Continue with Google</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scroll: { paddingHorizontal: spacing.xl, alignItems: "stretch" },
  logoBadge: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: spacing.lg,
  },
  brand: {
    color: colors.onSurface,
    fontSize: 32,
    letterSpacing: 4,
    textAlign: "center",
    fontWeight: "800",
  },
  tagline: {
    color: colors.onSurfaceTertiary,
    fontSize: 14,
    textAlign: "center",
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  tabs: {
    flexDirection: "row",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: 4,
    marginBottom: spacing.lg,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: radius.sm,
  },
  tabBtnActive: { backgroundColor: colors.brand },
  tabTxt: { color: colors.onSurfaceTertiary, fontWeight: "700", letterSpacing: 2, fontSize: 12 },
  tabTxtActive: { color: "#fff" },
  input: {
    backgroundColor: colors.surfaceSecondary,
    color: colors.onSurface,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderRadius: radius.md,
    marginBottom: spacing.md,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.border,
  },
  primaryBtn: {
    backgroundColor: colors.brand,
    paddingVertical: 16,
    borderRadius: radius.md,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  primaryBtnTxt: { color: "#fff", fontWeight: "800", letterSpacing: 2, fontSize: 14 },
  divider: { flexDirection: "row", alignItems: "center", marginVertical: spacing.lg },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerTxt: { color: colors.onSurfaceTertiary, marginHorizontal: spacing.md, fontSize: 12 },
  googleBtn: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  googleTxt: { color: colors.onSurface, fontWeight: "600", fontSize: 14 },
  error: {
    color: colors.error,
    backgroundColor: "rgba(239,68,68,0.1)",
    padding: spacing.md,
    borderRadius: radius.sm,
    marginBottom: spacing.md,
    fontSize: 13,
  },
});
