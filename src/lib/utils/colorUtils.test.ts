import { describe, it, expect } from 'vitest';
import { generateVibrantColor } from './colorUtils';

describe('colorUtils', () => {
  describe('generateVibrantColor', () => {
    it('should generate a valid hex color', () => {
      const color = generateVibrantColor(0);
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    });

    it('should return the same color for the same index', () => {
      expect(generateVibrantColor(5)).toBe(generateVibrantColor(5));
    });

    it('should return different colors for different indices', () => {
      expect(generateVibrantColor(0)).not.toBe(generateVibrantColor(1));
    });
  });
});
