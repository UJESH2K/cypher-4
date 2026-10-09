import type { Role } from "./roles";

// Demo logins shown on the sign-in screen so anyone can try each role.
// The server never reads these: it checks passwords against the hashes in
// lib/auth/users.ts.

export type DemoLogin = { id: string; password: string; name: string; role: Role; store?: string; initials: string; best?: boolean };

export const DEMO_LOGINS: DemoLogin[] = [
  { id: "ramesh", password: "kaveri@2026", name: "Ramesh Kulkarni", role: "purchasing", initials: "RK", best: true },
  { id: "savitha", password: "gokak@2026", name: "Savitha Hiremath", role: "store", store: "Gokak", initials: "SH" },
  { id: "auditor", password: "audit@2026", name: "Neha Desai", role: "viewer", initials: "ND" },
];
