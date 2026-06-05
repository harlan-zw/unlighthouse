// ISO 3166-1 alpha-3 to alpha-2 and country names
export const countryData: Record<string, { alpha2: string, name: string }> = {
  deu: { alpha2: 'de', name: 'Germany' },
  fra: { alpha2: 'fr', name: 'France' },
  ind: { alpha2: 'in', name: 'India' },
  usa: { alpha2: 'us', name: 'United States' },
  gbr: { alpha2: 'gb', name: 'United Kingdom' },
  nld: { alpha2: 'nl', name: 'Netherlands' },
  pol: { alpha2: 'pl', name: 'Poland' },
  rus: { alpha2: 'ru', name: 'Russia' },
  esp: { alpha2: 'es', name: 'Spain' },
  ita: { alpha2: 'it', name: 'Italy' },
  bra: { alpha2: 'br', name: 'Brazil' },
  can: { alpha2: 'ca', name: 'Canada' },
  aus: { alpha2: 'au', name: 'Australia' },
  jpn: { alpha2: 'jp', name: 'Japan' },
  chn: { alpha2: 'cn', name: 'China' },
  kor: { alpha2: 'kr', name: 'South Korea' },
  mex: { alpha2: 'mx', name: 'Mexico' },
  arg: { alpha2: 'ar', name: 'Argentina' },
  tur: { alpha2: 'tr', name: 'Turkey' },
  sau: { alpha2: 'sa', name: 'Saudi Arabia' },
  zaf: { alpha2: 'za', name: 'South Africa' },
  egy: { alpha2: 'eg', name: 'Egypt' },
  nga: { alpha2: 'ng', name: 'Nigeria' },
  ken: { alpha2: 'ke', name: 'Kenya' },
  idn: { alpha2: 'id', name: 'Indonesia' },
  tha: { alpha2: 'th', name: 'Thailand' },
  vnm: { alpha2: 'vn', name: 'Vietnam' },
  phl: { alpha2: 'ph', name: 'Philippines' },
  mys: { alpha2: 'my', name: 'Malaysia' },
  sgp: { alpha2: 'sg', name: 'Singapore' },
  pak: { alpha2: 'pk', name: 'Pakistan' },
  bgd: { alpha2: 'bd', name: 'Bangladesh' },
  ukr: { alpha2: 'ua', name: 'Ukraine' },
  rou: { alpha2: 'ro', name: 'Romania' },
  cze: { alpha2: 'cz', name: 'Czechia' },
  hun: { alpha2: 'hu', name: 'Hungary' },
  aut: { alpha2: 'at', name: 'Austria' },
  che: { alpha2: 'ch', name: 'Switzerland' },
  bel: { alpha2: 'be', name: 'Belgium' },
  swe: { alpha2: 'se', name: 'Sweden' },
  nor: { alpha2: 'no', name: 'Norway' },
  dnk: { alpha2: 'dk', name: 'Denmark' },
  fin: { alpha2: 'fi', name: 'Finland' },
  prt: { alpha2: 'pt', name: 'Portugal' },
  grc: { alpha2: 'gr', name: 'Greece' },
  irl: { alpha2: 'ie', name: 'Ireland' },
  nzl: { alpha2: 'nz', name: 'New Zealand' },
  isr: { alpha2: 'il', name: 'Israel' },
  are: { alpha2: 'ae', name: 'UAE' },
  col: { alpha2: 'co', name: 'Colombia' },
  chl: { alpha2: 'cl', name: 'Chile' },
  per: { alpha2: 'pe', name: 'Peru' },
  ven: { alpha2: 've', name: 'Venezuela' },
  irn: { alpha2: 'ir', name: 'Iran' },
  irq: { alpha2: 'iq', name: 'Iraq' },
  twn: { alpha2: 'tw', name: 'Taiwan' },
  hkg: { alpha2: 'hk', name: 'Hong Kong' },
  mac: { alpha2: 'mo', name: 'Macau' },
  svk: { alpha2: 'sk', name: 'Slovakia' },
  bgr: { alpha2: 'bg', name: 'Bulgaria' },
  hrv: { alpha2: 'hr', name: 'Croatia' },
  srb: { alpha2: 'rs', name: 'Serbia' },
  svn: { alpha2: 'si', name: 'Slovenia' },
  ltu: { alpha2: 'lt', name: 'Lithuania' },
  lva: { alpha2: 'lv', name: 'Latvia' },
  est: { alpha2: 'ee', name: 'Estonia' },
  blr: { alpha2: 'by', name: 'Belarus' },
  kaz: { alpha2: 'kz', name: 'Kazakhstan' },
  uzb: { alpha2: 'uz', name: 'Uzbekistan' },
  aze: { alpha2: 'az', name: 'Azerbaijan' },
  geo: { alpha2: 'ge', name: 'Georgia' },
  arm: { alpha2: 'am', name: 'Armenia' },
}

// Convert country code to circle-flags icon name
export function countryCodeToFlagIcon(code: string): string {
  if (!code)
    return 'i-lucide-globe'
  const lowerCode = code.toLowerCase()
  const data = countryData[lowerCode]
  const alpha2 = data?.alpha2 || (lowerCode.length === 2 ? lowerCode : null)
  if (!alpha2)
    return 'i-lucide-globe'
  return `i-circle-flags-${alpha2}`
}

// Get country display name from code
export function getCountryName(code: string, fallback?: string): string {
  if (!code)
    return fallback || 'Unknown'
  const data = countryData[code.toLowerCase()]
  return data?.name || fallback || code.toUpperCase()
}

// Shorter aliases used at call sites.
export { countryCodeToFlagIcon as countryFlag, getCountryName as countryName }
