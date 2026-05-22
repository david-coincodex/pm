const TOKEN = '41570487f53271b27133d8429adfa9b535df73bf6e6b84bffab2a61a418e293a72d3bdd95b600aa257d65b16416335aad9362065db75ba22a12e374109d87eeed50be6e9d2d9592924be3b7ee2811441fe311d572ca85f8f3ed0eb5843a87f43f8b706baa683d1bd58b5382af047efe596afe82d8d738d59ff01f5961b48ad40';
const BASE = 'http://127.0.0.1:1339/api';
const h = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN };

// Fetch site documentIds by slug
async function getSiteDocId(slug) {
  const r = await fetch(`${BASE}/sites?filters[slug][$eq]=${slug}`);
  const d = await r.json();
  return d.data?.[0]?.documentId ?? null;
}

const bundles = [
  {
    name: 'The Ultimate Brazzers & Network Pack',
    slug: 'ultimate-brazzers-network-pack',
    description: 'Brazzers, BangBros, and Mofos — three powerhouse networks for one massive library of scenes.',
    sites: ['brazzers', 'bangbros', 'mofos'],
  },
  {
    name: 'Gonzo & Kink Starter Pack',
    slug: 'gonzo-kink-starter-pack',
    description: 'Evil Angel, Kink, and HardX bring raw, unscripted adult entertainment at its most intense.',
    sites: ['evil-angel', 'kink', 'hardx'],
  },
  {
    name: 'Cinematic Porn Collection',
    slug: 'cinematic-porn-collection',
    description: 'Wicked, Digital Playground, and Jules Jordan — where production value meets explicit content.',
    sites: ['wicked', 'digital-playground', 'jules-jordan'],
  },
  {
    name: 'Diversity & Niche Bundle',
    slug: 'diversity-niche-bundle',
    description: 'Blacked, DarkX, and Tushy cover a wide range of premium niche content under one roof.',
    sites: ['blacked', 'darkx', 'tushy'],
  },
  {
    name: 'Couples & Romance Pack',
    slug: 'couples-romance-pack',
    description: 'Vixen, Babes, and SexArt deliver tasteful, couple-friendly erotica with stunning cinematography.',
    sites: ['vixen', 'babes', 'sexart'],
  },
  {
    name: 'MILF Madness Bundle',
    slug: 'milf-madness-bundle',
    description: 'MYLF, Naughty America, and Team Skeet — the best sites for mature content fans.',
    sites: ['mylf', 'naughty-america', 'team-skeet'],
  },
  {
    name: 'Fine Art Erotica Bundle',
    slug: 'fine-art-erotica-bundle',
    description: 'MetArt, SexArt, and Twistys — softcore and erotic photography at the highest artistic standard.',
    sites: ['metart', 'sexart', 'twistys'],
  },
  {
    name: 'All-in-One Paysite Mega Bundle',
    slug: 'all-in-one-paysite-mega-bundle',
    description: 'Reality Kings, FakeHub, Adult Time — three networks with thousands of scenes between them.',
    sites: ['reality-kings', 'fakehub', 'adult-time'],
  },
  {
    name: 'Streaming & On-Demand Pack',
    slug: 'streaming-on-demand-pack',
    description: 'Adult Time and Pornhub Premium offer unlimited streaming libraries for power users.',
    sites: ['adult-time', 'pornhub'],
  },
  {
    name: 'Live Cam Starter Bundle',
    slug: 'live-cam-starter-bundle',
    description: 'Get started on IMLive with a credit pack discount — ideal for first-time cam site users.',
    sites: ['imlive'],
  },
  {
    name: 'Gonzo Legends Bundle',
    slug: 'gonzo-legends-bundle',
    description: 'Jules Jordan, Evil Angel, and DarkX — the names behind some of the most acclaimed adult films.',
    sites: ['jules-jordan', 'evil-angel', 'darkx'],
  },
  {
    name: 'Blockbuster Discount Pack',
    slug: 'blockbuster-discount-pack',
    description: 'Brazzers, Reality Kings, and Naughty America — three of the most recognisable names in adult entertainment.',
    sites: ['brazzers', 'reality-kings', 'naughty-america'],
  },
];

async function run() {
  // Pre-fetch all site doc IDs
  const siteDocIds = {};
  const allSiteSlugs = [...new Set(bundles.flatMap((b) => b.sites))];
  for (const slug of allSiteSlugs) {
    siteDocIds[slug] = await getSiteDocId(slug);
  }

  for (const bundle of bundles) {
    const siteIds = bundle.sites
      .map((s) => siteDocIds[s])
      .filter(Boolean);

    const res = await fetch(`${BASE}/bundles`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({
        data: {
          name: bundle.name,
          slug: bundle.slug,
          description: bundle.description,
          sites: siteIds,
          publishedAt: new Date().toISOString(),
        },
      }),
    });
    const j = await res.json();
    console.log(res.ok ? 'Created:' : 'FAIL:', bundle.name, !res.ok ? JSON.stringify(j).slice(0, 80) : '');
  }
  console.log('Done.');
}
run().catch(console.error);
