import { describe, expect, it } from 'vitest';

import {
  type ClipboardLike,
  extractImageFiles,
  uploadImageFiles,
} from '../image-upload';

/**
 * REGRAS 1 e 3 da Tarefa 14 — as duas propriedades do upload de imagem que
 * quebram em SILÊNCIO, e as duas que dão para provar sem editor nenhum.
 *
 * O resto do upload (que o nó só entra no documento DEPOIS de o upload
 * resolver, e que o React não estoura no paste) precisa de um editor de
 * verdade: mora em `rich-editor-image.test.tsx`.
 */

/** Fixture é factory, nunca `const` de `describe` (§7.7). */
function anImage(name = 'print.png'): File {
  return new File([new Uint8Array([137, 80, 78, 71])], name, {
    type: 'image/png',
  });
}

function aPdf(): File {
  return new File([new Uint8Array([37, 80, 68, 70])], 'contrato.pdf', {
    type: 'application/pdf',
  });
}

/**
 * O clipboard/dataTransfer como o navegador entrega.
 *
 * ⚠️ FIDELIDADE DO FAKE (`docs/CONVENCOES-CODIGO.md` §7.1), e aqui a pergunta
 * "o navegador faria isto?" tem duas respostas que importam:
 *
 * 1. `files` do navegador é uma `FileList`, não um `Array` — não tem `map`,
 *    `filter` nem `Symbol.iterator` em todo navegador que este PWA abre. Por
 *    isso o fake entrega um `ArrayLike` cru (só `length` e índices): um helper
 *    escrito contra `Array` passaria no teste e estouraria no celular.
 * 2. `types` lista o formato; `getData` devolve o conteúdo. Os dois existem
 *    separados de propósito: há aplicativo que anuncia `text/plain` e entrega
 *    string vazia, e é justamente esse par que decide o caso do print de tela.
 */
function aClipboard({
  files = [],
  text = '',
  types,
}: {
  files?: File[];
  text?: string;
  types?: string[];
} = {}): ClipboardLike {
  const list: ArrayLike<File> = {
    length: files.length,
    ...Object.fromEntries(files.map((file, index) => [index, file])),
  };

  return {
    files: list,
    types: types ?? [
      ...(text === '' ? [] : ['text/plain']),
      ...(files.length === 0 ? [] : ['Files']),
    ],
    getData: (format) => (format === 'text/plain' ? text : ''),
  };
}

describe('extractImageFiles (rule 1)', () => {
  it('takes the image of a screenshot paste', () => {
    // O caso que o editor existe para servir: `Ctrl+Shift+S`, `Ctrl+V`, e a
    // foto da página lida entra na anotação.
    const file = anImage();

    expect(extractImageFiles(aClipboard({ files: [file] }))).toEqual([file]);
  });

  it('gives up when the clipboard also carries text (§8.3)', () => {
    /*
      ⚠️ ESTA É A REGRA, e o caso que a decide é o Excel: copiar UMA CÉLULA põe
      no clipboard `text/plain` (o valor), `text/html` (a tabela) E uma imagem
      da célula renderizada. Sem esta desistência, colar uma célula de planilha
      numa anotação insere uma FOTO da célula — irreversível para quem colou, e
      o texto que a pessoa queria some.

      A direção da desistência é deliberada: na dúvida, texto. Texto colado
      errado se apaga com um `Ctrl+Z`; imagem colada errada já subiu para o
      servidor.
    */
    const clipboard = aClipboard({
      files: [anImage('celula.png')],
      text: '1.234,56',
    });

    expect(extractImageFiles(clipboard)).toEqual([]);
  });

  it('keeps the image when the announced text is empty', () => {
    // `text/plain` anunciado e vazio não é texto: desistir aqui trocaria a
    // imagem por NADA. O par `types` + `getData` é o que separa os dois casos,
    // e é por isso que o fake tem os dois.
    const file = anImage();
    const clipboard = aClipboard({
      files: [file],
      text: '   ',
      types: ['text/plain', 'Files'],
    });

    expect(extractImageFiles(clipboard)).toEqual([file]);
  });

  it('keeps the image of a copy from a web page, which announces only HTML', () => {
    // Copiar uma imagem de uma página no Chrome anuncia `text/html` + `Files`,
    // sem `text/plain`. Uma desistência por "tem algum formato de texto"
    // tornaria esse caso — imagem copiada da internet — impossível.
    const file = anImage();
    const clipboard = aClipboard({
      files: [file],
      types: ['text/html', 'Files'],
    });

    expect(extractImageFiles(clipboard)).toEqual([file]);
  });

  it('takes every image of a multiple selection, in order', () => {
    const first = anImage('1.png');
    const second = anImage('2.png');

    expect(extractImageFiles(aClipboard({ files: [first, second] }))).toEqual([
      first,
      second,
    ]);
  });

  it('ignores what is not an image', () => {
    // Arrastar um PDF para dentro da anotação não é upload de imagem: o nó
    // `image` com um PDF dentro renderiza um quadrado quebrado para sempre.
    const image = anImage();

    expect(extractImageFiles(aClipboard({ files: [aPdf(), image] }))).toEqual([
      image,
    ]);
  });

  it('gives up on a paste of pure text', () => {
    expect(
      extractImageFiles(aClipboard({ text: 'a leitura de hoje' })),
    ).toEqual([]);
  });

  it('gives up when there is no clipboard at all', () => {
    // `event.clipboardData` e `event.dataTransfer` são anuláveis na plataforma,
    // e um `null` aqui não pode virar exceção dentro do `handlePaste`: o paste
    // inteiro pararia de funcionar, inclusive para texto.
    expect(extractImageFiles(null)).toEqual([]);
    expect(extractImageFiles(undefined)).toEqual([]);
  });

  it('gives up when the clipboard has no files', () => {
    // `files` nulo acontece de verdade (arrastar uma seleção de texto entre
    // aplicativos), e é a outra forma de o navegador dizer "não há arquivo".
    expect(extractImageFiles({ ...aClipboard(), files: null })).toEqual([]);
  });
});

