const palette = {
  neutral900: "#FFFFFF",
  neutral800: "#F2F2F5",
  neutral700: "#D0D1D8",
  neutral600: "#A3A5B2",
  neutral500: "#696C7B",
  neutral400: "#3A3C49",
  neutral300: "#292A34",
  neutral200: "#1B1C23",
  neutral100: "#111116",

  primary600: "#FCE4E9",
  primary500: "#F07A91",
  primary400: "#E35C78",
  primary300: "#C83E5A",
  primary200: "#8F293E",
  primary100: "#611C2C",

  secondary500: "#8CD6C9",
  secondary400: "#57BCAA",
  secondary300: "#299483",
  secondary200: "#1B6E62",
  secondary100: "#164E47",

  accent500: "#F5CE70",
  accent400: "#E8B743",
  accent300: "#C58D1D",
  accent200: "#8A6013",
  accent100: "#5A3D0D",

  angry100: "#4D2026",
  angry500: "#FF8B91",

  overlay20: "rgba(0, 0, 0, 0.2)",
  overlay50: "rgba(0, 0, 0, 0.5)",
} as const

export const colors = {
  palette,
  transparent: "rgba(0, 0, 0, 0)",
  text: palette.neutral800,
  textDim: palette.neutral600,
  background: palette.neutral200,
  border: palette.neutral400,
  tint: palette.primary500,
  tintInactive: palette.neutral300,
  separator: palette.neutral300,
  error: palette.angry500,
  errorBackground: palette.angry100,
} as const
