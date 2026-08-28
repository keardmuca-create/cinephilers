// Start the dev server against the seeded TEST database.
//
// `npm run dev` reads .env.local, which points DATABASE_URL at production — so
// the ordinary dev server is a live client, and every click in it changes real
// members' data. This wrapper puts the test database into the environment first
// and then hands off to Next.
//
// It works because @next/env does not overwrite variables that are already set:
// what this sets wins over .env.local, while the REST of .env.local still loads
// normally. That last part matters — the JWT secrets have to be the same ones
// the app would normally use, or the sessions minted for the seeded users would
// not be accepted by the very server we are testing.
//
//   npx tsx scripts/dev-test.ts
//
import { spawn } from 'node:child_process';
import path from 'node:path';
import { readTestEnv } from '../src/lib/test-db-guard';

const env = readTestEnv();
const host = new URL(env.DIRECT_URL).host;

console.log(`\n  Dev server pointed at the TEST database: ${host}`);
console.log('  Production is NOT connected. Nothing here touches real users.\n');

const root = path.resolve(__dirname, '..');
// Spawn node against Next's own bin rather than npx: on Windows, spawning a
// .cmd without a shell fails with EINVAL, and going through a shell would mean
// quoting a path that contains spaces.
const child = spawn(
  process.execPath,
  [require.resolve('next/dist/bin/next'), 'dev', '--turbopack', '-p', '9003'],
  {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: env.DATABASE_URL, DIRECT_URL: env.DIRECT_URL },
  },
);
child.on('exit', code => process.exit(code ?? 0));
