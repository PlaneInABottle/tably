import { createNativeStackNavigator } from "@react-navigation/native-stack"

import { ConversationDetailScreen } from "@/screens/main/chat/ConversationDetailScreen"
import { ConversationListScreen } from "@/screens/main/chat/ConversationListScreen"
import { useAppTheme } from "@/theme/context"

import type { ChatStackParamList } from "./navigationTypes"

const Stack = createNativeStackNavigator<ChatStackParamList>()

export function ChatNavigator() {
  const {
    theme: { colors },
  } = useAppTheme()

  return (
    <Stack.Navigator
      screenOptions={{
        contentStyle: { backgroundColor: colors.background },
        headerShown: false,
      }}
    >
      <Stack.Screen name="ConversationList" component={ConversationListScreen} />
      <Stack.Screen name="ConversationDetail" component={ConversationDetailScreen} />
    </Stack.Navigator>
  )
}
