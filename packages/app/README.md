# GenoCode app and website

The GenoCode web app, and the website around it: the front page, the documentation, a page for
each creature, and the sitemap.

```
npm run build # the whole website, in packages/app/dist
npm run dev # the app and website while working on them
npm run preview -w @genocode/app # the built website
```

Run `npm run build` once before `npm run dev`: the build reads the other packages from their `dist`
folders to make the documentation and creature pages.

## What's here

- `index.html` and `landing/`: the front page. `app/index.html` and `src/`: the app itself.
- `vite.config.ts`: the build. It uses the other packages' sources directly, so changes to them
  show without rebuilding, and it writes the website's own pages:
  - `docs.ts`: the documentation pages, made from `docs/*.md` and `docs/images/`, and the credits
    and licence pages.
  - `creatures.ts`: a page for each creature in `creatures/` and `community/`, with pictures drawn
    when the website is built.
  - `site.ts` and `tree.ts`: what the pages share, and the sitemap. Each page's date in the sitemap
    is when its source last changed in git.

## Publishing

The Site workflow (`.github/workflows/site.yml`) builds the website and publishes it on GitHub
Pages on every push to main that changes something the website is built from. The files that
don't (the phone app, READMEs, other workflows and the like) are listed in the workflow. It can
also be started by hand from the Actions tab.

The website's build turns on Cloudflare Web Analytics (`GENOCODE_ANALYTICS`) and, when the
repository variables are set, sharing with the community (see `packages/community`).
