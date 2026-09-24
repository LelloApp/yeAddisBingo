import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Sparkles,
  Trophy,
  Clock,
  Users,
  Volume2,
  VolumeX,
  Play,
  AlertCircle,
  Info,
  ChevronDown,
  ChevronUp,
  Square,
  Moon,
  Compass,
  CheckCircle2,
} from 'lucide-react';
import { triggerHaptic } from '../utils/telegram';
import {
  getEarthMoonDistanceInfo,
  getActiveDistanceSlice,
  buildDistanceInfoFromMeters,
  syncServerCosmicSeed,
  calculateEarthMoonDistanceMeters,
  LunarDistanceInfo,
  ActiveDistanceSlice,
} from '../utils/lunarDistance';

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
  roundId?: string;
  serverSeed?: number; // Single authoritative 9-digit distance constant from server
  onDrawCompleted?: (winners: LottoWinnerItem[]) => void;
  savedWinners?: LottoWinnerItem[];
  isDemoModeAllowed?: boolean;
}

// 10 Distinct luxury colors for participating አጫዋቾች
const ADMIN_COLORS = [
  '#06b6d4', // Cyan
  '#10b981', // Emerald
  '#8b5cf6', // Purple
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#3b82f6', // Blue
  '#eab308', // Yellow
  '#14b8a6', // Teal
  '#f97316', // Orange
  '#a855f7', // Violet
];

// Halving prize percentages for 10 ranks
const RANK_PERCENTAGES = [
  0.50,          // Rank 1: 50%
  0.25,          // Rank 2: 25%
  0.125,         // Rank 3: 12.5%
  0.0625,        // Rank 4: 6.25%
  0.03125,       // Rank 5: 3.125%
  0.015625,      // Rank 6: 1.5625%
  0.0078125,     // Rank 7: 0.78125%
  0.00390625,    // Rank 8: 0.390625%
  0.001953125,   // Rank 9: 0.1953125%
  0.0009765625,  // Rank 10: 0.09765625%
];

