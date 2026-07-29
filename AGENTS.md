# AGENTS.md / Project Guidelines for Cloudflare Pages & Web Development

## Cloudflare Pages Deployment & Asset Management Requirements
Whenever making layout, styling, or feature changes to this repository:

1. **Self-Contained & Production-Ready Static Assets**:
   - Ensure all CSS styles, images, custom fonts, scripts, and 3D dependencies are committed directly to the project repository (`/css`, `/js`, `/models`) or loaded via robust, production-tested CDNs (e.g. unpkg / cdnjs).
   - Never rely on localhost absolute paths, missing subdirectories, or uncommitted local dev files.

2. **Cache-Busting Asset Versioning**:
   - Whenever [styles.css](file:///c:/Users/quinn/Desktop/quinnfoster-site%20PC%20FOLDER/css/styles.css) or script files in `/js` are updated, update the query version parameter in HTML link/script tags across all HTML files (e.g. `css/styles.css?v=1.4`) to prevent Cloudflare Edge CDN cache stale asset issues upon deployment.

3. **Case Sensitivity & Relative File Paths**:
   - Cloudflare Pages file serving is strict and case-sensitive (unlike local Windows environments). Ensure all HTML `href` and `src` attributes exactly match the filename casing and use relative paths (`css/styles.css`, `js/stl-generator.js`).

4. **Web Standards & Fallbacks**:
   - Ensure all modern UI components, custom properties (CSS variables), glassmorphism effects, and 3D preview containers have appropriate fallbacks so styles load consistently across all browsers on Cloudflare Pages.

5. **Minimal Automated Testing**:
   - Do not run automated test suites, browser subagents, or verification loops for simple UI/CSS or minor changes. Only run tests when explicitly requested by the user or when strictly necessary for complex logic changes.
