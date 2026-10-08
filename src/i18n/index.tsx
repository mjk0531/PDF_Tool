import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import { detectLang, storeLang, type Lang } from './detect'

export type { Lang }

export const LANGUAGES: { code: Lang; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'ko', label: '한국어' },
  { code: 'es', label: 'Español' },
]

export type Messages<T> = Record<Lang, T>

/** Turns string literal types (e.g. from `n === 1 ? 'page' : 'pages'`) into plain `string`. */
type Widen<T> = T extends string
  ? string
  : T extends ReactElement
    ? T
    : T extends (...args: infer A) => infer R
      ? (...args: A) => Widen<R>
      : T extends object
        ? { [K in keyof T]: Widen<T[K]> }
        : T

/**
 * Declares the UI text for one area of the app. `en` defines the shape;
 * `ko` and `es` must match it key-for-key, so a missing or misspelled
 * translation fails the type check. Values may be strings, or functions for
 * anything with numbers or plurals.
 */
export function defineMessages<T>(messages: {
  en: T
  ko: NoInfer<Widen<T>>
  es: NoInfer<Widen<T>>
}): Messages<Widen<T>> {
  return messages as Messages<Widen<T>>
}

let activeLang: Lang = detectLang()
document.documentElement.lang = activeLang

/** Lookup for code outside React (lib/*). Resolves against the language active at call time. */
export function pick<T>(messages: Messages<T>): T {
  return messages[activeLang]
}

interface LangContextValue {
  lang: Lang
  setLang: (lang: Lang) => void
}

const LangContext = createContext<LangContextValue>({ lang: activeLang, setLang: () => {} })

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(activeLang)

  const setLang = useCallback((next: Lang) => {
    activeLang = next
    storeLang(next)
    setLangState(next)
    // An explicit pick beats a ?lang= link; drop the param so a reload keeps the pick.
    const url = new URL(window.location.href)
    if (url.searchParams.has('lang')) {
      url.searchParams.delete('lang')
      history.replaceState(null, '', url.pathname + url.search + url.hash)
    }
  }, [])

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang])
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

export function useLang() {
  return useContext(LangContext)
}

/** Returns the active language's entry from a `defineMessages` table. */
export function useMessages<T>(messages: Messages<T>): T {
  return messages[useLang().lang]
}
