// Help for editors: what a name means when you point at it, and which names can be typed where.
// The text follows docs/LANGUAGE.md, and help.test.ts keeps every built-in covered.

import type { Block, Param, PictureExpr, Stmt } from "./ast.js";
import { BUILTIN_CONSTANTS } from "./builtins.js";
import type { CheckResult } from "./checker.js";
import { NAMED_COLOURS } from "./colour.js";
import type { GeneInfo } from "./genes.js";
import { KEYWORDS, lex, type Token } from "./lexer.js";
import type { Span } from "./source.js";
import { FINISHES, formatValue, MIX_WAYS, PATTERN_KINDS, SCHEMES, SHAPES } from "./values.js";

export interface Help {
  /** How it's written, such as `clamp(x, lo, hi)`. */
  title: string;
  /** What it does, in a sentence or two. */
  text: string;
  /** The section of docs/LANGUAGE.md that explains it, such as `18.1`. */
  section: string;
}

export type CompletionKind =
  "keyword" | "function" | "constant" | "input" | "gene" | "part" | "variable" | "member";

export interface Completion {
  label: string;
  kind: CompletionKind;
  /** A short note shown beside the label. */
  detail: string;
}

const h = (title: string, text: string, section: string): Help => ({ title, text, section });

/** The built-in functions. */
export const FUNCTION_HELP: ReadonlyMap<string, Help> = new Map([
  ["abs", h("abs(x)", "The absolute value of `x`.", "18.1")],
  ["sign", h("sign(x)", "−1, 0 or 1, depending on the sign of `x`.", "18.1")],
  ["floor", h("floor(x)", "`x` rounded down.", "18.1")],
  ["ceil", h("ceil(x)", "`x` rounded up.", "18.1")],
  ["round", h("round(x)", "The nearest whole number, halves rounded up.", "18.1")],
  [
    "frac",
    h("frac(x)", "`x` minus its whole part, keeping the sign: `frac(-1.25)` is `-0.25`.", "18.1"),
  ],
  ["min", h("min(a, b)", "The smaller of `a` and `b`.", "18.1")],
  ["max", h("max(a, b)", "The larger of `a` and `b`.", "18.1")],
  ["clamp", h("clamp(x, lo, hi)", "`x` limited to lo..hi.", "18.1")],
  ["wrap", h("wrap(x, lo, hi)", "`x` wrapped round into lo..hi, so that hi wraps to lo.", "18.1")],
  ["bounce", h("bounce(x, lo, hi)", "`x` folded back and forth between lo and hi.", "18.1")],
  ["sqrt", h("sqrt(x)", "The square root of `x`.", "18.1")],
  ["exp", h("exp(x)", "e to the power `x`.", "18.1")],
  ["ln", h("ln(x)", "The natural logarithm of `x`.", "18.1")],
  ["log10", h("log10(x)", "The base-10 logarithm of `x`.", "18.1")],
  ["sin", h("sin(a)", "The sine of `a`, in degrees.", "18.1")],
  ["cos", h("cos(a)", "The cosine of `a`, in degrees.", "18.1")],
  ["tan", h("tan(a)", "The tangent of `a`, in degrees.", "18.1")],
  ["asin", h("asin(x)", "The angle whose sine is `x`, in degrees.", "18.1")],
  ["acos", h("acos(x)", "The angle whose cosine is `x`, in degrees.", "18.1")],
  ["atan", h("atan(x)", "The angle whose tangent is `x`, in degrees.", "18.1")],
  ["atan2", h("atan2(y, x)", "The angle of the point (x, y) from the x axis, in degrees.", "18.1")],
  ["degrees", h("degrees(r)", "Converts radians to degrees.", "18.1")],
  ["radians", h("radians(d)", "Converts degrees to radians.", "18.1")],
  [
    "wave",
    h("wave(t)", "`sin(t × 360)`: one full wave (0, 1, 0, −1, 0) as `t` goes from 0 to 1.", "18.1"),
  ],
  [
    "bump",
    h(
      "bump(t)",
      "`sin(t × 180)`: rises from 0 to 1 and back to 0 as `t` goes from 0 to 1.",
      "18.1",
    ),
  ],
  [
    "mix",
    h(
      "mix(a, b, t)",
      "`(1 − t)·a + t·b`, for numbers, vectors and colours. Colours blend hue the short way round.",
      "18.1",
    ),
  ],
  [
    "smoothmix",
    h("smoothmix(a, b, t)", "Like `mix`, but eases in and out. `t` is clamped to 0–1.", "18.1"),
  ],
  [
    "mandel",
    h(
      "mandel(x, y)",
      "How quickly the point x + iy escapes the Mandelbrot set, from 0 to 1. 1 means never.",
      "18.1",
    ),
  ],
  ["vec", h("vec(x, y, z)", "The vector `(x, y, z)`.", "18.2")],
  [
    "length",
    h("length(v)", "The length of the vector `v`, or how many items the list `v` has.", "18.2"),
  ],
  ["normalize", h("normalize(v)", "`v` scaled to length 1. The zero vector stays zero.", "18.2")],
  ["dot", h("dot(a, b)", "The dot product of two vectors.", "18.2")],
  ["cross", h("cross(a, b)", "The cross product of two vectors.", "18.2")],
  [
    "hsv",
    h(
      "hsv(h, s, v)",
      "A colour from hue (degrees), saturation and value, 0–1. A fourth argument is alpha.",
      "13.1",
    ),
  ],
  [
    "rgb",
    h(
      "rgb(r, g, b)",
      "A colour from red, green and blue, 0–1. A fourth argument is alpha.",
      "13.1",
    ),
  ],
  [
    "noise",
    h(
      "noise(x)",
      "Smooth noise from −1 to 1 that changes gently with `x` (a number or vector).",
      "18.5",
    ),
  ],
  ["fbm", h("fbm(x)", "Fractal noise: five layers of `noise`, from −1 to 1.", "18.5")],
  [
    "random",
    h(
      "random(lo, hi)",
      "A random number from `lo` up to `hi`. The creature's `seed` gene decides the sequence.",
      "18.5",
    ),
  ],
  [
    "pattern",
    h(
      "pattern(kind, hue, seed, scheme, finish)",
      "A texture: a pattern kind such as `marble`, a hue that sets the palette, and a seed; then, if wanted, a colour scheme such as `dusk` and a finish such as `pearl`.",
      "14",
    ),
  ],
  [
    "mixed",
    h(
      "mixed(pattern, way, kind, amount)",
      "A pattern with a second pattern mixed in: `warp`, `blend`, `mask` or `carve`, a pattern kind, and how much from 0 to 1.",
      "14",
    ),
  ],
  [
    "spectrum",
    h(
      "spectrum(c1, c2 at p, …)",
      "Like `gradient`, but hue moves in a straight line between colours, through every hue in between.",
      "13.3",
    ),
  ],
  [
    "gradient",
    h(
      "gradient(c1, c2 at p, …)",
      "Colours blended along 0 to 1. Sample it like a call: `skin(0.5)`.",
      "13.3",
    ),
  ],
  // The picture functions, in pattern code (section 18.7).
  [
    "clouds",
    h(
      "clouds(layers, size)",
      "A picture of fractal noise from the recipe's seed: `layers` (6 if left out) of random grids, the first `size` × `size` (4 if left out).",
      "18.7",
    ),
  ],
  [
    "blur",
    h(
      "blur(p, across, down)",
      "The picture `p` blurred, in pixels of a picture 512 across; `down` is `across` if left out.",
      "18.7",
    ),
  ],
  [
    "zoom_blur",
    h(
      "zoom_blur(p, s)",
      "The picture `p` streaked out from the middle, up to `1 + s` times.",
      "18.7",
    ),
  ],
  ["stretch", h("stretch(p)", "The picture `p` stretched so it runs from 0 to 1.", "18.7")],
  ["power", h("power(p, e)", "Every value of the picture `p` raised to the power `e`.", "18.7")],
]);

const NUMBER_CONSTANTS: ReadonlyMap<string, string> = new Map([
  ["pi", "π, 3.14159…"],
  ["tau", "2π, 6.28318…"],
  ["golden", "The golden ratio, 1.61803…"],
  ["sqrt2", "The square root of 2."],
  ["sqrt3", "The square root of 3."],
  ["ln2", "The natural logarithm of 2."],
  ["x_axis", "The vector `(1, 0, 0)`."],
  ["y_axis", "The vector `(0, 1, 0)`."],
  ["z_axis", "The vector `(0, 0, 1)`."],
  ["none", "No texture: `texture none`."],
]);

const SHAPE_TEXT: Record<string, string> = {
  tube: "A cylinder 1 across and 1 long, along the heading.",
  cube: "A cube with sides of 1.",
  cone: "A cone 1 long along the heading, its tip at the front.",
  ball: "A sphere 1 across.",
  ring: "A thin torus around the heading, 1 across.",
  donut: "A fat torus around the heading, 1 across.",
};

const SCHEME_TEXT: Record<string, string> = {
  jewel: "deep, rich colours beside the hue, from dark to glowing.",
  duotone: "two hues far apart, meeting in a soft neutral.",
  split: "the hue with the two beside its opposite, such as teal with coral and gold.",
  analogous: "close hues flowing into each other.",
  pastel: "light and soft.",
  dusk: "cool shadows and warm lights.",
  electric: "near-black to a blazing colour and white, like neon.",
};

const FINISH_TEXT: Record<string, string> = {
  matte: "plain colours.",
  metallic: "bright bands and white highlights, like polished metal.",
  iridescent: "the hue slides along, like oil on water or a beetle's back.",
  pearl: "pale, with a soft pink-green-blue play of colour.",
  satin: "a soft band of highlight.",
};

const MIX_TEXT: Record<string, string> = {
  warp: "the second pattern pushes the first one around.",
  blend: "the two patterns blended.",
  mask: "the first pattern shows where the second one is bright.",
  carve: "the second pattern is cut out of the first.",
};

