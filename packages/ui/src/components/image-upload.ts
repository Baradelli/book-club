import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

/**
 * O upload de imagem por colar, soltar e escolher (`docs/EDITOR.md` §8).
 *
 * ⚠️ A REGRA QUE MANDA EM TUDO AQUI (ADR 0001): o nó `image` só entra no
 * documento DEPOIS de o upload resolver, e com a URL FINAL. Nunca um `blob:`
 * nem um `data:` — o `doc` vai para o banco, e uma URL temporária gravada lá
 * quebra em qualquer outro aparelho, para sempre, sem como recuperar a imagem.
 * É também por isso que o nó `image` é configurado com `allowBase64: false`.
 *
 * A extensão NÃO conhece cliente HTTP: quem sabe subir arquivo é a tela, que
 * passa `onUploadImage` ao `RichEditor`. Aqui só existe o gatilho.
 */

/** O `accept` do seletor de arquivo. Só imagem — o resto o helper descarta. */
const IMAGE_ACCEPT = 'image/*';

/** O prefixo de `File.type` que faz de um arquivo uma imagem. */
const IMAGE_TYPE_PREFIX = 'image/';

/** O formato que decide o caso da célula de planilha (§8.3). */
const PLAIN_TEXT = 'text/plain';

/**
 * O mínimo de um `DataTransfer` que o helper puro precisa ler.
 *
 * É um tipo estrutural, e não o `DataTransfer` da DOM, por uma razão de teste:
 * o jsdom não sabe construir um `DataTransfer`, e o `ClipboardEvent` de
 * verdade não deixa montar um clipboard à mão. O `DataTransfer` do navegador
 * satisfaz esta forma, então o `handlePaste`/`handleDrop` passa o objeto real
 * sem conversão nenhuma.
 *
 * `files` é `ArrayLike<File>` e não `File[]` de propósito: o navegador entrega
 * uma `FileList`, que não tem `map` nem `filter`. Um helper escrito contra
 * `Array` passaria no teste com um fake generoso e estouraria no celular
 * (`docs/CONVENCOES-CODIGO.md` §7.1).
 */
export interface ClipboardLike {
  readonly types: readonly string[];
  readonly files: ArrayLike<File> | null;
  getData: (format: string) => string;
}

/** As imagens de uma `FileList`, na ordem em que vieram. */
function imagesOf(files: ArrayLike<File> | null): File[] {
  if (files === null) return [];

  const found: File[] = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    if (file !== undefined && file.type.startsWith(IMAGE_TYPE_PREFIX)) {
      found.push(file);
    }
  }
  return found;
}

/**
 * As imagens de um paste/drop — ou NENHUMA, quando há texto junto (§8.3).
 *
 * ⚠️ A DESISTÊNCIA É O PONTO DESTE HELPER, e o caso que a decide é o Excel:
 * copiar uma célula põe no clipboard o valor em `text/plain`, a tabela em
 * `text/html` E uma imagem da célula renderizada. Sem desistir, colar uma
 * célula de planilha numa anotação insere uma FOTO dela e o texto que a pessoa
 * queria desaparece.
 *
 * A direção é deliberada: na dúvida, texto. Texto colado errado se desfaz com
 * um `Ctrl+Z`; imagem colada errada já subiu para o servidor.
 *
 * `text/plain` ANUNCIADO E VAZIO não conta como texto (há aplicativo que
 * anuncia sem entregar): desistir ali trocaria a imagem por nada. E
 * `text/html` sozinho também não conta — é o que o Chrome anuncia ao copiar
 * uma imagem de uma página, e é um caso que tem de funcionar.
 */
export function extractImageFiles(
  data: ClipboardLike | null | undefined,
): File[] {
  if (data === null || data === undefined) return [];

  const announcesText = data.types.includes(PLAIN_TEXT);
  if (announcesText && data.getData(PLAIN_TEXT).trim() !== '') return [];

  return imagesOf(data.files);
}

export interface UploadImageFilesHandlers {
  /** Sobe UM arquivo e devolve a URL final. É o `onUploadImage` da tela. */
  upload: (file: File) => Promise<string>;
  /** Põe a URL no documento. Só é chamado com URL já resolvida. */
  insert: (url: string) => void;
}

