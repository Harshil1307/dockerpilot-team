import { AppError } from '../errors/app-error.js';

const HUB_API = 'https://hub.docker.com/v2';
const REGISTRY_API = 'https://registry-1.docker.io/v2';
const AUTH_API = 'https://auth.docker.io/token';
const COMPONENT = '[a-z0-9]+(?:[._-][a-z0-9]+)*';
const REPOSITORY = new RegExp(`^${COMPONENT}(?:/${COMPONENT})?$`);

export interface DockerHubTag {
  name: string;
}

export interface DockerHubRepository {
  namespace: string;
  repository: string;
  url: string;
  description: string;
  pullCount: number;
  starCount: number;
  lastUpdated: string | null;
  tags: DockerHubTag[];
}

interface DockerHubRepositoryResponse {
  namespace?: string;
  name?: string;
  description?: string;
  is_private?: boolean;
  pull_count?: number;
  star_count?: number;
  last_updated?: string | null;
}

interface RegistryTokenResponse {
  token?: string;
  access_token?: string;
}

interface RegistryTagsResponse {
  tags?: string[] | null;
}

export function parseDockerHubUrl(value: unknown): { namespace: string; repository: string; url: string } {
  if (typeof value !== 'string' || value.length > 2048) {
    throw new AppError('Enter a public Docker Hub repository URL.', 400, 'INVALID_DOCKER_HUB_URL');
  }
  let url: URL;
  try { url = new URL(value.trim()); }
  catch { throw new AppError('Enter a Docker Hub repository URL, such as https://hub.docker.com/r/traefik/whoami.', 400, 'INVALID_DOCKER_HUB_URL'); }
  const parts = url.pathname.split('/').filter(Boolean);
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'hub.docker.com' || url.username || url.password || url.search || url.hash || parts[0] !== 'r' || parts.length < 3) {
    throw new AppError('Use a public Docker Hub repository URL in the form https://hub.docker.com/r/namespace/repository.', 400, 'INVALID_DOCKER_HUB_URL');
  }
  const namespace = parts[1]?.toLowerCase() ?? '';
  const repository = parts[2]?.toLowerCase() ?? '';
  if (!REPOSITORY.test(namespace) || namespace.includes('/') || !REPOSITORY.test(repository) || repository.includes('/')) {
    throw new AppError('The Docker Hub namespace or repository name is invalid.', 400, 'INVALID_DOCKER_HUB_URL');
  }
  const canonical = `https://hub.docker.com/r/${namespace}/${repository}`;
  return { namespace, repository, url: canonical };
}

async function fetchJson<T>(url: string, headers?: Record<string, string>): Promise<T> {
  let response: Response;
  try { response = await fetch(url, { headers, signal: AbortSignal.timeout(8_000) }); }
  catch { throw new AppError('Docker Hub could not be reached. Check your internet connection and try again.', 502, 'DOCKER_HUB_UNAVAILABLE'); }
  if (!response.ok) {
    if (response.status === 404) throw new AppError('That public Docker Hub repository could not be found.', 404, 'DOCKER_HUB_NOT_FOUND');
    if (response.status === 401 || response.status === 403) throw new AppError('This Docker Hub repository is private or does not allow public access.', 403, 'DOCKER_HUB_PRIVATE');
    throw new AppError('Docker Hub could not return this repository. Try again in a moment.', 502, 'DOCKER_HUB_REQUEST_FAILED');
  }
  try { return await response.json() as T; }
  catch { throw new AppError('Docker Hub returned an unreadable repository response.', 502, 'DOCKER_HUB_INVALID_RESPONSE'); }
}

async function listPublicTags(imageName: string): Promise<string[]> {
  const tokenUrl = new URL(AUTH_API);
  tokenUrl.searchParams.set('service', 'registry.docker.io');
  tokenUrl.searchParams.set('scope', `repository:${imageName}:pull`);
  const token = await fetchJson<RegistryTokenResponse>(tokenUrl.toString());
  const bearer = token.token ?? token.access_token;
  if (!bearer) throw new AppError('Docker Hub did not provide public image access.', 502, 'DOCKER_HUB_AUTH_FAILED');
  const result = await fetchJson<RegistryTagsResponse>(`${REGISTRY_API}/${imageName}/tags/list?n=100`, { Authorization: `Bearer ${bearer}` });
  return (result.tags ?? []).filter((tag) => /^[\w][\w.-]{0,127}$/.test(tag)).sort((a, b) => {
    if (a === 'latest') return -1;
    if (b === 'latest') return 1;
    return b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' });
  }).slice(0, 50);
}

export const dockerHubService = {
  async inspect(url: unknown): Promise<DockerHubRepository> {
    const identity = parseDockerHubUrl(url);
    const info = await fetchJson<DockerHubRepositoryResponse>(`${HUB_API}/namespaces/${encodeURIComponent(identity.namespace)}/repositories/${encodeURIComponent(identity.repository)}`);
    if (info.is_private === true) throw new AppError('This Docker Hub repository is private. Connect a public repository to import it.', 403, 'DOCKER_HUB_PRIVATE');
    const imageName = `${identity.namespace}/${identity.repository}`;
    const tags = await listPublicTags(imageName);
    return {
      ...identity,
      description: info.description ?? '',
      pullCount: Number.isFinite(info.pull_count) ? info.pull_count! : 0,
      starCount: Number.isFinite(info.star_count) ? info.star_count! : 0,
      lastUpdated: info.last_updated ?? null,
      tags: tags.map((name) => ({ name })),
    };
  },
};
