// Independent checks of the generated walkthrough. They read source lines with
// plain text patterns, not the AST resolver, so a resolver bug cannot hide.
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildWalkthrough } from './generate-walkthrough.mjs'

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const lineAt = (file, line) => readFileSync(join(APP_ROOT, file), 'utf8').replace(/\r\n/g, '\n').split('\n')[line - 1] ?? ''

const { html, refs } = buildWalkthrough(APP_ROOT)

describe('developer walkthrough source references', () => {
  it('points each function reference at its declaration line', () => {
    const functions = Object.values(refs).filter((ref) => ref.id.startsWith('fn.'))
    expect(functions.length).toBeGreaterThan(0)
    for (const ref of functions) {
      const name = ref.id.slice(3)
      expect(lineAt(ref.file, ref.line), ref.id).toMatch(new RegExp(`\\bfunction ${name}\\(`))
    }
  })

  it('points each field reference at its interface member or CSV header', () => {
    for (const ref of Object.values(refs).filter((r) => r.id.startsWith('field.'))) {
      const name = ref.id.split('.').at(-1)
      expect(lineAt(ref.file, ref.line), ref.id).toMatch(new RegExp(`^\\s*${name}\\??:`))
    }
    for (const ref of Object.values(refs).filter((r) => r.id.startsWith('csv.'))) {
      expect(ref.line).toBe(1)
      expect(lineAt(ref.file, 1).trim().split(','), ref.id).toContain(ref.id.split('.').at(-1))
    }
  })

  it('records the completion state write and the property join where they happen', () => {
    expect(lineAt(refs['domain.stateWrite'].file, refs['domain.stateWrite'].line)).toContain('last_completed: today')
    expect(lineAt(refs['domain.join'].file, refs['domain.join'].line)).toContain('item.property_id === property.property_id')
    expect(lineAt(refs['jsx.onClick'].file, refs['jsx.onClick'].line)).toContain('onClick={() => onMarkDone(row.item_id)}')
    expect(lineAt(refs['jsx.onMarkDone.app'].file, refs['jsx.onMarkDone.app'].line)).toContain('onMarkDone={handleMarkDone}')
  })

  it('gives every static source link a matching embedded line', () => {
    const targets = [...html.matchAll(/href="#(L:[^"]+)"/g)].map((match) => match[1])
    expect(targets.length).toBeGreaterThan(50)
    for (const target of new Set(targets)) expect(html, target).toContain(`id="${target}"`)
  })

  it('stays portable and offline', () => {
    expect(html).not.toMatch(/\/home\/|node_modules|file:\/\/|vscode:\/\/|https?:\/\/(?!www\.w3\.org)/)
    expect(html).not.toMatch(/<script[^>]+src=|<link[^>]+href=|fetch\(/)
  })
})
