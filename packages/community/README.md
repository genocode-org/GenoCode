# @genocode/community

Sharing creatures with the community gallery. It holds three things, used in three different
places:

| File                          | What it is                                                                                                                            | Where it runs                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `src/share.ts`                | the share format: what a shared creature holds, its limits and checks, and how it's written as a GitHub issue                         | the web app, the relay and the checks |
| `src/relay.ts`                | the relay: a Cloudflare Worker that files a creature shared from the app as a GitHub issue, so nobody needs a GitHub account to share | Cloudflare                            |
| `src/review.ts`, `src/cli.ts` | the checks on a shared creature, and what the Community workflow runs                                                                 | GitHub Actions                        |

`src/png.ts` writes PNG pictures, for the website's creature pages and for the checks.

## How a creature gets into the gallery

1. Someone chooses **Share with the community** in the app. The app sends the creature to the relay,
   which files it as an issue labelled `community`.
2. The Community workflow (`.github/workflows/community.yml`) checks it and comments on the issue
   with what it found and a picture of the creature. Pictures go on the `community-pictures` branch.
3. A maintainer adds the label `approved`. The workflow checks it again and opens a pull request
   that adds it to `community/`.
4. The pull request is merged, and the creature shows in the gallery on the next site deploy.

## The relay

The Relay workflow (`.github/workflows/relay.yml`) deploys it when `relay.ts`, `share.ts` or
`wrangler.toml` change on main, or by hand. It needs, once:

- in the repository: the secret `CLOUDFLARE_API_TOKEN` (a token allowed to edit Workers) and the
  variable `CLOUDFLARE_ACCOUNT_ID`;
- in Cloudflare, set with `npx wrangler secret put`: `GITHUB_TOKEN` (a fine-grained token that may
  only write issues on this repository) and `TURNSTILE_SECRET` (the Turnstile widget's secret key).

The app offers sharing only when the site is built with the repository variables `SHARE_RELAY`
(the relay's address) and `TURNSTILE_SITE_KEY`. `wrangler.toml` sets which page may send shares and
how many one visitor may send a minute.

## Running the checks yourself

```
npm run prepare -w @genocode/core && npx tsc -b packages/community
ISSUE_BODY="$(gh issue view <number> --json body -q .body)" \
  node packages/community/dist/cli.js review <out folder>
```

This writes `comment.md`, and `picture.png` when there's a picture, into the out folder.
