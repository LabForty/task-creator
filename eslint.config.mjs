import next from "eslint-config-next";

const config = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  ...next,
];

export default config;
