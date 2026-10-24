import { versionsSchema, repositoryUrl, type Versions } from '../shared/versions.js';

const apiRoot = 'https://api.github.com/repos/finngck/Hacktober';
let cached: { expires: number; value: Versions } | undefined;

export async function getVersions(fetcher: typeof fetch = fetch): Promise<Versions> {
  if (fetcher === fetch && cached && cached.expires > Date.now()) return cached.value;
  const get = async (path: string) => {
    const response = await fetcher(apiRoot + path, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Daylight-Version-Panel' },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) throw new Error('Versionsverlauf nicht verfügbar.');
    return response.json();
  };
  try {
    const [commits, deployments] = await Promise.all([
      get('/commits?per_page=5'),
      get('/deployments?per_page=5'),
    ]);
    const previews = await Promise.all(
      deployments
        .filter((entry: { id?: unknown }) => Number.isInteger(entry.id))
        .map(
          async (entry: { id: number; sha: string; environment: string; created_at: string }) => {
            try {
              const statuses = await get(`/deployments/${entry.id}/statuses?per_page=1`);
              const status = statuses[0];
              if (!status || !['success', 'inactive'].includes(status.state)) return null;
              const target = new URL(status.environment_url);
              if (
                target.protocol !== 'https:' ||
                !target.hostname.endsWith('.vercel.app') ||
                target.search ||
                target.username ||
                target.password
              )
                return null;
              return {
                id: entry.id,
                sha: entry.sha,
                environment: entry.environment,
                url: target.href,
                date: entry.created_at,
              };
            } catch {
              return null;
            }
          },
        ),
    );
    const value = versionsSchema.parse({
      commits: commits
        .filter(
          (entry: { sha?: unknown }) =>
            typeof entry.sha === 'string' && /^[a-f0-9]{40}$/.test(entry.sha),
        )
        .map(
          (entry: { sha: string; commit: { message: string; committer: { date: string } } }) => ({
            sha: entry.sha,
            message: entry.commit.message.split('\n')[0].slice(0, 140),
            url: `${repositoryUrl}/commit/${entry.sha}`,
            date: entry.commit.committer.date,
          }),
        ),
      deployments: previews.filter(Boolean),
      available: true,
    });
    if (fetcher === fetch) cached = { expires: Date.now() + 60000, value };
    return value;
  } catch {
    return { commits: [], deployments: [], available: false };
  }
}
