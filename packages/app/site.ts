// The website's own pages, around the app: the documentation, the credits and a page for each
// starter creature. They are plain HTML made when the app is built (and on request while
// developing), so search engines can read them. This file has what they share.

/** Where the website lives, for search engines and link previews, which need full addresses. */
export const SITE = "https://genocode.piorek.co.za/";

/** The footer's copyright line, for a page whose way up to the website's root is `up`. */
const copyright = (up: string) =>
  `© 2026 Jan Piorek · <a href="${up}license.txt">MIT License</a> · <a href="${up}licenses.txt">Third-party licences</a>`;

/** A file of the website: where it's published, and how to make it. */
export interface SiteFile {
  path: string;
  type: string;
  make(): string | Uint8Array;
  /** For a page: the file in the repo its words come from, so the sitemap can date the page. */
  source?: string;
}

/** The address of a page, as search engines should list it. */
export function address(path: string): string {
  return SITE + path.replace(/(^|\/)index\.html$/, "$1");
}

/** The way back up to the website's root from a page, such as `../` from `docs/language.html`. */
export function root(path: string): string {
  return "../".repeat(path.split("/").length - 1);
}

/** Escapes text for HTML, in content and in attribute values. */
export function escape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** A page for the sitemap: its published path, and the day its words last changed, if known. */
export interface SitemapPage {
  path: string;
  modified?: string | undefined;
}

/**
 * The sitemap: every page of the website, so search engines find them all, each with the day it
 * last changed, so they know which pages to read again.
 */
export function sitemap(pages: readonly SitemapPage[]): string {
  const url = (p: SitemapPage) => {
    const lastmod = p.modified ? `<lastmod>${p.modified}</lastmod>` : "";
    return `  <url><loc>${address(p.path)}</loc>${lastmod}</url>`;
  };
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(url).join("\n")}
</urlset>
`;
}

const STYLE = `
:root { color-scheme: dark; --bg: #0b0e17; --panel: #121725; --line: #222a3d; --text: #dfe5f2;
  --muted: #8a93a8; --accent: #f06bc0; font: 16px/1.6 system-ui, sans-serif; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); }
header { display: flex; flex-wrap: wrap; gap: 4px 16px; align-items: center; padding: 10px 16px;
  border-bottom: 1px solid var(--line); background: var(--panel); }
header a { color: var(--text); text-decoration: none; }
header a[aria-current] { color: var(--accent); }
.brand { display: flex; gap: 8px; align-items: center; letter-spacing: 0.02em; margin-right: 8px; }
/* The name as in the logo, like the front page (src/landing.css). */
.wordmark { font-size: 1.35em; background: linear-gradient(90deg, #40cfff, #ff408f);
  -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(0 0 6px rgb(64 207 255 / 0.35)) drop-shadow(0 0 10px rgb(255 64 143 / 0.25)); }
.wordmark b { font-weight: 700; } .wordmark span { font-weight: 400; }
header .button { margin-left: auto; padding: 6px 14px; white-space: nowrap; }
main { max-width: 820px; margin: 0 auto; padding: 8px 16px 64px; }
main.wide { max-width: 1160px; }
footer { border-top: 1px solid var(--line); padding: 12px 16px 24px; text-align: center;
  color: var(--muted); font-size: 0.9em; }
a { color: #6bc8f2; }
img { max-width: 100%; height: auto; }
code { font-family: ui-monospace, monospace; font-size: 0.92em; color: #f2a66b; }
/* Spaces in code show as typed (an example may be about them), and long code still wraps. */
:not(pre) > code { white-space: break-spaces; }
pre { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 12px;
  overflow-x: auto; }
pre code { color: var(--text); }
pre .k { color: #f06bc0; } pre .n { color: #f2a66b; } pre .s { color: #9be37a; }
pre .c { color: #7b8499; }
table { border-collapse: collapse; display: block; overflow-x: auto; }
th, td { border: 1px solid var(--line); padding: 4px 8px; text-align: left; vertical-align: top; }
h1, h2, h3 { line-height: 1.25; }
h2 { border-bottom: 1px solid var(--line); padding-bottom: 4px; margin-top: 2em; }
.button { display: inline-block; color: var(--text); background: #1b2133; border: 1px solid var(--line);
  border-radius: 8px; padding: 8px 18px; text-decoration: none; }
.button:hover { border-color: var(--muted); }
.button.primary { background: linear-gradient(90deg, #2a8fd6, #d63f8f); border-color: transparent;
  color: #fff; font-weight: 600; }
.button.primary:hover { filter: brightness(1.12); }
.muted { color: var(--muted); }
`;

/** A page of the website around its body: the app's colours, the top bar and the footer. */
export function shell(page: {
  path: string;
  title: string;
  description: string;
  body: string;
  /** For pages with a grid, wider than a page of text. */
  wide?: boolean;
  /** A picture for link previews, from the website's root; the front page's card if left out. */
  image?: string;
  /** More for the head, such as styles of the page's own. */
  head?: string;
}): string {
  const up = root(page.path);
  const links: [string, string][] = [
    ["docs/index.html", "Getting started"],
    ["docs/language.html", "The language"],
    ["docs/reference.html", "Reference"],
    ["creatures/index.html", "Creatures"],
  ];
  const nav = links
    .map(([to, text]) => {
      const here =
        to === page.path || (to === "creatures/index.html" && page.path.startsWith("creatures/"));
      return `<a href="${up}${to.replace(/index\.html$/, "")}"${here ? ' aria-current="page"' : ""}>${text}</a>`;
    })
    .join("");
  const image = page.image
    ? `<meta property="og:image" content="${SITE}${page.image}">
<meta name="twitter:card" content="summary">`
    : `<meta property="og:image" content="${SITE}preview.png">
<meta name="twitter:card" content="summary_large_image">`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(page.title)}</title>
<meta name="description" content="${escape(page.description)}">
<link rel="canonical" href="${address(page.path)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="GenoCode">
<meta property="og:title" content="${escape(page.title)}">
<meta property="og:description" content="${escape(page.description)}">
<meta property="og:url" content="${address(page.path)}">
${image}
<link rel="icon" href="${up}favicon.svg" type="image/svg+xml">
<style>${STYLE}</style>${page.head ?? ""}
</head>
<body>
<header>
<a class="brand" href="${up || "./"}"><img src="${up}favicon.svg" alt="" width="28" height="28"><span class="wordmark"><b>Geno</b><span>Code</span></span></a>
${nav}<a href="https://github.com/genocode-org/GenoCode">GitHub</a>
<a class="button primary" href="${up}app/">Open the app</a>
</header>
<main${page.wide ? ' class="wide"' : ""}>
${page.body}
</main>
<footer>
<p>GenoCode is inspired by <a href="${up}credits.html">DancerDNA (1999) and other work in evolutionary art</a>.</p>
<p>${copyright(up)}</p>
</footer>
</body>
</html>
`;
}
