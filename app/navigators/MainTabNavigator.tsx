import { TextStyle, ViewStyle } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { CreateTableScreen } from "@/screens/main/CreateTableScreen"
import { ProfileScreen } from "@/screens/main/ProfileScreen"
import { TableChatsScreen } from "@/screens/main/TableChatsScreen"
import { TodayScreen } from "@/screens/main/TodayScreen"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import type { MainTabParamList } from "./navigationTypes"

type IoniconName = React.ComponentProps<typeof Ionicons>["name"]

type TabIconRoute = keyof MainTabParamList

const TAB_ICON_NAMES: Record<TabIconRoute, { focused: IoniconName; unfocused: IoniconName }> = {
  Today: { focused: "flash", unfocused: "flash-outline" },
  CreateTable: { focused: "add-circle", unfocused: "add-circle-outline" },
  Chats: { focused: "chatbubbles", unfocused: "chatbubbles-outline" },
  Profile: { focused: "person-circle", unfocused: "person-circle-outline" },
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
        name="Today"
        component={TodayScreen}
        options={{
          tabBarButtonTestID: "tab-today",
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons
              name={
                (focused
                  ? TAB_ICON_NAMES.Today.focused
                  : TAB_ICON_NAMES.Today.unfocused) as IoniconName
              }
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tab.Screen
        name="CreateTable"
        component={CreateTableScreen}
        options={{
          title: "Create",
          tabBarButtonTestID: "tab-create",
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons
              name={
                (focused
                  ? TAB_ICON_NAMES.CreateTable.focused
                  : TAB_ICON_NAMES.CreateTable.unfocused) as IoniconName
              }
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Chats"
        component={TableChatsScreen}
        options={{
          tabBarButtonTestID: "tab-chats",
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons
              name={
                (focused
                  ? TAB_ICON_NAMES.Chats.focused
                  : TAB_ICON_NAMES.Chats.unfocused) as IoniconName
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
