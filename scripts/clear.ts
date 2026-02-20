import { loadEnvConfig } from '@next/env';
import { Pinecone } from '@pinecone-database/pinecone';

// Load the local .env variables into the Node.js context natively
const projectDir = process.cwd();
loadEnvConfig(projectDir);

async function clearIndex() {
    console.log('🧹 Starting cleanup process...');

    const pineconeApiKey = process.env.PINECONE_API_KEY;
    const indexName = process.env.PINECONE_INDEX_NAME;

    if (!pineconeApiKey || !indexName) {
        throw new Error('❌ Missing Pinecone API Key or Index Name in environment variables');
    }

    console.log('🌲 Connecting to Pinecone vector database...');
    const pinecone = new Pinecone({
        apiKey: pineconeApiKey,
    });

    const pineconeIndex = pinecone.index(indexName);

    console.log(`🗑️  Deleting all vectors from index "${indexName}"...`);

    // Try to delete all items inside the index
    try {
        await pineconeIndex.deleteAll();
        console.log('✅ Index cleared successfully!');
    } catch (err) {
        console.error('❌ Error clearing index. You might need to delete them by ID or from the Pinecone dashboard.', err);
    }
}

clearIndex().catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
});
