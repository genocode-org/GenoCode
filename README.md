<p align="center"><img src="branding/logo-lockup.svg" alt="GenoCode" width="480"></p>

# GenoCode

Code, breed and share creatures that dance to music.

GenoCode is a small language for describing creatures. A program drives a 3D turtle that lays down
simple shapes, and the values marked as **genes** can be mutated, bred and morphed, so every
program describes a whole family of related creatures. Creatures can react to music, so how they
dance is part of their genes too.

You can write creatures as code or build them by dragging blocks onto a canvas, with the code
written for you. Creature files use the `.genie` extension.

```
creature Flower

gene rings = 3 in 1..6 step 1 // how many rings of petals
gene shrink = 0.7 in 0.4..0.95 // each ring's size compared with the ring outside it
gene twist = 29 in 0..180 // how far each ring turns from the last
```

**Status:** early development, heading for a first public release. The web app works: write,
view, breed, morph and dance creatures, as code or as blocks.

New to GenoCode? Start with [Getting started](https://genocode.piorek.co.za/docs/). The
language is defined in [the language reference](https://genocode.piorek.co.za/docs/language.html).

## Repository layout

| Folder              | Contents                                                           |
| ------------------- | ------------------------------------------------------------------ |
| `packages/core`     | the language: parser, checker, formatter, interpreter and genetics |
| `packages/render`   | draws creatures, textures and backgrounds (three.js)               |
| `packages/music`    | turns music into the inputs creatures react to                     |
| `packages/dance`    | the dance effects: morph, zoom, spin, turn, reverse and flat       |
| `packages/blocks`   | the block editor                                                   |
| `packages/controls` | gene, time and music controls for trying creatures in a web page   |
| `packages/app`      | the web app                                                        |
| `creatures`         | the starter library of `.genie` creatures                          |
| `dances`            | the starter dance styles                                           |
| `patterns`          | the starter texture and background recipes                         |
| `docs`              | documentation                                                      |

## Development

You need Node.js 22 or later (see `.nvmrc`).

```
npm install
npm run build     # compile all packages
npm test          # run the tests
npm run check     # build, type-check, test and check formatting, as CI does
```

**Write creatures in the browser:** `npm run dev`, then open the address it prints. Pick a creature
from the creature menu at the top or the **Library**, start a new one from the **File** menu, or
open or drop any `.genie` file. In Chromium-based
browsers, a file opened from disk is watched too, so you can edit it in any editor and see the
changes (until you edit it in the app). **Save** keeps a creature in the browser, and
**Download…** writes it as a `.genie` file.

The creature fills the window. The six modes sit in a rail on the left (tabs along the bottom on a
phone), each mode's tools float in a bar under the creature, and on a phone a sheet slides up with
the genes, the code and the blocks:

- **View** shows the creature beside its code (**Code** in the rail shows and hides it), rebuilt as
  you type. The editor colours the code, marks problems, completes names and explains whatever you
  point at. **Blocks** or **Both** shows the code as blocks too, kept in step with it, to build
  creatures by dragging. Each gene has a slider, colour picker or menu in the **Genes** panel;
  creatures that react to time or music get sliders for those under **Try inputs**. Lock a gene
  (🔓) to keep it fixed while breeding. **Picture** saves the view as a PNG.
- **Breed** shows a grid of variations. Click creatures to choose them as parents, then **Mutate**
  or **Breed**; **Back** returns to the previous generation, and double-clicking one opens it.
- **Morph** blends the creature through its variants, or the creatures chosen in the grid, in a
  loop.
- **Dance** moves the creature to music (a file, a web address, the microphone or another browser
  tab), by a dance style. Its bar has the music and the style;
  `[` and `]` step through the creatures and the number keys through the styles.
- **Video**, in Morph and Dance, records the creature with its music as a video to save or share:
  tall (Shorts, TikTok, Reels), square or wide, up to five minutes, or the whole song from the
  start. It's made in the browser: MP4 where the browser can, otherwise WebM.
- **Patterns** designs texture and background recipes, with variations to breed, and exports
  them as code, background files or pictures.
- **Library** has the starter creatures and dance styles, and everything saved in the browser.
  Clicking a dance style dances the creature to it; **Make it its own** writes it into the
  creature.

In View, Morph and Dance, the buttons at the top right of the creature turn the picture to look from
each side and (or the F key) show it full screen. **File › Keyboard shortcuts** lists the keys.

In View, the path button draws the turtle's path over the creature: an arrow for each `forward`,
`back` and `move`, and a dashed line where a `branch` jumps back to where it started. The
creature fades so the path shows through. Pointing at an arrow lights up the line of code that made
it, along with every other step from that line; clicking it puts the cursor there. With the cursor
on a line of code, that line's steps light up too.

**Help** in the app opens the documentation: the getting-started guide and the language reference,
made from `docs/` when the app is built. `npm run build` puts the whole website in
`packages/app/dist`; on every push to main, the Site workflow publishes it on GitHub Pages.

See [CONTRIBUTING.md](CONTRIBUTING.md) for more.

## Related repositories

`core` and `render` are published to npm as
[`@genocode/core`](https://www.npmjs.com/package/@genocode/core) and
[`@genocode/render`](https://www.npmjs.com/package/@genocode/render), so tools can live in
repositories of their own:

| Repository                                                         | Contents                                                           |
| ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| [GenoCode-cli](https://github.com/genocode-org/GenoCode-cli)       | `genie`, the command line: check, format and render creatures      |
| [GenoCode-vscode](https://github.com/genocode-org/GenoCode-vscode) | the VS Code extension and language server                          |
| [GenoCode-agent](https://github.com/genocode-org/GenoCode-agent)   | an AI agent that designs creatures from a description, with Claude |

A version tag (such as `v0.2.0`) publishes `core` and `render` to npm.

## Credits and license

GenoCode is inspired by DancerDNA (1999) and other work in evolutionary art; see
[CREDITS.md](CREDITS.md). Released under the [MIT License](LICENSE).
