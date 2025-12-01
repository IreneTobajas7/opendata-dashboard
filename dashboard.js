// Deporte Escolar Bizkaia - Scrollytelling interactivo
// Datos disponibles: temporada, deporte, femenino, masculino

const CONFIG = {
  colors: {
    femenino: '#0f766e',
    masculino: '#ff8a3d',
    selected: '#0b3a36',
    grid: 'rgba(15, 118, 110, 0.08)',
    parityZone: 'rgba(15, 118, 110, 0.12)'
  },
  parityRange: { min: 45, max: 55 },
  seasons: ['2018-2019', '2019-2020', '2021-2022', '2022-2023', '2023-2024']
};

// Función helper para obtener colores según el modo (claro/oscuro)
function getChartColors() {
  const isDark = document.body.classList.contains('dark');
  if (isDark) {
    return {
      femenino: '#5eead4', // Teal claro para modo oscuro
      masculino: '#ff8a3d', // Naranja (se mantiene igual)
      selected: '#5eead4', // Teal claro para modo oscuro
      grid: 'rgba(94, 234, 212, 0.2)', // Grid más visible en modo oscuro
      parityZone: 'rgba(94, 234, 212, 0.15)', // Zona de paridad más visible
      text: 'rgba(239, 250, 247, 0.9)', // Texto claro
      textMuted: 'rgba(209, 229, 222, 0.7)', // Texto muted claro
      axis: 'rgba(94, 234, 212, 0.5)' // Ejes más visibles
    };
  }
  return CONFIG.colors;
}

// Funciones helper para formatear números en formato español
// Formatea un número con decimales usando coma (,) en lugar de punto (.)
function formatDecimalES(value, decimals = 1) {
  return value.toFixed(decimals).replace('.', ',');
}

// Formatea un porcentaje con decimales usando coma (,) en lugar de punto (.)
function formatPercentES(value, decimals = 1) {
  return `${formatDecimalES(value, decimals)}%`;
}

// Formatea un número entero con separador de millares (punto)
function formatNumberES(value) {
  return value.toLocaleString('es-ES');
}

const COMPETICION_ALLOWED_ORDER = ['Benjamín', 'Alevín', 'Infantil', 'Cadete', 'Juvenil'];
const COMPETICION_ALLOWED_CATEGORIES = new Set(COMPETICION_ALLOWED_ORDER);
// Deportes considerados outliers (casos extremos)
const OUTLIER_DEPORTES = new Set(['FÚTBOL', 'BALONCESTO', 'GIMNASIA']);

let state = {
  allData: { temporal: [], deportes: [], porDeporte: [], ofertaCompeticion: [] },
  filteredData: {
    deportes: [],
    porDeporte: [],
    ofertaCompeticion: {
      categories: [],
      totalActividades: 0,
      matchedActividades: 0,
      focusDeporte: null,
      focusHasData: false
    }
  },
  filters: {
    temporada: 'todas',
    deporte: 'todos',
    genero: 'todos',
    selectedDeporte: null,
    categoriaOferta: null,
    excludeOutliers: false,
    raceIndex: CONFIG.seasons.length - 1,
    raceMode: 'total'
  },
  meta: {
  },
  charts: {},
  raceTimer: null
};
let pluginsRegistered = false;

const rangeControls = {
  minRange: null,
  maxRange: null,
  minInput: null,
  maxInput: null,
  progress: null,
  step: 100
};

function getParityColor(pct) {
  // La paridad óptima es 45-55% participación femenina
  // <25% o >75%: peor caso (naranja/rojo intenso)
  // 25-40% o 60-75%: segundo peor (naranja/amarillo)
  // 40-45% o 55-60%: segundo mejor (verde claro, cerca de paridad)
  // 45-55%: mejor caso - PARIDAD ÓPTIMA (teal/verde)
  
  if (pct < 25) {
    // <25%: naranja/rojo intenso (peor caso - desigualdad extrema hacia lo masculino)
    return `rgba(255, 138, 61, ${0.7 + (pct / 25) * 0.2})`;
  }
  if (pct < 40) {
    // 25-40%: naranja/amarillo (segundo peor - desequilibrio significativo)
    return `rgba(251, 191, 36, ${0.6 + ((pct - 25) / 15) * 0.3})`;
  }
  if (pct < 45) {
    // 40-45%: verde claro (segundo mejor - cerca de paridad)
    return `rgba(34, 197, 94, ${0.5 + ((pct - 40) / 5) * 0.3})`;
  }
  if (pct <= 55) {
    // 45-55%: verde oscuro (MEJOR CASO - PARIDAD ÓPTIMA)
    // Verde más oscuro que el segundo mejor caso, pero en la misma gama de verdes
    return `rgba(22, 163, 74, ${0.7 + ((pct - 45) / 10) * 0.2})`;
  }
  if (pct <= 60) {
    // 55-60%: verde claro (segundo mejor - cerca de paridad, igual que 40-45%)
    const intensity = 0.5 + ((60 - pct) / 5) * 0.3;
    return `rgba(34, 197, 94, ${intensity})`;
  }
  if (pct <= 75) {
    // 60-75%: naranja/amarillo (segundo peor - desequilibrio significativo, igual que 25-40%)
    const intensity = 0.6 + ((75 - pct) / 15) * 0.3;
    return `rgba(251, 191, 36, ${intensity})`;
  }
  // >75%: naranja/rojo intenso (peor caso - desigualdad extrema hacia lo femenino, igual que <25%)
  const intensity = 0.7 + Math.min(((100 - pct) / 25) * 0.2, 0.2);
  return `rgba(255, 138, 61, ${intensity})`;
}

function getBubbleRaw(ctx) {
  if (!ctx) return {};
  if (ctx.raw && ctx.raw.raw) return ctx.raw.raw;
  if (ctx.raw) return ctx.raw;
  return {};
}

function parseParticipantsValue(value) {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  const normalized = String(value).replace(/\./g, '').replace(/,/g, '.').replace(/[^\d.]/g, '');
  return Number(normalized) || 0;
}

function formatParticipantsValue(value) {
  return formatNumberES(Number(value) || 0);
}

function updateParticipantRangeProgress() {
  if (!rangeControls.progress) return;
  const cap = state.meta.participantesMaxCap || Number(rangeControls.maxRange?.max) || 60000;
  if (cap <= 0) return;
  const left = (state.filters.minParticipantes / cap) * 100;
  const right = 100 - (state.filters.maxParticipantes / cap) * 100;
  rangeControls.progress.style.left = `${Math.max(0, Math.min(100, left))}%`;
  rangeControls.progress.style.right = `${Math.max(0, Math.min(100, right))}%`;
}

function setParticipantRange(minVal, maxVal, { triggerRefresh = true } = {}) {
  const step = rangeControls.step || 100;
  const cap = state.meta.participantesMaxCap || Number(rangeControls.maxRange?.max) || 60000;
  if (cap <= 0) return;
  let minValue = Number(minVal);
  let maxValue = Number(maxVal);
  if (isNaN(minValue)) minValue = 0;
  if (isNaN(maxValue)) maxValue = cap;
  minValue = Math.max(0, Math.min(minValue, cap - step));
  maxValue = Math.max(minValue + step, Math.min(maxValue, cap));
  minValue = Math.round(minValue / step) * step;
  maxValue = Math.round(maxValue / step) * step;
  if (maxValue > cap) maxValue = cap;
  if (maxValue - minValue < step) {
    minValue = Math.max(0, maxValue - step);
  }
  state.filters.minParticipantes = minValue;
  state.filters.maxParticipantes = maxValue;
  if (rangeControls.minRange) rangeControls.minRange.value = minValue;
  if (rangeControls.maxRange) rangeControls.maxRange.value = maxValue;
  if (rangeControls.minInput) rangeControls.minInput.value = formatParticipantsValue(minValue);
  if (rangeControls.maxInput) rangeControls.maxInput.value = formatParticipantsValue(maxValue);
  updateParticipantRangeProgress();
  if (triggerRefresh) refresh();
}

function resetParticipantsFilterToDefault({ triggerRefresh = false } = {}) {
  const cap = state.meta.participantesMaxCap || Number(rangeControls.maxRange?.max) || 60000;
  state.meta.pendingRangeReset = true;
  setParticipantRange(0, cap, { triggerRefresh });
}

function updateParticipantRangeBounds(maxValue = 0) {
  const step = rangeControls.step || 100;
  const cap = Math.max(step * 5, Math.ceil((maxValue || 0) / step) * step || step * 10);
  state.meta.participantesMaxCap = cap;
  if (rangeControls.minRange) {
    rangeControls.minRange.max = cap;
    rangeControls.maxRange.max = cap;
  }
  let desiredMin;
  let desiredMax;
  if (state.meta.pendingRangeReset) {
    desiredMin = 0;
    desiredMax = cap;
    state.meta.pendingRangeReset = false;
  } else {
    desiredMin = Math.min(state.filters.minParticipantes || 0, cap - step);
    desiredMax = Math.min(state.filters.maxParticipantes ?? cap, cap);
  }
  setParticipantRange(desiredMin, desiredMax, { triggerRefresh: false });
}

function initParticipantRangeControls() {
  rangeControls.minRange = document.getElementById('min-participantes-range');
  rangeControls.maxRange = document.getElementById('max-participantes-range');
  rangeControls.minInput = document.getElementById('min-participantes-value');
  rangeControls.maxInput = document.getElementById('max-participantes-value');
  rangeControls.progress = document.getElementById('participants-range-progress');
  if (!rangeControls.minRange || !rangeControls.maxRange) return;
  rangeControls.step = Number(rangeControls.minRange.step) || 100;

  const handleRangeInput = () => {
    const minVal = Number(rangeControls.minRange.value);
    const maxVal = Number(rangeControls.maxRange.value);
    setParticipantRange(minVal, maxVal, { triggerRefresh: false });
  };
  const handleRangeChange = () => {
    const minVal = Number(rangeControls.minRange.value);
    const maxVal = Number(rangeControls.maxRange.value);
    setParticipantRange(minVal, maxVal, { triggerRefresh: true });
  };

  rangeControls.minRange.addEventListener('input', handleRangeInput);
  rangeControls.maxRange.addEventListener('input', handleRangeInput);
  rangeControls.minRange.addEventListener('change', handleRangeChange);
  rangeControls.maxRange.addEventListener('change', handleRangeChange);

  const handleInputChange = () => {
    const minVal = parseParticipantsValue(rangeControls.minInput.value);
    const maxVal = parseParticipantsValue(rangeControls.maxInput.value);
    setParticipantRange(minVal, maxVal, { triggerRefresh: true });
  };

  const handleInputBlur = e => {
    e.target.value = formatParticipantsValue(parseParticipantsValue(e.target.value));
  };

  const handleKeyDown = e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.target.blur();
    }
  };

  if (rangeControls.minInput) {
    rangeControls.minInput.addEventListener('change', handleInputChange);
    rangeControls.minInput.addEventListener('blur', handleInputBlur);
    rangeControls.minInput.addEventListener('keydown', handleKeyDown);
  }
  if (rangeControls.maxInput) {
    rangeControls.maxInput.addEventListener('change', handleInputChange);
    rangeControls.maxInput.addEventListener('blur', handleInputBlur);
    rangeControls.maxInput.addEventListener('keydown', handleKeyDown);
  }

  const cap = state.meta.participantesMaxCap || Number(rangeControls.maxRange.max) || 60000;
  setParticipantRange(state.filters.minParticipantes || 0, state.filters.maxParticipantes || cap, { triggerRefresh: false });
}

function formatTemporada(temporada) {
  if (!temporada || temporada === 'todas') return temporada;
  const parts = temporada.split('-');
  if (parts.length === 2) {
    const year1 = parts[0];
    const year2 = parts[1];
    return `${year1}-${year2.substring(2)}`;
  }
  return temporada;
}

function cleanDeporteName(name) {
  if (!name) return '';
  
  let cleaned = name.trim();
  
  // Mapeo directo de casos conocidos problemáticos
  const directFix = {
    // FÚTBOL - diferentes codificaciones
    'FÜ\x9aTBOL': 'FÚTBOL',
    'FÜTBOL': 'FÚTBOL',
    'FÃTBOL': 'FÚTBOL',
    'FÃ\x9aTBOL': 'FÚTBOL',
    // PÁDEL
    'PÜ\x81DEL': 'PÁDEL',
    'PÜDEL': 'PÁDEL',
    'PÃDEL': 'PÁDEL',
    'PÃ\x81DEL': 'PÁDEL',
    // NATACIÓN
    'NATACIÜ\x93N': 'NATACIÓN',
    'NATACIÜN': 'NATACIÓN',
    'NATACIÃN': 'NATACIÓN',
    'NATACIÃ\x93N': 'NATACIÓN',
    // ORIENTACIÓN
    'ORIENTACIÜ\x93N': 'ORIENTACIÓN',
    'ORIENTACIÜN': 'ORIENTACIÓN',
    'ORIENTACIÃN': 'ORIENTACIÓN',
    'ORIENTACIÃ\x93N': 'ORIENTACIÓN',
    // MONTAÑA
    'MONTAÜ\x91A': 'MONTAÑA',
    'MONTAÜA': 'MONTAÑA',
    'MONTAÃA': 'MONTAÑA',
    'MONTAÃ\x91A': 'MONTAÑA',
    // TRIATLÓN
    'TRIATLÜ\x93N': 'TRIATLÓN',
    'TRIATLÜN': 'TRIATLÓN',
    'TRIATLÃN': 'TRIATLÓN',
    'TRIATLÃ\x93N': 'TRIATLÓN',
    // PIRAGÜISMO
    'PIRAGÜ\x9cISMO': 'PIRAGÜISMO',
    'PIRAGÃISMO': 'PIRAGÜISMO',
    // ACTIVIDADES SUBACUÁTICAS
    'ACTIVIDADES SUBACUÜ\x81TICAS': 'ACTIVIDADES SUBACUÁTICAS',
    'SUBACUÜTICAS': 'SUBACUÁTICAS',
    'ACTIVIDADES SUBACUÃTICAS': 'ACTIVIDADES SUBACUÁTICAS',
    'SUBACUÃTICAS': 'SUBACUÁTICAS',
    // DEPORTES AÉREOS
    'DEPORTES AÜ\x89REOS': 'DEPORTES AÉREOS',
    'AÜREOS': 'AÉREOS',
    'DEPORTES AÃREOS': 'DEPORTES AÉREOS',
    'AÃREOS': 'AÉREOS',
    // HÍPICA
    'HÜ\x8dPICA': 'HÍPICA',
    'HÜPICA': 'HÍPICA',
    'HÃPICA': 'HÍPICA',
    'HÃ\x8dPICA': 'HÍPICA',
    // NÓRDICA
    'NÃRDICA': 'NÓRDICA',
    'NÃ\x93RDICA': 'NÓRDICA',
    'NÜRDICA': 'NÓRDICA',
    'NÜ\x93RDICA': 'NÓRDICA',
    // MONTAÑA - TALLER DE MARCHA NÓRDICA (casos compuestos)
    'MONTAÃA - TALLER DE MARCHA NÃRDICA': 'MONTAÑA - TALLER DE MARCHA NÓRDICA',
    'MONTAÃA - TALLER DE MARCHA NÃ\x93RDICA': 'MONTAÑA - TALLER DE MARCHA NÓRDICA',
    'MONTAÑA - TALLER DE MARCHA NÃRDICA': 'MONTAÑA - TALLER DE MARCHA NÓRDICA',
    'MONTAÑA - TALLER DE MARCHA NÃ\x93RDICA': 'MONTAÑA - TALLER DE MARCHA NÓRDICA'
  };
  
  // Verificar mapeo directo
  if (directFix[cleaned]) return directFix[cleaned];
  
  // Reemplazos con expresiones regulares para casos más complejos
  cleaned = cleaned
    // FÚTBOL - diferentes codificaciones
    .replace(/F[ÜÃ][\x9a\u009a]?TBOL/gi, 'FÚTBOL')
    .replace(/FÜTBOL/gi, 'FÚTBOL')
    .replace(/FÃTBOL/gi, 'FÚTBOL')
    // PÁDEL
    .replace(/P[ÜÃ][\x81\u0081]?DEL/gi, 'PÁDEL')
    .replace(/PÜDEL/gi, 'PÁDEL')
    .replace(/PÃDEL/gi, 'PÁDEL')
    // NATACIÓN
    .replace(/NATACI[ÜÃ][\x93\u0093]?N/gi, 'NATACIÓN')
    .replace(/NATACIÜN/gi, 'NATACIÓN')
    .replace(/NATACIÃN/gi, 'NATACIÓN')
    // ORIENTACIÓN
    .replace(/ORIENTACI[ÜÃ][\x93\u0093]?N/gi, 'ORIENTACIÓN')
    .replace(/ORIENTACIÜN/gi, 'ORIENTACIÓN')
    .replace(/ORIENTACIÃN/gi, 'ORIENTACIÓN')
    // MONTAÑA (y variaciones compuestas)
    .replace(/MONTA[ÜÃ][\x91\u0091]?A/gi, 'MONTAÑA')
    .replace(/MONTAÜA/gi, 'MONTAÑA')
    .replace(/MONTAÃA/gi, 'MONTAÑA')
    // TRIATLÓN
    .replace(/TRIATL[ÜÃ][\x93\u0093]?N/gi, 'TRIATLÓN')
    .replace(/TRIATLÜN/gi, 'TRIATLÓN')
    .replace(/TRIATLÃN/gi, 'TRIATLÓN')
    // PIRAGÜISMO
    .replace(/PIRAG[ÜÃ][\x9c\u009c]?ISMO/gi, 'PIRAGÜISMO')
    .replace(/PIRAGÃISMO/gi, 'PIRAGÜISMO')
    // SUBACUÁTICAS
    .replace(/SUBACU[ÜÃ][\x81\u0081]?TICAS/gi, 'SUBACUÁTICAS')
    .replace(/SUBACUÜTICAS/gi, 'SUBACUÁTICAS')
    .replace(/SUBACUÃTICAS/gi, 'SUBACUÁTICAS')
    // AÉREOS
    .replace(/A[ÜÃ][\x89\u0089]?REOS/gi, 'AÉREOS')
    .replace(/AÜREOS/gi, 'AÉREOS')
    .replace(/AÃREOS/gi, 'AÉREOS')
    // HÍPICA
    .replace(/H[ÜÃ][\x8d\u008d]?PICA/gi, 'HÍPICA')
    .replace(/HÜPICA/gi, 'HÍPICA')
    .replace(/HÃPICA/gi, 'HÍPICA')
    // Casos compuestos
    .replace(/ESPELEOLOGÜ[\x8d\u008d]A/gi, 'ESPELEOLOGÍA')
    .replace(/ESQUÜ[\x8d\u008d]/gi, 'ESQUÍ')
    .replace(/TRAVESÜ[\x8d\u008d]A/gi, 'TRAVESÍA')
    // NÓRDICA - diferentes codificaciones
    .replace(/N[ÜÃ][\x93\u0093]?RDICA/gi, 'NÓRDICA')
    .replace(/NÜRDICA/gi, 'NÓRDICA')
    .replace(/NÃRDICA/gi, 'NÓRDICA')
    // Limpiar cualquier secuencia Ü + byte problemático restante
    .replace(/Ü[\x9a\u009a]/g, 'Ú')
    .replace(/Ü[\x81\u0081]/g, 'Á')
    .replace(/Ü[\x93\u0093]/g, 'Ó')
    .replace(/Ü[\x91\u0091]/g, 'Ñ')
    .replace(/Ü[\x89\u0089]/g, 'É')
    .replace(/Ü[\x8d\u008d]/g, 'Í')
    .replace(/Ü[\x9c\u009c]/g, 'Ü') // Mantener Ü cuando corresponde
    // Limpiar cualquier secuencia Ã + byte problemático (codificación incorrecta común)
    .replace(/Ã[\x93\u0093]/g, 'Ó')
    .replace(/Ã[\x81\u0081]/g, 'Á')
    .replace(/Ã[\x91\u0091]/g, 'Ñ')
    .replace(/Ã[\x89\u0089]/g, 'É')
    .replace(/Ã[\x8d\u008d]/g, 'Í')
    .replace(/Ã[\x9a\u009a]/g, 'Ú')
    .replace(/Ã[\x9c\u009c]/g, 'Ü')
  
  return cleaned.normalize('NFC');
}

