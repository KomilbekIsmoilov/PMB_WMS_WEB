export const unwrap = <T,>(res: any): T => {
  if (res && typeof res === 'object' && 'data' in res) return res.data as T;
  return res as T;
};

export const safeStr = (v: any) => (v === null || v === undefined ? '' : String(v));

export const parseCsv = (raw?: string | null): string[] => {
  const s = (raw || '').trim();
  if (!s) return [];

  if (s.startsWith('[') && s.endsWith(']')) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) return arr.map((x) => String(x).trim()).filter(Boolean);
    } catch {}
  }

  return s
    .split(/[,\|;]+/g)
    .map((x) => x.trim())
    .filter(Boolean);
};

export const joinCsv = (values: string[]): string => {
  return values.map((x) => x.trim()).filter(Boolean).join(',');
};

export const isActiveFlag = (v: any): boolean => {
  if (typeof v === 'boolean') return v;
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'Y' || s === 'YES' || s === 'T' || s === 'TRUE' || s === '1';
};

export const toActiveFlag = (active: boolean): 'Y' | 'N' => (active ? 'Y' : 'N');
