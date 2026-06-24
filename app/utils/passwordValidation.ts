export type PasswordValidationError = "passwordTooShort" | "passwordMismatch"

export function validatePasswordPair(
  password: string,
  confirmation: string,
): PasswordValidationError | null {
  if (password.length < 6) return "passwordTooShort"
  if (password !== confirmation) return "passwordMismatch"

  return null
}
