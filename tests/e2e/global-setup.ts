import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { PrismaClient } from '@prisma/client';
import { encode } from 'next-auth/jwt';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

async function seedUserSession(params: {
  email: string;
  name: string;
  role: 'USER' | 'ADMIN';
  outputFile: string;
}) {
  const user = await prisma.user.upsert({
    where: { email: params.email },
    update: { name: params.name, role: params.role },
    create: { email: params.email, username: params.email.split("@")[0].replace(/[^a-z0-9_]/gi, "").toLowerCase(), name: params.name, displayName: params.name, role: params.role },
  });

  const sessionToken = await encode({
    token: {
      sub: user.id,
      email: user.email,
      name: user.name ?? '',
      role: user.role,
    },
    secret:
      process.env.NEXTAUTH_SECRET
      ?? process.env.AUTH_SECRET
      ?? 'ci-e2e-auth-secret',
    salt: 'next-auth.session-token',
    maxAge: 30 * 24 * 60 * 60,
  });

  const outputPath = resolve(params.outputFile);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    JSON.stringify({ sessionToken, userId: user.id }, null, 2),
    'utf8',
  );
}

export default async function globalSetup() {
  try {
    await seedUserSession({
      email: 'e2e-user@test.local',
      name: 'E2E User',
      role: 'USER',
      outputFile: 'tests/e2e/.auth/user.json',
    });

    await seedUserSession({
      email: 'e2e-admin@test.local',
      name: 'E2E Admin',
      role: 'ADMIN',
      outputFile: 'tests/e2e/.auth/admin.json',
    });
  } finally {
    await prisma.$disconnect();
  }
}
