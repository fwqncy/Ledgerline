// PostCSS for the developer portal only. Turbopack looks for a PostCSS config at the
// project root first and falls back to the CSS file's own folder; the console has no
// root config, so this applies to developers.css and nothing else. The console's own
// stylesheets keep Next's default PostCSS pipeline.
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
