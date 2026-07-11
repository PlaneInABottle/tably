/* eslint-disable import/first */
/**
 * Welcome to the main entry point of the app. In this file, we'll
 * be kicking off our app.
 *
 * Most of this file is boilerplate and you shouldn't need to modify
 * it very often. But take some time to look through and understand
 * what is going on here.
 *
 * The app navigation resides in ./app/navigators, so head over there
 * if you're interested in adding screens and navigators.
 */
if (__DEV__) {
  // Load Reactotron in development only.
  // Note that you must be using metro's `inlineRequires` for this to work.
  // If you turn it off in metro.config.js, you'll have to manually import it.
  require("./devtools/ReactotronConfig.ts")
}
import "./utils/gestureHandler"

import { useCallback, useEffect, useState } from "react"
import { ViewStyle } from "react-native"
import { useFonts } from "expo-font"
import * as Linking from "expo-linking"
import * as SplashScreen from "expo-splash-screen"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { KeyboardProvider } from "react-native-keyboard-controller"
import { initialWindowMetrics, SafeAreaProvider } from "react-native-safe-area-context"

import { AppToasts } from "./components/AppToasts"
import { PushNotificationManager } from "./components/PushNotificationManager"
import { AuthProvider } from "./context/AuthContext"
import { initI18n } from "./i18n"
import { AppNavigator } from "./navigators/AppNavigator"
import { resetRoot, useNavigationPersistence } from "./navigators/navigationUtilities"
import { parseRecoveryLink } from "./services/auth/recoveryLink"
import { supabase } from "./services/supabase/client"
import { ThemeProvider } from "./theme/context"
import { customFontsToLoad } from "./theme/typography"
import { loadDateFnsLocale } from "./utils/formatDate"
import * as storage from "./utils/storage"

void SplashScreen.preventAutoHideAsync()

export const NAVIGATION_PERSISTENCE_KEY = "NAVIGATION_STATE"

async function createRecoverySessionFromUrl(url: string) {
  const recoveryLink = parseRecoveryLink(url)
  if (!recoveryLink.ok) return

  const { error } = await supabase.auth.setSession({
    access_token: recoveryLink.accessToken,
    refresh_token: recoveryLink.refreshToken,
  })
  if (error) return

  resetRoot({ index: 0, routes: [{ name: "UpdatePassword" }] })
}

// Web linking configuration
const prefix = Linking.createURL("/")
const appSchemePrefix = "tably://"
const config = {
  screens: {
    Auth: {
      screens: {
        SignIn: "",
        SignUp: "sign-up",
        ForgotPassword: "forgot-password",
      },
    },
    UpdatePassword: "update-password",
    ChangePassword: "change-password",
    Main: {
      screens: {
        Today: "today",
        CreateTable: "create",
        Chats: "chats",
        Profile: "profile",
      },
    },
    TableDetail: "table/:tableId",
    Settings: "settings",
  },
}

/**
 * This is the root component of our app.
 * @param {AppProps} props - The props for the `App` component.
 * @returns {JSX.Element} The rendered `App` component.
 */
export function App() {
  const {
    initialNavigationState,
    onNavigationStateChange,
    isRestored: isNavigationStateRestored,
  } = useNavigationPersistence(storage, NAVIGATION_PERSISTENCE_KEY)

  const [areFontsLoaded, fontLoadError] = useFonts(customFontsToLoad)
  const [isI18nInitialized, setIsI18nInitialized] = useState(false)

  useEffect(() => {
    let isActive = true

    async function initializeI18n() {
      try {
        await initI18n()
      } catch (error) {
        console.error("Failed to initialize i18n", error)
      } finally {
        loadDateFnsLocale()
        if (isActive) setIsI18nInitialized(true)
      }
    }

    void initializeI18n()
    return () => {
      isActive = false
    }
  }, [])

  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      if (url) void createRecoverySessionFromUrl(url)
    })

    const subscription = Linking.addEventListener("url", ({ url }) => {
      void createRecoverySessionFromUrl(url)
    })

    return () => subscription.remove()
  }, [])

  const isAppReady =
    isNavigationStateRestored && isI18nInitialized && (areFontsLoaded || !!fontLoadError)

  const handleRootLayout = useCallback(() => {
    if (isAppReady) void SplashScreen.hideAsync()
  }, [isAppReady])

  // Before we show the app, we have to wait for our state to be ready.
  // In the meantime, don't render anything. This will be the background
  // color set in native by rootView's background color.
  // In iOS: application:didFinishLaunchingWithOptions:
  // In Android: https://stackoverflow.com/a/45838109/204044
  // You can replace with your own loading component if you wish.
  if (!isAppReady) return null

  const linking = {
    prefixes: [prefix, appSchemePrefix],
    config,
  }

  // otherwise, we're ready to render the app
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <GestureHandlerRootView style={$gestureRoot} onLayout={handleRootLayout}>
        <KeyboardProvider>
          <AuthProvider>
            <ThemeProvider>
              <AppNavigator
                linking={linking}
                initialState={initialNavigationState}
                onStateChange={onNavigationStateChange}
              />
              <PushNotificationManager />
              <AppToasts />
            </ThemeProvider>
          </AuthProvider>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  )
}

const $gestureRoot: ViewStyle = { flex: 1 }
