import { dataSource, ensureSchema } from './db';
import { createApp } from './app';
import { connectReadModel } from './readmodel';

async function bootstrap() {
  await ensureSchema();
  await dataSource.initialize();
  await connectReadModel();
  console.log('database connected');

  const port = Number(process.env.PORT || 3000);
  createApp().listen(port, () => {
    console.log(`customer-support-backend listening on :${port}`);
  });
}
void bootstrap();
