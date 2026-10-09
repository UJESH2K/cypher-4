// Kaveri's eight locations. Road distance is estimated from coordinates
// (straight line x 1.3), which is close enough to decide whether a tempo
// can make the trip the same day.

export type LocationInfo = { name: string; kind: "store" | "warehouse"; lat: number; lon: number; lang: string };

export const LOCATIONS: LocationInfo[] = [
  { name: "Gokak", kind: "store", lat: 16.169, lon: 74.823, lang: "kn" },
  { name: "Belgaum", kind: "store", lat: 15.85, lon: 74.497, lang: "kn" },
  { name: "Dharwad", kind: "store", lat: 15.458, lon: 75.008, lang: "kn" },
  { name: "Gadag", kind: "store", lat: 15.43, lon: 75.635, lang: "kn" },
  { name: "Vijayapura", kind: "store", lat: 16.83, lon: 75.71, lang: "kn" },
  { name: "Haveri", kind: "store", lat: 14.795, lon: 75.404, lang: "kn" },
  { name: "Hubli Warehouse", kind: "warehouse", lat: 15.365, lon: 75.124, lang: "kn" },
  { name: "Bagalkot Warehouse", kind: "warehouse", lat: 16.186, lon: 75.696, lang: "kn" },
];

export const MAIN_WAREHOUSE = "Hubli Warehouse";

const byName = new Map(LOCATIONS.map((l) => [l.name, l]));

export function locationInfo(name: string): LocationInfo | undefined {
  return byName.get(name);
}

export function isWarehouse(name: string): boolean {
  const info = byName.get(name);
  return info ? info.kind === "warehouse" : /warehouse|godown|\bwh\b/i.test(name);
}

export function roadKm(a: string, b: string): number {
  const A = byName.get(a);
  const B = byName.get(b);
  if (!A || !B) return 120; // unknown place (imported data): assume a mid-range trip
  const rad = Math.PI / 180;
  const dLat = (B.lat - A.lat) * rad;
  const dLon = (B.lon - A.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(A.lat * rad) * Math.cos(B.lat * rad) * Math.sin(dLon / 2) ** 2;
  const straight = 2 * 6371 * Math.asin(Math.sqrt(h));
  return Math.round(straight * 1.3);
}

/** Up to 170 km goes on today's tempo and is on the shelf tomorrow. */
export function transferDays(a: string, b: string): number {
  return roadKm(a, b) <= 170 ? 1 : 2;
}

// Which language each supplier's sales desk prefers. Anyone not listed gets English.
export const SUPPLIER_INFO: Record<string, { city: string; lang: string }> = {
  "Coimbatore Seals & Filters": { city: "Coimbatore", lang: "ta" },
  "Shree Hydraulics": { city: "Pune", lang: "hi" },
  "Deccan Auto Parts": { city: "Hyderabad", lang: "te" },
  "Peenya Industrial Supplies": { city: "Bengaluru", lang: "kn" },
  "Hubli Trade Link": { city: "Hubballi", lang: "kn" },
};

export function supplierLang(name: string): string {
  return SUPPLIER_INFO[name]?.lang ?? "en";
}
