const TOKEN = '41570487f53271b27133d8429adfa9b535df73bf6e6b84bffab2a61a418e293a72d3bdd95b600aa257d65b16416335aad9362065db75ba22a12e374109d87eeed50be6e9d2d9592924be3b7ee2811441fe311d572ca85f8f3ed0eb5843a87f43f8b706baa683d1bd58b5382af047efe596afe82d8d738d59ff01f5961b48ad40';
const BASE = 'http://127.0.0.1:1339/api';
const h = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN };

async function fixCamSlug() {
  const r = await fetch(BASE + '/categories');
  const d = await r.json();
  const cam = d.data.find(c => c.slug === 'cam');
  if (!cam) { console.log('cam already renamed or not found'); return; }
  const res = await fetch(BASE + '/categories/' + cam.documentId, {
    method: 'PUT', headers: h,
    body: JSON.stringify({ data: { name: 'Cam Sites', slug: 'cam-sites', description: 'The best live cam sites where you can watch and chat with real performers.' } })
  });
  const j = await res.json();
  console.log('Updated cam slug:', j.data?.slug ?? JSON.stringify(j).slice(0, 100));
}

fixCamSlug().catch(console.error);
