import { dataSource, ensureSchema } from './db';
import { OutboxRelay } from './outbox';
import { EventsConsumer } from './events';
import { connectReadModel } from './readmodel';

// Dedicated consumer container (ADR-0011): same image + env as the API,
// runs the outbox relay loop plus the events consumer — no HTTP listener.
async function bootstrap() {
  await ensureSchema();
  await dataSource.initialize();
  await connectReadModel();
  void new OutboxRelay().run().catch((e) => { console.error(`relay died: ${e}`); process.exit(1); });
  await new EventsConsumer().run().catch((e) => { console.error(`consumer died: ${e}`); process.exit(1); });
}
void bootstrap();
