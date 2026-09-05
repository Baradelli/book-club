// @clube/ui/editor — A ENTRADA DO EDITOR, separada do barril de propósito.
//
// ⚠️ POR QUE ESTE ARQUIVO EXISTE, e é a única razão: enquanto o `RichEditor`
// era reexportado por `src/index.ts`, **toda tela que importava um botão puxava
// o editor pelo grafo de módulos**. Importar o `Button` do pacote toca o
// barril, o barril toca o `RichEditor`, e o `RichEditor` toca `@tiptap/*`,
// `prosemirror-*` e `tippy.js`.
//
// A poda do Rollup *podia* remover isso, mas só por METADADO: ele remove o
// import de um módulo cujos exports não são usados apenas quando sabe que o
// módulo não tem efeito colateral, e isso ele sabe pelo campo `sideEffects` do
// `package.json` de quem publica. `@tiptap/starter-kit` e `@tiptap/pm` não
// declaram nada, e `packages/ui` também não declarava — então o bundle do login
// nascia com **684 kB** e ProseMirror dentro (medido na Tarefa 15). O conserto
// de então foi uma exceção de `treeshake.moduleSideEffects` no
// `vite.config.ts` do app: funcionava, e **dependia de configuração** para
// funcionar.
//
// Com o editor FORA do barril, a poda deixa de depender de metadado e passa a
// ser ESTRUTURAL: quem importa `@clube/ui` não tem, no grafo, nenhuma aresta
// que chegue ao TipTap. Não há o que podar porque não há o que entrar. Medido
// na rodada de correção da Tarefa 15: com esta entrada e o `sideEffects` do
// `package.json`, o `vite.config.ts` do app ficou **sem exceção nenhuma** e o
// bundle continuou em 342 kB, com `grep -ci 'prosemirror|tiptap'` = 0.
//
// Quem usa o editor (Tarefas 18+) importa o `RichEditor` do especificador
// `@clube/ui/editor` — declarado no campo `exports` do `package.json` — e paga
// o TipTap porque quer o TipTap. Os componentes de tela continuam saindo pelo
// `@clube/ui` puro.
//
// ⚠️ E O COMENTÁRIO ACIMA NÃO ESCREVE A LINHA DE IMPORT DE PROPÓSITO: o
// `src/__tests__/no-i18n.test.ts` varre `from '...'` no TEXTO dos fontes deste
// pacote (allowlist de especificadores), e um exemplo em comentário entra na
// varredura como se fosse import de verdade. Medido: dois falsos positivos.

export {
  type NoteSearch,
  type NoteSuggestion,
  RichEditor,
  type RichEditorProps,
} from './components/RichEditor';