// Función para normalizar nombres de deportes del CSV de oferta, agrupando variantes
function normalizeDeporteFromOferta(name) {
  if (!name) return '';
  
  // Primero aplicar cleanDeporteName para normalizar codificaciones
  let normalized = cleanDeporteName(name);
  
  // Convertir a mayúsculas para comparaciones, pero preservar acentos
  normalized = normalized.trim();
  const normalizedUpper = normalized.toUpperCase();
  
  // Agrupar variantes de FÚTBOL (FUTBOL 5, FUTBOL 7, FUTBOL 11, FUTBOL 7 FEMENINO, FUTBOL 11 A, etc.)
  // Cualquier cosa que empiece con FUTBOL (con o sin acento) seguido de espacios, números, letras, o palabras como FEMENINO
  if (/^F[UÚÜ]TBOL/i.test(normalizedUpper)) {
    return 'FÚTBOL';
  }
  
  // Agrupar variantes de BALONCESTO
  if (/^BALONCESTO/i.test(normalizedUpper)) {
    return 'BALONCESTO';
  }
  
  // Agrupar variantes de GIMNASIA
  if (/^GIMNASIA/i.test(normalizedUpper)) {
    return 'GIMNASIA';
  }
  
  // Agrupar variantes de NATACIÓN
  if (/^NATACI[OÓÖ]N/i.test(normalizedUpper)) {
    return 'NATACIÓN';
  }
  
  // Agrupar variantes de ATLETISMO
  if (/^ATLETISMO/i.test(normalizedUpper)) {
    return 'ATLETISMO';
  }
  
  // Agrupar variantes de VOLEIBOL
  if (/^VOLEIBOL/i.test(normalizedUpper)) {
    return 'VOLEIBOL';
  }
  
  // Agrupar variantes de BALONMANO
  if (/^BALONMANO/i.test(normalizedUpper)) {
    return 'BALONMANO';
  }
  
  // Agrupar variantes de HOCKEY
  if (/^HOCKEY/i.test(normalizedUpper)) {
    return 'HOCKEY';
  }
  
  // Agrupar variantes de RUGBY
  if (/^RUGBY/i.test(normalizedUpper)) {
    return 'RUGBY';
  }
  
  // Agrupar variantes de TENIS (pero no TENIS DE MESA)
  if (/^TENIS/i.test(normalizedUpper) && !/TENIS DE MESA|PING PONG|TENIS MESA/i.test(normalizedUpper)) {
    return 'TENIS';
  }
  
  // Agrupar variantes de TENIS DE MESA / TENIS MESA
  if (/TENIS.*MESA|PING.*PONG/i.test(normalizedUpper)) {
    return 'TENIS DE MESA';
  }
  
  // Agrupar variantes de PÁDEL
  if (/^P[ÁAÄ]DEL/i.test(normalizedUpper)) {
    return 'PÁDEL';
  }
  
  // Agrupar variantes de DEPORTE RURAL
  if (/DEPORTE.*RURAL|RURAL/i.test(normalizedUpper)) {
    return 'DEPORTE RURAL';
  }
  
  // Agrupar variantes de VOLEY PLAYA / VOLEIBOL PLAYA
  if (/VOLEY.*PLAYA|VOLEIBOL.*PLAYA/i.test(normalizedUpper)) {
    return 'VOLEY PLAYA';
  }
  
  // Si no coincide con ninguna variante conocida, devolver el nombre normalizado con formato correcto
  // Intentar mantener el formato original pero normalizado
  return normalized.toUpperCase();
}

function parseCSV(text) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    console.error('parseCSV: Invalid input text');
    return [];
  }
  
  const lines = text.trim().split('\n').filter(line => line.trim().length > 0);
  if (lines.length < 2) {
    console.error('parseCSV: Not enough lines in CSV');
    return [];
  }
  
  const headers = lines[0].split(',').map(h => h.trim());
  const parsed = lines.slice(1).map((line, index) => {
    const values = line.split(',');
    const obj = {};
    headers.forEach((h, i) => { 
      obj[h] = values[i] ? values[i].trim() : ''; 
    });
    
    // Validar y limpiar datos
    obj.deporte = cleanDeporteName(obj.deporte || '');
    obj.femenino = parseInt(obj.femenino) || 0;
    obj.masculino = parseInt(obj.masculino) || 0;
    obj.total = parseInt(obj.total) || 0;
    
    // Si el total es 0 pero tenemos femenino o masculino, calcularlo
    if (obj.total === 0 && (obj.femenino > 0 || obj.masculino > 0)) {
      obj.total = obj.femenino + obj.masculino;
    }
    
    return obj;
  }).filter(obj => obj.deporte && obj.deporte.length > 0); // Filtrar filas sin deporte
  
  console.log(`parseCSV: Parsed ${parsed.length} rows from ${lines.length - 1} lines`);
  return parsed;
}

function normalizeCategoryKey(value) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function normalizeAllowedCompetitionCategory(normalizedValue) {
  if (!normalizedValue) return null;
  if (normalizedValue.includes('BENJAM')) return 'Benjamín';
  if (normalizedValue.includes('ALEVIN') || normalizedValue.includes('KIMU')) return 'Alevín';
  if (normalizedValue.includes('INFANT')) return 'Infantil';
  if (normalizedValue.includes('CADET')) return 'Cadete';
  if (normalizedValue.includes('JUVEN') || normalizedValue.includes('GAZTE')) return 'Juvenil';
  return null;
}

function formatCompetitionCategory(value) {
  if (!value) return null;
  const normalized = normalizeCategoryKey(value);
  const mapped = normalizeAllowedCompetitionCategory(normalized);
  if (!mapped) return null;
  if (COMPETICION_ALLOWED_CATEGORIES.has(mapped)) {
    return mapped;
  }
  return null;
}

function parseOfertaCompeticionCSV(text) {
  if (!text || typeof text !== 'string') {
    console.warn('parseOfertaCompeticionCSV: empty text');
    return [];
  }
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) {
    console.warn('parseOfertaCompeticionCSV: not enough lines');
    return [];
  }
  const headers = lines[0].split(',').map(h => h.trim());
  const records = lines.slice(1).map(line => {
    const values = line.split(',');
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = values[idx] ? values[idx].trim() : ''; });
    const actividadCas = obj['JARDUERA_CAS/ACTIVIDAD_CAS'] || obj['JARDUERA_CAS'];
    const categoriaCas = obj['KATEGORIA_CAS/CATEGORIA_CAS'] || obj['KATEGORIA_CAS'] || '';
    const temporada = obj['DENBORALDIA/TEMPORADA'] || obj['TEMPORADA'] || '2024/2025';
    // Usar normalizeDeporteFromOferta para agrupar variantes (FUTBOL 5, FUTBOL 7, etc. → FÚTBOL)
    const deporte = normalizeDeporteFromOferta(actividadCas || '');
    const categoria = formatCompetitionCategory(categoriaCas);
    if (!categoria) return null;
    return {
      actividad: actividadCas || deporte,
      deporte,
      categoria,
      categoriaKey: categoria,
      categoriaRaw: categoriaCas,
      temporada: temporada.replace('-', '/')
    };
  });
  return records.filter(r => r && r.deporte && r.categoriaKey);
}

async function loadData() {
  try {
    const [temporalRes, deportesRes, porDeporteRes, ofertaRes] = await Promise.all([
      fetch('data/evolucion_temporal.json'),
      fetch('data/resumen_deportes.json'),
      fetch('data/evolucion_por_deporte.csv'),
      fetch('data/actividades-competicion-2024-2025.csv')
    ]);
    
    if (!temporalRes.ok) {
      throw new Error(`Failed to load evolucion_temporal.json: ${temporalRes.status} ${temporalRes.statusText}`);
    }
    if (!deportesRes.ok) {
      throw new Error(`Failed to load resumen_deportes.json: ${deportesRes.status} ${deportesRes.statusText}`);
    }
    if (!porDeporteRes.ok) {
      throw new Error(`Failed to load evolucion_por_deporte.csv: ${porDeporteRes.status} ${porDeporteRes.statusText}`);
    }
    if (!ofertaRes.ok) {
      throw new Error(`Failed to load actividades-competicion-2024-2025.csv: ${ofertaRes.status} ${ofertaRes.statusText}`);
    }
    
    const [temporalData, deportesData, porDeporteText, ofertaText] = await Promise.all([
      temporalRes.json(),
      deportesRes.json(),
      porDeporteRes.text(),
      ofertaRes.text()
    ]);
    
    if (!temporalData || !Array.isArray(temporalData)) {
      throw new Error('evolucion_temporal.json is not a valid array');
    }
    if (!deportesData || !Array.isArray(deportesData)) {
      throw new Error('resumen_deportes.json is not a valid array');
    }
    if (!porDeporteText || porDeporteText.trim().length === 0) {
      throw new Error('evolucion_por_deporte.csv is empty');
    }
    
    state.allData.temporal = temporalData;
    state.allData.deportes = deportesData.map(d => ({ ...d, deporte: cleanDeporteName(d.deporte) }));
    state.allData.porDeporte = parseCSV(porDeporteText);
    state.allData.ofertaCompeticion = parseOfertaCompeticionCSV(ofertaText);
    
    if (state.allData.porDeporte.length === 0) {
      throw new Error('No data parsed from evolucion_por_deporte.csv');
    }
    
    console.log('Data loaded successfully:', {
      temporal: state.allData.temporal.length,
      deportes: state.allData.deportes.length,
      porDeporte: state.allData.porDeporte.length,
      ofertaCompeticion: state.allData.ofertaCompeticion.length
    });
  } catch (error) {
    console.error('Error in loadData:', error);
    // Mostrar error visible al usuario
    const errorMsg = document.createElement('div');
    errorMsg.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;padding:2rem;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.2);z-index:10000;max-width:500px;text-align:center;';
    errorMsg.innerHTML = '<h3 style="color:#d32f2f;margin:0 0 1rem;">Error al cargar datos</h3><p style="color:#666;margin:0 0 1rem;">' + error.message + '</p><p style="color:#999;font-size:0.875rem;margin:0 0 1rem;">Verifica que los archivos de datos estén en la carpeta data/</p><button onclick="location.reload()" style="padding:0.5rem 1rem;background:#0f766e;color:#fff;border:none;border-radius:6px;cursor:pointer;">Recargar página</button>';
    document.body.appendChild(errorMsg);
    throw error;
  }
}

function applyFilters() {
  // Asegurar que filteredData esté inicializado
  if (!state.filteredData) {
    state.filteredData = { deportes: [], porDeporte: [] };
  }
  
  // Verificar que los datos estén disponibles
  if (!state.allData.porDeporte || state.allData.porDeporte.length === 0) {
    console.warn('applyFilters: No data available in state.allData.porDeporte');
    state.filteredData.deportes = [];
    state.filteredData.porDeporte = [];
    return;
  }
  
  const { temporada, genero, categoriaOferta, excludeOutliers } = state.filters;
  const deporteFiltroRaw = state.filters.selectedDeporte || (state.filters.deporte !== 'todos' ? state.filters.deporte : null);
  // Normalizar el filtro de deporte para que coincida con los nombres normalizados
  const deporteFiltro = deporteFiltroRaw ? cleanDeporteName(normalizeDeporteFromOferta(deporteFiltroRaw)) : null;
  const categoriaDeportes = categoriaOferta
    ? new Set(
        state.allData.ofertaCompeticion
          .filter(row => row.categoria === categoriaOferta)
          .map(row => {
            // Los nombres en ofertaCompeticion ya están normalizados con normalizeDeporteFromOferta al parsear
            // Aplicamos cleanDeporteName para compatibilidad con los nombres en porDeporte
            // normalizeDeporteFromOferta ya aplica cleanDeporteName internamente, así que esto es redundante pero seguro
            return cleanDeporteName(row.deporte);
          })
      )
    : null;

  // Primero filtramos por temporada y deporte (sin aplicar minParticipantes todavía)
  state.filteredData.porDeporte = state.allData.porDeporte
    .filter(
      d => {
        const cleanedDeporte = cleanDeporteName(d.deporte);
        // Normalizar también con normalizeDeporteFromOferta para agrupar variantes (FUTBOL 5, FUTBOL 7 → FÚTBOL)
        // y luego cleanDeporteName para que coincida exactamente con categoriaDeportes y deporteFiltro
        // normalizeDeporteFromOferta ya aplica cleanDeporteName internamente, pero aplicamos cleanDeporteName
        // después para asegurar compatibilidad
        const normalizedDeporte = cleanDeporteName(normalizeDeporteFromOferta(d.deporte));
        return (temporada === 'todas' || d.temporada === temporada) &&
               (!deporteFiltro || normalizedDeporte === deporteFiltro) &&
               (!categoriaDeportes || categoriaDeportes.has(normalizedDeporte)) &&
               (!excludeOutliers || !OUTLIER_DEPORTES.has(cleanedDeporte));
      }
    )
    .map(d => {
      const clone = { ...d };
      if (genero === 'femenino') { clone.masculino = 0; clone.total = clone.femenino; }
      if (genero === 'masculino') { clone.femenino = 0; clone.total = clone.masculino; }
      return clone;
    });

  // Agregamos por deporte (sumando todas las temporadas si "todas" está seleccionado, o solo la temporada específica)
  // Normalizamos el nombre del deporte para agrupar variantes (FUTBOL 5, FUTBOL 7 → FÚTBOL)
  const map = new Map();
  state.filteredData.porDeporte.forEach(d => {
    // Normalizar el nombre del deporte para agrupar variantes
    const normalizedDeporte = cleanDeporteName(normalizeDeporteFromOferta(d.deporte));
    if (!map.has(normalizedDeporte)) {
      map.set(normalizedDeporte, { 
        deporte: normalizedDeporte, 
        femenino: 0, 
        masculino: 0, 
        total: 0 
      });
    }
    const agg = map.get(normalizedDeporte);
    agg.femenino += d.femenino;
    agg.masculino += d.masculino;
    agg.total += d.total;
  });

  // Convertir el mapa agregado a array y calcular porcentajes
  const aggregatedDeportes = Array.from(map.values());

  state.filteredData.deportes = aggregatedDeportes
    .map(d => {
      const pctFem = d.total > 0 ? (d.femenino / d.total) * 100 : 0;
      const pctMas = d.total > 0 ? (d.masculino / d.total) * 100 : 0;
      return {
        ...d,
        porcentaje_femenino: Number(pctFem.toFixed(1)),
        porcentaje_masculino: Number(pctMas.toFixed(1))
      };
    }).sort((a, b) => b.total - a.total);

  state.filteredData.ofertaCompeticion = buildOfertaCompeticionSummary();
  
  // Actualizar feedback visual de filtros y contador
  updateFilterFeedback();
}

function buildOfertaCompeticionSummary() {
  const rows = state.allData.ofertaCompeticion || [];
  const deporteFiltroRaw = state.filters.selectedDeporte || (state.filters.deporte !== 'todos' ? state.filters.deporte : null);
  // Normalizar el nombre del deporte filtrado para que coincida con los nombres normalizados del CSV
  const deporteFiltro = deporteFiltroRaw ? normalizeDeporteFromOferta(deporteFiltroRaw) : null;
  const categoriaFiltro = state.filters.categoriaOferta || null;

  let filteredRows = rows.slice();
  if (deporteFiltro) {
    filteredRows = filteredRows.filter(r => {
      // Normalizar ambos lados para asegurar matching correcto
      const rDeporteNormalized = normalizeDeporteFromOferta(r.deporte);
      return rDeporteNormalized === deporteFiltro;
    });
  }
  let categoriaDeportes = null;
  if (categoriaFiltro) {
    categoriaDeportes = new Set(rows.filter(r => r.categoria === categoriaFiltro).map(r => r.deporte));
    filteredRows = filteredRows.filter(r => categoriaDeportes.has(r.deporte));
  }
  // Excluir outliers si el toggle está activo
  if (state.filters.excludeOutliers) {
    filteredRows = filteredRows.filter(r => {
      const cleanedDeporte = cleanDeporteName(r.deporte);
      return !OUTLIER_DEPORTES.has(cleanedDeporte);
    });
  }

  const counts = new Map(COMPETICION_ALLOWED_ORDER.map(cat => [cat, { total: 0, deportes: new Set() }]));

  filteredRows.forEach(row => {
    const entry = counts.get(row.categoria);
    if (!entry) return;
    entry.total += 1;
    entry.deportes.add(row.deporte);
  });

  const categories = COMPETICION_ALLOWED_ORDER.map(cat => {
    const entry = counts.get(cat) || { total: 0, deportes: new Set() };
    return {
      categoria: cat,
      categoriaKey: cat,
      total: entry.total,
      deportes: Array.from(entry.deportes).sort()
    };
  });

  const matchedActividades = filteredRows.length;

  return {
    categories,
    totalActividades: filteredRows.length,
    matchedActividades,
    focusDeporte: deporteFiltro,
    focusHasData: matchedActividades > 0,
    selectedCategoria: categoriaFiltro
  };
}

function getTemporalSeries({ ignoreTemporada = false } = {}) {
  // Usar state.filteredData.porDeporte para que respete el filtro de outliers
  const dataSource = state.filteredData.porDeporte || state.allData.porDeporte || [];
  
  // Validar que los datos estén disponibles
  if (dataSource.length === 0) {
    console.warn('getTemporalSeries: No data available, returning empty series');
    return CONFIG.seasons.map(temp => ({ temporada: temp, femenino: 0, masculino: 0, total: 0 }));
  }
  
  const focusRaw = state.filters.selectedDeporte || (state.filters.deporte !== 'todos' ? state.filters.deporte : null);
  // Normalizar el nombre del deporte filtrado para que coincida con los nombres normalizados en los datos
  const focus = focusRaw ? cleanDeporteName(normalizeDeporteFromOferta(focusRaw)) : null;
  const genero = state.filters.genero;
  const seasons = (ignoreTemporada || state.filters.temporada === 'todas')
    ? CONFIG.seasons
    : [state.filters.temporada];
  return seasons.map(temp => {
    const rows = dataSource.filter(r => {
      if (r.temporada !== temp) return false;
      if (!focus) return true;
      // Normalizar el nombre del deporte en los datos para comparar correctamente
      const normalizedDeporte = cleanDeporteName(normalizeDeporteFromOferta(r.deporte));
      return normalizedDeporte === focus;
    });
    const fem = rows.reduce((s, r) => s + (r.femenino || 0), 0);
    const mas = rows.reduce((s, r) => s + (r.masculino || 0), 0);
    let f = fem, m = mas, total = fem + mas;
    if (genero === 'femenino') { m = 0; total = f; }
    if (genero === 'masculino') { f = 0; total = m; }
    return { temporada: temp, femenino: f, masculino: m, total };
  });
}

// Función setupMainTabs eliminada - ya no hay pestañas en el dashboard

function setupFilters() {
  const byId = id => document.getElementById(id);
  
  // Filtros principales - verificar que existan antes de agregar listeners
  const tempFilter = byId('temporada-filter');
  if (tempFilter) {
    tempFilter.addEventListener('change', e => { state.filters.temporada = e.target.value; refresh(); });
  }
  
  const depFilter = byId('deporte-filter');
  if (depFilter) {
    depFilter.addEventListener('change', e => { 
      state.filters.deporte = e.target.value; 
      state.filters.selectedDeporte = null; 
      
      // Actualizar insights de ambos visuales
      const heatmapInsight = document.getElementById('heatmap-insight-text');
      const scatterInsight = document.getElementById('scatter-insight-text');
      if (state.filters.deporte === 'todos') {
        if (heatmapInsight) heatmapInsight.textContent = 'Haz clic en un deporte para filtrar el dashboard';
        if (scatterInsight) scatterInsight.textContent = 'Haz clic en un deporte para filtrar el dashboard';
      } else {
        if (heatmapInsight) heatmapInsight.textContent = `Filtrando por: ${state.filters.deporte}`;
        if (scatterInsight) scatterInsight.textContent = `Filtrando por: ${state.filters.deporte}`;
      }
      
      refresh(); 
    });
  }
  
  // Filtros de género y participantes eliminados del dashboard
  // initParticipantRangeControls(); // Comentado porque el filtro de participantes fue eliminado
  
  // Toggle para excluir outliers
  const outliersToggle = byId('exclude-outliers-toggle');
  if (outliersToggle) {
    outliersToggle.addEventListener('change', e => {
      state.filters.excludeOutliers = e.target.checked;
      refresh();
    });
    // Sincronizar el estado inicial
    outliersToggle.checked = state.filters.excludeOutliers;
  }
  
  const resetBtn = byId('reset-filters');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      // Resetear todos los filtros a su estado inicial
      state.filters = {
        temporada: 'todas',
        deporte: 'todos',
        genero: 'todos',
        selectedDeporte: null,
        categoriaOferta: null,
        excludeOutliers: false,
        raceIndex: CONFIG.seasons.length - 1
      };
      
      // Actualizar todos los controles de UI
      if (tempFilter) tempFilter.value = 'todas';
      if (depFilter) depFilter.value = 'todos';
      if (outliersToggle) outliersToggle.checked = false;
      
      // Refrescar el dashboard
      refresh();
    });
  }
  
  // Controles del race chart
  const raceMode = byId('race-mode');
  if (raceMode) {
    raceMode.addEventListener('change', e => { state.filters.raceMode = e.target.value; updateRaceChartFrame(); });
  }
  
  const raceSlider = byId('race-slider');
  if (raceSlider) {
    raceSlider.addEventListener('input', e => { state.filters.raceIndex = parseInt(e.target.value); updateRaceChartFrame(); });
  }
  
  const racePlay = byId('race-play');
  if (racePlay) {
    racePlay.addEventListener('click', toggleRacePlay);
  }
  
  // Controles del tour (opcionales)
  const startTourBtn = byId('start-tour');
  if (startTourBtn) {
    startTourBtn.addEventListener('click', startTour);
  }
  
  const tourSkip = byId('tour-skip');
  if (tourSkip) {
    tourSkip.addEventListener('click', (e) => {
      e.stopPropagation();
      endTour();
    });
  }
  
  const tourNext = byId('tour-next');
  if (tourNext) {
    tourNext.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.target.dataset.action === 'close') {
        endTour();
      } else {
        nextTourStep();
      }
    });
  }
  
  // Toggle theme
  const toggleThemeBtn = byId('toggle-theme') || byId('toggle-theme-header');
  if (toggleThemeBtn) {
    toggleThemeBtn.addEventListener('click', toggleTheme);
    updateThemeIcon(); // Establecer el icono inicial según el modo actual
  }
  
  // Download button (opcional)
  const downloadBtn = byId('download-filtered');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', downloadFiltered);
  }
  
  // Tour overlay
  const overlay = byId('tour-overlay');
  if (overlay) {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) {
        endTour();
      }
    });
    // Prevenir que los clics en la tarjeta cierren el overlay
    const tourCard = overlay.querySelector('.tour-card');
    if (tourCard) {
      tourCard.addEventListener('click', e => {
        e.stopPropagation();
      });
    }
  }
}

function populateDeporteFilter() {
  const select = document.getElementById('deporte-filter');
  if (!select) return;
  
  const set = new Set();
  
  // Incluir todos los deportes de porDeporte
  state.allData.porDeporte.forEach(r => { 
    if (r.deporte) {
      const normalized = cleanDeporteName(r.deporte);
      set.add(normalized);
    }
  });
  
  // Incluir también todos los deportes del CSV de oferta (para incluir deportes como DEPORTE RURAL, TENIS DE MESA, etc.)
  if (state.allData.ofertaCompeticion && state.allData.ofertaCompeticion.length > 0) {
    state.allData.ofertaCompeticion.forEach(row => {
      if (row.deporte) {
        // Normalizar el nombre del deporte para que coincida con los nombres en porDeporte
        const normalized = normalizeDeporteFromOferta(row.deporte);
        const cleaned = cleanDeporteName(normalized);
        set.add(cleaned);
      }
    });
  }
  
  // Ordenar y añadir al select
  Array.from(set).sort().forEach(d => {
    const opt = document.createElement('option'); 
    opt.value = d; 
    opt.textContent = d; 
    select.appendChild(opt);
  });
}

// Charts
function createHeroChart() {
  const canvas = document.getElementById('hero-chart'); 
  if (!canvas) return;
  const ctx2d = canvas.getContext('2d');
  const series = getTemporalSeries({ ignoreTemporada: true });
  const labels = series.map(d => formatTemporada(d.temporada));
  const total = series.map(d => d.total);
  const pct = series.map(d => {
    const val = d.total > 0 ? (d.femenino / d.total) * 100 : 0;
    return Number(val.toFixed(1));
  });
  const totalGradient = ctx2d.createLinearGradient(0, 0, 0, canvas.clientHeight || canvas.offsetHeight || 320);
  totalGradient.addColorStop(0, 'rgba(15,118,110,0.25)');
  totalGradient.addColorStop(1, 'rgba(15,118,110,0)');

  const parityBand = {
    id: 'heroParity',
    beforeDatasetsDraw: chart => {
      const y1 = chart.scales.y1;
      if (!y1) return;
      const { left, right } = chart.chartArea;
      const top = y1.getPixelForValue(CONFIG.parityRange.max);
      const bottom = y1.getPixelForValue(CONFIG.parityRange.min);
      chart.ctx.save();
      chart.ctx.fillStyle = 'rgba(15,118,110,0.08)';
      chart.ctx.fillRect(left, top, right - left, bottom - top);
      chart.ctx.restore();
    }
  };

  const endpointLabels = {
    id: 'heroEndpoints',
    afterDatasetsDraw: chart => {
      const { ctx, data, chartArea } = chart;
      const datasetMeta = chart.getDatasetMeta(0);
      const pctMeta = chart.getDatasetMeta(1);
      if (!datasetMeta || !datasetMeta.data.length) return;
      ctx.save();
      ctx.font = '600 11px "Space Grotesk", sans-serif';
      ctx.textAlign = 'center';
      const textHeight = 11;
      const padding = 5;
      
      // Etiquetas para todos los puntos de "Total participación"
      ctx.fillStyle = '#0e1c1a';
      datasetMeta.data.forEach((point, index) => {
        if (point && !isNaN(point.y)) {
          let labelY = point.y - 20;
          // Verificar límites verticales
          if (labelY - textHeight / 2 < chartArea.top) {
            labelY = point.y + 20; // Colocar abajo si se sale por arriba
          }
          if (labelY + textHeight / 2 > chartArea.bottom) {
            labelY = chartArea.bottom - textHeight / 2 - padding; // Ajustar al límite inferior
          }
          // Verificar límites horizontales
          const labelText = formatNumberES(total[index]);
          const textWidth = ctx.measureText(labelText).width;
          let labelX = point.x;
          if (labelX - textWidth / 2 < chartArea.left) {
            labelX = chartArea.left + textWidth / 2 + padding;
          }
          if (labelX + textWidth / 2 > chartArea.right) {
            labelX = chartArea.right - textWidth / 2 - padding;
          }
          ctx.fillText(labelText, labelX, labelY);
        }
      });

      // Etiquetas para todos los puntos de "% femenino"
      if (pctMeta && pctMeta.data.length) {
        ctx.fillStyle = CONFIG.colors.masculino;
        pctMeta.data.forEach((point, index) => {
          if (point && !isNaN(point.y)) {
            let labelY = point.y - 18;
            // Verificar límites verticales
            if (labelY - textHeight / 2 < chartArea.top) {
              labelY = point.y + 18; // Colocar abajo si se sale por arriba
            }
            if (labelY + textHeight / 2 > chartArea.bottom) {
              labelY = chartArea.bottom - textHeight / 2 - padding; // Ajustar al límite inferior
            }
            // Verificar límites horizontales
            const labelText = formatPercentES(pct[index], 1);
            const textWidth = ctx.measureText(labelText).width;
            let labelX = point.x;
            if (labelX - textWidth / 2 < chartArea.left) {
              labelX = chartArea.left + textWidth / 2 + padding;
            }
            if (labelX + textWidth / 2 > chartArea.right) {
              labelX = chartArea.right - textWidth / 2 - padding;
            }
            ctx.fillText(labelText, labelX, labelY);
          }
        });
      }
      ctx.restore();
    }
  };

  if (state.charts.hero) state.charts.hero.destroy();
  state.charts.hero = new Chart(canvas, {
    type: 'line',
    data: { 
      labels, 
      datasets: [
        { 
          label: 'Total participación', 
          data: total, 
          borderColor: CONFIG.colors.femenino, 
          backgroundColor: totalGradient, 
          tension: 0.35, 
          fill: true,
          borderWidth: 3,
          pointRadius: ctx => (ctx.dataIndex === 0 || ctx.dataIndex === total.length - 1) ? 4 : 3,
          pointBackgroundColor: '#ffffff',
          pointBorderColor: CONFIG.colors.femenino,
          pointBorderWidth: 2,
          pointHoverRadius: 6
        },
        { 
          label: '% femenino', 
          data: pct, 
          borderColor: CONFIG.colors.masculino, 
          tension: 0.35, 
          fill: false, 
          yAxisID: 'y1',
          borderDash: [8, 6],
          borderWidth: 2.2,
          pointRadius: ctx => ctx.dataIndex === pct.length - 1 ? 4 : 3,
          pointBackgroundColor: '#ffffff',
          pointBorderColor: CONFIG.colors.masculino,
          pointBorderWidth: 2,
          pointHoverRadius: 6
        }
      ] 
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      layout: { padding: 8 },
      onClick: (e, activeElements, chart) => {
        if (activeElements && activeElements.length > 0) {
          const element = activeElements[0];
          try {
            const index = element.index;
            if (index !== undefined && series && series[index]) {
              const clickedTemporada = series[index].temporada;
              handleTemporadaToggle(clickedTemporada);
            }
          } catch (error) {
            console.error('Error al hacer clic en el gráfico de evolución:', error);
          }
        }
      },
      onHover: (e, activeElements) => {
        e.native.target.style.cursor = activeElements.length > 0 ? 'pointer' : 'default';
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'center',
          labels: {
            usePointStyle: true,
            padding: 12,
            font: {
              size: 12,
              weight: '600',
              family: 'inherit'
            },
            color: getChartColors().text || '#0e1c1a',
            boxWidth: 12,
            boxHeight: 12
          }
        },
        datalabels: { display: false },
        tooltip: {
          backgroundColor: document.body.classList.contains('dark') ? 'rgba(5, 15, 13, 0.95)' : 'rgba(8,15,13,0.9)',
          padding: 12,
          titleFont: { size: 14, weight: '600', family: 'inherit' },
          bodyFont: { size: 13, weight: '500', family: 'inherit' },
          callbacks: {
            label: c => c.dataset.label.includes('%') 
              ? `${c.dataset.label}: ${formatPercentES(c.parsed.y, 1)}` 
              : `${c.dataset.label}: ${formatNumberES(c.parsed.y)}`
          }
        }
      },
      scales: {
        y: {
          ticks: {
            display: false
          },
          grid: { color: getChartColors().grid || 'rgba(15,118,110,0.08)', drawBorder: false }
        },
        y1: {
          position: 'right',
          min: 0,
          max: 100,
          ticks: {
            display: false
          },
          grid: { display: false }
        },
        x: {
          ticks: {
            font: { size: 12, family: 'inherit' },
            color: getChartColors().textMuted || '#51635e'
          },
          grid: { display: false }
        }
      }
    },
    plugins: [parityBand, endpointLabels]
  });
}

function createProgressChart() {
  const ctx = document.getElementById('progress-chart'); if (!ctx) return;
  const series = getTemporalSeries();
  const labels = series.map(d => formatTemporada(d.temporada));
  const totals = series.map(d => d.total);
  const pctFem = series.map(d => {
    const val = d.total > 0 ? (d.femenino / d.total) * 100 : 0;
    return Number(val.toFixed(1));
  });
  if (state.charts.progress) state.charts.progress.destroy();
  state.charts.progress = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [
      { type: 'bar', label: 'Total participantes', data: totals, backgroundColor: 'rgba(15,118,110,0.18)', borderColor: CONFIG.colors.femenino, borderWidth: 1, yAxisID: 'y' },
      { type: 'line', label: '% femenino', data: pctFem, borderColor: CONFIG.colors.masculino, tension: 0.35, yAxisID: 'y1', fill: false, pointRadius: 4, pointBackgroundColor: CONFIG.colors.masculino }
    ] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            padding: 15,
            font: { size: 13, weight: '600', family: 'inherit' },
            color: '#0e1c1a',
            usePointStyle: true,
            pointStyle: 'circle'
          }
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          padding: 12,
          titleFont: { size: 14, weight: '600', family: 'inherit' },
          bodyFont: { size: 13, weight: '500', family: 'inherit' },
          callbacks: {
            title: (items) => items[0].label,
            label: ctx => ctx.dataset.type === 'bar' ? `${ctx.dataset.label}: ${formatNumberES(ctx.parsed.y)}` : `${ctx.dataset.label}: ${formatPercentES(ctx.parsed.y, 1)}`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            font: { size: 12, family: 'inherit' },
            color: getChartColors().textMuted || '#51635e',
            callback: v => formatNumberES(v)
          },
          grid: { color: getChartColors().grid || CONFIG.colors.grid, drawBorder: false }
        },
        y1: {
          position: 'right',
          min: 0,
          max: 100,
          ticks: {
            font: { size: 12, family: 'inherit' },
            color: getChartColors().textMuted || '#51635e',
            callback: v => formatPercentES(v, 1)
          },
          grid: { display: false }
        },
        x: {
          ticks: {
            font: { size: 12, family: 'inherit' },
            color: '#51635e'
          },
          grid: { display: false }
        }
      }
    }
  });
  updateFlags(series, 'progress-flags');
}

