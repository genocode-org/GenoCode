# Getting started

GenoCode is a small language for making creatures, and an app where you write them, see them in 3D,
breed them, morph them and watch them dance to music. This guide takes you from a first ball to a
creature with genes and parts. The full rules are in [the language](LANGUAGE.md), and every statement and function is in
[the reference](REFERENCE.md).

## The app

The app has six modes, down the left (along the bottom on a phone). The creature fills the middle,
and each mode's tools float in a bar under it:

- **View** shows the creature, with its code beside it (**Code**, under the modes, shows and hides
  it). Change the code and the creature follows as you type. The **Genes** panel on the right has
  a slider for every gene, to try other values. On a phone, pull up the sheet under the creature
  for the genes, the code and the blocks. On a computer, the bar under the creature has shortcuts
  to **Morph**, **Dance**, **Breed** and **Picture**.
- **Morph** blends a creature into its variants and back, in a loop.
- **Dance** moves the creature to music: a music file, a web address, the microphone or another
  browser tab. A song pauses when you leave Dance, and carries on when you come back.
- **Breed** shows a grid of variations. Click creatures to choose them as parents, then **Mutate**
  or **Breed** for a new grid. Double-click one to open it.
- **Patterns** designs the textures and backgrounds creatures wear.
- **Library** has the creatures that come with GenoCode, and everything you've saved in the browser.

Start with the creature menu at the top, or the **Library**: open a few of the starter creatures,
look at their code, and move their gene sliders. Every one of them was written in the language this guide describes.

## A first creature

Choose **File › New creature** and replace the code with this:

```
creature Snowman
// Three balls, one on another, each smaller than the last.

pitch -90
shape ball
repeat 3 {
  lay
  forward 0.8
  grow 0.75
}
```

A GenoCode creature is drawn by a **turtle**: an invisible pen that moves and turns in 3D, and
lays shapes where it is.

- `creature Snowman` names the creature. The comment below it describes it.
- `pitch -90` turns the turtle to face up. It starts facing you.
- `shape ball` picks the shape it lays: `ball`, `cube`, `cone`, `tube`, `ring` or `donut`.
- `repeat 3 { … }` runs the block three times. Each time, `lay` lays a ball, `forward 0.8` moves
  the turtle up, and `grow 0.75` makes everything after it three quarters the size.

Moves are measured in the turtle's own size, so after `grow 0.75` the next `forward 0.8` goes three
quarters as far. That's why each ball sits neatly on the one below.

## Genes

A **gene** is a value that can change when creatures mutate, breed and morph. Give it a range, and
the app gives it a slider:

```
creature Snowman
// Balls one on another, each smaller than the last.

gene balls = 3 in 2..6 step 1 // how many balls
gene shrink = 0.75 in 0.5..0.95 // each ball's size compared with the one below
gene snow = hsv(200, 0.1, 1) in hsv(0, 0, 0.6)..hsv(360, 0.5, 1)

pitch -90
shape ball
colour snow
repeat balls {
  lay
  forward 0.8
  grow shrink
}
```

- `gene balls = 3 in 2..6 step 1` starts at 3 and can be any whole number from 2 to 6. The comment
  at the end of the line is the gene's description, shown in the gene panel.
- `snow` is a colour gene: `hsv(hue, saturation, value)`, with the hue in degrees round the colour
  wheel.
- Now press **Breed**: every creature in the grid is a snowman, each with its own genes.

## Parts

A **part** is a named piece of a creature that can be laid again and again, with its own genes:

