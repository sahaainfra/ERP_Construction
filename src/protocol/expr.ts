// Restricted expression language for CUSTOM checks (Part 17 REQ-PROTOCOL-F03; A-164). It reads values from the payload and computes with them.
// It has no functions, no assignment, no I/O, and no loops. Limits on length, tokens and nesting keep every evaluation small and bounded.
export const MAX_LENGTH = 500;
export const MAX_TOKENS = 200;
export const MAX_DEPTH = 30;

type Token = { kind: "num" | "str" | "id" | "op" | "lparen" | "rparen"; text: string; value?: number | string };
type Node =
  | { kind: "lit"; value: number | string | boolean | null }
  | { kind: "ref"; path: string[] }
  | { kind: "neg" | "not"; arg: Node }
  | { kind: "bin"; op: string; left: Node; right: Node };

const KEYWORDS = new Set(["and", "or", "not", "true", "false", "null"]);

export function tokenize(src: string): Token[] {
  if (src.length > MAX_LENGTH) throw new RangeError(`the expression is longer than ${MAX_LENGTH} characters`);
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (out.length >= MAX_TOKENS) throw new RangeError(`the expression has more than ${MAX_TOKENS} tokens`);
    const two = src.slice(i, i + 2);
    if (["==", "!=", "<=", ">="].includes(two)) { out.push({ kind: "op", text: two }); i += 2; continue; }
    if ("+-*/<>".includes(c)) { out.push({ kind: "op", text: c }); i++; continue; }
    if (c === "(") { out.push({ kind: "lparen", text: c }); i++; continue; }
    if (c === ")") { out.push({ kind: "rparen", text: c }); i++; continue; }
    if (c === "'") {
      const end = src.indexOf("'", i + 1);
      if (end === -1) throw new RangeError("a text value is not closed");
      out.push({ kind: "str", text: src.slice(i, end + 1), value: src.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    const num = /^\d+(\.\d+)?/.exec(src.slice(i));
    if (num) { out.push({ kind: "num", text: num[0], value: Number(num[0]) }); i += num[0].length; continue; }
    const id = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*/.exec(src.slice(i));
    if (id) {
      if (KEYWORDS.has(id[0])) out.push({ kind: "op", text: id[0] });
      else out.push({ kind: "id", text: id[0] });
      i += id[0].length;
      continue;
    }
    throw new RangeError(`the character "${c}" is not allowed in an expression`);
  }
  return out;
}

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}
  parse(): Node {
    const node = this.or(0);
    if (this.pos < this.tokens.length) throw new RangeError("the expression has text after its end");
    return node;
  }
  private peek(): Token | undefined { return this.tokens[this.pos]; }
  private take(): Token { const t = this.tokens[this.pos++]; if (!t) throw new RangeError("the expression ends too soon"); return t; }
  private enter(depth: number): void { if (depth > MAX_DEPTH) throw new RangeError(`the expression is nested more than ${MAX_DEPTH} levels`); }
  private or(d: number): Node {
    this.enter(d);
    let left = this.and(d + 1);
    while (this.peek()?.text === "or") { this.take(); left = { kind: "bin", op: "or", left, right: this.and(d + 1) }; }
    return left;
  }
  private and(d: number): Node {
    this.enter(d);
    let left = this.not(d + 1);
    while (this.peek()?.text === "and") { this.take(); left = { kind: "bin", op: "and", left, right: this.not(d + 1) }; }
    return left;
  }
  private not(d: number): Node {
    this.enter(d);
    if (this.peek()?.text === "not") { this.take(); return { kind: "not", arg: this.not(d + 1) }; }
    return this.cmp(d + 1);
  }
  private cmp(d: number): Node {
    this.enter(d);
    const left = this.add(d + 1);
    const t = this.peek();
    if (t && ["==", "!=", "<", "<=", ">", ">="].includes(t.text)) { this.take(); return { kind: "bin", op: t.text, left, right: this.add(d + 1) }; }
    return left;
  }
  private add(d: number): Node {
    this.enter(d);
    let left = this.mul(d + 1);
    while (this.peek()?.text === "+" || this.peek()?.text === "-") { const op = this.take().text; left = { kind: "bin", op, left, right: this.mul(d + 1) }; }
    return left;
  }
  private mul(d: number): Node {
    this.enter(d);
    let left = this.unary(d + 1);
    while (this.peek()?.text === "*" || this.peek()?.text === "/") { const op = this.take().text; left = { kind: "bin", op, left, right: this.unary(d + 1) }; }
    return left;
  }
  private unary(d: number): Node {
    this.enter(d);
    if (this.peek()?.text === "-") { this.take(); return { kind: "neg", arg: this.unary(d + 1) }; }
    return this.primary(d + 1);
  }
  private primary(d: number): Node {
    this.enter(d);
    const t = this.take();
    if (t.kind === "num") return { kind: "lit", value: t.value as number };
    if (t.kind === "str") return { kind: "lit", value: t.value as string };
    if (t.kind === "id") return { kind: "ref", path: t.text.split(".") };
    if (t.kind === "op" && t.text === "true") return { kind: "lit", value: true };
    if (t.kind === "op" && t.text === "false") return { kind: "lit", value: false };
    if (t.kind === "op" && t.text === "null") return { kind: "lit", value: null };
    if (t.kind === "lparen") {
      const inner = this.or(d + 1);
      if (this.take().kind !== "rparen") throw new RangeError("a parenthesis is not closed");
      return inner;
    }
    throw new RangeError("the expression has a value in the wrong place");
  }
}

