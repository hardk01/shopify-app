import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Delete all sessions
  const deleted = await prisma.session.deleteMany({});
  console.log(`Deleted ${deleted.count} sessions`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 