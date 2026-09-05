import { z } from 'zod';

/**
 * O formato de erro de TODA a API. Deliberadamente mínimo: um campo de texto
 * que a tela pode mostrar ao usuário. É o mesmo corpo que o hook de
 * autenticação já devolve (`{ error: 'Unauthorized' }`).
 */
export const errorSchema = z.object({
  error: z.string(),
  /**
   * Qual campo falhou. Presente SÓ em erro de validação (classe 400): é o que
   * permite à tela marcar em vermelho o campo errado, e o cadastro de livro
   * com o plano linha por linha depende disso. Fora do 400 nunca aparece — a
   * política de "nada de mensagem de domínio fora do 400" continua valendo.
   */
  details: z
    .array(z.object({ path: z.string(), message: z.string() }))
    .optional(),
});

export type ErrorResponse = z.infer<typeof errorSchema>;

/** GET /health — declarado como qualquer rota: o schema é a fronteira. */
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
