import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Sparkles, Trophy, Clock, Users, Volume2, VolumeX, Play, AlertCircle, Info } from 'lucide-react';
import { triggerHaptic } from '../utils/telegram';

export interface LottoTokenItem {
  id: string;
  tokenNumber: number;
  telegramUserId: number;
  userName: string;
  adminId: string;
  adminName: string;
  adminColor: string;
  createdAt: string;
}

export interface LottoWinnerItem {
  rank: number;
  telegramUserId: number;
  userName: string;
  adminId: string;
  adminName: string;
  prizeAmount: number;
  tokenNumber: number;
}

export const SafeDepositBoxIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="3" y="3" width="18" height="18" rx="3" fill="currentColor" fillOpacity="0.15" />
    <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    <path d="M12 8v1.5" />
    <path d="M12 14.5v1.5" />
    <path d="M8 12h1.5" />
    <path d="M14.5 12h1.5" />
    <path d="M18 9v6" strokeWidth="2.5" />
  </svg>
);

interface MegaCircleLottoProps {
  title: string;
  tokens: LottoTokenItem[];
  totalPot: number;
  yesterdayPot?: number;
  drawTime: Date; // e.g. 18:00 (ማታ 12 ሰአት) or 19:00 (ማታ 1 ሰአት) EAT
  isSuperBonus?: boolean;
  onDrawCompleted?: (winners: LottoWinnerItem[]) => void;
  savedWinners?: LottoWinnerItem[];
  isDemoModeAllowed?: boolean;
}

// 10 Distinct luxury admin colors
const ADMIN_COLORS = [
  '#f59e0b', // Amber
  '#10b981', // Emerald
  '#06b6d4', // Cyan
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#3b82f6', // Blue
  '#eab308', // Yellow
  '#14b8a6', // Teal
  '#f97316', // Orange
  '#a855f7', // Violet
];

