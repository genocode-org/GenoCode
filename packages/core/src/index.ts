// The GenoCode language: lexer, parser, checker, formatter and interpreter
// (docs/LANGUAGE.md), and genetics: mutating, breeding and morphing genes.

/** The file extension for GenoCode files. */
export const FILE_EXTENSION = ".genie";

export type * from "./ast.js";
export { lex, KEYWORDS, type Token, type TokenKind, type LexResult } from "./lexer.js";
export { parse, type ParseResult } from "./parser.js";
export { check, type CheckResult, type NameReference, type Variant } from "./checker.js";
export {
  applyEdits,
  rename,
  symbolAt,
  type RenameResult,
  type SymbolUses,
  type TextEdit,
} from "./symbols.js";
export { patternOnBall, patternsOf } from "./wearing.js";
export { colourLiterals, writeColour, type ColourForm, type ColourLiteral } from "./swatches.js";
export { format, formatText, singleSpaced, type FormatResult } from "./format.js";
export {
  build,
  buildBackground,
  buildDance,
  buildPattern,
  patternFileText,
  DEFAULT_LIMITS,
  MUSIC_FIELDS,
  silence,
  type BackgroundResult,
  type PatternOptions,
  type PatternResult,
  type DanceResult,
  type DanceStyle,
  type Trigger,
  type TriggerKind,
  type BuildOptions,
  type BuildResult,
  type Inputs,
  type LaidShape,
  type PathStep,
  type Limits,
  type MusicInputs,
} from "./interpreter.js";
export type { GeneInfo, GeneKind, GeneSection, HueArc } from "./genes.js";
export {
  breed,
  familySpread,
  geneDistance,
  geneEdits,
  geneLiteral,
  morph,
  mutate,
  valuesOf,
  addVariant,
  variantEdits,
  writeGenes,
  type GeneSet,
  type GeneSpread,
  type GeneticsOptions,
  type GeneValues,
  type MutateOptions,
} from "./genetics.js";
export { colourJumps, type ColourJump, type JumpOptions } from "./jumps.js";
export {
  completionsAt,
  constantHelp,
  EFFECT_HELP,
  FUNCTION_HELP,
  geneRange,
  helpAt,
  KEYWORD_HELP,
  MEMBER_HELP,
  type Completion,
  type CompletionKind,
  type Help,
} from "./help.js";
export { mulberry32 } from "./noise.js";
export * as pictures from "./picture.js";
export {
  BUILTIN_CONSTANTS,
  BUILTIN_FUNCTIONS,
  PICTURE_FUNCTIONS,
  isBuiltinName,
  type BuiltinFunction,
} from "./builtins.js";
export { hsv, rgb, hexColour, toRgb, mixColour, sampleGradient, NAMED_COLOURS } from "./colour.js";
export {
  formatValue,
  isBuiltinKind,
  typeOf,
  SHAPES,
  PATTERN_KINDS,
  SCHEMES,
  FINISHES,
  MIX_WAYS,
  NO_PATTERN,
  valuesEqual,
} from "./values.js";
export type {
  Colour,
  Gradient,
  FinishName,
  MixWayName,
  ListValue,
  Pattern,
  PatternKindName,
  PatternMix,
  PatternSource,
  Picture,
  SchemeName,
  ShapeName,
  TypeName,
  Value,
  Vec,
} from "./values.js";
export {
  formatDiagnostic,
  LineMap,
  type Diagnostic,
  type Position,
  type Severity,
  type Span,
} from "./source.js";
