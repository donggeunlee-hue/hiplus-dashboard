import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart
} from 'recharts';
import {
  TrendingUp,
  DollarSign,
  Activity,
  Percent,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Calendar,
  Sparkles,
  Sliders,
  ChevronDown,
  Layers,
  ArrowRight,
  Search,
  Settings,
  User,
  ShieldCheck,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

const SHEET_BASE_ID = '2PACX-1vRi3tgMmO3tVdjTRUtZ2hMJbUAEOQMIZpM6sAyaaq2Lbx33DuSbUl0R_7orLeHLKDJEIHYky91mvEVH';

const DEFAULT_GIDS = {
  actual_exclude: '0',
  actual_include: '457285505',
  plan_exclude: '',
  plan_include: ''
};

const DIVISIONS = [
  { id: 'all', name: '하이플러스' },
  { id: 'card', name: '카드사업' },
  { id: 'construction', name: '건설부문' },
  { id: 'donggang', name: '동강시스타' },
  { id: 'apple', name: '애플밸리CC' }
];

const PERIOD_OPTIONS = [
  { id: 'all', label: '전체 (누적)' },
  { id: 'h1', label: '상반기 (1~6월)' },
  { id: 'h2', label: '하반기 (7~12월)' },
  { id: 'q1', label: '1분기 (1~3월)' },
  { id: 'q2', label: '2분기 (4~6월)' },
  { id: 'q3', label: '3분기 (7~9월)' },
  { id: 'q4', label: '4분기 (10~12월)' },
  ...Array.from({ length: 12 }, (_, i) => ({
    id: `m${i + 1}`,
    label: `${i + 1}월`
  }))
];

const METRIC_CONFIG = {
  revenue: {
    label: '매출액',
    color: '#05CD99',
    subColor: '#D1FAE5',
    icon: DollarSign,
    format: (v) => `${Number(v || 0).toFixed(1)}억`
  },
  operatingProfit: {
    label: '영업이익',
    color: '#3B82F6',
    subColor: '#DBEAFE',
    icon: TrendingUp,
    format: (v) => `${Number(v || 0).toFixed(1)}억`
  },
  ebitda: {
    label: 'EBITDA',
    color: '#8B5CF6',
    subColor: '#EDE9FE',
    icon: Activity,
    format: (v) => `${Number(v || 0).toFixed(1)}억`
  },
  ordinaryProfit: {
    label: '경상이익',
    color: '#F43F5E',
    subColor: '#FFE4E6',
    icon: Percent,
    format: (v) => `${Number(v || 0).toFixed(1)}억`
  }
};

const parseCleanNumber = (val) => {
  if (val === null || val === undefined) return 0;
  let str = String(val).trim();
  if (!str || str === '-' || str === '.') return 0;

  const isAccountingNegative = /^\(.*\)$/.test(str) || /^△/.test(str);
  str = str.replace(/[(),△\s]/g, '');
  const num = parseFloat(str);
  if (isNaN(num)) return 0;
  return isAccountingNegative ? -Math.abs(num) : num;
};

const formatToBillion = (val) => {
  const num = parseCleanNumber(val);
  return num / 100000000;
};

const parseCSV = (text) => {
  const lines = [];
  let row = [];
  let inQuotes = false;
  let currentField = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(currentField);
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') i++;
      row.push(currentField);
      lines.push(row);
      row = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }
  if (currentField || row.length > 0) {
    row.push(currentField);
    lines.push(row);
  }
  return lines;
};

const normalizeDivision = (rawDept) => {
  if (!rawDept) return null;
  const clean = String(rawDept).replace(/\s+/g, '');
  if (clean.includes('카드')) return 'card';
  if (clean.includes('건설') || clean.includes('시행')) return 'construction';
  if (clean.includes('동강') || clean.includes('리조트')) return 'donggang';
  if (clean.includes('애플') || clean.includes('골프')) return 'apple';
  return null;
};

const getAccountType = (large, mid, small) => {
  const l = (large || '').trim();
  const m = (mid || '').trim();
  const s = (small || '').trim();
  const combined = `${l} ${m} ${s}`;

  if (/영업외/i.test(combined)) {
    if (/수익/i.test(combined)) return 'nonOpIncome';
    if (/비용|손실/i.test(combined)) return 'nonOpExpense';
    return null;
  }

  if (/원가|매출원가|도급원가|제조원가|총이익|이익률/i.test(combined)) {
    return null;
  }

  if (/감가상각비|무형자산상각비/i.test(combined)) {
    return 'depreciation';
  }

  if (/영업이익|영업손익/i.test(combined)) {
    return 'operatingProfit';
  }

  if (/영업수익|매출/i.test(combined) || (/수익/i.test(combined) && !/영업외/.test(combined))) {
    return 'revenue';
  }

  return null;
};

