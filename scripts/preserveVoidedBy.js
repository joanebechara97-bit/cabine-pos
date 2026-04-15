const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Order" ADD COLUMN voidedById INTEGER;`);
  } catch (e) {
    // ignore if exists
  }

  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Order" ADD COLUMN voidedByName TEXT;`);
  } catch (e) {
    // ignore if exists
  }

  const u1 = await prisma.$executeRawUnsafe(`
    UPDATE "Order"
    SET voidedById = CAST(voidedBy AS INTEGER)
    WHERE voidedBy IS NOT NULL AND voidedById IS NULL;
  `);

  const u2 = await prisma.$executeRawUnsafe(`
    UPDATE "Order"
    SET voidedByName = CAST(voidedBy AS TEXT)
    WHERE voidedBy IS NOT NULL AND (voidedByName IS NULL OR voidedByName = '');
  `);

  const rows = await prisma.$queryRawUnsafe(`
    SELECT id, voidedBy, voidedById, voidedByName
    FROM "Order"
    WHERE voidedBy IS NOT NULL
    ORDER BY id ASC;
  `);

  console.table(rows);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });