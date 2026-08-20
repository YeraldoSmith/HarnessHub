import 'dotenv/config'

import { defineConfig } from 'prisma/config'

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://harnesshub@127.0.0.1:54329/harnesshub?schema=public'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: databaseUrl,
  },
})
