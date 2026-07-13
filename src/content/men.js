window.NWKS = window.NWKS || {};
NWKS.content = NWKS.content || {};

/* Owned by worlds-coder. Filled from spec §7 "Men's Encounter — August 6–8, 2026"
   (docs/design/2026-07-13-encounter-worlds-and-entrances.md).
   Contract: NWKS.content.men = { eventName, dates, logo, tagline, sections:[{id,title,blocks:[...]}],
   cost, bring:[...], contacts:[...], register:[{label,href}], verse }
   blocks[] items may be: a plain string (paragraph), { list:[...] } (bullet list), or
   { link:{label,href} } (inline call-to-action) — rendered by src/js/worlds.js. */
NWKS.content.men = {
  eventName: "Northwest Men's Encounter",
  dates: 'August 6 – 8, 2026',
  logo: 'men-logo-300x300-1.jpg',
  tagline: 'It is for freedom that Christ has set us free.',
  sections: [
    {
      id: 'what-is',
      title: "What is Men's Encounter?",
      blocks: [
        "Connect with other guys and take an honest look at your walk with God. Over the weekend, you'll examine 14 areas of your life through worship, testimonies, teaching, and ministry."
      ]
    },
    {
      id: 'pre-encounter',
      title: 'What is Pre-Encounter?',
      blocks: [
        'Teachings and testimonies to prepare you for the weekend, held at your church before you leave.'
      ]
    },
    {
      id: 'weekend',
      title: 'The Weekend',
      blocks: [
        'Leave Thursday evening from a launch-point church — Norton, Hays, Colby, Gove, Hoxie, or Plainville. Arrival is 4:00–6:30 pm; each location departs at its own time, so park at the church.',
        'Return Saturday, 4:00–5:00 pm.',
        "Destination: Lakeview Christian Camp, Stockton, KS (Webster Lake). Ride together — don't take your own vehicle.",
        { link: { label: 'Lakeview Christian Camp ↗', href: 'https://lakeviewchristiancamp.org' } }
      ]
    }
  ],
  cost: '$125 — covers transportation, lodging, materials, and meals. Scholarships are available on request. Checks payable to Norton Christian Church, 208 N. Kansas Ave, Norton, KS 67654.',
  bring: [
    'Sleeping bag',
    'Pillow(s)',
    'Toiletries',
    'Towel',
    'Flashlight',
    "A Bible (don't pack it — you'll need it Thursday)",
    'Clothing for Friday & Saturday'
  ],
  contacts: [
    { name: 'Norton — Lucas Melvin', phone: '785-202-0302' },
    { name: 'Hays — Len Melvin', phone: '785-650-3366' },
    { name: 'Colby — Jake Haines', phone: '785-443-2438' },
    { name: 'Hoxie — Seth Slaughbaugh', phone: '785-627-6092' },
    { name: 'Gove — Von Tuttle', phone: '785-673-9534' },
    { name: 'Sterling — Nick Sowers', phone: '620-680-0166' }
  ],
  register: [
    {
      label: 'Register as an Attendee',
      href: 'https://docs.google.com/forms/d/e/1FAIpQLSdZoPlopEZyHpBLl4EnXZuiB8X6vCDAR5v7Nw726rgtFQiNQw/viewform'
    },
    {
      label: 'Register as a Server',
      href: 'https://docs.google.com/forms/d/e/1FAIpQLSfumN5SAwGVA32X0D9k2r45hZCcd6zlAkZGv3AgWOFa_3_y6A/viewform'
    }
  ],
  verse: '"It is for freedom that Christ has set us free." — Galatians 5:1'
};
