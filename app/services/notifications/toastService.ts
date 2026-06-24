export type AppToastVariant = "success" | "error" | "info"

export interface AppToastMessage {
  id: number
  message: string
  testID?: string
  variant: AppToastVariant
  visibleMs?: number
}

type ToastListener = (toast: AppToastMessage) => void
export interface ShowToastOptions {
  testID?: string
  visibleMs?: number
}

const listeners = new Set<ToastListener>()

export function subscribeToToasts(listener: ToastListener) {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}

export function showSuccessToast(message: string, options?: ShowToastOptions) {
  showToast(message, "success", options)
}

export function showInfoToast(message: string, options?: ShowToastOptions) {
  showToast(message, "info", options)
}

function showToast(message: string, variant: AppToastVariant, options: ShowToastOptions = {}) {
  const toast = {
    id: Date.now(),
    message,
    testID: options.testID,
    variant,
    visibleMs: options.visibleMs,
  }

  listeners.forEach((listener) => listener(toast))
}
