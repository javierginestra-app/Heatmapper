// Expo SDK 52 resolves the "@/*" tsconfig path alias in Metro natively.
module.exports = function (api) {
  api.cache(true);
  return { presets: ['babel-preset-expo'] };
};
