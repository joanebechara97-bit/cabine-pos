const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const business = await prisma.business.upsert({
    where: { id: 'default-business' },
    update: {},
    create: {
      id: 'default-business',
      name: 'Default Business',
    },
  });

  await prisma.user.updateMany({
    where: { businessId: null },
    data: { businessId: business.id },
  });

  await prisma.item.updateMany({
    where: { businessId: null },
    data: { businessId: business.id },
  });

  await prisma.order.updateMany({
    where: { businessId: null },
    data: { businessId: business.id },
  });

  await prisma.invoiceCounter.updateMany({
    where: { businessId: null },
    data: { businessId: business.id },
  });

  await prisma.auditLog.updateMany({
    where: { businessId: null },
    data: { businessId: business.id },
  });

  await prisma.license.updateMany({
    where: { businessId: null },
    data: { businessId: business.id },
  });

  console.log('✅ Backfill complete. Business ID:', business.id);
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });