/**
 * Quantity formula engine (FR-1.3/FR-1.5/FR-15.3) — pure, no I/O.
 *
 * Grammar (recursive descent):
 *   expr       := comparison
 *   comparison := additive (('==' | '!=') additive)?
 *   additive   := multiplicative (('+' | '-') multiplicative)*
 *   multiplicative := unary (('*' | '/') unary)*
 *   unary      := '-' unary | primary
 *   primary    := NUMBER | STRING | IDENT | IDENT '(' expr ')' | '(' expr ')'
 *
 * Semantics:
 * - Comparisons yield 1/0 so string attributes compose with arithmetic
 *   (FR-15.3), e.g. `(season == "winter") * 2 + 1`.
 * - `null` propagates through arithmetic and functions (FR-2.1a: a trip
 *   without a start date has trip_duration = null); callers fall back
 *   to quantity 1. Division by zero also yields null.
 * - Validation runs at template save time (FR-1.5): unknown variables
 *   or functions, arity and type errors cannot be persisted.
 */

/** Variable catalog per FR-1.5 + FR-15.3. */
export interface FormulaVariables {
  trip_duration: number | null
  num_travelers: number
  num_adults: number
  num_children: number
  season?: string | null
  transport_mode?: string | null
  accommodation?: string | null
}

const NUMERIC_VARIABLES = new Set(['trip_duration', 'num_travelers', 'num_adults', 'num_children'])
const STRING_VARIABLES = new Set(['season', 'transport_mode', 'accommodation'])
const FUNCTIONS: Record<string, (n: number) => number> = {
  ceil: Math.ceil,
  floor: Math.floor,
  round: Math.round,
}

export type ValidationResult = { ok: true } | { ok: false; error: string }

// --- Tokenizer ---

type Token =
  | { kind: 'number'; value: number }
  | { kind: 'string'; value: string }
  | { kind: 'ident'; value: string }
  | { kind: 'op'; value: string }

class FormulaError extends Error {}

function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < source.length) {
    const ch = source[i]!
    if (/\s/.test(ch)) {
      i++
      continue
    }
    if (/[0-9.]/.test(ch)) {
      let j = i
      while (j < source.length && /[0-9.]/.test(source[j]!)) j++
      const raw = source.slice(i, j)
      const value = Number(raw)
      if (Number.isNaN(value)) throw new FormulaError(`invalid number "${raw}"`)
      tokens.push({ kind: 'number', value })
      i = j
      continue
    }
    if (/[a-z_]/i.test(ch)) {
      let j = i
      while (j < source.length && /[a-z0-9_]/i.test(source[j]!)) j++
      tokens.push({ kind: 'ident', value: source.slice(i, j) })
      i = j
      continue
    }
    if (ch === '"' || ch === "'") {
      const end = source.indexOf(ch, i + 1)
      if (end < 0) throw new FormulaError('unterminated string')
      tokens.push({ kind: 'string', value: source.slice(i + 1, end) })
      i = end + 1
      continue
    }
    if (ch === '=' || ch === '!') {
      if (source[i + 1] !== '=') throw new FormulaError(`unexpected "${ch}"`)
      tokens.push({ kind: 'op', value: ch + '=' })
      i += 2
      continue
    }
    if ('+-*/()'.includes(ch)) {
      tokens.push({ kind: 'op', value: ch })
      i++
      continue
    }
    throw new FormulaError(`unexpected character "${ch}"`)
  }
  return tokens
}

// --- Parser (AST) ---

type Node =
  | { type: 'number'; value: number }
  | { type: 'string'; value: string }
  | { type: 'variable'; name: string }
  | { type: 'call'; name: string; arg: Node }
  | { type: 'unary'; operand: Node }
  | { type: 'binary'; op: string; left: Node; right: Node }

