#!/usr/bin/env node
/**
 * Import sites, offers, and subsites into Strapi.
 * Data sourced from porndeals.com.
 *
 * Usage:
 *   STRAPI_TOKEN=xxx node scripts/import-sites.mjs
 *
 * Or with admin credentials:
 *   STRAPI_ADMIN_EMAIL=admin@... STRAPI_ADMIN_PASSWORD=pass node scripts/import-sites.mjs
 *
 * Optional:
 *   STRAPI_URL=http://localhost:1339   (default)
 *   DRY_RUN=1                          skip Strapi writes, just print plan
 */

const STRAPI_URL = process.env.STRAPI_URL || 'http://localhost:1339';
const STRAPI_EMAIL = process.env.STRAPI_ADMIN_EMAIL;
const STRAPI_PASSWORD = process.env.STRAPI_ADMIN_PASSWORD;
const STRAPI_TOKEN = process.env.STRAPI_TOKEN;
const DRY_RUN = process.env.DRY_RUN === '1';

if (!DRY_RUN && !STRAPI_TOKEN && (!STRAPI_EMAIL || !STRAPI_PASSWORD)) {
  console.error('Error: provide STRAPI_TOKEN or both STRAPI_ADMIN_EMAIL + STRAPI_ADMIN_PASSWORD.');
  console.error('Use DRY_RUN=1 to print the plan without writing.');
  process.exit(1);
}

// ── Site data ──────────────────────────────────────────────────────────────────
//
// existingSlug: set for sites already in the DB — only subsites will be added.
// For new sites, all fields are required.