/** Parses an expression once. Throws RangeError for anything outside the language. */
export function parse(src: string): Node {
  return new Parser(tokenize(src)).parse();
}

function resolve(path: string[], payload: Record<string, unknown>): unknown {
  let cur: unknown = payload;
  for (const key of path) {
    if (cur === null || typeof cur !== "object") return null;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur === undefined ? null : cur;
}

function compare(op: string, a: number | string, b: number | string): boolean {
  return op === "<" ? a < b : op === "<=" ? a <= b : op === ">" ? a > b : a >= b;
}

function run(node: Node, payload: Record<string, unknown>): unknown {
  switch (node.kind) {
    case "lit": return node.value;
    case "ref": return resolve(node.path, payload);
    case "not": return !run(node.arg, payload);
    case "neg": {
      const v = run(node.arg, payload);
      if (typeof v !== "number") throw new RangeError("only a number can be negated");
      return -v;
    }
    case "bin": {
      if (node.op === "and") return Boolean(run(node.left, payload)) && Boolean(run(node.right, payload));
      if (node.op === "or") return Boolean(run(node.left, payload)) || Boolean(run(node.right, payload));
      const a = run(node.left, payload);
      const b = run(node.right, payload);
      switch (node.op) {
        case "==": return a === b;
        case "!=": return a !== b;
        case "<": case "<=": case ">": case ">=":
          if (typeof a !== typeof b || (typeof a !== "number" && typeof a !== "string")) return false;
          if (typeof a === "number" && typeof b === "number") return compare(node.op, a, b);
          return compare(node.op, String(a), String(b));
        default: {
          if (typeof a !== "number" || typeof b !== "number") throw new RangeError("arithmetic needs two numbers");
          if (node.op === "+") return a + b;
          if (node.op === "-") return a - b;
          if (node.op === "*") return a * b;
          if (b === 0) throw new RangeError("division by zero");
          return a / b;
        }
      }
    }
  }
}

/** Evaluates an expression over the payload. The result must be a boolean (a rule) or the expression is refused. */
export function evaluateRule(src: string, payload: Record<string, unknown>): boolean {
  const value = run(parse(src), payload);
  if (typeof value !== "boolean") throw new RangeError("a custom rule must evaluate to true or false");
  return value;
}