```
creature Snowman
// Balls one on another, each smaller than the last, with a carrot nose on the top one.

gene balls = 3 in 2..6 step 1 // how many balls
gene shrink = 0.75 in 0.5..0.95 // each ball's size compared with the one below
gene snow = hsv(200, 0.1, 1) in hsv(0, 0, 0.6)..hsv(360, 0.5, 1)

pitch -90
shape ball
colour snow
repeat balls {
  lay
  forward 0.8
  grow shrink
}
grow 1 / shrink
back 0.8
nose

part nose {
  gene reach = 1 in 0.3..2
  gene carrot = hsv(28, 0.9, 1) in hsv(0, 0.5, 0.5)..hsv(60, 1, 1)

  pitch 90
  yaw 40
  forward 0.4 + reach / 2
  shape cone
  colour carrot
  lay { grow (0.25, 0.25, reach) }
}
```

- After the loop, `grow 1 / shrink` and `back 0.8` take the turtle back to the middle of the top
  ball. `nose` on its own line then runs the part there.
- `lay { … }` changes only the shape being laid. Here it stretches the cone into a carrot.
- A part's genes belong to it: in the gene panel they're `nose.reach` and `nose.carrot`.

## Variants, morphing and dancing

A **variant** is another set of gene values for the same creature:

```
variant Tall { balls = 6; shrink = 0.9 }
```

Add that line at the end of the snowman and press **Morph**: the snowman grows into the tall one
and back. In **Dance**, music carries it through the same loop. Pick a music file, or the
microphone, and a dance style. Songs you've danced to are kept under **Recent** in the Music menu,
ready to play again.

For a song file, the app also looks up the song's timed words on [lrclib.net](https://lrclib.net),
a free library of song words, so creatures that use `music.words` and `music.chorus` can follow the
singing. Only the song's artist, title and length are sent. **Follow the singing** in the Music menu
turns it off. The microphone and another tab have no song to look up, so those two stay 0 there.

The app can write variants for you too:

- After moving some gene sliders, **Make a variant…** under the genes puts the new values into a
  variant and sets the creature's own genes back.
- **New variant…** at the bottom of the variant menu makes an empty variant; the sliders then set
  its genes.
- In **Breed**, pick one creature and press **Add as variant** to keep it in the family.

Creatures can also read the music directly: `music.bass`, `music.level` and the others run from 0
to 1 as the music plays, and `time` counts the seconds. For example, `grow 1 + 0.2 * music.bass`
makes everything swell with the bass.

## Blocks

Choose **Blocks** (or **Both**) above the code in View to see the code as blocks. Drag blocks in from the
palettes on the left, and the code is written for you. Change the code, and the blocks follow.

- A number that is a gene's value opens a slider. A colour has a swatch that opens a colour picker.
- A comment above a statement is a note on its block (the **?**). A gene's description is the
  last row of its block.

## Textures and backgrounds

Shapes can wear textures, and a creature can carry its own background:

```
creature Marble_Ball
// A ball of marble, on an aurora.

shape ball
texture pattern(marble, 200, 7, dusk, pearl)
lay

background {
  fill pattern(aurora, 160, 12, dusk)
}
```

The **Patterns** mode is the easiest way to find recipes like these: try kinds, hues, schemes and
finishes, breed the ones you like, and **Copy code** or **Use as background**.

## Saving and sharing

- **Save** keeps a creature in this browser; it then appears in the Library under "Yours".
- **Download** saves the `.genie` file, and **Open a .genie file** opens one (all three are in the
  **File** menu). Opening a background or dance file while a creature is on show offers to put it
  into the creature.
- **Picture** in View (or **File › Save a picture…**) saves a picture of the creature as it's shown.
- **Video** in Morph and Dance records a video of the creature, with the music while it dances.
  Pick a shape (tall for Shorts, TikTok and Reels; square; or wide); the creature takes that shape
  while recording, and **Stop** ends it. With a music file, tick **The whole song, from the start**
  to record the song from beginning to end. Then save the video, or share it from a phone.

## Where next

- Open the starter creatures in the Library and read their code: each is a worked example.
- [The language reference](LANGUAGE.md) has everything else: functions, vectors, gradients,
  symmetry, the music inputs, dance styles and how mutating, breeding and morphing work.