const SITES = [
  // ── EXISTING SITES — subsites only ──────────────────────────────────────────
  {
    existingSlug: 'bangbros',
    name: 'BangBros',
    subsites: [
      { name: 'Ass Parade',          slug: 'ass-parade' },
      { name: 'AvaSpice',            slug: 'avaspice' },
      { name: 'Back Room Facials',   slug: 'back-room-facials' },
      { name: 'Backroom MILF',       slug: 'backroom-milf' },
      { name: 'Ball Honeys',         slug: 'ball-honeys' },
      { name: 'Bang Bus',            slug: 'bang-bus' },
      { name: 'Bang Tryouts',        slug: 'bang-tryouts' },
      { name: 'BangBros 18',         slug: 'bangbros-18' },
      { name: 'BangBros Angels',     slug: 'bangbros-angels' },
      { name: 'Bangbros Clips',      slug: 'bangbros-clips' },
      { name: 'BangBros Remastered', slug: 'bangbros-remastered' },
      { name: 'Big Mouthfuls',       slug: 'big-mouthfuls' },
      { name: 'Big Tit Cream Pie',   slug: 'big-tit-cream-pie' },
      { name: 'Big Tits Round Asses',slug: 'big-tits-round-asses' },
      { name: 'Monsters Of Cock',    slug: 'monsters-of-cock' },
      { name: 'Tugjobs',             slug: 'tugjobs' },
      { name: 'Milf Soup',           slug: 'milf-soup' },
      { name: 'Milf Lessons',        slug: 'milf-lessons' },
      { name: 'Facial Fest',         slug: 'facial-fest' },
      { name: 'Blowjob Fridays',     slug: 'blowjob-fridays' },
      { name: 'Magical Feet',        slug: 'magical-feet' },
      { name: 'Fuck Team Five',      slug: 'fuck-team-five' },
      { name: 'Mr Anal',             slug: 'mr-anal' },
      { name: 'Brown Bunnies',       slug: 'brown-bunnies' },
      { name: 'Pornstar Spa',        slug: 'pornstar-spa' },
      { name: 'Party Of 3',          slug: 'party-of-3' },
      { name: 'Latina Rampage',      slug: 'latina-rampage' },
      { name: 'Pawg',                slug: 'pawg' },
      { name: 'Can He Score',        slug: 'can-he-score' },
      { name: 'Blowjob Ninjas',      slug: 'blowjob-ninjas' },
      { name: 'Glory Hole Loads',    slug: 'glory-hole-loads' },
      { name: 'Chongas',             slug: 'chongas' },
      { name: 'Mr Cameltoe',         slug: 'mr-cameltoe' },
      { name: 'Boob Squad',          slug: 'boob-squad' },
      { name: 'Dorm Invasion',       slug: 'dorm-invasion' },
      { name: 'Dirty World Tour',    slug: 'dirty-world-tour' },
      { name: 'Living With Anna',    slug: 'living-with-anna' },
      { name: 'Stepmom Videos',      slug: 'stepmom-videos' },
      { name: 'My Life In Brazil',   slug: 'my-life-in-brazil' },
      { name: 'Colombia Fuck Fest',  slug: 'colombia-fuck-fest' },
      { name: 'Casting',             slug: 'bb-casting' },
      { name: 'Slutty White Girls',  slug: 'slutty-white-girls' },
      { name: 'Bang POV',            slug: 'bang-pov' },
      { name: 'My Dirty Maid',       slug: 'my-dirty-maid' },
      { name: 'Newbie Black',        slug: 'newbie-black' },
      { name: 'Public Bang',         slug: 'public-bang' },
      { name: 'Bang Casting',        slug: 'bang-casting' },
      { name: 'Power Munch',         slug: 'power-munch' },
      { name: 'Working Latinas',     slug: 'working-latinas' },
      { name: 'Penny Show',          slug: 'penny-show' },
      { name: 'Mom Is Horny',        slug: 'mom-is-horny' },
      { name: 'Street Ranger',       slug: 'street-ranger' },
      { name: 'BangBros Vault',      slug: 'bangbros-vault' },
    ],
  },
  {
    existingSlug: 'brazzers',
    name: 'Brazzers',
    subsites: [
      { name: 'Brazzers Exxtra',      slug: 'brazzers-exxtra' },
      { name: "She's Gonna Squirt",   slug: 'shes-gonna-squirt' },
      { name: 'Dirty Masseur',        slug: 'dirty-masseur' },
      { name: 'ZZ Series',            slug: 'zz-series' },
      { name: 'Hot And Mean',         slug: 'hot-and-mean' },
      { name: 'Big Tits In Uniform',  slug: 'big-tits-in-uniform' },
      { name: 'Day With A Pornstar',  slug: 'day-with-a-pornstar' },
      { name: 'Teens Like It Black',  slug: 'teens-like-it-black' },
      { name: 'Brazzers Vault',       slug: 'brazzers-vault' },
      { name: 'Big Tits In Sports',   slug: 'big-tits-in-sports' },
      { name: 'Big Butts Like It Big',slug: 'big-butts-like-it-big' },
      { name: 'Real Wife Stories',    slug: 'real-wife-stories' },
      { name: 'Teens Like It Big',    slug: 'teens-like-it-big' },
      { name: 'Asses In Public',      slug: 'asses-in-public' },
      { name: 'Milfs Like It Big',    slug: 'milfs-like-it-big' },
      { name: 'Pornstars Like It Big',slug: 'pornstars-like-it-big' },
      { name: 'SexPro Adventures',    slug: 'sexpro-adventures' },
      { name: 'Big Tits At School',   slug: 'big-tits-at-school' },
      { name: 'Big Tits At Work',     slug: 'big-tits-at-work' },
      { name: 'Jug Fuckers',          slug: 'jug-fuckers' },
      { name: 'Racks And Blacks',     slug: 'racks-and-blacks' },
      { name: 'Mommy Got Boobs',      slug: 'mommy-got-boobs' },
      { name: 'Baby Got Boobs',       slug: 'baby-got-boobs' },
      { name: 'Big Wet Butts',        slug: 'big-wet-butts' },
      { name: 'Hot Chicks Big Asses', slug: 'hot-chicks-big-asses' },
      { name: 'Bustyz',               slug: 'bustyz' },
      { name: 'Doctor Adventures',    slug: 'doctor-adventures' },
      { name: 'Butts And Blacks',     slug: 'butts-and-blacks' },
      { name: 'Busty & Real',         slug: 'busty-real' },
      { name: 'Moms In Control',      slug: 'moms-in-control' },
      { name: 'Brazzers En Espanol',  slug: 'brazzers-en-espanol' },
      { name: 'CFNM',                 slug: 'brazzers-cfnm' },
      { name: 'Brazzers Live',        slug: 'brazzers-live' },
    ],
  },
  {
    existingSlug: 'mofos',
    name: 'Mofos',
    subsites: [
      { name: 'Public Pickups',   slug: 'public-pickups' },
      { name: 'I Know That Girl', slug: 'i-know-that-girl' },
      { name: "Let's Try Anal",   slug: 'lets-try-anal' },
      { name: 'Mofos B Side',     slug: 'mofos-b-side' },
      { name: 'Latina Sex Tapes', slug: 'mofos-latina-sex-tapes' },
      { name: "She's A Freak",    slug: 'shes-a-freak' },
      { name: 'Real Slut Party',  slug: 'real-slut-party' },
      { name: 'Pervs On Patrol',  slug: 'pervs-on-patrol' },
      { name: 'Stranded Teens',   slug: 'stranded-teens' },
      { name: "Don't Break Me",   slug: 'dont-break-me' },
      { name: 'Girls Gone Pink',  slug: 'girls-gone-pink' },
      { name: 'Share My BF',      slug: 'share-my-bf' },
      { name: 'Mofos Lab',        slug: 'mofos-lab' },
      { name: 'Ebony Sex Tapes',  slug: 'ebony-sex-tapes' },
    ],
  },
  {
    existingSlug: 'reality-kings',
    name: 'Reality Kings',
    subsites: [
      { name: 'Money Talks',            slug: 'money-talks' },
      { name: 'Cum Fiesta',             slug: 'cum-fiesta' },
      { name: 'Pure 18',                slug: 'pure-18' },
      { name: '8th Street Latinas',     slug: '8th-street-latinas' },
      { name: 'Round And Brown',        slug: 'round-and-brown' },
      { name: 'Milf Hunter',            slug: 'milf-hunter' },
      { name: 'In The VIP',             slug: 'in-the-vip' },
      { name: 'We Live Together',       slug: 'we-live-together' },
      { name: "Mike's Apartment",       slug: 'mikes-apartment' },
      { name: 'Big Naturals',           slug: 'big-naturals' },
      { name: 'Monster Curves',         slug: 'monster-curves' },
      { name: 'Mike In Brazil',         slug: 'mike-in-brazil' },
      { name: 'Happy Tugs',             slug: 'happy-tugs' },
      { name: 'Milf Next Door',         slug: 'milf-next-door' },
      { name: 'Captain Stabbin',        slug: 'captain-stabbin' },
      { name: 'VIP Crew',               slug: 'vip-crew' },
      { name: 'First Time Auditions',   slug: 'first-time-auditions' },
      { name: 'CFNM Secret',            slug: 'cfnm-secret' },
      { name: 'Euro Sex Parties',       slug: 'euro-sex-parties' },
      { name: 'Flower Tucci',           slug: 'flower-tucci' },
      { name: 'Team Squirt',            slug: 'team-squirt' },
      { name: 'Street Blowjobs',        slug: 'street-blowjobs' },
      { name: '40 Inch Plus',           slug: '40-inch-plus' },
      { name: 'Big Tits Boss',          slug: 'big-tits-boss' },
      { name: 'See My Wife',            slug: 'see-my-wife' },
      { name: 'Hot Bush',               slug: 'hot-bush' },
      { name: 'Extreme Asses',          slug: 'extreme-asses' },
      { name: 'Moms Bang Teens',        slug: 'moms-bang-teens' },
      { name: 'Teens Love Huge Cocks',  slug: 'teens-love-huge-cocks' },
      { name: 'GF Revenge',             slug: 'gf-revenge' },
      { name: 'RK Prime',               slug: 'rk-prime' },
      { name: 'Black GFs',              slug: 'black-gfs' },
      { name: 'Sneaky Sex',             slug: 'sneaky-sex' },
      { name: 'Dare Dorm',              slug: 'dare-dorm' },
      { name: 'Wives In Pantyhose',     slug: 'wives-in-pantyhose' },
      { name: 'Moms Lick Teens',        slug: 'moms-lick-teens' },
      { name: 'Extreme Naturals',       slug: 'extreme-naturals' },
      { name: 'HD Love',                slug: 'hd-love' },
      { name: 'Crazy Asian GFs',        slug: 'crazy-asian-gfs' },
      { name: 'Crazy College GFs',      slug: 'crazy-college-gfs' },
      { name: 'Real Orgasms',           slug: 'real-orgasms' },
      { name: 'Lil Humpers',            slug: 'lil-humpers' },
      { name: 'Top Shelf Pussy',        slug: 'top-shelf-pussy' },
      { name: 'Saturday Night Latinas', slug: 'saturday-night-latinas' },
      { name: 'Look At Her Now',        slug: 'look-at-her-now' },
    ],
  },

  // ── NEW SITES ────────────────────────────────────────────────────────────────
  {
    name: 'TeamSkeet',
    slug: 'team-skeet',
    url: 'https://www.teamskeet.com/',
    siteType: 'paysite',
    short_description: 'Award-winning teen porn network with 40+ exclusive subsites.',
    full_price: 29.95,
    price: 14.95,
    affiliateLink: 'https://www.teamskeet.com/',
    subsites: [
      { name: 'ExxxtraSmall',       slug: 'exxxtrasmall' },
      { name: 'Innocent High',      slug: 'innocent-high' },
      { name: "She's New",          slug: 'shes-new' },
      { name: 'Step Siblings',      slug: 'step-siblings' },
      { name: 'Rub A Teen',         slug: 'rub-a-teen' },
      { name: 'Pov Life',           slug: 'pov-life' },
      { name: 'Teens Do Porn',      slug: 'teens-do-porn' },
      { name: 'The Real Workout',   slug: 'the-real-workout' },
      { name: 'This Girl Sucks',    slug: 'this-girl-sucks' },
      { name: 'Titty Attack',       slug: 'titty-attack' },
      { name: 'Oye Loca',           slug: 'oye-loca' },
      { name: 'Team Skeet Extras',  slug: 'team-skeet-extras' },
      { name: 'Her Freshman Year',  slug: 'her-freshman-year' },
      { name: 'Teeny Black',        slug: 'teeny-black' },
      { name: 'Solo Interviews',    slug: 'solo-interviews' },
      { name: 'Self Desire',        slug: 'self-desire' },
      { name: 'Lust HD',            slug: 'lust-hd' },
      { name: 'Teen Curves',        slug: 'teen-curves' },
      { name: 'Teens Love Money',   slug: 'teens-love-money' },
      { name: 'Teens Love Anal',    slug: 'teens-love-anal' },
      { name: 'CFNM Teens',         slug: 'cfnm-teens' },
      { name: 'Bad Milfs',          slug: 'bad-milfs' },
      { name: 'Brace Faced',        slug: 'brace-faced' },
      { name: 'Dyked',              slug: 'dyked' },
      { name: 'Ginger Patch',       slug: 'ginger-patch' },
      { name: 'Kissing Sis',        slug: 'kissing-sis' },
      { name: 'Latina Team',        slug: 'latina-team' },
      { name: "My Babysitter's Club", slug: 'my-babysitters-club' },
      { name: 'TeamSkeet Allstars', slug: 'teamskeet-allstars' },
      { name: 'TeamSkeet Selects',  slug: 'teamskeet-selects' },
      { name: 'Teen Pies',          slug: 'teen-pies' },
      { name: 'Teen Joi',           slug: 'teen-joi' },
    ],
  },
  {
    name: 'Adult Time',
    slug: 'adult-time',
    url: 'https://www.adulttime.com/',
    siteType: 'paysite',
    short_description: 'Massive streaming network with 200+ channels across every adult genre.',
    full_price: 29.95,
    price: 9.95,
    affiliateLink: 'https://www.adulttime.com/',
    subsites: [],
  },
  {
    name: 'Evil Angel',
    slug: 'evil-angel',
    url: 'https://www.evilangel.com/',
    siteType: 'paysite',
    short_description: 'Industry-leading studio renowned for hardcore and anal pornography.',
    full_price: 39.95,
    price: 9.95,
    affiliateLink: 'https://www.evilangel.com/',
    subsites: [],
  },
  {
    name: 'Babes.com',
    slug: 'babes',
    url: 'https://www.babes.com/',
    siteType: 'paysite',
    short_description: 'Artistically shot, premium softcore and hardcore content featuring top models.',
    full_price: 29.99,
    price: 9.99,
    affiliateLink: 'https://www.babes.com/',
    subsites: [],
  },
  {
    name: 'Twistys',
    slug: 'twistys',
    url: 'https://www.twistys.com/',
    siteType: 'paysite',
    short_description: 'Classic premium site featuring softcore and hardcore from the hottest models.',
    full_price: 29.99,
    price: 9.99,
    affiliateLink: 'https://www.twistys.com/',
    subsites: [],
  },
  {
    name: 'FakeHub',
    slug: 'fakehub',
    url: 'https://www.fakehub.com/',
    siteType: 'paysite',
    short_description: 'Reality porn network best known for Fake Taxi — 10+ exclusive European subsites.',
    full_price: 29.99,
    price: 9.99,
    affiliateLink: 'https://www.fakehub.com/',
    subsites: [
      { name: 'Fake Taxi',            slug: 'fake-taxi' },
      { name: 'Public Agent',         slug: 'public-agent' },
      { name: 'Female Agent',         slug: 'female-agent' },
      { name: 'Fake Agent',           slug: 'fake-agent' },
      { name: 'Fake Hospital',        slug: 'fake-hospital' },
      { name: 'Fake Agent UK',        slug: 'fake-agent-uk' },
      { name: 'Fake Cop',             slug: 'fake-cop' },
      { name: 'FakeHub Originals',    slug: 'fakehub-originals' },
      { name: 'Fake Hostel',          slug: 'fake-hostel' },
      { name: 'Fake Driving School',  slug: 'fake-driving-school' },
      { name: 'Female Fake Taxi',     slug: 'female-fake-taxi' },
    ],
  },
  {
    name: 'Naughty America',
    slug: 'naughty-america',
    url: 'https://www.naughtyamerica.com/',
    siteType: 'paysite',
    short_description: 'One of the largest VR and HD porn networks with 50+ fantasy-themed sites.',
    full_price: 29.95,
    price: 19.95,
    affiliateLink: 'https://www.naughtyamerica.com/',
    subsites: [],
  },
  {
    name: 'Tushy',
    slug: 'tushy',
    url: 'https://www.tushy.com/',
    siteType: 'paysite',
    short_description: 'Vixen Media premium channel specialising in high-end anal pornography.',
    full_price: 35.95,
    price: 24.95,
    affiliateLink: 'https://www.tushy.com/',
    subsites: [],
  },
  {
    name: 'Wicked',
    slug: 'wicked',
    url: 'https://www.wicked.com/',
    siteType: 'paysite',
    short_description: 'Award-winning studio featuring blockbuster storylines and top contract stars.',
    full_price: 29.95,
    price: 9.95,
    affiliateLink: 'https://www.wicked.com/',
    subsites: [],
  },
  {
    name: 'MYLF',
    slug: 'mylf',
    url: 'https://www.mylf.com/',
    siteType: 'paysite',
    short_description: 'Premium MILF network featuring experienced women in high quality HD scenes.',
    full_price: 29.95,
    price: 9.99,
    affiliateLink: 'https://www.mylf.com/',
    subsites: [],
  },
  {
    name: 'Blacked',
    slug: 'blacked',
    url: 'https://www.blacked.com/',
    siteType: 'paysite',
    short_description: 'Vixen Media premium interracial channel with cinematic production values.',
    full_price: 35.95,
    price: 24.95,
    affiliateLink: 'https://www.blacked.com/',
    subsites: [],
  },
  {
    name: 'Vixen',
    slug: 'vixen',
    url: 'https://www.vixen.com/',
    siteType: 'paysite',
    short_description: 'Vixen Media flagship channel delivering ultra-premium, cinematic adult content.',
    full_price: 35.95,
    price: 24.95,
    affiliateLink: 'https://www.vixen.com/',
    subsites: [],
  },
  {
    name: 'MetArt',
    slug: 'metart',
    url: 'https://www.metart.com/',
    siteType: 'paysite',
    short_description: "World's leading erotic art site with thousands of nude model photo sets and videos.",
    full_price: 29.95,
    price: 9.99,
    affiliateLink: 'https://www.metart.com/',
    subsites: [],
  },
  {
    name: 'SexArt',
    slug: 'sexart',
    url: 'https://www.sexart.com/',
    siteType: 'paysite',
    short_description: 'Artistically produced hardcore films from the MetArt network.',
    full_price: 29.95,
    price: 9.99,
    affiliateLink: 'https://www.sexart.com/',
    subsites: [],
  },
  {
    name: 'HardX',
    slug: 'hardx',
    url: 'https://www.hardx.com/',
    siteType: 'paysite',
    short_description: 'Hardcore studio specialising in anal, ATM and intense scenes in 4K.',
    full_price: 29.99,
    price: 9.95,
    affiliateLink: 'https://www.hardx.com/',
    subsites: [],
  },
  {
    name: 'DarkX',
    slug: 'darkx',
    url: 'https://www.darkx.com/',
    siteType: 'paysite',
    short_description: "Sister studio to HardX focusing on interracial and ebony content in 4K.",
    full_price: 29.95,
    price: 9.95,
    affiliateLink: 'https://www.darkx.com/',
    subsites: [],
  },
  {
    name: 'Kink',
    slug: 'kink',
    url: 'https://www.kink.com/',
    siteType: 'paysite',
    short_description: 'Premier BDSM network with 30+ channels covering every kink and fetish.',
    full_price: 39.99,
    price: 19.99,
    affiliateLink: 'https://www.kink.com/',
    subsites: [],
  },
  {
    name: 'Jules Jordan',
    slug: 'jules-jordan',
    url: 'https://www.julesjordan.com/',
    siteType: 'paysite',
    short_description: 'Award-winning director known for 4K ATM, anal and gonzo hardcore content.',
    full_price: 39.95,
    price: 19.95,
    affiliateLink: 'https://www.julesjordan.com/',
    subsites: [],
  },
  {
    name: 'New Sensations',
    slug: 'new-sensations',
    url: 'https://www.newsensations.com/',
    siteType: 'paysite',
    short_description: 'Veteran studio producing romantic and fantasy-driven adult films.',
    full_price: 29.95,
    price: 5.00,
    affiliateLink: 'https://www.newsensations.com/',
    subsites: [],
  },
  {
    name: 'Pure Taboo',
    slug: 'pure-taboo',
    url: 'https://www.puretaboo.com/',
    siteType: 'paysite',
    short_description: 'Critically acclaimed studio producing dark, story-driven taboo narratives.',
    full_price: 29.95,
    price: 14.95,
    affiliateLink: 'https://www.puretaboo.com/',
    subsites: [],
  },
  {
    name: 'Trans Angels',
    slug: 'trans-angels',
    url: 'https://www.transangels.com/',
    siteType: 'paysite',
    short_description: 'Premium transgender adult studio featuring top trans stars in 4K.',
    full_price: 29.99,
    price: 9.99,
    affiliateLink: 'https://www.transangels.com/',
    subsites: [],
  },
  {
    name: 'Girlsway',
    slug: 'girlsway',
    url: 'https://www.girlsway.com/',
    siteType: 'paysite',
    short_description: "Adam & Eve's premium all-girl network with story-driven lesbian content.",
    full_price: 29.95,
    price: 14.95,
    affiliateLink: 'https://www.girlsway.com/',
    subsites: [],
  },
  {
    name: 'Burning Angel',
    slug: 'burning-angel',
    url: 'https://www.burningangel.com/',
    siteType: 'paysite',
    short_description: 'Alt-porn and punk scene focusing on tattooed, pierced and unconventional performers.',
    full_price: 29.95,
    price: 14.95,
    affiliateLink: 'https://www.burningangel.com/',
    subsites: [],
  },
  {
    name: 'Property Sex',
    slug: 'property-sex',
    url: 'https://www.propertysex.com/',
    siteType: 'paysite',
    short_description: 'Reality porn where real estate agents and clients mix business with pleasure.',
    full_price: 29.99,
    price: 9.99,
    affiliateLink: 'https://www.propertysex.com/',
    subsites: [],
  },
  {
    name: 'SexyHub',
    slug: 'sexyhub',
    url: 'https://www.sexyhub.com/',
    siteType: 'paysite',
    short_description: 'European network featuring massage, lesbian and reality porn across 10+ subsites.',
    full_price: 29.99,
    price: 9.99,
    affiliateLink: 'https://www.sexyhub.com/',
    subsites: [],
  },

  // ── EXISTING SITES — additional subsites from user's network list ─────────────
  {
    existingSlug: 'girlsway',
    name: 'Girlsway',
    subsites: [
      { name: 'Girlsway Originals', slug: 'girlsway-originals' },
      { name: 'Sex Tape Lesbians',  slug: 'sex-tape-lesbians' },
      { name: 'Girls Try Anal',     slug: 'girls-try-anal' },
      { name: "Mommy's Girl",       slug: 'mommys-girl' },
      { name: 'Web Young',          slug: 'web-young' },
    ],
  },
  {
    existingSlug: 'new-sensations',
    name: 'New Sensations',
    subsites: [
      { name: 'The Romance Series',  slug: 'the-romance-series' },
      { name: 'Tales From The Edge', slug: 'tales-from-the-edge' },
      { name: 'Digital Sin',         slug: 'digital-sin' },
      { name: 'HotwifeXXX',          slug: 'hotwife-xxx' },
    ],
  },
  {
    existingSlug: 'reality-kings',
    name: 'Reality Kings',
    subsites: [
      { name: 'Bad Tow Truck', slug: 'bad-tow-truck' },
    ],
  },
  {
    existingSlug: 'team-skeet',
    name: 'TeamSkeet',
    subsites: [
      { name: 'Hoby Buchanon', slug: 'hoby-buchanon' },
    ],
  },
  {
    existingSlug: 'mofos',
    name: 'Mofos',
    subsites: [
      { name: 'Busted Babysitters', slug: 'busted-babysitters' },
      { name: 'Drone Hunter',       slug: 'drone-hunter' },
      { name: 'Project RV',         slug: 'project-rv' },
    ],
  },

  // ── NEW PARENT SITES — from user's network list ───────────────────────────────
  {
    name: 'Bad Daddy POV',
    slug: 'bad-daddy-pov',
    url: 'https://www.baddaddypov.com/',
    siteType: 'paysite',
    short_description: 'POV-focused hardcore network with 15+ anal and amateur subsites.',
    full_price: 29.95,
    price: 14.95,
    affiliateLink: 'https://www.baddaddypov.com/',
    subsites: [
      { name: 'Anal BBC',             slug: 'anal-bbc' },
      { name: 'Anal Violation',       slug: 'anal-violation' },
      { name: 'DTF Sluts',            slug: 'dtf-sluts' },
      { name: 'Girl Faction',         slug: 'girl-faction' },
      { name: 'Her Gape',             slug: 'her-gape' },
      { name: 'Homemade Anal Whores', slug: 'homemade-anal-whores' },
      { name: 'James Deen',           slug: 'james-deen' },
      { name: 'Only Prince',          slug: 'only-prince' },
      { name: 'Pervert Gallery',      slug: 'pervert-gallery' },
      { name: 'POV Perverts',         slug: 'pov-perverts' },
      { name: 'Teenage Anal Sluts',   slug: 'teenage-anal-sluts' },
      { name: 'Twisted Visual',       slug: 'twisted-visual' },
      { name: 'Your Mom Does Anal',   slug: 'your-mom-does-anal' },
      { name: 'Your Mom Does Porn',   slug: 'your-mom-does-porn' },
    ],
  },
  {
    name: 'Analized',
    slug: 'analized',
    url: 'https://www.analized.com/',
    siteType: 'paysite',
    short_description: 'Anal-focused network sharing channels with the Bad Daddy POV network.',
    full_price: 29.95,
    price: 14.95,
    affiliateLink: 'https://www.analized.com/',
    subsites: [],
  },
  {
    name: 'Thai Swinger',
    slug: 'thai-swinger',
    url: 'https://www.thaiswinger.com/',
    siteType: 'paysite',
    short_description: 'Thai amateur and swinger content network.',
    full_price: 29.95,
    price: 9.95,
    affiliateLink: 'https://www.thaiswinger.com/',
    subsites: [
      { name: 'Latina Raw',  slug: 'latina-raw' },
      { name: 'Isan Unseen', slug: 'isan-unseen' },
    ],
  },
  {
    name: 'Ladyboy Gold',
    slug: 'ladyboy-gold',
    url: 'https://www.ladyboygold.com/',
    siteType: 'paysite',
    short_description: 'Premium Thai ladyboy network with 3 exclusive subsites.',
    full_price: 29.95,
    price: 9.95,
    affiliateLink: 'https://www.ladyboygold.com/',
    subsites: [
      { name: 'TS RAW',        slug: 'ts-raw' },
      { name: 'Ladyboy Tube',  slug: 'ladyboy-tube' },
      { name: 'Ladyboy Crush', slug: 'ladyboy-crush' },
    ],
  },
  {
    name: "Devil's Film",
    slug: 'devils-film',
    url: 'https://www.devilsfilm.com/',
    siteType: 'paysite',
    short_description: 'Massive adult network (part of Fame Digital / Gamma) with 28+ subsites spanning all genres.',
    full_price: 29.95,
    price: 7.95,
    affiliateLink: 'https://www.devilsfilm.com/',
    subsites: [
      { name: 'Big Fat Creampie',     slug: 'big-fat-creampie' },
      { name: 'Bushy Bushy',          slug: 'bushy-bushy' },
      { name: 'Cum Shot Oasis',       slug: 'cum-shot-oasis' },
      { name: 'Curry Creampie',       slug: 'curry-creampie' },
      { name: 'Daring Sex',           slug: 'daring-sex' },
      { name: 'Devils Film Parodies', slug: 'devils-film-parodies' },
      { name: 'Devils GangBang',      slug: 'devils-gangbang' },
      { name: 'FameDigital Network',  slug: 'famedigital-network' },
      { name: 'Give Me Teens',        slug: 'give-me-teens' },
      { name: 'Granny Ghetto',        slug: 'granny-ghetto' },
      { name: 'Hairy Undies',         slug: 'hairy-undies' },
      { name: 'I Swallow Peter North', slug: 'i-swallow-peter-north' },
      { name: 'Lesbian Factor',       slug: 'lesbian-factor' },
      { name: 'Low Art Films',        slug: 'low-art-films' },
      { name: 'Mother Fucker XXX',    slug: 'mother-fucker-xxx' },
      { name: 'My Teen Oasis',        slug: 'my-teen-oasis' },
      { name: 'Out Of the Family',    slug: 'out-of-the-family' },
      { name: 'Peter North',          slug: 'peter-north' },
      { name: 'Peter North DVD',      slug: 'peter-north-dvd' },
      { name: 'POV This',             slug: 'pov-this' },
      { name: 'Rocco Siffredi',       slug: 'rocco-siffredi' },
      { name: 'Silvia Saint',         slug: 'silvia-saint' },
      { name: 'Silverstone DVD',      slug: 'silverstone-dvd' },
      { name: 'Squirtalicious',       slug: 'squirtalicious' },
      { name: 'Tera Patrick',         slug: 'tera-patrick' },
      { name: 'Transsexual Road Trip', slug: 'transsexual-road-trip' },
      { name: 'Tranny Pros',          slug: 'tranny-pros' },
      { name: 'White Ghetto',         slug: 'white-ghetto' },
    ],
  },
  {
    name: 'Fetish Network',
    slug: 'fetish-network',
    url: 'https://www.fetishnetwork.com/',
    siteType: 'paysite',
    short_description: 'BDSM and fetish network with 11 subsites covering femdom, spanking and bondage.',
    full_price: 29.95,
    price: 9.95,
    affiliateLink: 'https://www.fetishnetwork.com/',
    subsites: [
      { name: 'Brutal Dungeon',          slug: 'brutal-dungeon' },
      { name: 'Brutal Punishment',       slug: 'brutal-punishment' },
      { name: 'Cash Fetish',             slug: 'cash-fetish' },
      { name: 'Femdom Academy',          slug: 'femdom-academy' },
      { name: 'Japanese Femdom Videos',  slug: 'japanese-femdom-videos' },
      { name: 'Jerkoff Girlfriends',     slug: 'jerkoff-girlfriends' },
      { name: 'Panty Girlfriends',       slug: 'panty-girlfriends' },
      { name: 'Perfect Spanking',        slug: 'perfect-spanking' },
      { name: 'Punished Angels',         slug: 'punished-angels' },
      { name: 'Shibari Dolls',           slug: 'shibari-dolls' },
      { name: 'Taboo Tug Jobs',          slug: 'taboo-tug-jobs' },
    ],
  },
  {
    name: 'Blowpass',
    slug: 'blowpass',
    url: 'https://www.blowpass.com/',
    siteType: 'paysite',
    short_description: 'Blowjob-focused network with exclusive oral and group content.',
    full_price: 29.95,
    price: 9.95,
    affiliateLink: 'https://www.blowpass.com/',
    subsites: [
      { name: 'Cock Sucking Challenge', slug: 'cock-sucking-challenge' },
      { name: 'Squirting Orgies',       slug: 'squirting-orgies' },
      { name: 'Sunlust XXX',            slug: 'sunlust-xxx' },
    ],
  },
  {
    name: 'Wankz',
    slug: 'wankz',
    url: 'https://www.wankz.com/',
    siteType: 'paysite',
    short_description: 'Premium HD network featuring fantasy, amateur and niche content.',
    full_price: 29.95,
    price: 9.95,
    affiliateLink: 'https://www.wankz.com/',
    subsites: [
      { name: 'Bubbly Massage',    slug: 'bubbly-massage' },
      { name: 'Brother Undercover', slug: 'brother-undercover' },
      { name: 'Blow Patrol',       slug: 'blow-patrol' },
    ],
  },
  {
    name: 'Pornstar Platinum',
    slug: 'pornstar-platinum',
    url: 'https://www.pornstarplatinum.com/',
    siteType: 'paysite',
    short_description: 'Network of individual pornstar sites with exclusive solo and hardcore content.',
    full_price: 29.95,
    price: 9.95,
    affiliateLink: 'https://www.pornstarplatinum.com/',
    subsites: [
      { name: 'Fukks',                   slug: 'fukks' },
      { name: 'Nina Elle XXX',           slug: 'nina-elle-xxx' },
      { name: 'Pornstar Platinum Mobile', slug: 'pornstar-platinum-mobile' },
      { name: 'Yuri Luv',               slug: 'yuri-luv' },
    ],
  },
  {
    name: 'Puba',
    slug: 'puba',
    url: 'https://www.puba.com/',
    siteType: 'paysite',
    short_description: 'Network of exclusive pornstar personal sites with solo and hardcore content.',
    full_price: 29.95,
    price: 9.95,
    affiliateLink: 'https://www.puba.com/',
    subsites: [
      { name: 'Brett Rossi',     slug: 'brett-rossi' },
      { name: 'Dahlia Sky',      slug: 'dahlia-sky' },
      { name: 'Dana DeArmond',   slug: 'dana-dearmond' },
      { name: 'Mia Lelani',      slug: 'mia-lelani' },
      { name: 'Nicole Aniston',  slug: 'nicole-aniston' },
      { name: 'Romi Rain',       slug: 'romi-rain' },
    ],
  },
  {
    name: 'PornPros',
    slug: 'pornpros',
    url: 'https://www.pornpros.com/',
    siteType: 'paysite',
    short_description: 'Premium HD network with 20+ subsites including Passion HD, Tiny4K and PureMature.',
    full_price: 29.95,
    price: 9.95,
    affiliateLink: 'https://www.pornpros.com/',
    subsites: [
      { name: 'Cum Disgrace',     slug: 'cum-disgrace' },
      { name: 'Milf Humiliation', slug: 'milf-humiliation' },
    ],
  },
];

