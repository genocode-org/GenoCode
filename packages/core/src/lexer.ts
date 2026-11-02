// Turns GenoCode text into tokens (docs/LANGUAGE.md section 4).

import type { Comment } from "./ast.js";
import { LineMap, type Diagnostic, type Span } from "./source.js";

export const KEYWORDS: ReadonlySet<string> = new Set([
  "creature",
  "gene",
  "part",
  "function",
  "return",
  "let",
  "if",
  "else",
  "repeat",
  "as",
  "for",
  "from",
  "to",
  "by",
  "while",
  "branch",
  "lay",
  "focuspoint",
  "reshape",
  "stroke",
  "symmetric",
  "shape",
  "colour",
  "color",
  "shine",
  "sharpness",
  "wear",
  "texture",
  "background",
  "fill",
  "dance",
  "forward",
  "back",
  "move",
  "pitch",
  "yaw",
  "roll",
  "rotate",
  "around",
  "grow",
  "mirror",
  "in",
  "step",
  "log",
  "at",
  "and",
  "or",
  "not",
  "true",
  "false",
  "print",
  "turtle",
  "time",
  "beat",
  "music",
  "variant",
  "breed",
]);

export type TokenKind =
  | "name"
  | "keyword"
  | "number"
  | "hex"
  | "string"
  | "op"
  | "newline" // a line end that ends a statement, or `;`
  | "eof";

export interface Token {
  kind: TokenKind;
  /** The token's text. For strings, the text with escapes resolved. */
  text: string;
  span: Span;
  /** 0-based line of the token's start. */
  line: number;
  /** Numbers only: the value. */
  value?: number;
  /** Numbers only: written with a trailing `°`. */
  degree?: boolean;
}

export interface LexResult {
  tokens: Token[];
  comments: Comment[];
  diagnostics: Diagnostic[];
  lines: LineMap;
}

const OPERATORS = [
  "..",
  "==",
  "!=",
  "<=",
  ">=",
  "+=",
  "-=",
  "*=",
  "/=",
  "(",
  ")",
  "[",
  "]",
  "{",
  "}",
  ",",
  ".",
  "=",
  "<",
  ">",
  "+",
  "-",
  "*",
  "/",
  "%",
  "^",
];

/** A line ending after one of these doesn't end the statement. */
const CONTINUES = new Set([
  "+",
  "-",
  "*",
  "/",
  "%",
  "^",
  "==",
  "!=",
  "<",
  "<=",
  ">",
  ">=",
  "=",
  "+=",
  "-=",
  "*=",
  "/=",
  ",",
  "..",
  "and",
  "or",
  "not",
]);

const NAME_START = /[\p{L}_]/u;
const NAME_PART = /[\p{L}\p{N}_]/u;
const HEX = /[0-9a-fA-F]/;

function isDigit(c: string | undefined): boolean {
  return c !== undefined && c >= "0" && c <= "9";
}