function createScatterChart() {
  const ctx = document.getElementById('scatter-chart'); if (!ctx) return;
  const data = state.filteredData.deportes.map(d => ({
    x: d.porcentaje_femenino || 0,
    y: d.total,
    deporte: d.deporte,
    total: d.total,
    porcentaje_femenino: d.porcentaje_femenino,
    selected: state.filters.selectedDeporte === d.deporte
  }));
  if (state.charts.scatter) state.charts.scatter.destroy();
  const maxTotal = Math.max(...data.map(d => d.total), 1);
  const colorScale = pct => {
    if (pct < 30) return 'rgba(255,138,61,0.75)';
    if (pct < 45) return 'rgba(251,191,36,0.75)';
    if (pct <= 55) return 'rgba(20,184,166,0.8)';
    return 'rgba(15,118,110,0.85)';
  };

  const parityLabel = {
    id: 'parityLabel',
    afterDatasetsDraw: chart => {
      const { ctx, chartArea, scales } = chart;
      ctx.save();
      ctx.fillStyle = '#0b3a36';
      ctx.font = '600 11px "Space Grotesk", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Zona de paridad (45%-55% femenino)', (chartArea.left + chartArea.right) / 2, scales.y.top + 15);
      ctx.restore();
    }
  };

  state.charts.scatter = new Chart(ctx, {
    type: 'scatter',
    data: { datasets: [{
      data,
      backgroundColor: c => c.raw.selected ? CONFIG.colors.selected : colorScale(c.raw.porcentaje_femenino),
      borderColor: c => c.raw.selected ? '#0b3a36' : 'rgba(255,255,255,0.85)',
      borderWidth: c => c.raw.selected ? 2.5 : 1,
      pointRadius: c => Math.max(6, Math.min(22, (c.raw.total / maxTotal) * 18)),
      pointHoverRadius: c => Math.max(8, Math.min(26, (c.raw.total / maxTotal) * 20)),
      pointHoverBorderWidth: 2.5,
      hoverBackgroundColor: c => colorScale(c.raw.porcentaje_femenino),
      clip: false
    }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 16, right: 12, left: 4, bottom: 8 } },
      onClick: (e, els) => {
        if (els.length) {
          const p = data[els[0].index];
          handleSelectedDeporteToggle(p.deporte);
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: document.body.classList.contains('dark') ? 'rgba(5, 15, 13, 0.95)' : 'rgba(8,15,13,0.92)',
          padding: 12,
          titleFont: { size: 15, weight: '700', family: 'inherit' },
          bodyFont: { size: 13, weight: '500', family: 'inherit' },
          callbacks: {
            title: ctx => ctx[0]?.raw?.deporte || '',
            label: ctx => {
              const lines = [];
              lines.push(`Total: ${formatNumberES(ctx.raw.total)} participantes`);
              lines.push(`% femenino: ${formatPercentES(ctx.raw.porcentaje_femenino, 1)}`);
              return lines;
            }
          }
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: '% participación femenina',
            font: { size: 13, weight: '600', family: 'inherit' },
            color: '#0e1c1a',
            padding: { top: 10, bottom: 5 }
          },
          min: 0,
          max: 100,
          ticks: {
            font: { size: 12, family: 'inherit' },
            color: getChartColors().textMuted || '#51635e',
            callback: v => formatPercentES(v, 1)
          },
          grid: { color: getChartColors().grid || 'rgba(15,118,110,0.08)', drawBorder: false }
        },
        y: {
          title: {
            display: true,
            text: 'Participantes totales',
            font: { size: 13, weight: '600', family: 'inherit' },
            color: '#0e1c1a',
            padding: { top: 5, bottom: 10 }
          },
          beginAtZero: true,
          ticks: {
            font: { size: 12, family: 'inherit' },
            color: getChartColors().textMuted || '#51635e',
            callback: v => formatNumberES(v)
          },
          grid: { color: getChartColors().grid || 'rgba(15,118,110,0.08)', drawBorder: false }
        }
      }
    },
    plugins: [{
      id: 'parity',
      beforeDatasetsDraw: chart => {
        const { ctx, scales } = chart;
        ctx.save();
        ctx.fillStyle = getChartColors().parityZone || CONFIG.colors.parityZone;
        const xs = CONFIG.parityRange.min, xe = CONFIG.parityRange.max;
        ctx.fillRect(
          scales.x.getPixelForValue(xs),
          scales.y.getPixelForValue(scales.y.max),
          scales.x.getPixelForValue(xe) - scales.x.getPixelForValue(xs),
          scales.y.getPixelForValue(0) - scales.y.getPixelForValue(scales.y.max)
        );
        ctx.restore();
      }
    }, parityLabel]
  });
}

function createGapChart() {
  const ctx = document.getElementById('gap-chart'); if (!ctx) return;
  const data = state.filteredData.deportes.sort((a, b) => a.porcentaje_femenino - b.porcentaje_femenino).slice(0, 8);
  if (!data.length) { if (ctx.parentElement) ctx.parentElement.style.minHeight = '200px'; return; }
  if (state.charts.gap) state.charts.gap.destroy();
  const midline = {
    id: 'gapMidline',
    beforeDatasetsDraw: chart => {
      const { ctx, chartArea, scales } = chart;
      const x = scales.x.getPixelForValue(50);
      ctx.save();
      ctx.strokeStyle = 'rgba(11,58,54,0.25)';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.stroke();
      ctx.restore();
    }
  };

  state.charts.gap = new Chart(ctx, {
    type: 'bar',
    data: { 
      labels: data.map(d => d.deporte.length > 18 ? d.deporte.slice(0, 16) + '…' : d.deporte), 
      datasets: [{
        label: '% femenino',
        data: data.map(d => d.porcentaje_femenino),
        backgroundColor: data.map(d => state.filters.selectedDeporte === d.deporte ? CONFIG.colors.selected : (d.porcentaje_femenino < CONFIG.parityRange.min ? 'rgba(255,138,61,0.8)' : 'rgba(15,118,110,0.8)')),
        borderColor: 'transparent',
        borderRadius: 8,
        barThickness: 16,
        hoverBackgroundColor: data.map(d => d.porcentaje_femenino < CONFIG.parityRange.min ? 'rgba(255,138,61,1)' : 'rgba(15,118,110,1)')
      }] 
    },
    options: {
      indexAxis: 'y', responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 8, right: 12, bottom: 8, left: 0 } },
      plugins: {
        legend: { display: false },
        datalabels: {
          align: 'right',
          anchor: 'end',
          offset: 8,
          color: '#0d1c1a',
          formatter: v => formatPercentES(v, 1),
          font: { weight: '700', size: 10 },
          clip: true
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          padding: 12,
          titleFont: { size: 14, weight: '600', family: 'inherit' },
          bodyFont: { size: 13, weight: '500', family: 'inherit' },
          callbacks: {
            title: (items) => data[items[0].dataIndex].deporte,
            label: ctx => {
              const s = data[ctx.dataIndex];
              const diff = formatDecimalES(s.porcentaje_femenino - 50, 1);
              return [
                `% femenino: ${formatPercentES(s.porcentaje_femenino, 1)}`,
                `Desviación vs paridad: ${diff > 0 ? '+' : ''}${formatDecimalES(diff, 1)} pts`,
                `Total: ${formatNumberES(s.total)} participaciones`
              ];
            }
          }
        }
      },
      scales: {
        x: {
          min: 0,
          max: 100,
          ticks: {
            font: { size: 12, family: 'inherit' },
            color: getChartColors().textMuted || '#51635e',
            callback: v => formatPercentES(v, 1)
          },
          grid: { color: getChartColors().grid || 'rgba(15,118,110,0.08)', drawBorder: false }
        },
        y: {
          ticks: {
            font: { size: 12, weight: '500', family: 'inherit' },
            color: '#0e1c1a'
          },
          grid: { display: false }
        }
      },
      onClick: (e, els) => {
        if (els.length) {
          const s = data[els[0].index];
          handleSelectedDeporteToggle(s.deporte);
        }
      }
    },
    plugins: [midline]
  });
}

function createLeadersChart() {
  const ctx = document.getElementById('leaders-chart'); if (!ctx) return;
  const data = state.filteredData.deportes.sort((a, b) => b.porcentaje_femenino - a.porcentaje_femenino).slice(0, 8);
  if (!data.length) { if (ctx.parentElement) ctx.parentElement.style.minHeight = '200px'; return; }
  if (state.charts.leaders) state.charts.leaders.destroy();
  const midline = {
    id: 'leaderMidline',
    beforeDatasetsDraw: chart => {
      const { ctx, chartArea, scales } = chart;
      const x = scales.x.getPixelForValue(50);
      ctx.save();
      ctx.strokeStyle = 'rgba(11,58,54,0.25)';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.stroke();
      ctx.restore();
    }
  };

  state.charts.leaders = new Chart(ctx, {
    type: 'bar',
    data: { 
      labels: data.map(d => d.deporte.length > 18 ? d.deporte.slice(0, 16) + '…' : d.deporte), 
      datasets: [{
        label: '% femenino',
        data: data.map(d => d.porcentaje_femenino),
        backgroundColor: data.map(d => state.filters.selectedDeporte === d.deporte ? CONFIG.colors.selected : 'rgba(20,184,166,0.85)'),
        borderColor: 'transparent',
        borderRadius: 8,
        barThickness: 16,
        hoverBackgroundColor: data.map(d => state.filters.selectedDeporte === d.deporte ? CONFIG.colors.selected : 'rgba(20,184,166,1)')
      }] 
    },
    options: {
      indexAxis: 'y', responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 8, right: 12, bottom: 8, left: 0 } },
      plugins: {
        legend: { display: false },
        datalabels: {
          align: 'right',
          anchor: 'end',
          offset: 8,
          color: '#0d1c1a',
          formatter: v => formatPercentES(v, 1),
          font: { weight: '700', size: 10 },
          clip: true
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          padding: 12,
          titleFont: { size: 14, weight: '600', family: 'inherit' },
          bodyFont: { size: 13, weight: '500', family: 'inherit' },
          callbacks: {
            title: (items) => data[items[0].dataIndex].deporte,
            label: ctx => {
              const s = data[ctx.dataIndex];
              return [`% femenino: ${formatPercentES(s.porcentaje_femenino, 1)}`, `Total: ${formatNumberES(s.total)} participaciones`];
            }
          }
        }
      },
      scales: {
        x: {
          min: 0,
          max: 100,
          ticks: {
            font: { size: 12, family: 'inherit' },
            color: getChartColors().textMuted || '#51635e',
            callback: v => formatPercentES(v, 1)
          },
          grid: { color: getChartColors().grid || 'rgba(15,118,110,0.08)', drawBorder: false }
        },
        y: {
          ticks: {
            font: { size: 12, weight: '500', family: 'inherit' },
            color: '#0e1c1a'
          },
          grid: { display: false }
        }
      },
      onClick: (e, els) => {
        if (els.length) {
          const s = data[els[0].index];
          handleSelectedDeporteToggle(s.deporte);
        }
      }
    },
    plugins: [midline]
  });
}

function createStackedChart() {
  const ctx = document.getElementById('stacked-chart'); if (!ctx) return;
  const series = getTemporalSeries();
  const labels = series.map(d => formatTemporada(d.temporada));
  if (state.charts.stacked) state.charts.stacked.destroy();
  state.charts.stacked = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [
      { label: 'Femenino', data: series.map(d => d.femenino), backgroundColor: CONFIG.colors.femenino },
      { label: 'Masculino', data: series.map(d => d.masculino), backgroundColor: CONFIG.colors.masculino }
    ] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            padding: 15,
            font: { size: 13, weight: '600', family: 'inherit' },
            color: '#0e1c1a',
            usePointStyle: true,
            pointStyle: 'circle'
          }
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          padding: 12,
          titleFont: { size: 14, weight: '600', family: 'inherit' },
          bodyFont: { size: 13, weight: '500', family: 'inherit' },
          callbacks: {
            title: (items) => items[0].label,
            label: ctx => `${ctx.dataset.label}: ${formatNumberES(ctx.parsed.y)}`
          }
        },
        datalabels: { display: false }
      },
      scales: {
        x: {
          stacked: true,
          ticks: {
            font: { size: 12, family: 'inherit' },
            color: '#51635e'
          },
          grid: { display: false }
        },
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: {
            font: { size: 12, family: 'inherit' },
            color: getChartColors().textMuted || '#51635e',
            callback: v => formatNumberES(v)
          },
          grid: { color: getChartColors().grid || CONFIG.colors.grid, drawBorder: false }
        }
      }
    }
  });
}

function createRaceChart() {
  // Usar la versión mejorada
  createImprovedRaceChart();
}

function updateRaceChartFrame() {
  // Usar la versión mejorada
  updateImprovedRaceFrame();
}

function toggleRacePlay() {
  if (state.raceTimer) { 
    clearInterval(state.raceTimer); 
    state.raceTimer = null; 
    const btn = document.getElementById('race-play');
    if (btn) btn.textContent = '▶ Play'; 
    return; 
  }
  const btn = document.getElementById('race-play');
  if (btn) btn.textContent = '⏸ Pause';
  state.raceTimer = setInterval(() => {
    state.filters.raceIndex = (state.filters.raceIndex + 1) % CONFIG.seasons.length;
    updateImprovedRaceFrame();
  }, 1200);
}

// ============================================================================
// NUEVO: HEATMAP DE DEPORTES (% PARTICIPACIÓN FEMENINA)
// ============================================================================

function createHeatmapDeportes() {
  const container = document.getElementById('heatmapDeportes');
  if (!container) return;
  
  // Limpiar contenedor
  container.innerHTML = '';
  
  // Obtener deportes filtrados, ordenados de mayor a menor número de participantes
  let deportesList = [];
  
  // Verificar si hay un filtro de deporte específico aplicado
  const hasDeporteFilter = (state.filters.deporte && state.filters.deporte !== 'todos') || state.filters.selectedDeporte;
  // Verificar si hay un filtro de categoría de oferta aplicado
  const hasCategoriaOfertaFilter = state.filters.categoriaOferta;
  
  // Si hay un filtro de categoría, necesitamos incluir TODOS los deportes que tienen oferta en esa categoría
  // incluso si no están en state.allData.deportes
  if (hasCategoriaOfertaFilter) {
    // Obtener todos los deportes únicos que tienen oferta en esta categoría
    // IMPORTANTE: usar exactamente la misma normalización que en applyFilters (categoriaDeportes)
    const deportesEnCategoria = new Set();
    state.allData.ofertaCompeticion
      .filter(row => row.categoria === state.filters.categoriaOferta)
      .forEach(row => {
        // row.deporte ya está normalizado con normalizeDeporteFromOferta al parsear
        // Aplicamos cleanDeporteName para que coincida con categoriaDeportes en applyFilters
        const normalized = cleanDeporteName(row.deporte);
        deportesEnCategoria.add(normalized);
      });
    
    // Crear un mapa de deportes con datos históricos, usando la misma normalización
    // IMPORTANTE: usar exactamente la misma normalización que en deportesEnCategoria y en applyFilters
    // PRIORIZAR state.filteredData.deportes que ya tiene todos los filtros aplicados (incluyendo temporada)
    const deportesConDatos = new Map();
    if (state.filteredData.deportes && state.filteredData.deportes.length > 0) {
      state.filteredData.deportes.forEach(d => {
        // Normalizar de la misma manera que en applyFilters: cleanDeporteName(normalizeDeporteFromOferta(d.deporte))
        const normalized = cleanDeporteName(normalizeDeporteFromOferta(d.deporte));
        // Solo añadir si el deporte está en la categoría filtrada
        if (deportesEnCategoria.has(normalized)) {
          deportesConDatos.set(normalized, d);
        }
      });
    }
    
    // Para cada deporte en la categoría, usar datos existentes o crear un objeto básico
    deportesList = Array.from(deportesEnCategoria).map(deporteName => {
      // deporteName ya está normalizado, buscar directamente
      if (deportesConDatos.has(deporteName)) {
        return deportesConDatos.get(deporteName);
      }
      // Si no hay datos históricos, crear un objeto básico
      return {
        deporte: deporteName,
        total: 0,
        femenino: 0,
        masculino: 0,
        porcentaje_femenino: 0
      };
    }).sort((a, b) => b.total - a.total);
  } else if (hasDeporteFilter && state.filteredData.deportes && state.filteredData.deportes.length > 0) {
    // Si hay un filtro de deporte específico, usar los datos filtrados
    deportesList = state.filteredData.deportes
    .slice()
      .sort((a, b) => b.total - a.total);
  } else {
    // Si NO hay filtros específicos de deporte o categoría, usar los datos filtrados
    // Esto asegura que se respeten todos los filtros globales, incluyendo el de temporada
    if (state.filteredData.deportes && state.filteredData.deportes.length > 0) {
      deportesList = state.filteredData.deportes
        .slice()
        .sort((a, b) => b.total - a.total);
    } else if (state.allData.deportes && state.allData.deportes.length > 0) {
      // Como respaldo, usar allData pero aplicar filtros manualmente
      let allDeportes = state.allData.deportes.slice();
      
      // Aplicar filtro de outliers si está activo
      if (state.filters.excludeOutliers) {
        allDeportes = allDeportes.filter(d => {
          const cleanedDeporte = cleanDeporteName(d.deporte);
          return !OUTLIER_DEPORTES.has(cleanedDeporte);
        });
      }
      
      deportesList = allDeportes.sort((a, b) => b.total - a.total);
    } else {
      // Como último recurso, usar todos los deportes del filtro dropdown
      const deporteFilter = document.getElementById('deporte-filter');
      if (deporteFilter) {
        const allOptions = Array.from(deporteFilter.options);
        deportesList = allOptions
          .filter(opt => opt.value !== 'todos')
          .map(opt => {
            // Buscar datos del deporte en state.allData
            const deporteData = state.allData.deportes?.find(d => d.deporte === opt.value);
            if (deporteData) {
              return deporteData;
            }
            // Si no hay datos, crear un objeto básico
            return {
              deporte: opt.value,
              total: 0,
              femenino: 0,
              masculino: 0,
              porcentaje_femenino: 0
            };
          })
          .sort((a, b) => b.total - a.total);
      }
    }
  }
  
  if (!deportesList.length) {
    container.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--muted);">Sin datos disponibles</div>';
    return;
  }
  
  // Contar deportes sin datos históricos
  const deportesSinDatos = deportesList.filter(d => d.total === 0).length;
  
  // Crear recuadros para cada deporte
  deportesList.forEach(deporte => {
    const tieneDatos = deporte.total > 0;
    const pctFem = deporte.porcentaje_femenino || (tieneDatos ? (deporte.femenino / deporte.total) * 100 : 0);
    const color = tieneDatos ? getParityColor(pctFem) : 'rgba(100, 115, 110, 0.75)'; // Color gris más oscuro para sin datos (mejor legibilidad)
    const isSelected = state.filters.deporte === deporte.deporte || state.filters.selectedDeporte === deporte.deporte;
    
    const tile = document.createElement('div');
    tile.className = `heatmap-tile ${isSelected ? 'selected' : ''} ${!tieneDatos ? 'sin-datos' : ''}`;
    tile.style.backgroundColor = color;
    tile.style.borderStyle = !tieneDatos ? 'dashed' : 'solid';
    tile.style.opacity = !tieneDatos ? '1' : '1'; // Mantener opacidad completa para mejor legibilidad
    
    const tooltipText = tieneDatos 
      ? `${deporte.deporte}\n% Femenino: ${formatPercentES(pctFem, 1)}\nTotal: ${formatNumberES(deporte.total)} participantes`
      : `${deporte.deporte}\n⚠️ Sin datos históricos de participación\nEste deporte tiene oferta en la categoría seleccionada, pero no hay datos de participación disponibles`;
    tile.title = tooltipText;
    
    const nameDiv = document.createElement('div');
    nameDiv.className = 'heatmap-tile-name';
    nameDiv.textContent = deporte.deporte;
    if (!tieneDatos) {
      nameDiv.style.fontStyle = 'italic';
    }
    
    const valueDiv = document.createElement('div');
    valueDiv.className = 'heatmap-tile-value';
    if (tieneDatos) {
      valueDiv.textContent = formatPercentES(pctFem, 1);
    } else {
      valueDiv.textContent = 'Sin datos';
      valueDiv.style.fontSize = '0.75rem';
      valueDiv.style.opacity = '1';
    }
    
    tile.appendChild(nameDiv);
    tile.appendChild(valueDiv);
    
    // Click handler
    tile.addEventListener('click', () => {
      const filterEl = document.getElementById('deporte-filter');
      const clickedDeporte = deporte.deporte;
      
      if (state.filters.deporte === clickedDeporte || state.filters.selectedDeporte === clickedDeporte) {
        state.filters.deporte = 'todos';
        state.filters.selectedDeporte = null;
        if (filterEl) filterEl.value = 'todos';
      } else {
        state.filters.deporte = clickedDeporte;
        state.filters.selectedDeporte = clickedDeporte;
        if (filterEl) filterEl.value = clickedDeporte;
      }
      
      // Actualizar insights de ambos visuales
      const heatmapInsight = document.getElementById('heatmap-insight-text');
      const scatterInsight = document.getElementById('scatter-insight-text');
      if (state.filters.deporte === 'todos') {
        if (heatmapInsight) heatmapInsight.textContent = 'Haz clic en un deporte para filtrar el dashboard';
        if (scatterInsight) scatterInsight.textContent = 'Haz clic en un deporte para filtrar el dashboard';
      } else {
        if (tieneDatos) {
          const text = `Filtrando por: ${clickedDeporte} (${formatPercentES(pctFem, 1)} femenino)`;
          if (heatmapInsight) heatmapInsight.textContent = text;
          if (scatterInsight) scatterInsight.textContent = text;
        } else {
          const text = `Filtrando por: ${clickedDeporte} ⚠️ Este deporte tiene oferta en la categoría seleccionada, pero no hay datos históricos de participación disponibles.`;
          if (heatmapInsight) heatmapInsight.textContent = text;
          if (scatterInsight) scatterInsight.textContent = text;
        }
      }
      
      refresh();
    });
    
    container.appendChild(tile);
  });
  
  // Actualizar el insight final para mencionar deportes sin datos si los hay
  const heatmapInsight = document.getElementById('heatmap-insight-text');
  const scatterInsight = document.getElementById('scatter-insight-text');
  
  if (hasCategoriaOfertaFilter && deportesSinDatos > 0) {
    // Si hay filtro de categoría y deportes sin datos, explicar claramente
    const deportesConDatos = deportesList.length - deportesSinDatos;
    let mensaje = `Filtrando por categoría ${state.filters.categoriaOferta}. `;
    mensaje += `${deportesConDatos} ${deportesConDatos === 1 ? 'deporte tiene' : 'deportes tienen'} datos históricos. `;
    mensaje += `${deportesSinDatos} ${deportesSinDatos === 1 ? 'deporte aparece' : 'deportes aparecen'} con oferta pero sin datos históricos de participación (marcados con ⚠️).`;
    if (heatmapInsight) heatmapInsight.textContent = mensaje;
    if (scatterInsight) scatterInsight.textContent = mensaje;
  } else if (hasCategoriaOfertaFilter && deportesSinDatos === 0) {
    // Si hay filtro de categoría pero todos tienen datos
    const text = `Filtrando por categoría ${state.filters.categoriaOferta}. Todos los deportes mostrados tienen datos históricos de participación.`;
    if (heatmapInsight) heatmapInsight.textContent = text;
    if (scatterInsight) scatterInsight.textContent = text;
  } else if (!hasCategoriaOfertaFilter && !hasDeporteFilter) {
    // Sin filtros específicos, mensaje general
    const text = 'Haz clic en un deporte para filtrar el dashboard';
    if (heatmapInsight) heatmapInsight.textContent = text;
    if (scatterInsight) scatterInsight.textContent = text;
  }
  // Si hay filtro de deporte específico, el mensaje ya se actualizó en el click handler
  
  // Limpiar referencia al chart antiguo si existe
  if (state.charts.heatmapDeportes) {
    state.charts.heatmapDeportes = null;
  }
}

function toggleOfferCategoryFilter(category) {
  if (!category) return;
  const isSame = state.filters.categoriaOferta === category;
  state.filters.categoriaOferta = isSame ? null : category;
  refresh();
}

function handleSelectedDeporteToggle(deporte) {
  const filterEl = document.getElementById('deporte-filter');
  
  if (!deporte) {
    if (state.filters.selectedDeporte) {
      state.filters.selectedDeporte = null;
      state.filters.deporte = 'todos';
      if (filterEl) filterEl.value = 'todos';
      // Actualizar insights a estado inicial
      const heatmapInsight = document.getElementById('heatmap-insight-text');
      const scatterInsight = document.getElementById('scatter-insight-text');
      const text = 'Haz clic en un deporte para filtrar el dashboard';
      if (heatmapInsight) heatmapInsight.textContent = text;
      if (scatterInsight) scatterInsight.textContent = text;
      refresh();
    }
    return;
  }
  const isSame = state.filters.selectedDeporte === deporte || state.filters.deporte === deporte;
  
  if (isSame) {
    // Deseleccionado, volver a estado inicial
    state.filters.selectedDeporte = null;
    state.filters.deporte = 'todos';
    if (filterEl) filterEl.value = 'todos';
    
    // Actualizar insights
    const heatmapInsight = document.getElementById('heatmap-insight-text');
    const scatterInsight = document.getElementById('scatter-insight-text');
    const text = 'Haz clic en un deporte para filtrar el dashboard';
    if (heatmapInsight) heatmapInsight.textContent = text;
    if (scatterInsight) scatterInsight.textContent = text;
  } else {
    // Seleccionado, actualizar filtros
    state.filters.selectedDeporte = deporte;
    state.filters.deporte = deporte;
    if (filterEl) filterEl.value = deporte;
    
    // Actualizar insights
    const heatmapInsight = document.getElementById('heatmap-insight-text');
    const scatterInsight = document.getElementById('scatter-insight-text');
    const text = `Filtrando por: ${deporte}`;
    if (heatmapInsight) heatmapInsight.textContent = text;
    if (scatterInsight) scatterInsight.textContent = text;
  }
  
  refresh();
}

function handleTemporadaToggle(temporada) {
  if (!temporada) {
    if (state.filters.temporada !== 'todas') {
      state.filters.temporada = 'todas';
      // Actualizar el select
      const tempSelect = document.getElementById('temporada-filter');
      if (tempSelect) tempSelect.value = 'todas';
      refresh();
    }
    return;
  }
  const isSame = state.filters.temporada === temporada;
  state.filters.temporada = isSame ? 'todas' : temporada;
  // Actualizar el select
  const tempSelect = document.getElementById('temporada-filter');
  if (tempSelect) tempSelect.value = state.filters.temporada;
  refresh();
}

function createOfertaCategoriasChart() {
  const canvas = document.getElementById('offer-category-chart');
  if (!canvas) return;
  if (state.charts.ofertaCategorias) {
    state.charts.ofertaCategorias.destroy();
    state.charts.ofertaCategorias = null;
  }
  const summary = state.filteredData.ofertaCompeticion || { categories: [] };
  const data = Array.isArray(summary.categories) ? summary.categories : [];
  if (!data.length) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '600 14px "Space Grotesk", sans-serif';
    ctx.fillStyle = '#879690';
    ctx.textAlign = 'center';
    ctx.fillText('Sin datos de oferta disponibles', canvas.width / 2, canvas.height / 2);
    updateOfferCategoryInsight(summary, data);
    return;
  }
  const labels = data.map(item => item.categoria);
  const totals = data.map(item => item.total || 0);
  const maxValue = totals.length ? Math.max(...totals) : 0;
  const selectedCategory = state.filters.categoriaOferta || null;
  // Color fijo para todas las barras, excepto cuando hay una categoría seleccionada
  const fixedColor = 'rgba(15, 118, 110, 0.7)'; // Color verde consistente
  const selectedColor = CONFIG.colors.selected; // Color para la categoría seleccionada
  const colors = data.map((item, idx) => {
    // Solo cambiar color si hay una categoría seleccionada y esta barra es la seleccionada
    if (selectedCategory && item.categoria === selectedCategory) {
      return selectedColor;
    }
    return fixedColor;
  });
  state.charts.ofertaCategorias = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Actividades ofertadas',
        data: totals,
        backgroundColor: colors,
        borderRadius: 10,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      onHover: (evt, elements) => {
        evt.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default';
      },
      onClick: (evt, elements) => {
        if (!elements || !elements.length) {
          return;
        }
        const idx = elements[0].index;
        const category = labels[idx];
        toggleOfferCategoryFilter(category);
      },
      scales: {
        y: {
          beginAtZero: true,
          suggestedMax: maxValue === 0 ? 5 : undefined,
          ticks: { display: false },
          grid: { display: false },
          border: { display: false }
        },
        x: {
          ticks: {
            font: { size: 12, family: 'inherit' },
            color: getChartColors().textMuted || '#51635e',
            autoSkip: false,
            maxRotation: 0,
            callback: value => labels[value] && labels[value].length > 12 ? labels[value].slice(0, 11) + '…' : labels[value]
          },
          grid: { display: false }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: document.body.classList.contains('dark') ? 'rgba(5, 15, 13, 0.95)' : 'rgba(0,0,0,0.85)',
          callbacks: {
            title: ctx => labels[ctx[0].dataIndex],
            label: ctx => {
              const item = data[ctx.dataIndex];
              const deportes = (item.deportes || []).slice(0, 3);
              const extra = (item.deportes || []).length > 3 ? ` +${(item.deportes || []).length - 3}` : '';
              return [
                `Actividades: ${ctx.parsed.y}`,
                deportes.length ? `Deportes: ${deportes.join(', ')}${extra}` : 'Deportes: sin oferta'
              ];
            }
          }
        },
        datalabels: {
          display: true,
          clip: false,
          color: (context) => {
            // Si hay una categoría seleccionada y esta barra es la seleccionada, usar color claro
            const dataIndex = context.dataIndex;
            const isDark = document.body.classList.contains('dark');
            if (selectedCategory && labels[dataIndex] === selectedCategory) {
              return '#ffffff'; // Color blanco para contrastar con el fondo oscuro
            }
            return isDark ? getChartColors().text || '#effaf7' : '#0b3a36'; // Color según el modo
          },
          font: { weight: 700, size: 11 },
          formatter: value => value,
          anchor: 'center', // Anclar al centro de la barra
          align: 'center', // Centrar el texto horizontalmente
          offset: 0, // Sin offset para centrarlo perfectamente en el medio
          padding: { bottom: 2 }
        }
      }
    }
  });
  updateOfferCategoryInsight(summary, data);
}

function updateOfferCategoryInsight(summary, data) {
  const insightEl = document.getElementById('offer-category-insight-text');
  if (!insightEl) return;
  if (!data.length) {
    insightEl.textContent = 'Sin datos filtrados de oferta de competición.';
    return;
  }
  const categoriaSeleccionada = state.filters.categoriaOferta;
  const deporteFiltro = state.filters.selectedDeporte || (state.filters.deporte !== 'todos' ? state.filters.deporte : null);
  
  if (categoriaSeleccionada) {
    const entry = data.find(item => item.categoria === categoriaSeleccionada) || { total: 0, deportes: [] };
    const totalCat = entry.total || 0;
    const deportes = entry.deportes || [];
    const deportesTexto = deportes.length
      ? `${deportes.slice(0, 4).join(', ')}${deportes.length > 4 ? ` +${deportes.length - 4} más` : ''}`
      : 'sin deportes registrados';
    const focoExtra = deporteFiltro ? ` Además filtrado por <strong>${deporteFiltro}</strong>.` : '';
    insightEl.innerHTML = `<strong>${categoriaSeleccionada}:</strong> ${totalCat} actividades de competición 2024-25. ${deportes.length ? `Deportes disponibles: ${deportesTexto}.` : 'Sin deportes activos en esta categoría.'}${focoExtra}`;
    return;
  }
  const topCategory = data.reduce((best, current) => (current.total > best.total ? current : best), data[0]);
  
  // Si hay un deporte filtrado
  if (deporteFiltro || summary.focusDeporte) {
    const deporteNombre = deporteFiltro || summary.focusDeporte;
    if (summary.matchedActividades > 0) {
      // Calcular distribución por categoría
      const categoriasConOferta = data.filter(item => (item.total || 0) > 0);
      const categoriasSinOferta = data.filter(item => (item.total || 0) === 0);
      
      let texto = `<strong>${deporteNombre}</strong> tiene <strong>${summary.matchedActividades} actividades</strong> de competición 2024-25. `;
      
      if (categoriasConOferta.length > 0) {
        // Ordenar por total descendente
        const categoriasOrdenadas = categoriasConOferta.sort((a, b) => b.total - a.total);
        const distribucion = categoriasOrdenadas.map(cat => `${cat.categoria} (${cat.total})`).join(', ');
        texto += `Distribución: ${distribucion}. `;
      }
      
      if (categoriasSinOferta.length > 0) {
        const missing = categoriasSinOferta.map(item => item.categoria);
        const listMissing = missing.length === 1
          ? missing[0]
          : `${missing.slice(0, -1).join(', ')} y ${missing[missing.length - 1]}`;
        texto += `Sin oferta en ${listMissing}.`;
      } else {
        texto += `Oferta disponible en todas las categorías.`;
      }
      
      insightEl.innerHTML = texto;
    } else {
      insightEl.innerHTML = `<strong>${deporteNombre}:</strong> sin oferta de competición 2024-25 registrada en las categorías mostradas.`;
    }
    return;
  }
  if (summary.totalActividades === 0 || topCategory.total === 0) {
    insightEl.textContent = 'Sin datos de oferta de competición 2024-25 disponibles.';
    return;
  }
  
  // Sin filtros específicos: mostrar resumen general
  const categoriasConOferta = data.filter(item => (item.total || 0) > 0);
  let texto = `Oferta total: <strong>${summary.totalActividades} actividades</strong> de competición 2024-25. `;
  texto += `<strong>${topCategory.categoria}</strong> es la categoría con más oferta (${topCategory.total} actividades). `;
  
  if (categoriasConOferta.length < data.length) {
    const sinOferta = data.length - categoriasConOferta.length;
    texto += `${sinOferta} ${sinOferta === 1 ? 'categoría sin' : 'categorías sin'} oferta registrada.`;
  }
  
  insightEl.innerHTML = texto;
}

function updateFlags(series, elementId) {
  const el = document.getElementById(elementId); if (!el || !series.length) return;
  const max = series.reduce((a, b) => b.total > a.total ? b : a, series[0]);
  const min = series.reduce((a, b) => b.total < a.total ? b : a, series[0]);
  el.innerHTML = `<span class="flag">Pico: ${max.temporada} (${formatNumberES(max.total)})</span><span class="flag">Valle: ${min.temporada} (${formatNumberES(min.total)})</span>`;
}

