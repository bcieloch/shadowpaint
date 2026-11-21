import { describe, expect, it } from 'vitest';
import { getShortcutItemDef } from '@/core/shortcuts';
import { FEATURE_GUIDE_SECTIONS, TUTORIAL_STEPS } from '@/core/tutorial';

describe('core/tutorial', () => {
  it('defines 6 sequential tutorial steps and 6 feature reference categories with valid shortcut links', () => {
    expect(TUTORIAL_STEPS).toHaveLength(6);
    TUTORIAL_STEPS.forEach((step, idx) => {
      expect(step.stepNumber).toBe(idx + 1);
      if (step.shortcutId) {
        expect(getShortcutItemDef(step.shortcutId)).toBeDefined();
      }
    });

    expect(FEATURE_GUIDE_SECTIONS).toHaveLength(6);
    for (const section of FEATURE_GUIDE_SECTIONS) {
      expect(section.shortcutIds.length).toBeGreaterThan(0);
      for (const sid of section.shortcutIds) {
        expect(getShortcutItemDef(sid)).toBeDefined();
      }
    }
  });
});