/** The built-in constants: numbers, vectors, colours, shapes and pattern kinds. */
export function constantHelp(name: string): Help | undefined {
  const text = NUMBER_CONSTANTS.get(name);
  if (text !== undefined) return h(name, text, name === "none" ? "14" : "18.1");
  const colour = NAMED_COLOURS.get(name);
  if (colour) {
    const alpha = colour.a === 1 ? "" : `, ${colour.a}`;
    return h(name, `The colour hsv(${colour.h}, ${colour.s}, ${colour.v}${alpha}).`, "13.1");
  }
  if ((SHAPES as readonly string[]).includes(name))
    return h(name, `A shape. ${SHAPE_TEXT[name]}`, "12");
  if ((PATTERN_KINDS as readonly string[]).includes(name))
    return h(name, "A pattern kind, for `pattern(kind, hue, seed)`.", "14");
  const scheme = SCHEME_TEXT[name];
  if (scheme !== undefined && (SCHEMES as readonly string[]).includes(name))
    return h(name, `A colour scheme for \`pattern\`: ${scheme}`, "14");
  const finish = FINISH_TEXT[name];
  if (finish !== undefined && (FINISHES as readonly string[]).includes(name))
    return h(name, `A finish for \`pattern\`: ${finish}`, "14");
  const way = MIX_TEXT[name];
  if (way !== undefined && (MIX_WAYS as readonly string[]).includes(name))
    return h(name, `A way of mixing for \`mixed\`: ${way}`, "14");
  return undefined;
}

/** Keywords, and the inputs `time`, `beat`, `music` and `turtle`. */
export const KEYWORD_HELP: ReadonlyMap<string, Help> = new Map([
  ["creature", h("creature Name", "Starts a creature file.", "3")],
  [
    "breed",
    h(
      "breed off",
      "The app won't mutate or breed this creature: its children don't keep its look.",
      "19",
    ),
  ],
  [
    "gene",
    h(
      "gene name = value in min..max",
      "A value the app may change when mutating, breeding and morphing.",
      "6.1",
    ),
  ],
  [
    "part",
    h("part name(a, b) { … }", "A piece of creature: it may move the turtle and lay shapes.", "10"),
  ],
  [
    "function",
    h(
      "function name(a, b) { … }",
      "Calculates a value with `return`. It can't change the turtle or lay shapes.",
      "10",
    ),
  ],
  ["return", h("return value", "Leaves a function with a value, or a part early.", "10")],
  ["let", h("let name = value", "Creates a variable in the current block.", "7")],
  ["if", h("if condition { … } else { … }", "Runs a block when the condition is true.", "9")],
  ["else", h("else { … }", "What `if` runs when its condition is false.", "9")],
  ["repeat", h("repeat n as i { … }", "Runs a block `n` times, with `i` counting from 0.", "9")],
  ["as", h("repeat n as i", "Names the counter of a `repeat` loop.", "9")],
  [
    "for",
    h(
      "for v from a to b by s { … }",
      "Runs a block for `v` from `a` to `b`, in steps of `s` (1 if left out).",
      "9",
    ),
  ],
  [
    "from",
    h("from", "In `for`: where the loop starts. In a gene: the options it chooses from.", "9"),
  ],
  ["to", h("to", "In `for`: where the loop ends.", "9")],
  ["by", h("by", "In `for`: the step.", "9")],
  ["while", h("while condition { … }", "Runs a block for as long as the condition is true.", "9")],
  ["branch", h("branch { … }", "Runs a block, then puts the turtle back as it was.", "11.5")],
  [
    "lay",
    h("lay / lay { … }", "Lays the current shape, optionally with an extra shape transform.", "12"),
  ],
  [
    "reshape",
    h("reshape { … }", "Changes the shape transform for every shape laid afterwards.", "11.7"),
  ],
  [
    "stroke",
    h(
      "stroke { … }",
      "Draws one smooth tube instead of separate shapes: each `lay` inside adds a point the tube passes through, as wide as the shape would be.",
      "12.1",
    ),
  ],
  [
    "focuspoint",
    h(
      "focuspoint",
      "Marks where the turtle is as the creature's middle: the camera looks there, and a dance turns the creature round it.",
      "11.8",
    ),
  ],
  [
    "symmetric",
    h(
      "symmetric x { … }",
      "Runs a block twice, the second time mirrored. `side` is 1, then −1.",
      "11.6",
    ),
  ],
  [
    "shape",
    h("shape s", "The shape for later `lay`s: tube, cube, cone, ball, ring or donut.", "12"),
  ],
  ["colour", h("colour c", "The colour for later shapes.", "13.2")],
  ["color", h("color c", "The colour for later shapes.", "13.2")],
  ["shine", h("shine x", "Strength of highlights, 0–1.", "13.2")],
  ["sharpness", h("sharpness x", "How tight the highlights are, 0–1.", "13.2")],
  ["texture", h("texture p", "The texture for later shapes: a `pattern(…)`, or `none`.", "13.2")],
  [
    "wear",
    h(
      "wear x",
      "How much of their texture later shapes wear, 0–1: 0 their plain colour, 1 all texture.",
      "13.2",
    ),
  ],
  [
    "background",
    h("background { … fill p }", "The background the creature is shown against.", "15"),
  ],
  ["fill", h("fill p", "What the background shows: a pattern, a colour or a gradient.", "15")],
  ["dance", h("dance { … }", "The creature's dance style: how music moves it as a whole.", "17")],
  [
    "variant",
    h(
      "variant Name { gene = value }",
      "Another set of gene values for the creature, such as a member of its family.",
      "6.6",
    ),
  ],
  ["forward", h("forward d", "Moves the turtle `d` along its heading.", "11.2")],
  ["back", h("back d", "Moves the turtle `d` backwards.", "11.2")],
  ["move", h("move (x, y, z)", "Moves the turtle along its side, up and heading axes.", "11.2")],
  ["pitch", h("pitch a", "Turns about the side axis: positive tips the nose down.", "11.3")],
  ["yaw", h("yaw a", "Turns about the up axis, towards the side axis.", "11.3")],
  ["roll", h("roll a", "Turns about the heading.", "11.3")],
  [
    "rotate",
    h(
      "rotate a around v",
      "Turns `a` degrees about the axis `v`, in the turtle's own axes.",
      "11.3",
    ),
  ],
  ["around", h("rotate a around v", "The axis that `rotate` turns about.", "11.3")],
  [
    "grow",
    h("grow k / grow (x, y, z)", "Multiplies the turtle's size. Negative values mirror.", "11.4"),
  ],
  ["mirror", h("mirror x", "Reverses one of the turtle's axes: x, y or z.", "11.4")],
  ["in", h("gene name = v in min..max", "A gene's range.", "6.1")],
  ["step", h("in min..max step s", "A gene that moves in whole steps of `s`.", "6.1")],
  ["log", h("in min..max log", "A gene that changes by ratios rather than amounts.", "6.1")],
  ["at", h("colour at p", "Where a gradient stop sits, from 0 to 1.", "13.3")],
  ["and", h("a and b", "True if both sides are.", "8.1")],
  ["or", h("a or b", "True if either side is.", "8.1")],
  ["not", h("not a", "The opposite of a bool.", "8.1")],
  ["true", h("true", "A bool.", "5")],
  ["false", h("false", "A bool.", "5")],
  ["print", h("print(a, b, …)", "Writes its arguments to the app's console.", "18.8")],
  [
    "turtle",
    h(
      "turtle.position",
      "Reads the turtle: position, heading, up, side, size, mirrored, shape, colour…",
      "18.4",
    ),
  ],
  ["time", h("time", "Seconds since the creature started being shown.", "16")],
  ["beat", h("beat", "Position within the current beat: 0 on the beat, rising towards 1.", "16")],
  [
    "music",
    h(
      "music.bass",
      "What the music is doing now: how loud it is (`level`, `bass`, `mid`, `high`), its hits (`hit`, `bass_hit`, `mid_hit`, `high_hit`), its mood (`tempo`, `energy`, `bright`, `rough`), its left–right `balance`, its notes (`note`, `clear`, `key`, `major`, `pitch`) and where the song is going (`quiet`, `build`, `drop`, `change`). All are 0 when no music is playing.",
      "16",
    ),
  ],
]);

