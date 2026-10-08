export type Lang = 'en' | 'ko' | 'es'

const STORAGE_KEY = 'lang'

const SUPPORTED: readonly Lang[] = ['en', 'ko', 'es']

const KOREA_TIME_ZONES = new Set(['Asia/Seoul', 'ROK'])

// IANA zones of Spanish-speaking countries (Spain, Latin America, Equatorial
// Guinea, Puerto Rico), plus the legacy aliases some browsers still report.
// America/Argentina/* is matched by prefix below.
const SPANISH_TIME_ZONES = new Set([
  'Europe/Madrid', 'Africa/Ceuta', 'Atlantic/Canary',
  'America/Mexico_City', 'America/Cancun', 'America/Merida', 'America/Monterrey',
  'America/Matamoros', 'America/Chihuahua', 'America/Ciudad_Juarez', 'America/Ojinaga',
  'America/Mazatlan', 'America/Bahia_Banderas', 'America/Hermosillo', 'America/Tijuana',
  'America/Ensenada', 'America/Santa_Isabel', 'Mexico/General', 'Mexico/BajaNorte', 'Mexico/BajaSur',
  'America/Guatemala', 'America/El_Salvador', 'America/Tegucigalpa', 'America/Managua',
  'America/Costa_Rica', 'America/Panama', 'America/Havana', 'Cuba', 'America/Santo_Domingo',
  'America/Puerto_Rico',
  'America/Bogota', 'America/Caracas', 'America/Guayaquil', 'Pacific/Galapagos', 'America/Lima',
  'America/La_Paz', 'America/Santiago', 'America/Punta_Arenas', 'Pacific/Easter',
  'Chile/Continental', 'Chile/EasterIsland',
  'America/Buenos_Aires', 'America/Catamarca', 'America/Cordoba', 'America/Jujuy',
  'America/Mendoza', 'America/Rosario',
  'America/Montevideo', 'America/Asuncion',
  'Africa/Malabo',
])

function asLang(value: string | null | undefined): Lang | null {
  if (!value) return null
  const base = value.toLowerCase().split(/[-_]/)[0]
  return (SUPPORTED as readonly string[]).includes(base) ? (base as Lang) : null
}

function langFromTimeZone(): Lang | null {
  let tz: string | undefined
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return null
  }
  if (!tz) return null
  if (KOREA_TIME_ZONES.has(tz)) return 'ko'
  if (SPANISH_TIME_ZONES.has(tz) || tz.startsWith('America/Argentina/')) return 'es'
  return null
}

export function storedLang(): Lang | null {
  try {
    return asLang(localStorage.getItem(STORAGE_KEY))
  } catch {
    return null
  }
}

export function storeLang(lang: Lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    // Storage blocked (private mode etc.) — the choice just won't persist.
  }
}

/**
 * Picks the initial UI language without any network call. Location is
 * inferred from the device time zone, since a static host has no geo-IP.
 *
 *   1. `?lang=xx` in the URL (shareable links, testing)
 *   2. The choice saved from the language picker
 *   3. Browser language, if it is Korean or Spanish
 *   4. Time zone: Korea → ko, Spanish-speaking country → es
 *   5. English
 */
export function detectLang(): Lang {
  const fromUrl = asLang(new URLSearchParams(window.location.search).get('lang'))
  if (fromUrl) return fromUrl

  const saved = storedLang()
  if (saved) return saved

  const browser = asLang(navigator.languages?.[0] ?? navigator.language)
  if (browser === 'ko' || browser === 'es') return browser

  return langFromTimeZone() ?? 'en'
}
