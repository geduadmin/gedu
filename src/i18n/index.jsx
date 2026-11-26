/*
  Arabic / English.
  - t('English text', { n: 3 }) returns the Arabic translation when Arabic is on (falls back to English).
    Placeholders like {n} are filled from the second argument.
  - The choice is saved in the browser and sets <html lang dir>, so the whole layout flips to right-to-left.
  - Default status / certificate names are translated too, because they go through t();
    names the admin typed herself stay exactly as written.
*/
import { createContext, Fragment, useCallback, useContext, useEffect, useState } from 'react';
import AR from './ar';

const KEY = 'lf_lang';
let current = (typeof localStorage !== 'undefined' && localStorage.getItem(KEY)) === 'ar' ? 'ar' : 'en';

const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m)) : s);

export function t(s, vars) {
  if (s == null) return s;
  return fill((current === 'ar' && AR[s]) || s, vars);
}

/** "1 lead" / "5 leads" — Arabic uses one form with the number. */
export function tn(n, one, many, vars) {
  return t(n === 1 ? one : many, { n, ...vars });
}

export const getLang = () => current;
export const isRtl = () => current === 'ar';
/** Locale for dates and month names (Arabic text with Western digits). */
export const locale = () => (current === 'ar' ? 'ar-u-nu-latn' : 'en-GB');

function applyToDocument(lang) {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
}

const LangCtx = createContext({ lang: 'en', setLang: () => {} });

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(current);
  useEffect(() => applyToDocument(lang), [lang]);
  const setLang = useCallback((l) => {
    current = l === 'ar' ? 'ar' : 'en';
    localStorage.setItem(KEY, current);
    setLangState(current);
  }, []);
  // Re-mount the screens (not the data store) so every text and cached label is redrawn.
  return (
    <LangCtx.Provider value={{ lang, setLang }}>
      <Fragment key={lang}>{children}</Fragment>
    </LangCtx.Provider>
  );
}

export const useLang = () => useContext(LangCtx);

/** EN | ع switch. */
export function LangToggle({ className = '' }) {
  const { lang, setLang } = useLang();
  return (
    <div className={`lang-toggle ${className}`} role="group" aria-label="Language / اللغة">
      <button type="button" className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')} title="English">
        EN
      </button>
      <button type="button" className={lang === 'ar' ? 'on' : ''} onClick={() => setLang('ar')} title="العربية">
        عربي
      </button>
    </div>
  );
}
