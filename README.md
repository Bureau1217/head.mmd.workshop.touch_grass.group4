## install

```zsh
npm install
```

## Run dev mode

```sh
npm run dev      # dev mode : hot-reload on any files change event
```
Hot Reload with dev mode

## Load plugin in a browser (chromium-based exemple)

1. Lancer `npm run dev` (ou `npm run build`)
2. Ouvrir `chrome://extensions` et activer le **Mode développeur**
3. **Charger l'extension non empaquetée** → choisir le dossier `dist/`


## How to Debug

- `content.ts` : console DevTools in browser (F12)
- `popup.ts` : right-click in the popup → **Inspect**

## Build

```zsh
npm run build    # build in dist/
```