/** The parts of `music` and `turtle`. */
export const MEMBER_HELP: ReadonlyMap<string, ReadonlyMap<string, Help>> = new Map([
  [
    "music",
    new Map([
      ["bass", h("music.bass", "Level of the low frequencies, 0–1.", "16")],
      ["mid", h("music.mid", "Level of the middle frequencies, 0–1.", "16")],
      ["high", h("music.high", "Level of the high frequencies, 0–1.", "16")],
      ["level", h("music.level", "Overall loudness, 0–1.", "16")],
      ["hit", h("music.hit", "Jumps up on each drum hit or note, then falls back, 0–1.", "16")],
      [
        "bass_hit",
        h(
          "music.bass_hit",
          "Jumps up on each low hit, such as a kick drum, then falls back, 0–1.",
          "16",
        ),
      ],
      [
        "mid_hit",
        h(
          "music.mid_hit",
          "Jumps up on each hit in the middle, such as a snare, then falls back, 0–1.",
          "16",
        ),
      ],
      [
        "high_hit",
        h(
          "music.high_hit",
          "Jumps up on each high hit, such as a hi-hat, then falls back, 0–1.",
          "16",
        ),
      ],
      [
        "tempo",
        h(
          "music.tempo",
          "How fast the beat is, 0–1: 0 at 60 beats a minute or slower, 1 at 180 or faster.",
          "16",
        ),
      ],
      [
        "energy",
        h(
          "music.energy",
          "How intense the music has been over the last few seconds, 0–1. It moves slowly.",
          "16",
        ),
      ],
      [
        "bright",
        h("music.bright", "How bright the sound is, 0–1: 0 dark and bassy, 1 sparkling.", "16"),
      ],
      [
        "rough",
        h("music.rough", "How rough the sound is, 0–1: 0 smooth, pure notes, 1 noise.", "16"),
      ],
      [
        "balance",
        h(
          "music.balance",
          "Which side the sound comes from, −1 to 1: −1 left, 0 the middle, 1 right.",
          "16",
        ),
      ],
      [
        "note",
        h(
          "music.note",
          "The note or chord sounding now, as a hue, 0–360: C is 0 (red), and notes that sound close have neighbouring hues. Use it as a colour's hue.",
          "16",
        ),
      ],
      [
        "clear",
        h(
          "music.clear",
          "How clearly a note or chord stands out, 0–1: 1 for a single note, near 0 for drums alone.",
          "16",
        ),
      ],
      [
        "key",
        h(
          "music.key",
          "The key the song is in, as a hue, 0–360, on the same wheel as `music.note`. It stays the same for most of a song.",
          "16",
        ),
      ],
      [
        "major",
        h(
          "music.major",
          "Whether the song's key is major or minor, 0–1: 1 major (often happy), 0 minor (often sad), 0.5 unsure.",
          "16",
        ),
      ],
      [
        "pitch",
        h(
          "music.pitch",
          "How high the tune is, 0–1, against where it has been lately: 0.5 its usual height.",
          "16",
        ),
      ],
      [
        "quiet",
        h(
          "music.quiet",
          "Rises in a quiet part of the song, 0–1: the music is well under the loudest it has been lately.",
          "16",
        ),
      ],
      [
        "build",
        h(
          "music.build",
          "Rises while the music builds up, 0–1: it is getting louder, brighter and busier.",
          "16",
        ),
      ],
      [
        "drop",
        h(
          "music.drop",
          "Jumps up when the bass comes in after a quiet part or a build, then falls back over a second or two, 0–1.",
          "16",
        ),
      ],
      [
        "change",
        h(
          "music.change",
          "Jumps up when a new part of the song starts, then falls back, 0–1.",
          "16",
        ),
      ],
    ]),
  ],
  [
    "turtle",
    new Map([
      [
        "position",
        h("turtle.position", "The turtle's position in world space (a vector).", "18.4"),
      ],
      ["heading", h("turtle.heading", "The heading, as a unit vector in world space.", "18.4")],
      ["up", h("turtle.up", "The up axis, as a unit vector.", "18.4")],
      ["side", h("turtle.side", "The side axis, as a unit vector.", "18.4")],
      ["size", h("turtle.size", "The size per axis (a vector).", "18.4")],
      ["mirrored", h("turtle.mirrored", "Whether the turtle is mirrored (a bool).", "18.4")],
      ["shape", h("turtle.shape", "The current shape.", "18.4")],
      ["colour", h("turtle.colour", "The current colour.", "18.4")],
      ["color", h("turtle.color", "The current colour.", "18.4")],
      ["shine", h("turtle.shine", "The current shine.", "18.4")],
      ["sharpness", h("turtle.sharpness", "The current sharpness.", "18.4")],
      ["texture", h("turtle.texture", "The current texture.", "18.4")],
      ["wear", h("turtle.wear", "How much of its texture the turtle's shapes wear.", "18.4")],
    ]),
  ],
]);