function updateInsights() {
  const total = state.filteredData.porDeporte.reduce((s, d) => s + d.total, 0);
  const fem = state.filteredData.porDeporte.reduce((s, d) => s + d.femenino, 0);
  const pct = total > 0 ? (fem / total) * 100 : 0;
  const maxGap = state.filteredData.deportes.sort((a, b) => a.porcentaje_femenino - b.porcentaje_femenino)[0];
  
  // Actualizar KPI Total (valor compacto)
  const totalEl = document.getElementById('teaser-total'); 
  if (totalEl) totalEl.textContent = formatNumberES(total);
  
  // Actualizar KPI % Femenino (valor compacto)
  const femEl = document.getElementById('teaser-fem');
  if (femEl) femEl.textContent = formatPercentES(pct, 1);
  
  // Actualizar observación dinámica
  const conc = document.getElementById('conclusion-text');
  if (conc && maxGap) {
    conc.textContent = `El mayor gap lo tiene ${maxGap.deporte} con ${formatPercentES(maxGap.porcentaje_femenino, 1)} femenino en ${state.filters.temporada === 'todas' ? 'todas las temporadas' : state.filters.temporada}.`;
  }
}

function updateFilterFeedback() {
  // Destacar filtros activos
  const { temporada, deporte, excludeOutliers, selectedDeporte, categoriaOferta } = state.filters;
  
  // Filtro de temporada
  const tempField = document.querySelector('#temporada-filter')?.closest('.sidebar-filter-field');
  const tempSelect = document.getElementById('temporada-filter');
  if (tempField && tempSelect) {
    if (temporada !== 'todas') {
      tempField.classList.add('active');
      tempSelect.classList.add('active');
    } else {
      tempField.classList.remove('active');
      tempSelect.classList.remove('active');
    }
  }
  
  // Filtro de deporte
  const depField = document.querySelector('#deporte-filter')?.closest('.sidebar-filter-field');
  const depSelect = document.getElementById('deporte-filter');
  if (depField && depSelect) {
    if (deporte !== 'todos' || selectedDeporte) {
      depField.classList.add('active');
      depSelect.classList.add('active');
    } else {
      depField.classList.remove('active');
      depSelect.classList.remove('active');
    }
  }
  
  // Toggle de casos extremos
  const outliersField = document.querySelector('#exclude-outliers-toggle')?.closest('.sidebar-filter-field');
  const outliersToggle = document.getElementById('exclude-outliers-toggle');
  const toggleSwitch = outliersToggle?.closest('.toggle-switch');
  if (outliersField && toggleSwitch) {
    if (excludeOutliers) {
      outliersField.classList.add('active');
      toggleSwitch.classList.add('active');
    } else {
      outliersField.classList.remove('active');
      toggleSwitch.classList.remove('active');
    }
  }
  
  // Si hay filtro de categoría activo, también destacarlo (aunque no está en el sidebar, se puede añadir visualmente)
  // Por ahora solo destacamos los filtros del sidebar
}

function downloadFiltered() {
  const rows = state.filteredData.porDeporte;
  let csv = 'temporada,deporte,femenino,masculino,total\n';
  rows.forEach(r => { csv += `${r.temporada},${r.deporte},${r.femenino},${r.masculino},${r.total}\n`; });
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'filtered.csv'; a.click(); URL.revokeObjectURL(url);
}


function updateTourUI(forceReset=false) {
  const next = document.getElementById('tour-next');
  if (!next) return;
  if (forceReset) { next.textContent = 'Siguiente'; next.dataset.action = 'next'; return; }
  if (tourIndex >= tourSteps.length - 1) { next.textContent = 'Cerrar'; next.dataset.action = 'close'; } else { next.textContent = 'Siguiente'; next.dataset.action = 'next'; }
}

// Tour
const tourSteps = [
  { title: 'Mueve el slider', text: 'Usa el slider del race chart para ver el cambio por años.' },
  { title: 'Haz clic en un deporte', text: 'En el scatter o heatmap para fijarlo y ver el resto adaptado.' },
  { title: 'Explora libremente', text: 'En el laboratorio ajusta filtros y descarga el dataset filtrado.' }
];
let tourIndex = 0;
function startTour() { tourIndex = 0; showTour(); updateTourUI(); }
function nextTourStep() { if (tourIndex >= tourSteps.length - 1) { endTour(); return; } tourIndex++; showTour(); updateTourUI(); }
function endTour() {
  const o = document.getElementById('tour-overlay');
  if (o) {
    o.hidden = true;
  }
  updateTourUI(true);
}
function showTour() {
  const o = document.getElementById('tour-overlay');
  if (!o) return;
  o.hidden = false;
  const titleEl = document.getElementById('tour-title');
  const textEl = document.getElementById('tour-text');
  if (titleEl) titleEl.textContent = tourSteps[tourIndex].title;
  if (textEl) textEl.textContent = tourSteps[tourIndex].text;
  updateTourUI();
}

function updateThemeIcon() {
  const toggleBtn = document.getElementById('toggle-theme-header') || document.getElementById('toggle-theme');
  if (toggleBtn) {
    const isDark = document.body.classList.contains('dark');
    // Mostrar el icono del modo al que cambiarás (no el actual)
    // Si estás en modo oscuro, muestra sol para cambiar a claro
    // Si estás en modo claro, muestra luna para cambiar a oscuro
    toggleBtn.innerHTML = isDark ? '☀️ Modo' : '🌙 Modo';
  }
}

function toggleTheme() {
  document.body.classList.toggle('dark');
  updateThemeIcon();
  // Actualizar todos los gráficos cuando se cambia el modo
  setTimeout(() => {
    refresh();
  }, 100);
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') endTour(); });


function destroyCharts() { Object.values(state.charts).forEach(ch => { if (ch && ch.destroy) ch.destroy(); }); state.charts = {}; }

function refresh() {
  // Verificar que Chart.js esté cargado
  if (typeof Chart === 'undefined') {
    console.warn('Chart.js not loaded yet, retrying...');
    setTimeout(refresh, 100);
    return;
  }
  
  // Verificar que los datos estén cargados
  if (!state.allData.porDeporte || state.allData.porDeporte.length === 0) {
    console.warn('Data not loaded yet, retrying...');
    setTimeout(refresh, 100);
    return;
  }
  
  // Verificar que los datos filtrados estén disponibles después de aplicar filtros
  if (!state.filteredData || !state.filteredData.deportes) {
    console.warn('Filtered data not ready, applying filters first...');
    applyFilters();
  }
  
  // Registrar plugins si están disponibles
  if (!pluginsRegistered && typeof ChartDataLabels !== 'undefined') {
    Chart.register(ChartDataLabels);
    pluginsRegistered = true;
  }
  
  try {
    // Aplicar filtros primero
    applyFilters();
    
    // Verificar que hay datos después de aplicar filtros
    if (!state.filteredData.deportes || state.filteredData.deportes.length === 0) {
      console.warn('No data after filtering, but continuing to create charts with available data...');
    }
    
    // Destruir gráficos existentes
    destroyCharts();
    
    // Pequeño delay para asegurar que el DOM esté listo
    setTimeout(() => {
      try {
        console.log('Creating charts with data:', {
          porDeporte: state.allData.porDeporte.length,
          filteredDeportes: state.filteredData.deportes.length,
          temporal: state.allData.temporal.length
        });
        
        createHeroChart();
        createImprovedBubblePlot(); // Mapa de paridad (bubble plot mejorado)
        createOfertaCategoriasChart();
        createStackedChart();
        createRaceChart();
        createHeatmapDeportes(); // Heatmap interactivo de deportes
        createGapTimelineChart(); // ¿Cuándo se abre la brecha?
        createOfertaChart(); // Panel de oferta 2024-25
        updateInsights();
        updateImprovedInsight(); // Versión mejorada del insight
        updateFilterFeedback(); // Actualizar feedback visual de filtros y contador
        
        console.log('Charts created successfully');
      } catch (error) {
        console.error('Error creating charts:', error);
        console.error('Error stack:', error.stack);
        // Mostrar mensaje de error al usuario
        const errorMsg = document.createElement('div');
        errorMsg.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;padding:2rem;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.2);z-index:10000;max-width:500px;text-align:center;';
        errorMsg.innerHTML = '<h3 style="color:#d32f2f;margin:0 0 1rem;">Error al cargar visualizaciones</h3><p style="color:#666;margin:0 0 1rem;">' + error.message + '</p><button onclick="location.reload()" style="padding:0.5rem 1rem;background:#0f766e;color:#fff;border:none;border-radius:6px;cursor:pointer;">Recargar página</button>';
        document.body.appendChild(errorMsg);
      }
    }, 100);
  } catch (error) {
    console.error('Error in refresh:', error);
    console.error('Error stack:', error.stack);
  }
}

// Función para esperar a que Chart.js esté completamente cargado
function waitForChartJS(callback, maxAttempts = 50) {
  let attempts = 0;
  const checkChart = () => {
    attempts++;
    // Verificar que Chart.js esté disponible y tenga el constructor
    if (typeof Chart !== 'undefined' && typeof Chart.prototype !== 'undefined') {
      callback();
    } else if (attempts < maxAttempts) {
      setTimeout(checkChart, 100);
    } else {
      console.error('Chart.js failed to load after', maxAttempts * 100, 'ms');
      const errorMsg = document.createElement('div');
      errorMsg.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;padding:2rem;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.2);z-index:10000;max-width:500px;text-align:center;';
      errorMsg.innerHTML = '<h3 style="color:#d32f2f;margin:0 0 1rem;">Error al cargar Chart.js</h3><p style="color:#666;margin:0 0 1rem;">La librería de gráficos no se ha cargado correctamente.</p><button onclick="location.reload()" style="padding:0.5rem 1rem;background:#0f766e;color:#fff;border:none;border-radius:6px;cursor:pointer;">Recargar página</button>';
      document.body.appendChild(errorMsg);
    }
  };
  checkChart();
}

// Mostrar indicador de carga
function showLoadingIndicator() {
  const loader = document.createElement('div');
  loader.id = 'loading-indicator';
  loader.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(246,247,245,0.95);display:flex;align-items:center;justify-content:center;z-index:9999;flex-direction:column;';
  loader.innerHTML = `
    <div style="width:50px;height:50px;border:4px solid rgba(15,118,110,0.2);border-top-color:#0f766e;border-radius:50%;animation:spin 1s linear infinite;margin-bottom:1rem;"></div>
    <p style="color:#0f766e;font-weight:600;font-size:1rem;margin:0;">Cargando datos...</p>
    <style>
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    </style>
  `;
  document.body.appendChild(loader);
}

function hideLoadingIndicator() {
  const loader = document.getElementById('loading-indicator');
  if (loader) {
    loader.style.opacity = '0';
    loader.style.transition = 'opacity 0.3s ease';
    setTimeout(() => loader.remove(), 300);
  }
}

// Listener para redimensionar charts cuando cambie el tamaño de la ventana
let resizeTimeout;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    // Actualizar todos los charts
    Object.values(state.charts).forEach(chart => {
      if (chart && chart.resize) {
        chart.resize();
      }
    });
    // Actualizar heatmap
    if (state.filteredData && state.filteredData.deportes) {
      createHeatmapDeportes();
    }
  }, 250);
});

// Función para manejar el modal de bienvenida
function setupWelcomeModal() {
  const modal = document.getElementById('welcome-modal');
  const closeBtn = document.getElementById('welcome-modal-close');
  const understoodBtn = document.getElementById('welcome-modal-understood');
  
  if (!modal) return;
  
  // Mostrar el modal siempre al cargar la página
  setTimeout(() => {
    modal.style.display = 'flex';
  }, 500);
  
  // Función para cerrar el modal
  function closeModal() {
    modal.style.display = 'none';
  }
  
  // Cerrar al hacer clic en el botón X
  if (closeBtn) {
    closeBtn.addEventListener('click', closeModal);
  }
  
  // Cerrar al hacer clic en "Entendido"
  if (understoodBtn) {
    understoodBtn.addEventListener('click', closeModal);
  }
  
  // Cerrar al hacer clic fuera del modal
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });
  
  // Cerrar con la tecla Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.style.display === 'flex') {
      closeModal();
    }
  });
}

window.addEventListener('DOMContentLoaded', async () => {
  showLoadingIndicator();
  
  try {
    console.log('Starting data load...');
    // Cargar datos primero
    await loadData();
    console.log('Data loaded, waiting for Chart.js...');
    
    // Esperar a que Chart.js esté listo antes de continuar
    waitForChartJS(() => {
      try {
        console.log('Chart.js ready, initializing dashboard...');
        
        // Asegurar que los filtros estén en sus valores por defecto
        state.filters.temporada = 'todas';
        state.filters.deporte = 'todos';
        state.filters.genero = 'todos';
        state.filters.selectedDeporte = null;
        state.filters.categoriaOferta = null;
        state.filters.excludeOutliers = false;
        
        // Sincronizar los selects con el estado
        const tempSelect = document.getElementById('temporada-filter');
        const depSelect = document.getElementById('deporte-filter');
        if (tempSelect) tempSelect.value = 'todas';
        if (depSelect) depSelect.value = 'todos';
        
        // Poblar el filtro de deportes
        populateDeporteFilter();
        
        // Configurar los event listeners de los filtros
        setupFilters();
        // resetParticipantsFilterToDefault({ triggerRefresh: false }); // Comentado porque el filtro de participantes fue eliminado
        
        // Aplicar filtros iniciales
        console.log('Applying initial filters...');
        applyFilters();
        
        // Verificar que los datos filtrados estén disponibles
        if (!state.filteredData || !state.filteredData.deportes) {
          console.error('Filtered data not available after applyFilters');
          throw new Error('No filtered data available');
        }
        
        console.log('Filtered data ready:', {
          deportes: state.filteredData.deportes.length,
          porDeporte: state.filteredData.porDeporte.length
        });
        
        // Refrescar los gráficos
        refresh();
        
        // Ocultar indicador de carga después de un pequeño delay para que los gráficos se rendericen
        setTimeout(() => {
          hideLoadingIndicator();
          console.log('Dashboard initialized successfully');
          // Configurar el modal de bienvenida después de que todo esté cargado
          setupWelcomeModal();
        }, 800);
        
        // Añadir listener de resize para redimensionar gráficos cuando cambia el tamaño de la ventana
        let resizeTimeout;
        window.addEventListener('resize', () => {
          clearTimeout(resizeTimeout);
          resizeTimeout = setTimeout(() => {
            // Redimensionar todos los gráficos de Chart.js
            Object.values(state.charts).forEach(chart => {
              if (chart && typeof chart.resize === 'function') {
                chart.resize();
              }
            });
          }, 150); // Debounce para evitar demasiadas llamadas
        });
      } catch (error) {
        console.error('Error initializing dashboard:', error);
        console.error('Error stack:', error.stack);
        hideLoadingIndicator();
        
        // Mostrar error al usuario
        const errorMsg = document.createElement('div');
        errorMsg.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;padding:2rem;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.2);z-index:10000;max-width:500px;text-align:center;';
        errorMsg.innerHTML = '<h3 style="color:#d32f2f;margin:0 0 1rem;">Error al inicializar dashboard</h3><p style="color:#666;margin:0 0 1rem;">' + error.message + '</p><button onclick="location.reload()" style="padding:0.5rem 1rem;background:#0f766e;color:#fff;border:none;border-radius:6px;cursor:pointer;">Recargar página</button>';
        document.body.appendChild(errorMsg);
      }
    });
  } catch (error) {
    console.error('Error loading data:', error);
    console.error('Error stack:', error.stack);
    hideLoadingIndicator();
    // El error ya se muestra en loadData()
  }
});

// ========== NUEVAS FUNCIONES MEJORADAS ==========

