// Reads the real car-parts demand dataset (data/carparts) and classifies each
// series the way spare-parts planners do: by how often demand happens (ADI,
// the average demand interval) and how much the size of each order varies
// (CV², the squared coefficient of variation of the non-zero demands).
//
// Syntetos, Boylan & Croston (2005) cut-offs:
//   ADI < 1.32 and CV² < 0.49  -> smooth        (regular, steady)
//   ADI < 1.32 and CV² >= 0.49 -> erratic       (regular, sizes jump around)
//   ADI >= 1.32 and CV² < 0.49 -> intermittent  (long gaps, steady sizes)
//   ADI >= 1.32 and CV² >= 0.49 -> lumpy        (long gaps, sizes jump around)

export type Series = { id: string; start: string; values: number[] };
export type DemandClass = "smooth" | "erratic" | "intermittent" | "lumpy" | "none";
export type DemandProfile = { adi: number; cv2: number; nonzero: number; total: number; cls: DemandClass };

export const ADI_CUT = 1.32;
export const CV2_CUT = 0.49;

/** Parse a Monash forecasting-archive .tsf file: `name:start:v1,v2,...` lines after `@data`. */
export function parseTsf(text: string): Series[] {
  const out: Series[] = [];
  let inData = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!inData) {
      if (line.toLowerCase() === "@data") inData = true;
      continue;
    }
    if (!line) continue;
    const parts = line.split(":");
    if (parts.length < 3) continue;
    const values = parts[parts.length - 1].split(",").map((v) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : 0;
    });
    out.push({ id: parts[0], start: parts[1].slice(0, 10), values });
  }
  return out;
}

export function classify(adi: number, cv2: number): DemandClass {
  if (!Number.isFinite(adi)) return "none";
  if (adi < ADI_CUT) return cv2 < CV2_CUT ? "smooth" : "erratic";
  return cv2 < CV2_CUT ? "intermittent" : "lumpy";
}

export function demandProfile(values: number[]): DemandProfile {
  const nz = values.filter((v) => v > 0);
  const total = nz.reduce((a, b) => a + b, 0);
  if (!nz.length) return { adi: Infinity, cv2: 0, nonzero: 0, total: 0, cls: "none" };
  const adi = values.length / nz.length;
  const mean = total / nz.length;
  const variance = nz.length > 1 ? nz.reduce((a, v) => a + (v - mean) ** 2, 0) / (nz.length - 1) : 0;
  const cv2 = mean > 0 ? variance / (mean * mean) : 0;
  return { adi, cv2, nonzero: nz.length, total, cls: classify(adi, cv2) };
}
