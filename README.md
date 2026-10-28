# Chromium extension blank starter kit (typescript)

Minimal extension (Manifest V3)
written in **TypeScript**
bundled with **Vite 8**
and the **CRXJS** plugin, which handles the manifest and automatic reloading.

## Structure

```
manifest.json      # extension description (points directly to the .ts files)
vite.config.ts     # Vite config + CRXJS plugin
src/
├── popup.html     # window opened when clicking the icon
├── popup.ts       # popup logic
└── content.ts     # script injected into every page
```

## install

```zsh
npm install
```

## Run dev mode

```sh
npm run dev      # dev mode : hot-reload on any files change event
```
Hot Reload with dev mode

## Load plugin in a browser (chromium-based example)

1. Run `npm run dev` (or `npm run build`)
2. Open `chrome://extensions` and enable **Developer mode**
3. Click **Load unpacked** → select the `dist/` folder


## How to Debug

- `content.ts` : console DevTools in browser (F12)
- `popup.ts` : right-click in the popup → **Inspect**

## Build

```zsh
npm run build    # build in dist/
```
