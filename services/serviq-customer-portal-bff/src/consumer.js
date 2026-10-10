// Standalone projector process (matches compose `-consumer` convention —
// read-model writes never share the API process).
import { startProjector } from './projector.js'
startProjector().catch((e) => { console.error(e); process.exit(1) })
