export interface User {
  id: string;
  email: string; // sempre normalizado: trim + lowercase
  name: string | null;
  passwordHash: string | null;
  isSuperAdmin: boolean;
  createdAt: Date;
}
