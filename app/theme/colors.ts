const palette = {
  neutral100: "#FFFFFF",
  neutral200: "#F7F7FA",
  neutral300: "#E4E5EB",
  neutral400: "#C6C8D1",
  neutral500: "#9295A2",
  neutral600: "#5D606C",
  neutral700: "#3A3C46",
  neutral800: "#202129",
  neutral900: "#0D0E12",

  primary100: "#FCE4E9",
  primary200: "#F8BBC8",
  primary300: "#EE879C",
  primary400: "#DF5E77",
  primary500: "#C83E5A",
  primary600: "#A72F48",

  secondary100: "#DDF3EF",
  secondary200: "#AFE0D7",
  secondary300: "#72C5B6",
  secondary400: "#38A896",
  secondary500: "#187A6D",

  accent100: "#FFF2CE",
  accent200: "#FFE29A",
  accent300: "#F9C95B",
  accent400: "#EAAE2C",
  accent500: "#C9870D",

  angry100: "#FDE2E2",
  angry500: "#C93434",

  overlay20: "rgba(13, 14, 18, 0.2)",
  overlay50: "rgba(13, 14, 18, 0.5)",
} as const

export const colors = {
  /**
   * The palette is available to use, but prefer using the name.
   * This is only included for rare, one-off cases. Try to use
   * semantic names as much as possible.
   */
  palette,
  /**
   * A helper for making something see-thru.
   */
  transparent: "rgba(0, 0, 0, 0)",
  /**
   * The default text color in many components.
   */
  text: palette.neutral800,
  /**
   * Secondary text information.
   */
  textDim: palette.neutral600,
  /**
   * The default color of the screen background.
   */
  background: palette.neutral200,
  /**
   * The default border color.
   */
  border: palette.neutral400,
  /**
   * The main tinting color.
   */
  tint: palette.primary500,
  /**
   * The inactive tinting color.
   */
  tintInactive: palette.neutral300,
  /**
   * A subtle color used for lines.
   */
  separator: palette.neutral300,
  /**
   * Error messages.
   */
  error: palette.angry500,
  /**
   * Error Background.
   */
  errorBackground: palette.angry100,
} as const
