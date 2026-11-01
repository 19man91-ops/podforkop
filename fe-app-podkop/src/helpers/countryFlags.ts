import { E } from './element';

const FLAG_EMOJI_PATTERN =
  /([\u{1f1e6}-\u{1f1ff}]{2}|\u{1f3f4}[\u{e0061}-\u{e007a}]+\u{e007f})/gu;
const EXACT_FLAG_EMOJI_PATTERN =
  /^([\u{1f1e6}-\u{1f1ff}]{2}|\u{1f3f4}[\u{e0061}-\u{e007a}]+\u{e007f})$/u;

export function renderFlagEmojis(value: string): (HTMLElement | string)[] {
  if (!value) return [];
  // If outside browser DOM environment (e.g. Node tests without DOM), return string parts
  if (typeof document === 'undefined') {
    return [value];
  }
  return value
    .split(FLAG_EMOJI_PATTERN)
    .filter(Boolean)
    .map((part) =>
      EXACT_FLAG_EMOJI_PATTERN.test(part)
        ? E('span', { class: 'pdk_dashboard-page__flag-emoji' }, part)
        : part,
    );
}

export function flagFromCountryCode(code: string): string {
  const normalized = code.trim().toUpperCase();
  if (normalized === 'UK') return '\u{1F1EC}\u{1F1E7}'; // GB
  if (normalized.length !== 2) return '';
  const first = normalized.charCodeAt(0);
  const second = normalized.charCodeAt(1);
  if (first < 65 || first > 90 || second < 65 || second > 90) return '';
  return String.fromCodePoint(0x1f1e6 + first - 65, 0x1f1e6 + second - 65);
}

const ISO_COUNTRY_CODES = new Set([
  'AD',
  'AE',
  'AF',
  'AG',
  'AI',
  'AL',
  'AM',
  'AO',
  'AQ',
  'AR',
  'AS',
  'AT',
  'AU',
  'AW',
  'AX',
  'AZ',
  'BA',
  'BB',
  'BD',
  'BE',
  'BF',
  'BG',
  'BH',
  'BI',
  'BJ',
  'BL',
  'BM',
  'BN',
  'BO',
  'BQ',
  'BR',
  'BS',
  'BT',
  'BV',
  'BW',
  'BY',
  'BZ',
  'CA',
  'CC',
  'CD',
  'CF',
  'CG',
  'CH',
  'CI',
  'CK',
  'CL',
  'CM',
  'CN',
  'CO',
  'CR',
  'CU',
  'CV',
  'CW',
  'CX',
  'CY',
  'CZ',
  'DE',
  'DJ',
  'DK',
  'DM',
  'DO',
  'DZ',
  'EC',
  'EE',
  'EG',
  'EH',
  'ER',
  'ES',
  'ET',
  'FI',
  'FJ',
  'FK',
  'FM',
  'FO',
  'FR',
  'GA',
  'GB',
  'GD',
  'GE',
  'GF',
  'GG',
  'GH',
  'GI',
  'GL',
  'GM',
  'GN',
  'GP',
  'GQ',
  'GR',
  'GS',
  'GT',
  'GU',
  'GW',
  'GY',
  'HK',
  'HM',
  'HN',
  'HR',
  'HT',
  'HU',
  'ID',
  'IE',
  'IL',
  'IM',
  'IN',
  'IO',
  'IQ',
  'IR',
  'IS',
  'IT',
  'JE',
  'JM',
  'JO',
  'JP',
  'KE',
  'KG',
  'KH',
  'KI',
  'KM',
  'KN',
  'KP',
  'KR',
  'KW',
  'KY',
  'KZ',
  'LA',
  'LB',
  'LC',
  'LI',
  'LK',
  'LR',
  'LS',
  'LT',
  'LU',
  'LV',
  'LY',
  'MA',
  'MC',
  'MD',
  'ME',
  'MF',
  'MG',
  'MH',
  'MK',
  'ML',
  'MM',
  'MN',
  'MO',
  'MP',
  'MQ',
  'MR',
  'MS',
  'MT',
  'MU',
  'MV',
  'MW',
  'MX',
  'MY',
  'MZ',
  'NA',
  'NC',
  'NE',
  'NF',
  'NG',
  'NI',
  'NL',
  'NO',
  'NP',
  'NR',
  'NU',
  'NZ',
  'OM',
  'PA',
  'PE',
  'PF',
  'PG',
  'PH',
  'PK',
  'PL',
  'PM',
  'PN',
  'PR',
  'PS',
  'PT',
  'PW',
  'PY',
  'QA',
  'RE',
  'RO',
  'RS',
  'RU',
  'RW',
  'SA',
  'SB',
  'SC',
  'SD',
  'SE',
  'SG',
  'SH',
  'SI',
  'SJ',
  'SK',
  'SL',
  'SM',
  'SN',
  'SO',
  'SR',
  'SS',
  'ST',
  'SV',
  'SX',
  'SY',
  'SZ',
  'TC',
  'TD',
  'TF',
  'TG',
  'TH',
  'TJ',
  'TK',
  'TL',
  'TM',
  'TN',
  'TO',
  'TR',
  'TT',
  'TV',
  'TW',
  'TZ',
  'UA',
  'UG',
  'UM',
  'US',
  'UY',
  'UZ',
  'VA',
  'VC',
  'VE',
  'VG',
  'VI',
  'VN',
  'VU',
  'WF',
  'WS',
  'YE',
  'YT',
  'ZA',
  'ZM',
  'ZW',
  'UK',
]);

