const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  // Add new columns if missing (SQLite doesn't support IF NOT EXISTS for columns)
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Order" ADD COLUMN voidedById INTEGER;`);
    console.log("Added voidedById");
  } catch { console.log("voidedById already exists (or can't add), continuing..."); }

  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Order" ADD COLUMN voidedByName TEXT;`);
    console.log("Added voidedByName");
  } catch { console.log("voidedByName already exists (or can't add), continuing..."); }

  // Copy numeric value to voidedById
  const u1 = await prisma.$executeRawUnsafe(`
    UPDATE "Order"
    SET voidedById = CAST(voidedBy AS INTEGER)
    WHERE voidedBy IS NOT NULL AND voidedById IS NULL;
  `);

  // Also keep a readable copy in voidedByName (optional but useful)
  const u2 = await prisma.$executeRawUnsafe(`
    UPDATE "Order"
    SET voidedByName = CAST(voidedBy AS TEXT)
    WHERE voidedBy IS NOT NULL AND (voidedByName IS NULL OR voidedByName = '');
  `);

  console.log("Updated rows (voidedById):", u1);
  console.log("Updated rows (voidedByName):", u2);

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