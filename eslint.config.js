// eslint.config.js
// Qué hace: reglas del revisor de código (ESLint) que comprueba el estilo y fallos comunes; usa las de Expo
//   y no revisa dist/ (lo compilado) ni «Claude outputs/» (copias viejas).
// Conectado con: lo usa `npm run lint` (expo lint, en package.json); usa eslint y eslint-config-expo
//   (devDependencies de package.json).

// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // "Claude outputs/" son copias antiguas de pantallas que ya no se usan (no las importa nadie).
    ignores: ['dist/*', 'Claude outputs/**'],
  },
]);
