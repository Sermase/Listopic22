// Diagnóstico de solo lectura de Pachote (cuentas y grupos). No imprime emails ni nombres completos.
const admin=require('firebase-admin');admin.initializeApp({credential:admin.credential.applicationDefault(),projectId:'listopic'});
const db=admin.firestore(),auth=admin.auth();const cut=s=>String(s||'').slice(0,6);
const mask=e=>e?e.replace(/^(.).*(@.*)$/,'$1***$2'):'';
const who=async u=>{try{const r=await auth.getUser(u);const pv=r.providerData.map(p=>p.providerId.replace('.com','')).join('+')||'anónimo';return `${pv} ${mask(r.email)} ${r.displayName?r.displayName[0]+'.':''}`}catch(e){return 'sin usuario Auth'}};
(async()=>{
  const gs=await db.collection('pachoteGroups').get();const target=gs.docs.filter(d=>/ria/i.test(String(d.data().name||'')));
  const usersSnap=await db.collection('pachoteUsers').get();const users=usersSnap.docs;
  console.log(`grupos: ${gs.size} · usuarios Pachote: ${users.length} · grupos «ria…»: ${target.length}`);
  for(const g of target){const c=g.data();
    console.log(`\nGRUPO ${cut(g.id)} «${c.name}» cerrado:${!!c.closed} owner:${cut(c.owner)} chat:${c.chatId?'sí':'no'} needAccount:${!!c.needAccount} allAdmin:${!!c.allAdmin} personas:${(c.members||[]).length}`);
    const acc=await g.ref.collection('access').get();const accIds=new Set(acc.docs.map(d=>d.id));
    for(const a of acc.docs){const x=a.data();const u=users.find(d=>d.id===a.id);const inList=!!(u&&u.data().groups&&u.data().groups[g.id]);
      console.log(` acceso uid:${cut(a.id)} rol:${x.role} persona:${cut(x.memberId)} entró:${new Date(x.joined||0).toISOString().slice(0,16)} en-su-lista:${inList?'sí':'NO'} · ${await who(a.id)}`)}
    const orphans=users.filter(d=>d.data().groups&&d.data().groups[g.id]&&!accIds.has(d.id));
    for(const o of orphans)console.log(` LISTA SIN ACCESO uid:${cut(o.id)} · ${await who(o.id)}`);
  }
  // Cuentas reales con grupos: cuántos y cuántos sin acceso
  console.log('\nCUENTAS CON CUENTA (no anónimas) y sus grupos:');
  for(const u of users){let w;try{const r=await auth.getUser(u.id);if(!r.providerData.length)continue;w=`${r.providerData.map(p=>p.providerId.replace('.com','')).join('+')} ${mask(r.email)}`}catch(e){continue}
    const gids=Object.keys(u.data().groups||{});let noacc=0;for(const gid of gids){const a=await db.doc(`pachoteGroups/${gid}/access/${u.id}`).get();if(!a.exists)noacc++}
    console.log(` uid:${cut(u.id)} ${w} grupos:${gids.length} sin-acceso:${noacc} perfil:${u.data().profile&&u.data().profile.name?u.data().profile.name[0]+'.':'-'}`)}
  console.log('\nTODOS LOS GRUPOS:');
  for(const g of gs.docs){const c=g.data();const acc=await g.ref.collection('access').get();const movs=await g.ref.collection('movs').count().get();
    const rows=[];for(const a of acc.docs){const u=users.find(d=>d.id===a.id);rows.push(`${cut(a.id)}:${a.data().role}${u&&u.data().groups&&u.data().groups[g.id]?'':'(NO en lista)'}`)}
    console.log(` ${cut(g.id)} «${String(c.name||'').slice(0,20)}» cerrado:${!!c.closed} movs:${movs.data().count} accesos: ${rows.join(' ')}`)}
  console.log('\nLISTAS DE CADA USUARIO:');
  for(const u of users){const gids=Object.keys(u.data().groups||{});const rows=[];for(const gid of gids){const ex=(await db.doc(`pachoteGroups/${gid}`).get()).exists;const a=(await db.doc(`pachoteGroups/${gid}/access/${u.id}`).get()).exists;rows.push(`${cut(gid)}${ex?'':'(grupo NO existe)'}${a?'':'(SIN acceso)'}`)}
    console.log(` ${cut(u.id)} → ${rows.join(' ')||'(vacía)'}`)}
})().catch(e=>{console.error('ERROR',e.code||'',e.message);process.exit(1)});
