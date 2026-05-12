/**
 * @fileoverview Primary author and special contributors for The Forge (see AUTHORS.md at repo root).
 * Avatar URLs resolved from GitHub public profiles.
 */

export type ContributorRole = "primary" | "special";

export interface ForgeContributor {
  /** Stable key for React lists */
  id: string;
  /** Display name (from AUTHORS.md) */
  displayName: string;
  role: ContributorRole;
  /** GitHub username */
  githubLogin: string;
  /** Profile image from GitHub */
  avatarUrl: string;
}

/**
 * Public GitHub repository URL for the footer “Código en GitHub” link.
 * Set `VITE_FORGE_GITHUB_REPO_URL` in `.env` when the repo is published.
 */
export const FORGE_GITHUB_REPO_URL: string = (
  import.meta.env.VITE_FORGE_GITHUB_REPO_URL as string | undefined
)?.trim() || "https://github.com/kreodevs/theforge";

const APACHE_LICENSE_URL = "https://www.apache.org/licenses/LICENSE-2.0";

export const FORGE_LICENSE_URL = APACHE_LICENSE_URL;

/** Ordered for footer avatar strip: primary first, then special contributors (AUTHORS.md order). */
export const FORGE_CONTRIBUTORS: readonly ForgeContributor[] = [
  {
    id: "jorge-correa",
    displayName: "Jorge Correa",
    role: "primary",
    githubLogin: "kreodevs",
    avatarUrl: "https://avatars.githubusercontent.com/u/117201035?v=4",
  },
  {
    id: "maria-gregoria-ayala",
    displayName: "Maria Gregoria Ayala",
    role: "special",
    githubLogin: "MariaGregoria",
    avatarUrl: "https://avatars.githubusercontent.com/u/151894338?v=4",
  },
  {
    id: "gerardo-olaf-ruvalcaba",
    displayName: "Gerardo Olaf Ruvalcaba",
    role: "special",
    githubLogin: "OlafRuv",
    avatarUrl: "https://avatars.githubusercontent.com/u/62526919?v=4",
  },
  {
    id: "ricardo-mundo",
    displayName: "Ricardo Mundo",
    role: "special",
    githubLogin: "rikimundo-dev",
    avatarUrl: "https://avatars.githubusercontent.com/u/236944345?v=4",
  },
  {
    id: "luis-octavio-lara",
    displayName: "Luis Octavio Lara",
    role: "special",
    githubLogin: "srluislara",
    avatarUrl: "https://avatars.githubusercontent.com/u/267782015?v=4",
  },
  {
    id: "oscar-rubio-sevilla",
    displayName: "Oscar Rubio",
    role: "special",
    githubLogin: "OscarRubioSevilla",
    avatarUrl: "https://avatars.githubusercontent.com/u/86269228?v=4",
  },
  {
    id: "zeferino-martinez",
    displayName: "Zeferino Martínez",
    role: "special",
    githubLogin: "zefedev",
    avatarUrl: "https://avatars.githubusercontent.com/u/189145036?v=4",
  },
  {
    id: "andre-martin-garcia",
    displayName: "André Martin García",
    role: "special",
    githubLogin: "andremartingarcialopez",
    avatarUrl: "https://avatars.githubusercontent.com/u/47006913?v=4",
  },
  {
    id: "rene-dario-carrillo",
    displayName: "René Darío Carrillo",
    role: "special",
    githubLogin: "rexdariodeveloper",
    avatarUrl: "https://avatars.githubusercontent.com/u/55457057?v=4",
  },
  {
    id: "israel-alejandro-loera",
    displayName: "Israel Alejandro Loera",
    role: "special",
    githubLogin: "IsraelAlejandro23",
    avatarUrl: "https://avatars.githubusercontent.com/u/30471402?v=4",
  },
] as const;

export function getContributorRoleLabel(role: ContributorRole): string {
  if (role === "primary") return "Autor principal";
  return "Colaborador especial";
}

export function getGitHubProfileUrl(login: string): string {
  return `https://github.com/${login}`;
}
