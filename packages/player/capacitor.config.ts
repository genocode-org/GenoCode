import type { CapacitorConfig } from "@capacitor/cli";

// The phone app around the player: the built player (dist/) shown full-screen on Android and iOS.
const config: CapacitorConfig = {
  appId: "za.co.piorek.genocode.player",
  appName: "GenoCode Player",
  webDir: "dist",
  backgroundColor: "#07060d",
  android: {
    // Music starts from a tap in the player, never by itself.
    allowMixedContent: false,
  },
  ios: {
    contentInset: "never",
  },
  plugins: {
    // The player is always dark, so the phone's clock and battery are drawn light.
    SystemBars: { style: "DARK", initialViewportFitValueHint: "cover" },
  },
};

export default config;
