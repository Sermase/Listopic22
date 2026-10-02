const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
initializeApp({ projectId: "listopic" });
const db = getFirestore();

async function checkTokens() {
  const users = await db.collection('users').get();
  let found = 0;
  let tokenCount = 0;
  for (const doc of users.docs) {
    const tokens = await doc.ref.collection('fcmTokens').get();
    if (!tokens.empty) {
      tokenCount += tokens.size;
      found++;
    }
  }
  console.log(`Done checking tokens. Found ${found} users with ${tokenCount} total tokens.`);
  process.exit(0);
}
checkTokens().catch(error => {
  console.error('Error checking FCM tokens:', error.message || String(error));
  process.exit(1);
});
