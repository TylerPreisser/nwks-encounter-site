import { describe, it, expect } from 'vitest';
import { FIELD_SCHEMAS, validateBody } from '../routes/register';

// ---------------------------------------------------------------------------
// Schema existence
// ---------------------------------------------------------------------------
describe('FIELD_SCHEMAS', () => {
  it('exports a map with all four spec keys', () => {
    expect(FIELD_SCHEMAS).toHaveProperty('mens');
    expect(FIELD_SCHEMAS).toHaveProperty('womens');
    expect(FIELD_SCHEMAS['mens']).toHaveProperty('attendee');
    expect(FIELD_SCHEMAS['mens']).toHaveProperty('server');
    expect(FIELD_SCHEMAS['womens']).toHaveProperty('attendee');
    expect(FIELD_SCHEMAS['womens']).toHaveProperty('server');
  });

  it('mens/attendee has required fields including first_name', () => {
    const fields = FIELD_SCHEMAS['mens']['attendee'];
    const names = fields.map((f) => f.name);
    expect(names).toContain('first_name');
    expect(names).toContain('last_name');
    expect(names).toContain('email');
    expect(names).toContain('phone');
    expect(names).toContain('launch_location');
    expect(names).toContain('shirt_size');
  });

  it('womens/attendee has required fields including email_confirm', () => {
    const fields = FIELD_SCHEMAS['womens']['attendee'];
    const names = fields.map((f) => f.name);
    expect(names).toContain('first_name');
    expect(names).toContain('email');
    expect(names).toContain('email_confirm');
    expect(names).toContain('sandwich_preference');
    expect(names).toContain('zip');
  });

  it('mens/server has required fields including times_served_self_report', () => {
    const fields = FIELD_SCHEMAS['mens']['server'];
    const names = fields.map((f) => f.name);
    expect(names).toContain('times_served_self_report');
    expect(names).toContain('prayer_contact_name');
  });

  it('womens/server is empty (closed)', () => {
    expect(FIELD_SCHEMAS['womens']['server']).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// validateBody — unknown spec key
// ---------------------------------------------------------------------------
describe('validateBody — unknown spec key', () => {
  it('rejects unknown program slug', () => {
    const result = validateBody('invalid', 'attendee', {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /unknown/i.test(e))).toBe(true);
    }
  });

  it('rejects unknown role', () => {
    const result = validateBody('mens', 'leader', {});
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateBody — mens/attendee
// ---------------------------------------------------------------------------
describe('validateBody mens/attendee', () => {
  it('rejects empty body with errors mentioning First Name', () => {
    const result = validateBody('mens', 'attendee', {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /first name/i.test(e))).toBe(true);
    }
  });

  it('rejects body missing required fields', () => {
    const result = validateBody('mens', 'attendee', { first_name: 'John' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /last name/i.test(e))).toBe(true);
    }
  });

  it('rejects malformed email', () => {
    const result = validateBody('mens', 'attendee', {
      first_name: 'John',
      last_name: 'Doe',
      email: 'not-an-email',
      phone: '6205551234',
      phone_type: 'Cell',
      address: '123 Main St',
      city: 'Hays',
      state: 'KS',
      launch_location: 'Hays',
      shirt_size: 'L',
      church: 'Grace Church',
      times_attended_self_report: '1',
      invited_by: 'Pastor Bob',
      prayer_contact_name: 'Jane Doe',
      prayer_contact_phone: '6205559876',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /email/i.test(e))).toBe(true);
    }
  });

  it('rejects malformed phone (too few digits)', () => {
    const result = validateBody('mens', 'attendee', {
      first_name: 'John',
      last_name: 'Doe',
      email: 'john@example.com',
      phone: '12345',           // only 5 digits
      phone_type: 'Cell',
      address: '123 Main St',
      city: 'Hays',
      state: 'KS',
      launch_location: 'Hays',
      shirt_size: 'L',
      church: 'Grace Church',
      times_attended_self_report: '1',
      invited_by: 'Pastor Bob',
      prayer_contact_name: 'Jane Doe',
      prayer_contact_phone: '6205559876',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /phone/i.test(e))).toBe(true);
    }
  });

  it('accepts a full valid body and returns normalized data', () => {
    const result = validateBody('mens', 'attendee', {
      first_name: 'John',
      last_name: 'Doe',
      email: 'john@example.com',
      phone: '6205551234',
      phone_type: 'Cell',
      address: '123 Main St',
      city: 'Hays',
      state: 'KS',
      launch_location: 'Hays',
      shirt_size: 'L',
      church: 'Grace Church',
      times_attended_self_report: '1',
      invited_by: 'Pastor Bob',
      prayer_contact_name: 'Jane Doe',
      prayer_contact_phone: '6205559876',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.first_name).toBe('John');
      expect(result.data.last_name).toBe('Doe');
      expect(result.data.email).toBe('john@example.com');
      // Phone normalized to (NXX) NXX-XXXX
      expect(result.data.phone).toBe('(620) 555-1234');
      expect(result.data.prayer_contact_phone).toBe('(620) 555-9876');
      expect(result.data.launch_location).toBe('Hays');
      expect(result.data.extra).toBeDefined();
    }
  });

  it('phone normalizes 11-digit number starting with 1', () => {
    const result = validateBody('mens', 'attendee', {
      first_name: 'John',
      last_name: 'Doe',
      email: 'john@example.com',
      phone: '16205551234',
      phone_type: 'Cell',
      address: '123 Main St',
      city: 'Hays',
      state: 'KS',
      launch_location: 'Hays',
      shirt_size: 'L',
      church: 'Grace Church',
      times_attended_self_report: '1',
      invited_by: 'Pastor Bob',
      prayer_contact_name: 'Jane Doe',
      prayer_contact_phone: '6205559876',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.phone).toBe('(620) 555-1234');
    }
  });
});

// ---------------------------------------------------------------------------
// validateBody — womens/attendee
// ---------------------------------------------------------------------------
describe('validateBody womens/attendee', () => {
  const base = {
    first_name: 'Jane',
    last_name: 'Smith',
    launch_location: 'Hays',
    email: 'jane@example.com',
    email_confirm: 'jane@example.com',
    prior_attendance: JSON.stringify(["1st Time Attendee - Never attended Women's Encounter"]),
    phone: '6205551111',
    address: '456 Elm St',
    city: 'Hays',
    state: 'KS',
    zip: '67601',
    prayer_contact_name: 'Mom Smith',
    prayer_contact_phone: '6205552222',
    shirt_size: 'Small',
    sandwich_preference: 'Ham/bun',
  };

  it('accepts a full valid womens/attendee body', () => {
    const result = validateBody('womens', 'attendee', base);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.first_name).toBe('Jane');
      expect(result.data.email).toBe('jane@example.com');
      expect(result.data.extra['zip']).toBe('67601');
      expect(result.data.extra['sandwich_preference']).toBe('Ham/bun');
    }
  });

  it('rejects when email_confirm does not match email', () => {
    const result = validateBody('womens', 'attendee', {
      ...base,
      email_confirm: 'different@example.com',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /confirm/i.test(e))).toBe(true);
    }
  });

  it('rejects empty body mentioning First Name', () => {
    const result = validateBody('womens', 'attendee', {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /first name/i.test(e))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// validateBody — mens/server
// ---------------------------------------------------------------------------
describe('validateBody mens/server', () => {
  it('rejects empty body', () => {
    const result = validateBody('mens', 'server', {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it('accepts a full valid mens/server body', () => {
    const result = validateBody('mens', 'server', {
      first_name: 'Bob',
      last_name: 'Jones',
      email: 'bob@example.com',
      phone: '7855551234',
      phone_type: 'Cell',
      address: '789 Oak Ave',
      city: 'Norton',
      state: 'KS',
      launch_location: 'Norton',
      shirt_size: 'XL',
      church: 'First Baptist',
      prayer_contact_name: 'Alice Jones',
      prayer_contact_phone: '7855559999',
      times_served_self_report: '1',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.first_name).toBe('Bob');
      expect(result.data.extra['times_served_self_report']).toBe('1');
    }
  });
});