// ── Strapi helpers ─────────────────────────────────────────────────────────────

async function strapiLogin() {
  if (STRAPI_TOKEN) return STRAPI_TOKEN;
  const res = await fetch(`${STRAPI_URL}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: STRAPI_EMAIL, password: STRAPI_PASSWORD }),
  });
  if (!res.ok) throw new Error(`Strapi login failed: ${res.status} ${await res.text()}`);
  const { data } = await res.json();
  return data.token;
}

function authHeaders(token) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

async function findSiteBySlug(token, slug) {
  const res = await fetch(
    `${STRAPI_URL}/api/sites?filters[slug][$eq]=${encodeURIComponent(slug)}&status=published`,
    { headers: authHeaders(token) }
  );
  if (!res.ok) throw new Error(`findSiteBySlug(${slug}): ${res.status} ${await res.text()}`);
  const { data } = await res.json();
  return data?.[0] ?? null;
}

async function createSite(token, { name, slug, url, siteType, short_description, included }) {
  const res = await fetch(`${STRAPI_URL}/api/sites`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      data: { name, slug, url, siteType, short_description, included, isActive: true },
    }),
  });
  if (!res.ok) throw new Error(`createSite(${name}): ${res.status} ${await res.text()}`);
  const { data } = await res.json();
  return data;
}

async function publishSite(token, documentId) {
  const res = await fetch(`${STRAPI_URL}/api/sites/${documentId}/actions/publish`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  // 405 = already published or not supported via API token — entries are auto-published on creation
  if (!res.ok && res.status !== 405) {
    console.warn(`  ⚠ publish site ${documentId}: ${res.status}`);
  }
}

async function createOffer(token, { siteDocumentId, price, full_price, affiliateLink }) {
  const res = await fetch(`${STRAPI_URL}/api/offers`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      data: {
        offerKind: 'subscription',
        offerType: 'monthly',
        price,
        full_price,
        affiliateLink,
        priority: 10,
        site: siteDocumentId,
      },
    }),
  });
  if (!res.ok) throw new Error(`createOffer: ${res.status} ${await res.text()}`);
  return res.json();
}

async function subsiteExists(token, slug) {
  const res = await fetch(
    `${STRAPI_URL}/api/sites?filters[slug][$eq]=${encodeURIComponent(slug)}&pagination[pageSize]=1`,
    { headers: authHeaders(token) }
  );
  if (!res.ok) throw new Error(`subsiteExists(${slug}): ${res.status} ${await res.text()}`);
  const { data } = await res.json();
  return (data?.length ?? 0) > 0;
}

async function createSubsite(token, { name, slug, url, siteType, siteDocumentId }) {
  const res = await fetch(`${STRAPI_URL}/api/sites`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      data: {
        name,
        slug,
        url: url || 'https://example.com/',
        siteType: siteType || 'paysite',
        isActive: true,
        parent_site: siteDocumentId,
      },
    }),
  });
  if (!res.ok) throw new Error(`createSubsite(${name}): ${res.status} ${await res.text()}`);
  const { data } = await res.json();
  return data;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`🔑 Authenticating with Strapi at ${STRAPI_URL}…`);
  const token = await strapiLogin();
  console.log('✓ Authenticated\n');

  for (const site of SITES) {
    const lookupSlug = site.existingSlug ?? site.slug;
    const isExisting = Boolean(site.existingSlug);

    console.log(`─── ${site.name} (${lookupSlug}) ` + (isExisting ? '[existing]' : '[new]'));

    // ── 1. Find or create site ──────────────────────────────────────────────
    let existing = await findSiteBySlug(token, lookupSlug);

    if (!existing) {
      // Also try without draft filter (draft sites won't appear as published)
      const draftRes = await fetch(
        `${STRAPI_URL}/api/sites?filters[slug][$eq]=${encodeURIComponent(lookupSlug)}&status=draft`,
        { headers: authHeaders(token) }
      );
      const { data: draftData } = await draftRes.json();
      existing = draftData?.[0] ?? null;
    }

    let documentId;

    if (existing) {
      documentId = existing.documentId;
      console.log(`  ↳ found existing (documentId=${documentId})`);
    } else if (isExisting) {
      console.warn(`  ⚠ expected existing site "${lookupSlug}" not found in DB — skipping`);
      continue;
    } else {
      if (DRY_RUN) {
        console.log(`  [DRY] would create site "${site.name}"`);
        documentId = 'dry-run-id';
      } else {
        const created = await createSite(token, site);
        documentId = created.documentId;
        console.log(`  ✓ created site (documentId=${documentId})`);

        await publishSite(token, documentId);
        console.log(`  ✓ published`);
      }
    }

    // Resolve parent URL and siteType for child sites
    const parentUrl = existing?.url ?? site.url ?? 'https://example.com/';
    const parentSiteType = existing?.siteType ?? site.siteType ?? 'paysite';

    // ── 2. Create offer for new sites ───────────────────────────────────────
    if (!isExisting && !existing) {
      if (DRY_RUN) {
        console.log(`  [DRY] would create offer: $${site.price}/mo (full $${site.full_price})`);
      } else {
        await createOffer(token, {
          siteDocumentId: documentId,
          price: site.price,
          full_price: site.full_price,
          affiliateLink: site.affiliateLink,
        });
        console.log(`  ✓ created offer $${site.price}/mo (full $${site.full_price})`);
      }
    }

    // ── 3. Add subsites ─────────────────────────────────────────────────────
    const subsites = site.subsites ?? [];
    if (subsites.length === 0) {
      console.log(`  ↳ no subsites to add`);
      continue;
    }

    let added = 0;
    let skipped = 0;

    for (const sub of subsites) {
      if (DRY_RUN) {
        console.log(`    [DRY] subsite "${sub.name}" (${sub.slug})`);
        added++;
        continue;
      }

      const alreadyExists = await subsiteExists(token, sub.slug);
      if (alreadyExists) {
        skipped++;
        continue;
      }

      try {
        const created = await createSubsite(token, {
          name: sub.name,
          slug: sub.slug,
          url: sub.url ?? parentUrl,
          siteType: sub.siteType ?? parentSiteType,
          siteDocumentId: documentId,
        });
        await publishSite(token, created.documentId);
        added++;
      } catch (err) {
        console.warn(`    ⚠ ${sub.name}: ${err.message}`);
      }
    }

    console.log(`  ↳ subsites: ${added} added, ${skipped} already existed`);
  }

  console.log('\n✅ Done!');
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
