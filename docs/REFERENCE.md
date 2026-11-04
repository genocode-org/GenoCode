# GenoCode reference

Every statement, function, input and constant in GenoCode, one entry each: how it's written, what
its parameters are, what it gives back, and an example. [The language](LANGUAGE.md) explains how
GenoCode works as a whole and is the definition when the two differ; each entry here links to the
part of it that goes deeper.

## How to read an entry

Each entry has some of these:

- **Syntax**: how it's written. Words in the syntax that aren't GenoCode's own words, such as
  `distance` in `forward distance`, stand for values you write in; **Parameters** says what each
  one is. `{ … }` stands for a block of statements. When there are several lines, each is one way
  to write it.
- **Parameters**: each value it takes, with its type and meaning. Types are the ones in
  [Values and types](LANGUAGE.md#5-values-and-types): number, bool, vector, colour, gradient,
  shape, pattern, pattern kind, scheme, finish, way of mixing, list and picture. **Any** means a
  value of any type.
- **Returns**: what a function gives back.
- **Used in**: where it's allowed. **Creature code** means a creature's top level and its parts.
  Functions, background blocks, dance blocks and pattern code each allow less, as listed.
- **Remarks**: rules and details worth knowing.
- **Example**: code you can paste into a creature. Longer examples are whole files.

A **whole number** parameter is rounded to the nearest whole number, with halves rounded up. Angles
are always in degrees.

## Contents

1. [Files](#1-files): [creature](#creature), [breed](#breed), [variant](#variant)
2. [Genes, variables, parts and functions](#2-genes-variables-parts-and-functions):
   [gene](#gene), [let](#let), [assignment](#assignment), [part](#part), [function](#function),
   [return](#return)
3. [Control flow](#3-control-flow): [if](#if), [repeat](#repeat), [for](#for), [while](#while)
4. [The turtle](#4-the-turtle): [forward](#forward), [back](#back), [move](#move),
   [pitch](#pitch), [yaw](#yaw), [roll](#roll), [rotate](#rotate), [grow](#grow),
   [mirror](#mirror), [branch](#branch), [symmetric](#symmetric), [reshape](#reshape),
   [focuspoint](#focuspoint)
5. [Shapes and material](#5-shapes-and-material): [shape](#shape), [lay](#lay),
   [stroke](#stroke), [colour](#colour), [shine](#shine), [sharpness](#sharpness), [texture](#texture), [wear](#wear)
6. [Backgrounds](#6-backgrounds): [background](#background), [fill](#fill)
7. [Dance styles](#7-dance-styles): [dance](#dance), [morph](#morph), [zoom](#zoom),
   [spin](#spin), [turn](#turn), [reverse](#reverse), [flat](#flat),
   [triggers and bursts](#triggers-and-bursts)
8. [Pattern code](#8-pattern-code): [pattern blocks and files](#pattern-blocks-and-files),
   [picture](#picture), [value](#value), [x, y, r and a](#x-y-r-and-a)
9. [Debugging](#9-debugging): [print](#print)
10. [Number functions](#10-number-functions): [abs](#abs), [sign](#sign), [floor](#floor),
    [ceil](#ceil), [round](#round), [frac](#frac), [min](#min), [max](#max), [clamp](#clamp),
    [wrap](#wrap), [bounce](#bounce), [sqrt](#sqrt), [exp](#exp), [ln](#ln), [log10](#log10),
    [sin](#sin), [cos](#cos), [tan](#tan), [asin](#asin), [acos](#acos), [atan](#atan),
    [atan2](#atan2), [degrees](#degrees), [radians](#radians), [wave](#wave), [bump](#bump),
    [mix](#mix), [smoothmix](#smoothmix), [mandel](#mandel)
11. [Vector and list functions](#11-vector-and-list-functions): [vec](#vec), [length](#length),
    [normalize](#normalize), [dot](#dot), [cross](#cross)
12. [Colours and gradients](#12-colours-and-gradients): [hsv](#hsv), [rgb](#rgb),
    [gradient](#gradient), [spectrum](#spectrum)
13. [Noise and randomness](#13-noise-and-randomness): [noise](#noise), [fbm](#fbm),
    [random](#random)
14. [Texture functions](#14-texture-functions): [pattern](#pattern), [mixed](#mixed)
15. [Picture functions](#15-picture-functions): [clouds](#clouds), [blur](#blur),
    [zoom_blur](#zoom_blur), [stretch](#stretch), [power](#power)
16. [Inputs](#16-inputs): [time](#time), [beat](#beat), [music](#music), [turtle](#turtle)
17. [Constants](#17-constants): [numbers](#number-constants), [axes](#axis-vectors),
    [colour names](#colour-names), [shapes](#shapes), [pattern kinds](#pattern-kinds),
    [schemes](#schemes), [finishes](#finishes), [ways of mixing](#ways-of-mixing), [none](#none)
18. [Values and operators](#18-values-and-operators): [literals](#literals),
    [operators](#operators), [parts of values](#parts-of-values)

## 1. Files

### creature

Starts a creature file. It must be the file's first line.

```text
creature Name
```

| Parameter | Type | Description                                                              |
| --------- | ---- | ------------------------------------------------------------------------ |
| `Name`    | name | The creature's name: letters, digits and `_`, not starting with a digit. |

**Remarks**

- After the header come, in any order: top-level statements, genes, parts, functions, variants, at
  most one [background](#background) block, at most one [dance](#dance) block and any number of
  [pattern](#pattern-blocks-and-files) blocks.
- Comment lines directly below the header are the creature's description, which the app shows.
- The top-level statements run from the top each time the creature is built.
- Other files start with `background Name`, `dance Name` or `pattern Name` instead; see their
  entries.

**Example**

```
creature Snowball
// One white ball.

shape ball
lay
```

**See also:** [Files](LANGUAGE.md#3-files)

### breed

Says whether the app may mutate and breed the creature.

```text
breed off
breed on
```

**Used in:** a creature's top level, at most once.

**Remarks**

- `breed off` is for creatures whose children wouldn't keep their look. The app then won't mutate
  or breed them, but they can still be morphed and danced.
- `breed on` is the default, so it's never needed.

**Example**

```
creature Clock
breed off
```

**See also:** [Genetics](LANGUAGE.md#19-genetics)

### variant

Keeps another set of gene values alongside the creature's own.

```text
variant Name { gene = value; … }
```

| Parameter | Type      | Description                                                                                            |
| --------- | --------- | ------------------------------------------------------------------------------------------------------ |
| `Name`    | name      | The variant's name. Variants' names must differ from one another.                                      |
| `gene`    | full name | A gene's [full name](LANGUAGE.md#63-full-names), such as `petals`, `whorl.petals` or `background.hue`. |
| `value`   | any       | A constant value the gene could have: in its range, or one of its options.                             |

**Used in:** a creature's top level.

**Remarks**

- Each setting is on its own line, or separated by `;`. A gene can be set at most once in a variant.
- A variant only lists the genes it changes. Every other gene keeps the value on its own `gene`
  line, and follows that line if you change it later. In the example below, `Wide` doesn't mention
  `coils`, so it has 3 coils, like the creature itself.
- A creature that uses [random](#random) has a hidden gene, `seed`, which picks its random
  numbers. It has no `gene` line, but a variant can still set it: in the example, `seed = 42` gives
  `Wide` its own wiggle, while `Coiled` keeps the creature's seed, 0.
- Variants don't change what the program does. The app uses them where it wants a family of
  related creatures: a creature's morph loops through itself and then each variant in order.

**Example**

```
creature Cobra

gene hood = 1.2 in 0.5..2
gene coils = 3 in 1..6 step 1

grow hood
repeat coils {
  yaw random(-20, 20) // each coil bends a random way
  forward 1
  lay
}

variant Coiled { coils = 6; hood = 0.8 }

variant Wide {
  hood = 2
  seed = 42 // bends its coils other ways
}
```

| Gene    | The creature | `Coiled` | `Wide`                        |
| ------- | ------------ | -------- | ----------------------------- |
| `hood`  | 1.2          | 0.8      | 2                             |
| `coils` | 3            | 6        | 3, from the `gene coils` line |
| `seed`  | 0            | 0        | 42                            |

**See also:** [gene](#gene), [Variants](LANGUAGE.md#66-variants)

## 2. Genes, variables, parts and functions

### gene

Declares a value the app may change when it mutates, breeds and morphs the creature.

```text
gene name = value in min..max
gene name = value in min..max step size
gene name = value in min..max log
gene name = true
gene name = value from [option, option, …]
```

| Parameter | Type                                                                                    | Description                                                                                       |
| --------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `name`    | name                                                                                    | The gene's name. It can't be a built-in name or `seed`.                                           |
| `value`   | number, vector, colour, bool or one of the options                                      | The creature's current value.                                                                     |
| `min`     | same type as `value`                                                                    | The smallest value the app may give it. For vectors and colours, each axis or channel separately. |
| `max`     | same type as `value`                                                                    | The largest value. Must be above `min`.                                                           |
| `size`    | number                                                                                  | With `step`: the gene only takes values `min`, `min + size`, `min + 2 × size`, …                  |
| `option`  | number, vector, colour, shape, pattern kind, scheme, finish, way of mixing or part name | The values a choice gene chooses from: at least two, all of one type.                             |

**Used in:** a file's top level, or directly inside a `part`, `function`, `background`, `dance`
or `pattern` body. Not inside `if`, loops, `branch`, `symmetric`, `lay { }` or `reshape { }`.

**Remarks**

- `log` makes mutation and morphing work by ratios, for sizes and speeds. `min` must be above 0,
  and `log` can't be used with `step`.
- A bool gene has no range: `gene spiky = true`.
- A colour gene's hue is a circle. `hsv(0, …)..hsv(360, …)` allows every hue. When the first hue
  is bigger, the range runs up through red: in the example, `warm` goes from 300 (magenta) through
  0 (red) to 40 (orange) ([Colour genes](LANGUAGE.md#64-colour-genes)).
- A gene whose options are part names is a part gene: calling it calls the part it names. In the
  example, `limb(2)` calls `leg(2)` or `fin(2)`, whichever `limb` holds. Every part in the list must
  take the same number of parameters ([Part genes](LANGUAGE.md#65-part-genes)).
- The value, range and options must be constant: literals, built-in constants and maths on them.
  Other genes, variables, `random`, `noise`, `time` and `music` aren't constant.
- A gene has one value for the whole creature, even if declared in a part that runs many times.
- Genes can't be assigned to.
- A `//` comment at the end of the line is the gene's description, shown by the app.
- A gene's full name is prefixed by where it's declared. In the example, `bend` is declared in
  `part leg`, so its full name is `leg.bend`. Genes in a background, a dance or a pattern start with
  `background.`, `dance.` or the pattern's name.

**Example**

```
creature Critter

gene petals = 7 in 3..16 step 1 // how many limbs
gene size = 1 in 0.1..10 log
gene skin = hsv(120, 0.6, 0.9) in hsv(60, 0.3, 0.5)..hsv(180, 1, 1)
gene warm = hsv(20, 0.8, 1) in hsv(300, 0.5, 0.5)..hsv(40, 1, 1)
gene spiky = true
gene body = cone from [ball, cone, tube]
gene limb = leg from [leg, fin]

grow size
shape body
colour skin
lay
repeat petals as i {
  branch {
    roll 360 * i / petals
    pitch 90
    limb(2)
  }
}

part leg(reach) {
  gene bend = 30 in 0..90 // how far the legs bend
  colour warm
  pitch bend
  forward reach
  lay
}

part fin(reach) {
  if spiky {
    shape cone
  }
  colour warm
  forward reach
  lay { grow (1, 0.2, 2) }
}
```

**See also:** [variant](#variant), [Genes](LANGUAGE.md#6-genes), [Genetics](LANGUAGE.md#19-genetics)

### let

Creates a variable.

```text
let name = value
```

| Parameter | Type | Description                                            |
| --------- | ---- | ------------------------------------------------------ |
| `name`    | name | The variable's name. It can't be a built-in name.      |
| `value`   | any  | Its first value. The variable can hold any type later. |

**Used in:** everywhere statements are allowed.

**Remarks**

- The variable lasts until the end of the block it's created in. Creating the same name twice in
  one block is an error; an inner block may create a name that hides an outer one.
- A top-level `let` makes a **global**. Parts can read and change globals; functions can only read
  them. A global can't be used before its `let` has run.

**Example**

```
let size = 1
repeat 5 {
  grow size
  lay
  size *= 0.8
}
```

**See also:** [assignment](#assignment), [Variables](LANGUAGE.md#7-variables)

### assignment

Changes a variable's value.

```text
name = value
name += value
name -= value
name *= value
name /= value
```

| Parameter | Type | Description                                                     |
| --------- | ---- | --------------------------------------------------------------- |
| `name`    | name | A variable created with `let`, or a parameter.                  |
| `value`   | any  | The new value, or what to add, subtract, multiply or divide by. |

**Used in:** everywhere except dance blocks.

**Remarks**

- `a += b` is `a = a + b`, and so on, with the same rules as the [operators](#operators).
  `list += [x]` adds an item to the end of a list, as `sizes += [i + 1]` does in the example.
- Genes, loop variables, `side` and globals inside a function can't be assigned to.

**Example**

```
let reach = 3
reach *= 0.5 // now 1.5

let sizes = []
repeat 4 as i {
  sizes += [i + 1] // now [1, 2, 3, 4]
}
```

**See also:** [let](#let)

### part

Defines a piece of creature: code that moves the turtle and lays shapes. Calling it runs that code.

```text
part name(parameter, parameter, …) { … }
part name { … }
name(argument, argument, …)
name
```

| Parameter   | Type | Description                                                             |
| ----------- | ---- | ----------------------------------------------------------------------- |
| `name`      | name | The part's name. Parts, functions and built-ins share one set of names. |
| `parameter` | name | A name for each value the part is given. Inside, it's a local variable. |
| `argument`  | any  | A value for each parameter, in order. Their number must match.          |

**Used in:** definitions at a creature's top level. Calls in creature code.

**Remarks**

- A part with no parameters can be defined and called without brackets, as `tail` is in the
  example.
- A part may move the turtle, lay shapes, call parts and functions, and change globals. It doesn't
  restore the turtle afterwards: put the call in a [branch](#branch) for that, as the example does
  for `leg`.
- `return` with no value leaves a part early. In the example, `leg` draws nothing when `reach` is 0
  or less.
- Parts can be used before they're defined, and can call themselves up to 200 calls deep.
- Genes declared in a part have the part's name in front: `leg.reach`.

**Example**

```
part leg(reach, bend) {
  if reach <= 0 {
    return
  }
  forward reach
  pitch bend
  lay
}

part tail {
  back 2
  lay
}

symmetric x {
  branch {
    yaw 90
    leg(2, 30)
  }
}
tail
```

**See also:** [function](#function), [Parts and functions](LANGUAGE.md#10-parts-and-functions)

### function

Defines a calculation that gives back a value.

```text
function name(parameter, parameter, …) { … }
name(argument, argument, …)
```

| Parameter   | Type | Description                                                    |
| ----------- | ---- | -------------------------------------------------------------- |
| `name`      | name | The function's name.                                           |
| `parameter` | name | A name for each value it's given.                              |
| `argument`  | any  | A value for each parameter, in order. Their number must match. |

**Returns:** the value of the `return` that ends it.

**Used in:** definitions at a creature's top level. Calls anywhere an expression is allowed in
creature code.

**Remarks**

- A function must end by returning a value with `return value`.
- It may read the turtle, globals and genes and call other functions. It must not move or change
  the turtle, lay shapes, call parts or change globals.
- Arguments are copies: changing a parameter doesn't change the caller's variable.

**Example**

```
function taper(i, n) {
  return 1 - i / n * 0.8
}

repeat 6 as i {
  branch {
    grow taper(i, 6)
    lay
  }
  forward 1
}
```

**See also:** [part](#part), [return](#return)

### return

Leaves a function with its value, or leaves a part early.

```text
return value
return
```

| Parameter | Type | Description                                       |
| --------- | ---- | ------------------------------------------------- |
| `value`   | any  | In a function, the value it gives back. Required. |

**Used in:** functions (with a value) and parts (without one).

**Example**

```
function half(x) {
  return x / 2
}
```

**See also:** [function](#function), [part](#part)

## 3. Control flow

### if

Runs a block only when a condition is true.

```text
if condition { … }
if condition { … } else { … }
if condition { … } else if condition { … } else { … }
```

| Parameter   | Type | Description                                    |
| ----------- | ---- | ---------------------------------------------- |
| `condition` | bool | Must be `true` or `false`; `if 1` is an error. |

**Used in:** everywhere except dance blocks.

**Remarks**

- Any number of `else if` blocks may follow, and one `else` at the end.

**Example**

```
gene petals = 7 in 3..16 step 1

if petals > 10 {
  shape ball
} else if petals > 5 {
  shape cone
} else {
  shape cube
}
```

**See also:** [operators](#operators), [Control flow](LANGUAGE.md#9-control-flow)

### repeat

Runs a block a number of times.

```text
repeat count { … }
repeat count as i { … }
```

| Parameter | Type         | Description                                                                |
| --------- | ------------ | -------------------------------------------------------------------------- |
| `count`   | whole number | How many times. Read once, when the loop starts. Below 1 runs it no times. |
| `i`       | name         | A read-only counter: 0 the first time, then 1, 2, … up to `count − 1`.     |

**Used in:** creature code, functions and pattern code.

**Example**

```
repeat 8 as i {
  branch {
    roll 45 * i
    forward 2
    lay
  }
}
```

**See also:** [for](#for), [while](#while)

### for

Runs a block for each value of a counter, from one number to another.

```text
for v from start to end { … }
for v from start to end by step { … }
```

| Parameter | Type   | Description                                                                   |
| --------- | ------ | ----------------------------------------------------------------------------- |
| `v`       | name   | The read-only counter.                                                        |
| `start`   | number | The counter's first value.                                                    |
| `end`     | number | The last value it may take. `end` itself is included if the steps land on it. |
| `step`    | number | How much the counter changes each time. 1 if left out. Can't be 0.            |

**Used in:** creature code, functions and pattern code.

**Remarks**

- `start`, `end` and `step` are read once, when the loop starts.
- With a positive step the loop runs while `v ≤ end`. With a negative one it counts down, while
  `v ≥ end`: the second loop in the example gives `size` the values 1, 0.75, 0.5 and 0.25.

**Example**

```
for a from 0 to 315 by 45 {
  branch {
    yaw a
    forward 3
    lay
  }
}

for size from 1 to 0.25 by -0.25 {
  branch {
    grow size
    lay
  }
  forward 1
}
```

**See also:** [repeat](#repeat), [while](#while)

### while

Runs a block again and again for as long as a condition is true.

```text
while condition { … }
```

| Parameter   | Type | Description                           |
| ----------- | ---- | ------------------------------------- |
| `condition` | bool | Checked before each run of the block. |

**Used in:** creature code, functions and pattern code.

**Remarks**

- There's no `break`: something in the block must make the condition false. A loop that never ends
  is stopped by the build's step limit, with a warning
  ([Building a creature](LANGUAGE.md#20-building-a-creature)).

**Example**

```
let size = 1
while size > 0.1 {
  grow 0.7
  forward 1
  lay
  size *= 0.7
}
```

**See also:** [repeat](#repeat), [for](#for)

## 4. The turtle

The turtle starts at `(0, 0, 0)`, heading along z (towards the viewer), with up along y and its
side along x, size `(1, 1, 1)`. [The turtle](LANGUAGE.md#11-the-turtle) explains its state in full.

Inside [reshape](#reshape) and `lay { }` ([lay](#lay)), the commands in this section change the
shape transform instead of the turtle.

### forward

Moves the turtle along its heading.

```text
forward distance
```

| Parameter  | Type   | Description                                                                                       |
| ---------- | ------ | ------------------------------------------------------------------------------------------------- |
| `distance` | number | How far, in the turtle's own size: it moves `distance × turtle.size.z`. Negative moves backwards. |

**Used in:** creature code, `reshape { }` and `lay { }`.

**Example**

```
repeat 5 {
  lay
  forward 1
}
```

**See also:** [back](#back), [move](#move), [Moving](LANGUAGE.md#112-moving)

### back

Moves the turtle backwards along its heading. `back d` is `forward -d`.

```text
back distance
```

| Parameter  | Type   | Description                        |
| ---------- | ------ | ---------------------------------- |
| `distance` | number | How far, in the turtle's own size. |

**Used in:** creature code, `reshape { }` and `lay { }`.

**Example**

```
back 2
lay
```

**See also:** [forward](#forward)

### move

Moves the turtle sideways, up and forward at once, without turning it.

```text
move offset
```

| Parameter | Type   | Description                                                                                                    |
| --------- | ------ | -------------------------------------------------------------------------------------------------------------- |
| `offset`  | vector | How far along the turtle's side axis (x), up axis (y) and heading (z), each in the turtle's size on that axis. |

**Used in:** creature code, `reshape { }` and `lay { }`.

**Example**

```
move (1, 2, 0) // one to the side, two up
lay
```

**See also:** [forward](#forward)

### pitch

Tips the turtle's nose down or up, turning about its side axis.

```text
pitch angle
```

| Parameter | Type   | Description                                           |
| --------- | ------ | ----------------------------------------------------- |
| `angle`   | number | Degrees. Positive tips the heading down, negative up. |

**Used in:** creature code, `reshape { }` and `lay { }`.

**Remarks**

- When the turtle is mirrored, every turn is the mirror image of what it would be unmirrored, so
  mirrored halves match.

**Example**

```
pitch -90 // now heading up
forward 3
lay
```

**See also:** [yaw](#yaw), [roll](#roll), [rotate](#rotate), [Turning](LANGUAGE.md#113-turning)

### yaw

Turns the turtle left or right, about its up axis.

```text
yaw angle
```

| Parameter | Type   | Description                                                |
| --------- | ------ | ---------------------------------------------------------- |
| `angle`   | number | Degrees. Positive turns the heading towards the side axis. |

**Used in:** creature code, `reshape { }` and `lay { }`.

**Example**

```
yaw 90
forward 2
lay
```

**See also:** [pitch](#pitch), [roll](#roll)

### roll

Rolls the turtle about its heading, like a plane rolling.

```text
roll angle
```

| Parameter | Type   | Description                                       |
| --------- | ------ | ------------------------------------------------- |
| `angle`   | number | Degrees. Positive turns the side axis towards up. |

**Used in:** creature code, `reshape { }` and `lay { }`.

**Example**

```
repeat 6 as i {
  branch {
    roll 60 * i
    pitch 90
    forward 2
    lay
  }
}
```

**See also:** [pitch](#pitch), [yaw](#yaw)

### rotate

Turns the turtle about any axis of its own.

```text
rotate angle around axis
```

| Parameter | Type   | Description                                                                                                                                               |
| --------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `angle`   | number | Degrees, by the right-hand rule about the axis.                                                                                                           |
| `axis`    | vector | The axis in the turtle's own terms: `axis.x` along its side, `axis.y` up, `axis.z` along its heading. It needn't be length 1. A zero vector does nothing. |

**Used in:** creature code, `reshape { }` and `lay { }`.

**Remarks**

- `rotate a around (1, 0, 0)` is the same as `pitch a`, `rotate a around (0, 1, 0)` as `yaw a`
  and `rotate a around (0, 0, 1)` as `roll a`.

**Example**

```
rotate 45 around (1, 1, 0)
lay
```

**See also:** [pitch](#pitch), [yaw](#yaw), [roll](#roll)

### grow

Changes the turtle's size. Everything after it moves further and lays bigger shapes.

```text
grow factor
grow factors
```

| Parameter | Type   | Description                                                                                                                          |
| --------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `factor`  | number | Multiplies the size on every axis. A negative factor also mirrors all three axes.                                                    |
| `factors` | vector | Multiplies the side (x), up (y) and heading (z) sizes separately. Each negative part also reverses that axis and mirrors the turtle. |

**Used in:** creature code, `reshape { }` and `lay { }`.

**Remarks**

- Sizes multiply: `grow 2` twice makes the turtle 4 times its size.
- Each size stays with its own axis when the turtle turns.

**Example**

```
grow 2
lay
lay { grow (1, 0.2, 3) } // a flat slab, this shape only
```

**See also:** [mirror](#mirror), [Growing and mirroring](LANGUAGE.md#114-growing-and-mirroring)

### mirror

Reverses one of the turtle's axes, so everything after it is a mirror image.

```text
mirror x
mirror y
mirror z
```

| Parameter | Type            | Description                                                     |
| --------- | --------------- | --------------------------------------------------------------- |
| axis      | `x`, `y` or `z` | The axis to reverse: the side (`x`), up (`y`) or heading (`z`). |

**Used in:** creature code, `reshape { }` and `lay { }`.

**Remarks**

- `mirror x` is the same as `grow (-1, 1, 1)`. It flips `turtle.mirrored`.
- [symmetric](#symmetric) is the usual way to draw two mirrored halves.

**Example**

```
mirror x
yaw 30 // turns the other way now
forward 2
lay
```

**See also:** [symmetric](#symmetric), [grow](#grow)

### branch

Runs a block, then puts the turtle back exactly as it was.

```text
branch { … }
```

**Used in:** creature code.

**Remarks**

- Everything about the turtle is saved and restored: position, direction, size, mirroring, shape
  transform, shape, colour, shine, sharpness, texture and wear.
- Variables changed inside aren't restored.

**Example**

```
repeat 5 as i {
  branch {
    yaw 72 * i
    forward 3
    lay
  }
}
```

**See also:** [symmetric](#symmetric), [Branches](LANGUAGE.md#115-branches)

### symmetric

Runs a block twice: once as it is, and once mirrored. Each run is in its own branch.

```text
symmetric x { … }
symmetric y { … }
symmetric z { … }
```

| Parameter | Type            | Description                             |
| --------- | --------------- | --------------------------------------- |
| axis      | `x`, `y` or `z` | The axis the second run is mirrored on. |

**Used in:** creature code.

**Remarks**

- Inside the block, the read-only variable `side` is `1` on the first run and `-1` on the
  mirrored run. In the example it makes one side red and the other blue.
- `symmetric x { … }` is `branch { … }` followed by `branch { mirror x; … }`.

**Example**

```
symmetric x {
  colour mix(blue, red, side * 0.5 + 0.5)
  yaw 90
  forward 2
  lay
}
```

**See also:** [mirror](#mirror), [branch](#branch), [Symmetry](LANGUAGE.md#116-symmetry)

### reshape

Changes the shape transform: an extra move, turn and stretch applied to every shape laid after it,
without moving the turtle.

```text
reshape { … }
```

**Used in:** creature code.

**Remarks**

- Inside the block, `forward`, `back`, `move`, `pitch`, `yaw`, `roll`, `rotate`, `grow` and
  `mirror` act on the shape transform, using its own axes and sizes. `let`, assignment and `if`
  are allowed too; nothing else is.
- It lasts until it's changed again or the enclosing [branch](#branch) ends.
- To change just one shape, use `lay { … }` ([lay](#lay)).

**Example**

```
reshape { grow (1, 0.3, 4) }
lay
forward 2
lay // both shapes long and flat
```

**See also:** [lay](#lay), [The shape transform](LANGUAGE.md#117-the-shape-transform)

### focuspoint

Marks where the turtle is as the creature's focus point: the camera looks at it, and a dance turns
the creature round it. Without one, the focus point is the middle of the creature's shapes.

```text
focuspoint
```

**Used in:** creature code. Not in functions or `lay { }`.

**Remarks**

- It doesn't move the turtle.
- When it runs more than once, the last one counts.

**Example**

```
lay { grow 4 } // a round body
branch {
  forward 3
  lay // a head on one side
  focuspoint
}
focuspoint // the last one counts: the camera looks at the body, not between body and head
```

**See also:** [The focus point](LANGUAGE.md#118-the-focus-point)

## 5. Shapes and material

### shape

Chooses the shape that later `lay`s lay.

```text
shape s
```

| Parameter | Type            | Description                                                                                                                                        |
| --------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `s`       | shape or number | One of the [shapes](#shapes), or a number that picks one: rounded, then `abs(n) % 6` in the order `tube`, `cube`, `cone`, `ball`, `ring`, `donut`. |

**Used in:** creature code.

**Remarks**

- The turtle starts with `ball`.
- The checker warns about a `shape` with no `lay` after it, which usually belongs before the `lay`
  it was meant for.

**Example**

```
shape cone
lay
```

**See also:** [lay](#lay), [Shapes](LANGUAGE.md#12-shapes)

### lay

Lays the current shape where the turtle is, in its current colour and material.

```text
lay
lay { … }
```

**Used in:** creature code.

**Remarks**

- The shape fits a 1 × 1 × 1 box centred on the turtle, scaled by the turtle's size. Its length
  axis, where it has one, is the heading.
- `lay { … }` changes the shape transform for this one shape only. Inside the block the same
  commands are allowed as in [reshape](#reshape).
- Each shape keeps the colour, shine, sharpness, texture and wear it was laid with.
- A build stops with a warning after 50,000 shapes.

**Example**

```
shape tube
lay { grow (0.3, 0.3, 4) } // a long thin tube
```

**See also:** [shape](#shape), [reshape](#reshape), [stroke](#stroke)

### stroke

Draws one smooth tube instead of separate shapes: each `lay` inside adds a point the tube passes
through.

```text
stroke { … }
```

**Used in:** creature code.

**Remarks**

- The tube goes through the points in the order they're laid, curving smoothly from one to the
  next like a thread through beads. In the example, `yaw` curls it round.
- Its width at each point is the width the shape would have had. In the example, `grow` makes it
  thinner towards the end.
- Colour, shine and sharpness blend smoothly from one point to the next. In the example, the
  colour runs from orange to purple along the tube.
- The ends are rounded. A stroke needs at least two points to draw anything.
- More details are in the [language specification](LANGUAGE.md#121-strokes).

**Example**

```
stroke {
  repeat 16 as i {
    colour mix(orange, purple, i / 15)
    lay { grow 0.4 - i * 0.02 }
    forward 0.6
    yaw 20
  }
}
```

**See also:** [lay](#lay), [branch](#branch)

### colour

Sets the colour of the shapes laid after it. `color` is the same word.

```text
colour c
color c
```

| Parameter | Type   | Description                                                                                 |
| --------- | ------ | ------------------------------------------------------------------------------------------- |
| `c`       | colour | A [colour name](#colour-names), [hsv](#hsv), [rgb](#rgb) or a hex colour such as `#ff8000`. |

**Used in:** creature code.

**Remarks**

- The turtle starts `white`.
- A gradient isn't a colour: sample it at a position, as `colour skin(0.3)` does in the example
  ([gradient](#gradient)).
- Alpha below 1 makes shapes see-through, like the last ball in the example.

**Example**

```
let skin = gradient(green, yellow)

colour hsv(30, 0.8, 1)
lay
forward 1
colour skin(0.3)
lay
forward 1
colour hsv(200, 1, 1, 0.4)
lay
```

**See also:** [hsv](#hsv), [Colours](LANGUAGE.md#131-colours)

### shine

Sets how strong the highlights are on the shapes laid after it.

```text
shine amount
```

| Parameter | Type   | Description                                        |
| --------- | ------ | -------------------------------------------------- |
| `amount`  | number | 0 (none, the start) to 1 (strong). Clamped to 0–1. |

**Used in:** creature code.

**Example**

```
shine 0.8
sharpness 0.9
lay
```

**See also:** [sharpness](#sharpness), [Material](LANGUAGE.md#132-material)

### sharpness

Sets how small and tight the highlights are on the shapes laid after it.

```text
sharpness amount
```

| Parameter | Type   | Description                                                           |
| --------- | ------ | --------------------------------------------------------------------- |
| `amount`  | number | 0 (broad and soft, the start) to 1 (small and sharp). Clamped to 0–1. |

**Used in:** creature code.

**Example**

```
shine 1
sharpness 0.2
lay
```

**See also:** [shine](#shine)

### texture

Sets the texture of the shapes laid after it.

```text
texture p
```

| Parameter | Type    | Description                                                                 |
| --------- | ------- | --------------------------------------------------------------------------- |
| `p`       | pattern | A texture made by [pattern](#pattern) or [mixed](#mixed), or [none](#none). |

**Used in:** creature code.

**Remarks**

- The turtle starts with `none`.
- A textured shape shows the texture's colours with a fifth of its own colour mixed in. [wear](#wear)
  says how much of the texture shows.

**Example**

```
texture pattern(marble, 200, 7, dusk, pearl)
lay
texture none
```

**See also:** [pattern](#pattern), [wear](#wear), [Textures](LANGUAGE.md#14-textures)

### wear

Sets how much of their texture the shapes laid after it show.

```text
wear amount
```

| Parameter | Type   | Description                                                                |
| --------- | ------ | -------------------------------------------------------------------------- |
| `amount`  | number | 0 (just the shape's colour) to 1 (all texture, the start). Clamped to 0–1. |

**Used in:** creature code.

**Remarks**

- A gene for `wear` lets a creature fade its texture in and out as it morphs, dances and breeds.

**Example**

```
gene coat = 0.6 in 0..1

texture pattern(cells, 40, 3)
wear coat
lay
```

**See also:** [texture](#texture)

## 6. Backgrounds

### background

Gives the creature the background it's shown against. A background file holds the same contents
on its own.

```text
background { … }
background Name
```

| Parameter | Type | Description                     |
| --------- | ---- | ------------------------------- |
| `Name`    | name | In a background file, its name. |

**Used in:** a creature's top level, at most once. `background Name` starts a background file.

**Remarks**

- The block may hold genes, `let`, assignment, `if` and exactly one [fill](#fill), which comes
  last. It may use the library, `time`, `beat` and `music`.
- It's self-contained: it can't lay shapes or use the creature's genes, variables, parts or
  functions. It may use the creature's own [pattern kinds](#pattern-blocks-and-files).
- Its genes' full names start with `background.`.
- Without one, the app shows its own default background.

**Example**

```
background {
  gene hue = 260 in 0..360
  gene pulse = 30 in 0..90 // how far the colours shift with the bass

  fill pattern(aurora, hue + pulse * music.bass, 12)
}
```

**See also:** [fill](#fill), [Backgrounds](LANGUAGE.md#15-backgrounds)

### fill

Says what the background shows.

```text
fill p
```

| Parameter | Type                        | Description                                                                             |
| --------- | --------------------------- | --------------------------------------------------------------------------------------- |
| `p`       | pattern, colour or gradient | A pattern; a plain colour; or a gradient, 0 at the bottom of the view and 1 at the top. |

**Used in:** background blocks and files, as the last statement, exactly once.

**Example**

```
background {
  fill gradient(black, hsv(230, 0.8, 0.3))
}
```

**See also:** [background](#background)

## 7. Dance styles

### dance

Gives the creature its own dance style: how music moves the creature as a whole. A dance file
holds the same contents on its own.

```text
dance { … }
dance Name
```

| Parameter | Type | Description                |
| --------- | ---- | -------------------------- |
| `Name`    | name | In a dance file, its name. |

**Used in:** a creature's top level, at most once. `dance Name` starts a dance file.

**Remarks**

- The block holds genes, `let`s and at most one line for each effect: [morph](#morph),
  [zoom](#zoom), [spin](#spin), [turn](#turn), [reverse](#reverse) and [flat](#flat). An effect
  without a line is off.
- The block runs again at every moment of the dance, so inputs and settings can be expressions of
  `time`, `beat`, `music` and the block's genes and variables.
- Each effect's line starts with its name; the words after it can come in any order. Settings left
  out take their defaults.
- It's self-contained: it can't use the creature's genes or variables. Its genes' full names start
  with `dance.`.
- The app may switch to another style while the creature dances.

**Example**

```
dance {
  gene drive = 1.1 in 0.3..3 // how fast the music pushes the morph

  morph follows music.mid speed drive settle 2
  zoom follows music.level amount 0.5 settle 15
  spin follows music.bass_hit from 45 to 170 smooth 0.4
  turn on music.mid changes by 1
}
```

**See also:** [Dance styles](LANGUAGE.md#17-dance-styles)

### morph

Moves the creature along its morph loop (itself and its variants) at a speed the input sets. It
coasts to a stop when the input is quiet.

```text
morph follows x speed s settle t
```

| Setting   | Type   | Default | Description                                                                                     |
| --------- | ------ | ------- | ----------------------------------------------------------------------------------------------- |
| `follows` | number | —       | The input, 0–1 (clamped). The louder, the faster.                                               |
| `speed`   | number | 1       | Creatures a second at full input.                                                               |
| `settle`  | number | 2       | Seconds to coast to a stop from full speed when the input falls. It speeds up ten times faster. |

**Used in:** dance blocks and files.

**Example**

```
dance {
  morph follows clamp(music.mid * 1.5 - 0.2, 0, 1) speed 1.5
}
```

**See also:** [reverse](#reverse), [dance](#dance)

### zoom

Brings the creature towards the viewer as the input rises; it drifts back when the input falls.

```text
zoom follows x amount a settle t
```

| Setting   | Type   | Default | Description                                                                |
| --------- | ------ | ------- | -------------------------------------------------------------------------- |
| `follows` | number | —       | The input, 0–1 (clamped).                                                  |
| `amount`  | number | 0.5     | How much nearer it comes at full input: 0 not at all, 1 as near as it can. |
| `settle`  | number | 15      | Seconds to drift all the way back. It comes in fifty times faster.         |

**Used in:** dance blocks and files.

**Example**

```
dance {
  zoom follows music.level amount 0.3
}
```

**See also:** [dance](#dance)

### spin

Spins the creature about its spin axis, faster or slower with the input.

```text
spin follows x from slowest to fastest smooth t
spin follows x from slowest to fastest smooth t upright
```

| Setting   | Type   | Default | Description                                                     |
| --------- | ------ | ------- | --------------------------------------------------------------- |
| `follows` | number | —       | The input, 0–1 (clamped).                                       |
| `from`    | number | 45      | Degrees a second at input 0.                                    |
| `to`      | number | 170     | Degrees a second at input 1.                                    |
| `smooth`  | number | 0.4     | Seconds to swing to a new axis and speed. 0 switches at once.   |
| `upright` | —      | off     | Keeps the creature the right way up, turning about its up axis. |

**Used in:** dance blocks and files.

**Remarks**

- With a [turn](#turn) line, the input is read each time the axis turns; without one, all the time.
- `upright` keeps the creature standing, as in the example: it only turns about its up axis,
  each [turn](#turn) reverses the spin instead of picking a new axis, and [flat](#flat) doesn't
  tip it over.

**Example**

```
dance {
  spin follows music.bass_hit from 20 to 200 smooth 0.2 upright
  turn on music.mid changes by 1
}
```

**See also:** [turn](#turn)

### turn

Gives the spin a new, random axis each time the input triggers.

```text
turn on x changes by d
turn on x drops by d
turn on x rises by d
```

| Setting | Type   | Default | Description                             |
| ------- | ------ | ------- | --------------------------------------- |
| `on`    | number | —       | The input, 0–1 (clamped).               |
| `by`    | number | 0.5     | How far the input must move to trigger. |

**Used in:** dance blocks and files.

**Remarks**

- While [flat](#flat) is on, `turn` only counts drops, whatever its line says.
- See [triggers and bursts](#triggers-and-bursts).

**Example**

```
dance {
  turn on music.high drops by 0.6
}
```

**See also:** [spin](#spin)

### reverse

Reverses the direction of the morph each time the input triggers.

```text
reverse on x drops by d
reverse on x drops by d on n off m
```

| Setting              | Type          | Default   | Description                                            |
| -------------------- | ------------- | --------- | ------------------------------------------------------ |
| `on` (first)         | number        | —         | The input, 0–1 (clamped).                              |
| `by`                 | number        | 0.5       | How far the input must move to trigger.                |
| `on` (second), `off` | whole numbers | always on | Works in bursts: for `n` triggers, then rests for `m`. |

**Used in:** dance blocks and files.

**Example**

```
dance {
  morph follows music.mid
  reverse on music.bass drops by 1 on 4 off 4
}
```

**See also:** [morph](#morph), [triggers and bursts](#triggers-and-bursts)

### flat

Turns the creature face-on and spins it flat, in bursts, then back to tumbling in 3D.

```text
flat on x drops by d
flat on x drops by d on n off m
```

| Setting              | Type          | Default | Description                                              |
| -------------------- | ------------- | ------- | -------------------------------------------------------- |
| `on` (first)         | number        | —       | The input, 0–1 (clamped).                                |
| `by`                 | number        | 0.5     | How far the input must move to trigger.                  |
| `on` (second), `off` | whole numbers | 24, 48  | Flat for `n` triggers, then 3D for `m`. It starts in 3D. |

**Used in:** dance blocks and files.

**Remarks**

- Each trigger while flat reverses the flat spin.

**Example**

```
dance {
  spin follows music.bass
  flat on music.level drops by 0.86 on 24 off 48
}
```

**See also:** [spin](#spin), [triggers and bursts](#triggers-and-bursts)

### triggers and bursts

The words that say when [turn](#turn), [reverse](#reverse) and [flat](#flat) act.

```text
on x changes by d
on x drops by d
on x rises by d
on n off m
```

| Word         | Description                                                                                |
| ------------ | ------------------------------------------------------------------------------------------ |
| `on x`       | The input, 0–1. It **triggers** when it has moved by at least `by` since the last trigger. |
| `changes`    | Moves either way count. The default.                                                       |
| `drops`      | Only moves down count.                                                                     |
| `rises`      | Only moves up count.                                                                       |
| `by d`       | How far it must move. Default 0.5.                                                         |
| `on n off m` | After the input: work for `n` triggers, rest for `m`, and so on.                           |

**See also:** [Dance styles](LANGUAGE.md#17-dance-styles)

## 8. Pattern code

### pattern blocks and files

Makes a new pattern kind, written in GenoCode, that [pattern](#pattern) colours like a built-in one.

```text
pattern Name { … }
pattern Name
```

| Parameter | Type | Description                                                         |
| --------- | ---- | ------------------------------------------------------------------- |
| `Name`    | name | The new kind's name. It can't be a built-in name, part or function. |

**Used in:** a creature's top level, any number of times. `pattern Name` starts a pattern file.

**Remarks**

- The code runs once for each picture drawn, and ends with `value p`, where `p` is a
  [picture](#picture). Its numbers run from 0 (dark) to 1 (light); values outside are cut off.
- It may hold genes, `let`, assignment, `if`, `repeat`, `for`, `while` and `value`, and use the
  library and the [picture functions](#15-picture-functions). It can't use the turtle, shapes,
  `time`, `beat`, `music`, or the creature's genes, variables, parts or functions.
- [random](#random) draws from the recipe's seed, so each seed gives a different picture of the
  same kind, and always the same one.
- Its genes' full names start with its name: `Ripples.rings`.

**Example**

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

**See also:** [Your own patterns](LANGUAGE.md#141-your-own-patterns)

### picture

Makes a picture by running a block once for every pixel.

```text
picture { … }
```

**Returns:** a picture.

**Used in:** pattern code, outside other `picture { }` blocks.

**Remarks**

- Inside the block, [x, y, r and a](#x-y-r-and-a) say where the pixel is, and the block ends with
  `value v`, the pixel's number.
- A picture named on its own inside the block is its value at this pixel, as `lumps` is in the
  example. `p(x, y)` reads it at another point.
- `random` and the picture functions can't be used inside. Draw random settings before the block,
  as the example does with `turn` and `lumps`.
- Reading any picture `p(x, y)` blends the four nearest pixels. Outside −1..1 the picture is
  folded back, as in a mirror: in the example, `lumps(x * 2, y)` reads past the edges.

**Example**

```
pattern Rings

let turn = random(0, 1)
let lumps = clouds(4, 2)
value picture {
  let rings = wave(r * 4 + turn) * 0.5 + 0.5
  value rings * 0.6 + (lumps + lumps(x * 2, y)) * 0.2
}
```

**See also:** [value](#value), [clouds](#clouds)

### value

Ends pattern code, giving its picture, or a `picture { }` block, giving the pixel's number.

```text
value v
```

| Parameter | Type              | Description                                                                   |
| --------- | ----------------- | ----------------------------------------------------------------------------- |
| `v`       | picture or number | At the end of a pattern, the picture. In `picture { }`, a number from 0 to 1. |

**Used in:** pattern code, as the last statement.

**Example**

```
pattern Soft

value blur(clouds(), 12)
```

**See also:** [picture](#picture)

### x, y, r and a

Where the pixel is, inside `picture { }`.

| Name | Type   | Description                                               |
| ---- | ------ | --------------------------------------------------------- |
| `x`  | number | From −1 at the left to 1 at the right.                    |
| `y`  | number | From −1 at the top to 1 at the bottom.                    |
| `r`  | number | The distance from the middle.                             |
| `a`  | number | The angle from the `x` axis, in degrees from −180 to 180. |

**Used in:** `picture { }` blocks. Elsewhere they're ordinary names.

**Example**

```
pattern Fan

value picture {
  value wave(a / 30) * 0.5 + 0.5
}
```

## 9. Debugging

### print

Writes values to the app's console, to see what a program is doing.

```text
print(value, value, …)
```

| Parameter | Type           | Description                                                       |
| --------- | -------------- | ----------------------------------------------------------------- |
| `value`   | any, or string | What to write, separated by spaces. Strings are in double quotes. |

**Used in:** creature code and functions.

**Remarks**

- Strings are only allowed in `print`.

**Example**

```
print("size is", turtle.size)
```

## 10. Number functions

All of these can be used in gene declarations, since they give the same result every time.

### abs

```text
abs(x)
```

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| `x`       | number | Any number. |

**Returns:** number. `x` without its sign: `abs(-3)` is 3.

### sign

```text
sign(x)
```

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| `x`       | number | Any number. |

**Returns:** number. −1 if `x` is negative, 0 if it's 0, 1 if it's positive.

**Example**

```
yaw 30 * sign(turtle.position.x)
```

### floor

```text
floor(x)
```

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| `x`       | number | Any number. |

**Returns:** number. `x` rounded down: `floor(2.7)` is 2, `floor(-2.2)` is −3.

**See also:** [ceil](#ceil), [round](#round)

### ceil

```text
ceil(x)
```

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| `x`       | number | Any number. |

**Returns:** number. `x` rounded up: `ceil(2.2)` is 3, `ceil(-2.7)` is −2.

**See also:** [floor](#floor), [round](#round)

### round

```text
round(x)
```

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| `x`       | number | Any number. |

**Returns:** number. The nearest whole number, halves rounded up: `round(2.5)` is 3, `round(-2.5)` is
−2.

**See also:** [floor](#floor), [ceil](#ceil)

### frac

```text
frac(x)
```

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| `x`       | number | Any number. |

**Returns:** number. `x` minus its whole part, keeping the sign: `frac(1.25)` is 0.25 and
`frac(-1.25)` is −0.25.

### min

```text
min(a, b)
```

| Parameter | Type   | Description  |
| --------- | ------ | ------------ |
| `a`, `b`  | number | Two numbers. |

**Returns:** number. The smaller of the two.

**See also:** [max](#max), [clamp](#clamp)

### max

```text
max(a, b)
```

| Parameter | Type   | Description  |
| --------- | ------ | ------------ |
| `a`, `b`  | number | Two numbers. |

**Returns:** number. The larger of the two.

**Example**

```
grow max(0.2, 1 - turtle.position.y / 10)
```

**See also:** [min](#min), [clamp](#clamp)

### clamp

```text
clamp(x, lo, hi)
```

| Parameter | Type   | Description            |
| --------- | ------ | ---------------------- |
| `x`       | number | The number to limit.   |
| `lo`      | number | The lowest it may be.  |
| `hi`      | number | The highest it may be. |

**Returns:** number. `lo` if `x` is below it, `hi` if `x` is above it, otherwise `x`.

**Example**

```
let loud = clamp(music.level * 2, 0, 1)
```

**See also:** [wrap](#wrap), [bounce](#bounce)

### wrap

```text
wrap(x, lo, hi)
```

| Parameter | Type   | Description             |
| --------- | ------ | ----------------------- |
| `x`       | number | The number to wrap.     |
| `lo`      | number | The start of the range. |
| `hi`      | number | The end of the range.   |

**Returns:** number. `x` wrapped round into the range, as on a clock: `wrap(370, 0, 360)` is 10.
`hi` itself wraps to `lo`.

**Example**

```
colour hsv(wrap(200 + time * 30, 0, 360), 0.8, 1)
```

**See also:** [bounce](#bounce), [clamp](#clamp)

### bounce

```text
bounce(x, lo, hi)
```

| Parameter | Type   | Description              |
| --------- | ------ | ------------------------ |
| `x`       | number | The number to fold.      |
| `lo`      | number | The bottom of the range. |
| `hi`      | number | The top of the range.    |

**Returns:** number. `x` folded back and forth between `lo` and `hi`: as `x` rises steadily, the
result climbs to `hi`, falls back to `lo`, climbs again, and so on. `bounce(12, 0, 10)` is 8.

**Example**

```
forward bounce(time, 0, 3)
lay
```

**See also:** [wrap](#wrap), [wave](#wave)

### sqrt

```text
sqrt(x)
```

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| `x`       | number | 0 or more.  |

**Returns:** number. The square root. A negative `x` gives "not a number", and shapes placed with it
are left out with a warning.

### exp

```text
exp(x)
```

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| `x`       | number | Any number. |

**Returns:** number. e (2.71828…) to the power `x`.

**See also:** [ln](#ln)

### ln

```text
ln(x)
```

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| `x`       | number | Above 0.    |

**Returns:** number. The natural logarithm, so `ln(exp(x))` is `x`.

**See also:** [exp](#exp), [log10](#log10)

### log10

```text
log10(x)
```

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| `x`       | number | Above 0.    |

**Returns:** number. The base-10 logarithm: `log10(1000)` is 3.

### sin

```text
sin(angle)
```

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| `angle`   | number | In degrees. |

**Returns:** number from −1 to 1. The sine: `sin(90)` is 1.

**Example**

```
repeat 36 as i {
  branch {
    move (i * 0.5, 2 * sin(i * 20), 0)
    lay
  }
}
```

**See also:** [cos](#cos), [wave](#wave)

### cos

```text
cos(angle)
```

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| `angle`   | number | In degrees. |

**Returns:** number from −1 to 1. The cosine: `cos(0)` is 1.

**See also:** [sin](#sin)

### tan

```text
tan(angle)
```

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| `angle`   | number | In degrees. |

**Returns:** number. The tangent: `tan(45)` is 1.

### asin

```text
asin(x)
```

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| `x`       | number | −1 to 1.    |

**Returns:** number, in degrees from −90 to 90. The angle whose sine is `x`.

### acos

```text
acos(x)
```

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| `x`       | number | −1 to 1.    |

**Returns:** number, in degrees from 0 to 180. The angle whose cosine is `x`.

### atan

```text
atan(x)
```

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| `x`       | number | Any number. |

**Returns:** number, in degrees from −90 to 90. The angle whose tangent is `x`.

**See also:** [atan2](#atan2)

### atan2

```text
atan2(y, x)
```

| Parameter | Type   | Description                  |
| --------- | ------ | ---------------------------- |
| `y`       | number | The point's height.          |
| `x`       | number | The point's distance across. |

**Returns:** number, in degrees from −180 to 180. The angle of the point (x, y) from the x axis,
correct in every quarter: `atan2(1, -1)` is 135.

**Example**

```
let p = turtle.position
yaw atan2(p.y, p.x)
```

### degrees

```text
degrees(r)
```

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| `r`       | number | In radians. |

**Returns:** number. The same angle in degrees: `degrees(pi)` is 180.

**See also:** [radians](#radians)

### radians

```text
radians(d)
```

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| `d`       | number | In degrees. |

**Returns:** number. The same angle in radians: `radians(180)` is `pi`.

**See also:** [degrees](#degrees)

### wave

```text
wave(t)
```

| Parameter | Type   | Description                         |
| --------- | ------ | ----------------------------------- |
| `t`       | number | How far along: one wave for each 1. |

**Returns:** number from −1 to 1. `sin(t × 360)`: 0, 1, 0, −1 and 0 again as `t` goes from 0 to 1,
and repeating after that.

**Example**

```
yaw 20 * wave(time / 4) // sways once every 4 seconds
```

**See also:** [bump](#bump), [sin](#sin)

### bump

```text
bump(t)
```

| Parameter | Type   | Description                 |
| --------- | ------ | --------------------------- |
| `t`       | number | How far along, usually 0–1. |

**Returns:** number. `sin(t × 180)`: rises from 0 to 1 and back to 0 as `t` goes from 0 to 1. Good
for things that are thickest in the middle.

**Example**

```
repeat 10 as i {
  branch {
    grow 0.3 + bump(i / 9)
    lay
  }
  forward 1
}
```

**See also:** [wave](#wave)

### mix

```text
mix(a, b, t)
```

| Parameter | Type                     | Description              |
| --------- | ------------------------ | ------------------------ |
| `a`       | number, vector or colour | The value at `t` = 0.    |
| `b`       | same type as `a`         | The value at `t` = 1.    |
| `t`       | number                   | How far from `a` to `b`. |

**Returns:** the same type as `a`. `(1 − t)·a + t·b`.

**Remarks**

- For numbers and vectors `t` isn't clamped, so `t` = 2 goes past `b`. For colours it's clamped to
  0–1.
- Colours blend saturation, value and alpha in a straight line and hue the short way round.

**Example**

```
colour mix(red, yellow, 0.25)
```

**See also:** [smoothmix](#smoothmix), [gradient](#gradient)

### smoothmix

```text
smoothmix(a, b, t)
```

| Parameter | Type                     | Description                              |
| --------- | ------------------------ | ---------------------------------------- |
| `a`       | number, vector or colour | The value at `t` = 0.                    |
| `b`       | same type as `a`         | The value at `t` = 1.                    |
| `t`       | number                   | How far from `a` to `b`, clamped to 0–1. |

**Returns:** the same type as `a`. Like [mix](#mix), but it eases in and out: it moves slowly near
`a` and `b` and fastest in the middle. It's `mix(a, b, (1 − cos(180 × t)) / 2)`.

### mandel

```text
mandel(x, y)
```

| Parameter | Type   | Description                      |
| --------- | ------ | -------------------------------- |
| `x`       | number | The real part of the point.      |
| `y`       | number | The imaginary part of the point. |

**Returns:** number from 0 to 1. How quickly the point `x + iy` escapes the Mandelbrot set: the
number of steps of `z → z² + c` before `z` grows past 2, up to 64, divided by 64. 1 means it never
escaped.

**Example**

```
repeat 40 as i {
  branch {
    move (i * 0.25, 0, 0)
    grow 0.2 + mandel(i / 20 - 1.5, 0.3)
    lay
  }
}
```

## 11. Vector and list functions

### vec

```text
vec(x, y, z)
```

| Parameter     | Type   | Description      |
| ------------- | ------ | ---------------- |
| `x`, `y`, `z` | number | The three parts. |

**Returns:** vector. The same as writing `(x, y, z)`.

### length

```text
length(v)
length(l)
```

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| `v`       | vector | A vector.   |
| `l`       | list   | A list.     |

**Returns:** number. A vector's length, or how many items a list has.

**Example**

```
let far = length(turtle.position)
let points = [1, 2, 3]
repeat length(points) as i {
  forward points[i]
  lay
}
```

### normalize

```text
normalize(v)
```

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| `v`       | vector | A vector.   |

**Returns:** vector. `v` scaled to length 1, pointing the same way. The zero vector stays zero.

### dot

```text
dot(a, b)
```

| Parameter | Type   | Description  |
| --------- | ------ | ------------ |
| `a`, `b`  | vector | Two vectors. |

**Returns:** number. `a.x·b.x + a.y·b.y + a.z·b.z`. For two vectors of length 1 it's the cosine of
the angle between them: 1 when they point the same way, 0 at right angles.

**Example**

```
let facing_up = dot(turtle.heading, y_axis)
```

### cross

```text
cross(a, b)
```

| Parameter | Type   | Description  |
| --------- | ------ | ------------ |
| `a`, `b`  | vector | Two vectors. |

**Returns:** vector. The cross product: at right angles to both `a` and `b`.

## 12. Colours and gradients

### hsv

```text
hsv(h, s, v)
hsv(h, s, v, a)
```

| Parameter | Type   | Description                                                                |
| --------- | ------ | -------------------------------------------------------------------------- |
| `h`       | number | Hue in degrees: 0 red, 60 yellow, 120 green, 240 blue. Wrapped into 0–360. |
| `s`       | number | Saturation, 0 (grey) to 1 (full colour). Clamped.                          |
| `v`       | number | Value, 0 (black) to 1 (bright). Clamped.                                   |
| `a`       | number | Alpha, 0 (invisible) to 1 (solid, if left out). Clamped.                   |

**Returns:** colour.

**Example**

```
colour hsv(200, 0.8, 1)
colour hsv(0, 1, 1, 0.5) // see-through red
```

**See also:** [rgb](#rgb), [colour names](#colour-names), [Colours](LANGUAGE.md#131-colours)

### rgb

```text
rgb(r, g, b)
rgb(r, g, b, a)
```

| Parameter     | Type   | Description                                              |
| ------------- | ------ | -------------------------------------------------------- |
| `r`, `g`, `b` | number | Red, green and blue, each 0 to 1. Clamped.               |
| `a`           | number | Alpha, 0 (invisible) to 1 (solid, if left out). Clamped. |

**Returns:** colour, kept as hue, saturation, value and alpha like every colour.

**Example**

```
colour rgb(1, 0.5, 0) // orange, the same as #ff8000
```

**See also:** [hsv](#hsv)

### gradient

Makes a colour that changes along a line from 0 to 1.

```text
gradient(stop, stop, …)
gradient(colour at position, …)
skin(t)
```

| Parameter  | Type   | Description                                                     |
| ---------- | ------ | --------------------------------------------------------------- |
| `stop`     | colour | Two or more colours, each optionally followed by `at position`. |
| `position` | number | Where the stop is, from 0 to 1. Positions must not go down.     |
| `t`        | number | When sampling: where along the gradient, clamped to 0–1.        |

**Returns:** gradient. To get a colour out of it, write a position in brackets after it, as if
calling it: `skin(0.5)`.

**Remarks**

- Stops without a position: the first is at 0, the last at 1, and the others are spread evenly
  between their neighbours that have positions. In the example, `yellow` lands at 0.6, halfway
  between `red at 0.2` and `white at 1`.
- Two stops at the same position make a sharp edge, as in `flag`.
- Between stops colours blend as in [mix](#mix), hue the short way round.
- A gradient can be a [fill](#fill), as in the example's background, but `colour` needs a sampled
  colour.

**Example**

```
let skin = gradient(black, red at 0.2, yellow, white at 1)
repeat 20 as i {
  colour skin(i / 19)
  forward 1
  lay
}

let flag = gradient(blue, blue at 0.5, white at 0.5, white)
colour flag(0.7) // white: past the edge
lay

background {
  fill gradient(black, hsv(230, 0.8, 0.3))
}
```

**See also:** [spectrum](#spectrum), [Gradients](LANGUAGE.md#133-gradients)

### spectrum

Like [gradient](#gradient), but hue moves in a straight line between stops, through every hue in
between, instead of the short way round.

```text
spectrum(stop, stop, …)
```

| Parameter | Type   | Description                                                |
| --------- | ------ | ---------------------------------------------------------- |
| `stop`    | colour | As for [gradient](#gradient), with optional `at position`. |

**Returns:** gradient, sampled the same way.

**Remarks**

- `spectrum(blue, red)` goes from 240° down to 0°, through cyan, green and yellow;
  `gradient(blue, red)` goes through magenta.

**Example**

```
let rainbow = spectrum(hsv(0, 1, 1), hsv(300, 1, 1))
repeat 12 as i {
  colour rainbow(i / 11)
  forward 1
  lay
}
```

## 13. Noise and randomness

### noise

Smooth noise: a number that wanders gently up and down as its input changes.

```text
noise(x)
noise(v)
```

| Parameter | Type   | Description                           |
| --------- | ------ | ------------------------------------- |
| `x`       | number | Where to read the noise along a line. |
| `v`       | vector | Where to read the noise in space.     |

**Returns:** number from −1 to 1.

**Remarks**

- The same input always gives the same result, so creatures built with it still morph smoothly.
- `noise(x)` is `noise((x, 0, 0))`. Inputs close together give close results; about 1 apart they
  are unrelated.
- It isn't constant, so it can't be used in gene declarations.

**Example**

```
repeat 30 as i {
  pitch 15 * noise(i * 0.3)
  yaw 15 * noise(i * 0.3 + 100)
  forward 0.5
  lay
}
```

**See also:** [fbm](#fbm), [random](#random), [Noise and randomness](LANGUAGE.md#185-noise-and-randomness)

### fbm

Fractal noise: [noise](#noise) with finer detail on top.

```text
fbm(x)
fbm(v)
```

| Parameter | Type   | Description                 |
| --------- | ------ | --------------------------- |
| `x`       | number | Where to read it on a line. |
| `v`       | vector | Where to read it in space.  |

**Returns:** number from −1 to 1. Five layers of `noise`, each at twice the detail and half the
strength of the last.

**Example**

```
grow 1 + 0.3 * fbm(turtle.position)
lay
```

### random

A random number between two others.

```text
random(lo, hi)
```

| Parameter | Type   | Description             |
| --------- | ------ | ----------------------- |
| `lo`      | number | The smallest it can be. |
| `hi`      | number | It's always below this. |

**Returns:** number, from `lo` up to but not including `hi`.

**Remarks**

- Random numbers are the same every build. They come from a sequence started by the creature's
  `seed` gene, which a creature gets automatically when it uses `random`. Mutating the creature
  can change its seed.
- In pattern code the sequence starts from the recipe's seed instead, and no `seed` gene is made.
- Unlike [noise](#noise), random numbers don't blend while morphing. Use `noise` for variation that
  should change smoothly.
- It isn't constant, so it can't be used in gene declarations.

**Example**

```
repeat 10 {
  branch {
    move (random(-3, 3), random(-3, 3), 0)
    grow random(0.3, 1)
    lay
  }
}
```

**See also:** [noise](#noise)

## 14. Texture functions

### pattern

Makes a texture from a short recipe.

```text
pattern(kind, hue, seed)
pattern(kind, hue, seed, scheme)
pattern(kind, hue, seed, scheme, finish)
```

| Parameter | Type         | Description                                                                      |
| --------- | ------------ | -------------------------------------------------------------------------------- |
| `kind`    | pattern kind | One of the [pattern kinds](#pattern-kinds), or the creature's own.               |
| `hue`     | number       | The hue in degrees the colours are built round, as in [hsv](#hsv).               |
| `seed`    | whole number | Picks the layout and details. Each seed is a different picture of the same kind. |
| `scheme`  | scheme       | Which colours: one of the [schemes](#schemes). `jewel` if left out.              |
| `finish`  | finish       | The surface: one of the [finishes](#finishes). `matte` if left out.              |

**Returns:** pattern.

**Remarks**

- The same recipe always gives the same picture.
- Hue, scheme and finish only recolour the picture, so they can follow `time` and `music`
  smoothly. A new kind or seed draws a new picture, which takes a moment.
- All the arguments can be genes, so textures evolve with the creature. A pattern itself can't be
  a gene.

**Example**

```
gene coat_hue = 200 in 0..360
gene coat_kind = marble from [marble, cells, aurora]

texture pattern(coat_kind, coat_hue, 7, dusk, pearl)
lay
```

**See also:** [mixed](#mixed), [texture](#texture), [fill](#fill), [Textures](LANGUAGE.md#14-textures)

### mixed

Mixes a second pattern kind into a pattern.

```text
mixed(p, way, kind, amount)
```

| Parameter | Type          | Description                                        |
| --------- | ------------- | -------------------------------------------------- |
| `p`       | pattern       | The pattern to add to.                             |
| `way`     | way of mixing | How: one of the [ways of mixing](#ways-of-mixing). |
| `kind`    | pattern kind  | The kind of the second pattern.                    |
| `amount`  | number        | How much, from 0 to 1. Clamped.                    |

**Returns:** pattern.

**Remarks**

- The second pattern takes its layout from `p`'s seed, and the colours are always `p`'s.
- A pattern holds at most one second pattern: mixing a mixed pattern replaces it.
- Mixing `none` gives `none`.

**Example**

```
texture mixed(pattern(cells, 40, 3), warp, vortex, 0.6)
lay
```

**See also:** [pattern](#pattern)

## 15. Picture functions

These make and change [pictures](#picture). They can only be used in pattern code, outside
`picture { }`. Elsewhere their names are free: a creature may call a variable `stretch`.

### clouds

Random cloudy noise, the usual start of a pattern.

```text
clouds()
clouds(layers, grid)
```

| Parameter | Type         | Description                                                           |
| --------- | ------------ | --------------------------------------------------------------------- |
| `layers`  | whole number | How many layers of detail, 1 to 12. 6 if left out.                    |
| `grid`    | whole number | How many blobs across the first layer has, at least 1. 4 if left out. |

**Returns:** picture, from 0 to 1. Each layer is twice as fine and half as strong as the last.

**Remarks**

- It takes its numbers from the [random](#random) sequence, so each seed of the recipe gives
  different clouds.

**Example**

```
pattern Fog

value clouds(4, 2)
```

**See also:** [blur](#blur), [How they work](LANGUAGE.md#187-pictures)

### blur

Blurs a picture.

```text
blur(p, width)
blur(p, across, down)
```

| Parameter        | Type    | Description                                                                            |
| ---------------- | ------- | -------------------------------------------------------------------------------------- |
| `p`              | picture | The picture to blur.                                                                   |
| `width`          | number  | How far it blurs, in pixels of a picture 512 across, so it looks the same at any size. |
| `across`, `down` | number  | Different blurs across and down, for streaks.                                          |

**Returns:** picture.

**Remarks**

- Wrapped round the pattern's final `value`, as here, it waits until a second pattern has been
  mixed in (with [mixed](#mixed)), so both patterns are blurred. A pattern mixed in as the second
  one comes in without it.

**Example**

```
pattern Streaks

value blur(clouds(), 40, 2)
```

**See also:** [zoom_blur](#zoom_blur), [Your own patterns](LANGUAGE.md#141-your-own-patterns)

### zoom_blur

Streaks a picture outwards from the middle.

```text
zoom_blur(p, s)
```

| Parameter | Type    | Description                                                                         |
| --------- | ------- | ----------------------------------------------------------------------------------- |
| `p`       | picture | The picture to streak.                                                              |
| `s`       | number  | How long the streaks are: the picture is averaged enlarged from 1 to `1 + s` times. |

**Returns:** picture.

**Remarks**

- Wrapped round the pattern's final `value`, as here, it waits until a second pattern has been
  mixed in (with [mixed](#mixed)), so both patterns are streaked. A pattern mixed in as the second
  one comes in without it.

**Example**

```
pattern Rush

value zoom_blur(clouds(), 0.5)
```

**See also:** [blur](#blur), [Your own patterns](LANGUAGE.md#141-your-own-patterns)

### stretch

Stretches a picture so it uses the whole range from dark to light.

```text
stretch(p)
```

| Parameter | Type    | Description  |
| --------- | ------- | ------------ |
| `p`       | picture | The picture. |

**Returns:** picture whose darkest point is 0 and lightest is 1.

**Example**

```
pattern Bright

value stretch(blur(clouds(), 30))
```

### power

Raises every value of a picture to a power, to darken or lighten its middle tones.

```text
power(p, e)
```

| Parameter | Type    | Description                                              |
| --------- | ------- | -------------------------------------------------------- |
| `p`       | picture | The picture.                                             |
| `e`       | number  | Above 1 darkens the middle tones, below 1 lightens them. |

**Returns:** picture.

**Example**

```
pattern Dark

value power(clouds(), 3)
```

## 16. Inputs

Read-only values from outside the program. They can be used anywhere except pattern code.

### time

```text
time
```

**Type:** number. Seconds since the creature started being shown, from 0 upwards. It keeps running
when no music is playing.

**Remarks**

- A creature that reads `time`, `beat` or `music` (outside its background and dance blocks) is
  rebuilt every frame. In still pictures, such as thumbnails, all three are 0.

**Example**

```
roll 45 * time // turns 45 degrees a second
lay
```

**See also:** [Time and music](LANGUAGE.md#16-time-and-music)

### beat

```text
beat
```

**Type:** number from 0 to 1. Where the music is within the current beat: 0 on the beat, rising
towards 1 just before the next. 0 when no music is playing.

**Example**

```
grow 1 + 0.2 * bump(beat)
lay
```

### music

```text
music.part
```

**Type:** number from 0 to 1, whatever the volume. All are 0 when no music is playing.

| Part             | Description                                                            |
| ---------------- | ---------------------------------------------------------------------- |
| `music.bass`     | Level of the low frequencies.                                          |
| `music.mid`      | Level of the middle frequencies.                                       |
| `music.high`     | Level of the high frequencies.                                         |
| `music.level`    | Overall loudness.                                                      |
| `music.hit`      | Jumps up on each onset (a drum hit, a note starting), then falls back. |
| `music.bass_hit` | Jumps up on each low onset, such as a kick drum or bass note.          |
| `music.mid_hit`  | Jumps up on each onset in the middle, such as a snare or a voice.      |
| `music.high_hit` | Jumps up on each high onset, such as a hi-hat or cymbal.               |

**Example**

```
gene flap = 30 in 0..70 // how hard the wings beat with the bass

symmetric x {
  roll 10 + flap * music.bass
  yaw 90
  forward 2
  lay
}
```

### turtle

Reads the turtle's current state.

```text
turtle.part
```

| Part               | Type    | Description                                            |
| ------------------ | ------- | ------------------------------------------------------ |
| `turtle.position`  | vector  | Where it is, in world space.                           |
| `turtle.heading`   | vector  | The way it faces, a vector of length 1 in world space. |
| `turtle.up`        | vector  | Its up axis, length 1.                                 |
| `turtle.side`      | vector  | Its side axis, length 1.                               |
| `turtle.size`      | vector  | Its size on each axis: side, up, heading.              |
| `turtle.mirrored`  | bool    | Whether it's mirrored.                                 |
| `turtle.shape`     | shape   | The current shape.                                     |
| `turtle.colour`    | colour  | The current colour. `turtle.color` is the same.        |
| `turtle.shine`     | number  | The current shine.                                     |
| `turtle.sharpness` | number  | The current sharpness.                                 |
| `turtle.texture`   | pattern | The current texture.                                   |
| `turtle.wear`      | number  | How much of its texture a shape shows.                 |

**Used in:** creature code and functions.

**Remarks**

- They describe the turtle, not the shape transform.

**Example**

```
while turtle.position.y < 5 {
  pitch -10
  forward 1
  lay
}
```

**See also:** [Reading the turtle](LANGUAGE.md#184-reading-the-turtle)

## 17. Constants

Built-in names for fixed values. None of them can be used as the name of a gene, variable,
parameter, part or function.

### number constants

| Name     | Value                                |
| -------- | ------------------------------------ |
| `pi`     | π, 3.14159…                          |
| `tau`    | 2π, 6.28318…                         |
| `golden` | The golden ratio, 1.61803…           |
| `sqrt2`  | The square root of 2, 1.41421…       |
| `sqrt3`  | The square root of 3, 1.73205…       |
| `ln2`    | The natural logarithm of 2, 0.69314… |

**Example**

```
repeat 50 as i {
  branch {
    yaw i * 360 / golden // spreads them like seeds in a sunflower
    forward sqrt(i) * 0.5
    lay
  }
}
```

### axis vectors

| Name     | Value       |
| -------- | ----------- |
| `x_axis` | `(1, 0, 0)` |
| `y_axis` | `(0, 1, 0)` |
| `z_axis` | `(0, 0, 1)` |

### colour names

| Name     | Value              | Name           | Value                 |
| -------- | ------------------ | -------------- | --------------------- |
| `red`    | `hsv(0, 1, 1)`     | `magenta`      | `hsv(300, 1, 1)`      |
| `orange` | `hsv(30, 1, 1)`    | `pink`         | `hsv(330, 0.4, 1)`    |
| `yellow` | `hsv(60, 1, 1)`    | `brown`        | `hsv(30, 0.75, 0.45)` |
| `green`  | `hsv(120, 1, 1)`   | `white`        | `hsv(0, 0, 1)`        |
| `cyan`   | `hsv(180, 1, 1)`   | `grey`, `gray` | `hsv(0, 0, 0.5)`      |
| `blue`   | `hsv(240, 1, 1)`   | `black`        | `hsv(0, 0, 0)`        |
| `purple` | `hsv(270, 1, 0.8)` | `transparent`  | `hsv(0, 0, 1, 0)`     |

### shapes

Every shape fits a 1 × 1 × 1 box centred on the turtle. The number is the one [shape](#shape)
picks with a number.

| Name    | Number | Shape                                                                                 |
| ------- | ------ | ------------------------------------------------------------------------------------- |
| `tube`  | 0      | A cylinder 1 across and 1 long, along the heading.                                    |
| `cube`  | 1      | A cube with sides of 1.                                                               |
| `cone`  | 2      | A cone 1 long along the heading, its base 1 across at the back, its tip at the front. |
| `ball`  | 3      | A sphere 1 across.                                                                    |
| `ring`  | 4      | A thin torus around the heading, 1 across and 0.2 thick.                              |
| `donut` | 5      | A fat torus around the heading, 1 across and 1/3 thick.                               |

### pattern kinds

The first argument of [pattern](#pattern), and the third of [mixed](#mixed): `sunburst`, `vortex`,
`plasma`, `cells`, `kaleidoscope`, `interference`, `starburst`, `marble`, `lightning`, `aurora` and
`bloom`. Each is also written in GenoCode, in the `patterns` folder, as an example to read. A
creature's own [pattern blocks](#pattern-blocks-and-files) add more.

### schemes

The colours of a [pattern](#pattern).

| Name        | Colours                                                                     |
| ----------- | --------------------------------------------------------------------------- |
| `jewel`     | Deep, rich colours beside the hue, from dark to glowing. The default.       |
| `duotone`   | Two hues far apart, meeting in a soft neutral.                              |
| `split`     | The hue with the two beside its opposite, such as teal with coral and gold. |
| `analogous` | Close hues flowing into each other.                                         |
| `pastel`    | Light and soft.                                                             |
| `dusk`      | Cool shadows and warm lights.                                               |
| `electric`  | Near-black to a blazing colour and white, like neon.                        |

### finishes

The surface of a [pattern](#pattern).

| Name         | Surface                                                     |
| ------------ | ----------------------------------------------------------- |
| `matte`      | Plain colours. The default.                                 |
| `metallic`   | Bright bands and white highlights, like polished metal.     |
| `iridescent` | The hue slides along, like oil on water or a beetle's back. |
| `pearl`      | Pale, with a soft pink-green-blue play of colour.           |
| `satin`      | A soft band of highlight.                                   |

### ways of mixing

How [mixed](#mixed) adds a second pattern.

| Name    | Mixing                                              |
| ------- | --------------------------------------------------- |
| `warp`  | The second pattern pushes the first one around.     |
| `blend` | The two patterns blended.                           |
| `mask`  | The first pattern shows where the second is bright. |
| `carve` | The second pattern is cut out of the first.         |

### none

No texture. `texture none` lays plain shapes again; mixing `none` gives `none`.

## 18. Values and operators

### literals

| Value  | Written as                    | Notes                                                                                              |
| ------ | ----------------------------- | -------------------------------------------------------------------------------------------------- |
| number | `3`, `0.25`, `12.5e-3`, `90°` | A point needs a digit on both sides. `°` is allowed and does nothing. `-3` is minus applied to 3.  |
| bool   | `true`, `false`               |                                                                                                    |
| vector | `(1, 0, 0.5)`                 | Three numbers. `(a)` is just `a` in brackets.                                                      |
| colour | `#ff8000`, `#ff800080`        | Hex red, green, blue and optionally alpha. See also [hsv](#hsv) and [colour names](#colour-names). |
| list   | `[1, 2, 3]`, `[]`             | Any values, read by position from 0: `l[0]`.                                                       |
| string | `"text"`                      | Only in [print](#print). Escapes `\"`, `\\` and `\n`.                                              |

Comments are `//` to the end of the line, or `/* … */`.

### operators

From the loosest to the tightest:

| Operator                         | Meaning                                                                | Works on                                                  |
| -------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------- |
| `a or b`                         | true if either is                                                      | bools. `b` is only worked out if `a` is false.            |
| `a and b`                        | true if both are                                                       | bools. `b` is only worked out if `a` is true.             |
| `not a`                          | the opposite                                                           | a bool                                                    |
| `a == b`, `a != b`               | equal, not equal                                                       | two values of the same type; lists item by item           |
| `a < b`, `<=`, `>`, `>=`         | comparisons                                                            | numbers. They don't chain: `a < b < c` is an error.       |
| `a + b`, `a - b`                 | add, subtract                                                          | numbers, two vectors; `+` also joins two lists            |
| `a * b`, `a / b`                 | multiply, divide                                                       | numbers; a vector and a number; two vectors, axis by axis |
| `a % b`                          | remainder, with `a`'s sign                                             | numbers: `-7 % 3` is −1                                   |
| `-a`                             | negate                                                                 | a number or vector                                        |
| `a ^ b`                          | power                                                                  | numbers. `2^3^2` is `2^9`; `-2^2` is −4.                  |
| `a.part`, `f(…)`, `g(t)`, `l[i]` | a part of a value, a call, sampling a gradient or picture, a list item |                                                           |

**See also:** [Operators](LANGUAGE.md#81-operators), [Vector arithmetic](LANGUAGE.md#82-vector-arithmetic)

### parts of values

| Value  | Parts                                               |
| ------ | --------------------------------------------------- |
| vector | `.x`, `.y`, `.z`                                    |
| colour | `.hue` (0–360), `.sat`, `.val`, `.alpha` (each 0–1) |

Parts are read-only: to change one, make a new value.

**Example**

```
let c = turtle.colour
colour hsv(c.hue + 30, c.sat, c.val)
```
