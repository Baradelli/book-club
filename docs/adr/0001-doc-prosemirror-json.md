# ADR 0001 — O texto da anotação é ProseMirror JSON, com `plainText` derivado no backend

- Status: aceito
- Data: set/2026
- Fase: MVP 1 (Bloco C — Anotações)

## Contexto

O editor é TipTap/ProseMirror. Ele sabe exportar o documento em dois formatos: HTML
(`getHTML()`) e o JSON nativo do ProseMirror (`getJSON()`). Precisamos escolher o que vai
para o banco, e decidir de onde vem o texto puro usado em busca e em prévia de listagem.

O caso que decide: as anotações são de leitura e vão ser relidas por meses. Um documento
salvo hoje tem de reabrir idêntico depois de uma atualização do editor ou da adição de uma
extensão nova (tabela, callout, menção).

## Decisão

**O campo `Note.doc` é `Json` e guarda o `editor.getJSON()`.** HTML nunca é persistido.

**`Note.plainText` é derivado no backend** por um helper puro `docToText(doc)` no `domain/`,
recalculado a cada escrita. Ele **não existe no input da API** — nenhum cliente manda
`plainText`. O mesmo vale para `Highlight.commentDoc` / `commentText` (MVP 2).

Também não entram no `doc`: URLs temporárias. `Image.configure({ allowBase64: false })` e o
nó de imagem só é inserido depois de o upload resolver, para que nunca haja `blob:` ou
`data:` gravado.

## Alternativas consideradas

- **Guardar HTML.** Mais fácil de renderizar em qualquer lugar (inclusive num e-mail), e
  legível direto no banco. Mas HTML é lossy na volta: reabrir no ProseMirror passa por um
  parser que precisa adivinhar a estrutura, e qualquer nó customizado (callout, wikilink,
  tarefa) depende de `parseHTML` correto para sobreviver ao round-trip. Um bug de parse
  corrompe silenciosamente uma anotação antiga — exatamente o dado que não pode se perder.
- **Guardar Markdown.** Compacto e legível, mas não representa tabela com cabeçalho, bloco
  alternável, callout nem menção sem convenções inventadas. Seria escolher o formato pelo
  que é bonito no banco, não pelo que o editor precisa.
- **Guardar `doc` e também o HTML renderizado.** Dois campos que podem divergir, sem ganho:
  quem renderiza é sempre o mesmo front, a partir do `doc`.
- **Derivar `plainText` no cliente.** Menos trabalho no servidor, mas o servidor passa a
  confiar num texto que o cliente pode mandar errado (ou adulterado), e cada cliente novo
  precisa reimplementar a derivação.

## Consequências

- (+) O documento é lossless: reabre exatamente como foi escrito, com todos os nós
  customizados.
- (+) Adicionar uma extensão nova não exige migração de dados nem mexer no que já está salvo.
- (+) `plainText` tem uma única fonte, testável isoladamente (`docToText` é puro e recebe
  TDD pesado na Tarefa 09), e serve busca e prévia sem parsear JSON em query.
- (+) Nenhuma URL temporária vaza para o banco.
- (−) O conteúdo não é legível direto no banco — depurar exige ler JSON. Aceitável: a
  ferramenta de leitura é o app.
- (−) Renderizar a anotação fora do front (num e-mail, num export) exigiria um renderizador
  de ProseMirror. Não há esse caso no escopo; se surgir, resolve-se com uma função de
  render a partir do `doc`, não mudando o armazenamento.
- Reconstruir `plainText` de tudo é trivial: rerodar `docToText` por nota.
