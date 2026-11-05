import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.dino.audio",
  appName: "DiNo",
  webDir: "out",
  plugins: {
    FirebaseAuthentication: {
      providers: ["google.com"],
      skipNativeAuth: true
    }
  },
  android: {
    allowMixedContent: false
  }
};

export default config;
