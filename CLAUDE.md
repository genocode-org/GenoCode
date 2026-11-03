# GenoCode: notes for Claude

GenoCode is a small language for creatures that dance to music, plus the web app to write, view,
breed, morph and dance them. Start with [README.md](README.md) for the layout and the app. The
contributing rules apply to every change:

@CONTRIBUTING.md

## Commands

- `npm run check`: build, type-check, test and check formatting, as CI does. Run it before every
  pull request.
- `npx vitest run packages/core/src/parser.test.ts`: run one test file.
- `npm run dev`: run the web app.
- `npm run format`: format with Prettier (print width 100).

## Where things are

- `docs/LANGUAGE.md` is the language specification and the final word on what the language means.
  `docs/REFERENCE.md` is the per-feature reference, and `docs/GETTING_STARTED.md` the guide.
  `packages/core/src/docs.test.ts` checks that every example in them builds.
- `creatures/`, `dances/` and `patterns/` hold the starter creatures, dance styles and texture and
  background recipes, all as `.genie` files.
- The sibling repos GenoCode-cli, GenoCode-vscode and GenoCode-agent use `@genocode/core` and
  `@genocode/render` from npm. A change to core that they need is released here first.

## Rules to follow

- **One space between things.** Any code the engine writes or changes (formatter, variant and gene
  edits, paste, translator output, help text, docs examples) puts one space between things: no
  column alignment, no two spaces before a comment. Indentation (2 spaces) stays. Spacing a person
  types by hand is theirs: no test may require a layout of hand-written files. Ask before adding a
  new layout rule.
- **UI text is for a first-time user.** Tooltips, labels and messages say in plain words what the
  control does. Never "as in the original" or jargon the user hasn't met. Code comments may mention
  DancerDNA.
- **Docs remarks are shown in the example.** When a remark in `docs/` mentions some code or a
  feature, the entry's example uses it and the remark points at it ("in the example, …").
- **Variants must morph.** A creature's variants and the creature itself form one loop that Morph
  plays through, and each must morph smoothly into the next. They can be very different (other
  species, like Medusa's jellyfish, or stages of one life, like Tentacles), but they keep the same
  structure (the same number of legs, tentacles, …); parts appear and disappear by growing and
  shrinking smoothly, never by a jump in a count.
- **Nothing from DancerDNA,** and nothing that refers to files outside this repository.
- **Versions on 0.x:** a minor bump of `core` means `render` must widen its `core` dependency and
  be released too, because `^0.N.0` doesn't take `0.(N+1).0`.
