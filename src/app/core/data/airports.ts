/** IATA airport code -> [city, ISO country]. Only the most common airports; unknown codes still work in "(XXX)" form. */
export const AIRPORTS: Record<string, [string, string]> = {
  // Japan
  HND: ['Tokyo Haneda', 'JP'], NRT: ['Tokyo Narita', 'JP'], KIX: ['Osaka Kansai', 'JP'], ITM: ['Osaka Itami', 'JP'],
  UKB: ['Kobe', 'JP'], NGO: ['Nagoya', 'JP'], CTS: ['Sapporo', 'JP'], FUK: ['Fukuoka', 'JP'], OKA: ['Okinawa', 'JP'],
  HIJ: ['Hiroshima', 'JP'], SDJ: ['Sendai', 'JP'], KMQ: ['Komatsu', 'JP'], KOJ: ['Kagoshima', 'JP'], KMJ: ['Kumamoto', 'JP'],
  // Germany
  FRA: ['Frankfurt', 'DE'], MUC: ['Munich', 'DE'], BER: ['Berlin', 'DE'], DUS: ['Düsseldorf', 'DE'], HAM: ['Hamburg', 'DE'],
  CGN: ['Cologne', 'DE'], STR: ['Stuttgart', 'DE'], HAJ: ['Hannover', 'DE'], NUE: ['Nuremberg', 'DE'], LEJ: ['Leipzig', 'DE'],
  BRE: ['Bremen', 'DE'], DRS: ['Dresden', 'DE'], HHN: ['Frankfurt-Hahn', 'DE'], FMM: ['Memmingen', 'DE'],
  // Europe
  VIE: ['Vienna', 'AT'], ZRH: ['Zurich', 'CH'], GVA: ['Geneva', 'CH'], CDG: ['Paris CDG', 'FR'], ORY: ['Paris Orly', 'FR'],
  AMS: ['Amsterdam', 'NL'], BRU: ['Brussels', 'BE'], LHR: ['London Heathrow', 'GB'], LGW: ['London Gatwick', 'GB'],
  STN: ['London Stansted', 'GB'], MAN: ['Manchester', 'GB'], DUB: ['Dublin', 'IE'], CPH: ['Copenhagen', 'DK'],
  ARN: ['Stockholm', 'SE'], OSL: ['Oslo', 'NO'], HEL: ['Helsinki', 'FI'], WAW: ['Warsaw', 'PL'], PRG: ['Prague', 'CZ'],
  BUD: ['Budapest', 'HU'], ATH: ['Athens', 'GR'], IST: ['Istanbul', 'TR'], SAW: ['Istanbul Sabiha', 'TR'], FCO: ['Rome', 'IT'],
  MXP: ['Milan Malpensa', 'IT'], MAD: ['Madrid', 'ES'], BCN: ['Barcelona', 'ES'], LIS: ['Lisbon', 'PT'], OPO: ['Porto', 'PT'],
  KEF: ['Reykjavik', 'IS'], RIX: ['Riga', 'LV'], TLL: ['Tallinn', 'EE'], VNO: ['Vilnius', 'LT'], BEG: ['Belgrade', 'RS'],
  // Russia and CIS
  SVO: ['Moscow Sheremetyevo', 'RU'], DME: ['Moscow Domodedovo', 'RU'], VKO: ['Moscow Vnukovo', 'RU'], LED: ['Saint Petersburg', 'RU'],
  KBP: ['Kyiv', 'UA'], MSQ: ['Minsk', 'BY'], TBS: ['Tbilisi', 'GE'], EVN: ['Yerevan', 'AM'], ALA: ['Almaty', 'KZ'], TAS: ['Tashkent', 'UZ'],
  // Middle East and Africa
  DXB: ['Dubai', 'AE'], AUH: ['Abu Dhabi', 'AE'], DOH: ['Doha', 'QA'], TLV: ['Tel Aviv', 'IL'], CAI: ['Cairo', 'EG'],
  ADD: ['Addis Ababa', 'ET'], JNB: ['Johannesburg', 'ZA'],
  // Asia
  CAN: ['Guangzhou', 'CN'], CXR: ['Nha Trang', 'VN'], HKG: ['Hong Kong', 'HK'], ICN: ['Seoul Incheon', 'KR'], GMP: ['Seoul Gimpo', 'KR'], PEK: ['Beijing', 'CN'], PKX: ['Beijing Daxing', 'CN'],
  PVG: ['Shanghai Pudong', 'CN'], SHA: ['Shanghai Hongqiao', 'CN'], TPE: ['Taipei', 'TW'], SIN: ['Singapore', 'SG'],
  BKK: ['Bangkok', 'TH'], DMK: ['Bangkok Don Mueang', 'TH'], KUL: ['Kuala Lumpur', 'MY'], CGK: ['Jakarta', 'ID'], DPS: ['Bali', 'ID'],
  MNL: ['Manila', 'PH'], SGN: ['Ho Chi Minh City', 'VN'], HAN: ['Hanoi', 'VN'], DEL: ['Delhi', 'IN'], BOM: ['Mumbai', 'IN'], CMB: ['Colombo', 'LK'],
  // Americas and Oceania
  JFK: ['New York JFK', 'US'], EWR: ['Newark', 'US'], LAX: ['Los Angeles', 'US'], SFO: ['San Francisco', 'US'], ORD: ['Chicago', 'US'],
  IAD: ['Washington Dulles', 'US'], SEA: ['Seattle', 'US'], BOS: ['Boston', 'US'], ATL: ['Atlanta', 'US'], DFW: ['Dallas', 'US'],
  MIA: ['Miami', 'US'], HNL: ['Honolulu', 'US'], YVR: ['Vancouver', 'CA'], YYZ: ['Toronto', 'CA'], MEX: ['Mexico City', 'MX'],
  GRU: ['São Paulo', 'BR'], SYD: ['Sydney', 'AU'], MEL: ['Melbourne', 'AU'], AKL: ['Auckland', 'NZ'],
};

