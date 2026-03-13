const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {

  const rows = await prisma.$queryRawUnsafe(`
    SELECT id, status, voidedBy, voidedAt, voidReason
    FROM "Order"
    WHERE voidedBy IS NOT NULL
  `);

  console.log("Rows with voidedBy:");
  console.table(rows);

}

main()
  .catch((e) => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });