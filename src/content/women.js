window.NWKS = window.NWKS || {};
NWKS.content = NWKS.content || {};

/* Owned by worlds-coder. Filled from spec §7 "Women's Encounter — July 17–19, 2026"
   (docs/design/2026-07-13-encounter-worlds-and-entrances.md).
   Contract: NWKS.content.women = { eventName, dates, logo, tagline, sections:[{id,title,blocks:[...]}],
   cost, bring:[...], contacts:[...], register:[{label,href}], verse }
   blocks[] items may be: a plain string (paragraph), { list:[...] } (bullet list), or
   { link:{label,href} } (inline call-to-action) — rendered by src/js/worlds.js. */
NWKS.content.women = {
  eventName: "NWKS Women’s Encounter",
  dates: 'July 17 – 19, 2026',
  logo: 'source-womens-logo-1024x1024.jpg',
  tagline: 'It is for freedom that Christ has set us free.',
  sections: [
    {
      id: 'registration-timeline',
      title: 'Registration Timeline',
      blocks: [
        'Attendee registration opens May 17, 2026 at 9:00 am. The $125 fee is due July 17.',
        'Server registration opens May 17 at 9:00 am — and is currently FULL. The $125 fee is due at the mandatory Server Training, June 14 at 4:00 pm, Hays Celebration Community Church.'
      ]
    },
    {
      id: 'what-is',
      title: "What is Women’s Encounter?",
      blocks: [
        'A weekend to encounter Christ in ways that are new, or long since felt. Through teaching, testimonies, and worship, you are free to be as social or as quiet as you wish — no comfort zones forced.',
        "This isn't a typical retreat. It's an individual, personal experience between you and God."
      ]
    },
    {
      id: 'weekend',
      title: 'The Weekend',
      blocks: [
        'Leave Friday evening from a launch-point church — Colby, Gove, Hays, Hoxie, Norton, Plainville, Sterling, or WaKeeney. Registration and launch is 4:00–5:30 pm (Sterling meets earlier).',
        'Return Sunday, 4:00–5:00 pm.',
        'Destination: Lakeview Christian Camp, Stockton, KS.'
      ]
    }
  ],
  cost: '$125 (write "Women\'s Encounter" in the memo) — covers transportation, lodging, materials, and meals. Checks payable to Norton Christian Church.',
  bring: [
    'Bedding for a twin bed, or a sleeping bag',
    'Pillow(s)',
    'Toiletries',
    'Bath towel & washcloth',
    'Flashlight',
    'Casual clothes for Saturday & Sunday, plus a jacket',
    "A Bible and a journal/notebook (don't pack — you'll need them Friday evening)"
  ],
  contacts: [
    { name: 'Registration questions', email: 'nwkswomensencounter@gmail.com' },
    { name: 'Angela Melvin', phone: '785-871-0848', email: 'angelarmelvin@gmail.com' },
    { name: 'Danielle Markley', phone: '785-639-2896', email: 'danielle@haysacademy.com' }
  ],
  register: [
    { label: 'Register', href: 'https://forms.gle/KMz3phZ3fNg2nNx57' }
  ],
  verse: '"It is for freedom that Christ has set us free." — Galatians 5:1'
};
