// Injetado para o teste ser determinístico; a geração real (base32 sem
// caracteres ambíguos) é adapter da Tarefa 03.
export interface CodeGenerator {
  generate(): string;
}
