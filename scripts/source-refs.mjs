// Resolve documented functions, fields, and call sites to real source lines.
// Every lookup uses the TypeScript compiler AST. A lookup fails loudly when its
// target is missing or ambiguous, so the walkthrough cannot ship a guessed line.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'

const K = ts.SyntaxKind

export class SourceIndex {
  constructor(appRoot) {
    this.appRoot = appRoot
    this.files = new Map()
  }

  text(file) {
    return this.load(file).text
  }

  lines(file) {
    return this.load(file).lines
  }

  load(file) {
    if (!this.files.has(file)) {
      const text = readFileSync(join(this.appRoot, file), 'utf8')
      const entry = { text, lines: text.replace(/\r\n/g, '\n').split('\n') }
      if (/\.(ts|tsx)$/.test(file)) {
        const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
        entry.sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind)
      }
      this.files.set(file, entry)
    }
    return this.files.get(file)
  }

  sourceFile(file) {
    const sf = this.load(file).sf
    if (!sf) throw new Error(`${file} is not a TypeScript file`)
    return sf
  }

  span(file, node) {
    const sf = this.sourceFile(file)
    const line = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1
    return { start: line(node.getStart(sf)), end: line(node.getEnd()) }
  }

  lineOf(file, node) {
    const sf = this.sourceFile(file)
    return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
  }
}

function walk(node, visit) {
  visit(node)
  ts.forEachChild(node, (child) => walk(child, visit))
}

function declarationName(node) {
  if (ts.isFunctionDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
    return node.name?.text
  }
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) return node.name.text
  return undefined
}

const normalize = (value) => value.replace(/\s+/g, ' ').trim()

/** Find exactly one declaration (function, const, interface, or type alias). */
export function findDeclaration(index, file, name) {
  const matches = []
  walk(index.sourceFile(file), (node) => {
    if (declarationName(node) === name) matches.push(node)
  })
  if (matches.length !== 1) {
    throw new Error(`${file}: expected one declaration named "${name}", found ${matches.length}`)
  }
  return matches[0]
}

/**
 * Find exactly one AST node of `kind` whose normalized source text equals
 * `text` (or starts with `startsWith`), optionally inside a named declaration.
 */
export function findNode(index, file, { kind, text, startsWith, within, nth }) {
  const root = within ? findDeclaration(index, file, within) : index.sourceFile(file)
  const matches = []
  walk(root, (node) => {
    if (node.kind !== kind) return
    const value = normalize(node.getText())
    if ((text !== undefined && value === normalize(text)) || (startsWith !== undefined && value.startsWith(startsWith))) {
      matches.push(node)
    }
  })
  if (nth !== undefined) {
    if (!matches[nth]) throw new Error(`${file}: no match ${nth} for ${text ?? startsWith}`)
    return matches[nth]
  }
  if (matches.length !== 1) {
    throw new Error(`${file}: expected one ${K[kind]} "${text ?? startsWith}"${within ? ` in ${within}` : ''}, found ${matches.length}`)
  }
  return matches[0]
}

/** Find a member of an interface. */
export function findMember(index, file, interfaceName, member) {
  const decl = findDeclaration(index, file, interfaceName)
  if (!ts.isInterfaceDeclaration(decl)) throw new Error(`${file}: ${interfaceName} is not an interface`)
  const found = decl.members.filter((m) => m.name && ts.isIdentifier(m.name) && m.name.text === member)
  if (found.length !== 1) throw new Error(`${file}: ${interfaceName}.${member} not found`)
  return found[0]
}

/** Every call to `callee` in the given files, with the enclosing named function. */
export function findCalls(index, files, callee) {
  const calls = []
  for (const file of files) {
    walk(index.sourceFile(file), (node) => {
      if (!ts.isCallExpression(node) || node.expression.getText() !== callee) return
      let parent = node.parent
      let owner = '(module scope)'
      while (parent) {
        const name = declarationName(parent)
        if (name && (ts.isFunctionDeclaration(parent) || ts.isVariableDeclaration(parent))) {
          owner = name
          break
        }
        parent = parent.parent
      }
      calls.push({ file, line: index.lineOf(file, node), owner, text: normalize(node.getText()) })
    })
  }
  return calls
}

/** The written signature of a function declaration, without its body. */
export function signatureOf(index, file, name) {
  const decl = findDeclaration(index, file, name)
  if (!ts.isFunctionDeclaration(decl) || !decl.body) throw new Error(`${file}: ${name} is not a function declaration`)
  const sf = index.sourceFile(file)
  const header = sf.text.slice(decl.getStart(sf), decl.body.getStart(sf))
  return normalize(header.replace(/^export\s+(default\s+)?/, '')).replace(/\(\s+/g, '(').replace(/,\s*\)/g, ')')
}

/** A column in a CSV header row. */
export function findCsvColumn(index, file, column) {
  const header = index.lines(file)[0]?.split(',').map((value) => value.trim()) ?? []
  const position = header.indexOf(column)
  if (position < 0) throw new Error(`${file}: header has no column "${column}"`)
  return { line: 1, column: position + 1 }
}

/**
 * Check that a resolved reference points at the intended text. This guards
 * against a resolver that finds the right node but reports the wrong line.
 */
export function verifyReference(index, ref) {
  const line = index.lines(ref.file)[ref.line - 1]
  if (line === undefined) throw new Error(`${ref.file}:${ref.line} does not exist`)
  if (!line.includes(ref.expect)) {
    throw new Error(`${ref.file}:${ref.line} should contain "${ref.expect}" but reads "${line.trim()}"`)
  }
  if (ref.start > ref.line || ref.end < ref.line) throw new Error(`${ref.id}: line is outside its range`)
}

export { K as SyntaxKind }