describe('uploadImageFiles (rule 3)', () => {
  /** Contador de chamadas, nunca cronômetro (§7.3). */
  function anUploader(behaviour: (file: File) => Promise<string>) {
    const started: string[] = [];
    const finished: string[] = [];

    return {
      started,
      finished,
      upload: async (file: File): Promise<string> => {
        started.push(file.name);
        const url = await behaviour(file);
        finished.push(file.name);
        return url;
      },
    };
  }

  it('uploads one file at a time, never two in flight', async () => {
    /*
      A prova de SEQUÊNCIA por contagem, e não por cronômetro (§7.3): a cada
      início de upload, o número de uploads já concluídos tem de ser igual ao
      número de iniciados menos um. Se o laço disparasse os três em paralelo
      (um `Promise.all`, ou um `forEach` com `async`), o segundo começaria com
      zero concluídos e esta asserção acusaria.

      Por que sequencial importa num app de celular: três prints de 4 MB em
      paralelo numa rede 3G disputam a mesma banda e os três demoram mais do
      que um de cada vez — e o primeiro erro não teria como abortar os outros.
    */
    const inFlight: number[] = [];
    const uploader = anUploader(async (file) => {
      inFlight.push(uploader.started.length - uploader.finished.length);
      await Promise.resolve();
      return `https://cdn/${file.name}`;
    });
    const inserted: string[] = [];

    await uploadImageFiles([anImage('a.png'), anImage('b.png')], {
      upload: uploader.upload,
      insert: (url) => inserted.push(url),
    });

    expect(inFlight).toEqual([1, 1]);
    expect(uploader.started).toEqual(['a.png', 'b.png']);
    expect(inserted).toEqual(['https://cdn/a.png', 'https://cdn/b.png']);
  });

  it('aborts the rest at the first error (§8.2)', async () => {
    const uploader = anUploader(async (file) => {
      if (file.name === 'b.png') throw new Error('rede caiu');
      return `https://cdn/${file.name}`;
    });
    const inserted: string[] = [];

    await expect(
      uploadImageFiles([anImage('a.png'), anImage('b.png'), anImage('c.png')], {
        upload: uploader.upload,
        insert: (url) => inserted.push(url),
      }),
    ).rejects.toThrow('rede caiu');

    // O LADO POSITIVO junto com o negativo (§7.3): sem o `['a.png','b.png']`,
    // um `uploadImageFiles` que não chamasse nada deixaria o `c.png` ausente
    // por acidente e o teste passaria provando nada.
    expect(uploader.started).toEqual(['a.png', 'b.png']);
    expect(uploader.started).not.toContain('c.png');
    // E o que já entrou no documento CONTINUA lá: o erro do terceiro print não
    // desfaz o primeiro, que já está no servidor.
    expect(inserted).toEqual(['https://cdn/a.png']);
  });

  it('inserts nothing before the upload resolves (rule 2, the pure half)', async () => {
    /*
      A metade pura da regra 2: `insert` só é chamado com a URL que o upload
      DEVOLVEU. Nenhum `blob:` nem `data:` pode chegar ao `doc` (ADR 0001) —
      uma URL temporária gravada no banco quebra em qualquer outro aparelho, e
      não há como recuperar a imagem depois.

      A outra metade — o `doc` do editor de verdade antes e depois — mora em
      `rich-editor-image.test.tsx`, porque só lá existe um `doc`.
    */
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const inserted: string[] = [];

    const running = uploadImageFiles([anImage()], {
      upload: async (file) => {
        await held;
        return `https://cdn/${file.name}`;
      },
      insert: (url) => inserted.push(url),
    });

    await Promise.resolve();
    expect(inserted).toEqual([]);

    release();
    await running;
    expect(inserted).toEqual(['https://cdn/print.png']);
  });

  it('does nothing when there is no file', async () => {
    let calls = 0;

    await uploadImageFiles([], {
      upload: async () => {
        calls += 1;
        return 'https://cdn/x';
      },
      insert: () => undefined,
    });

    expect(calls).toBe(0);
  });
});
