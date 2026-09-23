import { cx } from '../cx';

/**
 * De que lado fica o traço GROSSO.
 *
 * `top` abre a seção (a leitura de hoje na home, `Inicio.dc.html:44-47`);
 * `bottom` fecha o cabeçalho e entrega a página para a escrita
 * (`Dia.dc.html:49-52`, `NovaAnotacao.dc.html:59-62`,
 * `DiaDesktop.dc.html:58-61`).
 */
export type RuleDoubleAccent = 'top' | 'bottom';

export interface RuleDoubleProps {
  accent?: RuleDoubleAccent;
  className?: string;
}

/*
  Os dois traços, escritos como LITERAIS (decisão C) e não montados a partir do
  lado. Duas constantes em vez de `` `h-${weight} bg-${colour}` ``: o Tailwind
  só emite o CSS do que está escrito.
*/
const HEAVY = 'h-0.5 bg-accent';
const HAIRLINE = 'h-px bg-line';

/**
 * O FILETE DUPLO da edição crítica: um traço de 2px na cor de ação e um
 * hairline de 1px logo ao lado, com 3px de ar entre eles.
 *
 * ⚠️ Ele é o que substitui a SOMBRA. O desenho do canvas é caderno
 * encadernado: o que separa uma seção da outra é filete, nunca cartão
 * flutuante — e é por isso que este componente é dois `div` e não um `border`
 * só. Um `border-b-2` não teria o segundo traço nem o ar entre eles.
 *
 * ⚠️ E A INVERSÃO É DE ORDEM, NÃO DE COR. No canvas a home põe o grosso em
 * cima e o dia põe o grosso embaixo — os dois `<div>` trocam de lugar. Trocar
 * só as cores deixaria o traço grosso sempre no topo, que é o gesto que o olho
 * lê como "aqui começa"; invertido, ele lê "aqui termina".
 *
 * Decoração pura, então `aria-hidden` (regra 6 da Tarefa 41b): quem ouve a
 * tela não ganha nada com "grupo, vazio" entre o título e o texto.
 */
export function RuleDouble({ accent = 'top', className }: RuleDoubleProps) {
  const first = accent === 'top' ? HEAVY : HAIRLINE;
  const second = accent === 'top' ? HAIRLINE : HEAVY;

  return (
    <div
      aria-hidden="true"
      // `gap-[3px]` e não um degrau da escala: o canvas declara `gap:3px` nos
      // quatro artboards, e 3px não é múltiplo do passo de 4px do Tailwind.
      className={cx('flex flex-col gap-[3px]', className)}
    >
      <div className={first} />
      <div className={second} />
    </div>
  );
}
