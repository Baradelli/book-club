# ADR 0010 — A corrente de leitura é visível, contada e cobrada

- Status: aceito
- Data: set/2026
- Fase: MVP 3 (depois do fechamento)

## Contexto

O MVP 3 inteiro foi construído em torno de um princípio do `docs/plano-clube-do-livro.md`
§1: **o clube não pode virar placar**. Esse princípio virou quatro mecanismos concretos, e
cada um deles tem teste:

1. **A decisão 1 do MVP 3**, respondida pelo dono na rodada de perguntas: progresso é
   **presença**, não agregado. A rota do livro **não devolve contagem nenhuma** — o número
   ficou *irrenderizável por construção*, em vez de depender de alguém lembrar de não
   escrevê-lo.
2. **`GUILT_TERMS`** (`packages/shared/src/locales/__tests__/guilt-terms.ts`), uma varredura
   dos **dois** catálogos que proíbe `atras`, `deixou`, `falta`, `perdeu`, `divida`,
   `penden`, `behind`, `overdue`, `missed` — e **`streak`**, com este comentário escrito no
   código: *"o placar disfarçado de incentivo (§1: nunca comparação)"*.
3. **O feed é uma frase**, sem coluna de pessoa, sem agrupar por pessoa e sem "carregar
   mais" — porque agrupar por pessoa **é** o placar, e paginar convida a rolar o histórico
   procurando quem fez mais.
4. **O lembrete não chega para quem já leu** — a supressão anti-culpa, que é a razão de a
   feature existir.

O dono pediu um sistema de corrente ("foguinho") no molde do Duolingo, para incentivar a
leitura diária.

⚠️ **A objeção foi levantada antes de qualquer linha, com a medição na mão**, e ela tinha
três partes: (a) `streak` está **nominalmente proibido** pela guarda; (b) o mecanismo do
Duolingo é **enquadrado na perda** — o fogo não premia ter lido doze dias, ele ameaça perder
os doze, e é daí que vem a eficácia; (c) **num clube de duas pessoas isso é pior que no
Duolingo**, porque a outra pessoa vê o seu fogo apagar: não é você contra um app, é você
devendo satisfação a quem dorme do seu lado.

**O dono reafirmou o pedido, escolhendo a opção completa**, ciente do custo listado. Este ADR
registra a reversão para que ninguém precise reconstituí-la depois.

## Decisão

**A corrente de leitura passa a ser contada, visível para o clube e usada no lembrete.**

Isto **emenda** (precedência: ADR > `CLAUDE.md`):

- **a decisão 1 do MVP 3** — progresso deixa de ser só presença: a API passa a devolver
  contagem por pessoa;
- **a regra do `CLAUDE.md`** de que nada de agregado sai na resposta do livro.

**Continua valendo, sem emenda:**

- **`CLAUDE.md`: "Progresso do grupo é calculado a partir dos logs, nunca guardado."** A
  corrente é **derivada** a cada leitura. Não existe coluna `streak`, não existe
  `streakUpdatedAt`, e não existe job noturno que a atualize — guardá-la criaria um segundo
  dono da verdade que diverge do log no primeiro fuso horário mal resolvido.
- **ADR 0002** — a corrente de cada pessoa é visível para os membros ativos do clube, como
  todo o resto. Ela não é conteúdo privado.
- **O lembrete continua não chegando para quem já leu.** Cobrar quem leu seria absurdo em
  qualquer modelo, e o dono não pediu isso.

## O que conta como um dia da corrente (a decisão que mais importa)

**Dias do PLANO, não dias do calendário.**

Medido: o `ReadingLog` é ancorado em `planItemId` (decisão 2 do MVP 3), e o plano tem um
item por data — mas **não necessariamente todos os dias**. Um plano que pula domingo é
normal, e numa contagem por dia de calendário o domingo quebraria a corrente de quem fez
tudo certo. A corrente percorre os **dias do plano em ordem de data**, e um dia que o plano
não tem simplesmente não existe para ela.

E a corrente **atravessa livros**: ela é do clube, na ordem das datas de todos os planos.
Uma corrente que zera quando o clube termina o livro do mês seria visivelmente errada para
quem a olha.

⚠️ **O dia de hoje ainda não lido NÃO quebra a corrente.** Você ainda tem o dia. O fogo só
apaga quando um dia do plano **anterior a hoje** ficou sem leitura. Sem isso o fogo apagaria
toda manhã, e a primeira coisa que o app faria ao ser aberto seria dar uma má notícia falsa.

## Consequências

- (+) O dono tem o incentivo diário que pediu, no molde que conhece.
- (−) ⚠️ **O app passa a poder cobrar.** É o custo escolhido, e ele é real: a frase "você vai
  perder sua sequência" é, por construção, uma frase de perda.
- (−) A guarda `GUILT_TERMS` deixa de valer para as chaves da corrente. ⚠️ **Ela NÃO foi
  desligada**: os termos continuam proibidos em todo o resto do app, e a isenção é **nominal,
  por chave**, com teste que a pina. Desligar a lista inteira desprotegeria trinta telas para
  liberar quatro frases — e a primeira frase de cobrança escrita por engano em outra tela
  passaria sem ninguém ver.
- (−) O feed ganha número por pessoa, que é exatamente a "coluna que o olho varre" que o
  desenho do feed evitava. Fica registrado: **se o dono sentir que o clube virou competição,
  é esta decisão que se reverte**, e a reversão é barata porque nada foi guardado.

## Alternativas consideradas

- **Corrente sem perda** (contar para cima, sumir em silêncio, privada) — recusada pelo dono:
  ela incentiva sem cobrar, mas o dono quis o mecanismo do Duolingo, que é a perda.
- **Guardar a corrente numa coluna** — recusada: contraria o `CLAUDE.md` e cria um segundo
  dono da verdade. O custo de calcular é uma consulta de plano e uma de logs por pessoa.
- **Corrente por livro** — recusada: zeraria a cada livro novo.