/** IATA airline code -> name. */
export const AIRLINES: Record<string, string> = {
  LH: 'Lufthansa', LX: 'SWISS', OS: 'Austrian', SN: 'Brussels Airlines', EW: 'Eurowings', DE: 'Condor', '4Y': 'Eurowings Discover',
  NH: 'ANA', JL: 'Japan Airlines', MM: 'Peach', GK: 'Jetstar Japan', BC: 'Skymark', '7G': 'StarFlyer', JW: 'Vanilla', ZG: 'Zipair', IJ: 'Spring Japan',
  KE: 'Korean Air', OZ: 'Asiana', '7C': 'Jeju Air', TW: "T'way", CX: 'Cathay Pacific', HX: 'Hong Kong Airlines', SQ: 'Singapore Airlines',
  TR: 'Scoot', TG: 'Thai Airways', BR: 'EVA Air', CI: 'China Airlines', MU: 'China Eastern', CA: 'Air China', CZ: 'China Southern',
  EK: 'Emirates', QR: 'Qatar Airways', EY: 'Etihad', TK: 'Turkish Airlines', PC: 'Pegasus', AY: 'Finnair', SK: 'SAS', DY: 'Norwegian',
  BA: 'British Airways', AF: 'Air France', KL: 'KLM', IB: 'Iberia', AZ: 'ITA Airways', LO: 'LOT', FI: 'Icelandair', TP: 'TAP Air Portugal',
  A3: 'Aegean', UA: 'United', AA: 'American', DL: 'Delta', AC: 'Air Canada', QF: 'Qantas', VA: 'Virgin Australia', NZ: 'Air New Zealand',
  VN: 'Vietnam Airlines', MH: 'Malaysia Airlines', GA: 'Garuda', PR: 'Philippine Airlines', SU: 'Aeroflot', S7: 'S7 Airlines', U6: 'Ural Airlines',
  LY: 'El Al', MS: 'EgyptAir', ET: 'Ethiopian', AI: 'Air India', '6E': 'IndiGo', FR: 'Ryanair', U2: 'easyJet', W6: 'Wizz Air', VY: 'Vueling', HV: 'Transavia',
};
