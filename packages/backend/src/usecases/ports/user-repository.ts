import type { User } from '../../domain/user';

export interface UserRepository {
  save(user: User): Promise<User>;
  byId(id: string): Promise<User | null>;
  byEmail(email: string): Promise<User | null>; // recebe o e-mail JÁ normalizado
  update(id: string, patch: Partial<User>): Promise<User>;
}