const structureDataset = (rawRows) => {
  if (!rawRows || rawRows.length < 3) return null;

  let headerIdx = -1;
  let maxHeaderScore = -1;

  for (let i = 0; i < Math.min(10, rawRows.length); i++) {
    let score = 0;
    const row = rawRows[i];
    if (!row) continue;

    row.forEach(cell => {
      const c = String(cell || '').trim();
      if (/코드명|대분류|중분류|소분류|계정과목/.test(c)) score += 5;
      if (/부서|사업부|구분|회사|본부/.test(c)) score += 3;
      if (/연도|년도|Year/i.test(c)) score += 3;
      if (/^0?([1-9]|1[0-2])월$/.test(c)) score += 2;
    });

    if (score > maxHeaderScore) {
      maxHeaderScore = score;
      headerIdx = i;
    }
  }

  if (headerIdx === -1) headerIdx = 0;
  const header = rawRows[headerIdx];
  const headerMap = {
    dept: -1,
    large: -1,
    mid: -1,
    small: -1,
    year: -1,
    months: {}
  };

  header.forEach((col, idx) => {
    const clean = (col || '').trim().replace(/\s+/g, '');
    if (/부서|사업부|구분|본부|회사/.test(clean) && headerMap.dept === -1) headerMap.dept = idx;
    if (/코드명\(대\)|대분류/.test(clean)) headerMap.large = idx;
    if (/코드명\(중\)|중분류/.test(clean)) headerMap.mid = idx;
    if (/코드명\(소\)|소분류/.test(clean)) headerMap.small = idx;
    if (/연도|년도|year/i.test(clean)) headerMap.year = idx;

    const mMatch = clean.match(/^0?([1-9]|1[0-2])월?$/);
    if (mMatch) {
      headerMap.months[parseInt(mMatch[1], 10)] = idx;
    }
  });

  if (headerMap.dept === -1) headerMap.dept = 0;
  if (headerMap.large === -1) headerMap.large = 2;
  if (headerMap.mid === -1) headerMap.mid = 3;
  if (headerMap.small === -1) headerMap.small = 4;
  if (headerMap.year === -1) headerMap.year = 17;

  for (let m = 1; m <= 12; m++) {
    if (headerMap.months[m] === undefined) {
      headerMap.months[m] = m + 4;
    }
  }

  const dataRows = [];
  let currentDept = '';
  const discoveredYears = new Set();
  let maxActualMonthFound = 1;

  for (let i = headerIdx + 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row || row.length < 5) continue;

    let rawDept = (row[headerMap.dept] || '').trim();
    if (!rawDept || /합계|소계|전사|공통/.test(rawDept)) {
      for (let c = 0; c <= Math.min(3, row.length - 1); c++) {
        const testVal = (row[c] || '').trim();
        if (normalizeDivision(testVal)) {
          rawDept = testVal;
          break;
        }
      }
    }

    if (rawDept && !/합계|소계|전사|공통/.test(rawDept)) {
      currentDept = rawDept;
    }

    let rowYear = null;
    if (headerMap.year !== -1 && row[headerMap.year]) {
      const ym = String(row[headerMap.year]).match(/(202\d)/);
      if (ym) rowYear = ym[1];
    }
    if (!rowYear) {
      for (let c = row.length - 1; c >= 0; c--) {
        const ym = String(row[c] || '').match(/^(202\d)$/);
        if (ym) {
          rowYear = ym[1];
          break;
        }
      }
    }

    if (rowYear) {
      discoveredYears.add(rowYear);
      const divKey = normalizeDivision(currentDept);
      if (divKey) {
        dataRows.push({
          division: divKey,
          deptRaw: currentDept,
          year: rowYear,
          large: row[headerMap.large] || '',
          mid: row[headerMap.mid] || '',
          small: row[headerMap.small] || '',
          row
        });

        if (rowYear === '2026') {
          for (let m = 1; m <= 12; m++) {
            const colIdx = headerMap.months[m];
            if (colIdx !== undefined && row[colIdx]) {
              const val = parseCleanNumber(row[colIdx]);
              if (val !== 0 && m > maxActualMonthFound) {
                maxActualMonthFound = m;
              }
            }
          }
        }
      }
    }
  }

  return {
    headerMap,
    dataRows,
    years: Array.from(discoveredYears).sort((a, b) => b.localeCompare(a)),
    maxActualMonthFound
  };
};

const calculateDivisionMetrics = (dataset, divisionKey, year, monthList) => {
  if (!dataset || !dataset.dataRows || monthList.length === 0) {
    return { revenue: 0, operatingProfit: 0, ebitda: 0, ordinaryProfit: 0, depreciation: 0 };
  }

  if (divisionKey === 'all') {
    const subDivs = ['card', 'construction', 'donggang', 'apple'];
    const metricsList = subDivs.map(k => calculateDivisionMetrics(dataset, k, year, monthList));
    return {
      revenue: metricsList.reduce((acc, m) => acc + m.revenue, 0),
      operatingProfit: metricsList.reduce((acc, m) => acc + m.operatingProfit, 0),
      ebitda: metricsList.reduce((acc, m) => acc + m.ebitda, 0),
      ordinaryProfit: metricsList.reduce((acc, m) => acc + m.ordinaryProfit, 0),
      depreciation: metricsList.reduce((acc, m) => acc + m.depreciation, 0),
    };
  }

  const { headerMap, dataRows } = dataset;
  const targetRows = dataRows.filter(r => r.division === divisionKey && r.year === String(year));
  if (targetRows.length === 0) {
    return { revenue: 0, operatingProfit: 0, ebitda: 0, ordinaryProfit: 0, depreciation: 0 };
  }

  const monthCols = monthList.map(m => headerMap.months[m]).filter(idx => idx !== undefined);

  const deptGroups = {};
  targetRows.forEach(item => {
    const deptName = item.deptRaw || divisionKey;
    if (!deptGroups[deptName]) deptGroups[deptName] = [];
    deptGroups[deptName].push(item);
  });

  let totalRevenue = 0;
  let totalOpProfit = 0;
  let totalDeprec = 0;
  let totalNonOpInc = 0;
  let totalNonOpExp = 0;

  Object.values(deptGroups).forEach(groupItems => {
    const categorized = {
      revenue: [],
      operatingProfit: [],
      depreciation: [],
      nonOpIncome: [],
      nonOpExpense: []
    };

    groupItems.forEach(item => {
      const type = getAccountType(item.large, item.mid, item.small);
      if (type && categorized[type]) {
        categorized[type].push(item);
      }
    });

    const revRows = categorized.revenue;
    if (revRows.length > 0) {
      const summaryRows = revRows.filter(r => {
        const combined = `${r.large} ${r.mid} ${r.small}`;
        return /소계|합계|총계|^I\.|^1\./.test(combined);
      });

      if (summaryRows.length > 0) {
        let bestRow = summaryRows[0];
        let bestSum = -1;
        summaryRows.forEach(r => {
          let s = 0;
          monthCols.forEach(cIdx => { s += Math.abs(formatToBillion(r.row[cIdx])); });
          if (s > bestSum) {
            bestSum = s;
            bestRow = r;
          }
        });
        monthCols.forEach(cIdx => {
          totalRevenue += formatToBillion(bestRow.row[cIdx]);
        });
      } else {
        revRows.forEach(r => {
          monthCols.forEach(cIdx => {
            totalRevenue += formatToBillion(r.row[cIdx]);
          });
        });
      }
    }

    const opRows = categorized.operatingProfit;
    if (opRows.length > 0) {
      let bestRow = opRows[0];
      let bestSum = -1;
      opRows.forEach(r => {
        let s = 0;
        monthCols.forEach(cIdx => { s += Math.abs(formatToBillion(r.row[cIdx])); });
        if (s > bestSum) {
          bestSum = s;
          bestRow = r;
        }
      });
      monthCols.forEach(cIdx => {
        totalOpProfit += formatToBillion(bestRow.row[cIdx]);
      });
    }

    categorized.depreciation.forEach(r => {
      monthCols.forEach(cIdx => {
        totalDeprec += formatToBillion(r.row[cIdx]);
      });
    });

    const nonOpIncRows = categorized.nonOpIncome;
    if (nonOpIncRows.length > 0) {
      const sumRow = nonOpIncRows.find(r => /소계|합계|총계/.test(`${r.large} ${r.mid} ${r.small}`));
      if (sumRow) {
        monthCols.forEach(cIdx => { totalNonOpInc += formatToBillion(sumRow.row[cIdx]); });
      } else {
        nonOpIncRows.forEach(r => {
          monthCols.forEach(cIdx => { totalNonOpInc += formatToBillion(r.row[cIdx]); });
        });
      }
    }

    const nonOpExpRows = categorized.nonOpExpense;
    if (nonOpExpRows.length > 0) {
      const sumRow = nonOpExpRows.find(r => /소계|합계|총계/.test(`${r.large} ${r.mid} ${r.small}`));
      if (sumRow) {
        monthCols.forEach(cIdx => { totalNonOpExp += formatToBillion(sumRow.row[cIdx]); });
      } else {
        nonOpExpRows.forEach(r => {
          monthCols.forEach(cIdx => { totalNonOpExp += formatToBillion(r.row[cIdx]); });
        });
      }
    }
  });

  const ebitda = totalOpProfit + totalDeprec;
  const ordinaryProfit = totalOpProfit + totalNonOpInc - totalNonOpExp;

  return {
    revenue: totalRevenue,
    operatingProfit: totalOpProfit,
    ebitda,
    ordinaryProfit,
    depreciation: totalDeprec
  };
};