const BY = h(
  "by d",
  "How far the input must move since the last trigger to trigger again. Default 0.5.",
  "17",
);
const changes = h(
  "changes",
  "The effect triggers when the input moves either way. The default.",
  "17",
);
const drops = h("drops", "The effect triggers only when the input moves down.", "17");
const rises = h("rises", "The effect triggers only when the input moves up.", "17");
const triggerWords = (lead: Help, bursts?: Help): [string, Help][] => [
  ["on", lead],
  ["by", BY],
  ["changes", changes],
  ["drops", drops],
  ["rises", rises],
  ...(bursts ? ([["off", bursts]] as [string, Help][]) : []),
];
const followsInput = h(
  "follows x",
  "The effect's input, a number from 0 to 1 (values outside are clamped). It can be any " +
    "expression of the music, `time`, `beat` and the dance's genes and variables.",
  "17",
);
const onInput = h(
  "on x",
  "The input that triggers the effect: a number from 0 to 1, which triggers when it has moved " +
    "by at least `by` since the last trigger.",
  "17",
);

/** A dance block's effects (section 17): each effect's line, and the words that can follow it. */
export const EFFECT_HELP: ReadonlyMap<string, { help: Help; words: ReadonlyMap<string, Help> }> =
  new Map([
    [
      "morph",
      {
        help: h(
          "morph follows x speed 1 settle 2",
          "Moves the creature along its morph (the loop through a set of related creatures): " +
            "the louder the input, the faster, and it coasts to a stop when the input is quiet.",
          "17",
        ),
        words: new Map([
          ["follows", followsInput],
          ["speed", h("speed s", "Creatures a second at full input. Default 1.", "17")],
          [
            "settle",
            h(
              "settle t",
              "Seconds to coast to a stop from full speed once the input falls; it speeds up " +
                "ten times faster. Default 2.",
              "17",
            ),
          ],
        ]),
      },
    ],
    [
      "zoom",
      {
        help: h(
          "zoom follows x amount 0.5 settle 15",
          "Brings the creature towards the viewer as the input rises; it drifts back when the " +
            "input falls.",
          "17",
        ),
        words: new Map([
          ["follows", followsInput],
          [
            "amount",
            h(
              "amount a",
              "How much nearer the creature comes at full input, from 0 (not at all) to 1 (as " +
                "near as it can). Default 0.5.",
              "17",
            ),
          ],
          [
            "settle",
            h(
              "settle t",
              "Seconds to drift all the way back; it comes in fifty times faster. Default 15.",
              "17",
            ),
          ],
        ]),
      },
    ],
    [
      "spin",
      {
        help: h(
          "spin follows x from 45 to 170 smooth 0.4",
          "Sets how fast the creature spins about its spin axis. The input is read each time " +
            "the axis turns, or all the time if there's no `turn` line.",
          "17",
        ),
        words: new Map([
          ["follows", followsInput],
          [
            "from",
            h("from a", "The spin speed at input 0, in degrees a second. Default 45.", "17"),
          ],
          ["to", h("to b", "The spin speed at input 1, in degrees a second. Default 170.", "17")],
          [
            "smooth",
            h(
              "smooth t",
              "Seconds to swing smoothly to a new axis and speed; 0 switches at once. Default 0.4.",
              "17",
            ),
          ],
          [
            "upright",
            h(
              "upright",
              "Keeps the creature the right way up: it only turns round its up axis, `turn` " +
                "reverses the spin instead of picking a new axis, and `flat` doesn't tip it over.",
              "17",
            ),
          ],
        ]),
      },
    ],
    [
      "turn",
      {
        help: h(
          "turn on x changes by 0.5",
          "Gives the spin a new, random axis each time the input triggers. While `flat` is on, " +
            "only drops count.",
          "17",
        ),
        words: new Map(triggerWords(onInput)),
      },
    ],
    [
      "reverse",
      {
        help: h(
          "reverse on x drops by 0.5 on 4 off 4",
          "Reverses the direction of the morph each time the input triggers.",
          "17",
        ),
        words: new Map(
          triggerWords(
            onInput,
            h(
              "on n off m",
              "Works in bursts: reverses for `n` triggers, then rests for `m`, starting at work. " +
                "Without them, it always works.",
              "17",
            ),
          ),
        ),
      },
    ],
    [
      "flat",
      {
        help: h(
          "flat on x drops by 0.5 on 24 off 48",
          "Turns the creature face-on and spins it flat, then back to tumbling in 3D, in " +
            "bursts. Each trigger reverses the flat spin.",
          "17",
        ),
        words: new Map(
          triggerWords(
            onInput,
            h(
              "on n off m",
              "Bursts: flat for `n` triggers, then tumbling in 3D for `m`. It starts at rest, " +
                "tumbling. Default `on 24 off 48`.",
              "17",
            ),
          ),
        ),
      },
    ],
  ]);