// Colores por temporada para el bubble plot
// Mejorar el scatter chart como bubble plot con color por temporada
function createImprovedBubblePlot() {
  const ctx = document.getElementById('scatter-chart'); if (!ctx) return;
  
  // Preparar datos: agrupar por deporte y temporada
  const bubbleData = [];
  const deporteMap = new Map();
  
  state.filteredData.porDeporte.forEach(d => {
    const key = d.deporte;
    if (!deporteMap.has(key)) {
      deporteMap.set(key, {
        deporte: d.deporte,
        temporadas: [],
        total: 0,
        femenino: 0,
        masculino: 0
      });
    }
    const entry = deporteMap.get(key);
    entry.temporadas.push({
      temporada: d.temporada,
      total: d.total,
      femenino: d.femenino,
      masculino: d.masculino
    });
    entry.total += d.total;
    entry.femenino += d.femenino;
    entry.masculino += d.masculino;
  });
  
  // Crear puntos para cada deporte (usar la temporada más reciente para el color)
  deporteMap.forEach((entry, deporte) => {
    const pctFem = entry.total > 0 ? (entry.femenino / entry.total) * 100 : 0;
    const latestSeason = entry.temporadas.sort((a, b) => {
      const aIdx = CONFIG.seasons.indexOf(a.temporada);
      const bIdx = CONFIG.seasons.indexOf(b.temporada);
      return bIdx - aIdx;
    })[0];
    
    // Aumentar el tamaño de las burbujas (multiplicar por 1.6 y aumentar el máximo)
    const baseRadius = Math.sqrt(entry.total / 1000);
    const radius = Math.max(8, Math.min(40, baseRadius * 1.6));
    
    bubbleData.push({
      x: pctFem,
      y: entry.total,
      r: radius,
      deporte: deporte,
      total: entry.total,
      porcentaje_femenino: pctFem,
      temporada: latestSeason.temporada,
      selected: state.filters.selectedDeporte === deporte
    });
  });
  
  // Ordenar por tamaño para identificar las burbujas más grandes
  const sortedBySize = [...bubbleData].sort((a, b) => b.r - a.r);
  const topBubbles = new Set(sortedBySize.slice(0, 10).map(b => b.deporte));
  
  if (state.charts.scatter) state.charts.scatter.destroy();
  
  const datasets = [{
    label: 'Deportes',
    data: bubbleData.map(d => ({
        x: d.x,
        y: d.y,
        r: d.r,
        raw: d
      })),
    backgroundColor: ctx => {
      const raw = getBubbleRaw(ctx);
      // Siempre usar el color basado en el % de participación femenino, sin importar si está seleccionado
      return getParityColor(raw.porcentaje_femenino || 0);
    },
    borderColor: ctx => (getBubbleRaw(ctx).selected ? '#0b3a36' : 'rgba(255,255,255,0.85)'),
    borderWidth: ctx => (getBubbleRaw(ctx).selected ? 3 : 1.5),
    pointRadius: ctx => ctx?.raw?.r || (ctx?.element?.opts?.radius ?? 10),
    pointHoverRadius: ctx => {
      const base = ctx?.raw?.r || 10;
      return base + 2;
    }
  }];
  
  state.charts.scatter = new Chart(ctx, {
    type: 'scatter',
    data: { datasets: datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onHover: (e, activeElements) => {
        e.native.target.style.cursor = activeElements.length > 0 ? 'pointer' : 'default';
      },
      onClick: (e, activeElements) => {
        if (activeElements && activeElements.length > 0) {
          const element = activeElements[0];
          try {
            // Acceder a los datos usando el índice del elemento
            const index = element.index;
            
            if (index !== undefined && bubbleData && bubbleData[index]) {
              const pointData = bubbleData[index];
              if (pointData && pointData.deporte) {
                handleSelectedDeporteToggle(pointData.deporte);
              }
            }
          } catch (error) {
            console.error('Error al hacer clic en el mapa de paridad:', error);
          }
        }
      },
      interaction: {
        intersect: true,
        mode: 'point'
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          padding: 12,
          titleFont: { size: 15, weight: '700', family: 'inherit' },
          bodyFont: { size: 13, weight: '500', family: 'inherit' },
          callbacks: {
            title: () => '',
            label: ctx => {
              const d = ctx.raw.raw;
              return [
                `Deporte: ${d.deporte}`,
                `Total: ${formatNumberES(d.total)} participaciones`,
                `% femenino: ${formatPercentES(d.porcentaje_femenino, 1)}`
              ];
            }
          }
        },
        datalabels: {
          display: true, // Mostrar etiquetas en todas las burbujas
          color: getChartColors().textMuted || 'rgba(14, 28, 26, 0.5)', // Mismo color que las etiquetas de los ejes
          align: 'center',
          anchor: 'center',
          font: {
            size: 10, // Mismo tamaño que las etiquetas de los ejes
            weight: '400', // Mismo peso que las etiquetas de los ejes
            family: 'inherit' // Misma familia que las etiquetas de los ejes
          },
          formatter: (value, context) => {
            // Para gráficos scatter, el contexto puede tener diferentes estructuras
            let raw = null;
            if (context && context.raw) {
              raw = context.raw.raw || context.raw;
            } else if (context && context.dataset && context.dataIndex !== undefined) {
              const dataPoint = context.dataset.data[context.dataIndex];
              raw = dataPoint.raw || dataPoint;
            }
            const name = (raw && raw.deporte) ? raw.deporte : '';
            return name; // Mostrar el nombre completo del deporte
          },
          clip: false,
          listeners: false // No interferir con los clics
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: '% participación femenina',
            font: { size: 11, weight: '500', family: 'inherit' },
            color: getChartColors().axis || 'rgba(14, 28, 26, 0.6)',
            padding: { top: 10, bottom: 5 }
          },
          min: 0,
          max: 100,
          ticks: {
            display: true,
            font: { size: 10, weight: '400', family: 'inherit' },
            color: getChartColors().textMuted || 'rgba(14, 28, 26, 0.5)',
            stepSize: 20,
            callback: function(value) {
              return value + '%';
            }
          },
          grid: { color: getChartColors().grid || CONFIG.colors.grid, drawBorder: false }
        },
        y: {
          title: {
            display: true,
            text: 'Participantes totales',
            font: { size: 11, weight: '500', family: 'inherit' },
            color: getChartColors().axis || 'rgba(14, 28, 26, 0.6)',
            padding: { top: 5, bottom: 10 }
          },
          beginAtZero: true,
          ticks: {
            display: true,
            font: { size: 10, weight: '400', family: 'inherit' },
            color: getChartColors().textMuted || 'rgba(14, 28, 26, 0.5)',
            callback: function(value) {
              if (value >= 1000) {
                return formatDecimalES(value / 1000, value % 1000 === 0 ? 0 : 1) + 'k';
              }
              return value;
            }
          },
          grid: { color: getChartColors().grid || CONFIG.colors.grid, drawBorder: false }
        }
      }
    },
    plugins: [{
      id: 'parity',
      beforeDatasetsDraw: chart => {
        const { ctx, scales } = chart;
        ctx.save();
        ctx.fillStyle = getChartColors().parityZone || CONFIG.colors.parityZone;
        const xs = CONFIG.parityRange.min, xe = CONFIG.parityRange.max;
        ctx.fillRect(
          scales.x.getPixelForValue(xs),
          scales.y.getPixelForValue(scales.y.max),
          scales.x.getPixelForValue(xe) - scales.x.getPixelForValue(xs),
          scales.y.getPixelForValue(0) - scales.y.getPixelForValue(scales.y.max)
        );
        ctx.restore();
      }
    }]
  });
}