export default function App() {
  const [costMode, setCostMode] = useState('exclude');
  const [includeForecast, setIncludeForecast] = useState(false);
  const [selectedDivision, setSelectedDivision] = useState('all');
  const [selectedYear, setSelectedYear] = useState('2026');
  const [selectedPeriod, setSelectedPeriod] = useState('all');
  const [activeMetricTab, setActiveMetricTab] = useState('revenue');

  const [availableYears, setAvailableYears] = useState(['2026', '2025', '2024', '2023']);
  const [latestActualMonth, setLatestActualMonth] = useState(8);

  const [sheetGids, setSheetGids] = useState(DEFAULT_GIDS);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const [parsedData, setParsedData] = useState({
    actual: null,
    plan: null
  });

  const cacheRef = useRef({});

  const autoDetectPlanGids = async () => {
    try {
      const pubHtmlUrl = `https://docs.google.com/spreadsheets/d/e/${SHEET_BASE_ID}/pubhtml`;
      const proxyUrls = [
        pubHtmlUrl,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(pubHtmlUrl)}`,
        `https://corsproxy.io/?${encodeURIComponent(pubHtmlUrl)}`,
        `https://api.codetab.org/v1/proxy?quest=${encodeURIComponent(pubHtmlUrl)}`
      ];

      for (const pUrl of proxyUrls) {
        try {
          const res = await fetch(pUrl, { cache: 'no-store' });
          if (res.ok) {
            const html = await res.text();
            if (html && html.length > 50) {
              const detected = {};
              const decodeUnicode = (str) => {
                try {
                  return JSON.parse(`"${str.replace(/"/g, '\\"')}"`);
                } catch {
                  return str.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
                }
              };

              const assignDetected = (rawName, gid) => {
                if (!rawName || !gid) return;
                const clean = decodeUnicode(rawName).trim().replace(/\s+/g, '');
                if (clean.includes('계획') && clean.includes('미포함')) detected.plan_exclude = String(gid).trim();
                else if (clean.includes('계획') && clean.includes('포함')) detected.plan_include = String(gid).trim();
                else if (clean.includes('실적') && clean.includes('포함')) detected.actual_include = String(gid).trim();
              };

              const itemBlocks = html.match(/items\.push\(\{[\s\S]*?\}\);/g) || [];
              itemBlocks.forEach(block => {
                const nameM = block.match(/name:\s*"([^"]+)"/);
                const gidM = block.match(/gid:\s*["']?([0-9]+)["']?/) || block.match(/gid=([0-9]+)/);
                if (nameM && gidM) assignDetected(nameM[1], gidM[1]);
              });

              if (detected.plan_exclude || detected.plan_include) {
                setSheetGids(prev => ({ ...prev, ...detected }));
                return detected;
              }
            }
          }
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
    return null;
  };

  const fetchSingleSheetData = async (gid) => {
    if (!gid && gid !== '0') return null;
    const cacheKey = `gid_${gid}`;
    if (cacheRef.current[cacheKey]) return cacheRef.current[cacheKey];

    const targetUrls = [
      `https://docs.google.com/spreadsheets/d/e/${SHEET_BASE_ID}/pub?gid=${gid}&output=csv`,
      `https://docs.google.com/spreadsheets/d/e/${SHEET_BASE_ID}/export?format=csv&gid=${gid}`
    ];

    for (const url of targetUrls) {
      const proxies = [
        url,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        `https://corsproxy.io/?${encodeURIComponent(url)}`,
        `https://api.codetab.org/v1/proxy?quest=${encodeURIComponent(url)}`
      ];

      for (const pUrl of proxies) {
        try {
          const res = await fetch(pUrl, { cache: 'no-store' });
          if (res.ok) {
            const csvText = await res.text();
            if (csvText && csvText.length > 80 && !csvText.includes('<!DOCTYPE html>')) {
              const rows = parseCSV(csvText);
              if (rows.length > 5) {
                cacheRef.current[cacheKey] = rows;
                return rows;
              }
            }
          }
        } catch {
          // ignore
        }
      }
    }
    return null;
  };

  const loadDashboardData = async (targetCostMode, forceRefresh = false) => {
    if (forceRefresh) {
      cacheRef.current = {};
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setErrorMessage('');

    try {
      let gids = { ...sheetGids };
      if (!gids.plan_exclude || !gids.plan_include) {
        const detected = await autoDetectPlanGids();
        if (detected) gids = { ...gids, ...detected };
      }

      const actualGid = targetCostMode === 'include' ? gids.actual_include : gids.actual_exclude;
      const planGid = targetCostMode === 'include' ? gids.plan_include : gids.plan_exclude;

      const [actualRows, planRows] = await Promise.all([
        fetchSingleSheetData(actualGid),
        fetchSingleSheetData(planGid)
      ]);

      if (!actualRows || actualRows.length === 0) {
        throw new Error('실적 데이터를 불러올 수 없습니다. 구글 시트 웹 게시 설정을 확인해주세요.');
      }

      setParsedData({
        actual: actualRows,
        plan: planRows
      });
    } catch (err) {
      setErrorMessage(err.message || '데이터 연동 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadDashboardData(costMode);
  }, [costMode]);

  const actualDataset = useMemo(() => structureDataset(parsedData.actual), [parsedData.actual]);
  const planDataset = useMemo(() => structureDataset(parsedData.plan), [parsedData.plan]);

  useEffect(() => {
    if (actualDataset) {
      if (actualDataset.years.length > 0) {
        setAvailableYears(actualDataset.years);
        if (!actualDataset.years.includes(selectedYear)) {
          setSelectedYear(actualDataset.years[0]);
        }
      }
      if (actualDataset.maxActualMonthFound > 1) {
        setLatestActualMonth(actualDataset.maxActualMonthFound);
      }
    }
  }, [actualDataset]);

  const activeMonthList = useMemo(() => {
    if (selectedPeriod === 'all') return Array.from({ length: 12 }, (_, i) => i + 1);
    if (selectedPeriod === 'h1') return [1, 2, 3, 4, 5, 6];
    if (selectedPeriod === 'h2') return [7, 8, 9, 10, 11, 12];
    if (selectedPeriod === 'q1') return [1, 2, 3];
    if (selectedPeriod === 'q2') return [4, 5, 6];
    if (selectedPeriod === 'q3') return [7, 8, 9];
    if (selectedPeriod === 'q4') return [10, 11, 12];
    if (selectedPeriod.startsWith('m')) {
      const m = parseInt(selectedPeriod.replace('m', ''), 10);
      return [m];
    }
    return Array.from({ length: 12 }, (_, i) => i + 1);
  }, [selectedPeriod]);

  const comparisonMonths = useMemo(() => {
    if (selectedPeriod === 'all') {
      return Array.from({ length: latestActualMonth }, (_, i) => i + 1);
    }
    return activeMonthList.filter(m => m <= latestActualMonth);
  }, [selectedPeriod, activeMonthList, latestActualMonth]);

  const computeMonthlyForecasts = (divisionKey, metricKey) => {
    const historicalYears = ['2025', '2024', '2023'].filter(y => availableYears.includes(y));
    const weights = [0.55, 0.3, 0.15];
    const forecast = {};

    for (let m = 9; m <= 12; m++) {
      forecast[m] = 0;
    }

    if (!actualDataset) return forecast;

    let totalWeight = 0;
    const ytdMonths = Array.from({ length: latestActualMonth }, (_, i) => i + 1);

    const currentYtdMetrics = calculateDivisionMetrics(actualDataset, divisionKey, selectedYear, ytdMonths);
    const currentYtdVal = currentYtdMetrics[metricKey] || 0;

    historicalYears.forEach((hYear, idx) => {
      const w = weights[idx] || 0.1;
      const hYtdMetrics = calculateDivisionMetrics(actualDataset, divisionKey, hYear, ytdMonths);
      const hYtdVal = hYtdMetrics[metricKey] || 0;

      if (hYtdVal !== 0) {
        totalWeight += w;
        for (let m = 9; m <= 12; m++) {
          const hMonthMetrics = calculateDivisionMetrics(actualDataset, divisionKey, hYear, [m]);
          const hMonthVal = hMonthMetrics[metricKey] || 0;
          const ratio = hMonthVal / hYtdVal;
          forecast[m] += currentYtdVal * ratio * w;
        }
      }
    });

    if (totalWeight > 0) {
      for (let m = 9; m <= 12; m++) {
        forecast[m] = forecast[m] / totalWeight;
      }
    } else {
      if (planDataset) {
        for (let m = 9; m <= 12; m++) {
          const planMetrics = calculateDivisionMetrics(planDataset, divisionKey, selectedYear, [m]);
          forecast[m] = planMetrics[metricKey] || 0;
        }
      }
    }

    return forecast;
  };

  const currentActual = useMemo(() => {
    const base = calculateDivisionMetrics(actualDataset, selectedDivision, selectedYear, activeMonthList);
    if (includeForecast && selectedPeriod === 'all' && latestActualMonth < 12) {
      const forecastRevs = computeMonthlyForecasts(selectedDivision, 'revenue');
      const forecastOps = computeMonthlyForecasts(selectedDivision, 'operatingProfit');
      const forecastEbits = computeMonthlyForecasts(selectedDivision, 'ebitda');
      const forecastOrds = computeMonthlyForecasts(selectedDivision, 'ordinaryProfit');

      let addRev = 0, addOp = 0, addEbit = 0, addOrd = 0;
      for (let m = latestActualMonth + 1; m <= 12; m++) {
        addRev += forecastRevs[m] || 0;
        addOp += forecastOps[m] || 0;
        addEbit += forecastEbits[m] || 0;
        addOrd += forecastOrds[m] || 0;
      }

      return {
        revenue: base.revenue + addRev,
        operatingProfit: base.operatingProfit + addOp,
        ebitda: base.ebitda + addEbit,
        ordinaryProfit: base.ordinaryProfit + addOrd
      };
    }
    return base;
  }, [actualDataset, selectedDivision, selectedYear, activeMonthList, includeForecast, selectedPeriod, latestActualMonth]);

  const currentPlan = useMemo(() => {
    return calculateDivisionMetrics(planDataset, selectedDivision, selectedYear, comparisonMonths);
  }, [planDataset, selectedDivision, selectedYear, comparisonMonths]);

  const prevYearActual = useMemo(() => {
    const prevYear = String(parseInt(selectedYear, 10) - 1);
    if (!availableYears.includes(prevYear)) return null;
    return calculateDivisionMetrics(actualDataset, selectedDivision, prevYear, activeMonthList);
  }, [actualDataset, selectedDivision, selectedYear, activeMonthList, availableYears]);

  const monthlyChartData = useMemo(() => {
    if (!actualDataset) return [];
    const prevYear = String(parseInt(selectedYear, 10) - 1);
    const hasPrevYear = availableYears.includes(prevYear);

    const forecastRevs = computeMonthlyForecasts(selectedDivision, activeMetricTab);

    return Array.from({ length: 12 }, (_, i) => {
      const monthNum = i + 1;
      const actualMonth = calculateDivisionMetrics(actualDataset, selectedDivision, selectedYear, [monthNum]);
      const planMonth = calculateDivisionMetrics(planDataset, selectedDivision, selectedYear, [monthNum]);
      const prevMonth = hasPrevYear
        ? calculateDivisionMetrics(actualDataset, selectedDivision, prevYear, [monthNum])
        : null;

      const isForecastMonth = includeForecast && monthNum > latestActualMonth;
      const displayVal = isForecastMonth
        ? Number((forecastRevs[monthNum] || 0).toFixed(2))
        : Number((actualMonth[activeMetricTab] || 0).toFixed(2));

      return {
        month: `${monthNum}월`,
        monthNum,
        실적: monthNum <= latestActualMonth ? displayVal : null,
        추정: isForecastMonth ? displayVal : null,
        계획: planDataset ? Number((planMonth[activeMetricTab] || 0).toFixed(2)) : null,
        전년: prevMonth ? Number((prevMonth[activeMetricTab] || 0).toFixed(2)) : null,
        isForecast: isForecastMonth
      };
    });
  }, [actualDataset, planDataset, selectedDivision, selectedYear, activeMetricTab, availableYears, includeForecast, latestActualMonth]);

  const divisionBreakdown = useMemo(() => {
    return DIVISIONS.filter(d => d.id !== 'all').map(div => {
      const act = calculateDivisionMetrics(actualDataset, div.id, selectedYear, activeMonthList);
      const pln = calculateDivisionMetrics(planDataset, div.id, selectedYear, comparisonMonths);
      const prev = prevYearActual
        ? calculateDivisionMetrics(actualDataset, div.id, String(parseInt(selectedYear, 10) - 1), activeMonthList)
        : null;

      const actVal = act[activeMetricTab] || 0;
      const plnVal = pln[activeMetricTab] || 0;
      const prevVal = prev ? prev[activeMetricTab] : null;

      const achievementRate = plnVal > 0 ? (actVal / plnVal) * 100 : null;
      const variance = actVal - plnVal;
      const yoy = prevVal && prevVal !== 0 ? ((actVal - prevVal) / Math.abs(prevVal)) * 100 : null;

      return {
        ...div,
        actualVal: actVal,
        planVal: plnVal,
        achievementRate,
        variance,
        yoy
      };
    });
  }, [actualDataset, planDataset, selectedYear, activeMonthList, comparisonMonths, activeMetricTab, prevYearActual]);

  const activeDivisionName = DIVISIONS.find(d => d.id === selectedDivision)?.name || '전사';
  const hasPlanData = Boolean(planDataset && planDataset.dataRows && planDataset.dataRows.length > 0);

  return (
    <div className="min-h-screen bg-[#F6F8FA] text-slate-800 p-3 sm:p-5 lg:p-7 font-sans antialiased selection:bg-[#05CD99] selection:text-white">
      <div className="max-w-[1440px] mx-auto space-y-5">

        {/* 상단 통합 내비게이션 바 */}
        <header className="bg-white/95 backdrop-blur-md px-4 sm:px-6 py-3.5 rounded-[26px] shadow-[0_4px_24px_rgba(0,0,0,0.02)] border border-slate-200/70 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          
          {/* 좌측 로고 & 사업부문 필 (Pill Tabs) */}
          <div className="flex flex-wrap items-center gap-3 sm:gap-6">
            <div className="flex items-center space-x-2.5">
              <div className="w-9 h-9 rounded-2xl bg-[#05CD99] flex items-center justify-center text-white shadow-sm shadow-[#05CD99]/30">
                <Layers size={18} className="stroke-[2.5]" />
              </div>
              <span className="text-base font-black tracking-tight text-slate-900">
                HiPlus<span className="text-[#05CD99]">.</span>
              </span>
            </div>

            {/* 사업본부 네비게이션 탭 (Reference Style Pill) */}
            <div className="flex items-center bg-slate-100/90 p-1 rounded-2xl border border-slate-200/50">
              {DIVISIONS.map(div => {
                const isActive = selectedDivision === div.id;
                return (
                  <button
                    key={div.id}
                    onClick={() => setSelectedDivision(div.id)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer ${
                      isActive
                        ? 'bg-[#05CD99] text-white shadow-xs font-extrabold'
                        : 'text-slate-500 hover:text-slate-900 hover:bg-white/60'
                    }`}
                  >
                    {div.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 우측 유틸리티 컨트롤 그룹 */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* 9~12월 추정치 토글 스위치 */}
            <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-2xl bg-slate-100/80 border border-slate-200/70">
              <Sparkles size={13} className="text-[#05CD99]" />
              <span className="text-xs font-bold text-slate-700">추정치(9~12월)</span>
              <div className="flex items-center bg-white rounded-xl p-0.5 border border-slate-200/60 shadow-2xs ml-1">
                <button
                  onClick={() => setIncludeForecast(false)}
                  className={`px-2 py-0.5 text-xs font-bold rounded-lg transition-all ${
                    !includeForecast
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'text-slate-400 hover:text-slate-700'
                  }`}
                >
                  미반영
                </button>
                <button
                  onClick={() => setIncludeForecast(true)}
                  className={`px-2 py-0.5 text-xs font-bold rounded-lg transition-all ${
                    includeForecast
                      ? 'bg-[#05CD99] text-white shadow-2xs'
                      : 'text-slate-400 hover:text-slate-700'
                  }`}
                >
                  반영
                </button>
              </div>
            </div>

            {/* 공통비 포함 | 미포함 토글 */}
            <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-2xl bg-slate-100/80 border border-slate-200/70">
              <Sliders size={13} className="text-slate-500" />
              <span className="text-xs font-bold text-slate-700">공통비</span>
              <div className="flex items-center bg-white rounded-xl p-0.5 border border-slate-200/60 shadow-2xs ml-1">
                <button
                  onClick={() => setCostMode('include')}
                  className={`px-2.5 py-0.5 text-xs font-bold rounded-lg transition-all ${
                    costMode === 'include'
                      ? 'bg-[#05CD99] text-white shadow-2xs'
                      : 'text-slate-400 hover:text-slate-700'
                  }`}
                >
                  포함
                </button>
                <button
                  onClick={() => setCostMode('exclude')}
                  className={`px-2.5 py-0.5 text-xs font-bold rounded-lg transition-all ${
                    costMode === 'exclude'
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'text-slate-400 hover:text-slate-700'
                  }`}
                >
                  미포함
                </button>
              </div>
            </div>

            {/* 연도 셀렉터 */}
            <div className="relative">
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="appearance-none bg-slate-100/80 hover:bg-slate-200/70 border border-slate-200/70 text-slate-700 text-xs font-bold rounded-2xl pl-3 pr-7 py-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#05CD99]/30 transition-all"
              >
                {availableYears.map(yr => (
                  <option key={yr} value={yr}>{yr}년</option>
                ))}
              </select>
              <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
            </div>

            {/* 기간 셀렉터 */}
            <div className="relative">
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="appearance-none bg-slate-100/80 hover:bg-slate-200/70 border border-slate-200/70 text-slate-700 text-xs font-bold rounded-2xl pl-3 pr-7 py-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#05CD99]/30 transition-all"
              >
                {PERIOD_OPTIONS.map(opt => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
              <Calendar size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
            </div>

            {/* 새로고침 버튼 */}
            <button
              onClick={() => loadDashboardData(costMode, true)}
              disabled={isRefreshing}
              className="w-8 h-8 rounded-2xl bg-slate-100 hover:bg-slate-200/70 text-slate-600 flex items-center justify-center transition-all border border-slate-200/70 cursor-pointer disabled:opacity-50"
              title="데이터 동기화"
            >
              <RefreshCw size={13} className={isRefreshing ? 'animate-spin text-[#05CD99]' : ''} />
            </button>
          </div>
        </header>

        {/* 오류 메시지 배너 */}
        {errorMessage && (
          <div className="bg-rose-50/90 border border-rose-200 text-rose-700 px-4 py-3 rounded-2xl text-xs font-semibold flex items-center justify-between shadow-2xs">
            <span className="flex items-center space-x-2">
              <AlertCircle size={14} className="text-rose-500" />
              <span>{errorMessage}</span>
            </span>
            <button onClick={() => setErrorMessage('')} className="text-rose-400 hover:text-rose-600 font-bold ml-2">닫기</button>
          </div>
        )}

        {/* 대형 웰컴 헤딩 (Welcome Banner Reference) */}
        <div className="px-1 py-1">
          <p className="text-xs font-semibold text-slate-400 tracking-wide">
            Ready to conquer your business goals?
          </p>
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 mt-1">
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
              Welcome Back, <span className="text-[#05CD99]">{activeDivisionName}</span>.
            </h2>
            <div className="flex items-center space-x-2 text-xs text-slate-500 font-medium">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-emerald-50 text-[#05CD99] font-bold border border-emerald-200/60">
                {selectedYear}년 실적
              </span>
              <span>•</span>
              <span>{selectedPeriod === 'all' ? `1~${latestActualMonth}월 누적` : selectedPeriod}</span>
            </div>
          </div>
        </div>

        {/* 주요 지표 카드 영역 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Object.entries(METRIC_CONFIG).map(([key, config]) => {
            const actualVal = currentActual[key] || 0;
            const planVal = currentPlan[key] || 0;
            const prevVal = prevYearActual ? prevYearActual[key] : null;

            const achievementRate = planVal > 0 ? (actualVal / planVal) * 100 : null;
            const variance = actualVal - planVal;
            const yoy = prevVal && prevVal !== 0 ? ((actualVal - prevVal) / Math.abs(prevVal)) * 100 : null;
            const isTabActive = activeMetricTab === key;

            return (
              <div
                key={key}
                onClick={() => setActiveMetricTab(key)}
                className={`relative bg-white p-5 rounded-[26px] border transition-all duration-200 cursor-pointer shadow-[0_4px_20px_rgba(0,0,0,0.02)] hover:shadow-md ${
                  isTabActive
                    ? 'border-[#05CD99] ring-2 ring-[#05CD99]/20'
                    : 'border-slate-200/70 hover:border-slate-300'
                }`}
              >
                {/* 상단 라벨과 원형 화살표 버튼 */}
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-slate-500">{config.label}</span>
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                      isTabActive
                        ? 'bg-[#05CD99] text-white shadow-xs shadow-[#05CD99]/30'
                        : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    <ArrowUpRight size={14} className="stroke-[2.5]" />
                  </div>
                </div>

                {/* 대형 숫자 */}
                <div className="text-3xl font-black tracking-tight text-slate-900 mb-3">
                  {config.format(actualVal)}
                </div>

                {/* 마이크로 비주얼라이저 (Digital Dot-Matrix Bar - Reference UI) */}
                <div className="flex items-center space-x-0.5 h-3.5 mb-3.5 overflow-hidden">
                  {Array.from({ length: 24 }).map((_, barIdx) => {
                    const ratio = achievementRate ? Math.min(100, Math.max(0, achievementRate)) : 50;
                    const filledBars = Math.round((ratio / 100) * 24);
                    const isFilled = barIdx < filledBars;
                    return (
                      <div
                        key={barIdx}
                        className={`w-1 rounded-full transition-all duration-300 ${
                          isFilled
                            ? 'h-3 bg-[#05CD99]'
                            : 'h-1.5 bg-slate-100'
                        }`}
                      />
                    );
                  })}
                </div>

                {/* 계획 대비 달성률 및 YoY 지표 */}
                <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
                  {hasPlanData && planVal > 0 ? (
                    <div className="relative group/tip cursor-help">
                      <span className="text-slate-400 font-medium">달성률: </span>
                      <span className={`font-extrabold ${
                        achievementRate >= 100 ? 'text-[#05CD99]' : 'text-slate-800'
                      }`}>
                        {achievementRate.toFixed(1)}%
                      </span>

                      {/* 툴팁 */}
                      <div className="absolute left-0 bottom-full mb-2 hidden group-hover/tip:flex flex-col bg-slate-900 text-white text-[11px] p-2.5 rounded-2xl shadow-xl whitespace-nowrap z-30 pointer-events-none">
                        <span className="font-bold text-slate-300">[{config.label} 계획 대비]</span>
                        <span>목표: {config.format(planVal)} | 실적: {config.format(actualVal)}</span>
                        <span className={`font-black mt-0.5 ${variance >= 0 ? 'text-[#05CD99]' : 'text-rose-400'}`}>
                          {variance >= 0
                            ? `+${variance.toFixed(1)}억 원 초과 달성 (+)`
                            : `${Math.abs(variance).toFixed(1)}억 원 미달성 (-)`}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <span className="text-slate-400 font-medium">
                      {includeForecast && selectedPeriod === 'all' ? '추정치 포함 예상' : '실적 집계 기준'}
                    </span>
                  )}

                  {/* YoY 배지 */}
                  {yoy !== null ? (
                    <span className={`flex items-center space-x-0.5 font-bold ${
                      yoy >= 0 ? 'text-[#05CD99]' : 'text-rose-500'
                    }`}>
                      {yoy >= 0 ? <ArrowUpRight size={11} className="stroke-[3]" /> : <ArrowDownRight size={11} className="stroke-[3]" />}
                      <span>{Math.abs(yoy).toFixed(1)}%</span>
                    </span>
                  ) : (
                    <span className="text-slate-300 font-medium">YoY -</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* 메인 차트 및 실적 리뷰 영역 */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          
          {/* 좌측: 월별 추이 차트 영역 (8 cols) */}
          <div className="lg:col-span-8 bg-white p-5 sm:p-6 rounded-[28px] border border-slate-200/70 shadow-[0_4px_24px_rgba(0,0,0,0.02)] space-y-4">
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2">
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                    {activeDivisionName} {METRIC_CONFIG[activeMetricTab].label} 월별 추이
                  </h3>
                  {includeForecast && (
                    <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-50 text-[#05CD99] border border-emerald-200/60">
                      9~12월 추정치 활성
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">당해 실적, 계획 목표 및 과거 트렌드 비교</p>
              </div>

              {/* 범례 (Legend) */}
              <div className="flex items-center space-x-3 text-xs text-slate-500 font-bold">
                <span className="flex items-center space-x-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#05CD99]" />
                  <span>실적</span>
                </span>
                {includeForecast && (
                  <span className="flex items-center space-x-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#A7F3D0]" />
                    <span>추정</span>
                  </span>
                )}
                {hasPlanData && (
                  <span className="flex items-center space-x-1.5">
                    <span className="w-3.5 h-0.5 bg-slate-800 border-t-2 border-slate-800 border-dashed" />
                    <span>계획</span>
                  </span>
                )}
                {prevYearActual && (
                  <span className="flex items-center space-x-1.5">
                    <span className="w-3.5 h-0.5 bg-slate-300" />
                    <span>전년</span>
                  </span>
                )}
              </div>
            </div>

            {/* 차트 캔버스 */}
            <div className="h-72 w-full pt-1">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={monthlyChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="month" tickLine={false} stroke="#94A3B8" fontSize={11} fontWeight={600} />
                  <YAxis tickLine={false} stroke="#94A3B8" fontSize={11} unit="억" fontWeight={600} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-slate-900/95 backdrop-blur-md text-white text-xs p-3.5 rounded-2xl shadow-2xl space-y-1.5 min-w-[130px] border border-slate-800">
                          <div className="font-extrabold text-slate-300 border-b border-slate-800 pb-1">
                            {d.month} {d.isForecast ? '(추정치)' : ''}
                          </div>
                          {d.실적 !== null && (
                            <div className="flex justify-between text-[#05CD99] font-bold">
                              <span>실적:</span>
                              <span>{d.실적}억</span>
                            </div>
                          )}
                          {d.추정 !== null && (
                            <div className="flex justify-between text-[#A7F3D0] font-bold">
                              <span>추정:</span>
                              <span>{d.추정}억</span>
                            </div>
                          )}
                          {d.계획 !== null && (
                            <div className="flex justify-between text-slate-300">
                              <span>계획:</span>
                              <span>{d.계획}억</span>
                            </div>
                          )}
                          {d.전년 !== null && (
                            <div className="flex justify-between text-slate-400">
                              <span>전년:</span>
                              <span>{d.전년}억</span>
                            </div>
                          )}
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="실적" fill="#05CD99" radius={[8, 8, 0, 0]} maxBarSize={30} />
                  {includeForecast && (
                    <Bar dataKey="추정" fill="#A7F3D0" radius={[8, 8, 0, 0]} maxBarSize={30} />
                  )}
                  {hasPlanData && (
                    <Line
                      type="monotone"
                      dataKey="계획"
                      stroke="#0F172A"
                      strokeWidth={2.2}
                      strokeDasharray="4 4"
                      dot={{ r: 3.5, fill: '#0F172A' }}
                    />
                  )}
                  {prevYearActual && (
                    <Line
                      type="monotone"
                      dataKey="전년"
                      stroke="#CBD5E1"
                      strokeWidth={1.8}
                      dot={false}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* 하단 서브 뷰: 4개 지표 간이 요약 바 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-slate-100">
              <div className="bg-slate-50/80 p-3 rounded-2xl border border-slate-100">
                <span className="text-[11px] font-bold text-slate-400">매출액</span>
                <p className="text-sm font-black text-slate-900 mt-0.5">
                  {formatToBillion(currentActual.revenue * 100000000).toFixed(1)}억
                </p>
              </div>
              <div className="bg-slate-50/80 p-3 rounded-2xl border border-slate-100">
                <span className="text-[11px] font-bold text-slate-400">영업이익</span>
                <p className="text-sm font-black text-slate-900 mt-0.5">
                  {formatToBillion(currentActual.operatingProfit * 100000000).toFixed(1)}억
                </p>
              </div>
              <div className="bg-slate-50/80 p-3 rounded-2xl border border-slate-100">
                <span className="text-[11px] font-bold text-slate-400">EBITDA</span>
                <p className="text-sm font-black text-slate-900 mt-0.5">
                  {formatToBillion(currentActual.ebitda * 100000000).toFixed(1)}억
                </p>
              </div>
              <div className="bg-slate-50/80 p-3 rounded-2xl border border-slate-100">
                <span className="text-[11px] font-bold text-slate-400">경상이익</span>
                <p className="text-sm font-black text-slate-900 mt-0.5">
                  {formatToBillion(currentActual.ordinaryProfit * 100000000).toFixed(1)}억
                </p>
              </div>
            </div>

          </div>

          {/* 우측: 다크 카드 + 실적 분석 리뷰 영역 (4 cols) */}
          <div className="lg:col-span-4 space-y-4 flex flex-col justify-between">
            
            {/* 상단 다크 강조 카드 (Reference Meeting Notes Style) */}
            <div className="bg-[#0F172A] text-white p-5 rounded-[28px] shadow-sm relative overflow-hidden flex flex-col justify-between space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 rounded-full bg-[#05CD99] animate-pulse" />
                  <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                    {activeDivisionName} 실적리뷰
                  </span>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  {selectedPeriod === 'all' ? `누적 (${latestActualMonth}월)` : selectedPeriod}
                </span>
              </div>

              <div>
                <h4 className="text-lg font-black tracking-tight text-white">
                  {activeDivisionName} 경영실적 진단
                </h4>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  영업이익률{' '}
                  <span className="text-[#05CD99] font-bold">
                    {currentActual.revenue > 0
                      ? `${((currentActual.operatingProfit / currentActual.revenue) * 100).toFixed(1)}%`
                      : '0.0%'}
                  </span>
                  , EBITDA 마진{' '}
                  <span className="text-white font-bold">
                    {currentActual.revenue > 0
                      ? `${((currentActual.ebitda / currentActual.revenue) * 100).toFixed(1)}%`
                      : '0.0%'}
                  </span>
                  를 기록 중입니다.
                </p>
              </div>

              {/* 시그니처 민트그린 액션 바 */}
              <div className="w-full bg-[#05CD99] text-slate-900 px-4 py-2.5 rounded-2xl font-black text-xs flex items-center justify-between shadow-xs">
                <span>실시간 실적 진척 상태 정상</span>
                <CheckCircle2 size={15} className="text-slate-900" />
              </div>
            </div>

            {/* 하단 실적 분석 요약 (AI Insight Box) */}
            <div className="bg-white p-5 rounded-[28px] border border-slate-200/70 shadow-[0_4px_24px_rgba(0,0,0,0.02)] space-y-3.5 flex-1 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                  <h4 className="text-xs font-black text-slate-900 tracking-tight flex items-center space-x-1.5">
                    <Sparkles size={14} className="text-[#05CD99]" />
                    <span>실적 분석 요약</span>
                  </h4>
                  <span className="text-[11px] font-semibold text-slate-400">
                    {costMode === 'include' ? '공통비 포함' : '공통비 미포함'}
                  </span>
                </div>

                <div className="space-y-2.5 mt-3 text-xs leading-relaxed text-slate-600">
                  <div className="flex items-start space-x-2 bg-slate-50/80 p-2.5 rounded-2xl border border-slate-100">
                    <CheckCircle2 size={13} className="text-[#05CD99] mt-0.5 shrink-0" />
                    <p>
                      <strong className="text-slate-900">수익성 평가:</strong> 영업이익률은{' '}
                      <span className="font-bold text-[#05CD99]">
                        {currentActual.revenue > 0
                          ? `${((currentActual.operatingProfit / currentActual.revenue) * 100).toFixed(1)}%`
                          : '0.0%'}
                      </span>
                      이며, EBITDA 마진율은{' '}
                      <span className="font-bold text-slate-800">
                        {currentActual.revenue > 0
                          ? `${((currentActual.ebitda / currentActual.revenue) * 100).toFixed(1)}%`
                          : '0.0%'}
                      </span>
                      입니다.
                    </p>
                  </div>

                  <div className="flex items-start space-x-2 bg-slate-50/80 p-2.5 rounded-2xl border border-slate-100">
                    <ShieldCheck size={13} className="text-[#05CD99] mt-0.5 shrink-0" />
                    <p>
                      <strong className="text-slate-900">목표 달성 현황:</strong>{' '}
                      {hasPlanData && currentPlan.revenue > 0 ? (
                        <>
                          매출액 계획 대비 달성률은{' '}
                          <span className="font-bold text-[#05CD99]">
                            {((currentActual.revenue / currentPlan.revenue) * 100).toFixed(1)}%
                          </span>
                          를 기록하고 있습니다.
                        </>
                      ) : (
                        '계획 시트와 연동되어 목표 달성률을 자동 비교 중입니다.'
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* 하단 AI 프롬프트 인풋 데코레이션 (Reference Style) */}
              <div className="pt-2 border-t border-slate-100">
                <div className="bg-slate-50 p-2 rounded-2xl border border-slate-200/60 flex items-center justify-between text-xs text-slate-400">
                  <span className="text-[11px] font-medium pl-1">Ask anything about business metrics...</span>
                  <div className="w-6 h-6 rounded-xl bg-[#05CD99] flex items-center justify-center text-white">
                    <ArrowRight size={12} />
                  </div>
                </div>
              </div>

            </div>

          </div>
        </div>

        {/* 사업부문별 하단 현황 카드 */}
        <div className="bg-white p-5 sm:p-6 rounded-[28px] border border-slate-200/70 shadow-[0_4px_24px_rgba(0,0,0,0.02)] space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                사업부문별 {METRIC_CONFIG[activeMetricTab].label} 현황
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">사업부문별 실적액, 목표 달성률 및 전년 대비 증감</p>
            </div>
            <span className="text-xs font-bold text-slate-400">
              총 {divisionBreakdown.length}개 부문
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {divisionBreakdown.map((div, idx) => (
              <div
                key={div.id}
                onClick={() => setSelectedDivision(div.id)}
                className={`p-4 rounded-2xl border transition-all duration-200 cursor-pointer ${
                  selectedDivision === div.id
                    ? 'bg-[#05CD99]/5 border-[#05CD99] shadow-xs'
                    : 'bg-slate-50/70 hover:bg-slate-100/80 border-slate-200/60'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <span className="w-5 h-5 rounded-lg bg-white border border-slate-200 text-slate-500 font-black text-[10px] flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <span className="font-extrabold text-xs text-slate-800">{div.name}</span>
                  </div>

                  {/* 호버 툴팁이 있는 달성률 뱃지 */}
                  {div.achievementRate !== null && (
                    <div className="relative group/subtip cursor-help">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                        div.achievementRate >= 100
                          ? 'bg-[#05CD99] text-white'
                          : 'bg-slate-200 text-slate-700'
                      }`}>
                        {div.achievementRate.toFixed(0)}%
                      </span>

                      <div className="absolute right-0 bottom-full mb-1.5 hidden group-hover/subtip:flex flex-col bg-slate-900 text-white text-[11px] p-2.5 rounded-xl shadow-xl whitespace-nowrap z-30 pointer-events-none">
                        <span className="font-bold text-slate-300">[{div.name}]</span>
                        <span>목표: {div.planVal.toFixed(1)}억 | 실적: {div.actualVal.toFixed(1)}억</span>
                        <span className={`font-black mt-0.5 ${div.variance >= 0 ? 'text-[#05CD99]' : 'text-rose-400'}`}>
                          {div.variance >= 0
                            ? `+${div.variance.toFixed(1)}억 원 초과 달성 (+)`
                            : `${Math.abs(div.variance).toFixed(1)}억 원 미달성 (-)`}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="text-xl font-black tracking-tight text-slate-900">
                  {div.actualVal.toFixed(1)}억
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2 pt-2 border-t border-slate-200/50">
                  <span>전년 동기</span>
                  {div.yoy !== null ? (
                    <span className={`font-bold flex items-center ${
                      div.yoy >= 0 ? 'text-[#05CD99]' : 'text-rose-500'
                    }`}>
                      {div.yoy >= 0 ? '+' : ''}{div.yoy.toFixed(1)}%
                    </span>
                  ) : (
                    <span>-</span>
                  )}
                </div>
              </div>
            ))}
          </div>

        </div>

      </div>
    </div>
  );
}