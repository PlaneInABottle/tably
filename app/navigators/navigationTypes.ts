import { ComponentProps } from "react"
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs"
import {
  CompositeScreenProps,
  NavigationContainer,
  NavigatorScreenParams,
} from "@react-navigation/native"
import { NativeStackScreenProps } from "@react-navigation/native-stack"

export type AuthStackParamList = {
  SignIn: undefined
  SignUp: undefined
  ForgotPassword: undefined
}

export type MainTabParamList = {
  Today: undefined
  CreateTable: undefined
  Chats: undefined
  Profile: undefined
}

// App Stack Navigator types
export type AppStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>
  UpdatePassword: undefined
  Main: NavigatorScreenParams<MainTabParamList>
  ChangePassword: undefined
  Settings: undefined
  TableDetail: {
    tableId: string
  }
  LocationPicker:
    | {
        initialLatitude?: number
        initialLongitude?: number
        mode?: "create" | "edit"
        locationId?: string
        initialLabel?: string
        returnTo?: "Map" | "DiveEvent" | "Profile"
      }
    | undefined
}

export type AppStackScreenProps<T extends keyof AppStackParamList> = NativeStackScreenProps<
  AppStackParamList,
  T
>

export type AuthStackScreenProps<T extends keyof AuthStackParamList> = CompositeScreenProps<
  NativeStackScreenProps<AuthStackParamList, T>,
  AppStackScreenProps<keyof AppStackParamList>
>

export type MainTabScreenProps<T extends keyof MainTabParamList> = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, T>,
  AppStackScreenProps<keyof AppStackParamList>
>

export interface NavigationProps extends Partial<
  ComponentProps<typeof NavigationContainer<AppStackParamList>>
> {}