/**
 * Sobe os arquivos UM DE CADA VEZ, e o primeiro erro aborta o resto (§8.2).
 *
 * Sequencial e não `Promise.all`: três prints de 4 MB em paralelo numa rede de
 * celular disputam a mesma banda e os três demoram mais do que um por vez — e,
 * pior, um erro no segundo não teria como impedir o terceiro de subir.
 *
 * A rejeição SOBE (não é engolida aqui): quem sabe mostrar "Falha ao enviar" é
 * o `RichEditor`, que tem a pílula. O que já entrou no documento continua lá —
 * aquelas imagens já estão no servidor.
 */
export async function uploadImageFiles(
  files: readonly File[],
  { insert, upload }: UploadImageFilesHandlers,
): Promise<void> {
  for (const file of files) {
    const url = await upload(file);
    insert(url);
  }
}

/**
 * Abre o seletor de arquivo do sistema (o item "Imagem" do menu `/`).
 *
 * O input é criado na hora e ANEXADO ao documento antes do clique: no Safari
 * do iPhone um `click()` em input solto não abre o seletor. Ele sai do
 * documento em `change` e em `cancel` — sem o segundo, cada desistência
 * deixaria um input pendurado no `body`.
 */
function openImagePicker(onFiles: (files: File[]) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = IMAGE_ACCEPT;
  input.multiple = true;
  input.hidden = true;

  input.addEventListener('change', () => {
    const files = imagesOf(input.files);
    input.remove();
    if (files.length > 0) onFiles(files);
  });
  input.addEventListener('cancel', () => {
    input.remove();
  });

  document.body.append(input);
  input.click();
}

export interface ImageUploadOptions {
  /**
   * Recebe os arquivos detectados e a posição do documento onde inseri-los
   * (`undefined` = onde o cursor está). Quem orquestra upload, pílula de
   * estado e inserção é o `RichEditor`.
   */
  onFiles: (files: File[], position?: number) => void;
}

/**
 * O que o menu `/` LÊ para saber se pode oferecer "Imagem" (§5).
 *
 * É `editor.storage['imageUpload']` que serve de feature flag: assim o menu
 * não precisa receber prop nenhuma, e a extensão só está registrada quando a
 * tela passou `onUploadImage`.
 */
export interface ImageUploadStorage {
  enabled: boolean;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    imageUpload: {
      /** Abre o seletor de arquivo do sistema. */
      openImagePicker: () => ReturnType;
    };
  }
}

export const ImageUpload = Extension.create<
  ImageUploadOptions,
  ImageUploadStorage
>({
  name: 'imageUpload',

  addOptions() {
    return { onFiles: () => undefined };
  },

  addStorage() {
    return { enabled: true };
  },

  addCommands() {
    return {
      openImagePicker: () => () => {
        openImagePicker((files) => {
          this.options.onFiles(files);
        });
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    const { onFiles } = this.options;

    return [
      new Plugin({
        key: new PluginKey('imageUploadHandlers'),
        props: {
          handlePaste: (_view, event) => {
            const files = extractImageFiles(event.clipboardData);
            if (files.length === 0) return false;

            // O paste de imagem é NOSSO: sem o `preventDefault` o ProseMirror
            // também trataria o evento e colaria o `text/html` do clipboard.
            event.preventDefault();
            onFiles(files);
            return true;
          },

          handleDrop: (view, event, _slice, moved) => {
            // `moved` é o arrastar DENTRO do próprio documento (mover um
            // parágrafo de lugar). Tratá-lo aqui duplicaria o conteúdo.
            if (moved) return false;

            const files = extractImageFiles(event.dataTransfer);
            if (files.length === 0) return false;

            event.preventDefault();
            // A imagem entra ONDE foi solta, não onde o cursor estava.
            const at = view.posAtCoords({
              left: event.clientX,
              top: event.clientY,
            });
            onFiles(files, at?.pos);
            return true;
          },
        },
      }),
    ];
  },
});
