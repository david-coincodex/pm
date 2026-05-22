import urllib.request, json

TOKEN = "41570487f53271b27133d8429adfa9b535df73bf6e6b84bffab2a61a418e293a72d3bdd95b600aa257d65b16416335aad9362065db75ba22a12e374109d87eeed50be6e9d2d9592924be3b7ee2811441fe311d572ca85f8f3ed0eb5843a87f43f8b706baa683d1bd58b5382af047efe596afe82d8d738d59ff01f5961b48ad40"
BASE = "http://localhost:1339/api/pages"


def p(*paragraphs):
    return [{"type": "paragraph", "children": [{"type": "text", "text": t}]} for t in paragraphs]


pages = [
    {
        "title": "About Us",
        "slug": "about",
        "h1": "About PornMode",
        "metaTitle": "About Us — PornMode",
        "metaDescription": "Learn about PornMode — your trusted source for the best adult site discounts, curated deals, and honest reviews.",
        "content": p(
            "PornMode is an adult entertainment deal aggregator dedicated to helping members find the best value subscriptions across paysites, cam sites, and more. We research and verify every deal so you can subscribe with confidence.",
            "We are an independent company. We earn a commission when you sign up through our links, but this never affects the prices you see or the deals we feature.",
        ),
    },
    {
        "title": "Advertise",
        "slug": "advertise",
        "h1": "Advertise on PornMode",
        "metaTitle": "Advertise With Us — PornMode",
        "metaDescription": "Partner with PornMode to showcase your site or offer to a targeted audience of adult entertainment buyers.",
        "content": p(
            "Interested in advertising your adult site, offer, or service to a highly targeted audience? PornMode reaches thousands of visitors who are actively looking to subscribe to premium adult content.",
            "We offer featured listings, sponsored sections, and bundle placements. Contact us at advertising@pornmode.com to discuss options and rates.",
        ),
    },
    {
        "title": "Contact",
        "slug": "contact",
        "h1": "Contact Us",
        "metaTitle": "Contact — PornMode",
        "metaDescription": "Get in touch with the PornMode team for support, partnerships, or general enquiries.",
        "content": p(
            "We'd love to hear from you. Whether you have a question about a deal, want to report an issue, or are interested in a partnership, reach out to us.",
            "General enquiries: hello@pornmode.com\nAdvertising: advertising@pornmode.com\nLegal / DMCA: legal@pornmode.com",
            "We aim to respond within 1–2 business days.",
        ),
    },
    {
        "title": "Terms of Service",
        "slug": "terms",
        "h1": "Terms of Service",
        "metaTitle": "Terms of Service — PornMode",
        "metaDescription": "Read the PornMode Terms of Service to understand the rules and conditions governing your use of our website.",
        "content": p(
            "Last updated: May 2026",
            "By accessing or using PornMode (\"the Site\") you agree to be bound by these Terms of Service. If you do not agree, please discontinue use immediately.",
            "1. Eligibility. You must be 18 years of age or older (or the age of majority in your jurisdiction) to access the Site.",
            "2. Affiliate links. The Site contains affiliate links. When you click a link and make a purchase, we may earn a commission at no extra cost to you.",
            "3. Accuracy. We strive to keep deal information up to date, but prices and availability can change without notice. Always verify the current price directly with the merchant before purchasing.",
            "4. Prohibited conduct. You may not use the Site to scrape content, circumvent security measures, or engage in any unlawful activity.",
            "5. Limitation of liability. The Site is provided \"as is\" without warranties of any kind. We are not liable for any damages arising from your use of the Site or third-party sites.",
            "6. Changes. We reserve the right to modify these Terms at any time. Continued use following changes constitutes acceptance.",
            "Contact: legal@pornmode.com",
        ),
    },
    {
        "title": "Privacy Policy",
        "slug": "privacy",
        "h1": "Privacy Policy",
        "metaTitle": "Privacy Policy — PornMode",
        "metaDescription": "Read how PornMode collects, uses, and protects your personal information.",
        "content": p(
            "Last updated: May 2026",
            "PornMode (\"we\", \"our\", \"us\") is committed to protecting your privacy. This policy explains what data we collect and how we use it.",
            "1. Data we collect. We collect basic analytics data (page views, referrer) via privacy-friendly analytics. If you contact us we collect the information you provide. We do not collect payment information — all transactions happen on the merchant's site.",
            "2. Cookies. We use essential cookies for site functionality and optional analytics cookies. See our Cookie Policy for details.",
            "3. Third-party links. The Site links to third-party adult sites. We are not responsible for their privacy practices.",
            "4. Data sharing. We do not sell your personal data. We may share aggregated, anonymised analytics data with advertising partners.",
            "5. Your rights. Depending on your location, you may have rights to access, correct, or delete your data. Contact legal@pornmode.com to exercise these rights.",
            "6. Changes. We may update this policy periodically. The date above reflects the latest revision.",
        ),
    },
    {
        "title": "Cookie Policy",
        "slug": "cookies",
        "h1": "Cookie Policy",
        "metaTitle": "Cookie Policy — PornMode",
        "metaDescription": "Understand how PornMode uses cookies and how you can manage your cookie preferences.",
        "content": p(
            "Last updated: May 2026",
            "This Cookie Policy explains how PornMode uses cookies and similar tracking technologies.",
            "Essential cookies. These are required for the Site to function (e.g. remembering your recently viewed sites). You cannot opt out of essential cookies.",
            "Analytics cookies. We use privacy-friendly analytics to understand how visitors use the Site. No personally identifiable information is collected. You can opt out via your browser settings.",
            "Affiliate tracking. When you click a deal link, the merchant may set tracking cookies on their site to attribute commissions. We have no control over these cookies.",
            "Managing cookies. Most browsers allow you to block or delete cookies via their settings. Note that blocking essential cookies may affect Site functionality.",
            "Contact legal@pornmode.com for questions about our use of cookies.",
        ),
    },
    {
        "title": "Adult Content Disclaimer",
        "slug": "disclaimer",
        "h1": "Adult Content Disclaimer",
        "metaTitle": "Adult Content Disclaimer — PornMode",
        "metaDescription": "Important notice regarding adult content on PornMode and the linked third-party sites.",
        "content": p(
            "PornMode is an adult content platform intended exclusively for adults aged 18 years or older (or the age of majority in your jurisdiction).",
            "By using this Site you confirm that you are 18 years of age or older, that it is legal to access adult content in your jurisdiction, that you are not offended by sexually explicit material, and that you will not permit any minor to access this Site.",
            "All linked third-party sites are independently operated and are responsible for their own age-verification measures and content policies. PornMode does not host adult content directly.",
            "If you are a parent or guardian, please use parental control tools to prevent minors from accessing adult content online. Resources include Net Nanny, Bark, and your device's built-in parental controls.",
        ),
    },
    {
        "title": "Affiliate Disclaimer",
        "slug": "affiliate-disclaimer",
        "h1": "Affiliate Disclaimer",
        "metaTitle": "Affiliate Disclaimer — PornMode",
        "metaDescription": "PornMode participates in affiliate programmes. Learn how this affects the content on our site.",
        "content": p(
            "PornMode participates in affiliate marketing programmes. This means that when you click a link on our Site and make a purchase or sign up for a subscription, we may receive a commission from the merchant.",
            "This commission comes at no additional cost to you — the price you pay is the same whether or not you use our link.",
            "Our affiliate relationships do not influence which deals we feature or how we rank them. We independently select the best deals based on value, price, and quality.",
            "We disclose our affiliate relationships in good faith and in compliance with FTC guidelines and applicable advertising standards.",
            "If you have any questions about our affiliate relationships, contact us at hello@pornmode.com.",
        ),
    },
]

headers = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {TOKEN}",
}

for page in pages:
    body = json.dumps({"data": {**page, "publishedAt": "2026-05-22T00:00:00.000Z"}}).encode()
    req = urllib.request.Request(BASE, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            d = json.loads(resp.read())
            print(f"OK  {page['slug']} -> id={d['data']['id']}")
    except urllib.error.HTTPError as e:
        print(f"ERR {page['slug']}: {e.code} {e.read().decode()[:200]}")
