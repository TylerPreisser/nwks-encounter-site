window.NWKS = window.NWKS || {};
NWKS.forms = NWKS.forms || {};

/* Owned by [forms builder]. Field data aligned with the backend FIELD_SCHEMAS in
   functions/_api/routes/register.ts. The `name` on each field is the friendly
   backend field name (e.g. first_name, email) — NOT a Google entry.<id>.
   The `program` and `role` props drive the POST URL at submit time:
     POST (NWKS_API_BASE) + '/api/register/' + program + '/' + role
   Contract consumed by src/js/forms.js:
     NWKS.forms.specs.<key> = {
       title, program, role,
       fields: [{ name, label, type, required, options, help, format,
                  matchField, matchLabel, otherEntry }]
     }
   type is one of: text | textarea | radio | checkbox | dropdown | date.
   matchField: name of the other field this field must match (client-only; skipPersist).
   otherEntry: legacy Google "other" free-text hook — NOT used for backend submission;
               kept so src/js/forms.js can still render the Other text input inline. */
NWKS.forms.specs = {
  menAttendee: {
    title: "Men's Encounter — Attendee Registration",
    program: 'mens',
    role: 'attendee',
    fields: [
      { name: 'first_name', label: 'First Name', type: 'text', required: true },
      { name: 'last_name', label: 'Last Name', type: 'text', required: true },
      { name: 'email', label: 'Email Address', type: 'text', required: true,
        help: 'We will send registration and event details via email, please leave accurate email address' },
      { name: 'phone', label: 'Phone Number', type: 'text', required: true, format: 'phone' },
      { name: 'phone_type', label: 'Phone Type', type: 'dropdown', required: true,
        options: ['Cell', 'Home', 'Work', 'Other'] },
      { name: 'address', label: 'Address', type: 'text', required: true },
      { name: 'city', label: 'City', type: 'text', required: true },
      { name: 'state', label: 'State', type: 'text', required: true },
      { name: 'launch_location', label: 'Launch Location', type: 'dropdown', required: true,
        options: ['Hays', 'Norton', 'Plainville', 'Hoxie', 'Colby', 'Gove', 'Sterling', 'Wakeeney'] },
      { name: 'shirt_size', label: 'Shirt Size', type: 'dropdown', required: true,
        options: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL'] },
      { name: 'church', label: 'What Church do you attend, if any?', type: 'text', required: true },
      { name: 'times_attended_self_report', label: 'How many times have you attended a Men’s Encounter?', type: 'dropdown', required: true,
        options: ['This will be my first time!', '1', '2', 'More than 2'] },
      { name: 'invited_by', label: 'Who invited you or how did you hear about Men’s Encounter?', type: 'text', required: true },
      { name: 'prayer_contact_name', label: 'Contact Name', type: 'text', required: true,
        help: 'We would like to speak with your spouse, family, and/or friend(s) 2 weeks before Encounter to ask them to pray for and encourage you. Please provide one contact below. Spouse is preferred.' },
      { name: 'prayer_contact_phone', label: 'Contact Phone Number', type: 'text', required: true, format: 'phone' },
      { name: 'dietary_health', label: 'Do you have any dietary or health restrictions?', type: 'text', required: false,
        help: 'For example: need wheelchair access, diabetic diet, food allergies, cannot climb stairs, bottom bunk, etc.' },
      { name: 'questions', label: 'Do you have any questions or concerns?', type: 'textarea', required: false }
    ]
  },

  /* The Men's Server form is currently OPEN — fields from backend MENS_SERVER_FIELDS.
     menServer was previously closed (no entry.<id> could be confirmed from the Google
     Form). Now wired to our own backend at POST /api/register/mens/server. */
  menServer: {
    title: "Men's Encounter — Server Registration",
    program: 'mens',
    role: 'server',
    fields: [
      { name: 'first_name', label: 'First Name', type: 'text', required: true },
      { name: 'last_name', label: 'Last Name', type: 'text', required: true },
      { name: 'email', label: 'Email Address', type: 'text', required: true },
      { name: 'phone', label: 'Phone Number', type: 'text', required: true, format: 'phone' },
      { name: 'phone_type', label: 'Phone Type', type: 'dropdown', required: true,
        options: ['Cell', 'Home', 'Work', 'Other'] },
      { name: 'address', label: 'Address', type: 'text', required: true },
      { name: 'city', label: 'City', type: 'text', required: true },
      { name: 'state', label: 'State', type: 'text', required: true },
      { name: 'launch_location', label: 'Launch Location', type: 'dropdown', required: true,
        options: ['Hays', 'Norton', 'Plainville', 'Hoxie', 'Colby', 'Gove', 'Sterling', 'Wakeeney'] },
      { name: 'shirt_size', label: 'Shirt Size', type: 'dropdown', required: true,
        options: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL'] },
      { name: 'church', label: 'What Church do you attend?', type: 'text', required: true },
      { name: 'times_served_self_report', label: 'How many times have you served?', type: 'dropdown', required: true,
        options: ['This will be my first time serving!', '1', '2', 'More than 2'] },
      { name: 'invited_by', label: 'How did you hear about serving?', type: 'text', required: false },
      { name: 'prayer_contact_name', label: 'Contact Name', type: 'text', required: true },
      { name: 'prayer_contact_phone', label: 'Contact Phone Number', type: 'text', required: true, format: 'phone' },
      { name: 'dietary_health', label: 'Do you have any dietary or health restrictions?', type: 'text', required: false },
      { name: 'questions', label: 'Do you have any questions or concerns?', type: 'textarea', required: false }
    ]
  },

  women: {
    title: "Women's Encounter — Attendee Registration",
    program: 'womens',
    role: 'attendee',
    fields: [
      { name: 'first_name', label: 'First Name', type: 'text', required: true },
      { name: 'last_name', label: 'Last Name', type: 'text', required: true },
      { name: 'launch_location', label: 'Select a Launch Point location', type: 'dropdown', required: true,
        options: ['Colby', 'Gove', 'Hays', 'Hoxie', 'Norton', 'Plainville', 'Sterling', 'Wakeeney'] },
      { name: 'invited_by', label: 'Who invited you to Encounter? Please give a first & last name(s).', type: 'text', required: false },
      { name: 'email', label: 'Email Address', type: 'text', required: true,
        help: 'NOTE: Encounter communication occurs via email, please check your inbox frequently.' },
      { name: 'email_confirm', label: 'Confirm Email Address', type: 'text', required: true,
        matchField: 'email', matchLabel: 'Email Address' },
      { name: 'prior_attendance', label: "Have you attended Women's Encounter previously?", type: 'checkbox', required: true,
        options: [
          "1st Time Attendee - Never attended Women's Encounter",
          "I have attended a previous Women's Encounter - I understand that 1st time attendees will get priority",
          'I have attended previously but had a major life event & would be beneficial to attend again'
        ] },
      { name: 'life_event_note', label: 'IF you have had a major life event and need to attend as an Attendee again, please write a note to Leadership explaining said event.', type: 'textarea', required: false },
      { name: 'phone', label: 'Your Phone Number - Cell Preferred', type: 'text', required: true, format: 'phone' },
      { name: 'phone_type', label: 'If not a cell #, please check box below', type: 'checkbox', required: false,
        options: ['Land Line'] },
      { name: 'address', label: 'Your Address', type: 'text', required: true },
      { name: 'city', label: 'City', type: 'text', required: true },
      { name: 'state', label: 'State', type: 'text', required: true },
      { name: 'zip', label: 'Zip', type: 'text', required: true },
      { name: 'church', label: 'What church do you attend, if any?', type: 'text', required: false },
      { name: 'prayer_contact_name', label: 'Contact Name', type: 'text', required: true,
        help: 'We would like to speak with your spouse, family, and/or friend(s) before Encounter to ask them to pray for and encourage you. Please provide one contact below. Spouse is preferred.' },
      { name: 'prayer_contact_phone', label: "Contact Person's Phone Number", type: 'text', required: true, format: 'phone' },
      { name: 'shirt_size', label: 'T-Shirt Size', type: 'radio', required: true,
        options: ['Small', 'Medium', 'Large', 'X-Large', 'XX-Large', 'XXX-Large', 'Other'],
        otherEntry: 'shirt_size_other',
        help: 'There will be T-shirts available onsite for purchase.' },
      { name: 'sandwich_preference', label: 'What kind of sandwich do you prefer?', type: 'dropdown', required: true,
        options: ['Ham/bun', 'Ham/lettuce wrapped unwich', 'Turkey/bun', 'Turkey/lettuce wrapped unwich', 'Veggie/bun', 'Veggie/lettuce wrapped unwich'] },
      { name: 'questions', label: 'Do you have any questions or concerns?', type: 'textarea', required: false }
    ]
  },

  /* There is no Women's Encounter Server registration — per the content copy
     (src/content/women.js "Registration Timeline" section), Server registration for
     Women's Encounter is currently FULL. This spec exists only so the uniform
     Attendee/Server hero CTAs (src/js/worlds.js) have a real panel to open for the
     Server button on the women's door; src/js/forms.js renders its "currently closed"
     notice (same code path as any spec with closed:true or no fields/action). */
  womenServer: {
    title: "Women's Encounter — Server Registration",
    closed: true,
    closedMessage: "Server registration for Women's Encounter is currently full. Please contact us if you have questions."
  },

  /* Express Interest (the waitlist).
     Shown INSTEAD of the attendee form when the current encounter is closed —
     either because an admin closed enrollment or because the attendee cap was
     reached. Four fields only: someone six months out from the next encounter
     can't meaningfully answer shirt size or dietary needs, so we collect just
     enough to email them when registration opens, and they fill the real form
     then. See docs/superpowers/specs/2026-08-01-attendees-seasons-interest-queue-design.md

     Unlike the registration specs, these post to a single shared endpoint and
     carry `program` in the body (src/js/forms.js honours spec.endpoint).
     `intro` is overwritten at render time with the encounter's own
     attendee_full_message (src/js/worlds.js). */
  menInterest: {
    title: "Men's Encounter — Express Interest",
    program: 'mens',
    endpoint: '/api/register/interest',
    submitLabel: 'Add me to the list',
    successMessage: "You're on the list. We'll email you as soon as the next Men's Encounter opens for registration.",
    fields: [
      { name: 'first_name', label: 'First Name', type: 'text', required: true },
      { name: 'last_name', label: 'Last Name', type: 'text', required: true },
      { name: 'email', label: 'Email Address', type: 'text', required: true },
      { name: 'phone', label: 'Phone Number', type: 'text', required: true, format: 'phone' }
    ]
  },

  womenInterest: {
    title: "Women's Encounter — Express Interest",
    program: 'women',
    endpoint: '/api/register/interest',
    submitLabel: 'Add me to the list',
    successMessage: "You're on the list. We'll email you as soon as the next Women's Encounter opens for registration.",
    fields: [
      { name: 'first_name', label: 'First Name', type: 'text', required: true },
      { name: 'last_name', label: 'Last Name', type: 'text', required: true },
      { name: 'email', label: 'Email Address', type: 'text', required: true },
      { name: 'phone', label: 'Phone Number', type: 'text', required: true, format: 'phone' }
    ]
  }
};
