const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  // 1) Add new column voidedById (SQLite: try/catch because no IF NOT EXISTS)
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Order" ADD COLUMN voidedById INTEGER;`);
    console.log("Added column voidedById");
  } catch (e) {
  }

  // 2) Copy old voidedBy into voidedById
  const updated = await prisma.$executeRawUnsafe(`
    UPDATE "Order"
    SET voidedById = CAST(voidedBy AS INTEGER)
    WHERE voidedBy IS NOT NULL AND voidedById IS NULL;
  `);

  // 3) Show proof
  const rows = await prisma.$queryRawUnsafe(`
    SELECT id, voidedBy, voidedById
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