import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as path from 'path';
import * as fs from 'fs';

const envPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../.env'),
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../../.env'),
];
for (const p of envPaths) {
  if (fs.existsSync(p) && typeof process.loadEnvFile === 'function') {
    try {
      process.loadEnvFile(p);
      break;
    } catch { }
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: '*',
    credentials: true,
  });

  const port = process.env.SERVER_PORT || 3001;
  await app.listen(port);
  console.log(`[NestJS Server] Game server listening on http://localhost:${port}`);
}
bootstrap();

