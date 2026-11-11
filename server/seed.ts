import { DATABASE_PROVIDER } from './runtimeConfig';

if (DATABASE_PROVIDER === 'postgres') {
  const { seedPostgres } = await import('./seedPostgres');
  await seedPostgres();
} else {
  await import('./seedSqlite');
}
