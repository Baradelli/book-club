// @clube/shared — schemas Zod, tipos e helpers compartilhados.
// Back e front importam daqui: um schema valida, infere tipo e gera o OpenAPI.

export * from './auth';
// `CalendarDay`/`isCalendarDay`/`isClubMonth` moraram no domínio do backend até
// a Tarefa 07. Mudaram de casa porque o Zod da borda e a tela de cadastro
// precisam da MESMA validação de "YYYY-MM-DD"/"YYYY-MM" que o domínio usa, e
// duplicar validação entre back e front é proibido (CLAUDE.md).
export * from './book';
export * from './calendar-day';
export * from './club';
export * from './error';
// Os schemas de borda do grifo (MVP 2, Tarefa 24). Arquivo próprio e não
// dentro do `note.ts`, que já tem ~150 linhas de schema — espelha a separação
// que o backend fez entre `note-routes.ts` e `highlight-routes.ts`.
export * from './highlight';
// A paleta fixa de 5 cores do `Highlight` (MVP 2, Tarefa 22). Mora aqui pelo
// mesmo motivo do `calendar-day`: o domínio do backend, o `z.enum` da borda
// (Tarefa 24) e a tela de grifos (Tarefa 25) precisam da MESMA lista.
export * from './highlight-color';
export * from './invite';
// "Que dia é hoje" no fuso de quem olha a tela, com `Intl` e sem Luxon
// (`CLAUDE.md`). Nasceu na Tarefa 16 — o `CLAUDE.md` prometia este arquivo
// desde a 12.
export * from './local-day';
export * from './note';
export * from './reading-plan-dates';
