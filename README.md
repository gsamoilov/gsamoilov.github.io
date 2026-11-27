# samoilov.org

A gaming companion: open it next to your PC and get the wiki, missed achievements, notes and patch notes for your current game.

- Frontend: Vite + Preact + TypeScript, deployed to GitHub Pages by `.github/workflows/deploy.yml` on every push to `main`.
- Backend: Supabase (auth, Postgres, Edge Functions). The Steam Web API key lives only in Supabase secrets.

```sh
npm install
npm run dev     # local dev server
npm test
npm run build   # outputs dist/ (404.html = index.html so deep links work on Pages)
```

`src/styles/themes.css` holds the saved theme pack from the old site (not loaded yet).
`archive/themes-demo.html` is the original interactive theme demo (not deployed).