// Crear visualización "¿Cuándo se abre la brecha?"
function createGapTimelineChart() {
  const ctx = document.getElementById('gap-timeline-chart'); if (!ctx) return;
  
  const series = getTemporalSeries({ ignoreTemporada: true });
  const labels = series.map(s => formatTemporada(s.temporada));
  const femData = series.map(s => s.total > 0 ? (s.femenino / s.total) * 100 : 0);
  const masData = series.map(s => s.total > 0 ? (s.masculino / s.total) * 100 : 0);
  
  // Calcular min y max dinámicos para ajustar la escala
  const allData = [...femData, ...masData];
  const dataMin = Math.min(...allData);
  const dataMax = Math.max(...allData);
  const range = dataMax - dataMin;
  const padding = range * 0.1; // 10% de padding arriba y abajo
  const yMin = Math.max(0, dataMin - padding);
  const yMax = Math.min(100, dataMax + padding);
  
  // Encontrar pico y valle de la brecha
  const gaps = series.map(s => {
    const pctFem = s.total > 0 ? (s.femenino / s.total) * 100 : 0;
    const pctMas = s.total > 0 ? (s.masculino / s.total) * 100 : 0;
    return Math.abs(pctFem - pctMas);
  });
  const maxGapIdx = gaps.indexOf(Math.max(...gaps));
  
  if (state.charts.gapTimeline) state.charts.gapTimeline.destroy();
  
  const inlineLabels = {
    id: 'gapInlineLabels',
    afterDatasetsDraw: chart => {
      const { ctx, chartArea } = chart;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.fillStyle = getChartColors().femenino || CONFIG.colors.femenino; // Mismo color que la línea de participación total
      
      // Etiquetas de brecha anual en cada temporada
      const femMeta = chart.getDatasetMeta(0);
      const masMeta = chart.getDatasetMeta(1);
      if (femMeta && femMeta.data.length && masMeta && masMeta.data.length) {
        femMeta.data.forEach((femPoint, index) => {
          const masPoint = masMeta.data[index];
          if (femPoint && masPoint && !isNaN(femPoint.y) && !isNaN(masPoint.y)) {
            const femY = femPoint.y;
            const masY = masPoint.y;
            
            // Calcular distancia entre las líneas
            const distance = Math.abs(femY - masY);
            const minDistance = 28; // Distancia mínima para colocar etiqueta en el medio
            const labelHeight = 12; // Altura aproximada del texto
            const padding = 5;
            
            // Aplicar negrita si es la temporada con mayor brecha
            const isMaxGap = index === maxGapIdx;
            ctx.font = isMaxGap ? '700 12px "Space Grotesk", sans-serif' : '600 11px "Space Grotesk", sans-serif';
            
            const labelText = formatPercentES(gaps[index], 1);
            const textWidth = ctx.measureText(labelText).width;
            
            let labelY;
            let textBaseline;
            
            if (distance < minDistance) {
              // Si las líneas están muy juntas, colocar la etiqueta arriba de la línea superior
              const topLine = Math.min(femY, masY);
              labelY = topLine - labelHeight - padding;
              textBaseline = 'bottom';
              
              // Verificar si se sale por arriba
              if (labelY - labelHeight < chartArea.top) {
                // Colocar abajo de la línea inferior
                const bottomLine = Math.max(femY, masY);
                labelY = bottomLine + labelHeight + padding;
                textBaseline = 'top';
              }
            } else {
              // Si hay suficiente espacio, colocar en el medio
              labelY = (femY + masY) / 2;
              textBaseline = 'middle';
            }
            
            // Verificar límites verticales finales
            if (textBaseline === 'middle') {
              if (labelY - labelHeight / 2 < chartArea.top) {
                labelY = chartArea.top + labelHeight / 2 + padding;
              }
              if (labelY + labelHeight / 2 > chartArea.bottom) {
                labelY = chartArea.bottom - labelHeight / 2 - padding;
              }
            } else if (textBaseline === 'bottom') {
              if (labelY < chartArea.top) {
                labelY = chartArea.top + padding;
              }
            } else if (textBaseline === 'top') {
              if (labelY > chartArea.bottom) {
                labelY = chartArea.bottom - padding;
              }
            }
            
            // Verificar límites horizontales
            let labelX = femPoint.x;
            if (labelX - textWidth / 2 < chartArea.left) {
              labelX = chartArea.left + textWidth / 2 + padding;
            }
            if (labelX + textWidth / 2 > chartArea.right) {
              labelX = chartArea.right - textWidth / 2 - padding;
            }
            
            ctx.textBaseline = textBaseline;
            ctx.fillText(labelText, labelX, labelY);
          }
        });
      }
      ctx.restore();
    }
  };

  const gapAnnotation = {
    id: 'gapAnnotation',
    afterDatasetsDraw: chart => {
      const { ctx, scales } = chart;
      if (maxGapIdx < 0) return;
      ctx.save();
      const x = scales.x.getPixelForValue(maxGapIdx);
      const y = scales.y.getPixelForValue(femData[maxGapIdx]);
      ctx.fillStyle = 'rgba(255,138,61,0.85)';
      ctx.strokeStyle = 'rgba(11,58,54,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  };

  const parityShade = {
    id: 'gapParity',
    beforeDatasetsDraw: chart => {
      const { ctx, chartArea, scales } = chart;
      const { left, right } = chartArea;
      // Solo dibujar la zona de paridad si está dentro del rango visible
      const parityMin = Math.max(yMin, CONFIG.parityRange.min);
      const parityMax = Math.min(yMax, CONFIG.parityRange.max);
      if (parityMin < parityMax) {
      ctx.save();
      ctx.fillStyle = 'rgba(15,118,110,0.06)';
        const top = scales.y.getPixelForValue(parityMax);
        const bottom = scales.y.getPixelForValue(parityMin);
      ctx.fillRect(left, top, right - left, bottom - top);
      ctx.restore();
      }
    }
  };

  state.charts.gapTimeline = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: '% Femenino',
          data: femData,
          borderColor: CONFIG.colors.femenino,
          backgroundColor: 'rgba(255,138,61,0.15)', // Color naranja para la brecha
          fill: '+1', // Rellenar hasta la siguiente línea (masculina)
          borderWidth: 3,
          tension: 0.4,
          pointRadius: ctx => ctx.dataIndex === maxGapIdx ? 4 : 3,
          pointHoverRadius: 6
        },
        {
          label: '% Masculino',
          data: masData,
          borderColor: '#9fb3ad',
          backgroundColor: 'transparent',
          fill: false,
          borderWidth: 2,
          tension: 0.4,
          pointRadius: 3,
          pointHoverRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { top: 8, right: 8, left: 0, bottom: 0 } },
      onClick: (e, activeElements, chart) => {
        if (activeElements && activeElements.length > 0) {
          const element = activeElements[0];
          try {
            const index = element.index;
            if (index !== undefined && series && series[index]) {
              const clickedTemporada = series[index].temporada;
              handleTemporadaToggle(clickedTemporada);
            }
          } catch (error) {
            console.error('Error al hacer clic en el gráfico de brecha:', error);
          }
        }
      },
      onHover: (e, activeElements) => {
        e.native.target.style.cursor = activeElements.length > 0 ? 'pointer' : 'default';
      },
      plugins: {
        legend: { display: false },
        datalabels: { display: false },
        tooltip: {
          backgroundColor: document.body.classList.contains('dark') ? 'rgba(5, 15, 13, 0.95)' : 'rgba(8,15,13,0.9)',
          padding: 12,
          titleFont: { size: 14, weight: '600', family: 'inherit' },
          bodyFont: { size: 13, weight: '500', family: 'inherit' },
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${formatPercentES(ctx.parsed.y, 1)}`
          }
        }
      },
      scales: {
        y: {
          min: yMin,
          max: yMax,
          ticks: {
            display: false
          },
          grid: { color: getChartColors().grid || 'rgba(15,118,110,0.08)', drawBorder: false }
        },
        x: {
          ticks: {
            font: { size: 12, family: 'inherit' },
            color: '#51635e'
          },
          grid: { display: false }
        }
      }
    },
    plugins: [gapAnnotation, parityShade, inlineLabels]
  });

  // Actualizar texto del insight con más contexto
  const insightEl = document.getElementById('gap-timeline-text');
  if (insightEl && maxGapIdx >= 0) {
    const maxGap = gaps[maxGapIdx];
    const minGap = Math.min(...gaps);
    const minGapIdx = gaps.indexOf(minGap);
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    
    // Calcular tendencia
    const recentGaps = gaps.slice(-3);
    const olderGaps = gaps.slice(0, 3);
    const recentAvg = recentGaps.reduce((a, b) => a + b, 0) / recentGaps.length;
    const olderAvg = olderGaps.reduce((a, b) => a + b, 0) / olderGaps.length;
    const trend = recentAvg > olderAvg ? 'aumentando' : recentAvg < olderAvg ? 'disminuyendo' : 'estable';
    
    // Calcular porcentajes de participación
    const maxGapFemPct = formatPercentES(femData[maxGapIdx], 1);
    const maxGapMasPct = formatPercentES(masData[maxGapIdx], 1);
    
    let insightText = `La brecha de género alcanzó su máximo en ${labels[maxGapIdx]} con ${formatDecimalES(maxGap, 1)} puntos porcentuales (${maxGapFemPct} femenino vs ${maxGapMasPct} masculino). `;
    insightText += `En promedio, la brecha ha sido de ${formatDecimalES(avgGap, 1)} puntos porcentuales durante el período analizado. `;
    
    if (trend === 'disminuyendo') {
      insightText += `La tendencia reciente muestra una reducción de la brecha, lo que sugiere un avance hacia una mayor paridad.`;
    } else if (trend === 'aumentando') {
      insightText += `La tendencia reciente muestra un aumento de la brecha, lo que indica la necesidad de reforzar las políticas de igualdad.`;
    } else {
      insightText += `La brecha se mantiene relativamente estable en los últimos años.`;
    }
    
    insightEl.textContent = insightText;
  }

  // Actualizar tabla de datos
  updateGapTimelineTable(series, labels);
}

// Función para actualizar la tabla de datos del gap timeline
function updateGapTimelineTable(series, labels) {
  const thead = document.getElementById('gap-timeline-table-head');
  const tbody = document.getElementById('gap-timeline-table-body');
  if (!thead || !tbody) return;

  // Limpiar contenido previo - no mostrar headers
  thead.innerHTML = '';
  tbody.innerHTML = '';

  // Crear fila de Femenino con símbolo ♀
  const femRow = document.createElement('tr');
  femRow.innerHTML = '<td>♀</td>';
  series.forEach(s => {
    const td = document.createElement('td');
    td.textContent = formatNumberES(s.femenino);
    femRow.appendChild(td);
  });
  tbody.appendChild(femRow);

  // Crear fila de Masculino con símbolo ♂
  const masRow = document.createElement('tr');
  masRow.innerHTML = '<td>♂</td>';
  series.forEach(s => {
    const td = document.createElement('td');
    td.textContent = formatNumberES(s.masculino);
    masRow.appendChild(td);
  });
  tbody.appendChild(masRow);
}

// Mejorar observación dinámica con frases automáticas
function updateImprovedInsight() {
  const conc = document.getElementById('conclusion-text');
  if (!conc) return;
  
  const data = state.filteredData.deportes;
  if (!data || data.length === 0) {
    conc.textContent = 'Ajusta los filtros para generar una observación personalizada.';
    return;
  }
  
  // Verificar si hay filtros activos
  const hasDeporteFilter = state.filters.selectedDeporte;
  const hasTemporadaFilter = state.filters.temporada && state.filters.temporada !== 'todas';
  const hasGeneroFilter = state.filters.genero && state.filters.genero !== 'todos';
  const hasCategoriaFilter = state.filters.categoriaDeportes && state.filters.categoriaDeportes !== 'todas';
  const hasCategoriaOfertaFilter = state.filters.categoriaOferta;
  
  let frase = '';
  
  if (hasDeporteFilter && data.length === 1) {
    // Cuando se filtra por UN SOLO deporte: análisis específico y contextual
    const selected = data[0];
    
    // Análisis de la brecha de género
    const brecha = Math.abs(selected.porcentaje_femenino - (100 - selected.porcentaje_femenino));
    const pctFem = selected.porcentaje_femenino;
    const pctMas = 100 - pctFem;
    
    // Analizar evolución temporal si hay datos
    const porDeporteData = state.filteredData.porDeporte || state.allData.porDeporte || [];
    const deporteTemporal = porDeporteData.filter(d => 
      cleanDeporteName(d.deporte) === selected.deporte
    );
    
    // Incluir contexto de temporada si está filtrada
    const temporadaContexto = hasTemporadaFilter ? ` en ${formatTemporada(state.filters.temporada)}` : '';
    frase = `${selected.deporte} tiene ${formatPercentES(pctFem, 1)} de participación femenina${temporadaContexto} (${formatNumberES(selected.femenino)} de ${formatNumberES(selected.total)} participantes). `;
    
    if (deporteTemporal.length > 1) {
      // Hay datos temporales: analizar evolución
      const sortedTemporal = deporteTemporal.sort((a, b) => {
        const tempA = a.temporada || '';
        const tempB = b.temporada || '';
        return tempA.localeCompare(tempB);
      });
      const primera = sortedTemporal[0];
      const ultima = sortedTemporal[sortedTemporal.length - 1];
      const pctFemPrimera = primera.total > 0 ? (primera.femenino / primera.total) * 100 : 0;
      const pctFemUltima = ultima.total > 0 ? (ultima.femenino / ultima.total) * 100 : 0;
      const cambio = pctFemUltima - pctFemPrimera;
      
      if (Math.abs(cambio) > 2) {
        const tendencia = cambio > 0 ? 'aumentado' : 'disminuido';
        const tempPrimera = primera.temporada || 'inicio';
        const tempUltima = ultima.temporada || 'actual';
        frase += `La participación femenina ha ${tendencia} ${formatDecimalES(Math.abs(cambio), 1)} puntos porcentuales desde ${tempPrimera} hasta ${tempUltima}. `;
      }
    }
    
    // Análisis general de la brecha (sin detalles numéricos, ya que se muestran en "¿Cuándo se abre la brecha?")
    // Eliminar frases redundantes que no aportan valor y ser más preciso con casos cercanos a la paridad
    if (pctFem < 30) {
      frase += `Presenta una brecha significativa de género.`;
    } else if (pctFem >= 40 && pctFem <= 60) {
      // Rango ampliado para casos cercanos a la paridad (40-60%)
      if (pctFem >= 45 && pctFem <= 55) {
        frase += `Muestra una distribución equilibrada entre géneros, muy cercana a la paridad ideal (45-55%).`;
      } else {
        frase += `Prácticamente consigue la paridad de género.`;
      }
    } else if (pctFem > 60) {
      // No añadir frase redundante - el porcentaje ya lo indica
    } else {
      // Solo para casos entre 30-40%, donde hay una brecha más notable
      frase += `Presenta una brecha de género.`;
    }
    
    // Información sobre categorías si hay filtro de categoría de oferta
    if (hasCategoriaOfertaFilter && state.filteredData.ofertaCompeticion && state.filteredData.ofertaCompeticion.categories) {
      const ofertaCategoria = state.filteredData.ofertaCompeticion.categories.find(
        o => o.categoria === state.filters.categoriaOferta
      );
      if (ofertaCategoria && ofertaCategoria.total > 0) {
        frase += ` En la categoría ${state.filters.categoriaOferta}, hay ${ofertaCategoria.total} actividades de competición disponibles.`;
      }
    }
    
  } else if (hasDeporteFilter && data.length > 1) {
    // Múltiples deportes pero con filtro: mostrar comparación entre los visibles
    const selected = data.find(d => d.deporte === state.filters.selectedDeporte);
    if (selected) {
      const otros = data.filter(d => d.deporte !== selected.deporte);
      if (otros.length > 0) {
        const avgOtros = otros.reduce((sum, d) => sum + d.porcentaje_femenino, 0) / otros.length;
        const diff = selected.porcentaje_femenino - avgOtros;
        const comparison = diff > 5 ? 'mayor' : diff < -5 ? 'menor' : 'similar';
        
        frase = `${selected.deporte} tiene ${formatPercentES(selected.porcentaje_femenino, 1)} de participación femenina, ${comparison} que el promedio de los otros deportes visibles (${formatPercentES(avgOtros, 1)}). `;
        frase += `Total: ${formatNumberES(selected.total)} participantes.`;
      }
    }
  } else {
    // Sin filtro de deporte o múltiples deportes visibles: mostrar información comparativa
    if (data.length === 1) {
      // Solo un deporte visible (por otros filtros)
      const deporte = data[0];
      const temporadaContexto = hasTemporadaFilter ? ` en ${formatTemporada(state.filters.temporada)}` : '';
      frase = `${deporte.deporte} tiene ${formatPercentES(deporte.porcentaje_femenino, 1)} de participación femenina${temporadaContexto} (${formatNumberES(deporte.femenino)} de ${formatNumberES(deporte.total)} participantes). `;
      
      const brecha = Math.abs(deporte.porcentaje_femenino - (100 - deporte.porcentaje_femenino));
      const pctFem = deporte.porcentaje_femenino;
      
      if (brecha > 20) {
        frase += `Presenta una brecha de género significativa de ${formatDecimalES(brecha, 1)} puntos porcentuales.`;
      } else if (pctFem >= 40 && pctFem <= 60) {
        // Rango ampliado para casos cercanos a la paridad (40-60%)
        if (pctFem >= 45 && pctFem <= 55) {
          frase += `Muestra una distribución equilibrada, cercana a la paridad.`;
        } else {
          frase += `Prácticamente consigue la paridad de género.`;
        }
      }
    } else {
      // Múltiples deportes: comparación útil
      // Filtrar solo deportes con datos válidos (total > 0)
      const validData = data.filter(d => d.total > 0);
      
      if (validData.length === 0) {
        conc.textContent = 'No hay datos de participación disponibles con los filtros seleccionados.';
        return;
      }
      
      const masParticipativo = validData.sort((a, b) => b.total - a.total)[0];
      const masIgualitario = validData.reduce((best, current) => {
    const bestDiff = Math.abs(best.porcentaje_femenino - 50);
    const currentDiff = Math.abs(current.porcentaje_femenino - 50);
    return currentDiff < bestDiff ? current : best;
      }, validData[0]);
      
      // Calcular la brecha real para cada deporte y encontrar el que tiene la mayor brecha
      // La brecha es la diferencia absoluta entre participación masculina y femenina
      const maxGap = validData.reduce((max, current) => {
        const currentGap = Math.abs(current.porcentaje_femenino - (100 - current.porcentaje_femenino));
        const maxGapValue = Math.abs(max.porcentaje_femenino - (100 - max.porcentaje_femenino));
        return currentGap > maxGapValue ? current : max;
      }, validData[0]);
      
      // Calcular promedio solo con deportes válidos
      const avgFemPct = validData.reduce((sum, d) => sum + d.porcentaje_femenino, 0) / validData.length;
      
      frase = `${masParticipativo.deporte} lidera en participación (${formatNumberES(masParticipativo.total)}). `;
      
      if (masIgualitario.deporte !== maxGap.deporte) {
        frase += `${masIgualitario.deporte} es el más igualitario (${formatPercentES(masIgualitario.porcentaje_femenino, 1)} femenino). `;
      }
      
      // Calcular la brecha real (diferencia entre participación masculina y femenina)
      const brecha = Math.abs(maxGap.porcentaje_femenino - (100 - maxGap.porcentaje_femenino));
      const pctMas = 100 - maxGap.porcentaje_femenino;
      
      if (hasTemporadaFilter) {
        // Cuando se filtra por temporada, no mencionar el promedio (ya está en el KPI)
        const temporadaTexto = formatTemporada(state.filters.temporada) || 'la temporada seleccionada';
        frase += `En ${temporadaTexto}, ${maxGap.deporte} presenta la mayor brecha de género (${formatDecimalES(brecha, 1)} puntos porcentuales).`;
      } else if (hasGeneroFilter || hasCategoriaFilter) {
        // Cuando se filtra por género o categoría, no mencionar el promedio si no aporta valor adicional
        frase += `${maxGap.deporte} presenta la mayor brecha de género (${formatDecimalES(brecha, 1)} puntos porcentuales).`;
  } else {
        // Sin filtros específicos: mostrar información completa
        frase += `${maxGap.deporte} tiene la mayor brecha de género: ${formatDecimalES(brecha, 1)} puntos porcentuales (${formatPercentES(maxGap.porcentaje_femenino, 1)} femenino vs ${formatPercentES(pctMas, 1)} masculino).`;
      }
    }
  }
  
  conc.textContent = frase;
}

// Mejorar carrera con animación real
function createImprovedRaceChart() {
  const ctx = document.getElementById('race-chart'); if (!ctx) return;
  if (state.charts.race) state.charts.race.destroy();
  
  state.charts.race = new Chart(ctx, {
    type: 'bar',
    data: { labels: [], datasets: [{ label: '', data: [], backgroundColor: [] }] },
    options: {
      indexAxis: 'y',
      animation: {
        duration: 800,
        easing: 'easeInOutQuart'
      },
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          padding: 12,
          titleFont: { size: 14, weight: '600', family: 'inherit' },
          bodyFont: { size: 13, weight: '500', family: 'inherit' },
          callbacks: {
            title: (items) => items[0].label,
            label: ctx => `${formatNumberES(ctx.parsed.x)} participaciones`
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: {
            font: { size: 12, family: 'inherit' },
            color: getChartColors().textMuted || '#51635e',
            callback: v => formatNumberES(v)
          },
          grid: { color: getChartColors().grid || CONFIG.colors.grid, drawBorder: false }
        },
        y: {
          ticks: {
            font: { size: 12, weight: '500', family: 'inherit' },
            color: '#0e1c1a'
          },
          grid: { display: false }
        }
      }
    }
  });
  
  updateImprovedRaceFrame();
}

function updateImprovedRaceFrame() {
  const season = CONFIG.seasons[state.filters.raceIndex];
  const mode = state.filters.raceMode;
  // Usar state.filteredData.porDeporte para que respete el filtro de outliers
  const dataSource = state.filteredData.porDeporte || state.allData.porDeporte || [];
  const rows = dataSource.filter(r => r.temporada === season);
  const data = rows.map(r => {
    const valor = mode === 'total' ? r.total : mode === 'femenino' ? r.femenino : r.masculino;
    const pctFem = r.total > 0 ? (r.femenino / r.total) * 100 : 0;
    const gap = Math.abs(pctFem - (100 - pctFem));
    return {
      deporte: r.deporte,
      valor: valor,
      gap: gap
    };
  })
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 10);
  
  const chart = state.charts.race;
  if (!chart) return;
  
  chart.data.labels = data.map(d => d.deporte.length > 16 ? d.deporte.slice(0, 14) + '…' : d.deporte);
  chart.data.datasets[0].data = data.map(d => d.valor);
  chart.data.datasets[0].backgroundColor = data.map(d => {
    if (d.gap < 10) return CONFIG.colors.femenino;
    if (d.gap < 20) return 'rgba(15,118,110,0.7)';
    return CONFIG.colors.masculino;
  });
  
  chart.update('active');
  
  document.getElementById('race-slider').value = state.filters.raceIndex;
  const yearEl = document.getElementById('race-year');
  if (yearEl) yearEl.textContent = formatTemporada(season);
}

// Modo historia
let storyModeActive = false;
function startStoryMode() {
  if (storyModeActive) return;
  storyModeActive = true;
  const btn = document.getElementById('story-mode-btn');
  if (btn) btn.textContent = '⏸ Pausar historia';
  
  const panel = document.getElementById('story-panel');
  if (panel) {
    panel.innerHTML = '<p style="color:var(--brand); text-align:center; font-weight:600;">Reproduciendo historia 2018→2024...</p>';
  }
  
  let seasonIdx = 0;
  const storyInterval = setInterval(() => {
    if (!storyModeActive) {
      clearInterval(storyInterval);
      return;
    }
    
    state.filters.raceIndex = seasonIdx;
    updateImprovedRaceFrame();
    createGapTimelineChart();
    createImprovedBubblePlot();
    
    seasonIdx++;
    if (seasonIdx >= CONFIG.seasons.length) {
      seasonIdx = 0;
    }
  }, 1500);
  
  state.storyInterval = storyInterval;
}

function stopStoryMode() {
  storyModeActive = false;
  if (state.storyInterval) {
    clearInterval(state.storyInterval);
    state.storyInterval = null;
  }
  const btn = document.getElementById('story-mode-btn');
  if (btn) btn.textContent = '▶ Ver historia 2018→2024';
  const panel = document.getElementById('story-panel');
  if (panel) {
    panel.innerHTML = '<p style="color:var(--muted); text-align:center;">Haz clic en el botón para iniciar la animación</p>';
  }
}

// Setup de tabs para Motivaciones/Barreras
function setupMotivacionesTabs() {
  const tabMotivaciones = document.getElementById('tab-motivaciones');
  const tabBarreras = document.getElementById('tab-barreras');
  const panelMotivaciones = document.getElementById('motivaciones-panel');
  const panelBarreras = document.getElementById('barreras-panel');
  
  if (tabMotivaciones && tabBarreras) {
    tabMotivaciones.addEventListener('click', () => {
      tabMotivaciones.classList.add('active');
      tabBarreras.classList.remove('active');
      if (panelMotivaciones) panelMotivaciones.style.display = 'block';
      if (panelBarreras) panelBarreras.style.display = 'none';
    });
    
    tabBarreras.addEventListener('click', () => {
      tabBarreras.classList.add('active');
      tabMotivaciones.classList.remove('active');
      if (panelMotivaciones) panelMotivaciones.style.display = 'none';
      if (panelBarreras) panelBarreras.style.display = 'block';
      // Crear gráfico de barreras si no existe
      if (!state.charts.barreras) {
        createBarrerasChart();
      }
    });
  }
}

// Crear gráfico de barreras (placeholder - necesita datos reales de encuesta)
function createBarrerasChart() {
  const ctx = document.getElementById('barreras-chart');
  if (!ctx) return;
  
  // TODO: Cargar datos reales de habitos-deportivos-escolares-2022-2023.csv
  // Por ahora, datos de ejemplo
  const data = {
    labels: ['Falta tiempo', 'Falta interés', 'Coste económico', 'Falta instalaciones', 'Presión social'],
    datasets: [
      {
        label: 'Niñas',
        data: [45, 30, 25, 20, 15],
        backgroundColor: CONFIG.colors.femenino
      },
      {
        label: 'Niños',
        data: [35, 25, 20, 15, 10],
        backgroundColor: CONFIG.colors.masculino
      }
    ]
  };
  
  if (state.charts.barreras) state.charts.barreras.destroy();
  
  state.charts.barreras = new Chart(ctx, {
    type: 'bar',
    data: data,
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            font: { size: 12, family: 'inherit' },
            padding: 12
          }
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          padding: 12
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: {
            font: { size: 12, family: 'inherit' },
            color: '#51635e'
          },
          grid: { color: CONFIG.colors.grid }
        },
        y: {
          ticks: {
            font: { size: 12, family: 'inherit' },
            color: '#51635e'
          },
          grid: { display: false }
        }
      }
    }
  });
}

// Crear visualización de oferta 2024-25
function createOfertaChart() {
  const ctx = document.getElementById('oferta-chart');
  if (!ctx) return;
  
  // TODO: Cargar datos reales de actividades-competicion-2024-2025.csv y actividades-iniciacion-recreativas-2024-2025.csv
  // Por ahora, datos de ejemplo
  const deportes = ['Fútbol', 'Baloncesto', 'Natación', 'Atletismo', 'Voleibol'];
  const tipos = ['Iniciación', 'Competición'];
  
  const data = {
    labels: deportes,
    datasets: tipos.map((tipo, idx) => ({
      label: tipo,
      data: deportes.map(() => Math.floor(Math.random() * 50) + 10),
      backgroundColor: idx === 0 ? CONFIG.colors.femenino : CONFIG.colors.masculino
    }))
  };
  
  if (state.charts.oferta) state.charts.oferta.destroy();
  
  state.charts.oferta = new Chart(ctx, {
    type: 'bar',
    data: data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top'
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            font: { size: 12, family: 'inherit' },
            color: '#51635e'
          },
          grid: { color: CONFIG.colors.grid }
        },
        x: {
          ticks: {
            font: { size: 12, family: 'inherit' },
            color: '#51635e'
          },
          grid: { display: false }
        }
      }
    }
  });
  
  // Crear treemap de oferta
  createOfertaTreemap();
}

function createOfertaTreemap() {
  const svg = document.getElementById('oferta-treemap');
  if (!svg) return;
  
  // TODO: Usar datos reales
  const data = [
    { tipo: 'Iniciación', total: 150 },
    { tipo: 'Competición', total: 100 }
  ];
  
  const container = svg.parentElement;
  const w = container ? container.clientWidth : 300;
  const h = container ? container.clientHeight : 200;
  const pad = 4;
  
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.innerHTML = '';
  
  if (!data.length) return;
  
  const rects = squarifiedTreemap(data, w - pad * 2, h - pad * 2, d => d.total)
    .map(r => ({ ...r, x: r.x + pad, y: r.y + pad }));
  
  rects.forEach((r, i) => {
    const d = data[i];
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', r.x);
    rect.setAttribute('y', r.y);
    rect.setAttribute('width', r.width);
    rect.setAttribute('height', r.height);
    rect.setAttribute('fill', i === 0 ? CONFIG.colors.femenino : CONFIG.colors.masculino);
    rect.setAttribute('stroke', '#fff');
    rect.setAttribute('stroke-width', '2');
    g.appendChild(rect);
    
    if (r.width > 60 && r.height > 30) {
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('x', r.x + r.width / 2);
      t.setAttribute('y', r.y + r.height / 2);
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('fill', '#fff');
      t.setAttribute('font-size', '12');
      t.setAttribute('font-weight', '700');
      t.textContent = d.tipo;
      g.appendChild(t);
    }
    svg.appendChild(g);
  });
}

// Las nuevas funciones ya se llaman desde refresh() original

// Setup inicial mejorado - se ejecuta después del DOMContentLoaded principal
setTimeout(() => {
  // Setup tabs
  setupMotivacionesTabs();
  
  // Setup story mode button
  const storyBtn = document.getElementById('story-mode-btn');
  if (storyBtn) {
    storyBtn.addEventListener('click', () => {
      if (storyModeActive) {
        stopStoryMode();
      } else {
        startStoryMode();
      }
    });
  }
}, 500);
