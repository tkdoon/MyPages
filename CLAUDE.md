# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Static Japanese-language educational site hosted via GitHub Pages (`tkdoon/MyPages`). No build tools, bundlers, or package managers — just plain HTML/CSS served directly.

## Structure

- `index.html` — Top page with links to the guides
- `oauth_guide.html` — OAuth 2.0 explainer (~800 lines, self-contained HTML with inline CSS/JS)
- `crypto_guide.html` — Cryptography explainer (~560 lines, self-contained HTML with inline CSS/JS)

Each guide is a single standalone HTML file with all styles and scripts inlined (no shared CSS/JS files).

## Development

No build or test commands. Open HTML files directly in a browser to preview. All content is in Japanese.

## Conventions

- Each page uses Google Fonts loaded via `<link>` tags and CSS custom properties for theming
- `crypto_guide.html` supports light/dark mode via `prefers-color-scheme`
- `oauth_guide.html` uses a fixed dark theme
- No shared stylesheets or components — styles are duplicated per page by design
