import { describe, expect, it } from 'vitest';
import { computePreviewDimensions } from '@/engine3d/offscreen/renderPreview';

describe('renderPreview dimensions', () => {
  it('preserves portrait and landscape aspect ratio for longestSide', () => {
    expect(computePreviewDimensions(50, 70, 2048, 8192)).toEqual({
      width: 1463,
      height: 2048,
    });
    expect(computePreviewDimensions(70, 50, 1024, 8192)).toEqual({
      width: 1024,
      height: 731,
    });
  });

  it('caps dimensions to maxRenderbufferSize and 4096', () => {
    expect(computePreviewDimensions(50, 70, 8192, 4096)).toEqual({
      width: 2926,
      height: 4096,
    });
    expect(computePreviewDimensions(50, 70, 4096, 2048)).toEqual({
      width: 1463,
      height: 2048,
    });
  });
});
