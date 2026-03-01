import { describe, it, expect } from 'vitest';
import { makeAccountLabel } from './accountLabel';

describe('makeAccountLabel', () => {
  it('creates a label from a single segment', () => {
    const lbl = makeAccountLabel('Expenses');
    expect(lbl).toEqual(['Expenses']);
  });

  it('creates a label from multiple colon-separated segments', () => {
    const lbl = makeAccountLabel('Expenses:Food:Restaurants');
    expect(lbl).toEqual(['Expenses', 'Food', 'Restaurants']);
  });

  it('throws on an empty string', () => {
    expect(() => makeAccountLabel('')).toThrow();
  });

  it('throws when any segment is empty (e.g. trailing colon)', () => {
    expect(() => makeAccountLabel('Expenses:')).toThrow();
  });

  it('throws when a middle segment is empty (e.g. double colon)', () => {
    expect(() => makeAccountLabel('Expenses::Food')).toThrow();
  });
});