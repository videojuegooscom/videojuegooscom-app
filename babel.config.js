module.exports = function (api) {
  api.cache(true);

  return {
    presets: ["babel-preset-expo"],
    plugins: [      // Alias @/ para que Metro (web/native) resuelva rutas igual que TypeScript
      [
        "module-resolver",
        {
          root: ["./"],
          alias: {
            "@": "./",
          },
          extensions: [
            ".tsx",
            ".ts",
            ".js",
            ".jsx",
            ".json",
            ".web.ts",
            ".web.tsx",
          ],
        },
      ],

      // Si usas Reanimated (tú lo tienes), este plugin debe ir el ÚLTIMO
      "react-native-reanimated/plugin",
    ],
  };
};
