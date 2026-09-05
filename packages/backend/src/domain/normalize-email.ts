// A normalização precisa ser a mesma no convite, no aceite e no login
// (Tarefa 04) — daí ser um helper puro do domínio, e não código solto.
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
