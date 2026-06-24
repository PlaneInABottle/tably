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

export type ChatStackParamList = {
  ConversationList: undefined
  ConversationDetail: {
    conversationId: string
    opponentUserId?: string
    opponentDisplayName?: string
  }
}

export type MainTabParamList = {
  Map: undefined
  DiveEvent: undefined
  Chat: NavigatorScreenParams<ChatStackParamList> | undefined
  Profile: undefined
  Settings: undefined
}

export type DemoTabParamList = MainTabParamList & {
  DemoCommunity: undefined
  DemoShowroom: { queryIndex?: string; itemIndex?: string }
  DemoDebug: undefined
  DemoPodcastList: undefined
}

// App Stack Navigator types
export type AppStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>
  UpdatePassword: undefined
  Main: NavigatorScreenParams<MainTabParamList>
  ChangePassword: undefined
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
  // 🔥 Your screens go here
  // IGNITE_GENERATOR_ANCHOR_APP_STACK_PARAM_LIST
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

export type ChatStackScreenProps<T extends keyof ChatStackParamList> = CompositeScreenProps<
  NativeStackScreenProps<ChatStackParamList, T>,
  MainTabScreenProps<"Chat">
>

export type DemoTabScreenProps<T extends keyof DemoTabParamList> = CompositeScreenProps<
  BottomTabScreenProps<DemoTabParamList, T>,
  AppStackScreenProps<keyof AppStackParamList>
>

export interface NavigationProps extends Partial<
  ComponentProps<typeof NavigationContainer<AppStackParamList>>
> {}
