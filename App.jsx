import React, { useState, useMemo, useCallback } from "react";
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Upload,
  Sparkles,
  ChevronRight,
  Search,
  Loader2,
  Bitcoin,
  LineChart as LineChartIcon,
  AlertCircle,
} from "lucide-react";

// ---------- Indicateurs techniques ----------

function sma(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function ema(values, period) {
  const out = new Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    if (i === period - 1) {
      const slice = values.slice(0, period);
      prev = slice.reduce((a, b) => a + b, 0) / period;
      out[i] = prev;
    } else if (i >= period) {
      prev = values[i] * k + prev * (1 - k);
      out[i] = prev;
    }
  }
  return out;
}

function rsi(values, period = 14) {
  const out = new Array(values.length).fill(null);
  let gains = 0;
  let losses = 0;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    if (i <= period) {
      gains += gain;
      losses += loss;
      if (i === period) {
        avgGain = gains / period;
        avgLoss = losses / period;
        out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
      }
    } else {
      // lissage de Wilder
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    }
  }
  return out;
}

function macd(values, fast = 12, slow = 26, signalPeriod = 9) {
  const emaFast = ema(values, fast);
  const emaSlow = ema(values, slow);
  const macdLine = values.map((_, i) =>
    emaFast[i] != null && emaSlow[i] != null ? emaFast[i] - emaSlow[i] : null
  );
  const macdValuesOnly = macdLine.filter((v) => v != null);
  const signalRaw = ema(macdValuesOnly, signalPeriod);
  const signalLine = new Array(values.length).fill(null);
  let offset = macdLine.findIndex((v) => v != null);
  for (let i = 0; i < signalRaw.length; i++) {
    if (signalRaw[i] != null) signalLine[offset + i] = signalRaw[i];
  }
  return { macdLine, signalLine };
}

// ---------- Données de démonstration ----------

function genSampleData(n = 120, seedTrend = 0.15) {
  let price = 100;
  const data = [];
  const start = new Date();
  start.setDate(start.getDate() - n);
  let momentum = 0;
  for (let i = 0; i < n; i++) {
    momentum = momentum * 0.9 + (Math.random() - 0.48 + seedTrend * 0.05) * 1.2;
    price = Math.max(2, price + momentum);
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    data.push({
      date: d.toISOString().slice(0, 10),
      close: Number(price.toFixed(2)),
    });
  }
  return data;
}

function parseCSV(text) {
  const lines = text
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const rows = [];
  for (const line of lines) {
    const parts = line.split(",");
    if (parts.length < 2) continue;
    const [date, closeRaw] = parts;
    const close = parseFloat(closeRaw);
    if (Number.isNaN(close)) continue;
    if (date.toLowerCase().includes("date")) continue;
    rows.push({ date: date.trim(), close });
  }
  return rows;
}

// ---------- Récupération de données de marché en direct ----------

async function fetchCryptoData(query) {
  const searchRes = await fetch(
    `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`
  );
  if (!searchRes.ok) throw new Error("Recherche crypto indisponible");
  const searchJson = await searchRes.json();
  const coin = searchJson.coins && searchJson.coins[0];
  if (!coin) throw new Error(`Aucune crypto trouvée pour "${query}"`);

  const chartRes = await fetch(
    `https://api.coingecko.com/api/v3/coins/${coin.id}/market_chart?vs_currency=usd&days=180&interval=daily`
  );
  if (!chartRes.ok) throw new Error("Historique crypto indisponible");
  const chartJson = await chartRes.json();
  const prices = chartJson.prices || [];
  if (prices.length < 50) throw new Error("Pas assez d'historique pour cette crypto");

  return {
    label: `${coin.name} (${coin.symbol.toUpperCase()})`,
    data: prices.map(([ts, price]) => ({
      date: new Date(ts).toISOString().slice(0, 10),
      close: Number(price.toFixed(price < 1 ? 6 : 2)),
    })),
  };
}

