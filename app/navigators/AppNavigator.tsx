import { NavigationContainer } from "@react-navigation/native"
import { createNativeStackNavigator } from "@react-navigation/native-stack"

import Config from "@/config"
import { useAuth } from "@/context/AuthContext"
import { UpdatePasswordScreen } from "@/screens/auth/UpdatePasswordScreen"
import { ErrorBoundary } from "@/screens/ErrorScreen/ErrorBoundary"
import { ChangePasswordScreen } from "@/screens/main/ChangePasswordScreen"
import { LocationPickerScreen } from "@/screens/main/LocationPickerScreen"
import { SettingsScreen } from "@/screens/main/SettingsScreen"
import { TableDetailScreen } from "@/screens/main/TableDetailScreen"
import { useAppTheme } from "@/theme/context"

import { AuthNavigator } from "./AuthNavigator"
import { MainTabNavigator } from "./MainTabNavigator"
import type { AppStackParamList, NavigationProps } from "./navigationTypes"
import { navigationRef, useBackButtonHandler } from "./navigationUtilities"

const exitRoutes = Config.exitRoutes

const Stack = createNativeStackNavigator<AppStackParamList>()

const AppStack = () => {
  const { status } = useAuth()
  const {
    theme: { colors },
  } = useAppTheme()

  if (status === "initializing") return null

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        navigationBarColor: colors.background,
        contentStyle: { backgroundColor: colors.background },
      }}
      initialRouteName={status === "signedIn" ? "Main" : "Auth"}
    >
      {status === "signedIn" ? (
        <>
          <Stack.Screen name="Main" component={MainTabNavigator} />
          <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="TableDetail" component={TableDetailScreen} />
          <Stack.Screen name="LocationPicker" component={LocationPickerScreen} />
        </>
      ) : (
        <Stack.Screen name="Auth" component={AuthNavigator} />
      )}
      <Stack.Screen name="UpdatePassword" component={UpdatePasswordScreen} />
    </Stack.Navigator>
  )
}

export const AppNavigator = (props: NavigationProps) => {
  const { navigationTheme } = useAppTheme()

  useBackButtonHandler((routeName) => exitRoutes.includes(routeName))

  return (
    <NavigationContainer ref={navigationRef} theme={navigationTheme} {...props}>
      <ErrorBoundary catchErrors={Config.catchErrors}>
        <AppStack />
      </ErrorBoundary>
    </NavigationContainer>
  )
}