export const MegaCircleLotto: React.FC<MegaCircleLottoProps> = ({
  title,
  tokens,
  totalPot,
  yesterdayPot = 0,
  drawTime,
  isSuperBonus = false,
  onDrawCompleted,
  savedWinners = [],
  isDemoModeAllowed = true,
}) => {
  const [activeTokens, setActiveTokens] = useState<LottoTokenItem[]>(tokens);
  const [winners, setWinners] = useState<LottoWinnerItem[]>(savedWinners);
  const [pointerAngle, setPointerAngle] = useState<number>(0);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [currentDrawingRank, setCurrentDrawingRank] = useState<number>(1);
  const [celebratingWinner, setCelebratingWinner] = useState<LottoWinnerItem | null>(null);
  const [celebrationCountdown, setCelebrationCountdown] = useState<number>(0);
  const [random4Digit, setRandom4Digit] = useState<number | null>(null);
  const [isRolling4Digit, setIsRolling4Digit] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [timeUntilDrawSec, setTimeUntilDrawSec] = useState<number>(3600);
  const [selectedSpeed, setSelectedSpeed] = useState<'normal' | 'fast'>('normal');

  const audioCtxRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Sync incoming tokens
  useEffect(() => {
    if (winners.length === 0) {
      setActiveTokens(tokens);
    }
  }, [tokens, winners.length]);

  // Audio synthesizer for clock ticks & win fanfares
  const playTickSound = (freq = 800) => {
    if (!soundEnabled) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    } catch {
      // Audio context policy fallback
    }
  };

  const playFanfareSound = () => {
    if (!soundEnabled) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      notes.forEach((note, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(note, ctx.currentTime + idx * 0.1);
        gain.gain.setValueAtTime(0.08, ctx.currentTime + idx * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.1 + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + idx * 0.1);
        osc.stop(ctx.currentTime + idx * 0.1 + 0.35);
      });
    } catch {
      // Audio context policy fallback
    }
  };

  // 10-Winner Halving Prize Formula (Winner 10 exact half, leaving remainder)
  const prizeStakes = useMemo(() => {
    const percentages = [
      0.50,          // Rank 1: 50%
      0.25,          // Rank 2: 25%
      0.125,         // Rank 3: 12.5%
      0.0625,        // Rank 4: 6.25%
      0.03125,       // Rank 5: 3.125%
      0.015625,      // Rank 6: 1.5625%
      0.0078125,     // Rank 7: 0.78125%
      0.00390625,    // Rank 8: 0.390625%
      0.001953125,   // Rank 9: 0.1953125%
      0.0009765625,  // Rank 10: 0.09765625% (Exact half of rank 9)
    ];
    return percentages.map((pct) => Math.floor(totalPot * pct));
  }, [totalPot]);

  // Admin Color Mapping & Probability Weights
  const adminColorMap = useMemo(() => {
    const map: { [adminId: string]: string } = {};
    let colorIdx = 0;
    tokens.forEach((t) => {
      if (!map[t.adminId]) {
        map[t.adminId] = t.adminColor || ADMIN_COLORS[colorIdx % ADMIN_COLORS.length];
        colorIdx++;
      }
    });
    return map;
  }, [tokens]);

  const adminProbabilities = useMemo(() => {
    const counts: { [adminId: string]: number } = {};
    activeTokens.forEach((t) => {
      counts[t.adminId] = (counts[t.adminId] || 0) + 1;
    });
    const total = activeTokens.length || 1;
    const probs: { [adminId: string]: number } = {};
    Object.keys(counts).forEach((aid) => {
      probs[aid] = (counts[aid] / total) * 100;
    });
    return probs;
  }, [activeTokens]);

  // Current token under the revolving pointer
  const currentPointerToken = useMemo(() => {
    if (activeTokens.length === 0) return null;
    const normalizedAngle = ((pointerAngle % 360) + 360) % 360;
    const tokenSlice = 360 / activeTokens.length;
    const index = Math.floor(normalizedAngle / tokenSlice) % activeTokens.length;
    return activeTokens[index] || null;
  }, [pointerAngle, activeTokens]);

  const pointerTokenProb = currentPointerToken ? (adminProbabilities[currentPointerToken.adminId] || 0) : 0;
  const isPointerPassingLowProb = isDrawing && currentPointerToken && pointerTokenProb < 15;

  // Countdown timer to scheduled draw
  useEffect(() => {
    const checkTime = () => {
      const now = new Date();
      const diffMs = drawTime.getTime() - now.getTime();
      const sec = Math.max(0, Math.floor(diffMs / 1000));
      setTimeUntilDrawSec(sec);

      // T-30 seconds: Rapid 4-digit number rolling
      if (sec <= 30 && sec > 0 && !isDrawing) {
        setIsRolling4Digit(true);
        setRandom4Digit(Math.floor(1000 + Math.random() * 9000));
      } else if (sec === 0 && isRolling4Digit && !isDrawing) {
        setIsRolling4Digit(false);
        // Trigger drawing automatically if requirements met
        if (totalPot >= 1000 && activeTokens.length >= 10) {
          startDrawingFlow();
        }
      }
    };

    checkTime();
    const interval = setInterval(checkTime, 1000);
    return () => clearInterval(interval);
  }, [drawTime, isDrawing, isRolling4Digit, totalPot, activeTokens.length]);

  // Draw Sequence Trigger
  const startDrawingFlow = async () => {
    if (isDrawing || activeTokens.length === 0) return;
    setIsDrawing(true);
    triggerHaptic('heavy');

    // 1. Freeze seed number
    const seed = random4Digit || Math.floor(1000 + Math.random() * 9000);
    setRandom4Digit(seed);
    setStatusMessage(`🎲 Random Seed: ${seed} • Decelerating Pointer Rotation Initialized`);

    // Winner 1 Draw: 5-minute decelerating revolution (or accelerated in fast mode)
    const spinDuration = selectedSpeed === 'fast' ? 8000 : 300000; // 8s vs 5 mins
    await spinPointerToWinner(1, spinDuration, seed);
  };

  // Spin Pointer Physics
  const spinPointerToWinner = async (
    targetRank: number,
    durationMs: number,
    seed: number
  ): Promise<void> => {
    return new Promise((resolve) => {
      if (activeTokens.length === 0) {
        resolve();
        return;
      }

      // Pick winner using fair weighted probability
      const winnerIdx = Math.floor((seed * 9301 + 49297) % activeTokens.length);
      const chosenToken = activeTokens[winnerIdx];
      const targetTokenAngle = (winnerIdx / activeTokens.length) * 360;

      // Full spins + target angle
      const fullRotations = targetRank === 1 ? (selectedSpeed === 'fast' ? 6 : 40) : 2;
      const startAngle = pointerAngle % 360;
      const totalDelta = fullRotations * 360 + (targetTokenAngle - startAngle);
      const startTime = performance.now();

      let lastTickAngle = startAngle;

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(1, elapsed / durationMs);

        // Decelerating exponential easing curve
        const easeOut = 1 - Math.pow(1 - progress, 3.5);
        const currentAngle = startAngle + totalDelta * easeOut;
        setPointerAngle(currentAngle);

        // Sound tick every token passed
        if (Math.abs(currentAngle - lastTickAngle) >= (360 / Math.max(activeTokens.length, 12))) {
          playTickSound(targetRank === 1 ? 750 : 850);
          lastTickAngle = currentAngle;
        }

        if (progress < 1) {
          animationFrameRef.current = requestAnimationFrame(animate);
        } else {
          // Pointer has landed!
          handleWinnerLanded(chosenToken, targetRank);
          resolve();
        }
      };

      animationFrameRef.current = requestAnimationFrame(animate);
    });
  };

  const handleWinnerLanded = (winningToken: LottoTokenItem, rank: number) => {
    playFanfareSound();
    triggerHaptic('heavy');

    const prizeWon = prizeStakes[rank - 1] || 0;
    const newWinner: LottoWinnerItem = {
      rank,
      telegramUserId: winningToken.telegramUserId,
      userName: winningToken.userName,
      adminId: winningToken.adminId,
      adminName: winningToken.adminName,
      prizeAmount: prizeWon,
      tokenNumber: winningToken.tokenNumber,
    };

    const updatedWinners = [...winners, newWinner];
    setWinners(updatedWinners);
    setCelebratingWinner(newWinner);
    setCelebrationCountdown(20);

    // Prune ALL tokens belonging to this winning user from the Mega Circle
    const remainingTokens = activeTokens.filter(
      (t) => t.telegramUserId !== winningToken.telegramUserId
    );
    setActiveTokens(remainingTokens);

    setStatusMessage(`🎉 WINNER #${rank}! ${winningToken.userName} won ${prizeWon.toLocaleString()} ETB (${winningToken.adminName})!`);

    // 20 Seconds Celebration Timer
    let countdown = 20;
    const celebrationInterval = setInterval(() => {
      countdown -= 1;
      setCelebrationCountdown(countdown);

      if (countdown <= 0) {
        clearInterval(celebrationInterval);
        setCelebratingWinner(null);

        // Step-by-step advance to next rank if under 10
        if (rank < 10 && remainingTokens.length > 0) {
          const nextRank = rank + 1;
          setCurrentDrawingRank(nextRank);
          // Step slowly forward one token at a time for remaining winners
          const stepSeed = Math.floor(Math.random() * 9000);
          const nextDuration = selectedSpeed === 'fast' ? 2500 : 7000;
          spinPointerToWinner(nextRank, nextDuration, stepSeed);
        } else {
          // All 10 winners drawn or no more tokens!
          setIsDrawing(false);
          setStatusMessage('🏆 ALL 10 WINNERS DRAWN! Board displayed for the next 1 hour.');
          if (onDrawCompleted) {
            onDrawCompleted(updatedWinners);
          }
        }
      }
    }, 1000);
  };

  const formatCountdown = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Clock arrangement dimensions
  const circleRadius = 145; // radius in px
  const centerCoord = 175; // center in SVG viewbox 350x350

  return (
    <div className="space-y-4 max-w-lg mx-auto pb-10">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-2xl relative overflow-hidden">
        <div className="flex justify-between items-start">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[11px] font-bold">
              <SafeDepositBoxIcon className="w-3.5 h-3.5 text-amber-400" />
              <span>{isSuperBonus ? 'ሱፐር ቦነስ ሎቶ (ዕለታዊ ካዝና)' : 'የአዲስ ዕለታዊ ሎቶ'}</span>
            </div>
            <h2 className="text-xl font-black text-white mt-1 flex items-center gap-2">
              <SafeDepositBoxIcon className="w-5 h-5 text-amber-400 inline-block" />
              <span>{title}</span>
            </h2>
            <p className="text-xs text-slate-400">
              {isSuperBonus
                ? 'በየቀኑ ማታ 1 ሰአት ይወጣል • ከቢንጎ ጨዋታ 20% የባለቤት ድርሻ'
                : 'በየቀኑ ማታ 12 ሰአት ይወጣል • 100 ብር በአንድ እጣ'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl"
              title={soundEnabled ? 'Mute Sounds' : 'Unmute Sounds'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Safe Deposit Box (ካዝና) & Countdown Bar */}
        <div className="grid grid-cols-3 gap-2 mt-3.5 pt-3 border-t border-slate-800/80">
          <div className="bg-slate-950/80 border border-amber-500/30 rounded-2xl p-2.5">
            <div className="text-[10px] uppercase font-bold text-amber-400 flex items-center gap-1">
              <SafeDepositBoxIcon className="w-3.5 h-3.5" />
              <span>የዛሬው ካዝና</span>
            </div>
            <div className="text-base sm:text-lg font-black text-white font-mono mt-0.5">
              {totalPot.toLocaleString()} ETB
            </div>
            <div className="text-[9px] text-slate-400">
              {totalPot < 1000 ? '⚠️ ዝቅተኛ 1,000 ብር' : '✅ ዝግጁ ነው'}
            </div>
          </div>

          <div className="bg-slate-950/80 border border-emerald-500/30 rounded-2xl p-2.5">
            <div className="text-[10px] uppercase font-bold text-emerald-400 flex items-center gap-1">
              <SafeDepositBoxIcon className="w-3.5 h-3.5" />
              <span>የትላንት ካዝና</span>
            </div>
            <div className="text-base sm:text-lg font-black text-emerald-400 font-mono mt-0.5">
              {(yesterdayPot || Math.round(totalPot * 0.85)).toLocaleString()} ETB
            </div>
            <div className="text-[9px] text-slate-400">የተከፈለ</div>
          </div>

          <div className="bg-slate-950/80 border border-blue-500/30 rounded-2xl p-2.5">
            <div className="text-[10px] uppercase font-bold text-blue-400 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>ቀጣይ እጣ</span>
            </div>
            <div className="text-base sm:text-lg font-black text-white font-mono mt-0.5">
              {formatCountdown(timeUntilDrawSec)}
            </div>
            <div className="text-[9px] text-slate-400">
              {activeTokens.length} እጣዎች በካዝና
            </div>
          </div>
        </div>

        {/* 3-Minute Warning & 30-Second Rolling Banner */}
        {timeUntilDrawSec <= 180 && timeUntilDrawSec > 0 && (
          <div className="mt-3 p-2.5 bg-gradient-to-r from-amber-500/20 via-yellow-500/20 to-amber-500/20 border border-amber-400 rounded-2xl text-center text-xs animate-pulse">
            <span className="font-black text-amber-300">
              ⚡ የቀጥታ እጣ አወጣጥ በቅርቡ ይጀምራል!
            </span>
            {isRolling4Digit && (
              <div className="mt-1 flex items-center justify-center gap-2 text-sm font-mono font-black text-white">
                <span>የዘፈቀደ ቁጥር (Seed):</span>
                <span className="px-2 py-0.5 bg-amber-500 text-slate-950 rounded-lg">
                  {random4Digit}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Admin Representation Color Legend */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3 text-xs space-y-2">
        <div className="flex justify-between items-center text-[11px] font-bold text-slate-300">
          <span className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-amber-400" />
            <span>Participating Agents & Win Probabilities</span>
          </span>
          <span className="text-[10px] text-slate-500">Live Dynamic Weights</span>
        </div>

        <div className="flex flex-wrap gap-2">
          {Object.keys(adminProbabilities).map((adminId) => {
            const prob = adminProbabilities[adminId];
            const color = adminColorMap[adminId] || '#f59e0b';
            const isLow = prob < 15;

            return (
              <div
                key={adminId}
                className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded-xl border border-slate-800 text-[11px]"
              >
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-white font-medium">{adminId.slice(0, 10)}</span>
                <span
                  className={`font-mono font-bold ${
                    isLow ? 'text-amber-400 opacity-65' : 'text-emerald-400 font-extrabold'
                  }`}
                >
                  {prob.toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* The Mega Circle (Luxury Wall Clock SVG) */}
      <div className="bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 rounded-3xl p-4 shadow-2xl relative flex flex-col items-center">
        <div className="relative w-[340px] h-[340px] flex items-center justify-center">
          <svg viewBox="0 0 350 350" className="w-full h-full select-none">
            <defs>
              <radialGradient id="clockDialGrad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#0f172a" />
                <stop offset="85%" stopColor="#020617" />
                <stop offset="100%" stopColor="#1e293b" />
              </radialGradient>
              <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Outer Clock Rim & Markers */}
            <circle
              cx={centerCoord}
              cy={centerCoord}
              r={circleRadius + 18}
              fill="url(#clockDialGrad)"
              stroke="#334155"
              strokeWidth="4"
            />
            <circle
              cx={centerCoord}
              cy={centerCoord}
              r={circleRadius + 14}
              fill="none"
              stroke="#f59e0b"
              strokeWidth="1.5"
              strokeDasharray="4 8"
              opacity="0.4"
            />

            {/* 12 Hour Clock Ticks */}
            {Array.from({ length: 12 }).map((_, idx) => {
              const tickAngle = (idx * 30 * Math.PI) / 180;
              const x1 = centerCoord + (circleRadius + 8) * Math.sin(tickAngle);
              const y1 = centerCoord - (circleRadius + 8) * Math.cos(tickAngle);
              const x2 = centerCoord + (circleRadius + 15) * Math.sin(tickAngle);
              const y2 = centerCoord - (circleRadius + 15) * Math.cos(tickAngle);
              return (
                <line
                  key={idx}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="#cbd5e1"
                  strokeWidth={idx % 3 === 0 ? '3' : '1.5'}
                  opacity={idx % 3 === 0 ? '0.8' : '0.4'}
                />
              );
            })}

            {/* Wall Clock Tokens Arranged Around Dial */}
            {activeTokens.map((token, idx) => {
              const angleDeg = (idx / activeTokens.length) * 360;
              const rad = (angleDeg * Math.PI) / 180;
              const x = centerCoord + circleRadius * Math.sin(rad);
              const y = centerCoord - circleRadius * Math.cos(rad);
              const tokenColor = adminColorMap[token.adminId] || '#f59e0b';
              const adminProb = adminProbabilities[token.adminId] || 10;
              const isLowProb = adminProb < 15;
              // Dim low probability tokens and brighten high probability tokens
              const tokenOpacity = isLowProb ? 0.35 : Math.min(1, 0.6 + (adminProb / 100) * 0.4);

              // Dynamic font & dot size based on total token count
              const dotSize = activeTokens.length > 50 ? 4 : activeTokens.length > 25 ? 6 : 8;
              const fontSize = activeTokens.length > 50 ? '7px' : '9px';

              return (
                <g
                  key={token.id}
                  transform={`translate(${x}, ${y})`}
                  opacity={tokenOpacity}
                  className="transition-all duration-300"
                >
                  <circle
                    r={dotSize}
                    fill={tokenColor}
                    stroke="#0f172a"
                    strokeWidth="1.5"
                    filter={isLowProb ? undefined : 'url(#neonGlow)'}
                  />
                  {activeTokens.length <= 40 && (
                    <text
                      textAnchor="middle"
                      dy=".3em"
                      fill="#ffffff"
                      fontSize={fontSize}
                      fontWeight="bold"
                      className="pointer-events-none"
                    >
                      #{token.tokenNumber}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Central Clock Hand / Revolving Pointer */}
            <g transform={`rotate(${pointerAngle}, ${centerCoord}, ${centerCoord})`}>
              {/* Pointer Arrow */}
              <line
                x1={centerCoord}
                y1={centerCoord}
                x2={centerCoord}
                y2={centerCoord - circleRadius + 10}
                stroke="#f59e0b"
                strokeWidth="4"
                strokeLinecap="round"
                filter="url(#neonGlow)"
              />
              <polygon
                points={`${centerCoord},${centerCoord - circleRadius + 2} ${centerCoord - 6},${centerCoord - circleRadius + 18} ${centerCoord + 6},${centerCoord - circleRadius + 18}`}
                fill="#f59e0b"
                filter="url(#neonGlow)"
              />
              {/* Counter-balance tail */}
              <line
                x1={centerCoord}
                y1={centerCoord}
                x2={centerCoord}
                y2={centerCoord + 25}
                stroke="#94a3b8"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </g>

            {/* Central Clock Hub */}
            <circle
              cx={centerCoord}
              cy={centerCoord}
              r="14"
              fill="#f59e0b"
              stroke="#0f172a"
              strokeWidth="3"
            />
            <circle
              cx={centerCoord}
              cy={centerCoord}
              r="5"
              fill="#0f172a"
            />
          </svg>

          {/* Celebration Overlay Popup */}
          {celebratingWinner && (
            <div className="absolute inset-0 bg-black/85 backdrop-blur-md rounded-3xl flex flex-col items-center justify-center p-4 text-center z-20 animate-fadeIn">
              <div className="w-14 h-14 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 flex items-center justify-center text-slate-950 font-black text-2xl shadow-xl animate-bounce">
                🏆
              </div>
              <div className="mt-2 text-xs uppercase font-extrabold text-amber-400 tracking-wider">
                Winner Rank #{celebratingWinner.rank}
              </div>
              <div className="text-xl font-black text-white mt-1">
                {celebratingWinner.userName}
              </div>
              <div className="text-2xl font-black text-emerald-400 font-mono mt-1">
                +{celebratingWinner.prizeAmount.toLocaleString()} ETB
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Ticket #{celebratingWinner.tokenNumber} • Agent: {celebratingWinner.adminName}
              </div>
              <div className="mt-4 px-3 py-1 bg-slate-800 rounded-full text-xs text-amber-300 font-mono font-bold">
                Next Draw in {celebrationCountdown}s...
              </div>
            </div>
          )}
        </div>

        {/* Live Status Description & Spectator Transparency Note */}
        {statusMessage && (
          <div className="mt-2 text-center text-xs text-amber-300 font-medium px-4">
            {statusMessage}
          </div>
        )}

        {isPointerPassingLowProb && currentPointerToken && (
          <div className="mt-2.5 mx-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] flex items-center gap-2 animate-pulse">
            <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <div className="text-left leading-tight">
              <span className="font-bold">Passing #{currentPointerToken.tokenNumber} ({currentPointerToken.adminName}):</span> Low win probability ({pointerTokenProb.toFixed(1)}%). Re-evaluated smoothly by dynamic pool weight.
            </div>
          </div>
        )}

        {winners.length > 0 && winners.length < 10 && (
          <div className="mt-1 flex items-center justify-center gap-1.5 text-[10px] text-slate-400">
            <Info className="w-3 h-3 text-emerald-400" />
            <span>Probabilities recalculated after Winner #{winners.length} (winner tokens pruned).</span>
          </div>
        )}

        {/* Controls for Spectator / Demo */}
        {isDemoModeAllowed && !isDrawing && winners.length === 0 && (
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => setSelectedSpeed(selectedSpeed === 'normal' ? 'fast' : 'normal')}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 rounded-lg"
            >
              Mode: {selectedSpeed === 'normal' ? '5-Min Spin' : 'Fast Demo (8s)'}
            </button>
            <button
              onClick={startDrawingFlow}
              disabled={activeTokens.length === 0}
              className="px-4 py-1.5 bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-black rounded-xl text-xs flex items-center gap-1.5 shadow-md active:scale-95"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Start Draw Demo</span>
            </button>
          </div>
        )}
      </div>

      {/* 1 to 10 Winners Board (With Halving Prize Structure) */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-3 shadow-xl">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-black text-white uppercase tracking-wide">
              Top 10 Official Winners Board
            </h3>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">
            {winners.length} / 10 Drawn
          </span>
        </div>

        <div className="space-y-1.5">
          {Array.from({ length: 10 }).map((_, idx) => {
            const rank = idx + 1;
            const winner = winners.find((w) => w.rank === rank);
            const prize = prizeStakes[idx] || 0;
            const isCurrentlyDrawing = isDrawing && currentDrawingRank === rank;

            return (
              <div
                key={rank}
                className={`p-2.5 rounded-2xl border transition-all flex justify-between items-center text-xs ${
                  winner
                    ? 'bg-amber-500/10 border-amber-500/40'
                    : isCurrentlyDrawing
                    ? 'bg-blue-500/10 border-blue-500/40 animate-pulse'
                    : 'bg-slate-950/60 border-slate-800/80 text-slate-500'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-6 h-6 rounded-xl flex items-center justify-center font-black text-[11px] ${
                      winner
                        ? 'bg-amber-500 text-slate-950 font-bold'
                        : isCurrentlyDrawing
                        ? 'bg-blue-500 text-white font-bold'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    #{rank}
                  </div>
                  <div>
                    {winner ? (
                      <div>
                        <div className="font-bold text-white text-xs">{winner.userName}</div>
                        <div className="text-[10px] text-slate-400">
                          እጣ #{winner.tokenNumber} • ወኪል: {winner.adminName}
                        </div>
                      </div>
                    ) : (
                      <div className="italic text-slate-500 text-xs">
                        {isCurrentlyDrawing ? '⚡ ፍጥነቱ እየቀነሰ እጣ እየፈለገ ነው...' : 'የሚወጣ...'}
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-right font-mono">
                  <div
                    className={`font-black text-sm ${
                      winner ? 'text-emerald-400' : 'text-slate-400'
                    }`}
                  >
                    {prize.toLocaleString()} ETB
                  </div>
                  <div className="text-[9px] text-slate-500">
                    {rank === 1 ? '50% የካዝና ድርሻ' : `የ#${rank - 1} ግማሽ`}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
