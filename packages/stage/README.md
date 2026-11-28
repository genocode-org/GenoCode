# @genocode/stage

Plays a creature's morph and dance in a web page. The web app (`packages/app`) and the phone player
(`packages/player`) both use it, so a creature morphs and dances the same in each.

- `DanceFloor` plays a dance: each frame, the dance style's moves run with the music of the moment,
  and the creature is built with the same music, so it moves to it as well.
- `Morpher` plays a morph: a loop through a creature's family, each variant blending into the next.
- `FrameBuilder` builds each frame in a worker while the page draws the last one, so playing stays
  smooth.
- `buildCreature`, `checkText` and `familyOf` check `.genie` code, build a creature from it, and give
  its family of variants.

Use it from its sources: the app and the player point Vite at `src/`, because the build worker is
started from `src/build.worker.ts`.
