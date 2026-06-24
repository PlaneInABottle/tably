import { createNativeStackNavigator } from "@react-navigation/native-stack"

import { ForgotPasswordScreen } from "@/screens/auth/ForgotPasswordScreen"
import { SignInScreen } from "@/screens/auth/SignInScreen"
import { SignUpScreen } from "@/screens/auth/SignUpScreen"

import type { AuthStackParamList } from "./navigationTypes"

const Stack = createNativeStackNavigator<AuthStackParamList>()

export function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SignIn" component={SignInScreen} />
      <Stack.Screen name="SignUp" component={SignUpScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </Stack.Navigator>
  )
}
