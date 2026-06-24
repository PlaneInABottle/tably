import { TextStyle, ViewStyle } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { ChatNavigator } from "@/navigators/ChatNavigator"
import { DiveEventScreen } from "@/screens/main/DiveEventScreen"
import { MapScreen } from "@/screens/main/MapScreen"
import { ProfileScreen } from "@/screens/main/ProfileScreen"
import { SettingsScreen } from "@/screens/main/SettingsScreen"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { handleChatTabPress } from "./chatTabPress"
import type { MainTabParamList } from "./navigationTypes"

type IoniconName = React.ComponentProps<typeof Ionicons>["name"]

type TabIconRoute = keyof MainTabParamList

const TAB_ICON_NAMES: Record<TabIconRoute, { focused: IoniconName; unfocused: IoniconName }> = {
  Map: { focused: "map", unfocused: "map-outline" },
  DiveEvent: { focused: "water", unfocused: "water-outline" },
  Chat: { focused: "chatbubbles", unfocused: "chatbubbles-outline" },
  Profile: { focused: "person-circle", unfocused: "person-circle-outline" },
  Settings: { focused: "settings", unfocused: "settings-outline" },
}

const Tab = createBottomTabNavigator<MainTabParamList>()

export function MainTabNavigator() {
  const { bottom } = useSafeAreaInsets()
  const {
    themed,
    theme: { colors },
  } = useAppTheme()

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarStyle: themed([$tabBar, { height: bottom + 70 }]),
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textDim,
        tabBarLabelStyle: themed($tabBarLabel),
        tabBarItemStyle: themed($tabBarItem),
      }}
    >
      <Tab.Screen
        name="Map"
        component={MapScreen}
        options={{
          tabBarButtonTestID: "tab-map",
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons
              name={
                (focused ? TAB_ICON_NAMES.Map.focused : TAB_ICON_NAMES.Map.unfocused) as IoniconName
              }
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tab.Screen
        name="DiveEvent"
        component={DiveEventScreen}
        options={{
          title: "Dive",
          tabBarButtonTestID: "tab-dive",
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons
              name={
                (focused
                  ? TAB_ICON_NAMES.DiveEvent.focused
                  : TAB_ICON_NAMES.DiveEvent.unfocused) as IoniconName
              }
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Chat"
        component={ChatNavigator}
        listeners={({ navigation }) => ({
          tabPress: (event) => handleChatTabPress(event, navigation),
        })}
        options={{
          tabBarButtonTestID: "tab-chat",
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons
              name={
                (focused
                  ? TAB_ICON_NAMES.Chat.focused
                  : TAB_ICON_NAMES.Chat.unfocused) as IoniconName
              }
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarButtonTestID: "tab-profile",
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons
              name={
                (focused
                  ? TAB_ICON_NAMES.Profile.focused
                  : TAB_ICON_NAMES.Profile.unfocused) as IoniconName
              }
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarButtonTestID: "tab-settings",
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons
              name={
                (focused
                  ? TAB_ICON_NAMES.Settings.focused
                  : TAB_ICON_NAMES.Settings.unfocused) as IoniconName
              }
              size={size}
              color={color}
            />
          ),
        }}
      />
    </Tab.Navigator>
  )
}

const $tabBar: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.background,
  borderTopColor: colors.separator,
})

const $tabBarItem: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingTop: spacing.sm,
})

const $tabBarLabel: ThemedStyle<TextStyle> = ({ typography }) => ({
  fontSize: 12,
  fontFamily: typography.primary.medium,
  lineHeight: 16,
})
