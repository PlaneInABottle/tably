import * as SecureStore from "expo-secure-store"
import AsyncStorage from "@react-native-async-storage/async-storage"
import * as aesjs from "aes-js"

type SupabaseStorageValue = string | null

const encryptionKeyPrefix = "supabase-auth-key-"

function secureKeyFor(storageKey: string): string {
  return `${encryptionKeyPrefix}${storageKey}`.replace(/[^A-Za-z0-9._-]/g, "-")
}

function generateEncryptionKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(256 / 8))
}

function encryptValue(encryptionKey: Uint8Array, value: string): string {
  const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1))
  const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value))

  return aesjs.utils.hex.fromBytes(encryptedBytes)
}

function decryptValue(encryptionKeyHex: string, value: string): string {
  const cipher = new aesjs.ModeOfOperation.ctr(
    aesjs.utils.hex.toBytes(encryptionKeyHex),
    new aesjs.Counter(1),
  )
  const decryptedBytes = cipher.decrypt(aesjs.utils.hex.toBytes(value))

  return aesjs.utils.utf8.fromBytes(decryptedBytes)
}

async function persistEncryptionKey(storageKey: string, encryptionKey: Uint8Array): Promise<void> {
  await SecureStore.setItemAsync(secureKeyFor(storageKey), aesjs.utils.hex.fromBytes(encryptionKey))
}

async function readEncryptionKey(storageKey: string): Promise<SupabaseStorageValue> {
  return SecureStore.getItemAsync(secureKeyFor(storageKey))
}

export const secureAuthStorage = {
  async getItem(key: string): Promise<SupabaseStorageValue> {
    const encrypted = await AsyncStorage.getItem(key)
    if (!encrypted) return encrypted

    const encryptionKeyHex = await readEncryptionKey(key)
    if (!encryptionKeyHex) return null

    try {
      return decryptValue(encryptionKeyHex, encrypted)
    } catch {
      await this.removeItem(key)
      return null
    }
  },

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key)
    await SecureStore.deleteItemAsync(secureKeyFor(key))
  },

  async setItem(key: string, value: string): Promise<void> {
    const encryptionKey = generateEncryptionKey()
    const encrypted = encryptValue(encryptionKey, value)

    await persistEncryptionKey(key, encryptionKey)
    await AsyncStorage.setItem(key, encrypted)
  },
}
