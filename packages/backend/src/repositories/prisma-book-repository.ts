import type { Book as PrismaBook, Prisma, PrismaClient } from '@prisma/client';

import type { Book } from '../domain/book';
import type {
  BookFilter,
  BookRepository,
} from '../usecases/ports/book-repository';

function toDomain(record: PrismaBook): Book {
  return {
    id: record.id,
    clubId: record.clubId,
    title: record.title,
    author: record.author,
    month: record.month,
    coverUrl: record.coverUrl,
    totalPages: record.totalPages,
    createdById: record.createdById,
    status: record.status,
    archivedAt: record.archivedAt,
    createdAt: record.createdAt,
  };
}

// Só os campos presentes no patch vão para o `data`. `undefined` é ausência
// (o Prisma também o trata assim); `null` é valor, e sobrescreve. É a
// semântica de que o `editBook` depende para distinguir "não mexe" de "limpa".
function toUpdateData(patch: Partial<Book>): Prisma.BookUpdateInput {
  const data: Prisma.BookUpdateInput = {};
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.author !== undefined) data.author = patch.author;
  if (patch.month !== undefined) data.month = patch.month;
  if (patch.coverUrl !== undefined) data.coverUrl = patch.coverUrl;
  if (patch.totalPages !== undefined) data.totalPages = patch.totalPages;
  if (patch.status !== undefined) data.status = patch.status;
  if (patch.archivedAt !== undefined) data.archivedAt = patch.archivedAt;
  if (patch.createdAt !== undefined) data.createdAt = patch.createdAt;
  // `clubId` e `createdById` NÃO entram: mudar o clube de um livro moveria
  // conteúdo entre tenants, e o `editBook` já não os declara no input.
  return data;
}

export class PrismaBookRepository implements BookRepository {
  constructor(private prisma: PrismaClient) {}

  // Upsert por id: o UseCase já gerou o id, então o mesmo `save` cria e
  // atualiza (é o que dispensa um método a mais na interface).
  async save(book: Book): Promise<Book> {
    const data = {
      clubId: book.clubId,
      title: book.title,
      author: book.author,
      month: book.month,
      coverUrl: book.coverUrl,
      totalPages: book.totalPages,
      createdById: book.createdById,
      status: book.status,
      archivedAt: book.archivedAt,
      createdAt: book.createdAt,
    };
    const record = await this.prisma.book.upsert({
      where: { id: book.id },
      create: { id: book.id, ...data },
      update: data,
    });
    return toDomain(record);
  }

  async byId(id: string): Promise<Book | null> {
    const record = await this.prisma.book.findUnique({ where: { id } });
    return record ? toDomain(record) : null;
  }

  async update(id: string, patch: Partial<Book>): Promise<Book> {
    const record = await this.prisma.book.update({
      where: { id },
      data: toUpdateData(patch),
    });
    return toDomain(record);
  }

  // Sem `status` no filtro devolve OS DOIS: a regra de produto ("só os ACTIVE
  // por padrão", e a ordem "mês corrente primeiro") vive no `listBooks`.
  async find(filter: BookFilter): Promise<Book[]> {
    const records = await this.prisma.book.findMany({
      where: {
        clubId: filter.clubId,
        ...(filter.status === undefined ? {} : { status: filter.status }),
      },
    });
    return records.map(toDomain);
  }
}