async function fetchStockData(query) {
  const symbol = query.trim().toUpperCase();
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      symbol
    )}?range=1y&interval=1d`
  );
  if (!res.ok) throw new Error("Symbole introuvable ou API bloquée");
  const json = await res.json();
  const result = json.chart && json.chart.result && json.chart.result[0];
  if (!result) throw new Error(`Aucune donnée pour "${symbol}"`);

  const timestamps = result.timestamp || [];
  const closes = (result.indicators.quote && result.indicators.quote[0].close) || [];
  const data = timestamps
    .map((ts, i) => ({
      date: new Date(ts * 1000).toISOString().slice(0, 10),
      close: closes[i],
    }))
    .filter((d) => d.close != null);

  if (data.length < 50) throw new Error("Pas assez d'historique pour ce symbole");

  return {
    label: result.meta.symbol,
    data: data.map((d) => ({ ...d, close: Number(d.close.toFixed(2)) })),
  };
}

// ---------- Moteur de signal (règles simples, transparentes) ----------

function computeSignal(dataset) {
  const closes = dataset.map((d) => d.close);
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const rsi14 = rsi(closes, 14);
  const { macdLine, signalLine } = macd(closes);

  const last = closes.length - 1;
  const lastClose = closes[last];
  const lastSma20 = sma20[last];
  const lastSma50 = sma50[last];
  const lastRsi = rsi14[last];
  const lastMacd = macdLine[last];
  const lastSignal = signalLine[last];
  const prevMacd = macdLine[last - 1];
  const prevSignal = signalLine[last - 1];

  let score = 0;
  const reasons = [];

  if (lastSma20 != null && lastSma50 != null) {
    if (lastSma20 > lastSma50) {
      score += 30;
      reasons.push({ label: "Moyenne 20j > Moyenne 50j (tendance haussière)", tone: "up" });
    } else {
      score -= 30;
      reasons.push({ label: "Moyenne 20j < Moyenne 50j (tendance baissière)", tone: "down" });
    }
  }

  if (lastRsi != null) {
    if (lastRsi < 30) {
      score += 25;
      reasons.push({ label: `RSI à ${lastRsi.toFixed(0)} : zone de survente`, tone: "up" });
    } else if (lastRsi > 70) {
      score -= 25;
      reasons.push({ label: `RSI à ${lastRsi.toFixed(0)} : zone de surachat`, tone: "down" });
    } else {
      reasons.push({ label: `RSI à ${lastRsi.toFixed(0)} : zone neutre`, tone: "neutral" });
    }
  }

  if (lastMacd != null && lastSignal != null && prevMacd != null && prevSignal != null) {
    const crossedUp = prevMacd <= prevSignal && lastMacd > lastSignal;
    const crossedDown = prevMacd >= prevSignal && lastMacd < lastSignal;
    if (crossedUp) {
      score += 30;
      reasons.push({ label: "MACD vient de croiser au-dessus du signal", tone: "up" });
    } else if (crossedDown) {
      score -= 30;
      reasons.push({ label: "MACD vient de croiser en dessous du signal", tone: "down" });
    } else if (lastMacd > lastSignal) {
      score += 10;
      reasons.push({ label: "MACD au-dessus du signal", tone: "up" });
    } else {
      score -= 10;
      reasons.push({ label: "MACD en dessous du signal", tone: "down" });
    }
  }

  if (lastClose != null && lastSma20 != null) {
    if (lastClose > lastSma20) {
      score += 15;
    } else {
      score -= 15;
    }
  }

  score = Math.max(-100, Math.min(100, score));

  let verdict = "NEUTRE";
  if (score >= 35) verdict = "ACHAT";
  else if (score <= -35) verdict = "VENTE";

  return {
    score,
    verdict,
    reasons,
    lastClose,
    lastRsi,
    lastSma20,
    lastSma50,
    lastMacd,
    lastSignal,
    series: dataset.map((d, i) => ({
      ...d,
      sma20: sma20[i],
      sma50: sma50[i],
    })),
  };
}

// ---------- Jauge de signal ----------

function SignalGauge({ score, verdict }) {
  const angle = ((score + 100) / 200) * 180; // 0..180
  const needleColor =
    verdict === "ACHAT" ? "#3FB68B" : verdict === "VENTE" ? "#E2574C" : "#F0B429";

  const rad = (Math.PI * (180 - angle)) / 180;
  const cx = 100;
  const cy = 100;
  const r = 78;
  const x2 = cx + r * Math.cos(rad);
  const y2 = cy - r * Math.sin(rad);

  return (
    <div className="flex flex-col items-center">
      <svg width="200" height="120" viewBox="0 0 200 120">
        <defs>
          <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#E2574C" />
            <stop offset="50%" stopColor="#F0B429" />
            <stop offset="100%" stopColor="#3FB68B" />
          </linearGradient>
        </defs>
        <path
          d="M 15 100 A 85 85 0 0 1 185 100"
          fill="none"
          stroke="url(#gaugeGrad)"
          strokeWidth="14"
          strokeLinecap="round"
          opacity="0.85"
        />
        <line
          x1={cx}
          y1={cy}
          x2={x2}
          y2={y2}
          stroke={needleColor}
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r="5" fill={needleColor} />
      </svg>
      <div
        className="mt-1 font-mono text-2xl tracking-widest font-semibold"
        style={{ color: needleColor }}
      >
        {verdict}
      </div>
      <div className="text-xs text-[#6B7280] font-mono mt-0.5">
        score {score > 0 ? "+" : ""}
        {score}
      </div>
    </div>
  );
}

// ---------- Composant principal ----------

export default function App() {
  const [rawCsv, setRawCsv] = useState("");
  const [dataset, setDataset] = useState(() => genSampleData(140, 0.4));
  const [ticker, setTicker] = useState("EXEMPLE");
  const [error, setError] = useState("");
  const [marketType, setMarketType] = useState("crypto"); // "crypto" | "stock"
  const [symbolQuery, setSymbolQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState("");

  const result = useMemo(() => {
    if (dataset.length < 50) return null;
    return computeSignal(dataset);
  }, [dataset]);

  const handleLoadCsv = useCallback(() => {
    const rows = parseCSV(rawCsv);
    if (rows.length < 50) {
      setError("Il faut au moins 50 points (format: date,cours) pour un calcul fiable.");
      return;
    }
    setError("");
    setDataset(rows);
  }, [rawCsv]);

  const handleFetchLive = useCallback(async () => {
    if (!symbolQuery.trim()) return;
    setLoading(true);
    setFetchError("");
    setError("");
    try {
      const result =
        marketType === "crypto"
          ? await fetchCryptoData(symbolQuery)
          : await fetchStockData(symbolQuery);
      setTicker(result.label);
      setDataset(result.data);
    } catch (e) {
      const hint =
        marketType === "stock"
          ? " (les API actions bloquent parfois les appels directs du navigateur — si ça persiste, collez vos données en CSV ci-dessous)"
          : "";
      setFetchError((e.message || "Erreur de récupération des données") + hint);
    } finally {
      setLoading(false);
    }
  }, [symbolQuery, marketType]);

  const handleSample = useCallback((trend) => {
    setError("");
    setTicker(trend > 0 ? "DEMO-HAUSSIER" : "DEMO-BAISSIER");
    setDataset(genSampleData(140, trend));
  }, []);

  return (
    <div
      className="min-h-screen w-full font-sans"
      style={{ background: "#0B0E14", color: "#E8EAED" }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
        .font-sans { font-family: 'Inter', sans-serif; }
        .font-display { font-family: 'Space Grotesk', sans-serif; }
        .font-mono { font-family: 'IBM Plex Mono', monospace; }
      `}</style>

      <div className="max-w-6xl mx-auto px-5 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 text-[#6B7280] text-xs font-mono uppercase tracking-[0.2em] mb-1">
              <Sparkles size={13} />
              Analyse de tendance — MVP
            </div>
            <h1 className="font-display text-3xl font-bold text-[#E8EAED]">
              Signal<span style={{ color: "#3FB68B" }}>.</span>
            </h1>
          </div>
          <div className="font-mono text-sm text-[#6B7280]">
            {ticker} · {dataset.length} points
          </div>
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5">
          {/* Chart panel */}
          <div
            className="rounded-xl p-5"
            style={{ background: "#131722", border: "1px solid #232838" }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-sm font-semibold text-[#E8EAED]">
                Cours &amp; moyennes mobiles
              </h2>
              <div className="flex gap-4 text-xs font-mono text-[#6B7280]">
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full"
                    style={{ background: "#E8EAED" }}
                  />
                  Cours
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full"
                    style={{ background: "#3FB68B" }}
                  />
                  SMA 20
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full"
                    style={{ background: "#F0B429" }}
                  />
                  SMA 50
                </span>
              </div>
            </div>

            <ResponsiveContainer width="100%" height={340}>
              <ComposedChart data={result ? result.series : []}>
                <defs>
                  <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#E8EAED" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="#E8EAED" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#232838" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "#6B7280", fontSize: 10, fontFamily: "IBM Plex Mono" }}
                  tickLine={false}
                  axisLine={{ stroke: "#232838" }}
                  minTickGap={40}
                />
                <YAxis
                  tick={{ fill: "#6B7280", fontSize: 10, fontFamily: "IBM Plex Mono" }}
                  tickLine={false}
                  axisLine={false}
                  domain={["auto", "auto"]}
                  width={45}
                />
                <Tooltip
                  contentStyle={{
                    background: "#0B0E14",
                    border: "1px solid #232838",
                    borderRadius: 8,
                    fontFamily: "IBM Plex Mono",
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "#6B7280" }}
                />
                <Area
                  type="monotone"
                  dataKey="close"
                  stroke="none"
                  fill="url(#priceFill)"
                />
                <Line
                  type="monotone"
                  dataKey="close"
                  stroke="#E8EAED"
                  strokeWidth={1.75}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="sma20"
                  stroke="#3FB68B"
                  strokeWidth={1.5}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="sma50"
                  stroke="#F0B429"
                  strokeWidth={1.5}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>

            {/* Live market search */}
            <div className="mt-5 pt-5" style={{ borderTop: "1px solid #232838" }}>
              <div className="text-xs font-mono text-[#6B7280] uppercase tracking-wider mb-2">
                Rechercher un marché en direct
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid #232838" }}>
                  <button
                    onClick={() => setMarketType("crypto")}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium"
                    style={{
                      background: marketType === "crypto" ? "#3FB68B" : "#0B0E14",
                      color: marketType === "crypto" ? "#0B0E14" : "#6B7280",
                    }}
                  >
                    <Bitcoin size={13} />
                    Crypto
                  </button>
                  <button
                    onClick={() => setMarketType("stock")}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium"
                    style={{
                      background: marketType === "stock" ? "#3FB68B" : "#0B0E14",
                      color: marketType === "stock" ? "#0B0E14" : "#6B7280",
                    }}
                  >
                    <LineChartIcon size={13} />
                    Action
                  </button>
                </div>
                <input
                  value={symbolQuery}
                  onChange={(e) => setSymbolQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleFetchLive()}
                  placeholder={
                    marketType === "crypto" ? "ex: bitcoin, solana..." : "ex: AAPL, TSLA..."
                  }
                  className="flex-1 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none"
                  style={{
                    background: "#0B0E14",
                    border: "1px solid #232838",
                    color: "#E8EAED",
                  }}
                />
                <button
                  onClick={handleFetchLive}
                  disabled={loading}
                  className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium whitespace-nowrap"
                  style={{ background: "#F0B429", color: "#0B0E14", opacity: loading ? 0.7 : 1 }}
                >
                  {loading ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Search size={13} />
                  )}
                  {loading ? "Chargement..." : "Charger"}
                </button>
              </div>
              {fetchError && (
                <div className="mt-2 flex items-start gap-1.5 text-xs font-mono" style={{ color: "#E2574C" }}>
                  <AlertCircle size={13} className="mt-0.5 shrink-0" />
                  <span>{fetchError}</span>
                </div>
              )}
            </div>

            {/* Data input */}
            <div className="mt-5 pt-5" style={{ borderTop: "1px solid #232838" }}>
              <div className="text-xs font-mono text-[#6B7280] uppercase tracking-wider mb-2">
                Ou coller un CSV (date,cours)
              </div>
              <div className="flex gap-2 flex-col sm:flex-row">
                <textarea
                  value={rawCsv}
                  onChange={(e) => setRawCsv(e.target.value)}
                  placeholder={"2026-01-01,102.30\n2026-01-02,103.10\n..."}
                  rows={2}
                  className="flex-1 rounded-lg px-3 py-2 text-xs font-mono resize-none focus:outline-none"
                  style={{
                    background: "#0B0E14",
                    border: "1px solid #232838",
                    color: "#E8EAED",
                  }}
                />
                <div className="flex gap-2 sm:flex-col">
                  <button
                    onClick={handleLoadCsv}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap"
                    style={{ background: "#3FB68B", color: "#0B0E14" }}
                  >
                    <Upload size={13} />
                    Analyser
                  </button>
                </div>
              </div>
              {error && (
                <div className="mt-2 text-xs font-mono" style={{ color: "#E2574C" }}>
                  {error}
                </div>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => handleSample(0.4)}
                  className="text-xs font-mono px-3 py-1.5 rounded-md"
                  style={{ background: "#1A1F2E", color: "#6B7280", border: "1px solid #232838" }}
                >
                  Exemple haussier
                </button>
                <button
                  onClick={() => handleSample(-0.4)}
                  className="text-xs font-mono px-3 py-1.5 rounded-md"
                  style={{ background: "#1A1F2E", color: "#6B7280", border: "1px solid #232838" }}
                >
                  Exemple baissier
                </button>
              </div>
            </div>
          </div>

          {/* Signal panel */}
          <div className="flex flex-col gap-5">
            <div
              className="rounded-xl p-5 flex flex-col items-center"
              style={{ background: "#131722", border: "1px solid #232838" }}
            >
              <div className="text-xs font-mono text-[#6B7280] uppercase tracking-wider mb-3 self-start">
                Signal actuel
              </div>
              {result && <SignalGauge score={result.score} verdict={result.verdict} />}
              <div className="w-full mt-4 pt-4 grid grid-cols-2 gap-3" style={{ borderTop: "1px solid #232838" }}>
                <div>
                  <div className="text-[10px] font-mono text-[#6B7280] uppercase">Cours</div>
                  <div className="font-mono text-sm">{result?.lastClose?.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-[10px] font-mono text-[#6B7280] uppercase">RSI (14)</div>
                  <div className="font-mono text-sm">{result?.lastRsi?.toFixed(1) ?? "—"}</div>
                </div>
              </div>
            </div>

            <div
              className="rounded-xl p-5"
              style={{ background: "#131722", border: "1px solid #232838" }}
            >
              <div className="text-xs font-mono text-[#6B7280] uppercase tracking-wider mb-3">
                Pourquoi ce signal
              </div>
              <div className="flex flex-col gap-2.5">
                {result?.reasons.map((r, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    {r.tone === "up" && (
                      <TrendingUp size={14} className="mt-0.5 shrink-0" color="#3FB68B" />
                    )}
                    {r.tone === "down" && (
                      <TrendingDown size={14} className="mt-0.5 shrink-0" color="#E2574C" />
                    )}
                    {r.tone === "neutral" && (
                      <Minus size={14} className="mt-0.5 shrink-0" color="#F0B429" />
                    )}
                    <span className="text-[#C4C9D2] leading-snug">{r.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="mt-6 flex items-start gap-2 text-[11px] font-mono text-[#6B7280] leading-relaxed">
          <ChevronRight size={13} className="mt-0.5 shrink-0" />
          <span>
            Ceci est un MVP pédagogique basé sur des règles techniques simples (moyennes
            mobiles, RSI, MACD). Ce n'est pas un conseil en investissement — vérifiez
            toujours vos sources et votre gestion du risque avant d'agir.
          </span>
        </div>
      </div>
    </div>
  );
}
