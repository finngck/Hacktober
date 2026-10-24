import { execFileSync } from 'node:child_process';
import { repositoryUrl, type BuildInfo } from '../shared/versions.ts';

const git = (args: string[]) => {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
};

export function getBuildInfo(): BuildInfo {
  return {
    version: '0.1.0',
    commit: process.env.VERCEL_GIT_COMMIT_SHA || git(['rev-parse', 'HEAD']),
    branch: process.env.VERCEL_GIT_COMMIT_REF || git(['branch', '--show-current']),
    builtAt: new Date().toISOString(),
    environment: process.env.VERCEL_ENV || 'local',
    dirty: !process.env.VERCEL && Boolean(git(['status', '--porcelain'])),
    repository: repositoryUrl,
  };
}
