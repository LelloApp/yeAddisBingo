import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { MegaCircleLotto, LottoTokenItem, LottoWinnerItem } from './MegaCircleLotto';
import { Crown, Sparkles, Coins, ArrowLeft } from 'lucide-react';

interface DailySuperBonusLottoPageProps {
  telegramUserId: number;
  userBalance: number;
  onOpenCashier?: () => void;
  onBackToLobby?: () => void;
}

export const DailySuperBonusLottoPage: React.FC<DailySuperBonusLottoPageProps> = ({
  telegramUserId,
  userBalance,
  onOpenCashier,
  onBackToLobby,
}) => {
  const [tokens, setTokens] = useState<LottoTokenItem[]>([]);
  const [totalPot, setTotalPot] = useState<number>(0);
  const [userTokensCount, setUserTokensCount] = useState<number>(0);
  const [savedWinners, setSavedWinners] = useState<LottoWinnerItem[]>([]);
  const [currentRoundId, setCurrentRoundId] = useState<string | undefined>(undefined);
  const [serverSeed, setServerSeed] = useState<number | undefined>(undefined);

  // Calculate draw time for today 19:00 EAT (16:00 UTC)
  const drawTime = React.useMemo(() => {
    const now = new Date();
    const target = new Date();
    // 19:00 EAT (UTC+3 -> 16:00 UTC)
    target.setUTCHours(16, 0, 0, 0);
    if (now.getTime() > target.getTime()) {
      target.setDate(target.getDate() + 1);
    }
    return target;
  }, []);

  useEffect(() => {
    loadSuperBonusData();

    // Realtime subscription for super bonus tokens and rounds
    const superBonusChannel = supabase
      .channel('realtime-super-bonus-lotto')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'daily_lotto_super_bonus_tokens' },
        () => {
          loadSuperBonusData();
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'daily_lotto_super_bonus_rounds' },
        () => {
          loadSuperBonusData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(superBonusChannel);
    };
  }, [telegramUserId]);

  const loadSuperBonusData = async () => {
    // 1. Fetch calculated 20% owner cut pot
    const { data: potData } = await supabase.rpc('get_owner_24h_super_bonus_pot');
    if (potData !== null && potData !== undefined) {
      setTotalPot(Number(potData));
    }

    // 2. Fetch current open or drawing Super Bonus round
    const { data: round } = await supabase
      .from('daily_lotto_super_bonus_rounds')
      .select('*')
      .in('status', ['open', 'drawing'])
      .order('created_at', { ascending: false })
      .maybeSingle();

    if (round) {
      setCurrentRoundId(round.id);
      if (round.cosmic_distance_seed) {
        setServerSeed(Number(round.cosmic_distance_seed));
      }
      // 3. Fetch tokens
      const { data: tokenRows } = await supabase
        .from('daily_lotto_super_bonus_tokens')
        .select('*')
        .eq('round_id', round.id)
        .order('created_at', { ascending: true });

      if (tokenRows) {
        const formatted: LottoTokenItem[] = tokenRows.map((t: any, idx: number) => ({
          id: t.id,
          tokenNumber: t.token_number || idx + 1,
          telegramUserId: t.telegram_user_id,
          userName: `ተጫዋች #${String(t.telegram_user_id).slice(-4)}`,
          adminId: t.admin_id || 'parcelic',
          adminName: t.admin_id ? 'አጫዋች ክፍል' : 'ፓርሴሊክ አጫዋች',
          adminColor: '#8b5cf6',
          createdAt: t.created_at,
        }));
        setTokens(formatted);

        const myTokens = tokenRows.filter((t: any) => t.telegram_user_id === telegramUserId);
        setUserTokensCount(myTokens.length);
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 space-y-4 max-w-lg mx-auto pb-16">
      {/* Top Header */}
      <div className="flex justify-between items-center bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3">
        <button
          onClick={onBackToLobby}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white font-bold"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>ወደ ክፍሎች ተመለስ</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenCashier}
            className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-400 rounded-xl text-xs font-bold"
          >
            <Coins className="w-3.5 h-3.5" />
            <span>ቀሪ ሂሳብ: {userBalance} ETB</span>
          </button>
        </div>
      </div>

      {/* Qualification & User Tokens Overview */}
      <div className="bg-gradient-to-br from-purple-950/40 via-slate-900 to-slate-950 border border-purple-500/30 rounded-3xl p-5 space-y-3 shadow-xl">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-purple-500/20 flex items-center justify-center text-purple-400 border border-purple-500/30">
              <Crown className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-white text-base">ዕለታዊ የሱፐር ቦነስ ሎቶ (ካዝና)</h3>
              <p className="text-[11px] text-slate-400">
                በ25፣ 50 ወይም 100 ብር ክፍሎች (12+ ተጫዋቾች ሲኖሩ) በማሸነፍ በነጻ የሚገኝ እጣ!
              </p>
            </div>
          </div>
        </div>

        {/* User Earned Tokens Card */}
        <div className="bg-slate-950/80 border border-purple-500/20 rounded-2xl p-3 flex justify-between items-center text-xs">
          <div>
            <div className="text-[10px] text-purple-300 font-bold uppercase">የዛሬው ያገኙት የሱፐር ቦነስ እጣዎች:</div>
            <div className="text-xl font-black text-white mt-0.5 font-mono">
              {userTokensCount} {userTokensCount === 1 ? 'እጣ' : 'እጣዎች'}
            </div>
          </div>
          <div className="text-right text-[11px] text-slate-400">
            {userTokensCount > 0 ? '🎟️ ለማታ 1 ሰአት እጣ ተመዝግቧል' : 'ለማግኘት ከ25+ ብር ክፍሎች ያሸንፉ'}
          </div>
        </div>

        {/* Rules & Pot Threshold Note */}
        <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80 text-[11px] text-slate-300 space-y-1">
          <div className="flex items-center gap-1.5 text-amber-400 font-bold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>የ24-ሰአት ዑደት እና ህጎች:</span>
          </div>
          <p className="text-slate-400 text-[10px]">
            • 25 ብር ክፍል ሲያሸንፉ <b>1 እጣ</b> • 50 ብር ክፍል ሲያሸንፉ <b>2 እጣዎች</b> • 100 ብር ክፍል ሲያሸንፉ <b>4 እጣዎች</b> ይሰጣል።
          </p>
          <p className="text-slate-400 text-[10px]">
            • የማታ 1 ሰአት የካዝናው መጠን ከ1,000 ብር በታች ከሆነ እጣዎቹ ተሰርዘው ለነገ በአዲስ ይጀምራሉ።
          </p>
        </div>
      </div>

      {/* Live Interactive Mega Circle Component */}
      <MegaCircleLotto
        title="ሱፐር ቦነስ ሎቶ (ማታ 1 ሰአት)"
        tokens={tokens}
        totalPot={totalPot}
        drawTime={drawTime}
        isSuperBonus={true}
        roundId={currentRoundId}
        serverSeed={serverSeed}
        savedWinners={savedWinners}
        onDrawCompleted={(winners) => setSavedWinners(winners)}
      />
    </div>
  );
};
