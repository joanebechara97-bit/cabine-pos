const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  // keep your InvoiceCounter seed if you already have it
  await prisma.invoiceCounter.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, lastNo: 0 },
  });

  const adminPassword = process.env.ADMIN_PASSWORD || 'password';
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  await prisma.user.upsert({
    where: { username: 'admin' },
    update: { passwordHash, role: 'ADMIN', isActive: true },
    create: {
      username: 'admin',
      passwordHash,
      role: 'ADMIN',
      isActive: true,
      permissionsJson: '{}',
    },
  });

  console.log('Seeded: InvoiceCounter + admin user');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());