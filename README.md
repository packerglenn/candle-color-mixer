# Pinewood Blooms Wax Color Studio

A private, local-first workspace for building repeatable decorative wax colors and understanding the ingredient cost of every batch. It is intended for molded display pieces placed on sticks, not products that will be lit or burned. The app is responsive, installable as a PWA, and keeps the color library in the browser with IndexedDB—no account or backend required.

The build-ready product and engineering contract is in [SPECIFICATION.md](SPECIFICATION.md). Version 1.0 is deliberately limited to deterministic formula calculation; empirical color matching follows only after controlled physical calibration.

## Run locally

Requirements: Node.js 22 or newer.

```text
npm start
```

Open `http://127.0.0.1:4173/`.

### Test on a phone over local Wi-Fi

Run the restricted LAN server:

```text
npm run start:lan
```

On a phone connected to the same Wi-Fi, open `http://YOUR-COMPUTER-IP:4173/`. Allow Node.js through Windows Firewall for **Private networks** if prompted. The LAN server exposes only public application assets; project metadata and dotfiles return 404.

Plain LAN HTTP is useful for interface and calculation testing, but browsers require HTTPS for complete installable-PWA behavior and some photo/security features. The hosted `https://color-mixer.pinewoodblooms.com` address will provide the complete phone experience.

Bootstrap is checked into `assets/vendor`, so the production app does not depend on a CDN. `npm install` is only needed when updating dependencies.

## What is included

- A polished color library with six starter formulas and user-owned colors.
- A wax-type selector for paraffin, soy, beeswax, and palm wax that automatically applies each wax family’s photographed kit range, with exact Low, calculated Midpoint, and High dye strengths.
- Actual-use recording: adjust the amounts after mixing and save the derived formula as a new color or version.
- One or more compressed photos per batch, captured from the camera or photo library.
- Material purchase pricing for wax, dye, Vybar, and fragrance, normalized across common mass and volume units.
- An immutable cost snapshot on every saved batch, plus optional cost per finished piece.
- Complete JSON backup and validated merge-or-replace restore, including photos.
- Offline PWA assets and phone-first navigation.

## Local-only privacy model

Colors, photos, prices, and batches stay in the browser profile on the device where they were created. Clearing site data or removing the installed PWA can erase that library. Use the **Backup** screen regularly and keep the downloaded `.ccm-backup.json` file in iCloud Drive, Google Drive, Dropbox, or another safe location.

For phone access, deploy these static files to an HTTPS host such as GitHub Pages and point `color-mixer.pinewoodblooms.com` at it. Each phone still receives a separate private local library; the host serves only the application files.

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
npm run test:e2e
npm run test:all
```

`npm test` runs the deterministic unit suite. `npm run test:e2e` runs the full library, calculation, validation, formula-adjustment, photo, pricing, backup, and restore workflows in desktop and phone-sized Chromium. Install the browser runtime once with `npx playwright install chromium`.

The exact BigInt-backed decimal engine remains the source of truth for formula, fragrance, unit-cost, and scale calculations. Screen colors and photos are visual references—not calibrated predictions of cured wax. The displayed process values are an unverified manufacturer transcription and do not replace wax-specific or equipment-specific safety instructions.

The three decorative-wax dye-load tiers intentionally exceed the maximum in the transcribed candle-use guidance. They are experimental Pinewood Blooms starting points, not a proven mathematical compensation for the natural color or opacity of the base wax. Confirm dissolution, cured color, surface quality, brittleness, and color transfer through controlled physical samples before production use.
