import "dotenv/config";
import { PrismaClient } from "@prisma/client";

// Instancia única de Prisma Client
// MariaDB es compatible con el driver de MySQL de Prisma
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' 
    ? ['query', 'info', 'warn', 'error'] 
    : ['error']
});

// Función para conectar
const connectDatabase = async (): Promise<void> => {
  try {
    await prisma.$connect();
    console.log('✅ MariaDB connected successfully');
    console.log(`📊 Database: ${process.env.DATABASE_NAME || 'instituto_db'}`);
  } catch (error) {
    console.error('❌ MariaDB connection error:', error);
    process.exit(1);
  }
};

// Función para desconectar
const disconnectDatabase = async (): Promise<void> => {
  await prisma.$disconnect();
  console.log('MariaDB disconnected');
};

export { prisma, connectDatabase, disconnectDatabase };