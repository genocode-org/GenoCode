# The GenoCode language

Version 0.11, as built by `@genocode/core` 0.11.

This document is the definition of GenoCode. When the implementation and this document disagree,
this document is right and the implementation is fixed, unless the document is changed first.
Parts marked **provisional** may still change. [The reference](REFERENCE.md) lists every statement,
function, input and constant on its own, with its parameters and an example.

## Contents

1. [Overview](#1-overview)
2. [A first creature](#2-a-first-creature)
3. [Files](#3-files)
4. [Lexical structure](#4-lexical-structure)
5. [Values and types](#5-values-and-types)
6. [Genes](#6-genes)
7. [Variables](#7-variables)
8. [Expressions](#8-expressions)
9. [Control flow](#9-control-flow)
10. [Parts and functions](#10-parts-and-functions)
11. [The turtle](#11-the-turtle)
12. [Shapes](#12-shapes)
13. [Colour and material](#13-colour-and-material)
14. [Textures](#14-textures)
15. [Backgrounds](#15-backgrounds)
16. [Time and music](#16-time-and-music)
17. [Dance styles](#17-dance-styles)
18. [Library](#18-library)
19. [Genetics](#19-genetics)
20. [Building a creature](#20-building-a-creature)
21. [Blocks](#21-blocks)
22. [Grammar](#22-grammar)
23. [Not yet settled](#23-not-yet-settled)

## 1. Overview

GenoCode is a small language for describing creatures. A GenoCode program drives a 3D **turtle**
that moves, turns, grows and lays down simple **shapes**: balls, cubes, cones, tubes, rings and
donuts. The shapes it lays make up the creature.

Some values in a program are declared as **genes**. The app can **mutate** genes (nudge them),
**breed** them (mix two parents) and **morph** them (slide smoothly from one creature to another).
Everything else in the program stays the same. A program therefore describes a whole family of
related creatures, and each set of gene values is one member of that family.

Creatures can react to **time** and **music**, so how a creature dances can be written into its
genes as well. A creature file can also carry the creature's **background** and its **dance
style**.

Creatures can be written as text or built from **blocks**. Both are views of the same program, and
every construct in the language corresponds to exactly one block.

**Principles**

- **Genes are explicit.** Only a `gene` declaration creates a gene, and every gene has a name.
- **Same genes, same creature.** Building a program with the same gene values (and the same time
  and music inputs) always gives exactly the same shapes.
- **Small is better.** One number type, one vector type, one way to repeat, one way to save and
  restore the turtle.
- **Code and blocks match one to one.** Nothing in the text is lost when it's shown as blocks.
- **Friendly units.** Angles are in degrees. Colours can be named or written in HSV, RGB or hex.
  `colour` and `color` are both accepted.

## 2. A first creature

```
creature Flower
// Petals laid round the centre, each a squashed cone, in rings that shrink and turn.

gene rings = 3 in 1..6 step 1 // how many rings of petals
gene shrink = 0.7 in 0.4..0.95 // each ring's size compared with the ring outside it
gene twist = 29 in 0..180 // how far each ring turns from the last
gene heart = hsv(47, 0.9, 1) in hsv(0, 0.3, 0.5)..hsv(360, 1, 1)

branch {
  shape ball
  colour heart
  grow 1.6
  lay
}

let size = 1
repeat rings {
  roll twist
  whorl(size)
  size *= shrink
}

part whorl(scale) {
  gene petals = 7 in 3..16 step 1
  gene reach = 4 in 1.5..7 // how long each petal is
  gene width = 1.4 in 0.3..3
  gene cup = 23 in -57..69 // how far the petals curl
  gene petal = hsv(324, 0.7, 1) in hsv(0, 0.3, 0.5)..hsv(360, 1, 1)

  colour petal
  shape cone
  repeat petals as i {
    branch {
      roll 360 * i / petals
      pitch 90 - cup
      grow scale
      forward reach / 2
      lay { grow (width, width * 0.3, reach) }
    }
  }
}
```

- The top-level statements run first, from the top. They lay a ball for the heart, then draw
  `rings` rings of petals, rolling and shrinking between rings.
- `part whorl` lays `petals` cones around the turtle's heading, each tilted by `cup`.
- `branch { … }` saves the turtle, runs the block, and puts the turtle back as it was.
- `lay { … }` stretches only the shape being laid. The turtle itself isn't changed.
- The creature has nine genes: `rings`, `shrink`, `twist`, `heart`, `whorl.petals`,
  `whorl.reach`, `whorl.width`, `whorl.cup` and `whorl.petal`.

## 3. Files

GenoCode files have the extension **`.genie`** and are encoded in UTF-8. There are four kinds,
depending on the first line.

**Creature files** start with `creature <Name>`. After the header, in any order:

- top-level statements, which run in order when the creature is built,
- `gene` declarations,
- `part` and `function` definitions,
- at most one `background { … }` block ([section 15](#15-backgrounds)),
- at most one `dance { … }` block ([section 17](#17-dance-styles)),
- `pattern <Name> { … }` blocks, the creature's own textures ([section 14.1](#141-your-own-patterns)).

**Background files** start with `background <Name>` and hold the contents of one background block.

**Dance files** start with `dance <Name>` and hold the contents of one dance block.

**Pattern files** start with `pattern <Name>` and hold the contents of one pattern block.

The name after `creature`, `background`, `dance` or `pattern` is a name in the sense of
[section 4](#4-lexical-structure). Comment lines directly below the header are the file's
**description**, which the app shows.

Parts and functions can be used before they are defined. There are no forward declarations.

## 4. Lexical structure

**Statements** end at the end of a line or at `;`. A line continues onto the next when it ends
inside unclosed `(` `)` or `[` `]`, or ends with an operator, a comma, `..` or `=`. Brackets can't
hold braces, so a `{` or `}` ends any brackets left open before it. Blocks are
written with `{` `}`. An opening `{` must be on the same line as the statement it belongs to.

**Spaces** between things on a line don't matter: `gene hue = 200` and `gene hue    = 200` mean the
same. Where GenoCode writes code itself (formatting, the gene sliders, pasting into the app), it puts
one space between things; spaces you type stay as you typed them.

**Comments** are `//` to the end of the line, or `/* … */`, which may span lines but doesn't nest.
A `//` comment at the end of a `gene` line is that gene's **description**.

**Names** are made of letters, digits and `_`, and don't start with a digit. Case matters:
`Size` and `size` are different names.

**Numbers** are written in decimal: `3`, `0.25`, `12.5e-3`. A decimal point must have a digit on
both sides, so `1..6` reads as `1`, `..`, `6`. A number may be followed by `°`, which has no effect
(angles are always degrees): `90°` is `90`. There are no negative literals; `-3` is the operator
`-` applied to `3`.

**Hex colours** are `#rrggbb` or `#rrggbbaa`, in hexadecimal digits.

**Strings** are written in double quotes, with the escapes `\"`, `\\` and `\n`. They are only
allowed as arguments to `print`.

**Keywords** can't be used as names:

```
creature gene part function return let if else repeat as for from to by while
branch lay reshape stroke symmetric shape colour color shine sharpness texture wear
background fill dance forward back move pitch yaw roll rotate around grow mirror in step log
at and or not true false print turtle time beat music variant breed
```

Some words are only special in one place, and are ordinary names elsewhere:

- `x`, `y` and `z` after `mirror` and `symmetric`,
- the effect names `morph`, `zoom`, `spin`, `turn`, `reverse` and `flat` inside a `dance` block,
- `picture` and `value` in pattern code, and `x`, `y`, `r` and `a` inside `picture { }`
  ([section 14.1](#141-your-own-patterns)).

**Built-in names**, such as the library functions, constants, colour names, shape names and pattern
kinds, and the words `gradient` and `spectrum`, can't be used as names of genes, variables, parameters,
parts or functions.

`colour` and `color` mean the same thing everywhere, including in `turtle.colour` / `turtle.color`.

## 5. Values and types

GenoCode is dynamically typed: values have types, and variables don't. Using a value of the wrong
type is an error, reported with its line and column, either when the file is checked or when the
creature is built.

| Type          | Written as                                             | Notes                                                                                |
| ------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| number        | `3`, `0.25`, `1.5e3`                                   | 64-bit floating point. There's no separate integer type                              |
| bool          | `true`, `false`                                        |                                                                                      |
| vector        | `(1, 0, 0.5)`                                          | three numbers: a position, direction or size per axis. `(a)` is just `a` in brackets |
| colour        | `red`, `hsv(200, 0.8, 1)`, `rgb(1, 0.5, 0)`, `#ff8000` | [section 13](#13-colour-and-material)                                                |
| gradient      | `gradient(red, yellow at 0.3, blue)`                   | a colour that varies from 0 to 1 ([section 13.3](#133-gradients))                    |
| shape         | `ball`, `cube`, `cone`, `tube`, `ring`, `donut`        | [section 12](#12-shapes)                                                             |
| pattern       | `pattern(marble, 200, 7)`, `none`                      | a generated texture ([section 14](#14-textures))                                     |
| pattern kind  | `marble`, `cells`, …                                   | the first argument of `pattern`                                                      |
| scheme        | `jewel`, `dusk`, …                                     | a pattern's colour scheme                                                            |
| finish        | `matte`, `pearl`, …                                    | a pattern's finish                                                                   |
| way of mixing | `warp`, `blend`, `mask`, `carve`                       | how `mixed` adds a second pattern                                                    |
| list          | `[1, 2, 3]`, `[]`                                      | values in order, read by position: `l[0]` ([section 8.3](#83-lists))                 |
| picture       | `clouds(6, 4)`, `picture { … }`                        | a grey picture, in pattern code only ([section 14.1](#141-your-own-patterns))        |

**Whole numbers.** Where a whole number is needed (a `repeat` count, a shape number), the value is
rounded to the nearest whole number, with halves rounded up (`2.5` → `3`, `-2.5` → `-2`). Nothing
else rounds: `7 / 2` is `3.5`.

**Parts of values** are read with a dot. They're read-only; build a new value to change one.

| Type   | Parts                                          |
| ------ | ---------------------------------------------- |
| vector | `.x`, `.y`, `.z`                               |
| colour | `.hue` (0–360), `.sat`, `.val`, `.alpha` (0–1) |

## 6. Genes

A gene is a named value that the app is allowed to change. The value written in the declaration is
the creature's current value. [Section 19](#19-genetics) describes exactly how genes are mutated,
bred and morphed.

### 6.1 Declaring genes

```
gene twist = 29 in 0..180 // number
gene petals = 7 in 3..16 step 1 // number, in whole steps
gene size = 1 in 0.1..10 log // number, works by ratios
gene stretch = (1, 1, 0.2) in (1, 1, 0.1)..(1, 1, 3) // vector
gene skin = hsv(120, 0.6, 0.9) in hsv(60, 0.3, 0.5)..hsv(180, 1, 1) // colour
gene spiky = true // bool
gene body = cone from [ball, cone, tube] // choice
gene limb = leg from [leg, fin, wing] // part choice
```

| Kind           | Form                     | Rules                                                                                                                                                      |
| -------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| number         | `= v in min..max`        | `min ≤ v ≤ max`, `min < max`                                                                                                                               |
| stepped number | `= v in min..max step s` | `s > 0`. `v` should be `min + k·s` for a whole `k` (a warning otherwise)                                                                                   |
| log number     | `= v in min..max log`    | `0 < min`. Can't be combined with `step`                                                                                                                   |
| vector         | `= v in min..max`        | each axis separately: `min ≤ v ≤ max` on every axis. An axis whose min and max are equal stays fixed. `log` is allowed if every axis's range is above zero |
| colour         | `= c in min..max`        | each channel separately, as for vectors, with hue on a circle ([section 6.4](#64-colour-genes))                                                            |
| bool           | `= true` or `= false`    | no range                                                                                                                                                   |
| choice         | `= v from [a, b, …]`     | at least two options, all of one type: numbers, vectors, colours, shapes, pattern kinds, schemes, finishes or ways of mixing. `v` must be one of them      |
| part choice    | `= p from [p1, p2, …]`   | options are names of parts that all take the same number of parameters ([section 6.5](#65-part-genes))                                                     |

Values, bounds and options must be **constant expressions**: literals, built-in constants, colour
and shape names, and arithmetic and built-in maths functions applied to constant expressions.
`360 / 7` and `hsv(30, 1, 1)` are constant; another gene, a variable, `noise`, `random`, `time` and
`music` are not.

### 6.2 Where genes can go

A gene can be declared at the top level of a file, or directly inside a `part`, `function`,
`background` or `dance` body. It can't be declared inside `if`, a loop, `branch`, `symmetric`,
`lay { }` or `reshape { }`.

**A gene has one value for the whole creature.** A gene declared in a part has the same value every
time the part runs, however many times it's called. To vary something from call to call, pass a
parameter, or use `noise`.

Genes can't be assigned to: `twist = 5` is an error.

### 6.3 Full names

A gene's **full name** is its name, prefixed by where it's declared:

| Declared in              | Full name        |
| ------------------------ | ---------------- |
| top level                | `twist`          |
| part or function `whorl` | `whorl.petals`   |
| background block         | `background.hue` |
| dance block              | `dance.drive`    |

Full names must be unique within a file. The app uses full names to match genes between creatures
when breeding and morphing, so renaming a gene cuts it off from other creatures' versions of it.

The full name `seed` is reserved ([section 18.5](#185-noise-and-randomness)).

### 6.4 Colour genes

A colour gene's range applies to each channel separately. Saturation, value and alpha are ordinary
ranges. **Hue is a circle** (0 and 360 are the same hue). A range's hue bounds are used as written,
before any wrapping:

- If `max − min` is 360 or more, the range is the whole circle. `hsv(0, …)..hsv(360, …)` is the
  usual way to write it.
- If the minimum hue is less than the maximum, the range runs upwards from min to max.
- If the minimum hue is greater than the maximum, the range runs upwards through 360/0:
  `hsv(300, 0.5, 0.5)..hsv(40, 1, 1)` covers magenta, red and orange.

### 6.5 Part genes

A part choice gene names a part. Calling the gene calls whichever part it currently names:

```
gene limb = leg from [leg, fin, wing]

symmetric x {
  limb(2, side)
}

part leg(reach, side) { … }
part fin(reach, side) { … }
part wing(reach, side) { … }
```

- Every part in the list must take the same number of parameters. Functions can't be listed.
- A part gene can only be called. It can't be stored in a variable, passed as an argument or
  compared.

### 6.6 Variants

A creature can keep other sets of gene values alongside its own: its **variants**. Together with
the creature itself, they form a family of related creatures that share one program, such as the
members of an evolved population.

```
creature Cobra

gene hood = 1.2 in 0.5..2 // how wide the hood spreads
gene coils = 3 in 1..6 step 1
gene skin = hsv(120, 0.7, 0.8) in hsv(60, 0.3, 0.5)..hsv(180, 1, 1)

grow hood
repeat coils {
  colour skin
  forward 1
  lay
}

variant Coiled { coils = 6; hood = 0.8 }

variant Striker {
  hood = 2
  skin = hsv(70, 0.9, 1) // bright, to warn others off
}
```

- `variant Name { … }` sets genes by their **full names** ([6.3](#63-full-names)), one per line
  (or separated by `;`): `petals = 9`, `whorl.petals = 9`, `background.hue = 200`, `seed = 42`.
  A variant only lists the genes it changes. Every other gene keeps the value on its own `gene`
  line, and follows that line if it's changed later.
- Variants can only be at the top level of a creature file. Their names must be different from one
  another; they don't clash with any other names.
- Each value is a constant expression ([6.1](#61-declaring-genes)) that would be allowed as the
  gene's own value: of the gene's kind, within its range, one of its options, or one of its parts.
  A gene can be set at most once in a variant.
- Variants don't change what the program does. They are used by the app wherever it wants a
  group of related creatures ([section 19](#19-genetics)), for example as the loop a creature
  morphs through.

## 7. Variables

```
let size = 1 // create a variable
size = size * 0.9 // change it
size *= 0.9 // the same. Also += -= /=
```

- `let` creates a variable in the current block. Using a name that hasn't been created, or creating
  a name twice in the same block, is an error.
- **Globals** are variables created by top-level `let`s. Parts can read and change them; functions
  can only read them. A global exists from the moment its `let` runs. Using it before then is an
  error.
- A variable created inside a block (`{ … }`) ends with the block. An inner variable may have the
  same name as an outer one and hides it inside the block.
- Parameters are local variables holding copies of the arguments.
- Loop variables (`repeat … as i`, `for i …`) and `side` in `symmetric` are read-only.

## 8. Expressions

### 8.1 Operators

From lowest to highest precedence:

| Operators                       | Meaning                                                                                                                | Operands                                                                                                                                |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `or`                            | true if either side is                                                                                                 | bools                                                                                                                                   |
| `and`                           | true if both sides are                                                                                                 | bools                                                                                                                                   |
| `not` (prefix)                  | the opposite                                                                                                           | bool                                                                                                                                    |
| `==` `!=`                       | equal, not equal                                                                                                       | two values of the same type: numbers, bools, vectors, colours, shapes, and the pattern words (kinds, schemes, finishes, ways of mixing) |
| `<` `<=` `>` `>=`               | comparisons                                                                                                            | numbers                                                                                                                                 |
| `+` `-`                         | add, subtract                                                                                                          | numbers, or two vectors; `+` also joins two lists                                                                                       |
| `*` `/` `%`                     | multiply, divide, remainder                                                                                            | numbers; `*` and `/` also vector with number and two vectors ([8.2](#82-vector-arithmetic)); `%` numbers only                           |
| `-` (prefix)                    | negate                                                                                                                 | number or vector                                                                                                                        |
| `^`                             | power                                                                                                                  | numbers                                                                                                                                 |
| `.name` `f(…)` `skin(t)` `l[i]` | part of a value, call, sampling a gradient ([13.3](#133-gradients)) or a picture, an item of a list ([8.3](#83-lists)) |                                                                                                                                         |

- `and` and `or` only evaluate their right side when needed.
- Comparisons don't chain: `a < b < c` is an error.
- `^` groups to the right: `2^3^2` is `2^9`. Prefix `-` binds less tightly than `^`: `-2^2` is
  `-4`.
- `%` gives a remainder with the sign of the left side: `-7 % 3` is `-1`.
- `==` on numbers, vectors and colours compares exactly.

### 8.2 Vector arithmetic

| Expression                                              | Result             |
| ------------------------------------------------------- | ------------------ |
| vector `+` vector, vector `-` vector                    | per axis           |
| vector `*` number, number `*` vector, vector `/` number | every axis scaled  |
| vector `*` vector, vector `/` vector                    | per axis           |
| `-` vector                                              | every axis negated |

Colours, gradients, shapes and patterns don't take arithmetic operators. Use the library functions
instead.

### 8.3 Lists

A list holds values in order. Lists are written in square brackets, and grow by joining:

```
let points = []
repeat 20 {
  points += [(random(-1, 1), random(-1, 1), 0)]
}
let first = points[0]
let count = length(points)
```

- `l[i]` is the item at position `i`, counting from 0. `i` is rounded to a whole number ([section
  5](#5-values-and-types)), and must be at least 0 and less than `length(l)`.
- `a + b` is a new list with the items of `a` and then those of `b`. Lists aren't changed in place:
  `l += [x]` makes a new list and gives it to `l`.
- The items can be of any types, and of different types.
- `==` compares lists item by item.
- A gene can't be a list, and a list can't be a gene's range.

## 9. Control flow

```
if petals > 10 {
  shape ball
} else if petals > 5 {
  shape cone
} else {
  shape cube
}

repeat 5 { … } // 5 times
repeat petals as i { … } // i = 0, 1, … petals − 1

for i from 1 to segments - 1 { … } // i = 1, 2, … segments − 1
for a from 0 to 360 by 45 { … } // a = 0, 45, … 360

while size > 0.1 { … }
```

- Conditions must be bools. `if 1` is an error.
- `repeat n`: `n` is rounded to a whole number when the loop starts. A count below 1 runs the block
  zero times. With `as i`, `i` counts from 0.
- `for v from a to b by s`: `a`, `b` and `s` are evaluated once, when the loop starts. `s` defaults
  to 1, and `s = 0` is an error. `v` starts at `a` and goes up by `s` while `v ≤ b` (for positive
  `s`) or `v ≥ b` (for negative `s`).
- There is no `break` or `continue`.

## 10. Parts and functions

```
part leg(reach, bend) { // draws
  forward reach
  pitch bend
  lay
}

function wave_height(t, h) { // calculates
  return sin(t * 360) * h
}

leg(2, 30)
let h = wave_height(0.25, 3)
```

**Parts** are pieces of creature. A part call is a statement. A part may move the turtle, lay
shapes, call parts and functions, and change globals. `return` (with no value) leaves it early. A
part with no parameters may be defined and called without brackets: `part tail { … }`, `tail`.

**Functions** calculate values. A function call is an expression, and a function must end by
returning a value with `return <expression>`. A function may read the turtle, globals and genes, and
call other functions, but it **must not** change the turtle, lay shapes, call parts or change
globals. Doing so is an error.

- Arguments are evaluated left to right and passed as copies.
- The number of arguments must match the number of parameters.
- Parts and functions may call themselves, up to the depth limit in
  [section 20](#20-building-a-creature).
- Parts, functions and built-ins share one set of names.

## 11. The turtle

### 11.1 State and directions

The world is right-handed: **x** to the right, **y** up and **z** towards the viewer. The turtle
has:

| State                                   | Starts as                   | Changed by                                                               |
| --------------------------------------- | --------------------------- | ------------------------------------------------------------------------ |
| position                                | `(0, 0, 0)`                 | `forward`, `back`, `move`                                                |
| side axis (x), up axis (y), heading (z) | the world's x, y and z axes | `pitch`, `yaw`, `roll`, `rotate`, `mirror`, `grow` with a negative value |
| size per axis                           | `(1, 1, 1)`                 | `grow`                                                                   |
| mirrored                                | `false`                     | `mirror`, `grow` with a negative value                                   |
| shape transform                         | none (identity)             | `reshape`, `lay { }`                                                     |
| shape                                   | `ball`                      | `shape`                                                                  |
| colour                                  | `white`                     | `colour`                                                                 |
| shine, sharpness                        | 0, 0                        | `shine`, `sharpness`                                                     |
| texture                                 | `none`                      | `texture`                                                                |
| wear                                    | 1                           | `wear`                                                                   |

The turtle faces along its **heading**. Its **size** is kept per axis: the x size belongs to the
side axis, the y size to the up axis and the z size to the heading, and each stays with its axis
when the turtle turns.

### 11.2 Moving

| Command     | Effect                                                                                                         |
| ----------- | -------------------------------------------------------------------------------------------------------------- |
| `forward d` | move `d × size.z` along the heading                                                                            |
| `back d`    | `forward -d`                                                                                                   |
| `move v`    | move `v.x × size.x` along the side axis, `v.y × size.y` along the up axis and `v.z × size.z` along the heading |

### 11.3 Turning

Angles are in degrees. Each turn is a rotation about one of the turtle's own axes, using the
right-hand rule: with the right thumb along the axis, positive angles turn the way the fingers curl.

| Command             | Rotates about                              | Positive angles                                             |
| ------------------- | ------------------------------------------ | ----------------------------------------------------------- |
| `pitch a`           | the side axis                              | tip the heading towards the turtle's down (nose down)       |
| `yaw a`             | the up axis                                | turn the heading towards the side axis                      |
| `roll a`            | the heading                                | turn the side axis towards up                               |
| `rotate a around v` | the axis `v.x·side + v.y·up + v.z·heading` | right-hand rule about that axis. A zero vector does nothing |

When the turtle is mirrored, its axes form a left-handed set, so the same commands produce the
mirror image of the turns they would make unmirrored. This is what makes mirrored halves match.

### 11.4 Growing and mirroring

| Command                            | Effect                                                                                                                                  |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `grow k`                           | multiply the size of every axis by `abs(k)`. A negative `k` mirrors all three axes                                                      |
| `grow v`                           | multiply each axis's size by the absolute value of the matching part of `v`. Each negative part reverses that axis and flips `mirrored` |
| `mirror x`, `mirror y`, `mirror z` | reverse that axis and flip `mirrored`. `mirror x` is the same as `grow (-1, 1, 1)`                                                      |

Size affects everything after it: later moves go further and later shapes are bigger.

### 11.5 Branches

```
branch {
  forward 2
  lay
}
```

`branch` saves the **whole** turtle state (every row of the table in
[11.1](#111-state-and-directions)), runs the block, and restores the state, whatever the block did.

### 11.6 Symmetry

```
symmetric x {
  wing(side)
}
```

`symmetric a { body }` runs `body` twice, each time inside its own `branch`: first unchanged, then
after `mirror a`. Inside the body, the read-only variable `side` is `1` on the first run and `-1` on
the second. The axis is `x`, `y` or `z`.

### 11.7 The shape transform

Besides the turtle, there's a **shape transform**: an extra position, set of axes and size that is
applied to each shape as it's laid, without moving the turtle.

```
reshape { grow (1, 0.3, 4); pitch 10 }
lay
lay // both shapes squashed and tilted

lay { grow (1, 0.3, 4) } // only this shape
```

- `reshape { … }` changes the shape transform. It applies to every shape laid afterwards, until it
  is changed again or the enclosing `branch` ends.
- `lay { … }` saves the shape transform, applies the block to it, lays one shape, and restores the
  shape transform.
- Inside `reshape { }` and `lay { }`, the commands `forward`, `back`, `move`, `pitch`, `yaw`,
  `roll`, `rotate`, `grow` and `mirror` act on the shape transform instead of the turtle, with the
  same meanings (using the shape transform's own axes and sizes). `let`, assignment and `if` are
  also allowed. Nothing else is.

A shape is placed by taking its geometry ([section 12](#12-shapes)), applying the shape transform,
and then applying the turtle (its size, its axes and its position, in that order).

### 11.8 The focus point

A creature's **focus point** is its middle as far as the app is concerned: the camera looks at it,
and a dance turns the creature round it ([section 17](#17-dance-styles)).

```
lay { grow 4 } // the body
branch {
  forward 3
  lay // the head
  focuspoint
}
focuspoint // the last one counts: the camera looks at the middle of the body
```

- `focuspoint` marks where the turtle is as the focus point. It doesn't change the turtle.
- When it runs more than once, the last one counts.
- It's allowed in a creature's top-level code and its parts, but not in functions, `lay { }` or
  `reshape { }`, backgrounds, dance blocks or patterns.
- A creature without `focuspoint`, or whose focus point isn't finite, has its focus point at the
  middle of its shapes: the centre of the smallest box, lined up with the axes, that holds them
  all. That middle moves when shapes come and go on one side, which a focus point doesn't.

### 11.9 Common surprises

Each of these follows from the rules above, but each catches people out at first.

**Shapes point along the heading, not up.** A cone's tip and a tube's length lie along the
turtle's heading ([section 12](#12-shapes)), so a shape points wherever the turtle faces and never
needs turning to match it. At the start the heading is the world's z, towards the viewer, so a
cone laid straight away points at you. In the example, the `pitch -90` turns the heading up first,
so the cone stands upright like a party hat:

```
shape cone
branch {
  pitch -90 // heading now up
  lay // tip at the top
}
lay // tip towards the viewer
```

**Growing makes later moves longer.** `forward d` moves `d` times the turtle's size along the
heading ([11.2](#112-moving)), so after a `grow` the turtle steps further as well as laying bigger
shapes. In the example, both `forward 1` lines are the same, but the second moves 3 units, because
of the `grow 3` before it. To make one shape bigger without changing the steps after it, grow the
shape alone with `lay { grow 3 }`:

```
forward 1 // moves 1
grow 3
forward 1 // moves 3
lay
```

**The turtle and the shape transform are different things.** Commands at the top level move, turn
and grow the turtle, and everything after them is affected. The same commands inside `lay { }` or
`reshape { }` change only the shapes ([11.7](#117-the-shape-transform)). In the example, the first
`lay` squashes one ball flat and leaves the turtle alone, so the `forward 2` steps 2 and the last
ball is round. Had `grow (1, 0.2, 1)` been written outside the braces, every later ball would be
flat too:

```
lay { grow (1, 0.2, 1) } // a flat ball
forward 2
lay // a round ball
```

**Positive pitch tips the nose down.** `pitch 30` turns the heading towards the turtle's down, and
`pitch -30` towards its up ([11.3](#113-turning)). In the example, the neck leans up and forward
from the body because its pitch is negative.

**Turns are mirrored on the mirrored side.** Inside `symmetric x { }`, the second run is mirrored,
so each `yaw` and `roll` there turns the other way ([11.3](#113-turning)). That's what makes the two
halves match: write one side, and the other side is its reflection. In the example, the one
`yaw 40` turns both ears outwards, each to its own side. Use `side` only when the two runs really
should differ, not to undo the mirror.

```
pitch -40 // the neck leans up
forward 2
symmetric x {
  branch {
    yaw 40 // each ear turns outwards
    forward 1
    lay
  }
}
```

**A part leaves the turtle where it ended.** A part call doesn't restore the turtle
([section 10](#10-parts-and-functions)), so everything after it starts where the part finished.
Put the call inside a `branch` when it should start from the same place as what comes next. In
the example, the `branch` keeps the turtle where it was, so `tail` starts from the body:

```
part leg {
  pitch 60
  forward 2
  lay
}

part tail {
  back 2
  lay
}

branch {
  leg
}
tail
```

## 12. Shapes

| Command     | Effect                                                                                                                                                                       |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shape s`   | choose the shape for later `lay`s. `s` is a shape, or a number: rounded, then wrapped into 0–5 by `abs(n) % 6`, in the order `tube`, `cube`, `cone`, `ball`, `ring`, `donut` |
| `lay`       | lay the current shape                                                                                                                                                        |
| `lay { … }` | lay it with extra shape transform commands ([11.7](#117-the-shape-transform))                                                                                                |

Each laid shape records its placement, shape, colour, shine, sharpness, texture and wear at the moment
it's laid.

**Geometry.** Every shape fits in a 1×1×1 box centred on the turtle. Its length axis, where it has
one, is the heading.

| Shape   | Geometry                                                                                   |
| ------- | ------------------------------------------------------------------------------------------ |
| `cube`  | a cube with sides of 1                                                                     |
| `ball`  | a sphere 1 across                                                                          |
| `tube`  | a cylinder 1 across and 1 long, along the heading                                          |
| `cone`  | a cone 1 long along the heading, with a base 1 across at the back and its tip at the front |
| `ring`  | a thin torus around the heading, 1 across and 0.2 thick                                    |
| `donut` | a fat torus around the heading, 1 across and 1/3 thick                                     |

### 12.1 Strokes

A **stroke** is one smooth tube instead of separate shapes, for tentacles, hair, vines and the
like. Inside `stroke { … }`, each `lay` adds a point that the tube passes through instead of laying
a shape:

```
stroke {
  repeat 12 as i {
    colour hsv(200 + i * 10, 0.8, 1)
    lay { grow 0.3 * (1 - i / 14) }
    forward 0.5
    pitch 12
  }
}
```

- The block runs as usual. The turtle isn't put back at its end (wrap it in `branch` for that).
- Each `lay` inside, directly or in a part it calls, adds a point to the innermost stroke. A
  `stroke` inside another is a tube of its own.
- A point records where the shape would have been placed (the turtle and the shape transform,
  [11.7](#117-the-shape-transform)), and the colour, shine and sharpness. The shape, texture and
  wear aren't used: a stroke shows its plain colour.
- The tube passes through each point's middle, in the order they were laid, like a thread pulled
  through beads. At each point it runs the way from the point before to the point after (at the
  first and last points, towards their one neighbour). Between two points, its middle follows a
  cubic Hermite curve that starts and ends in those directions, each pulling as far as the two
  points are apart. Only where the points are matters, not which way the turtle faced: turning
  before or after `forward` gives the same curve. In the example, each `pitch` curves it a little
  further down.
- At each point, the tube's cross-section is the middle of the shape's box: an ellipse with the
  shape's side and up axes, 1 across at size 1. In the example, `grow 0.3 * (1 - i / 14)` makes it
  narrow towards the end. `grow (w, h, 1)` makes it `w` wide and `h` high, so a stroke can be a flat
  ribbon, and a `roll` between points twists it. How long the shape would have been along the
  heading doesn't matter.
- Between two points, the cross-section's width and height change in a straight line, and its
  axes turn smoothly from one point's to the next, staying square to the tube. Colours blend as
  `mix` does ([13.1](#131-colours)), so in the example the hue moves smoothly along the tube.
  Shine and sharpness change in a straight line.
- Both ends are rounded: half an ellipsoid that reaches past the end point by half the
  cross-section's smaller width.
- A point in the same place as the one before it is left out. A stroke with fewer than two places
  draws nothing.
- Each point counts as a shape towards the 50,000 shapes a creature may lay
  ([section 20](#20-building-a-creature)).

## 13. Colour and material

### 13.1 Colours

| Form | Example                           | Notes                                                                                                                                      |
| ---- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| name | `red`                             | `red`, `orange`, `yellow`, `green`, `cyan`, `blue`, `purple`, `magenta`, `pink`, `brown`, `white`, `grey` / `gray`, `black`, `transparent` |
| HSV  | `hsv(h, s, v)`, `hsv(h, s, v, a)` | hue in degrees (wrapped into 0–360), saturation, value and alpha 0–1 (clamped)                                                             |
| RGB  | `rgb(r, g, b)`, `rgb(r, g, b, a)` | each 0–1 (clamped)                                                                                                                         |
| hex  | `#ff8000`, `#ff800080`            | the last pair, if there is one, is alpha                                                                                                   |

Whichever form it's written in, a colour is a value of **hue, saturation, value and alpha**. Genes,
ranges, blending and gradients all work on those four channels, with hue on a circle. Alpha is
opacity: 1 is solid and 0 is invisible.

**Blending two colours** (in `mix`, `smoothmix` and gradients) blends saturation, value and alpha
in a straight line, and hue the short way round the circle. Hues exactly 180 degrees apart blend in
the increasing direction. Spectrums ([13.3](#133-gradients)) and morphing
([19.3](#193-morphing)) are the exceptions.

**Blends that move.** When the colours being blended change, because genes morph or the music or
time moves them, the short way switches sides as their hues pass 180 degrees apart, and every
colour in between jumps to the other side of the circle at once. To keep such a blend steady,
blend the hue numbers instead: `mix` on two numbers is a straight line, so the hue never switches
sides.

```
let top = hue + spread * music.level // hue and spread are number genes
repeat 10 as i {
  colour hsv(mix(hue, top, i / 9), 0.8, 1) // always goes up from hue, however far apart the ends get
  lay
  forward 1
}
```

The named colours are:

| Name     | Value              | Name           | Value                 |
| -------- | ------------------ | -------------- | --------------------- |
| `red`    | `hsv(0, 1, 1)`     | `magenta`      | `hsv(300, 1, 1)`      |
| `orange` | `hsv(30, 1, 1)`    | `pink`         | `hsv(330, 0.4, 1)`    |
| `yellow` | `hsv(60, 1, 1)`    | `brown`        | `hsv(30, 0.75, 0.45)` |
| `green`  | `hsv(120, 1, 1)`   | `white`        | `hsv(0, 0, 1)`        |
| `cyan`   | `hsv(180, 1, 1)`   | `grey`, `gray` | `hsv(0, 0, 0.5)`      |
| `blue`   | `hsv(240, 1, 1)`   | `black`        | `hsv(0, 0, 0)`        |
| `purple` | `hsv(270, 1, 0.8)` | `transparent`  | `hsv(0, 0, 1, 0)`     |

### 13.2 Material

| Command       | Effect                                                                                        |
| ------------- | --------------------------------------------------------------------------------------------- |
| `colour c`    | colour for later shapes. `c` is a colour (to use a gradient, sample it: `colour skin(t)`)     |
| `shine x`     | strength of highlights, 0–1 (clamped)                                                         |
| `sharpness x` | how tight the highlights are, 0–1 (clamped)                                                   |
| `texture p`   | texture for later shapes: a pattern, or `none` ([section 14](#14-textures))                   |
| `wear x`      | how much of their texture later shapes wear, 0–1 (clamped): 0 the plain colour, 1 all texture |

### 13.3 Gradients

```
let skin = gradient(black, red at 0.2, yellow, white at 1)
repeat 20 as i {
  colour skin(i / 19)
  forward 1
  lay
}
```

- `gradient(…)` takes two or more **stops**. Each stop is a colour, optionally followed by
  `at p`, its position from 0 to 1.
- A stop without a position: the first defaults to 0, the last to 1, and the others are spaced
  evenly between the nearest stops on either side that have positions.
- Positions must not decrease. Two stops may share a position, which makes a sharp edge.
- **Sampling a gradient:** to get a colour out of a gradient, write the gradient followed by a
  position in brackets, as if calling it. `skin(0.5)` is the colour halfway along `skin`, and
  `skin(i / 19)` in the example above moves along the gradient as `i` goes from 0 to 19.
- The position is clamped to 0–1. Before the first stop the colour is the first stop's, after the
  last stop it's the last stop's, and between two stops it's those two colours blended
  ([13.1](#131-colours)).

**Spectrums.** `spectrum(…)` is written and sampled like `gradient(…)`, with one difference: between
two stops, hue moves in a straight line from one number to the other, never across 0°. So
`spectrum(blue, red)` passes through cyan, green and yellow (240° down to 0°), where
`gradient(blue, red)` goes the short way, through magenta.

```
let flame = spectrum(hsv(60, 1, 1), hsv(0, 1, 1), hsv(280, 1, 0.5)) // yellow, red, then back through every hue to violet
```

## 14. Textures

Textures are generated from a recipe of a few values, so they can be genes and evolve with the
creature.

```
gene skin_kind = marble from [marble, cells, aurora, plasma]
gene skin_hue = 200 in 0..360
gene skin_seed = 7 in 0..99 step 1
gene skin_scheme = dusk from [jewel, duotone, split, analogous, pastel, dusk, electric]
gene skin_finish = pearl from [matte, metallic, iridescent, pearl, satin]

gene skin = 1 in 0..1 // how much of its texture it wears

texture pattern(skin_kind, skin_hue, skin_seed, skin_scheme, skin_finish)
wear skin
lay
texture mixed(pattern(cells, 40, 3), warp, vortex, 0.6)
lay
texture none
```

- `pattern(kind, hue, seed)` makes a texture. The **kind** is one of `sunburst`, `vortex`,
  `plasma`, `cells`, `kaleidoscope`, `interference`, `starburst`, `marble`, `lightning`,
  `aurora` and `bloom`. The **hue** (degrees, as in `hsv`) is the colour the palette is built
  round. The **seed** (rounded to a whole number) picks the layout and the pattern's own details.
- Two more arguments may follow: the **colour scheme** and the **finish**.

| Scheme      | Colours                                                                    |
| ----------- | -------------------------------------------------------------------------- |
| `jewel`     | deep, rich colours beside the hue, from dark to glowing (the default)      |
| `duotone`   | two hues far apart, meeting in a soft neutral                              |
| `split`     | the hue with the two beside its opposite, such as teal with coral and gold |
| `analogous` | close hues flowing into each other                                         |
| `pastel`    | light and soft                                                             |
| `dusk`      | cool shadows and warm lights                                               |
| `electric`  | near-black to a blazing colour and white, like neon                        |

| Finish       | Surface                                                    |
| ------------ | ---------------------------------------------------------- |
| `matte`      | plain colours (the default)                                |
| `metallic`   | bright bands and white highlights, like polished metal     |
| `iridescent` | the hue slides along, like oil on water or a beetle's back |
| `pearl`      | pale, with a soft pink-green-blue play of colour           |
| `satin`      | a soft band of highlight                                   |

- `mixed(p, way, kind, amount)` mixes a second pattern of the given kind into the pattern `p`.
  The **amount** runs from 0 to 1 (values outside are clamped). The second pattern takes its own
  layout from `p`'s seed, and the colours are always `p`'s.

| Way     | Mixing                                             |
| ------- | -------------------------------------------------- |
| `warp`  | the second pattern pushes the first one around     |
| `blend` | the two patterns blended                           |
| `mask`  | the first pattern shows where the second is bright |
| `carve` | the second pattern is cut out of the first         |

- A pattern holds at most one second pattern: mixing a mixed pattern replaces its second pattern.
  Mixing `none` gives `none`.
- Kinds, schemes, finishes and ways of mixing are values, so genes can choose between them
  (`from [ … ]`) and they breed like shapes.
- `none` means no texture.
- The same recipe always gives the same picture.
- **Wearing a texture.** A shape shows its texture's own colours with a hint of the shape's colour
  (a fifth of the way towards it), so each part keeps a little of its identity. `wear x` blends
  between the two: at 0 the shape shows just its colour, at 1 just the textured look. A gene for
  `wear` lets a creature fade its texture in and out as it morphs, dances and breeds.
- How a texture is wrapped onto each shape is decided by the renderer.
- **Changing a texture.** The hue, scheme, finish and wear only recolour a pattern, so they can
  follow `time` and `music` smoothly. A new kind, seed or second pattern draws a new pattern, which
  takes a moment; the app may show the old one until the new one is ready, and fade from one to
  the other.

### 14.1 Your own patterns

A creature can bring its own pattern kinds, written in GenoCode. A `pattern` block names a new kind
and draws its grey picture; `pattern(…)` then uses it like any built-in kind, coloured by a hue, a
scheme and a finish:

```
creature Shell

pattern Ripples {
  gene rings = 8 in 2..20 // how many rings
  gene wobble = 0.3 in 0..1

  let turn = random(0, 360)
  let lumps = clouds(5, 3)
  value picture {
    // picture { } gives each pixel its own x and y (where it is)
    // and r (its distance from the middle); you don't make them
    let ripple = sin(r * rings * 180 + turn + lumps(x, y) * wobble * 360)
    value ripple * 0.5 + 0.5
  }
}

shape ball
texture pattern(Ripples, 30, 4, dusk, pearl)
lay
```

- **A pattern's code runs once for each picture it draws**, and ends with `value p`, where `p` is
  the picture. The picture is grey, from 0 (dark) to 1 (light). Values outside are cut off, and
  the palette colours it ([section 14](#14-textures)).
- **`random` draws from the recipe's seed.** So `pattern(Ripples, 30, 4)` and
  `pattern(Ripples, 30, 5)` are two different pictures of the same kind, and each recipe always
  gives the same picture.
- **Pictures are values.** `clouds(…)`, `blur(…)` and the other picture functions
  ([section 18.7](#187-pictures)) make them, and `p(x, y)` reads a picture at a point, smoothly
  between its pixels. Outside −1..1 the picture is folded back, as in a mirror, so there are no
  seams.
- **`picture { … }` makes a picture by running its block once for every pixel.** Inside the
  block, `x` and `y` are where the pixel is, from −1 to 1 (`x` from left to right, `y` from top to
  bottom), `r` is the distance from the middle, and `a` is the angle from the `x` axis, in degrees
  from −180 to 180. The block ends with `value v`, the pixel's number.
- **Inside `picture { }`, a picture named on its own is its value at this pixel,** and `p(x, y)` is
  its value at another point. `random`, `clouds` and the other picture functions can't be used
  there; draw random settings before the block, and keep them in lists ([section 8.3](#83-lists)).
- A pattern may hold genes, `let`, assignment, `if`, `repeat`, `for`, `while` and `value`. It may
  use the library ([section 18](#18-library)), but not the turtle, shapes, `time`, `beat` or
  `music`.
- **A pattern is self-contained**, like a background: it can't use the creature's genes, variables,
  parts or functions. Its genes have full names starting with its name, such as `Ripples.rings`, and
  they breed and morph with the rest of the creature's genes.
- **Its name is a new pattern kind.** It can't be a built-in name or the name of a part or
  function. It works everywhere a kind does: `pattern(Ripples, …)`, `mixed(p, warp, Ripples, 0.5)`
  and kind genes (`gene kind = Ripples from [marble, Ripples]`). The creature's background can use
  it too.
- **When a pattern is mixed** ([section 14](#14-textures)), the `blur` and `zoom_blur` calls
  wrapped round its final `value` wait until after the mixing, as the built-in kinds' blurs do. In
  a pattern that ends

  ```
  value zoom_blur(blur(rays, 2), 0.3)
  ```

  the second pattern is mixed into `rays`, and then the mix is blurred and zoom-blurred, so both
  patterns are softened. A pattern mixed in as the second one comes in without those blurs. On its
  own, unmixed, a pattern looks just as its code says.

- With `warp`, the pixels' `x` and `y` are pushed about before the code sees them, so every pattern
  bends without having to know.
- The pictures are drawn in the app's own time, not every frame: a pattern can't read `time` or
  `music`. Its colours can still follow them, because the hue, scheme, finish and wear only
  recolour it.

**Pattern files.** The contents of a pattern block, with the header `pattern <Name>` in place of
the braces, form a pattern file. A pattern file and a pattern block convert into each other without
any other change. Putting a pattern file into a creature adds its block, or replaces the block of
the same name.

```
pattern Ripples
// Rings that wobble.

gene rings = 8 in 2..20
gene wobble = 0.3 in 0..1

let turn = random(0, 360)
let lumps = clouds(5, 3)
value picture {
  // picture { } gives each pixel its own x and y (where it is)
  // and r (its distance from the middle); you don't make them
  let ripple = sin(r * rings * 180 + turn + lumps(x, y) * wobble * 360)
  value ripple * 0.5 + 0.5
}
```

GenoCode's own pattern kinds are written as pattern files too, in the `patterns` folder, as
examples to read and change.

## 15. Backgrounds

A creature can carry the background it's shown against:

```
background {
  gene kind = aurora from [aurora, plasma, marble, cells]
  gene hue = 260 in 0..360
  gene seed = 12 in 0..99 step 1
  gene pulse = 30 in 0..90 // how far the colours shift with the bass

  fill pattern(kind, hue + pulse * music.bass, seed)
}
```

- `fill p` sets what the background shows: a pattern, a colour (flat), or a gradient (0 at the
  bottom of the view, 1 at the top). It must be the last statement in the block, and there must be
  exactly one.
- The block may hold genes, `let`, assignment, `if` and `fill`. It may use library functions,
  `time`, `beat` and `music`.
- **A background is self-contained.** It can't lay shapes, call the creature's parts or functions,
  or read the creature's genes or variables.
- Its genes have full names starting with `background.`.
- Without a background block, the app shows its own default background.

**Background files.** The contents of a background block, with the header `background <Name>` in
place of the braces, form a background file:

```
background Northern_Lights

gene kind = aurora from [aurora, plasma, marble, cells]
gene hue = 260 in 0..360
gene seed = 12 in 0..99 step 1
gene pulse = 30 in 0..90

fill pattern(kind, hue + pulse * music.bass, seed)
```

A background file and a background block convert into each other without any other change. Putting
a background file into a creature replaces the creature's background block. Its genes keep their
`background.` full names.

## 16. Time and music

A creature can react to time and music through these read-only values:

| Name             | Range     | Meaning                                                                                                                                                                                                                                                              |
| ---------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `time`           | 0 upwards | seconds since the creature started being shown                                                                                                                                                                                                                       |
| `beat`           | 0 → 1     | position within the current beat: 0 on the beat, rising towards 1 just before the next                                                                                                                                                                               |
| `music.bass`     | 0–1       | level of the low frequencies                                                                                                                                                                                                                                         |
| `music.mid`      | 0–1       | level of the middle frequencies                                                                                                                                                                                                                                      |
| `music.high`     | 0–1       | level of the high frequencies                                                                                                                                                                                                                                        |
| `music.level`    | 0–1       | overall loudness: rises at once and falls over a fraction of a second, so the short gaps between notes don't read as silence                                                                                                                                         |
| `music.hit`      | 0–1       | jumps up on each onset (a drum hit, a note starting) and falls back                                                                                                                                                                                                  |
| `music.bass_hit` | 0–1       | jumps up on each low onset (a kick drum, a bass note) and falls back                                                                                                                                                                                                 |
| `music.mid_hit`  | 0–1       | jumps up on each onset in the middle (a snare, a voice) and falls back                                                                                                                                                                                               |
| `music.high_hit` | 0–1       | jumps up on each high onset (a hi-hat, a cymbal) and falls back                                                                                                                                                                                                      |
| `music.tempo`    | 0–1       | how fast the beat is: 0 at 60 beats a minute or slower, 1 at 180 or faster. It is 0 until a beat is found, and holds through a part of the song with no beat                                                                                                         |
| `music.energy`   | 0–1       | how intense the music has been over the last few seconds: loud and busy is high. It moves slowly, and stays low all through a quiet part of a song, where `music.level` soon reads high again                                                                        |
| `music.bright`   | 0–1       | how bright the sound is: 0 dark and bassy, 1 sparkling                                                                                                                                                                                                               |
| `music.rough`    | 0–1       | how rough the sound is: 0 smooth, pure notes (a flute, a soft pad), 1 noise (cymbals, distortion, a crowd)                                                                                                                                                           |
| `music.balance`  | −1 to 1   | which side the sound comes from: −1 left, 0 the middle, 1 right                                                                                                                                                                                                      |
| `music.note`     | 0–360     | the note or chord sounding now, as a hue: C is 0 (red), then G 30, D 60, A 90, E 120, B 150, F♯ 180, C♯ 210, G♯ 240, D♯ 270, A♯ 300 and F 330, so notes that sound close have neighbouring hues. A chord reads between its notes. It glides, and wraps from 360 to 0 |
| `music.clear`    | 0–1       | how clearly a note or chord stands out: 1 for a single note, about 0.6 for a chord, near 0 for drums alone                                                                                                                                                           |
| `music.key`      | 0–360     | the key the song is in, on the same wheel: a song in C reads 0. A minor key reads as the major key with the same notes (A minor as C). It stays the same for most of a song                                                                                          |
| `music.major`    | 0–1       | whether the song's key is major or minor: 1 major (often heard as happy), 0 minor (often heard as sad), 0.5 unsure. It moves slowly                                                                                                                                  |
| `music.pitch`    | 0–1       | how high the tune is, against where it has been over the last while: 0.5 is its usual height, 1 half an octave or more above it                                                                                                                                      |
| `music.quiet`    | 0–1       | rises in a quiet part of the song: the music is well under the loudest it has been over the last minute or so                                                                                                                                                        |
| `music.build`    | 0–1       | rises while the music builds up: it is getting louder, brighter and busier than a few seconds before                                                                                                                                                                 |
| `music.drop`     | 0–1       | jumps up when the bass comes in after a quiet part or a build, and falls back over a second or two. Drops come at least 8 seconds apart                                                                                                                              |
| `music.change`   | 0–1       | jumps up when a new part of the song starts (the sound differs much more than usual from the seconds before) and falls back                                                                                                                                          |

```
gene flap = 30 in 0..70 // how hard the wings beat with the bass
gene sway = 15 in 0..40 // how far the body sways, music or not

yaw sway * wave(time / 4)
symmetric x {
  wing(side)
}

part wing(side) {
  roll side * (10 + flap * music.bass)
  // The colour of the note that's sounding: strong when it's clear, pale for drums alone.
  colour hsv(music.note, 0.3 + 0.7 * music.clear, 1)
  // The wing swells when the music drops in, and folds small through a quiet part.
  grow 1 + 0.5 * music.drop - 0.4 * music.quiet
  …
}
```

- They can be used anywhere: in parts, functions, backgrounds and dance blocks.
- `music.note` and `music.key` are hues, made to go straight into a colour, as the wing's colour
  does in the example. They wrap round from 360 to 0, so averaging or smoothing them as plain
  numbers (a dance block's `smooth`, for one) can swing through the whole wheel.
- **When no music is playing**, `beat` and every `music` value are 0. `time` keeps running.
- **The rest pose** is the creature with `time`, `beat` and every `music` value at 0. It is used
  wherever a still picture is wanted, such as thumbnails.
- The app keeps every `music` value within its range in the table whatever the volume of the
  music. How it measures them is up to the app; creatures only rely on their meaning and range.

A creature whose code (outside its background and dance blocks) never reads `time`, `beat` or
`music` is **static**; one that does is **live** ([section 20](#20-building-a-creature)).

## 17. Dance styles

The app can move a creature as a whole while music plays. A **dance style** says how the music
drives each of these effects:

| Effect    | What it does                                                                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `morph`   | moves the creature along its morph (the loop through a set of related creatures): the louder the input, the faster, and it coasts to a stop when the input is quiet |
| `zoom`    | brings the creature towards the viewer as the input rises; it drifts back when the input falls                                                                      |
| `spin`    | sets how fast the creature spins about its spin axis, between a minimum and a maximum                                                                               |
| `turn`    | gives the spin axis a new direction when the input changes enough                                                                                                   |
| `reverse` | reverses the direction of the morph when the input drops, in bursts                                                                                                 |
| `flat`    | turns the creature face-on and spins it flat, then back to tumbling in 3D, in bursts                                                                                |

A creature can carry its dance style in a `dance` block:

```
dance {
  gene drive = 1.1 in 0.3..3 // how fast the music pushes the morph, in creatures a second

  morph follows music.mid speed drive settle 2
  zoom follows music.level amount 0.5 settle 15
  spin follows music.bass_hit from 45 to 170 smooth 0.4
  turn on music.mid changes by 1
  reverse on music.bass drops by 1 on 4 off 4
  flat on music.level drops by 0.86 on 24 off 48
}
```

- The block holds genes, `let`s and at most one line per effect. An effect without a line is off.
- **The block runs again at every moment of the dance**, with the current `time`, `beat` and
  `music` values ([section 16](#16-time-and-music)). So an effect's input can be any expression:
  `morph follows clamp(music.mid * 1.5 - 0.2, 0, 1)` makes the morph more sensitive and ignore
  quiet passages. Settings can be expressions too, of the block's genes, variables and the inputs.
- Like a background, a dance block is self-contained: it can't read the creature's genes or
  variables.
- Its genes have full names starting with `dance.`.

**Effect lines.** Each line is the effect's name, then words, each followed by a value, except
`changes`, `drops`, `rises` and `upright`, which stand alone. The words can come in any order after the
first. Values are numbers. Settings left out take the default shown.

| Effect    | Line                                       | Settings                                                                                                                                                                                                                                                 |
| --------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `morph`   | `morph follows x speed 1 settle 2`         | `speed`: creatures a second at full input. `settle`: seconds to coast to a stop from full speed once the input falls; it speeds up ten times faster                                                                                                      |
| `zoom`    | `zoom follows x amount 0.5 settle 15`      | `amount`: how much nearer the creature comes at full input, from 0 (not at all) to 1 (as near as it can). `settle`: seconds to drift all the way back; it comes in fifty times faster                                                                    |
| `spin`    | `spin follows x from 45 to 170 smooth 0.4` | the spin speed in degrees a second, from `from` (input 0) to `to` (input 1). The input is read each time the spin axis turns, or all the time if there's no `turn` line. `smooth`: seconds to swing smoothly to a new axis and speed; 0 switches at once |
| `turn`    | `turn on x changes by 0.5`                 | gives the spin a new, random axis each time the input triggers                                                                                                                                                                                           |
| `reverse` | `reverse on x drops by 0.5 on 4 off 4`     | reverses the morph each time the input triggers                                                                                                                                                                                                          |
| `flat`    | `flat on x drops by 0.5 on 24 off 48`      | while on, the creature turns face-on and spins flat; each trigger reverses the flat spin                                                                                                                                                                 |

`x` is the effect's input, a number from 0 to 1 (values outside are clamped).

**Upright.** `upright` on the `spin` line keeps the creature the right way up, as a tree or a
building should be: it only turns about its up axis, each `turn` trigger reverses the direction of
the spin instead of picking a new axis, and `flat` never lays it face-on. If the dance switches to
an upright style while the creature is tumbling, it rights itself over about `smooth` seconds.

```
dance {
  spin follows music.level from 10 to 60 smooth 2 upright
  turn on music.mid changes by 1
}
```

**Triggers.** `turn`, `reverse` and `flat` act when their input **triggers**: when it has moved by
at least `by` since the last trigger. After `on x`, one word says which moves count: `changes`
(either way), `drops` (only down) or `rises` (only up); `changes` is the default. While `flat` is
on, `turn` only counts drops, whatever its line says.

**Bursts.** `on n off m` makes an effect work in bursts: it works for `n` triggers, then rests for
`m`, and so on, starting at work. For `flat`, working means being flat, and it starts at rest:
the creature tumbles in 3D for `m` triggers before it first goes flat. Without `on … off …`,
`reverse` always works, and `flat` uses `on 24 off 48`.

- A creature's dance block is its default style. The app may switch to another style while the
  creature dances, and uses its selected style for creatures without a dance block.
- **Dance files** start with `dance <Name>` and hold the contents of a dance block. They convert to
  and from dance blocks in the same way as background files.

## 18. Library

All angles are in degrees.

### 18.1 Numbers

| Function                                       | Result                                                                                                                                                                                    |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `abs(x)`                                       | absolute value                                                                                                                                                                            |
| `sign(x)`                                      | −1, 0 or 1                                                                                                                                                                                |
| `floor(x)`, `ceil(x)`                          | round down, round up                                                                                                                                                                      |
| `round(x)`                                     | nearest whole number, halves rounded up                                                                                                                                                   |
| `frac(x)`                                      | `x` minus its whole part, keeping the sign: `frac(-1.25)` is `-0.25`                                                                                                                      |
| `min(a, b)`, `max(a, b)`                       | smaller, larger                                                                                                                                                                           |
| `clamp(x, lo, hi)`                             | `x` limited to lo..hi                                                                                                                                                                     |
| `wrap(x, lo, hi)`                              | `x` wrapped round into lo..hi, so that hi wraps to lo                                                                                                                                     |
| `bounce(x, lo, hi)`                            | `x` folded back and forth between lo and hi                                                                                                                                               |
| `sqrt(x)`, `exp(x)`, `ln(x)`, `log10(x)`       |                                                                                                                                                                                           |
| `sin(a)`, `cos(a)`, `tan(a)`                   | `a` in degrees                                                                                                                                                                            |
| `asin(x)`, `acos(x)`, `atan(x)`, `atan2(y, x)` | results in degrees                                                                                                                                                                        |
| `degrees(r)`, `radians(d)`                     | convert radians to degrees and back                                                                                                                                                       |
| `wave(t)`                                      | `sin(t × 360)`: one full wave (0, 1, 0, −1, 0) as `t` goes from 0 to 1                                                                                                                    |
| `bump(t)`                                      | `sin(t × 180)`: rises from 0 to 1 and back to 0 as `t` goes from 0 to 1                                                                                                                   |
| `mix(a, b, t)`                                 | `(1 − t)·a + t·b`. Works on numbers, vectors and colours ([13.1](#131-colours)). `t` isn't clamped for numbers and vectors; for colours it's clamped to 0–1                               |
| `smoothmix(a, b, t)`                           | `mix(a, b, u)` with `u = (1 − cos(180 × t)) / 2`, after clamping `t` to 0–1: eases in and out                                                                                             |
| `mandel(x, y)`                                 | how quickly the point `x + iy` escapes under `z → z² + c`, starting from `z = 0`: the number of steps before the size of `z` exceeds 2, up to 64, divided by 64. 1 means it never escaped |

**Constants:** `pi` (3.14159…), `tau` (2π), `golden` (1.61803…), `sqrt2`, `sqrt3`, `ln2`.

### 18.2 Vectors

| Function                   | Result                                             |
| -------------------------- | -------------------------------------------------- |
| `vec(x, y, z)`             | the same as `(x, y, z)`                            |
| `length(v)`                | length (and `length(l)`, a list's number of items) |
| `normalize(v)`             | `v` scaled to length 1. The zero vector stays zero |
| `dot(a, b)`, `cross(a, b)` | dot and cross products                             |

**Constants:** `x_axis` `(1, 0, 0)`, `y_axis` `(0, 1, 0)`, `z_axis` `(0, 0, 1)`.

### 18.3 Colours

`hsv(…)`, `rgb(…)`, `mix(a, b, t)`, `smoothmix(a, b, t)`, `gradient(…)` and `spectrum(…)`, plus the colour names in
[13.1](#131-colours) and the parts `.hue`, `.sat`, `.val` and `.alpha`.

### 18.4 Reading the turtle

| Name                               | Type    | Meaning                                      |
| ---------------------------------- | ------- | -------------------------------------------- |
| `turtle.position`                  | vector  | position in world space                      |
| `turtle.heading`                   | vector  | the heading, as a unit vector in world space |
| `turtle.up`                        | vector  | the up axis, as a unit vector                |
| `turtle.side`                      | vector  | the side axis, as a unit vector              |
| `turtle.size`                      | vector  | size per axis                                |
| `turtle.mirrored`                  | bool    | whether the turtle is mirrored               |
| `turtle.shape`                     | shape   | current shape                                |
| `turtle.colour`                    | colour  | current colour                               |
| `turtle.shine`, `turtle.sharpness` | number  | current material                             |
| `turtle.wear`                      | number  | how much of its texture a shape wears        |
| `turtle.texture`                   | pattern | current texture                              |

These describe the turtle, not the shape transform.

### 18.5 Noise and randomness

| Function               | Result                                                                                                                                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `noise(x)`, `noise(v)` | smooth noise from −1 to 1 that changes gently as `x` or `v` changes. It is Perlin's improved gradient noise (2002) with his reference permutation table, scaled to −1..1; `noise(x)` is `noise((x, 0, 0))` |
| `fbm(x)`, `fbm(v)`     | fractal noise: five layers of `noise`, each at twice the frequency and half the strength of the last, scaled to −1..1                                                                                      |
| `random(lo, hi)`       | a random number from `lo` up to (but not including) `hi`                                                                                                                                                   |

`noise` and `fbm` always give the same result for the same input.

`random` is deterministic too. Each build starts a fresh sequence, seeded from the creature's
**`seed` gene**, and every call to `random` takes the next number in that sequence. A creature that
uses `random` automatically has the gene `seed`: a whole number from 0 to 4,294,967,295, starting
at 0, which
mutation replaces with a new random value rather than nudging, and which doesn't blend when
morphing ([section 19](#19-genetics)). The sequence is generated by mulberry32 (a 32-bit generator):

```
next():  state = (state + 0x6D2B79F5) mod 2^32
         z = state
         z = (z xor (z >>> 15)) × (z or 1)          (32-bit)
         z = z xor (z + (z xor (z >>> 7)) × (z or 61))   (32-bit)
         return (z xor (z >>> 14)) / 2^32            (a number from 0 up to 1)
random(lo, hi) = lo + (hi − lo) × next()
```

The state starts as the `seed` gene's value. Use `noise` for variation that should change smoothly
when a creature morphs.

In a pattern ([section 14.1](#141-your-own-patterns)), the sequence starts from the recipe's seed
instead, afresh for each picture, and `random` doesn't give the creature a `seed` gene.

### 18.6 Lists

| Function    | Result                          |
| ----------- | ------------------------------- |
| `length(l)` | how many items the list `l` has |

### 18.7 Pictures

These make and change pictures. They can only be used in pattern code, outside `picture { }`
([section 14.1](#141-your-own-patterns)). They're built-in names only there: elsewhere, a creature
may use `stretch`, `power` or `blur` as names of its own.

| Function                      | Result                                                                                                                                                                                                                                          |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clouds()`, `clouds(o, s)`    | fractal noise: `o` layers (1 to 12, 6 if left out) of random values on a grid, the first `s` × `s` (at least 1, 4 if left out), each layer twice as fine and half as strong as the last, smoothly enlarged and added up, then stretched to 0..1 |
| `blur(p, w)`, `blur(p, w, h)` | `p` blurred, `w` across and `h` down (`w` if left out). Widths are in pixels of a picture 512 across, so a blur looks the same at any size                                                                                                      |
| `zoom_blur(p, s)`             | `p` streaked out from the middle: the average of `p` enlarged from 1 to `1 + s` times about the middle                                                                                                                                          |
| `stretch(p)`                  | `p` stretched so its darkest point is 0 and its lightest 1                                                                                                                                                                                      |
| `power(p, e)`                 | every value of `p` raised to the power `e`                                                                                                                                                                                                      |

How they work, so that a pattern always draws the same picture:

- **`clouds(o, s)`** takes `n × n` numbers from the random sequence for each layer `k` (0 to
  `o − 1`, where `n` is `s · 2^k` but at most the picture's size), row by row. It enlarges the
  grid with Catmull-Rom curves, holding the ends, first along the rows and then down. It adds the
  layers with strengths 1, 1/2, 1/4, …, then stretches the sum to 0..1.
- **`blur`** is a gaussian blur, across and then down, with the picture's edge pixels repeated
  beyond it. Very small widths leave the picture as it is.
- **`zoom_blur`** averages 24 copies, enlarged by 1, 1 + s/24, 1 + 2s/24, …, and read smoothly
  between pixels.
- **Reading** `p(x, y)` blends the four nearest pixels.

### 18.8 Debugging

`print(a, b, …)` writes its arguments, separated by spaces, to the app's console. It accepts any
values, and strings in double quotes.

## 19. Genetics

This section defines what the app does to genes. The app chooses _when_ to do it, for example when
the user presses Mutate.

A creature whose children don't keep its look can say so with a line at its top level:

```
breed off
```

The app then won't mutate or breed it. It can still be morphed and danced. `breed on` is the
default, and a creature can say either only once.

### 19.1 Mutation

Mutation has a **strength** from 0 to 1, chosen by the user, and a **gene rate**. Unless the app
lets the user change it, the gene rate is `4 / n` for `n` genes that aren't locked, and at most ½, so
about four genes change at a time. Each gene is considered separately: with probability equal to the
gene rate it's changed, as follows. Otherwise it's left alone. Locked genes are never changed.

A **step** of up to `r` is `r × (u₁ − u₂)` for two uniformly random numbers `u₁` and `u₂` from 0 to 1:
small steps are more likely than big ones. The new value is `v` plus the step, or `v` minus it if
that would leave the range, and then kept within the range.

| Gene                | Change                                                                                                                                                                                       |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| number              | a step of up to `r = strength × (max − min)`                                                                                                                                                 |
| stepped number      | as a number, then rounded to the nearest `min + k·step` that lies within the range                                                                                                           |
| log number          | as a number, but on the natural logarithms of the value and bounds, then converted back                                                                                                      |
| vector              | each axis as a number, using its own range (and `log`, if declared)                                                                                                                          |
| colour              | saturation, value and alpha as numbers. Hue: a step of up to `r = strength × the arc's length`, taken round the circle and kept on the range's arc. A whole-circle range wraps round instead |
| bool                | flipped with probability `strength`                                                                                                                                                          |
| choice, part choice | with probability `strength`, replaced by one of the other options, chosen uniformly                                                                                                          |
| `seed`              | with probability `strength`, replaced by a new uniformly random seed                                                                                                                         |

An app may mutate a creature **within its family**: its variants ([6.6](#66-variants)) show how far
apart each gene's values are meant to be. The **spread** of each number, axis or channel is the width
of the values the creature and its variants have, as a part of the range (on the logarithms for a
`log` gene; for a hue, the widest gap between two of them the short way round, as a part of the arc).
Each `r` above is then multiplied by twice the spread, or by 1/10 if that's smaller, so genes the
family agrees on move only a little.

### 19.2 Breeding

A child has exactly two parents, **A** and **B**. The child's program is A's program, with its genes
set as follows. A gene of A's is **matched** if B has a gene with the same full name and the same
kind; unmatched genes keep A's value.

| Gene                              | Matched value                                                                                                                                                  |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| number                            | with probability ½, a uniformly random point between A's and B's values; otherwise A's or B's value with equal probability (¼ each overall)                    |
| stepped number                    | as a number, then rounded to the nearest step within the range                                                                                                 |
| log number                        | as a number, with the random point taken between the logarithms                                                                                                |
| vector, colour                    | as a number, the whole value at once: every axis or channel comes from the same parent, or the same part of the way between them. Hue goes the short way round |
| bool, choice, part choice, `seed` | A's or B's value, with equal probability                                                                                                                       |

Every result is kept within A's range for that gene.

### 19.3 Morphing

Morphing makes the in-between creature at position `t` (from 0 to 1) between A and B. Its program is
A's when `t < ½` and B's when `t ≥ ½`. Each gene in that program takes the value below, using the
other creature's matched gene (same full name and kind); an unmatched gene keeps its own value.

| Gene                              | Value at `t`                                                                      |
| --------------------------------- | --------------------------------------------------------------------------------- |
| number, stepped number            | `(1 − t)·A + t·B`. Stepped numbers are **not** rounded, so morphs are smooth      |
| log number                        | `A × (B / A)^t`                                                                   |
| vector, colour                    | each axis or channel separately. Hue moves along the gene's range of hues (below) |
| bool, choice, part choice, `seed` | A's value when `t < ½`, B's when `t ≥ ½`                                          |

Values aren't limited to either creature's range while morphing.

A colour gene's hue moves along its range of hues, so it never crosses 0° unless the range does:
from 350° to 10° it goes down through every hue when the range is the whole circle, and up through
red when the range is `hsv(330, …)..hsv(30, …)`. That keeps spectrums ([13.3](#133-gradients)) of
colour genes smooth all through a morph, since a spectrum's colours would jump to the other side of
the circle when a hue crossed 0°. A hue outside its range goes the short way.

A morph through several creatures (a loop) is a chain of these morphs between neighbours. When A
and B share a program, a morph is smooth all the way; when their programs differ, the creature
changes shape at the halfway point. A creature with variants ([6.6](#66-variants)) has a loop of its
own: the creature itself, then each variant in the order they're written.

### 19.4 Saving

A creature that has been mutated, bred or morphed is saved as an ordinary creature file: its
program, with each gene's new value written into the gene's line. Nothing else in the program
changes, except that the file is laid out by the formatter, and a gene whose value hasn't changed
keeps the text it was written with. Variants are kept as they are. A variant shown on its own can be
changed the same way: its new values are written into its block, adding a line for a gene it didn't
set, and a gene put back to the creature's value loses its line. The new values are written
readably: stepped numbers exactly, other numbers to four significant figures, colours as `hsv(…)`,
and choices by name, always within the gene's range. The automatic `seed` gene has no line of its
own, so it isn't saved yet: a saved creature that uses `random` starts again from seed 0.

## 20. Building a creature

1. **Checking.** The file is read and checked: syntax, names, gene rules, function rules, and types
   wherever they can be known without running the program. Problems are reported with a line and
   column. Errors stop the build; warnings don't. Besides the warnings given elsewhere, the checker
   warns about two things that build but rarely mean what they say:
   - a `shape` with nothing laid before the shape is set again, or before the end of the creature,
     a `branch` or a `symmetric` body. It usually belongs before the `lay` it was meant for.
   - a part call among the creature's top-level statements, followed by more of them that may lay
     shapes, when the part moves, turns, grows or mirrors the turtle outside a `branch`. Everything
     after the call starts where the part ended; a `branch` around the call stops that.
2. **Building.** The top-level statements run once, from the top, with the creature's gene values
   and the current time and music inputs. Every `lay` adds one shape. The result is a list of
   shapes, each with its placement, shape, colour, shine, sharpness, texture and wear.
3. **Showing.** The app draws the shapes, with the background and dance effects. Its camera looks
   at the focus point ([11.8](#118-the-focus-point)), from far enough away to see every shape.
   - A **static** creature (one that doesn't read `time`, `beat` or `music`) is built once for each
     set of gene values. Morph frames can be built in advance.
   - A **live** creature is rebuilt every frame with the current inputs, and while morphing, with
     the in-between genes for that frame.

**Limits.** A build stops with a warning, keeping the shapes laid so far, if it lays more than
50,000 shapes, runs more than 10,000,000 steps (statements and expression evaluations), or nests
part and function calls more than 200 deep.

**Numbers that go wrong.** Arithmetic is ordinary 64-bit floating point: `1 / 0` is infinity and
`sqrt(-1)` is not a number. A shape whose placement isn't finite is left out, with a warning, and
the rest of the creature is still built. In-between creatures in a morph sometimes do this.

## 21. Blocks

The block editor shows the same program as the text. Both are built from one syntax tree: text is
parsed into the tree and shown as blocks, and blocks are turned back into the tree and printed as
text by the standard formatter.

| Construct                                                                                                                                          | Block                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `creature Name` and the top-level statements                                                                                                       | the creature's main block, with the statements stacked below it                                                                           |
| `part`, `function`                                                                                                                                 | a "define" block with the parameters. Parts then appear as stacking blocks in the palette, and functions as value blocks                  |
| `gene`                                                                                                                                             | a gene block with a slider (numbers), colour pickers (colours), range handles, a switch (bools) or a dropdown (choices) and a description |
| `background { }`                                                                                                                                   | a background block holding its genes and one fill block, with a live preview and an export button                                         |
| `dance { }`                                                                                                                                        | a dance block holding its genes and one block per effect, with an export button                                                           |
| `let`, assignment, turtle commands, `shape`, `colour`, `shine`, `sharpness`, `texture`, `wear`, `lay`, `focuspoint`, part calls, `return`, `print` | stacking blocks with slots for values. Labels can be friendlier than the keywords, such as "turn left/right" for `yaw`                    |
| `if`, `repeat`, `for`, `while`, `branch`, `symmetric`, `lay { }`, `reshape { }`, `stroke { }`                                                      | blocks that wrap around other blocks                                                                                                      |
| expressions                                                                                                                                        | value blocks that plug into slots: round for numbers, pointed for bools, swatches for colours                                             |

**Keeping the two in step:**

- The formatter decides spacing, line breaks and brackets, so editing as blocks reformats the
  text. Names, values, structure and comments are kept.
- A comment on its own line belongs to the statement below it and appears as a note on that block.
  A comment at the end of a gene line is the gene's description.
- While the text has a syntax error, the blocks show the last version that could be read, marked
  as out of date.
- Where blocks sit on the canvas isn't part of the program. Without a saved arrangement, blocks are
  laid out automatically in the order of the code: the main block first, then each define block,
  then the background and dance blocks.

## 22. Grammar

EBNF. `{ x }` means zero or more, `[ x ]` means optional. `NL` is the end of a statement: a line
end ([section 4](#4-lexical-structure)) or `;`.

```
file          = creature_file | background_file | dance_file | pattern_file ;
creature_file = "creature" NAME NL { item } ;
background_file = "background" NAME NL bg_body ;
dance_file    = "dance" NAME NL dance_body ;
pattern_file  = "pattern" NAME NL pattern_body ;

item          = gene | part | function | statement
              | "background" "{" bg_body "}"
              | "dance" "{" dance_body "}"
              | "pattern" NAME "{" pattern_body "}"
              | "variant" NAME "{" { gene_ref "=" expr NL } "}" ;
gene_ref      = ( NAME | "background" | "dance" ) { "." NAME } ;

gene          = "gene" NAME "=" expr [ gene_range ] NL ;
gene_range    = "in" expr ".." expr [ "step" expr | "log" ]
              | "from" "[" expr { "," expr } "]" ;

part          = "part" NAME [ "(" [ params ] ")" ] body ;
function      = "function" NAME "(" [ params ] ")" body ;
params        = NAME { "," NAME } ;
body          = "{" { gene | statement } "}" ;
block         = "{" { statement } "}" ;

statement     = ( simple | compound ) ;
simple        = "let" NAME "=" expr NL
              | NAME assign_op expr NL
              | NAME [ "(" [ args ] ")" ] NL
              | "return" [ expr ] NL
              | "print" "(" [ args ] ")" NL
              | "lay" NL
              | "focuspoint" NL
              | turtle_cmd NL
              | material_cmd NL ;
compound      = "if" expr block { "else" "if" expr block } [ "else" block ]
              | "repeat" expr [ "as" NAME ] block
              | "for" NAME "from" expr "to" expr [ "by" expr ] block
              | "while" expr block
              | "branch" block
              | "symmetric" axis block
              | "lay" block
              | "reshape" block
              | "stroke" block ;
assign_op     = "=" | "+=" | "-=" | "*=" | "/=" ;

turtle_cmd    = ( "forward" | "back" | "move" | "pitch" | "yaw" | "roll" | "grow" ) expr
              | "rotate" expr "around" expr
              | "mirror" axis ;
material_cmd  = ( "shape" | "colour" | "color" | "shine" | "sharpness" | "texture" | "wear" ) expr ;
axis          = "x" | "y" | "z" ;

bg_body       = { gene | bg_stmt } "fill" expr NL ;
bg_stmt       = "let" NAME "=" expr NL
              | NAME assign_op expr NL
              | "if" expr bg_block { "else" "if" expr bg_block } [ "else" bg_block ] ;
bg_block      = "{" { bg_stmt } "}" ;

dance_body    = { gene | "let" NAME "=" expr NL | effect NL } ;
effect        = effect_name { setting } ;
setting       = "changes" | "drops" | "rises" | "upright" | word expr ;
effect_name   = "morph" | "zoom" | "spin" | "turn" | "reverse" | "flat" ;
word          = NAME | "from" | "to" | "by" ;

pattern_body  = { gene | pattern_stmt } "value" expr NL ;
pattern_stmt  = "let" NAME "=" expr NL
              | NAME assign_op expr NL
              | "if" expr pattern_block { "else" "if" expr pattern_block } [ "else" pattern_block ]
              | "repeat" expr [ "as" NAME ] pattern_block
              | "for" NAME "from" expr "to" expr [ "by" expr ] pattern_block
              | "while" expr pattern_block ;
pattern_block = "{" { pattern_stmt } "}" ;
picture_body  = { pattern_stmt } "value" expr NL ;

expr          = or_expr ;
or_expr       = and_expr { "or" and_expr } ;
and_expr      = not_expr { "and" not_expr } ;
not_expr      = "not" not_expr | compare ;
compare       = sum [ ( "==" | "!=" | "<" | "<=" | ">" | ">=" ) sum ] ;
sum           = product { ( "+" | "-" ) product } ;
product       = unary { ( "*" | "/" | "%" ) unary } ;
unary         = "-" unary | power ;
power         = postfix [ "^" unary ] ;
postfix       = primary { "." NAME | "(" [ args ] ")" | "[" expr "]" } ;
primary       = NUMBER | HEX_COLOUR | STRING | "true" | "false"
              | NAME
              | "turtle" "." NAME | "time" | "beat" | "music" "." NAME
              | "(" expr ")"
              | "(" expr "," expr "," expr ")"
              | ( "gradient" | "spectrum" ) "(" stop "," stop { "," stop } ")"
              | "[" [ args ] "]"
              | "picture" "{" picture_body "}" ;
stop          = expr [ "at" expr ] ;
args          = expr { "," expr } ;
```

Rules the grammar doesn't express are given in the sections above: where genes may go
([6.2](#62-where-genes-can-go)), what may appear inside `lay { }` and `reshape { }`
([11.7](#117-the-shape-transform)), what a `stroke { }` does with the shapes laid inside it
([12.1](#121-strokes)), what functions may do ([section 10](#10-parts-and-functions)),
constant expressions ([6.1](#61-declaring-genes)), where strings are allowed
([section 4](#4-lexical-structure)), and what pattern code and `picture { }` may use
([section 14.1](#141-your-own-patterns)). `"picture"` and `"value"` are only words in pattern
code.

## 23. Not yet settled

- **More inputs** ([section 16](#16-time-and-music)): such as tempo, or the viewer interacting with
  the creature.
- **Gene bias:** a possible `bias b` modifier on number genes, making mutation favour one part of
  the range. The word `bias` may become a keyword.
- **Patterns that move:** a GPU version of pattern code, so a pattern's picture (not just its
  colours) could follow `time` and `music` every frame.
- **Mate preferences:** genes for what a creature finds attractive in a partner, for when creatures
  breed by themselves.
