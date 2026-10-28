# CLAUDE.md

Extension Chrome (Manifest V3) construite avec **Vite + Vue 3 + TypeScript + CRXJS**.

## Commandes

- `npm run dev` : serveur de dev avec rechargement à chaud de l'extension
- `npm run build` : vérification des types (`vue-tsc -b`) puis build dans `dist/` et zip dans `release/`

**Toujours lancer `npm run build` après une modification** : il doit passer sans erreur de type.

## Structure

```
src/
  shared/          ← tout ce qui est commun à popup, sidepanel et content
    styles/
      tokens.css     variables CSS --tg-* (couleurs, typo, espacements, formes)
      components.css classes communes .tg-*
      base.css       styles globaux (body, a, button…) : popup + sidepanel UNIQUEMENT
  popup/           popup de l'icône d'extension (main.ts, App.vue, style.css)
  sidepanel/       panneau latéral (main.ts, App.vue, style.css)
  content/         content script injecté dans les pages web (main.ts, views/)
  components/      composants Vue réutilisables
  assets/          images
manifest.config.ts manifest de l'extension
```

L'alias `@/` pointe vers `src/` : écrire `import '@/shared/styles/tokens.css'` plutôt que des chemins relatifs `../../`.

## Règle 1 : centraliser le style CSS, répéter le moins possible

Avant d'écrire du CSS, **lire `src/shared/styles/`** pour réutiliser ce qui existe.

1. **Aucune valeur en dur quand une variable existe.** Couleurs, tailles de police, espacements, arrondis, ombres et durées de transition passent par les variables `--tg-*` de `tokens.css`.
   ```css
   /* ✗ */ .x { color: #288cd7; padding: 1rem; border-radius: 0.5rem; }
   /* ✓ */ .x { color: var(--tg-color-primary); padding: var(--tg-space-md); border-radius: var(--tg-radius-sm); }
   ```
2. **Une nouvelle valeur qui pourrait servir ailleurs** (couleur, taille…) s'ajoute dans `tokens.css` avant d'être utilisée. Penser aussi à sa variante dans le bloc `@media (prefers-color-scheme: light)` si besoin.
3. **Un même groupe de déclarations dans deux endroits** doit devenir une classe `.tg-*` dans `components.css`, utilisée ensuite dans les templates.
4. **Les styles propres à un seul composant** vont dans son `<style scoped>`, tout en utilisant les variables.
5. **Les fichiers `popup/style.css` et `sidepanel/style.css`** ne contiennent que ce qui est vraiment spécifique à cette vue.

### Préfixes et content script

- Variables : `--tg-…`. Classes partagées : `.tg-…`.
- Le CSS du content script est injecté **dans la page web visitée**. Il ne faut donc jamais y mettre de sélecteur global d'élément (`body`, `h1`, `button`, `*`…) ni de classe non préfixée.
- Le content script importe seulement `tokens.css` et `components.css`, **jamais `base.css`**.
- Dans les composants du content script, toujours utiliser `<style scoped>`.

## Règle 2 : TypeScript partout, `any` le moins possible

- Tout le code est en TypeScript : fichiers `.ts`, et `<script setup lang="ts">` dans les `.vue`. Pas de nouveau fichier `.js`.
- Le mode `strict` est activé dans `tsconfig.json` : ne pas le désactiver, ne pas utiliser `// @ts-ignore` ni `// @ts-nocheck`.
- **Pas de `any`.** Utiliser à la place :
  - un type ou une `interface` explicite ;
  - `unknown`, puis un rétrécissement du type (`typeof`, `instanceof`, `in`, ou une fonction de garde `x is T`) pour les données externes (messages, `chrome.storage`, `JSON.parse`, réponses `fetch`) ;
  - des génériques (`<T>`) pour le code réutilisable ;
  - les types fournis par `@types/chrome` (`chrome.tabs.Tab`, `chrome.runtime.MessageSender`…).
- Si un `any` est vraiment inévitable, ajouter un commentaire qui explique pourquoi.
- Éviter les assertions `as` et l'opérateur non-null `!` quand une vérification est possible.
- Typer les props et les events Vue : `defineProps<{ … }>()`, `defineEmits<{ … }>()`, `ref<T>()` quand le type n'est pas déduit.
- **Les types partagés entre popup, sidepanel et content** (format des messages, données stockées…) vont dans `src/shared/types.ts`, pas en double dans chaque contexte.

```ts
// ✗
chrome.runtime.onMessage.addListener((msg: any) => { console.log(msg.count) })

// ✓  (src/shared/types.ts)
export interface CountMessage { type: 'count'; count: number }

export function isCountMessage(msg: unknown): msg is CountMessage {
  return typeof msg === 'object' && msg !== null
    && 'type' in msg && msg.type === 'count'
    && 'count' in msg && typeof msg.count === 'number'
}

// ✓  (utilisation)
chrome.runtime.onMessage.addListener((msg: unknown) => {
  if (isCountMessage(msg)) console.log(msg.count)
})
```

## Règle 3 : partager aussi la logique

Le dossier `src/shared/` n'est pas réservé au CSS. Une fonction, une constante ou un composable Vue utilisé par plusieurs contextes (popup, sidepanel, content) va dans `src/shared/` (par exemple `src/shared/utils/`, `src/shared/composables/`), au lieu d'être copié.

## Checklist avant de terminer

- [ ] Aucune couleur, taille ou durée en dur là où une variable `--tg-*` convient
- [ ] Aucun bloc CSS ni code TS dupliqué entre popup, sidepanel et content
- [ ] Aucun sélecteur global ni classe non préfixée dans le CSS du content script
- [ ] Aucun `any`, `@ts-ignore` ou fichier `.js` ajouté
- [ ] `npm run build` passe
