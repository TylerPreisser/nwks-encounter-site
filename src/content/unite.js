window.NWKS = window.NWKS || {};
NWKS.content = NWKS.content || {};

/* Owned by worlds-coder. Filled from spec §7 "Unite (lightweight world)"
   (docs/design/2026-07-13-encounter-worlds-and-entrances.md).
   NOTE: the live site's Unite dates are stale ("2022") — per spec, do NOT reproduce that;
   show "Dates coming soon" until real info exists.
   Contract: NWKS.content.unite = { eventName, dates, logo, tagline, sections:[{id,title,blocks:[...]}],
   cost, bring:[...], contacts:[...], register:[{label,href}], verse } */
NWKS.content.unite = {
  eventName: 'Unite',
  dates: 'Dates coming soon',
  logo: 'Unite-Logo-with-blue-2048x739.jpg',
  tagline: 'It is for freedom that Christ has set us free.',
  sections: [
    {
      id: 'what-is',
      title: 'What is Unite?',
      blocks: [
        'Unite is life beyond the weekend — ongoing fellowship, worship, learning, and praying together.',
        'A meal is provided, with a free-will offering; anything extra goes to the Encounter account.'
      ]
    }
  ],
  cost: '',
  bring: [],
  contacts: [
    { name: "Men's Encounter", email: 'nwksencounter@gmail.com' },
    { name: "Women's Encounter", email: 'nwkswomensencounter@gmail.com' }
  ],
  register: [
    { label: 'Email nwksencounter@gmail.com', href: 'mailto:nwksencounter@gmail.com' },
    { label: 'Email nwkswomensencounter@gmail.com', href: 'mailto:nwkswomensencounter@gmail.com' }
  ],
  verse: '"It is for freedom that Christ has set us free." — Galatians 5:1'
};
