// babel.config.js
// Qué hace: le dice a Babel (el traductor del código) cómo preparar la tienda: preset de Expo, el atajo
//   «@/» para importar desde la raíz y el complemento de animaciones de Reanimated.
// Conectado con: lo usa Metro al compilar o arrancar (npm run build, expo start, en package.json); el alias
//   «@/» es el mismo que «paths» de tsconfig.json; usa babel-preset-expo, babel-plugin-module-resolver y
//   react-native-reanimated. infraestructura/publicacion/test_controlador.py lo usa como ruta de ejemplo.
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
