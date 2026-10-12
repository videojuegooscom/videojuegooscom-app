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
