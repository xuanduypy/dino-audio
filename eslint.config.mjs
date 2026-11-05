import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  {
    // Keep existing effect/ref patterns out of scope for this dependency upgrade.
    rules: {
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off"
    }
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"])
]);

export default eslintConfig;
