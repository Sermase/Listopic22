// Reparación: cada acceso que exista en un grupo vuelve a estar en la lista de grupos de su cuenta.
const admin=require('firebase-admin');admin.initializeApp({credential:admin.credential.applicationDefault(),projectId:'listopic'});
const db=admin.firestore();const cut=s=>String(s||'').slice(0,6);
(async()=>{
  const gs=await db.collection('pachoteGroups').get();
  for(const g of gs.docs){const acc=await g.ref.collection('access').get();
    for(const a of acc.docs){const u=db.doc(`pachoteUsers/${a.id}`);const cur=(await u.get()).data()||{};
      if(cur.groups&&cur.groups[g.id])continue;
      await u.set({groups:{[g.id]:{joined:a.data().joined||Date.now()}}},{merge:true});console.log(`añadido ${cut(g.id)} a la lista de ${cut(a.id)}`)}}
})().catch(e=>{console.error('ERROR',e.code||'',e.message);process.exit(1)});
