export interface PaginationInput {
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export function normalizePagination(input: PaginationInput = {}) {
  const page = input.page ?? 1;
  const limit = input.limit ?? 20;
  if (!Number.isInteger(page) || page < 1) throw new Error('page debe ser un entero mayor o igual a 1');
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('limit debe estar entre 1 y 100');
  return { page, limit, skip: (page - 1) * limit };
}

export function paginated<T>(data: T[], total: number, page: number, limit: number): PaginatedResult<T> {
  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}
