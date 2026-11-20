import { useState } from 'react';
import { Input } from '@/ui/components/ui/input';
import { Label } from '@/ui/components/ui/label';

export interface ColorFieldProps {
  label?: string;
  value: string;
  pickerTestId?: string;
  hexTestId?: string;
  onValueChange: (hex: string) => void;
  onValueCommit?: (hex: string) => void;
}

export function ColorField({
  label,
  value,
  pickerTestId,
  hexTestId,
  onValueChange,
  onValueCommit,
}: ColorFieldProps) {
  const [hexDraft, setHexDraft] = useState<string | null>(null);

  const commitHex = (raw: string) => {
    const cleaned = raw.trim();
    const withHash = cleaned.startsWith('#') ? cleaned : `#${cleaned}`;
    if (/^#[0-9a-fA-F]{6}$/.test(withHash)) {
      const normalized = withHash.toLowerCase();
      onValueChange(normalized);
      onValueCommit?.(normalized);
    }
    setHexDraft(null);
  };

  return (
    <div className="space-y-1.5">
      {label && <Label className="text-muted-foreground text-xs font-normal">{label}</Label>}
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={label ?? 'Color'}
          data-testid={pickerTestId}
          value={value}
          onChange={(e) => {
            setHexDraft(null);
            onValueChange(e.target.value);
            onValueCommit?.(e.target.value);
          }}
          className="border-border h-7 w-9 cursor-pointer rounded border bg-transparent p-0.5"
        />
        <Input
          type="text"
          aria-label={label ? `${label} hex` : 'Color hex'}
          value={hexDraft ?? value}
          data-testid={hexTestId}
          onFocus={() => setHexDraft(value)}
          onChange={(e) => setHexDraft(e.target.value)}
          onBlur={() => commitHex(hexDraft ?? value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commitHex(hexDraft ?? value);
            }
          }}
          className="h-7 flex-1 font-mono text-xs uppercase"
        />
      </div>
    </div>
  );
}
