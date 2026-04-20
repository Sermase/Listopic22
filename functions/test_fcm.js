const admin = require('firebase-admin');
admin.initializeApp({ projectId: "listopic" });
const db = admin.firestore();

async function checkTokens() {
  const users = await db.collection('users').get();
  let found = 0;
  for (const doc of users.docs) {
    const tokens = await doc.ref.collection('fcmTokens').get();
    if (!tokens.empty) {
      console.log(`User ${doc.id} | ${doc.data().email} has ${tokens.size} tokens`);
      tokens.forEach(t => console.log('Token:', t.data().token));
      found++;
    }
  }
  console.log(`Done checking tokens. Found ${found} users with tokens.`);
  process.exit(0);
}
checkTokens().catch(console.error);
