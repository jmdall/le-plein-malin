import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const DOMAIN_DIR = join(__dirname, '../../domain')

function collectTsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry)
    if (statSync(fullPath).isDirectory()) {
      return collectTsFiles(fullPath)
    }
    return entry.endsWith('.ts') ? [fullPath] : []
  })
}

const FORBIDDEN_PATTERNS = [
  'nuxt',
  '#app',
  'nitropack',
  'h3',
  'ofetch',
  'process.env',
  'sqlite',
  'drizzle',
  'server/db'
]

describe('pureté du domaine (ticket 002)', () => {
  it('aucun fichier de domain/ n\'importe Nuxt, HTTP, SQLite ou process.env', () => {
    const files = collectTsFiles(DOMAIN_DIR)

    expect(files.length).toBeGreaterThan(0)

    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      const imports = source
        .split('\n')
        .filter((line) => /^\s*import/.test(line))

      for (const line of imports) {
        for (const pattern of FORBIDDEN_PATTERNS) {
          expect(
            line,
            `${file} : import interdit "${pattern}" (${line.trim()})`
          ).not.toContain(pattern)
        }
      }
    }
  })
})