const COUNTRY_NAMES: [RegExp, string][] = [
  [
    /(?:^|[^a-zA-Zа-яА-Я0-9])(?:russia|россия|рф)(?:$|[^a-zA-Zа-яА-Я0-9])/i,
    'RU',
  ],
  [
    /(?:^|[^a-zA-Zа-яА-Я0-9])(?:finland|финляндия)(?:$|[^a-zA-Zа-яА-Я0-9])/i,
    'FI',
  ],
  [
    /(?:^|[^a-zA-Zа-яА-Я0-9])(?:germany|германия|deutschland)(?:$|[^a-zA-Zа-яА-Я0-9])/i,
    'DE',
  ],
  [
    /(?:^|[^a-zA-Zа-яА-Я0-9])(?:netherlands|нидерланды|holland)(?:$|[^a-zA-Zа-яА-Я0-9])/i,
    'NL',
  ],
  [/(?:^|[^a-zA-Zа-яА-Я0-9])(?:sweden|швеция)(?:$|[^a-zA-Zа-яА-Я0-9])/i, 'SE'],
  [
    /(?:^|[^a-zA-Zа-яА-Я0-9])(?:usa|сша|united states)(?:$|[^a-zA-Zа-яА-Я0-9])/i,
    'US',
  ],
  [/(?:^|[^a-zA-Zа-яА-Я0-9])(?:france|франция)(?:$|[^a-zA-Zа-яА-Я0-9])/i, 'FR'],
  [
    /(?:^|[^a-zA-Zа-яА-Я0-9])(?:united kingdom|великобритания|england|англия)(?:$|[^a-zA-Zа-яА-Я0-9])/i,
    'GB',
  ],
  [/(?:^|[^a-zA-Zа-яА-Я0-9])(?:poland|польша)(?:$|[^a-zA-Zа-яА-Я0-9])/i, 'PL'],
  [/(?:^|[^a-zA-Zа-яА-Я0-9])(?:turkey|турция)(?:$|[^a-zA-Zа-яА-Я0-9])/i, 'TR'],
  [
    /(?:^|[^a-zA-Zа-яА-Я0-9])(?:kazakhstan|казахстан)(?:$|[^a-zA-Zа-яА-Я0-9])/i,
    'KZ',
  ],
  [/(?:^|[^a-zA-Zа-яА-Я0-9])(?:japan|япония)(?:$|[^a-zA-Zа-яА-Я0-9])/i, 'JP'],
  [
    /(?:^|[^a-zA-Zа-яА-Я0-9])(?:singapore|сингапур)(?:$|[^a-zA-Zа-яА-Я0-9])/i,
    'SG',
  ],
  [
    /(?:^|[^a-zA-Zа-яА-Я0-9])(?:hong\s*kong|гонконг)(?:$|[^a-zA-Zа-яА-Я0-9])/i,
    'HK',
  ],
  [
    /(?:^|[^a-zA-Zа-яА-Я0-9])(?:austria|австрия)(?:$|[^a-zA-Zа-яА-Я0-9])/i,
    'AT',
  ],
  [
    /(?:^|[^a-zA-Zа-яА-Я0-9])(?:switzerland|швейцария)(?:$|[^a-zA-Zа-яА-Я0-9])/i,
    'CH',
  ],
  [/(?:^|[^a-zA-Zа-яА-Я0-9])(?:spain|испания)(?:$|[^a-zA-Zа-яА-Я0-9])/i, 'ES'],
  [/(?:^|[^a-zA-Zа-яА-Я0-9])(?:italy|италия)(?:$|[^a-zA-Zа-яА-Я0-9])/i, 'IT'],
  [
    /(?:^|[^a-zA-Zа-яА-Я0-9])(?:estonia|эстония)(?:$|[^a-zA-Zа-яА-Я0-9])/i,
    'EE',
  ],
  [/(?:^|[^a-zA-Zа-яА-Я0-9])(?:latvia|латвия)(?:$|[^a-zA-Zа-яА-Я0-9])/i, 'LV'],
  [
    /(?:^|[^a-zA-Zа-яА-Я0-9])(?:lithuania|литва)(?:$|[^a-zA-Zа-яА-Я0-9])/i,
    'LT',
  ],
  [/(?:^|[^a-zA-Zа-яА-Я0-9])(?:czech|чехия)(?:$|[^a-zA-Zа-яА-Я0-9])/i, 'CZ'],
  [
    /(?:^|[^a-zA-Zа-яА-Я0-9])(?:uae|оаэ|dubai|дубай)(?:$|[^a-zA-Zа-яА-Я0-9])/i,
    'AE',
  ],
  [/(?:^|[^a-zA-Zа-яА-Я0-9])(?:serbia|сербия)(?:$|[^a-zA-Zа-яА-Я0-9])/i, 'RS'],
  [/(?:^|[^a-zA-Zа-яА-Я0-9])(?:cyprus|кипр)(?:$|[^a-zA-Zа-яА-Я0-9])/i, 'CY'],
  [/(?:^|[^a-zA-Zа-яА-Я0-9])(?:georgia|грузия)(?:$|[^a-zA-Zа-яА-Я0-9])/i, 'GE'],
  [
    /(?:^|[^a-zA-Zа-яА-Я0-9])(?:armenia|армения)(?:$|[^a-zA-Zа-яА-Я0-9])/i,
    'AM',
  ],
  [
    /(?:^|[^a-zA-Zа-яА-Я0-9])(?:moldova|молдова)(?:$|[^a-zA-Zа-яА-Я0-9])/i,
    'MD',
  ],
  [
    /(?:^|[^a-zA-Zа-яА-Я0-9])(?:bulgaria|болгария)(?:$|[^a-zA-Zа-яА-Я0-9])/i,
    'BG',
  ],
  [
    /(?:^|[^a-zA-Zа-яА-Я0-9])(?:romania|румыния)(?:$|[^a-zA-Zа-яА-Я0-9])/i,
    'RO',
  ],
  [
    /(?:^|[^a-zA-Zа-яА-Я0-9])(?:norway|норвегия)(?:$|[^a-zA-Zа-яА-Я0-9])/i,
    'NO',
  ],
  [/(?:^|[^a-zA-Zа-яА-Я0-9])(?:denmark|дания)(?:$|[^a-zA-Zа-яА-Я0-9])/i, 'DK'],
  [/(?:^|[^a-zA-Zа-яА-Я0-9])(?:canada|канада)(?:$|[^a-zA-Zа-яА-Я0-9])/i, 'CA'],
  [
    /(?:^|[^a-zA-Zа-яА-Я0-9])(?:brazil|бразилия)(?:$|[^a-zA-Zа-яА-Я0-9])/i,
    'BR',
  ],
  [/(?:^|[^a-zA-Zа-яА-Я0-9])(?:india|индия)(?:$|[^a-zA-Zа-яА-Я0-9])/i, 'IN'],
  [/(?:^|[^a-zA-Zа-яА-Я0-9])(?:israel|израиль)(?:$|[^a-zA-Zа-яА-Я0-9])/i, 'IL'],
  [
    /(?:^|[^a-zA-Zа-яА-Я0-9])(?:iceland|исландия)(?:$|[^a-zA-Zа-яА-Я0-9])/i,
    'IS',
  ],
  [
    /(?:^|[^a-zA-Zа-яА-Я0-9])(?:ireland|ирландия)(?:$|[^a-zA-Zа-яА-Я0-9])/i,
    'IE',
  ],
  [
    /(?:^|[^a-zA-Zа-яА-Я0-9])(?:ukraine|украина)(?:$|[^a-zA-Zа-яА-Я0-9])/i,
    'UA',
  ],
  [
    /(?:^|[^a-zA-Zа-яА-Я0-9])(?:belarus|беларусь|белоруссия)(?:$|[^a-zA-Zа-яА-Я0-9])/i,
    'BY',
  ],
];

export function formatProxyDisplayName(rawName: string): string {
  if (!rawName) return '';

  // Strip subscription provider hash prefix like "podkop-sub-e0efd6c532449773551c899163650978/"
  let name = rawName.replace(/^.*(?:podkop|forkop)?-sub-[0-9a-fA-F]+\//, '');
  // Also strip leading group/section tag if formatted as "section-name/actual-node"
  name = name.replace(/^[a-zA-Z0-9_-]+\/(?=.)/, '');
  name = name.trim();

  // If already contains a country flag emoji, keep as is
  if (FLAG_EMOJI_PATTERN.test(name)) {
    return name;
  }

  // Check if name begins with a 2-letter ISO code: e.g. "FI-ruspace-user1", "[NL] Server", "DE_Node"
  const prefixMatch = name.match(/^\[?([A-Za-z]{2})\]?[-_\s:.]+(.*)$/);
  if (prefixMatch) {
    const candidate = prefixMatch[1].toUpperCase();
    if (ISO_COUNTRY_CODES.has(candidate)) {
      const flag = flagFromCountryCode(candidate);
      if (flag) {
        return `${flag} ${name}`;
      }
    }
  }

  // Check if any country name matches in the string
  for (const [regex, code] of COUNTRY_NAMES) {
    if (regex.test(name)) {
      const flag = flagFromCountryCode(code);
      if (flag) {
        return `${flag} ${name}`;
      }
    }
  }

  return name;
}