/** Help for a word of an effect line at `offset`, if there is one there. */
function effectHelpAt(
  program: CheckResult,
  offset: number,
): { span: Span; help: Help } | undefined {
  for (const s of program.dance ?? []) {
    if (s.kind !== "Effect" || !contains(s.span, offset)) continue;
    const effect = EFFECT_HELP.get(s.name);
    if (!effect) return undefined;
    const name = { start: s.span.start, end: s.span.start + s.name.length };
    if (contains(name, offset)) return { span: name, help: effect.help };
    const words = s.args.filter((a) => a.kind === "Word");
    for (const [i, w] of words.entries()) {
      if (!contains(w.span, offset)) continue;
      // `on` leads a trigger line; later on, it starts the bursts, like `off`.
      const help = w.text === "on" && i > 0 ? effect.words.get("off") : effect.words.get(w.text);
      return help ? { span: w.span, help } : undefined;
    }
  }
  return undefined;
}

/** A gene's range in words, such as `3 to 16, steps of 1`. */
export function geneRange(g: GeneInfo): string {
  if (g.options) return `one of ${g.options.map(formatValue).join(", ")}`;
  if (g.kind === "bool") return "true or false";
  if (g.kind === "colour")
    return g.hue?.whole ? "any hue" : `hues ${g.hue!.start}° + ${g.hue!.length}°`;
  if (g.min === undefined || g.max === undefined) return "";
  let text = `${formatValue(g.min)} to ${formatValue(g.max)}`;
  if (g.step !== undefined) text += `, steps of ${g.step}`;
  if (g.log) text += ", by ratios";
  return text;
}

// ---------- what's in scope ----------

interface InScope {
  name: string;
  kind: "gene" | "part" | "function" | "variable" | "constant";
  help: Help;
}

const signature = (name: string, params: Param[]) =>
  params.length === 0 ? name : `${name}(${params.map((p) => p.name).join(", ")})`;

const contains = (s: Span, offset: number) => s.start <= offset && offset <= s.end;

