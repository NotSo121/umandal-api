const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.user.findUnique({ where: { username: 'admin' } });

  if (existing) {
    console.log('Admin user already exists, skipping.');
    return;
  }

  const hashedPassword = await bcrypt.hash('Admin@123', 10);

  const admin = await prisma.user.create({
    data: {
      username: 'admin',
      password: hashedPassword,
      role: 'ADMIN',
      isActive: true,
    },
  });

  console.log('Admin user created:', admin.username);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });