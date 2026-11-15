// Reparación puntual: Riaño en las dos cuentas de Ser (administrador en ambas, como «Ser»).
const admin=require('firebase-admin');admin.initializeApp({credential:admin.credential.applicationDefault(),projectId:'listopic'});
const db=admin.firestore();const cut=s=>String(s||'').slice(0,6);
(async()=>{
  const gs=(await db.collection('pachoteGroups').get()).docs.filter(d=>d.id.startsWith('mvb9ni'));if(gs.length!==1)throw new Error('grupo no único');
  const g=gs[0];const users=(await db.collection('pachoteUsers').get()).docs;
  const acc=(await g.ref.collection('access').get()).docs;const ref=acc.find(d=>d.id.startsWith('vsJ59r')).data();
  for(const pre of ['vsJ59r','w4cCQo']){const u=users.find(d=>d.id.startsWith(pre));if(!u)throw new Error('sin usuario '+pre);
    const a=g.ref.collection('access').doc(u.id);const cur=(await a.get()).data();
    await a.set({role:'admin',memberId:(cur&&cur.memberId)||ref.memberId||null,joined:(cur&&cur.joined)||Date.now(),label:(cur&&cur.label)||'reparado a mano'},{merge:true});
    await u.ref.set({groups:{[g.id]:{joined:Date.now()}}},{merge:true});
    console.log(`uid:${cut(u.id)} → administrador en ${cut(g.id)} y en su lista`)}
})().catch(e=>{console.error('ERROR',e.code||'',e.message);process.exit(1)});
