export default {
  contextSeparator: "_",
  createOldCatalogs: false,
  defaultNamespace: "common",
  keepRemoved: true,
  keySeparator: ".",
  lexers: {
    ts: ["JavascriptLexer"],
    tsx: ["JsxLexer"],
  },
  locales: ["ca", "es", "en"],
  namespaceSeparator: ":",
  output: "packages/i18n/src/locales/$LOCALE/$NAMESPACE.json",
  sort: true,
};
