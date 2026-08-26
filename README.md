# Candle Color Mixer

A static-first application for repeatable, mass-based candle-wax color formulation.

The build-ready product and engineering contract is in [SPECIFICATION.md](SPECIFICATION.md). Version 1.0 is deliberately limited to deterministic formula calculation; empirical color matching follows only after controlled physical calibration.

## Run locally

Requirements: Node.js 22 or newer.

```text
npm start
```

Open `http://127.0.0.1:4173/`. The application has no third-party runtime dependencies and installs as an offline-capable PWA.

To simulate the GitHub Pages project path locally:

```text
npm run start:pages
```

Open `http://127.0.0.1:4174/candle-color-mixer/`.

## Publish with GitHub Pages

The repository includes a GitHub Actions workflow at `.github/workflows/deploy-pages.yml`. After pushing the public repository to GitHub:

1. Open **Settings → Pages**.
2. Under **Build and deployment**, select **GitHub Actions** as the source.
3. Push to `main` or manually run **Deploy to GitHub Pages** under the Actions tab.
4. Open the deployment URL shown by the completed workflow.

For a repository named `candle-color-mixer`, the default project URL is `https://YOUR-USERNAME.github.io/candle-color-mixer/`. Relative asset, manifest, and service-worker paths also support a root site or custom domain.

## Verify

```text
npm test
```

Version 1.0 includes exact BigInt-backed decimal arithmetic, six manufacturer formula templates, a visual color wheel that shows the nearest W3C CSS named screen color, maps separately to the nearest predefined wax family, and applies bounded experimental ratio adjustments, custom ratios, linked range constraints, direct-dye calculation, optional additive/fragrance loads, scale feasibility, printable results, manufacturer temperature-and-mixing guidance, and deterministic diagnostics. Color-wheel adjustments are illustrative screen-space heuristics—not calibrated predictions of cured wax—and never change the operator-selected total dye load. The displayed process values are an unverified manufacturer transcription and do not replace wax-specific or equipment-specific safety instructions.
