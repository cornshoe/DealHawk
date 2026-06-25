import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "@/src/contexts/AuthContext";
import { colors } from "@/src/theme";

export default function Index() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <View
        testID="splash-loader"
        style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}
      >
        <ActivityIndicator color={colors.brand} size="large" />
      </View>
    );
  }
  return <Redirect href={user ? "/(tabs)/dashboard" : "/auth"} />;
}