export const MegaCircleLotto: React.FC<MegaCircleLottoProps> = ({
  title,
  tokens,
  totalPot,
  yesterdayPot = 0,
  drawTime,
  isSuperBonus = false,
  roundId,
  serverSeed,
  onDrawCompleted,
  savedWinners = [],
  isDemoModeAllowed = true,
}) => {
  const [activeTokens, setActiveTokens] = useState<LottoTokenItem[]>(tokens);
  const [winners, setWinners] = useState<LottoWinnerItem[]>(savedWinners);
  const [pointerAngle, setPointerAngle] = useState<number>(0);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [isDemoRunning, setIsDemoRunning] = useState<boolean>(false);
  const [isInFinalInspection, setIsInFinalInspection] = useState<boolean>(false);
  const [currentDrawingRank, setCurrentDrawingRank] = useState<number>(1);
  const [celebratingWinner, setCelebratingWinner] = useState<LottoWinnerItem | null>(null);
  const [celebrationCountdown, setCelebrationCountdown] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [timeUntilDrawSec, setTimeUntilDrawSec] = useState<number>(3600);
  const [isRulesExpanded, setIsRulesExpanded] = useState<boolean>(false);

  // Real-time Earth-Moon Distance state (9-digit meter constant)
  const [distanceInfo, setDistanceInfo] = useState<LunarDistanceInfo>(() => getEarthMoonDistanceInfo());

  // Step Counter & 360-degree Revolution Counter
  const [revolutionCount, setRevolutionCount] = useState<number>(0); // ዙር
  const [countdownStep, setCountdownStep] = useState<number>(0); // እጣ ቁጥር

  // Fair Share Quota tracking ("የአጫዋች ድርሻ / Cup is Full" state)
  const [adminAccumulatedShare, setAdminAccumulatedShare] = useState<{ [adminId: string]: number }>({});
  const [retiredAdmins, setRetiredAdmins] = useState<string[]>([]);
  const [initialAdminQuotas, setInitialAdminQuotas] = useState<{ [adminId: string]: number }>({});

  const audioCtxRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isCancelledRef = useRef<boolean>(false);
  const serverFrozenSeedRef = useRef<number | null>(null);
  const lastSyncCheckRef = useRef<number>(0);

  // Sync incoming tokens
  useEffect(() => {
    if (!isDrawing && winners.length === 0 && !isDemoRunning) {
      setActiveTokens(tokens);
    }
  }, [tokens, isDrawing, winners.length, isDemoRunning]);

  // Compute Initial Fair Share Quotas whenever a fresh token batch arrives
  useEffect(() => {
    const counts: { [aid: string]: number } = {};
    const baseTokens = activeTokens.length > 0 ? activeTokens : tokens;
    baseTokens.forEach((t) => {
      counts[t.adminId] = (counts[t.adminId] || 0) + 1;
    });
    const total = baseTokens.length || 1;
    const quotas: { [aid: string]: number } = {};
    Object.keys(counts).forEach((aid) => {
      quotas[aid] = Math.round((counts[aid] / total) * 100);
    });
    setInitialAdminQuotas(quotas);
  }, [tokens.length]);

  // 10-Winner Halving Prize Formula
  const prizeStakes = useMemo(() => {
    return RANK_PERCENTAGES.map((pct) => Math.floor(totalPot * pct));
  }, [totalPot]);

  // Color Mapping for participating አጫዋቾች
  const adminColorMap = useMemo(() => {
    const map: { [adminId: string]: string } = {};
    let colorIdx = 0;
    activeTokens.forEach((t) => {
      if (!map[t.adminId]) {
        map[t.adminId] = t.adminColor || ADMIN_COLORS[colorIdx % ADMIN_COLORS.length];
        colorIdx++;
      }
    });
    return map;
  }, [activeTokens]);

  // Live Token Weight Percentages for participating አጫዋቾች
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

  // Active distance slice based on current active tokens count
  const activeDistanceSlice: ActiveDistanceSlice = useMemo(() => {
    return getActiveDistanceSlice(distanceInfo, activeTokens.length);
  }, [distanceInfo, activeTokens.length]);

  // If server has already locked a cosmic seed for this round, adopt it immediately!
  useEffect(() => {
    if (serverSeed && serverSeed > 0) {
      serverFrozenSeedRef.current = serverSeed;
      setDistanceInfo(buildDistanceInfoFromMeters(serverSeed, 'scheduled-freeze'));
    }
  }, [serverSeed]);

  // Is seed locked: true if server committed seed, or drawing started, or draw time reached, or winners exist
  const isSeedLocked = !!(
    serverSeed ||
    serverFrozenSeedRef.current ||
    isDrawing ||
    timeUntilDrawSec === 0 ||
    winners.length > 0
  );

  // Real-time Local Earth-Moon Distance Projection + Scheduled Server Discrepancy Checks
  // - Changes LIVE smoothly on UI every second with ZERO DB reads and ZERO network spam
  // - Discrepancy checks at designated checkpoints (hourly, 5min in last hr, 5s in last min)
  // - Once locked by server or draw start, the EXACT SAME 9-digit constant is kept until all 10 winners are drawn!
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const diffMs = drawTime.getTime() - now.getTime();
      const sec = Math.max(0, Math.floor(diffMs / 1000));
      setTimeUntilDrawSec(sec);

      // Local continuous live projection in memory (0 DB / 0 network calls!)
      // ONLY updates live if draw time has not passed and seed is NOT locked!
      if (sec > 0 && !isDrawing && !serverFrozenSeedRef.current && !serverSeed) {
        setDistanceInfo(getEarthMoonDistanceInfo(now));
      }

      // Checkpoint Discrepancy Schedule:
      // Hourly if > 1 hour, every 5 min if in last hour, every 5s if in last minute
      let checkIntervalMs = 3600000;
      if (sec <= 60 && sec > 0) {
        checkIntervalMs = 5000;
      } else if (sec <= 3600 && sec > 0) {
        checkIntervalMs = 300000;
      }

      const nowMs = now.getTime();
      if (
        roundId &&
        !serverFrozenSeedRef.current &&
        !serverSeed &&
        (nowMs - lastSyncCheckRef.current >= checkIntervalMs || sec === 0)
      ) {
        lastSyncCheckRef.current = nowMs;
        syncServerCosmicSeed({
          roundId,
          isSuperBonus,
          localSeed: calculateEarthMoonDistanceMeters(now),
        })
          .then(({ seed, source }) => {
            if (source === 'server-authority') {
              serverFrozenSeedRef.current = seed;
              setDistanceInfo(buildDistanceInfoFromMeters(seed, 'scheduled-freeze'));
            }
          })
          .catch(() => {
            // Silently fallback to locally calculated Meeus value
          });
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [drawTime, isDrawing, roundId, isSuperBonus, serverSeed]);

  // Sound Synthesizer (Ticks & Fanfare)
  const playTickSound = (freq = 900) => {
    if (!soundEnabled) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.04);
    } catch {
      // Audio fallback
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
        gain.gain.setValueAtTime(0.09, ctx.currentTime + idx * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.1 + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + idx * 0.1);
        osc.stop(ctx.currentTime + idx * 0.1 + 0.35);
      });
    } catch {
      // Audio fallback
    }
  };

  // Generate realistic sample tokens across 6 አጫዋቾች for live demonstration
  const generateDemoTokens = (): LottoTokenItem[] => {
    const sampleAdmins = [
      { id: 'adm-1', name: 'ፓርሴሊክ (Parcelic)', color: '#06b6d4' },
      { id: 'adm-2', name: 'ፍቃዱ ቄራ (Fekadu Kera)', color: '#10b981' },
      { id: 'adm-3', name: 'ሀሰን ስታዲየም (Hasen)', color: '#8b5cf6' },
      { id: 'adm-4', name: 'አበበ ቦሌ (Abebe Bole)', color: '#f59e0b' },
      { id: 'adm-5', name: 'ሰላም መገናኛ (Selam)', color: '#ec4899' },
      { id: 'adm-6', name: 'ዳዊት ፒያሳ (Dawit)', color: '#3b82f6' },
    ];
    const sampleUsers = [
      'ዳዊት ተ.', 'ሰላማዊት ከ.', 'ዮናስ መ.', 'ቤተልሔም አ.', 'ኪዱስ ባ.',
      'አልማዝ ገ.', 'ኤፍሬም ደ.', 'ሃና ወ.', 'ቢንያም ሲ.', 'ሜሮን ፈ.',
      'ቴዎድሮስ ሃ.', 'ራሄል ተ.', 'ናሆም ዛ.', 'ህይወት ማ.', 'ኤርሚያስ ላ.'
    ];
    const list: LottoTokenItem[] = [];
    let tokenNo = 1001;
    for (let i = 0; i < 68; i++) {
      const adm = sampleAdmins[i % sampleAdmins.length];
      const uIdx = (i * 7) % sampleUsers.length;
      list.push({
        id: `demo-token-${i}`,
        tokenNumber: tokenNo++,
        telegramUserId: 100000 + uIdx,
        userName: sampleUsers[uIdx],
        adminId: adm.id,
        adminName: adm.name,
        adminColor: adm.color,
        createdAt: new Date().toISOString(),
      });
    }
    return list;
  };

  // Start Demo Draw
  const startDemoDrawing = () => {
    if (isDrawing) return;
    isCancelledRef.current = false;
    setIsDemoRunning(true);

    let pool = activeTokens;
    if (pool.length < 15) {
      pool = generateDemoTokens();
      setActiveTokens(pool);
    }

    // Reset quotas and prize share for fresh educational sequence
    const counts: { [aid: string]: number } = {};
    pool.forEach((t) => {
      counts[t.adminId] = (counts[t.adminId] || 0) + 1;
    });
    const total = pool.length || 1;
    const quotas: { [aid: string]: number } = {};
    Object.keys(counts).forEach((aid) => {
      quotas[aid] = Math.round((counts[aid] / total) * 100);
    });
    setInitialAdminQuotas(quotas);
    setAdminAccumulatedShare({});
    setRetiredAdmins([]);
    setWinners([]);
    setCelebratingWinner(null);

    startDrawingFlow(true, pool);
  };

  // Stop Demo & Reset to Normal Clean Window
  const handleStopDemo = () => {
    isCancelledRef.current = true;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setIsDrawing(false);
    setIsDemoRunning(false);
    setIsInFinalInspection(false);
    setCelebratingWinner(null);
    setWinners(savedWinners);
    setActiveTokens(tokens);
    setCountdownStep(0);
    setRevolutionCount(0);
    setPointerAngle(0);
    setStatusMessage('');
    triggerHaptic('light');
  };

  // Main Drawing Sequence Trigger
  const startDrawingFlow = async (isDemo = false, poolOverride?: LottoTokenItem[]) => {
    const pool = poolOverride || activeTokens;
    if (isDrawing || pool.length === 0) return;
    setIsDrawing(true);
    triggerHaptic('heavy');

    let currentSeedInfo = distanceInfo;
    // For official live draw, ensure single source of truth from server
    if (!isDemo && roundId) {
      try {
        const { seed } = await syncServerCosmicSeed({
          roundId,
          isSuperBonus,
          localSeed: distanceInfo.distanceMeters,
        });
        serverFrozenSeedRef.current = seed;
        currentSeedInfo = buildDistanceInfoFromMeters(seed, 'scheduled-freeze');
        setDistanceInfo(currentSeedInfo);
      } catch {
        // Local fallback
      }
    } else if (isDemo) {
      // In demo mode, freeze the current distance so it stays constant throughout the demo
      serverFrozenSeedRef.current = distanceInfo.distanceMeters;
    }

    const slice = getActiveDistanceSlice(currentSeedInfo, pool.length);
    const stepsCount = slice.sliceValue;

    setStatusMessage(
      `🌌 ቋሚ የጨረቃ ርቀት ቁጥር: ${slice.highlightedSuffix} ሜትር (${slice.activeDigitCount} ዲጂቶች) • የእጣ ማውጣት ሂደት ተጀምሯል!`
    );

    await spinPointerToWinner(1, stepsCount, isDemo, pool);
  };

  // Spin Pointer Physics driven token-by-token by Earth-Moon distance seed
  // ALL 10 WINNERS (እድለኞች / አሸናፊዎች) follow the EXACT SAME drawing steps!
  // - Drawing duration per winner: ~20s - 50s (strictly capped under 3 minutes max)
  // - Early cruise rounds: ~1.5s per revolution (easy and comfortable to watch)
  // - The last 2 rounds (revolutions) decelerate smoothly for close token-by-token inspection
  // - The last 2 rounds never exceed 60s (capped at 50s max; 1 token/sec if few tokens)
  // - Live ዙር & እጣ ቁጥር counters update synchronously
  const spinPointerToWinner = async (
    targetRank: number,
    totalSteps: number,
    isDemo = false,
    pool: LottoTokenItem[] = activeTokens
  ): Promise<void> => {
    return new Promise((resolve) => {
      if (pool.length === 0 || isCancelledRef.current) {
        resolve();
        return;
      }

      const N = pool.length;
      // Exact winner landing index based on total distance steps
      const winnerIdx = totalSteps % N;
      const chosenToken = pool[winnerIdx];

      // Exact uniform structure for ALL 10 ranks:
      // 3 Early cruise rounds + 2 last slower inspection rounds = 5 total rounds
      const earlyRounds = isDemo ? 2 : 3;
      const lastRounds = 2; // Exactly 2 full rounds for final token-by-token inspection
      const totalRounds = earlyRounds + lastRounds;

      const targetTokenAngle = (winnerIdx / N) * 360;
      const startAngle = pointerAngle;
      const earlyAngleDelta = earlyRounds * 360;
      const currentStartNorm = ((startAngle % 360) + 360) % 360;
      const landingOffsetAngle = (targetTokenAngle - currentStartNorm + 360) % 360;
      const last2AngleDelta = lastRounds * 360 + landingOffsetAngle;
      const totalAngleDelta = earlyAngleDelta + last2AngleDelta;

      // CALIBRATED DURATION & SPEED LIMITS:
      // 1. Last 2 rounds:
      //    - If tokens are few (<= 25): paced at 1 token/sec (takes 2 * N * 1s <= 50s, never exceeds 1 min).
      //    - If tokens are many (> 25): paced at ~350ms per token, clamped to max 50 seconds (<= 60s).
      // 2. Early cruise rounds:
      //    - Fast enough to build anticipation, slow enough to clearly observe sectors (~1.5s per revolution).
      // 3. Entire winner drawing:
      //    - Strictly finishes in ~20-55s (well below 3 minutes max).
      const tokensInLast2Rounds = N * 2;
      const last2RoundsDurationMs = isDemo
        ? 8000
        : Math.min(50000, Math.max(14000, tokensInLast2Rounds * (N <= 25 ? 1000 : 350)));

      const earlyDurationMs = isDemo ? 2500 : 4500;
      const totalDurationMs = earlyDurationMs + last2RoundsDurationMs;

      const startTime = performance.now();
      let lastStepTicked = -1;

      const animate = (currentTime: number) => {
        if (isCancelledRef.current) {
          resolve();
          return;
        }

        const elapsed = currentTime - startTime;
        let currentAngle = startAngle;
        let isLast2Phase = false;
        let roundsRemaining = totalRounds;

        if (elapsed < earlyDurationMs) {
          // PHASE 1: Early Cruise Rounds (Smooth progressive rotation)
          const p1 = elapsed / earlyDurationMs;
          const ease1 = Math.sin((p1 * Math.PI) / 2);
          currentAngle = startAngle + earlyAngleDelta * ease1;

          const angleTraversed = currentAngle - startAngle;
          roundsRemaining = Math.max(2, Math.ceil((totalAngleDelta - angleTraversed) / 360));
          setIsInFinalInspection(false);
        } else {
          // PHASE 2: The Last 2 Rounds (Slower with authentic mechanical inertia)
          isLast2Phase = true;
          setIsInFinalInspection(true);
          const elapsed2 = Math.min(last2RoundsDurationMs, elapsed - earlyDurationMs);
          const p2 = elapsed2 / last2RoundsDurationMs;
          // Decelerating power curve: slows down dramatically near the end
          const ease2 = 1 - Math.pow(1 - p2, 2.8);
          currentAngle = startAngle + earlyAngleDelta + last2AngleDelta * ease2;

          const angleTraversed = currentAngle - startAngle;
          roundsRemaining = Math.max(0, Math.ceil((totalAngleDelta - angleTraversed) / 360));
        }

        setPointerAngle(currentAngle);
        setRevolutionCount(roundsRemaining);

        // Step-by-step distance countdown down to 0
        const progressOverall = Math.min(1, elapsed / totalDurationMs);
        const stepsRemaining = Math.max(0, Math.round(totalSteps * (1 - Math.pow(progressOverall, 1.8))));
        setCountdownStep(stepsRemaining);

        // Play ticker audio on each token step (crisp and slower during last 2 rounds)
        if (stepsRemaining !== lastStepTicked) {
          playTickSound(isLast2Phase ? 720 : 880);
          lastStepTicked = stepsRemaining;
        }

        if (elapsed < totalDurationMs) {
          animationFrameRef.current = requestAnimationFrame(animate);
        } else {
          // Lands precisely at countdownStep = 0!
          setCountdownStep(0);
          setRevolutionCount(0);
          setIsInFinalInspection(false);
          handleWinnerLanded(chosenToken, targetRank, isDemo, pool);
          resolve();
        }
      };

      animationFrameRef.current = requestAnimationFrame(animate);
    });
  };

  // Winner Landed Handler with Fair Share Quota ("Cup is Full") Evaluation
  const handleWinnerLanded = (
    winningToken: LottoTokenItem,
    rank: number,
    isDemo = false,
    pool: LottoTokenItem[] = activeTokens
  ) => {
    if (isCancelledRef.current) return;
    playFanfareSound();
    triggerHaptic('heavy');

    const prizeWon = prizeStakes[rank - 1] || 0;
    const rankPct = (RANK_PERCENTAGES[rank - 1] || 0) * 100;
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

    // 1. Remove ALL tokens of this winning user
    let remainingTokens = pool.filter(
      (t) => t.telegramUserId !== winningToken.telegramUserId
    );

    // 2. Update winning አጫዋች's accumulated prize share
    const adminId = winningToken.adminId;
    const currentAccum = (adminAccumulatedShare[adminId] || 0) + rankPct;
    const newAccumShares = { ...adminAccumulatedShare, [adminId]: currentAccum };
    setAdminAccumulatedShare(newAccumShares);

    const adminQuota = initialAdminQuotas[adminId] || 20;
    let quotaRetiredNotice = '';

    // 3. Fair Share Quota Check ("Cup is Full")
    // If accumulated prize % reaches or exceeds initial quota, permanently retire all remaining tokens of this admin!
    if (currentAccum >= adminQuota && !retiredAdmins.includes(adminId)) {
      const newlyRetired = [...retiredAdmins, adminId];
      setRetiredAdmins(newlyRetired);

      // Check safety: don't retire if it would leave 0 tokens on the wheel
      const tokensAfterRetire = remainingTokens.filter((t) => t.adminId !== adminId);
      if (tokensAfterRetire.length > 0) {
        remainingTokens = tokensAfterRetire;
        quotaRetiredNotice = ` • 🛑 አጫዋች ${winningToken.adminName} የዛሬውን ፍትሃዊ ድርሻ (${currentAccum}% / ${adminQuota}%) ሙሉ በሙሉ ስላገኘ፣ የቀሩት እጣዎቹ ከዛሬው ጨዋታ ተሰናብተዋል!`;
      }
    }

    setActiveTokens(remainingTokens);

    setStatusMessage(
      `🎉 #${rank}ኛ እድለኛ / አሸናፊ! ${winningToken.userName} ${prizeWon.toLocaleString()} ETB አሸንፈዋል (አጫዋች: ${winningToken.adminName})${quotaRetiredNotice}`
    );

    // Fallback: If no more tokens remain before rank 10, redistribute remainder proportionally to drawn winners
    if (remainingTokens.length === 0 && rank < 10) {
      const undistributedPot = prizeStakes.slice(rank).reduce((a, b) => a + b, 0);
      if (undistributedPot > 0 && updatedWinners.length > 0) {
        const totalCurrent = updatedWinners.reduce((a, w) => a + w.prizeAmount, 0) || 1;
        const redistributed = updatedWinners.map((w) => ({
          ...w,
          prizeAmount: Math.round(w.prizeAmount + (w.prizeAmount / totalCurrent) * undistributedPot),
        }));
        setWinners(redistributed);
        setIsDrawing(false);
        setIsDemoRunning(false);
        setStatusMessage(
          `🏆 ሁሉም እጣዎች ተጠናቀዋል! የቀረው ካዝና (${undistributedPot.toLocaleString()} ETB) ለእድለኞች / አሸናፊዎች ተከፋፍሏል!`
        );
        if (onDrawCompleted) onDrawCompleted(redistributed);
        return;
      }
    }

    // Celebration Timer: 4s in demo mode, 18s in live mode
    let countdown = isDemo ? 4 : 18;
    setCelebrationCountdown(countdown);
    const celebrationInterval = setInterval(() => {
      if (isCancelledRef.current) {
        clearInterval(celebrationInterval);
        return;
      }

      countdown -= 1;
      setCelebrationCountdown(countdown);

      if (countdown <= 0) {
        clearInterval(celebrationInterval);
        setCelebratingWinner(null);

        // Advance to next rank if under 10 and tokens remain
        if (rank < 10 && remainingTokens.length > 0) {
          const nextRank = rank + 1;
          setCurrentDrawingRank(nextRank);
          // Re-slice distance constant for the new remaining token count
          const nextSlice = getActiveDistanceSlice(distanceInfo, remainingTokens.length);
          spinPointerToWinner(nextRank, nextSlice.sliceValue, isDemo, remainingTokens);
        } else {
          // All 10 winners drawn!
          setIsDrawing(false);
          setIsDemoRunning(false);
          setStatusMessage('🏆 ሁሉም 10 እድለኞች / አሸናፊዎች ወጥተዋል! ይፋዊው ውጤት በቦርዱ ላይ ይቆያል።');
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

  // Dimensions for SVG Wheel Layout
  const circleRadius = 145;
  const centerCoord = 175;

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
              title={soundEnabled ? 'ድምፅ አጥፋ' : 'ድምፅ ክፈት'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* 9-Digit Earth-Moon Distance Cosmic Seed Display */}
        <div className="mt-3.5 pt-3 border-t border-slate-800/80 bg-slate-950/70 p-3 rounded-2xl border border-slate-800">
          <div className="flex justify-between items-center text-xs">
            <div className="flex items-center gap-1.5 text-amber-400 font-bold">
              <Moon className="w-4 h-4 text-cyan-400" />
              <span>የእጣ ማውጫ የጨረቃና የምድር ርቀት (9 ዲጂት):</span>
            </div>
            <span className="text-[10px] font-mono flex items-center gap-1">
              {isSeedLocked ? (
                <span className="text-amber-300 bg-amber-500/20 px-2.5 py-0.5 rounded-full border border-amber-500/40 font-bold flex items-center gap-1">
                  <span>🔒 ቋሚ የእጣ ማውጫ ርቀት</span>
                </span>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                  <span className="text-emerald-400 font-semibold">🟢 የቀጥታ ቆጣሪ (Live)</span>
                </>
              )}
            </span>
          </div>

          <div className="mt-1.5 flex items-baseline justify-between">
            <div className="text-lg sm:text-xl font-mono tracking-wider font-black text-slate-300">
              <span>{activeDistanceSlice.unhighlightedPrefix}</span>
              <span className="text-amber-300 bg-amber-500/25 px-1.5 py-0.5 rounded-lg border border-amber-400 font-extrabold shadow-sm">
                {activeDistanceSlice.highlightedSuffix}
              </span>
              <span className="text-xs font-semibold text-slate-400 ml-1">ሜትር</span>
            </div>
            <div className="text-[11px] text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
              {activeDistanceSlice.activeDigitCount} ዲጂት ({activeTokens.length} እጣዎች)
            </div>
          </div>

          <div className="mt-1.5 text-[10px] text-slate-400 leading-normal border-t border-slate-800/60 pt-1.5">
            {isSeedLocked
              ? '🔒 ይህ ይፋዊ የ 9 ዲጂት የርቀት ቁጥር 10ሩም እድለኞች / አሸናፊዎች እስኪወጡ ድረስ ለሁሉም ተመልካቾች ቋሚ ሆኖ ይቆያል።'
              : 'ℹ️ እጣ ማውጣት ሲጀመር ይህ ቁጥር በቋሚነት ተቆልፎ ለ 10ሩም እድለኞች / አሸናፊዎች ያገለግላል።'}
          </div>
        </div>

        {/* Safe Deposit Box (ካዝና) & Countdown Bar */}
        <div className="grid grid-cols-3 gap-2 mt-3">
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
              <Trophy className="w-3 h-3" />
              <span>እድለኞች / አሸናፊዎች</span>
            </div>
            <div className="text-base sm:text-lg font-black text-white font-mono mt-0.5">
              {winners.length}/10
            </div>
            <div className="text-[9px] text-slate-400">የተገኙ</div>
          </div>

          <div className="bg-slate-950/80 border border-blue-500/30 rounded-2xl p-2.5">
            <div className="text-[10px] uppercase font-bold text-blue-400 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>እጣ ማውጣት ሰዓት</span>
            </div>
            <div className="text-base sm:text-lg font-black text-white font-mono mt-0.5">
              {formatCountdown(timeUntilDrawSec)}
            </div>
            <div className="text-[9px] text-slate-400">
              {activeTokens.length} እጣዎች በክቡ ላይ
            </div>
          </div>
        </div>
      </div>

      {/* Participating አጫዋቾች Fair Share Quota Gauges */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3 text-xs space-y-2.5">
        <div className="flex justify-between items-center text-[11px] font-bold text-slate-300">
          <span className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-amber-400" />
            <span>ተሳታፊ አጫዋቾችና ፍትሃዊ የካዝና ድርሻ (Fair Share Quota)</span>
          </span>
          <span className="text-[10px] text-slate-400">ኩባያ ሲሞላ ይሰናበታል</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {Object.keys(initialAdminQuotas).map((adminId) => {
            const quota = initialAdminQuotas[adminId] || 20;
            const accum = adminAccumulatedShare[adminId] || 0;
            const color = adminColorMap[adminId] || '#f59e0b';
            const isFull = accum >= quota;
            const token = activeTokens.find((t) => t.adminId === adminId) || tokens.find((t) => t.adminId === adminId);
            const adminName = token?.adminName || adminId.slice(0, 10);
            const fillRatio = Math.min(100, (accum / quota) * 100);

            return (
              <div
                key={adminId}
                className={`p-2.5 rounded-xl border text-[11px] space-y-1.5 ${
                  isFull
                    ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                    : 'bg-slate-950 border-slate-800 text-slate-300'
                }`}
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                    <span className="font-bold text-white truncate max-w-[120px]">{adminName}</span>
                  </div>
                  <span className="font-mono text-[10px] font-bold">
                    {isFull ? (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 inline" />
                        <span>ኩባያው ሞልቷል ({accum}%)</span>
                      </span>
                    ) : (
                      <span>{accum}% / {quota}%</span>
                    )}
                  </span>
                </div>

                {/* Cup Fill Progress Bar */}
                <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden border border-slate-800">
                  <div
                    style={{ width: `${fillRatio}%`, backgroundColor: isFull ? '#10b981' : color }}
                    className="h-full rounded-full transition-all duration-500"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* The Mega Circle (3D Wooden Casino Wheel with Black & White Roulette Sectors) */}
      <div className="bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 rounded-3xl p-4 shadow-2xl relative flex flex-col items-center">
        {/* Live Revolver Counters Bar (ዙር & እጣ ቁጥር & የመጨረሻ 2 ዙሮች) */}
        {isDrawing && (
          <div className="w-full mb-3 flex flex-wrap justify-between items-center bg-slate-950/95 px-4 py-2.5 rounded-2xl border border-amber-500/40 text-xs gap-2">
            <div className="flex items-center gap-1.5 text-cyan-400 font-bold font-mono">
              <Compass className="w-4 h-4 text-cyan-400" />
              <span>ዙር: <b className="text-white text-sm bg-slate-800 px-2 py-0.5 rounded">{revolutionCount}</b></span>
            </div>

            {isInFinalInspection && (
              <div className="flex items-center gap-1 text-emerald-400 font-extrabold bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-0.5 rounded-full text-[11px] animate-pulse">
                <span>👀 የመጨረሻ 2 ዙሮች (የፍተሻ ፍጥነት)</span>
              </div>
            )}

            <div className="flex items-center gap-1.5 text-amber-400 font-bold font-mono">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>እጣ ቁጥር ቆጣሪ: <b className="text-white text-base bg-amber-500/20 px-2 py-0.5 rounded border border-amber-400">{countdownStep}</b></span>
            </div>
          </div>
        )}

        <div className="relative w-[340px] h-[340px] flex items-center justify-center">
          <svg viewBox="0 0 350 350" className="w-full h-full select-none drop-shadow-2xl">
            <defs>
              {/* 3D Polished Wooden Outer Bevel */}
              <radialGradient id="woodBevelGrad" cx="35%" cy="35%" r="75%">
                <stop offset="0%" stopColor="#a74716" />
                <stop offset="35%" stopColor="#853811" />
                <stop offset="65%" stopColor="#5c270c" />
                <stop offset="85%" stopColor="#3d1a08" />
                <stop offset="100%" stopColor="#1f0d04" />
              </radialGradient>

              {/* Gold Inlay Trim */}
              <linearGradient id="goldInlayGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#fef08a" />
                <stop offset="30%" stopColor="#eab308" />
                <stop offset="70%" stopColor="#ca8a04" />
                <stop offset="100%" stopColor="#78350f" />
              </linearGradient>

              {/* Ruby Center Hub Gradient */}
              <radialGradient id="rubyHubGrad" cx="35%" cy="35%" r="65%">
                <stop offset="0%" stopColor="#f87171" />
                <stop offset="45%" stopColor="#dc2626" />
                <stop offset="85%" stopColor="#991b1b" />
                <stop offset="100%" stopColor="#450a0a" />
              </radialGradient>

              <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3.5" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* 1. 3D Polished Mahogany Outer Wheel Rim */}
            <circle
              cx={centerCoord}
              cy={centerCoord}
              r={circleRadius + 24}
              fill="url(#woodBevelGrad)"
              stroke="#1f0d04"
              strokeWidth="5"
            />

            {/* 2. Perimeter Brass Rivets / Studs */}
            {Array.from({ length: 24 }).map((_, i) => {
              const angle = (i * 15 * Math.PI) / 180;
              const rx = centerCoord + (circleRadius + 23) * Math.sin(angle);
              const ry = centerCoord - (circleRadius + 23) * Math.cos(angle);
              const isLit = isDrawing ? Math.floor(pointerAngle / 15) % 24 === i : i % 2 === 0;
              return (
                <circle
                  key={`rivet-${i}`}
                  cx={rx}
                  cy={ry}
                  r="2.8"
                  fill={isLit ? '#fef08a' : '#ca8a04'}
                  stroke="#451a03"
                  strokeWidth="0.8"
                  filter={isLit ? 'url(#neonGlow)' : undefined}
                />
              );
            })}

            {/* 3. Gold Inlay Trim Ring */}
            <circle
              cx={centerCoord}
              cy={centerCoord}
              r={circleRadius + 15}
              fill="none"
              stroke="url(#goldInlayGrad)"
              strokeWidth="3"
            />

            {/* 4. Casino Alternating Black & White Center Sectors */}
            {Array.from({ length: 24 }).map((_, idx) => {
              const sectorAngleDeg = 360 / 24;
              const startAngle = idx * sectorAngleDeg;
              const endAngle = (idx + 1) * sectorAngleDeg;
              const startRad = (startAngle * Math.PI) / 180;
              const endRad = (endAngle * Math.PI) / 180;

              const rOuter = circleRadius + 13;
              const rInner = 45;

              const x1 = centerCoord + rOuter * Math.sin(startRad);
              const y1 = centerCoord - rOuter * Math.cos(startRad);
              const x2 = centerCoord + rOuter * Math.sin(endRad);
              const y2 = centerCoord - rOuter * Math.cos(endRad);

              const x3 = centerCoord + rInner * Math.sin(endRad);
              const y3 = centerCoord - rInner * Math.cos(endRad);
              const x4 = centerCoord + rInner * Math.sin(startRad);
              const y4 = centerCoord - rInner * Math.cos(startRad);

              const pathData = `M ${x1} ${y1} A ${rOuter} ${rOuter} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${rInner} ${rInner} 0 0 0 ${x4} ${y4} Z`;
              const isBlackSector = idx % 2 === 0;

              return (
                <path
                  key={`sector-${idx}`}
                  d={pathData}
                  fill={isBlackSector ? '#0a0f1d' : '#f8fafc'}
                  stroke="#ca8a04"
                  strokeWidth="0.5"
                  opacity="0.9"
                />
              );
            })}

            {/* 5. Inner Track Golden Divider */}
            <circle
              cx={centerCoord}
              cy={centerCoord}
              r={circleRadius - 10}
              fill="none"
              stroke="url(#goldInlayGrad)"
              strokeWidth="1.5"
              strokeDasharray="4 6"
              opacity="0.6"
            />

            {/* 6. Active Tokens Arranged Around Wheel Rim */}
            {activeTokens.map((token, idx) => {
              const angleDeg = (idx / activeTokens.length) * 360;
              const rad = (angleDeg * Math.PI) / 180;
              const x = centerCoord + circleRadius * Math.sin(rad);
              const y = centerCoord - circleRadius * Math.cos(rad);
              const tokenColor = adminColorMap[token.adminId] || '#f59e0b';

              const dotSize = activeTokens.length > 50 ? 4.5 : activeTokens.length > 25 ? 6.5 : 8.5;
              const fontSize = activeTokens.length > 50 ? '7px' : '9px';

              return (
                <g
                  key={token.id}
                  transform={`translate(${x}, ${y})`}
                  className="transition-all duration-300"
                >
                  <circle
                    r={dotSize}
                    fill={tokenColor}
                    stroke="#020617"
                    strokeWidth="1.5"
                    filter="url(#neonGlow)"
                  />
                  {activeTokens.length <= 40 && (
                    <text
                      textAnchor="middle"
                      dy=".3em"
                      fill="#ffffff"
                      fontSize={fontSize}
                      fontWeight="bold"
                      className="pointer-events-none select-none"
                    >
                      #{token.tokenNumber}
                    </text>
                  )}
                </g>
              );
            })}

            {/* 7. Ultra-Visible 3D Metallic Pointer (Gold Arm with Vivid Ruby Needle Tip) */}
            <g transform={`rotate(${pointerAngle}, ${centerCoord}, ${centerCoord})`}>
              {/* Pointer Metallic Arm */}
              <line
                x1={centerCoord}
                y1={centerCoord}
                x2={centerCoord}
                y2={centerCoord - circleRadius + 14}
                stroke="url(#goldInlayGrad)"
                strokeWidth="6"
                strokeLinecap="round"
                filter="url(#neonGlow)"
              />
              {/* Vibrant Ruby Arrowhead with crisp needle point */}
              <polygon
                points={`${centerCoord},${centerCoord - circleRadius - 4} ${centerCoord - 9},${centerCoord - circleRadius + 18} ${centerCoord + 9},${centerCoord - circleRadius + 18}`}
                fill="url(#rubyHubGrad)"
                stroke="#fef08a"
                strokeWidth="1.5"
                filter="url(#neonGlow)"
              />
              {/* Sharp Needle Tip Pointer Line */}
              <line
                x1={centerCoord}
                y1={centerCoord - circleRadius + 18}
                x2={centerCoord}
                y2={centerCoord - circleRadius - 4}
                stroke="#ffffff"
                strokeWidth="2"
              />
              {/* Counter-balance Brass Tail */}
              <line
                x1={centerCoord}
                y1={centerCoord}
                x2={centerCoord}
                y2={centerCoord + 30}
                stroke="#cbd5e1"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
              <circle
                cx={centerCoord}
                cy={centerCoord + 30}
                r="4.5"
                fill="url(#goldInlayGrad)"
              />
            </g>

            {/* 8. Center Ruby & Gold Casino Pivot Cap */}
            <circle
              cx={centerCoord}
              cy={centerCoord}
              r="17"
              fill="url(#rubyHubGrad)"
              stroke="url(#goldInlayGrad)"
              strokeWidth="3"
            />
            <circle
              cx={centerCoord}
              cy={centerCoord}
              r="6"
              fill="#fef08a"
            />
          </svg>

          {/* Celebration Overlay Popup */}
          {celebratingWinner && (
            <div className="absolute inset-0 bg-black/85 backdrop-blur-md rounded-3xl flex flex-col items-center justify-center p-4 text-center z-20 animate-fadeIn">
              <div className="w-14 h-14 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 flex items-center justify-center text-slate-950 font-black text-2xl shadow-xl animate-bounce">
                🏆
              </div>
              <div className="mt-2 text-xs uppercase font-extrabold text-amber-400 tracking-wider">
                #{celebratingWinner.rank}ኛ እድለኛ / አሸናፊ
              </div>
              <div className="text-xl font-black text-white mt-1">
                {celebratingWinner.userName}
              </div>
              <div className="text-2xl font-black text-emerald-400 font-mono mt-1">
                +{celebratingWinner.prizeAmount.toLocaleString()} ETB
              </div>
              <div className="text-xs text-slate-400 mt-1">
                እጣ #{celebratingWinner.tokenNumber} • አጫዋች: {celebratingWinner.adminName}
              </div>
              <div className="mt-4 px-3 py-1 bg-slate-800 rounded-full text-xs text-amber-300 font-mono font-bold">
                ቀጣይ እጣ ማውጣት በ {celebrationCountdown} ሰከንድ ውስጥ...
              </div>
            </div>
          )}
        </div>

        {/* Live Status Description Banner */}
        {statusMessage && (
          <div className="mt-2 text-center text-xs text-amber-300 font-medium px-4 leading-relaxed">
            {statusMessage}
          </div>
        )}

        {/* Demo Controls: Single Start Button & Stop/Reset Button */}
        {isDemoModeAllowed && (
          <div className="mt-3.5 flex items-center gap-2">
            {!isDrawing && winners.length === 0 && (
              <button
                onClick={startDemoDrawing}
                className="px-5 py-2.5 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black rounded-2xl text-xs flex items-center gap-2 shadow-lg shadow-amber-500/20 active:scale-95 transition-all"
              >
                <Play className="w-4 h-4 fill-current text-slate-950" />
                <span>የማሳያ እጣ ማውጣት (Live Demo)</span>
              </button>
            )}

            {(isDrawing || isDemoRunning || winners.length > 0) && (
              <button
                onClick={handleStopDemo}
                className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 font-bold rounded-2xl text-xs flex items-center gap-1.5 transition-all active:scale-95"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>⏹️ ማሳያውን አቁም / ወደ መደበኛ መልስ</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Retractible Rule Guide (የሎቶ እጣ ማውጣት ህጎችና መመሪያዎች) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
        <button
          onClick={() => setIsRulesExpanded(!isRulesExpanded)}
          className="w-full p-3.5 flex justify-between items-center text-left text-xs font-bold text-white hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-2 text-amber-400">
            <Info className="w-4 h-4" />
            <span>የሎቶ እጣ ማውጣት ህጎችና መመሪያዎች (Rules & Guide)</span>
          </div>
          {isRulesExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>

        {isRulesExpanded && (
          <div className="p-4 pt-1 border-t border-slate-800 text-xs text-slate-300 space-y-3 leading-relaxed">
            <div className="space-y-1">
              <h4 className="font-black text-amber-400 flex items-center gap-1.5">
                <span>1. የጨረቃና የምድር ርቀት (Earth-Moon Distance Cosmic Seed)</span>
              </h4>
              <p className="text-[11px] text-slate-400">
                የእጣው እድለኛ / አሸናፊ የሚወሰነው በይፋዊው የጨረቃና የምድር 9-ዲጂት የርቀት ቁጥር (ሜትር) ነው። እጣ ማውጣት ሲጀመር ይህ ቁጥር ለሁሉም ተመልካቾች በቋሚነት ተቆልፎ ይቆያል፤ በክቡ ላይ ባሉት እጣዎች ብዛት መሰረት የመጨረሻዎቹ ዲጂቶች ተመርጠው ለእያንዳንዱ ደረጃ እድለኛ / አሸናፊ ማውጫነት ያገለግላሉ።
              </p>
            </div>

            <div className="space-y-1">
              <h4 className="font-black text-emerald-400 flex items-center gap-1.5">
                <span>2. የአጫዋች ፍትሃዊ ድርሻ ህግ (Fair Share Quota / Cup Rule)</span>
              </h4>
              <p className="text-[11px] text-slate-400">
                እያንዳንዱ አጫዋች ባስመዘገበው የእጣዎች ብዛት መሰረት የካዝናው ድርሻ ኮታ ይሰጠዋል። አንድ አጫዋች ያገኘው የሽልማት ድርሻ ከተፈቀደለት ኮታ እኩል ወይም የበለጠ ሲሆን (ጽዋው ሲሞላ)፣ የቀሩት እጣዎቹ ከዛሬው እጣ በቋሚነት ይሰናበታሉ። ይህም ሌሎች አጫዋቾች የማሸነፍ እድል እንዲያገኙ ያረጋግጣል።
              </p>
            </div>

            <div className="space-y-1">
              <h4 className="font-black text-cyan-400 flex items-center gap-1.5">
                <span>3. የ 10 እድለኞች / አሸናፊዎች ድርሻ (Halving Prize Allocation)</span>
              </h4>
              <p className="text-[11px] text-slate-400">
                ደረጃ 1 (1ኛ እድለኛ / አሸናፊ): 50% የካዝናው ድርሻ • ደረጃ 2: 25% • ደረጃ 3: 12.5% • ደረጃ 4: 6.25% ... እያለ እስከ 10ኛው ደረጃ ይቀጥላል።
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 1 to 10 Winners Board */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-3 shadow-xl">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-black text-white uppercase tracking-wide">
              የ 10 እድለኞች / አሸናፊዎች ይፋዊ ሰሌዳ
            </h3>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">
            {winners.length} / 10 የተገኙ
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
                          እጣ #{winner.tokenNumber} • አጫዋች: {winner.adminName}
                        </div>
                      </div>
                    ) : (
                      <div className="italic text-slate-500 text-xs">
                        {isCurrentlyDrawing ? '⚡ ቆጣሪው ወደ ዜሮ እየቀነሰ እድለኛውን / አሸናፊውን እየፈለገ ነው...' : 'የሚወጣ...'}
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
                    {rank === 1 ? '1ኛ እድለኛ / አሸናፊ (50% ካዝና)' : `የ#${rank - 1} ግማሽ ድርሻ`}
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