/** The names that can be used at `offset`, innermost last so they win over outer ones. */
function symbolsAt(program: CheckResult, offset: number): InScope[] {
  const out: InScope[] = [];
  const geneOf = (stmt: Stmt) => program.genes.find((g) => g.decl === stmt);
  const geneSymbol = (g: GeneInfo): InScope => ({
    name: g.name,
    kind: "gene",
    help: h(
      `gene ${g.fullName}`,
      [g.description, geneRange(g)].filter(Boolean).join(" · ") || "A gene.",
      "6",
    ),
  });
  const variable = (name: string, text: string, section: string): InScope => ({
    name,
    kind: "variable",
    help: h(name, text, section),
  });

  const items = program.file.items;
  // Inside a variant, every gene can be set, by its full name.
  if (items.some((s) => s.kind === "Variant" && contains(s.body.span, offset))) {
    return program.genes.map((g) => ({ ...geneSymbol(g), name: g.fullName }));
  }

  // Declarations that can be used from anywhere in the creature.
  const selfContained = items.find(
    (s) =>
      (s.kind === "Background" || s.kind === "Dance" || s.kind === "Pattern") &&
      contains(s.span, offset),
  );
  if (!selfContained) {
    for (const s of items) {
      if (s.kind === "Part" || s.kind === "Function") {
        out.push({
          name: s.name,
          kind: s.kind === "Part" ? "part" : "function",
          help: h(
            `${s.kind === "Part" ? "part" : "function"} ${signature(s.name, s.params)}`,
            s.kind === "Part"
              ? "A part defined in this creature."
              : "A function defined in this creature.",
            "10",
          ),
        });
      }
    }
  }
  // Patterns can be named as kinds anywhere outside pattern code.
  if (!selfContained || selfContained.kind !== "Pattern") {
    for (const s of items) {
      if (s.kind !== "Pattern") continue;
      out.push({
        name: s.name,
        kind: "constant",
        help: h(`pattern ${s.name}`, "A pattern kind defined in this creature.", "14.1"),
      });
    }
  }

  const visit = (stmts: readonly Stmt[], inBody: boolean): void => {
    for (const s of stmts) {
      if (s.kind === "Gene") {
        const g = geneOf(s);
        if (g) out.push(geneSymbol(g));
      } else if (s.kind === "Let" && s.span.start < offset && !contains(s.span, offset)) {
        out.push(variable(s.name, inBody ? "A variable." : "A global variable.", "7"));
      }
    }
    for (const s of stmts) {
      if (!contains(s.span, offset)) continue;
      // A `picture { }` sits in an expression, so only in statements without blocks of their own.
      const picture =
        "block" in s || "body" in s || "branches" in s ? undefined : pictureAt(s, offset);
      if (picture) {
        for (const [name, text] of PIXEL_NAMES) out.push(variable(name, text, "14.1"));
        visit(picture.body.items, true);
        continue;
      }
      const into = (b: Block | undefined) => {
        if (b && contains(b.span, offset)) visit(b.items, inBody);
      };
      switch (s.kind) {
        case "Part":
        case "Function":
          if (!contains(s.body.span, offset)) break;
          for (const p of s.params)
            out.push(variable(p.name, `A parameter of \`${s.name}\`.`, "10"));
          visit(s.body.items, true);
          break;
        case "Background":
        case "Dance":
        case "Pattern":
          into(s.body);
          break;
        case "If":
          for (const b of s.branches) into(b.block);
          into(s.elseBlock);
          break;
        case "Repeat":
          if (s.as && contains(s.block.span, offset))
            out.push(variable(s.as.name, "The loop's counter, from 0.", "9"));
          into(s.block);
          break;
        case "For":
          if (contains(s.block.span, offset))
            out.push(variable(s.variable.name, "The loop's variable.", "9"));
          into(s.block);
          break;
        case "Symmetric":
          if (contains(s.block.span, offset))
            out.push(variable("side", "1 on the first run, −1 on the mirrored one.", "11.6"));
          into(s.block);
          break;
        case "While":
        case "Branch":
        case "Reshape":
        case "Stroke":
        case "Lay":
          into(s.block);
          break;
      }
    }
  };
  visit(selfContained ? [selfContained] : items, false);
  return out;
}

/** The names a `picture { }` block gives its code for each pixel (section 14.1). */
const PIXEL_NAMES: readonly [string, string][] = [
  ["x", "Where the pixel is from left to right, from −1 to 1."],
  ["y", "Where the pixel is from top to bottom, from −1 to 1."],
  ["r", "The pixel's distance from the middle of the picture."],
  ["a", "The pixel's angle from the `x` axis, in degrees from −180 to 180."],
];

/** Pattern code's words, which aren't keywords (section 14.1). */
export const PATTERN_WORD_HELP: ReadonlyMap<string, Help> = new Map([
  [
    "pattern",
    h(
      "pattern Name { … }",
      "Makes a pattern kind of your own: its code draws a grey picture, which `pattern(Name, …)` colours like any built-in kind. A pattern file starts with `pattern Name`.",
      "14.1",
    ),
  ],
  [
    "picture",
    h(
      "picture { … }",
      "A picture made by running the block once for every pixel, with `x`, `y`, `r` and `a` saying where the pixel is. The block ends with `value v`, the pixel's number from 0 (dark) to 1 (light).",
      "14.1",
    ),
  ],
  [
    "value",
    h(
      "value v",
      "Ends a pattern, giving its picture, or a `picture { }` block, giving the pixel's number.",
      "14.1",
    ),
  ],
]);

/** The `picture { }` in `node` whose block holds `offset`, if any. */
function pictureAt(node: unknown, offset: number): PictureExpr | undefined {
  if (typeof node !== "object" || node === null) return undefined;
  if (Array.isArray(node)) {
    for (const n of node) {
      const found = pictureAt(n, offset);
      if (found) return found;
    }
    return undefined;
  }
  const n = node as { kind?: unknown; span?: Span; body?: Block };
  if (n.span && !contains(n.span, offset)) return undefined;
  if (n.kind === "Picture" && n.body && contains(n.body.span, offset)) return n as PictureExpr;
  for (const [key, value] of Object.entries(n)) {
    if (key === "span") continue;
    const found = pictureAt(value, offset);
    if (found) return found;
  }
  return undefined;
}

/** Whether a pattern word at `start` is the word itself rather than a name: a pattern's start, a
 * `picture { }` or a `value` statement. */
