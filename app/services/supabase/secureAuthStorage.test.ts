import * as SecureStore from "expo-secure-store"
import AsyncStorage from "@react-native-async-storage/async-storage"

import { secureAuthStorage } from "./secureAuthStorage"

const mockSecureStore = new Map<string, string>()
const mockAsyncStorage = new Map<string, string>()

jest.mock("expo-secure-store", () => ({
  deleteItemAsync: jest.fn(async (key: string) => {
    mockSecureStore.delete(key)
  }),
  getItemAsync: jest.fn(async (key: string) => mockSecureStore.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSecureStore.set(key, value)
  }),
}))

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockAsyncStorage.get(key) ?? null),
    removeItem: jest.fn(async (key: string) => {
      mockAsyncStorage.delete(key)
    }),
    setItem: jest.fn(async (key: string, value: string) => {
      mockAsyncStorage.set(key, value)
    }),
  },
}))

describe("secureAuthStorage", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSecureStore.clear()
    mockAsyncStorage.clear()
  })

  it("round-trips encrypted values", async () => {
    await secureAuthStorage.setItem("supabase-auth-token", "session-json")

    await expect(secureAuthStorage.getItem("supabase-auth-token")).resolves.toBe("session-json")
    expect(mockAsyncStorage.get("supabase-auth-token")).not.toBe("session-json")
  })

  it("removes corrupt encrypted values and returns null", async () => {
    await AsyncStorage.setItem("supabase-auth-token", "not-hex")
    await SecureStore.setItemAsync("supabase-auth-key-supabase-auth-token", "not-hex")

    await expect(secureAuthStorage.getItem("supabase-auth-token")).resolves.toBeNull()
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith("supabase-auth-token")
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
      "supabase-auth-key-supabase-auth-token",
    )
  })
})
