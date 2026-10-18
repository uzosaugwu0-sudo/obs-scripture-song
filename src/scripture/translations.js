// ── Translations ─────────────────────────────────────────────────────────
// `id` is the bolls.life API code. `key` is the short name shown in the
// dropdown and appended to the on-screen reference.
//
// To add a translation, add a row here — nothing else needs changing. The
// language dropdown is built from the `lang` values automatically. Check
// the code exists at bolls.life first; an unknown code returns a 404 at
// lookup time, which is not something to discover mid-service.
export const TRANSLATIONS = [
  { key: 'KJV',     id: 'KJV',     lang: 'English', label: 'King James Version' },
  { key: 'NKJV',    id: 'NKJV',    lang: 'English', label: 'New King James Version' },
  { key: 'NIV',     id: 'NIV',     lang: 'English', label: 'New International Version' },
  { key: 'NIV2011', id: 'NIV2011', lang: 'English', label: 'New International Version 2011' },
  { key: 'ESV',     id: 'ESV',     lang: 'English', label: 'English Standard Version' },
  { key: 'NLT',     id: 'NLT',     lang: 'English', label: 'New Living Translation' },
  { key: 'NASB',    id: 'NASB',    lang: 'English', label: 'New American Standard Bible' },
  { key: 'AMP',     id: 'AMP',     lang: 'English', label: 'Amplified Bible' },
  { key: 'MSG',     id: 'MSG',     lang: 'English', label: 'The Message' },
  { key: 'CSB',     id: 'CSB17',   lang: 'English', label: 'Christian Standard Bible' },
  { key: 'NET',     id: 'NET',     lang: 'English', label: 'New English Translation' },
  { key: 'RSV',     id: 'RSV',     lang: 'English', label: 'Revised Standard Version' },
  { key: 'ASV',     id: 'ASV',     lang: 'English', label: 'American Standard Version' },
  { key: 'WEB',     id: 'WEB',     lang: 'English', label: 'World English Bible' },
  { key: 'WEBBE',   id: 'WEBBE',   lang: 'English', label: 'World English Bible (British)' },
  { key: 'BSB',     id: 'BSB',     lang: 'English', label: 'Berean Study Bible' },
  { key: 'MEV',     id: 'MEV',     lang: 'English', label: 'Modern English Version' },
  { key: 'CEV',     id: 'CEVD',    lang: 'English', label: 'Contemporary English Version' },
  { key: 'ISV',     id: 'ISV',     lang: 'English', label: 'International Standard Version' },
  { key: 'ERV',     id: 'ERV',     lang: 'English', label: 'Easy-to-Read Version' },
  { key: 'NLV',     id: 'NLV',     lang: 'English', label: 'New Life Version' },
  { key: 'GNT',     id: 'GNT',     lang: 'English', label: 'Good News Translation' },
  { key: 'GNV',     id: 'GNV',     lang: 'English', label: 'Geneva Bible' },
  { key: 'LSV',     id: 'LSV',     lang: 'English', label: 'Literal Standard Version' },
  { key: 'BBE',     id: 'BBE',     lang: 'English', label: 'Bible in Basic English' },
  { key: 'DARBY',   id: 'DARBY',   lang: 'English', label: 'Darby Translation' },
  { key: 'YLT',     id: 'YLT',     lang: 'English', label: "Young's Literal Translation" },
  { key: 'DRB',     id: 'DRB',     lang: 'English', label: 'Douay-Rheims Bible' },
  { key: 'ALM21',   id: 'ALM21',   lang: 'Português', label: 'Almeida Século 21' },
  { key: 'SYNOD',   id: 'SYNOD',   lang: 'Русский',  label: 'Синодальный перевод' },
  { key: 'CUV',     id: 'CUV',     lang: '中文',      label: '和合本' },
];

export const LANGUAGES = TRANSLATIONS.reduce((acc, t) => {
  if (!acc.includes(t.lang)) acc.push(t.lang);
  return acc;
}, []);

export function translationById(key) {
  return TRANSLATIONS.find(t => t.key === key || t.id === key) || TRANSLATIONS[0];
}