function patternWordAt(node: unknown, start: number, word: string): boolean {
  if (typeof node !== "object" || node === null) return false;
  if (Array.isArray(node)) return node.some((n) => patternWordAt(n, start, word));
  const n = node as { kind?: unknown; span?: Span };
  if (n.span && (start < n.span.start || start >= n.span.end)) return false;
  const kind = { pattern: "Pattern", picture: "Picture", value: "Value" }[word];
  if (n.kind === kind && n.span?.start === start) return true;
  return Object.entries(n).some(
    ([key, value]) => key !== "span" && patternWordAt(value, start, word),
  );
}

// ---------- hover ----------

/** The word at `offset`, counting a position just after a word, or just before one, as on it. */
function tokenAt(tokens: readonly Token[], offset: number): number {
  const on = (t: Token) => t.span.start <= offset && offset <= t.span.end;
  const word = tokens.findIndex((t) => (t.kind === "name" || t.kind === "keyword") && on(t));
  if (word >= 0) return word;
  return tokens.findIndex((t) => t.kind !== "newline" && t.kind !== "eof" && on(t));
}

/** Help for the word at `offset`, and where that word is. */
export function helpAt(
  program: CheckResult,
  offset: number,
): { span: Span; help: Help } | undefined {
  const { tokens } = lex(program.text);
  const i = tokenAt(tokens, offset);
  const t = tokens[i];
  if (!t || (t.kind !== "name" && t.kind !== "keyword")) return undefined;
  const found = (help: Help | undefined) => (help ? { span: t.span, help } : undefined);

  // `morph follows music.mid  speed 1.2` in a dance: the effect and its words.
  const effect = effectHelpAt(program, offset);
  if (effect) return effect;

  // A gene set in a variant, such as `whorl.petals`.
  for (const item of program.file.items) {
    if (item.kind !== "Variant") continue;
    for (const g of item.body.items) {
      if (g.kind !== "GeneSetting" || !contains(g.geneSpan, offset)) continue;
      const gene = symbolsAt(program, offset).find((x) => x.name === g.gene);
      return gene ? { span: g.geneSpan, help: gene.help } : undefined;
    }
  }

  // `music.bass`, `turtle.heading`: the word after the dot.
  const dot = tokens[i - 1];
  const owner = tokens[i - 2];
  if (dot?.text === "." && owner && MEMBER_HELP.has(owner.text)) {
    return found(MEMBER_HELP.get(owner.text)!.get(t.text));
  }
  if (t.kind === "name" && PATTERN_WORD_HELP.has(t.text)) {
    if (patternWordAt(program.file.items, t.span.start, t.text) || isPatternHeader(program, t)) {
      return found(PATTERN_WORD_HELP.get(t.text));
    }
  }
  if (t.kind === "name") {
    const symbols = symbolsAt(program, offset).filter((s) => s.name === t.text);
    if (symbols.length > 0) return found(symbols[symbols.length - 1]!.help);
    return found(FUNCTION_HELP.get(t.text) ?? constantHelp(t.text));
  }
  return found(KEYWORD_HELP.get(t.text));
}

/** Whether `t` is the `pattern` that starts a pattern file. */
function isPatternHeader(program: CheckResult, t: Token): boolean {
  return (
    program.file.kind === "pattern" &&
    t.text === "pattern" &&
    lex(program.text).tokens.find((x) => x.kind !== "newline")?.span.start === t.span.start
  );
}

// ---------- completion ----------

/** What can be typed at `offset`: everything in scope, built-ins and keywords. */
export function completionsAt(program: CheckResult, offset: number): Completion[] {
  // After `music.` or `turtle.`, only their parts.
  const before = lex(program.text).tokens.filter(
    (t) => t.kind !== "newline" && t.kind !== "eof" && t.span.end <= offset,
  );
  let k = before.length - 1;
  const last = before[k];
  if (last && (last.kind === "name" || last.kind === "keyword") && last.span.end === offset) k--;
  const dot = before[k];
  const owner = before[k - 1];
  if (dot?.text === "." && owner && MEMBER_HELP.has(owner.text)) {
    return [...MEMBER_HELP.get(owner.text)!.entries()].map(([label, help]) => ({
      label,
      kind: "member",
      detail: help.text,
    }));
  }

  const out = new Map<string, Completion>();
  const add = (c: Completion) => out.set(c.label, c);
  for (const k of KEYWORDS) {
    if (k === "time" || k === "beat" || k === "music" || k === "turtle") {
      add({ label: k, kind: "input", detail: KEYWORD_HELP.get(k)!.text });
    } else {
      add({ label: k, kind: "keyword", detail: KEYWORD_HELP.get(k)?.title ?? "" });
    }
  }
  for (const [name, help] of FUNCTION_HELP)
    add({ label: name, kind: "function", detail: help.title });
  for (const name of BUILTIN_CONSTANTS.keys()) {
    add({ label: name, kind: "constant", detail: constantHelp(name)?.text ?? "" });
  }
  for (const s of symbolsAt(program, offset)) {
    add({ label: s.name, kind: s.kind, detail: s.kind === "gene" ? s.help.text : s.help.title });
  }
  return [...out.values()];
}
