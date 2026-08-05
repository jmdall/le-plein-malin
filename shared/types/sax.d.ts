// Déclaration de type pour la dépendance transitive `sax` (parser XML SAX).
// Le paquet n'a pas de types : on déclare la surface utilisée par les
// providers (server/providers/roulezoeco.ts).
declare module 'sax' {
  interface SaxAttribute {
    name: string
    value: string
  }

  interface SaxNode {
    name: string
    attributes: Record<string, string> | Record<string, SaxAttribute>
  }

  interface SaxParser {
    onerror: ((err: Error) => void) | null
    ontext: ((text: string) => void) | null
    onopentag: ((node: SaxNode) => void) | null
    onclosetag: ((name: string) => void) | null
    write(chunk: string): SaxParser
    close(): SaxParser
  }

  const sax: {
    parser(strict?: boolean, options?: { trim?: boolean }): SaxParser
  }
  export = sax
}
