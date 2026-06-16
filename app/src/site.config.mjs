export const siteConfig = {
  baseDir: "dst_0",
  outDir: "dist",
  legacyCss: "legacy.css",
  legacyJs: "legacy-runtime.js",
  legacyStylesDir: "legacy-styles",
  appCss: "inner-circle.css",
  appJs: "inner-circle.js",
  partials: {
    headers: {
      ru: "partials/headers/header.ru.html",
      en: "partials/headers/header.en.html"
    }
  },
  pages: {
    "ru/kontakt/index.html": {
      contactLocation: "partials/pages/contact-location.ru.html"
    },
    "ru/veranstaltungen/index.html": {
      details: "partials/accordions/event-details.ru.html",
      footer: "partials/footers/footer.default.ru.html"
    },
    "en/event/index.html": {
      details: "partials/accordions/event-details.en.html",
      footer: "partials/footers/footer.default.en.html"
    }
  }
};
