/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const { MONGODB_URI } = require('../src/config/env');
const { runIngestion } = require('../src/rag/ingestion/ingest');

async function main() {
  if (!MONGODB_URI) {
    console.error(
      '✗ MONGODB_URI is not set (see backend/.env.example). Knowledge ingestion needs a database to store chunks into.'
    );
    process.exitCode = 1;
    return;
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  console.log('Connected. Starting ingestion...\n');

  const result = await runIngestion({ onProgress: (msg) => console.log(msg) });

  console.log('\n--- Ingestion summary ---');
  console.log(`Source documents processed: ${result.documents}`);
  console.log(`Chunks upserted:            ${result.chunksUpserted}`);
  console.log(`Chunks skipped (errors):    ${result.chunksSkipped}`);
  if (result.failures.length) {
    console.log(`\n${result.failures.length} failure(s):`);
    result.failures.forEach((f) => console.log(`  - ${f.document}${f.chunkIndex !== undefined ? ` [chunk ${f.chunkIndex}]` : ''}: ${f.error}`));
  }

  await mongoose.disconnect();
  process.exitCode = result.failures.length ? 1 : 0;
}

main().catch((err) => {
  console.error(`✗ Ingestion failed: ${err.message}`);
  process.exitCode = 1;
});
