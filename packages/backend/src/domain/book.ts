import type { CalendarDay } from '@clube/shared';

import type { GeneralStatus } from './club';

export interface Book {
  id: string;
  clubId: string;
  title: string;
  author: string | null;
  month: string; // "YYYY-MM" — o mês do clube
  coverUrl: string | null;
  totalPages: number | null;
  createdById: string;
  status: GeneralStatus;
  archivedAt: Date | null;
  createdAt: Date;
}

export interface ReadingPlanItem {
  id: string;
  bookId: string;
  order: number; // DERIVADO da posição no plano (0-based)
  date: CalendarDay; // "YYYY-MM-DD" — dia de calendário, NÃO instante
  title: string; // o tema: "Cap. 3 — A promessa"
  reference: string | null; // texto livre: "p. 45-62"
  createdAt: Date;
}
