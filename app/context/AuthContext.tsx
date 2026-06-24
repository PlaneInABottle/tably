import {
  createContext,
  FC,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react"
import type { Session, User } from "@supabase/supabase-js"

import * as authService from "@/services/auth/authService"
import type { Profile, ProfilePatch } from "@/services/profiles/profileService"
import * as profileService from "@/services/profiles/profileService"
import { supabase } from "@/services/supabase/client"
import * as storage from "@/utils/storage"

export type AuthStatus = "initializing" | "signedOut" | "signedIn"

export type AuthContextType = {
  status: AuthStatus
  session: Session | null
  user: User | null
  profile: Profile | null
  authError: string | null
  isAuthenticated: boolean
  refreshProfile: () => Promise<void>
  signIn: (email: string, password: string) => ReturnType<typeof authService.signInWithPassword>
  signUp: (
    email: string,
    password: string,
    displayName?: string,
  ) => ReturnType<typeof authService.signUpWithPassword>
  sendPasswordReset: (email: string) => Promise<authService.AuthResult>
  updatePassword: (password: string) => Promise<authService.AuthResult>
  updateProfile: (patch: ProfilePatch) => Promise<profileService.ServiceResult<Profile>>
  signOut: () => Promise<authService.AuthResult>
  logout: () => void
}

export const AuthContext = createContext<AuthContextType | null>(null)

export interface AuthProviderProps {}

function removeLegacyAuthKeys(): void {
  storage.remove("AuthProvider.authToken")
  storage.remove("AuthProvider.authEmail")
}

export const AuthProvider: FC<PropsWithChildren<AuthProviderProps>> = ({ children }) => {
  const [status, setStatus] = useState<AuthStatus>("initializing")
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)

  const loadProfile = useCallback(async (activeUser: User | null) => {
    if (!activeUser) {
      setProfile(null)
      return
    }

    const result = await profileService.getOwnProfile(activeUser.id)
    if (result.ok) {
      setProfile(result.data)
      setAuthError(null)
      return
    }

    setProfile(null)
    setAuthError(result.error)
  }, [])

  const applySession = useCallback(
    async (nextSession: Session | null) => {
      setSession(nextSession)
      setUser(nextSession?.user ?? null)

      if (!nextSession?.user) {
        setProfile(null)
        setStatus("signedOut")
        return
      }

      setStatus("signedIn")
      await loadProfile(nextSession.user)
    },
    [loadProfile],
  )

  useEffect(() => {
    removeLegacyAuthKeys()

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) setAuthError(error.message)
      applySession(data.session)
    })

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      applySession(nextSession)
    })

    return () => data.subscription.unsubscribe()
  }, [applySession])

  const refreshProfile = useCallback(async () => {
    await loadProfile(user)
  }, [loadProfile, user])

  const signIn = useCallback(async (email: string, password: string) => {
    setAuthError(null)
    const result = await authService.signInWithPassword(email, password)
    if (!result.ok) setAuthError(result.error)
    return result
  }, [])

  const signUp = useCallback(async (email: string, password: string, displayName?: string) => {
    setAuthError(null)
    const result = await authService.signUpWithPassword(email, password, displayName)
    if (!result.ok) setAuthError(result.error)
    return result
  }, [])

  const sendPasswordReset = useCallback(async (email: string) => {
    setAuthError(null)
    const result = await authService.sendPasswordReset(email)
    if (!result.ok) setAuthError(result.error)
    return result
  }, [])

  const updatePassword = useCallback(async (password: string) => {
    setAuthError(null)
    const result = await authService.updatePassword(password)
    if (!result.ok) setAuthError(result.error)
    return result
  }, [])

  const updateProfile = useCallback(
    async (patch: ProfilePatch) => {
      if (!user)
        return { ok: false, error: "You must be signed in to update your profile." } as const

      const result = await profileService.updateOwnProfile(user.id, patch)
      if (result.ok) setProfile(result.data)
      if (!result.ok) setAuthError(result.error)
      return result
    },
    [user],
  )

  const signOut = useCallback(async () => {
    setAuthError(null)
    const result = await authService.signOut()
    if (!result.ok) {
      setAuthError(result.error)
      return result
    }

    setSession(null)
    setUser(null)
    setProfile(null)
    setStatus("signedOut")
    return result
  }, [])

  const logout = useCallback(() => {
    signOut()
  }, [signOut])

  const value: AuthContextType = {
    status,
    session,
    user,
    profile,
    authError,
    isAuthenticated: status === "signedIn",
    refreshProfile,
    signIn,
    signUp,
    sendPasswordReset,
    updatePassword,
    updateProfile,
    signOut,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used within an AuthProvider")
  return context
}
