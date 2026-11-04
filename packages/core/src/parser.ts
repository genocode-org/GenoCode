// Builds the syntax tree from tokens (docs/LANGUAGE.md section 22). It keeps going after errors:
// a statement that can't be read becomes an ErrorStmt, and parsing carries on with the next one.

import {
  EFFECT_FLAGS,
  EFFECT_KEYWORD_WORDS,
  EFFECT_NAMES,
  TRIGGER_KINDS,
  type AssignOp,
  type Axis,
  type BinaryOp,
  type Block,
  type Comment,
  type CommandName,
  type EffectArg,
  type Expr,
  type FileKind,
  type GeneRange,
  type GradientStop,
  type IfBranch,
  type MaterialProperty,
  type Param,
  type SourceFile,
  type Stmt,
  type StmtBase,
} from "./ast.js";
import { lex, type Token } from "./lexer.js";
import type { Diagnostic, LineMap, Span } from "./source.js";

export interface ParseResult {
  file: SourceFile;
  diagnostics: Diagnostic[];
  lines: LineMap;
}

export function parse(text: string): ParseResult {
  const lexed = lex(text);
  const parser = new Parser(lexed.tokens, lexed.comments, lexed.diagnostics);
  const file = parser.parseFile();
  return { file, diagnostics: lexed.diagnostics, lines: lexed.lines };
}

class ParseError extends Error {}

type Context = "normal" | "dance" | "variant";

const COMMANDS = new Set<string>(["forward", "back", "move", "pitch", "yaw", "roll", "grow"]);
const MATERIALS = new Set<string>([
  "shape",
  "colour",
  "color",
  "shine",
  "sharpness",
  "texture",
  "wear",
]);
const ASSIGN_OPS = new Set<string>(["=", "+=", "-=", "*=", "/="]);
const COMPARE_OPS = new Set<string>(["==", "!=", "<", "<=", ">", ">="]);

class Parser {
  private pos = 0;
  private ci = 0;
  /** 0-based line of the last token or comment taken. */
  private lastLine = -1;
  /** End offset of the last token taken (newlines don't count). */
  private lastEnd = 0;
  /** Inside pattern code, where `value` and `picture { }` are words (section 14.1). */
  private patternDepth = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly comments: Comment[],
    private readonly diagnostics: Diagnostic[],
  ) {}

  // ---------- tokens ----------

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)]!;
  }

  private next(): Token {
    const t = this.peek();
    if (t.kind !== "eof") this.pos++;
    if (t.kind !== "newline" && t.kind !== "eof") {
      this.lastLine = t.line;
      this.lastEnd = t.span.end;
    }
    return t;
  }

  private isOp(text: string, offset = 0): boolean {
    const t = this.peek(offset);
    return t.kind === "op" && t.text === text;
  }

  private isKw(text: string, offset = 0): boolean {
    const t = this.peek(offset);
    return t.kind === "keyword" && t.text === text;
  }

  private atStatementEnd(): boolean {
    const t = this.peek();
    return t.kind === "newline" || t.kind === "eof" || (t.kind === "op" && t.text === "}");
  }

  private skipNewlines(): void {
    while (this.peek().kind === "newline") this.next();
  }

  private error(span: Span, message: string): void {
    this.diagnostics.push({ severity: "error", message, span });
  }

  private fail(span: Span, message: string): never {
    this.error(span, message);
    throw new ParseError(message);
  }

  private describe(t: Token): string {
    if (t.kind === "newline") return t.text === ";" ? "`;`" : "the end of the line";
    if (t.kind === "eof") return "the end of the file";
    if (t.kind === "string") return "a string";
    return `\`${t.text}\``;
  }

  private expectOp(text: string, what?: string): Token {
    if (this.isOp(text)) return this.next();
    const t = this.peek();
    return this.fail(
      t.span,
      `Expected \`${text}\`${what ? ` ${what}` : ""}, but found ${this.describe(t)}.`,
    );
  }

  private expectKw(text: string): Token {
    if (this.isKw(text)) return this.next();
    const t = this.peek();
    return this.fail(t.span, `Expected \`${text}\`, but found ${this.describe(t)}.`);
  }

  private expectName(what: string): Token {
    const t = this.peek();
    if (t.kind === "name") return this.next();
    if (t.kind === "keyword") {
      return this.fail(t.span, `\`${t.text}\` is a keyword, so it can't be used as ${what}.`);
    }
    return this.fail(t.span, `Expected ${what}, but found ${this.describe(t)}.`);
  }

  private spanFrom(start: number): Span {
    return { start, end: Math.max(start, this.lastEnd) };
  }

  // ---------- comments ----------

  private takeComments(before: number): Comment[] {
    const out: Comment[] = [];
    while (this.ci < this.comments.length && this.comments[this.ci]!.span.start < before) {
      const c = this.comments[this.ci++]!;
      c.blankBefore = c.line - this.lastLine > 1;
      this.lastLine = c.endLine;
      out.push(c);
    }
    return out;
  }

  /** A comment on `line`, before the next token. */
  private takeTrailing(line: number): Comment | undefined {
    const c = this.comments[this.ci];
    if (c === undefined || c.line !== line || c.span.start >= this.peek().span.start)
      return undefined;
    this.ci++;
    this.lastLine = c.endLine;
    return c;
  }

  // ---------- files ----------

  parseFile(): SourceFile {
    this.skipNewlines();
    const headerComments = this.takeComments(this.peek().span.start);
    const first = this.peek();
    let kind: FileKind = "creature";
    let name = "";
    let nameSpan: Span = { start: first.span.start, end: first.span.start };

    const patternFile = first.kind === "name" && first.text === "pattern";
    if (
      (first.kind === "keyword" &&
        (first.text === "creature" || first.text === "background" || first.text === "dance")) ||
      patternFile
    ) {
      this.next();
      kind = first.text as FileKind;
      if (patternFile) this.patternDepth++;
      const t = this.peek();
      if (t.kind === "name") {
        this.next();
        name = t.text;
        nameSpan = t.span;
      } else {
        this.error(t.span, `Expected the ${kind}'s name after \`${kind}\`.`);
      }
      if (!this.atStatementEnd()) {
        this.error(this.peek().span, "Expected the end of the line after the name.");
        this.sync();
      }
    } else {
      this.error(
        first.span,
        "A GenoCode file starts with `creature <Name>`, `background <Name>`, `dance <Name>` or `pattern <Name>`.",
      );
    }

    const description: Comment[] = [];
    while (this.ci < this.comments.length) {
      const c = this.comments[this.ci]!;
      if (!c.ownLine || c.line !== this.lastLine + 1 || c.span.start >= this.nextContentStart())
        break;
      this.ci++;
      c.blankBefore = false;
      this.lastLine = c.endLine;
      description.push(c);
    }

    const items = this.parseItems(false, kind === "dance" ? "dance" : "normal");
    const endComments = this.takeComments(Number.POSITIVE_INFINITY);
    return {
      kind,
      name,
      nameSpan,
      headerComments,
      description,
      items,
      endComments,
      span: { start: 0, end: this.peek().span.end },
    };
  }

  /** Start of the next token that isn't a line end. */
  private nextContentStart(): number {
    let i = this.pos;
    while (this.tokens[i]!.kind === "newline") i++;
    return this.tokens[i]!.span.start;
  }

  private parseItems(inBlock: boolean, ctx: Context): Stmt[] {
    const items: Stmt[] = [];
    for (;;) {
      this.skipNewlines();
      const t = this.peek();
      if (t.kind === "eof") break;
      if (t.kind === "op" && t.text === "}") {
        if (inBlock) break;
        this.error(t.span, "This `}` doesn't close anything.");
        this.next();
        continue;
      }
      items.push(this.parseItem(ctx));
    }
    return items;
  }

  private parseItem(ctx: Context): Stmt {
    const leading = this.takeComments(this.peek().span.start);
    const blankBefore = this.peek().line - this.lastLine > 1 && this.lastLine >= 0;
    const start = this.peek().span.start;
    const startPos = this.pos;
    let stmt: Stmt;
    try {
      stmt = this.parseStatement(ctx);
    } catch (e) {
      if (!(e instanceof ParseError)) throw e;
      if (this.pos === startPos && !this.isOp("{")) this.next();
      this.sync();
      stmt = { kind: "ErrorStmt", ...this.base(start) };
    }
    stmt.leading = leading;
    stmt.blankBefore = blankBefore;
    return stmt;
  }

  /** Skips to the end of the current statement: a line end outside braces, or an unmatched `}`. */
  private sync(): void {
    let depth = 0;
    for (;;) {
      const t = this.peek();
      if (t.kind === "eof") return;
      if (t.kind === "newline" && depth === 0) {
        this.next();
        return;
      }
      if (t.kind === "op" && t.text === "{") depth++;
      if (t.kind === "op" && t.text === "}") {
        if (depth === 0) return;
        depth--;
      }
      this.next();
    }
  }

  private base(start: number): StmtBase {
    return { span: this.spanFrom(start), leading: [], trailing: undefined, blankBefore: false };
  }

  /** Ends a statement that has no block: takes a trailing comment, then the line end. */
  private endSimple<T extends Stmt>(stmt: T): T {
    stmt.span = this.spanFrom(stmt.span.start);
    stmt.trailing = this.takeTrailing(this.lastLine);
    if (this.peek().kind === "newline") {
      this.next();
    } else if (!this.atStatementEnd()) {
      this.error(
        this.peek().span,
        `Expected the end of the statement, but found ${this.describe(this.peek())}.`,
      );
      this.sync();
    }
    return stmt;
  }

  /** Ends a statement that finishes with a block. */
  private endCompound<T extends Stmt>(stmt: T): T {
    stmt.span = this.spanFrom(stmt.span.start);
    if (this.peek().kind === "newline") {
      this.next();
    } else if (!this.atStatementEnd()) {
      this.error(
        this.peek().span,
        `Expected a new line after \`}\`, but found ${this.describe(this.peek())}.`,
      );
      this.sync();
    }
    return stmt;
  }

  private parseBlock(after: string, ctx: Context = "normal"): Block {
    if (!this.isOp("{")) {
      const t = this.peek();
      if (t.kind === "newline" && this.isOp("{", 1)) {
        this.fail(this.peek(1).span, `Put \`{\` on the same line as \`${after}\`.`);
      }
      this.fail(t.span, `Expected \`{\` after \`${after}\`, but found ${this.describe(t)}.`);
    }
    const open = this.next();
    const openComment = this.takeTrailing(open.line);
    const items = this.parseItems(true, ctx);
    const endComments = this.takeComments(this.peek().span.start);
    if (!this.isOp("}")) {
      this.fail(
        { start: open.span.start, end: open.span.end },
        "This `{` is never closed with `}`.",
      );
    }
    const close = this.next();
    const closeComment = this.takeTrailing(close.line);
    return {
      span: { start: open.span.start, end: close.span.end },
      items,
      open: openComment,
      endComments,
      close: closeComment,
    };
  }

  // ---------- statements ----------

  private parseStatement(ctx: Context): Stmt {
    const t = this.peek();
    const start = t.span.start;
    if (ctx === "variant") return this.parseGeneSetting();

    if (t.kind === "name") {
      if (ctx === "dance" && EFFECT_NAMES.has(t.text)) return this.parseEffect();
      if (t.text === "pattern" && this.peek(1).kind === "name" && this.isOp("{", 2)) {
        this.next();
        const name = this.next();
        this.patternDepth++;
        let body: Block;
        try {
          body = this.parseBlock("the pattern's name");
        } finally {
          this.patternDepth--;
        }
        return this.endCompound({
          kind: "Pattern",
          ...this.base(start),
          name: name.text,
          nameSpan: name.span,
          body,
        });
      }
      const after = this.peek(1);
      if (
        this.patternDepth > 0 &&
        t.text === "value" &&
        !(after.kind === "op" && ASSIGN_OPS.has(after.text))
      ) {
        this.next();
        const value = this.parseExpr();
        return this.endSimple({ kind: "Value", ...this.base(start), value });
      }
      this.next();
      const op = this.peek();
      if (op.kind === "op" && ASSIGN_OPS.has(op.text)) {
        this.next();
        const value = this.parseExpr();
        return this.endSimple({
          kind: "Assign",
          ...this.base(start),
          name: t.text,
          nameSpan: t.span,
          op: op.text as AssignOp,
          value,
        });
      }
      let args: Expr[] = [];
      if (this.isOp("(")) args = this.parseArgs();
      return this.endSimple({
        kind: "PartCall",
        ...this.base(start),
        name: t.text,
        nameSpan: t.span,
        args,
      });
    }

    if (t.kind !== "keyword") {
      this.fail(t.span, `Expected a statement, but found ${this.describe(t)}.`);
    }

    const word = t.text;
    switch (word) {
      case "gene":
        return this.parseGene();
      case "part":
      case "function":
        return this.parseDefinition(word);
      case "background": {
        this.next();
        const body = this.parseBlock("background");
        return this.endCompound({ kind: "Background", ...this.base(start), body });
      }
      case "dance": {
        this.next();
        const body = this.parseBlock("dance", "dance");
        return this.endCompound({ kind: "Dance", ...this.base(start), body });
      }
      case "breed": {
        this.next();
        const w = this.peek();
        if (w.kind !== "name" || (w.text !== "on" && w.text !== "off")) {
          this.fail(w.span, "Expected `on` or `off` after `breed`.");
        }
        this.next();
        return this.endSimple({ kind: "Breed", ...this.base(start), on: w.text === "on" });
      }
      case "variant": {
        this.next();
        const name = this.expectName("the variant's name");
        const body = this.parseBlock("the variant's name", "variant");
        return this.endCompound({
          kind: "Variant",
          ...this.base(start),
          name: name.text,
          nameSpan: name.span,
          body,
        });
      }
      case "let": {
        this.next();
        const name = this.expectName("a variable name");
        this.expectOp("=", "after the variable name");
        const value = this.parseExpr();
        return this.endSimple({
          kind: "Let",
          ...this.base(start),
          name: name.text,
          nameSpan: name.span,
          value,
        });
      }
      case "return": {
        this.next();
        const value = this.atStatementEnd() ? undefined : this.parseExpr();
        return this.endSimple({ kind: "Return", ...this.base(start), value });
      }
      case "print": {
        this.next();
        if (!this.isOp("(")) this.fail(this.peek().span, "Write `print(…)` with brackets.");
        const args = this.parseArgs();
        return this.endSimple({ kind: "Print", ...this.base(start), args });
      }
      case "if":
        return this.parseIf();
      case "repeat": {
        this.next();
        const count = this.parseExpr();
        let as: Param | undefined;
        if (this.isKw("as")) {
          this.next();
          const name = this.expectName("a name for the counter");
          as = { name: name.text, span: name.span };
        }
        const block = this.parseBlock("repeat");
        return this.endCompound({ kind: "Repeat", ...this.base(start), count, as, block });
      }
      case "for": {
        this.next();
        const name = this.expectName("a name for the loop variable");
        this.expectKw("from");
        const from = this.parseExpr();
        this.expectKw("to");
        const to = this.parseExpr();
        let by: Expr | undefined;
        if (this.isKw("by")) {
          this.next();
          by = this.parseExpr();
        }
        const block = this.parseBlock("for");
        return this.endCompound({
          kind: "For",
          ...this.base(start),
          variable: { name: name.text, span: name.span },
          from,
          to,
          by,
          block,
        });
      }
      case "while": {
        this.next();
        const condition = this.parseExpr();
        const block = this.parseBlock("while");
        return this.endCompound({ kind: "While", ...this.base(start), condition, block });
      }
      case "branch": {
        this.next();
        const block = this.parseBlock("branch");
        return this.endCompound({ kind: "Branch", ...this.base(start), block });
      }
      case "symmetric": {
        this.next();
        const axis = this.parseAxis("symmetric");
        const block = this.parseBlock(`symmetric ${axis}`);
        return this.endCompound({ kind: "Symmetric", ...this.base(start), axis, block });
      }
      case "lay": {
        this.next();
        if (this.isOp("{")) {
          const block = this.parseBlock("lay");
          return this.endCompound({ kind: "Lay", ...this.base(start), block });
        }
        return this.endSimple({ kind: "Lay", ...this.base(start), block: undefined });
      }
      case "focuspoint":
        this.next();
        return this.endSimple({ kind: "FocusPoint", ...this.base(start) });
      case "reshape": {
        this.next();
        const block = this.parseBlock("reshape");
        return this.endCompound({ kind: "Reshape", ...this.base(start), block });
      }
      case "stroke": {
        this.next();
        const block = this.parseBlock("stroke");
        return this.endCompound({ kind: "Stroke", ...this.base(start), block });
      }
      case "rotate": {
        this.next();
        const angle = this.parseExpr();
        this.expectKw("around");
        const axis = this.parseExpr();
        return this.endSimple({ kind: "Rotate", ...this.base(start), angle, axis });
      }
      case "mirror": {
        this.next();
        const axis = this.parseAxis("mirror");
        return this.endSimple({ kind: "Mirror", ...this.base(start), axis });
      }
      case "fill": {
        this.next();
        const value = this.parseExpr();
        return this.endSimple({ kind: "Fill", ...this.base(start), value });
      }
    }

    if (COMMANDS.has(word)) {
      this.next();
      const value = this.parseExpr();
      return this.endSimple({
        kind: "Command",
        ...this.base(start),
        command: word as CommandName,
        value,
      });
    }

    if (MATERIALS.has(word)) {
      this.next();
      const value = this.parseExpr();
      const property: MaterialProperty = word === "color" ? "colour" : (word as MaterialProperty);
      return this.endSimple({
        kind: "Material",
        ...this.base(start),
        property,
        keyword: word,
        value,
      });
    }

    if (word === "else") this.fail(t.span, "`else` must come straight after the `}` of an `if`.");
    return this.fail(t.span, `A statement can't start with \`${word}\`.`);
  }

  private parseAxis(after: string): Axis {
    const t = this.peek();
    if (t.kind === "name" && (t.text === "x" || t.text === "y" || t.text === "z")) {
      this.next();
      return t.text;
    }
    return this.fail(
      t.span,
      `Expected \`x\`, \`y\` or \`z\` after \`${after}\`, but found ${this.describe(t)}.`,
    );
  }

  private parseGene(): Stmt {
    const start = this.next().span.start;
    const name = this.expectName("a gene name");
    this.expectOp("=", "after the gene name");
    const value = this.parseExpr();
    let range: GeneRange | undefined;
    if (this.isKw("in")) {
      this.next();
      const min = this.parseExpr();
      this.expectOp("..", "between the lowest and highest value");
      const max = this.parseExpr();
      let step: Expr | undefined;
      let log = false;
      if (this.isKw("step")) {
        this.next();
        step = this.parseExpr();
      } else if (this.isKw("log")) {
        this.next();
        log = true;
      }
      range = { kind: "Range", min, max, step, log };
    } else if (this.isKw("from")) {
      this.next();
      this.expectOp("[", "after `from`");
      const options: Expr[] = [this.parseExpr()];
      while (this.isOp(",")) {
        this.next();
        options.push(this.parseExpr());
      }
      this.expectOp("]", "after the options");
      range = { kind: "Choice", options };
    }
    return this.endSimple({
      kind: "Gene",
      ...this.base(start),
      name: name.text,
      nameSpan: name.span,
      value,
      range,
    });
  }

  private parseDefinition(word: "part" | "function"): Stmt {
    const start = this.next().span.start;
    const name = this.expectName(`a ${word} name`);
    let params: Param[] = [];
    if (this.isOp("(")) {
      params = this.parseParams();
    } else if (word === "function") {
      this.fail(
        this.peek().span,
        "A function needs brackets after its name, even with no parameters: `function f() {`.",
      );
    }
    const body = this.parseBlock(`${word} ${name.text}`);
    return this.endCompound({
      kind: word === "part" ? "Part" : "Function",
      ...this.base(start),
      name: name.text,
      nameSpan: name.span,
      params,
      body,
    });
  }

  private parseParams(): Param[] {
    this.expectOp("(");
    const params: Param[] = [];
    if (!this.isOp(")")) {
      for (;;) {
        const t = this.expectName("a parameter name");
        params.push({ name: t.text, span: t.span });
        if (!this.isOp(",")) break;
        this.next();
      }
    }
    this.expectOp(")", "after the parameters");
    return params;
  }

  private parseIf(): Stmt {
    const start = this.next().span.start;
    const branches: IfBranch[] = [];
    let elseBlock: Block | undefined;
    let condition = this.parseExpr();
    branches.push({ condition, block: this.parseBlock("if") });
    for (;;) {
      let j = 0;
      while (this.peek(j).kind === "newline") j++;
      if (!this.isKw("else", j)) break;
      for (let k = 0; k < j; k++) this.next();
      this.next();
      if (this.isKw("if")) {
        this.next();
        condition = this.parseExpr();
        branches.push({ condition, block: this.parseBlock("else if") });
        continue;
      }
      elseBlock = this.parseBlock("else");
      break;
    }
    return this.endCompound({ kind: "If", ...this.base(start), branches, elseBlock });
  }

  /** `whorl.petals = 9`: a gene by its full name, which may start with `background` or `dance`. */
  private parseGeneSetting(): Stmt {
    const first = this.peek();
    const isPart = (t: Token) =>
      t.kind === "name" ||
      (t.kind === "keyword" && (t.text === "background" || t.text === "dance"));
    if (!isPart(first)) {
      this.fail(first.span, `Expected a gene's name, but found ${this.describe(first)}.`);
    }
    this.next();
    let gene = first.text;
    let end = first.span.end;
    while (this.isOp(".")) {
      this.next();
      const part = this.expectName("a name after `.`");
      gene += `.${part.text}`;
      end = part.span.end;
    }
    this.expectOp("=", "after the gene's name");
    const value = this.parseExpr();
    return this.endSimple({
      kind: "GeneSetting",
      ...this.base(first.span.start),
      gene,
      geneSpan: { start: first.span.start, end },
      value,
    });
  }

  /** An effect line: words, each followed by a value unless it stands alone (section 17). */
  private parseEffect(): Stmt {
    const t = this.next();
    const args: EffectArg[] = [];
    while (!this.atStatementEnd()) {
      const w = this.peek();
      if (!(w.kind === "name" || (w.kind === "keyword" && EFFECT_KEYWORD_WORDS.has(w.text)))) {
        this.fail(
          w.span,
          `Expected a word such as \`follows\` or \`speed\`, but found ${this.describe(w)}.`,
        );
      }
      this.next();
      args.push({ kind: "Word", text: w.text, span: w.span });
      if (TRIGGER_KINDS.has(w.text) || EFFECT_FLAGS.has(w.text)) continue;
      if (this.atStatementEnd())
        this.fail(this.peek().span, `Expected a value after \`${w.text}\`.`);
      args.push({ kind: "Value", expr: this.parseExpr() });
    }
    return this.endSimple({ kind: "Effect", ...this.base(t.span.start), name: t.text, args });
  }

  private parseArgs(): Expr[] {
    this.expectOp("(");
    const args: Expr[] = [];
    if (!this.isOp(")")) {
      for (;;) {
        args.push(this.parseExpr());
        if (!this.isOp(",")) break;
        this.next();
      }
    }
    this.expectOp(")", "after the arguments");
    return args;
  }

  // ---------- expressions ----------

  parseExpr(): Expr {
    return this.parseOr();
  }

  private binary(op: BinaryOp, opSpan: Span, left: Expr, right: Expr): Expr {
    return {
      kind: "Binary",
      op,
      opSpan,
      left,
      right,
      span: { start: left.span.start, end: right.span.end },
    };
  }

  private parseOr(): Expr {
    let left = this.parseAnd();
    while (this.isKw("or")) {
      const op = this.next();
      left = this.binary("or", op.span, left, this.parseAnd());
    }
    return left;
  }

  private parseAnd(): Expr {
    let left = this.parseNot();
    while (this.isKw("and")) {
      const op = this.next();
      left = this.binary("and", op.span, left, this.parseNot());
    }
    return left;
  }

  private parseNot(): Expr {
    if (this.isKw("not")) {
      const op = this.next();
      const operand = this.parseNot();
      return {
        kind: "Unary",
        op: "not",
        operand,
        span: { start: op.span.start, end: operand.span.end },
      };
    }
    return this.parseCompare();
  }

  private parseCompare(): Expr {
    const left = this.parseSum();
    const t = this.peek();
    if (t.kind !== "op" || !COMPARE_OPS.has(t.text)) return left;
    this.next();
    const result = this.binary(t.text as BinaryOp, t.span, left, this.parseSum());
    const again = this.peek();
    if (again.kind === "op" && COMPARE_OPS.has(again.text)) {
      this.fail(again.span, "Comparisons can't be chained. Write `a < b and b < c`.");
    }
    return result;
  }

  private parseSum(): Expr {
    let left = this.parseProduct();
    while (this.isOp("+") || this.isOp("-")) {
      const op = this.next();
      left = this.binary(op.text as BinaryOp, op.span, left, this.parseProduct());
    }
    return left;
  }

  private parseProduct(): Expr {
    let left = this.parseUnary();
    while (this.isOp("*") || this.isOp("/") || this.isOp("%")) {
      const op = this.next();
      left = this.binary(op.text as BinaryOp, op.span, left, this.parseUnary());
    }
    return left;
  }

  private parseUnary(): Expr {
    if (this.isOp("-")) {
      const op = this.next();
      const operand = this.parseUnary();
      return {
        kind: "Unary",
        op: "-",
        operand,
        span: { start: op.span.start, end: operand.span.end },
      };
    }
    return this.parsePower();
  }

  private parsePower(): Expr {
    const base = this.parsePostfix();
    if (this.isOp("^")) {
      const op = this.next();
      return this.binary("^", op.span, base, this.parseUnary());
    }
    return base;
  }

  private parsePostfix(): Expr {
    let e = this.parsePrimary();
    for (;;) {
      if (this.isOp(".")) {
        this.next();
        const t = this.peek();
        if (t.kind !== "name" && t.kind !== "keyword") {
          this.fail(t.span, `Expected a name after \`.\`, but found ${this.describe(t)}.`);
        }
        this.next();
        e = {
          kind: "Member",
          object: e,
          name: t.text,
          nameSpan: t.span,
          span: { start: e.span.start, end: t.span.end },
        };
      } else if (this.isOp("(")) {
        const args = this.parseArgs();
        e = { kind: "Call", callee: e, args, span: { start: e.span.start, end: this.lastEnd } };
      } else if (this.isOp("[")) {
        this.next();
        const index = this.parseExpr();
        this.expectOp("]", "after the position");
        e = { kind: "Index", object: e, index, span: { start: e.span.start, end: this.lastEnd } };
      } else {
        return e;
      }
    }
  }

  private parseField(after: string): Token {
    this.expectOp(".", `after \`${after}\``);
    const t = this.peek();
    if (t.kind !== "name" && t.kind !== "keyword") {
      this.fail(t.span, `Expected a name after \`${after}.\`, but found ${this.describe(t)}.`);
    }
    return this.next();
  }

  private parsePrimary(): Expr {
    const t = this.peek();
    switch (t.kind) {
      case "number":
        this.next();
        return {
          kind: "Number",
          value: t.value!,
          raw: t.text,
          degree: t.degree === true,
          span: t.span,
        };
      case "hex":
        this.next();
        return { kind: "Hex", raw: t.text, span: t.span };
      case "string":
        this.next();
        return { kind: "String", value: t.text, span: t.span };
      case "keyword":
        switch (t.text) {
          case "true":
          case "false":
            this.next();
            return { kind: "Bool", value: t.text === "true", span: t.span };
          case "time":
            this.next();
            return { kind: "Time", span: t.span };
          case "beat":
            this.next();
            return { kind: "Beat", span: t.span };
          case "turtle": {
            this.next();
            const f = this.parseField("turtle");
            return {
              kind: "Turtle",
              field: f.text,
              fieldSpan: f.span,
              span: { start: t.span.start, end: f.span.end },
            };
          }
          case "music": {
            this.next();
            const f = this.parseField("music");
            return {
              kind: "Music",
              field: f.text,
              fieldSpan: f.span,
              span: { start: t.span.start, end: f.span.end },
            };
          }
        }
        return this.fail(t.span, `Expected a value, but found the keyword \`${t.text}\`.`);
      case "name":
        this.next();
        if ((t.text === "gradient" || t.text === "spectrum") && this.isOp("("))
          return this.parseGradient(t);
        if (t.text === "picture" && this.patternDepth > 0 && this.isOp("{")) {
          const body = this.parseBlock("picture");
          return { kind: "Picture", body, span: { start: t.span.start, end: body.span.end } };
        }
        return { kind: "Name", name: t.text, span: t.span };
      case "op":
        if (t.text === "(") return this.parseBrackets();
        if (t.text === "[") return this.parseList();
        break;
    }
    if (t.kind === "newline" || t.kind === "eof") {
      return this.fail(t.span, "The line ends where a value was expected.");
    }
    return this.fail(t.span, `Expected a value, but found ${this.describe(t)}.`);
  }

  private parseBrackets(): Expr {
    const open = this.next();
    const first = this.parseExpr();
    if (this.isOp(")")) {
      this.next();
      return first;
    }
    if (!this.isOp(",")) this.expectOp(")");
    this.next();
    const y = this.parseExpr();
    if (this.isOp(")")) {
      this.fail(
        { start: open.span.start, end: this.peek().span.end },
        "A vector has three numbers, as in (1, 0, 2).",
      );
    }
    this.expectOp(",", "between the parts of a vector");
    const z = this.parseExpr();
    if (this.isOp(",")) this.fail(this.peek().span, "A vector has three numbers, not more.");
    this.expectOp(")", "after the vector");
    return { kind: "Vector", x: first, y, z, span: { start: open.span.start, end: this.lastEnd } };
  }

  private parseList(): Expr {
    const open = this.next();
    const items: Expr[] = [];
    if (!this.isOp("]")) {
      for (;;) {
        items.push(this.parseExpr());
        if (!this.isOp(",")) break;
        this.next();
      }
    }
    this.expectOp("]", "after the list's items");
    return { kind: "List", items, span: { start: open.span.start, end: this.lastEnd } };
  }

  private parseGradient(name: Token): Expr {
    this.expectOp("(");
    const stops: GradientStop[] = [];
    for (;;) {
      const colour = this.parseExpr();
      let at: Expr | undefined;
      if (this.isKw("at")) {
        this.next();
        at = this.parseExpr();
      }
      stops.push({ colour, at });
      if (!this.isOp(",")) break;
      this.next();
    }
    this.expectOp(")", "after the gradient's colours");
    return {
      kind: "Gradient",
      stops,
      straight: name.text === "spectrum",
      span: { start: name.span.start, end: this.lastEnd },
    };
  }
}
