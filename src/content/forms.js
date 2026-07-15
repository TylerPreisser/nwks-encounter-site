window.NWKS = window.NWKS || {};
NWKS.forms = NWKS.forms || {};

/* Owned by [forms builder]. Field data extracted from the live Google Forms'
   FB_PUBLIC_LOAD_DATA_ blob (raw HTML fetch, not a summary) — entry.<id> names
   are the real POST field names the deployed formResponse endpoint expects.
   Contract consumed by src/js/forms.js:
     NWKS.forms.specs.<key> = {
       title, officialUrl, action,           // action = the real .../formResponse URL
       fields: [{ name:'entry.<id>', label, type, required, options, help, otherEntry }]
     }
   type is one of: text | textarea | radio | checkbox | dropdown | date.
   otherEntry (radio/checkbox only): when set, one option is a free-text "Other"
   choice — its value must be posted as "__other_option__" and the typed text
   goes under the name in otherEntry. */
NWKS.forms.specs = {
  menAttendee: {
    title: "Men's Encounter — Attendee Registration",
    officialUrl: 'https://docs.google.com/forms/d/e/1FAIpQLSdZoPlopEZyHpBLl4EnXZuiB8X6vCDAR5v7Nw726rgtFQiNQw/viewform',
    action: 'https://docs.google.com/forms/d/e/1FAIpQLSdZoPlopEZyHpBLl4EnXZuiB8X6vCDAR5v7Nw726rgtFQiNQw/formResponse',
    fields: [
      { name: 'entry.190691667', label: 'First Name', type: 'text', required: true },
      { name: 'entry.642074978', label: 'Last Name', type: 'text', required: true },
      { name: 'entry.87341896', label: 'Email Address', type: 'text', required: true,
        help: 'We will send registration and event details via email, please leave accurate email address' },
      { name: 'entry.1533571593', label: 'Phone Number', type: 'text', required: true },
      { name: 'entry.1143291371', label: 'Phone Type', type: 'dropdown', required: true,
        options: ['Cell', 'Home', 'Work', 'Other'] },
      { name: 'entry.2074644504', label: 'Address', type: 'text', required: true },
      { name: 'entry.1859103300', label: 'City', type: 'text', required: true },
      { name: 'entry.1502107739', label: 'State', type: 'text', required: true },
      { name: 'entry.1408504039', label: 'Launch Location', type: 'dropdown', required: true,
        options: ['Hays', 'Norton', 'Plainville', 'Hoxie', 'Colby', 'Gove', 'Sterling', 'Wakeeney'] },
      { name: 'entry.795573491', label: 'Shirt Size', type: 'dropdown', required: true,
        options: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL'] },
      { name: 'entry.1224445372', label: 'What Church do you attend, if any?', type: 'text', required: true },
      { name: 'entry.875492866', label: 'How many times have you attended a Men’s Encounter?', type: 'dropdown', required: true,
        options: ['This will be my first time!', '1', '2', 'More than 2'] },
      { name: 'entry.1596599000', label: 'Who invited you or how did you hear about Men’s Encounter?', type: 'text', required: true },
      { name: 'entry.1153130695', label: 'Contact Name', type: 'text', required: true,
        help: 'We would like to speak with your spouse, family, and/or friend(s) 2 weeks before Encounter to ask them to pray for and encourage you. Please provide one contact below. Spouse is preferred.' },
      { name: 'entry.1664846639', label: 'Contact Phone Number', type: 'text', required: true },
      { name: 'entry.1611159078', label: 'Do you have any dietary or health restrictions?', type: 'text', required: false,
        help: 'For example: need wheelchair access, diabetic diet, food allergies, cannot climb stairs, bottom bunk, etc.' },
      { name: 'entry.417921974', label: 'Do you have any questions or concerns?', type: 'textarea', required: false }
    ]
  },

  /* The Men's Server Google Form (1FAIpQLSfumN5SAwGVA32X0D9k2r45hZCcd6zlAkZGv3AgWOFa_3_y6A)
     currently redirects to /closedform ("no longer accepting responses") — Google
     does not serve the field HTML/FB_PUBLIC_LOAD_DATA_ for a closed form, so no
     entry.<id> could be confirmed. Per the hard rule against guessing entry ids,
     this spec intentionally ships with no fields; src/js/forms.js renders a
     "currently closed" notice + link instead of a fake form. Re-run the same
     extraction once the form reopens to fill this in. */
  menServer: {
    title: "Men's Encounter — Server Registration",
    officialUrl: 'https://docs.google.com/forms/d/e/1FAIpQLSfumN5SAwGVA32X0D9k2r45hZCcd6zlAkZGv3AgWOFa_3_y6A/viewform',
    closed: true,
    closedMessage: 'Server registration is currently closed (the form is not accepting responses right now).'
  },

  women: {
    title: "Women's Encounter — Attendee Registration",
    officialUrl: 'https://docs.google.com/forms/d/e/1FAIpQLSeu_lSUUUpIOo02DgiUJvY142miFqUbc3sqEKhEz-EK4P8psA/viewform',
    action: 'https://docs.google.com/forms/d/e/1FAIpQLSeu_lSUUUpIOo02DgiUJvY142miFqUbc3sqEKhEz-EK4P8psA/formResponse',
    fields: [
      { name: 'entry.1905834370', label: 'First Name', type: 'text', required: true },
      { name: 'entry.186114797', label: 'Last Name', type: 'text', required: true },
      { name: 'entry.1201758753', label: 'Select a Launch Point location', type: 'dropdown', required: true,
        options: ['Colby', 'Gove', 'Hays', 'Hoxie', 'Norton', 'Plainville', 'Sterling', 'Wakeeney'] },
      { name: 'entry.235503560', label: 'Who invited you to Encounter? Please give a first & last name(s).', type: 'text', required: false },
      { name: 'entry.784708643', label: 'Email Address', type: 'text', required: true,
        help: 'NOTE: Encounter communication occurs via email, please check your inbox frequently.' },
      { name: 'entry.1845349990', label: 'Confirm Email Address', type: 'text', required: true,
        matchName: 'entry.784708643', matchLabel: 'Email Address' },
      { name: 'entry.1073408382', label: "Have you attended Women's Encounter previously?", type: 'checkbox', required: true,
        options: [
          "1st Time Attendee - Never attended Women's Encounter",
          "I have attended a previous Women's Encounter - I understand that 1st time attendees will get priority",
          'I have attended previously but had a major life event & would be beneficial to attend again'
        ] },
      { name: 'entry.363544414', label: 'IF you have had a major life event and need to attend as an Attendee again, please write a note to Leadership explaining said event.', type: 'textarea', required: false },
      { name: 'entry.605524732', label: 'Your Phone Number - Cell Preferred', type: 'text', required: true },
      { name: 'entry.250143732', label: 'If not a cell #, please check box below', type: 'checkbox', required: false,
        options: ['Land Line'] },
      { name: 'entry.506511904', label: 'Your Address', type: 'text', required: true },
      { name: 'entry.1900174953', label: 'City', type: 'text', required: true },
      { name: 'entry.247635305', label: 'State', type: 'text', required: true },
      { name: 'entry.145104583', label: 'Zip', type: 'text', required: true },
      { name: 'entry.54983700', label: 'What church do you attend, if any?', type: 'text', required: false },
      { name: 'entry.224992736', label: 'Contact Name', type: 'text', required: true,
        help: 'We would like to speak with your spouse, family, and/or friend(s) before Encounter to ask them to pray for and encourage you. Please provide one contact below. Spouse is preferred.' },
      { name: 'entry.398378885', label: "Contact Person's Phone Number", type: 'text', required: true },
      { name: 'entry.1770598054', label: 'T-Shirt Size', type: 'radio', required: true,
        options: ['Small', 'Medium', 'Large', 'X-Large', 'XX-Large', 'XXX-Large', 'Other'],
        otherEntry: 'entry.1770598054.other_option_response',
        help: 'There will be T-shirts available onsite for purchase.' },
      { name: 'entry.2109726452', label: 'What kind of sandwich do you prefer?', type: 'dropdown', required: true,
        options: ['Ham/bun', 'Ham/lettuce wrapped unwich', 'Turkey/bun', 'Turkey/lettuce wrapped unwich', 'Veggie/bun', 'Veggie/lettuce wrapped unwich'] },
      { name: 'entry.1554249951', label: 'Do you have any questions or concerns?', type: 'textarea', required: false }
    ]
  },

  /* There is no Women's Encounter Server registration Google Form — per the content copy
     (src/content/women.js "Registration Timeline" section), Server registration for
     Women's Encounter is currently FULL. This spec exists only so the uniform
     Attendee/Server hero CTAs (src/js/worlds.js) have a real panel to open for the
     Server button on the women's door; src/js/forms.js renders its "currently closed"
     notice (same code path as menServer) since there are no fields/action. */
  womenServer: {
    title: "Women's Encounter — Server Registration",
    closed: true,
    closedMessage: "Server registration for Women's Encounter is currently full. Please contact us if you have questions."
  }
};