function parse(source: string): Node {
  const tokens = tokenize(source)
  if (tokens.length === 0) throw new FormulaError('empty formula')
  let pos = 0

  const peek = () => tokens[pos]
  const next = () => tokens[pos++]
  const expectOp = (value: string) => {
    const t = next()
    if (!t || t.kind !== 'op' || t.value !== value) {
      throw new FormulaError(`expected "${value}"`)
    }
  }

  function comparison(): Node {
    const left = additive()
    const t = peek()
    if (t && t.kind === 'op' && (t.value === '==' || t.value === '!=')) {
      next()
      const right = additive()
      const after = peek()
      if (after && after.kind === 'op' && (after.value === '==' || after.value === '!=')) {
        throw new FormulaError('chained comparison is not allowed')
      }
      return { type: 'binary', op: t.value, left, right }
    }
    return left
  }

  function additive(): Node {
    let node = multiplicative()
    for (let t = peek(); t && t.kind === 'op' && (t.value === '+' || t.value === '-'); t = peek()) {
      next()
      node = { type: 'binary', op: t.value, left: node, right: multiplicative() }
    }
    return node
  }

  function multiplicative(): Node {
    let node = unary()
    for (let t = peek(); t && t.kind === 'op' && (t.value === '*' || t.value === '/'); t = peek()) {
      next()
      node = { type: 'binary', op: t.value, left: node, right: unary() }
    }
    return node
  }

  function unary(): Node {
    const t = peek()
    if (t && t.kind === 'op' && t.value === '-') {
      next()
      return { type: 'unary', operand: unary() }
    }
    return primary()
  }

  function primary(): Node {
    const t = next()
    if (!t) throw new FormulaError('unexpected end of formula')
    if (t.kind === 'number') return { type: 'number', value: t.value }
    if (t.kind === 'string') return { type: 'string', value: t.value }
    if (t.kind === 'ident') {
      const after = peek()
      if (after && after.kind === 'op' && after.value === '(') {
        next()
        const inner = peek()
        if (inner && inner.kind === 'op' && inner.value === ')') {
          throw new FormulaError(`${t.value}() needs exactly one argument`)
        }
        const arg = comparison()
        expectOp(')')
        return { type: 'call', name: t.value, arg }
      }
      return { type: 'variable', name: t.value }
    }
    if (t.kind === 'op' && t.value === '(') {
      const inner = comparison()
      expectOp(')')
      return inner
    }
    throw new FormulaError(`unexpected "${t.value}"`)
  }

  const root = comparison()
  if (pos < tokens.length) {
    throw new FormulaError(`unexpected "${tokens[pos]!.value}" after end of formula`)
  }
  return root
}

// --- Static checks (FR-1.5: validated at save time) ---

type StaticType = 'number' | 'string'

function check(node: Node): StaticType {
  switch (node.type) {
    case 'number':
      return 'number'
    case 'string':
      return 'string'
    case 'variable':
      if (NUMERIC_VARIABLES.has(node.name)) return 'number'
      if (STRING_VARIABLES.has(node.name)) return 'string'
      throw new FormulaError(`unknown variable "${node.name}"`)
    case 'call':
      if (!(node.name in FUNCTIONS)) throw new FormulaError(`unknown function "${node.name}"`)
      if (check(node.arg) !== 'number') {
        throw new FormulaError(`${node.name}() needs a numeric argument`)
      }
      return 'number'
    case 'unary':
      if (check(node.operand) !== 'number')
        throw new FormulaError('negation needs a numeric operand')
      return 'number'
    case 'binary': {
      const left = check(node.left)
      const right = check(node.right)
      if (node.op === '==' || node.op === '!=') {
        if (left !== right) throw new FormulaError('comparison operands must have the same type')
        return 'number'
      }
      if (left !== 'number' || right !== 'number') {
        throw new FormulaError(`"${node.op}" needs numeric operands`)
      }
      return 'number'
    }
  }
}

/** validateFormula reports whether the formula may be persisted (FR-1.5). */
export function validateFormula(source: string): ValidationResult {
  try {
    check(parse(source))
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// --- Evaluation ---

type Value = number | string | null

function evaluate(node: Node, vars: FormulaVariables): Value {
  switch (node.type) {
    case 'number':
      return node.value
    case 'string':
      return node.value
    case 'variable':
      return (vars as unknown as Record<string, Value | undefined>)[node.name] ?? null
    case 'call': {
      const arg = evaluate(node.arg, vars)
      if (arg === null) return null
      // check() guarantees the function exists.
      return FUNCTIONS[node.name]!(arg as number)
    }
    case 'unary': {
      const v = evaluate(node.operand, vars)
      return v === null ? null : -(v as number)
    }
    case 'binary': {
      const left = evaluate(node.left, vars)
      const right = evaluate(node.right, vars)
      if (node.op === '==') return left === right ? 1 : 0
      if (node.op === '!=') return left !== right ? 1 : 0
      if (left === null || right === null) return null
      const l = left as number
      const r = right as number
      switch (node.op) {
        case '+':
          return l + r
        case '-':
          return l - r
        case '*':
          return l * r
        case '/':
          return r === 0 ? null : l / r
      }
      return null
    }
  }
}

/**
 * evaluateFormula computes a validated formula. Returns null when the
 * result is undefined (null trip_duration per FR-2.1a, division by
 * zero); callers fall back to quantity 1. Throws on formulas that would
 * not pass validateFormula.
 */
export function evaluateFormula(source: string, vars: FormulaVariables): number | null {
  const node = parse(source)
  check(node)
  const value = evaluate(node, vars)
  return typeof value === 'number' ? value : null
}
