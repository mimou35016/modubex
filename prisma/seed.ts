import { PrismaClient } from "@prisma/client";
import { logger } from "../src/core/logging/logger";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  await prisma.$connect();
  // M0 seeds no domain data. M1 adds the first Owner here.
  logger.info("Foundation seed complete", { milestone: "M0", records: 0 });
}

main()
  .catch((error: unknown) => {
    logger.error("Foundation seed failed", {
      milestone: "M0",
      error: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