export function lex(text: string): LexResult {
  const lines = new LineMap(text);
  const tokens: Token[] = [];
  const comments: Comment[] = [];
  const diagnostics: Diagnostic[] = [];
  let depth = 0; // open ( and [
  let i = 0;
  let lastTokenLine = -1;

  const error = (start: number, end: number, message: string): void => {
    diagnostics.push({ severity: "error", message, span: { start, end } });
  };

  const push = (token: Omit<Token, "line">): void => {
    const line = lines.line(token.span.start);
    tokens.push({ ...token, line });
    lastTokenLine = line;
  };

  const lastToken = (): Token | undefined => tokens[tokens.length - 1];

  const pushNewline = (start: number, text: string): void => {
    const last = lastToken();
    if (last === undefined || last.kind === "newline") return;
    push({ kind: "newline", text, span: { start, end: start + text.length } });
  };

  while (i < text.length) {
    const c = text[i]!;
    const start = i;

    if (c === " " || c === "\t" || c === "\r") {
      i++;
      continue;
    }

    if (c === "\n") {
      i++;
      const last = lastToken();
      const continues =
        depth > 0 ||
        (last !== undefined &&
          (last.kind === "op" || last.kind === "keyword") &&
          CONTINUES.has(last.text));
      if (!continues) pushNewline(start, "\n");
      continue;
    }

    if (c === ";") {
      i++;
      pushNewline(start, ";");
      continue;
    }

    if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      const line = lines.line(start);
      comments.push({
        text: text.slice(start, i).replace(/\s+$/, ""),
        span: { start, end: i },
        line,
        endLine: line,
        ownLine: lastTokenLine !== line,
        blankBefore: false,
      });
      continue;
    }

    if (c === "/" && text[i + 1] === "*") {
      const close = text.indexOf("*/", i + 2);
      if (close < 0) {
        error(start, start + 2, "This comment is never closed with */.");
        i = text.length;
      } else {
        i = close + 2;
      }
      const line = lines.line(start);
      comments.push({
        text: text.slice(start, i),
        span: { start, end: i },
        line,
        endLine: lines.line(i - 1),
        ownLine: lastTokenLine !== line,
        blankBefore: false,
      });
      continue;
    }

    if (isDigit(c)) {
      while (isDigit(text[i])) i++;
      if (text[i] === "." && isDigit(text[i + 1])) {
        i++;
        while (isDigit(text[i])) i++;
      } else if (text[i] === "." && text[i + 1] !== ".") {
        error(start, i + 1, "A decimal point needs a digit after it, as in 1.0.");
      }
      if (
        (text[i] === "e" || text[i] === "E") &&
        (isDigit(text[i + 1]) ||
          ((text[i + 1] === "+" || text[i + 1] === "-") && isDigit(text[i + 2])))
      ) {
        i += 2;
        while (isDigit(text[i])) i++;
      }
      const raw = text.slice(start, i);
      let degree = false;
      if (text[i] === "°") {
        degree = true;
        i++;
      }
      if (i < text.length && NAME_PART.test(text[i]!)) {
        error(start, i + 1, `\`${raw}${text[i]}\` isn't a number. Put a space between them.`);
      }
      push({ kind: "number", text: raw, span: { start, end: i }, value: Number(raw), degree });
      continue;
    }

    if (NAME_START.test(c)) {
      while (i < text.length && NAME_PART.test(text[i]!)) i++;
      const word = text.slice(start, i);
      push({ kind: KEYWORDS.has(word) ? "keyword" : "name", text: word, span: { start, end: i } });
      continue;
    }

    if (c === "#") {
      i++;
      while (i < text.length && HEX.test(text[i]!)) i++;
      const digits = i - start - 1;
      if ((digits !== 6 && digits !== 8) || (i < text.length && NAME_PART.test(text[i]!))) {
        while (i < text.length && NAME_PART.test(text[i]!)) i++;
        error(start, i, "A hex colour has 6 or 8 hex digits, as in #ff8000.");
      }
      push({ kind: "hex", text: text.slice(start, i), span: { start, end: i } });
      continue;
    }

    if (c === '"') {
      i++;
      let value = "";
      let closed = false;
      while (i < text.length && text[i] !== "\n") {
        const ch = text[i]!;
        if (ch === '"') {
          closed = true;
          i++;
          break;
        }
        if (ch === "\\") {
          const next = text[i + 1];
          if (next === '"' || next === "\\") value += next;
          else if (next === "n") value += "\n";
          else error(i, i + 2, 'Only \\", \\\\ and \\n can be used in a string.');
          i += 2;
          continue;
        }
        value += ch;
        i++;
      }
      if (!closed) error(start, i, "This string is never closed with a quote.");
      push({ kind: "string", text: value, span: { start, end: i } });
      continue;
    }

    if (c === "." && isDigit(text[i + 1])) {
      error(start, start + 1, "Write a digit before the decimal point, as in 0.5.");
      i++;
      continue;
    }

    const op = OPERATORS.find((o) => text.startsWith(o, i));
    if (op !== undefined) {
      i += op.length;
      if (op === "(" || op === "[") depth++;
      if ((op === ")" || op === "]") && depth > 0) depth--;
      // Brackets never contain braces, so an unclosed bracket can't swallow more than its block.
      if (op === "{" || op === "}") depth = 0;
      push({ kind: "op", text: op, span: { start, end: i } });
      continue;
    }

    i++;
    if (c === "°") error(start, i, "° can only follow a number.");
    else error(start, i, `\`${c}\` can't be used here.`);
  }

  pushNewline(text.length, "");
  push({ kind: "eof", text: "", span: { start: text.length, end: text.length } });
  return { tokens, comments, diagnostics, lines };
}
