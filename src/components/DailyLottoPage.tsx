import React, { useState, useEffect } from 'react';
import { supabase, Admin } from '../lib/supabase';
import { MegaCircleLotto, LottoTokenItem, LottoWinnerItem } from './MegaCircleLotto';
import { Ticket, Coins, ArrowLeft } from 'lucide-react';
import { triggerHaptic } from '../utils/telegram';

interface DailyLottoPageProps {
  currentAdmin: Admin | null;
  telegramUserId: number;
  userBalance: number;
  onOpenCashier?: () => void;
  onBackToLobby?: () => void;
}

export const DailyLottoPage: React.FC<DailyLottoPageProps> = ({
  currentAdmin,
  telegramUserId,
  userBalance,
  onOpenCashier,
  onBackToLobby,
}) => {
  const [tokens, setTokens] = useState<LottoTokenItem[]>([]);
  const [totalPot, setTotalPot] = useState<number>(0);
  const [selectedTokensCount, setSelectedTokensCount] = useState<number>(1);
  const [purchaseStatus, setPurchaseStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [savedWinners, setSavedWinners] = useState<LottoWinnerItem[]>([]);

  // Calculate draw time for today 18:00 EAT (15:00 UTC)
  const drawTime = React.useMemo(() => {
    const now = new Date();
    const target = new Date();
    // 18:00 EAT (UTC+3 -> 15:00 UTC)
    target.setUTCHours(15, 0, 0, 0);
    if (now.getTime() > target.getTime()) {
      target.setDate(target.getDate() + 1);
    }
    return target;
  }, []);

  useEffect(() => {
    loadRoundAndTokens();

    // Realtime subscription: update every time a user buys a ticket!
    const tokensChannel = supabase
      .channel('realtime-daily-lotto-tokens')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'daily_lotto_tokens' },
        () => {
          loadRoundAndTokens();
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'daily_lotto_rounds' },
        () => {
          loadRoundAndTokens();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(tokensChannel);
    };
  }, []);

  const loadRoundAndTokens = async () => {
    // 1. Fetch current open round
    const { data: round } = await supabase
      .from('daily_lotto_rounds')
      .select('*')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .maybeSingle();

    if (round) {
      setTotalPot(Number(round.total_pot || 0));

      // 2. Fetch all tokens for this round
      const { data: tokenRows } = await supabase
        .from('daily_lotto_tokens')
        .select('*')
        .eq('round_id', round.id)
        .order('created_at', { ascending: true });

      if (tokenRows) {
        const formatted: LottoTokenItem[] = tokenRows.map((t: any, idx: number) => ({
          id: t.id,
          tokenNumber: t.token_number || idx + 1,
          telegramUserId: t.telegram_user_id,
          userName: `User #${String(t.telegram_user_id).slice(-4)}`,
          adminId: t.admin_id || 'parcelic',
          adminName: t.admin_id ? 'አጫዋች ክፍል' : 'ፓርሴሊክ አጫዋች',
          adminColor: '#f59e0b',
          createdAt: t.created_at,
        }));
        setTokens(formatted);
      }
    }
  };

  const handleBuyTokens = async () => {
    if (!currentAdmin?.id) return;
    const cost = selectedTokensCount * 100;
    if (userBalance < cost) {
      if (onOpenCashier) onOpenCashier();
      return;
    }

    setIsLoading(true);
    setPurchaseStatus(null);
    triggerHaptic('medium');

    try {
      const { data, error } = await supabase.rpc('buy_daily_lotto_tokens_v2', {
        p_telegram_user_id: telegramUserId,
        p_admin_id: currentAdmin.id,
        p_token_count: selectedTokensCount,
      });

      if (error || !data?.success) {
        setPurchaseStatus(`Failed: ${data?.error || error?.message}`);
      } else {
        setPurchaseStatus(`🎉 Bought ${data.tokens_bought} ticket(s) (Ticket numbers: ${data.ticket_numbers?.join(', ')})!`);
        loadRoundAndTokens();
      }
    } catch (err: any) {
      setPurchaseStatus(`Error: ${err?.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 space-y-4 max-w-lg mx-auto pb-16">
      {/* Navigation Header */}
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

      {/* Ticket Purchase Terminal */}
      <div className="bg-gradient-to-br from-amber-950/30 via-slate-900 to-slate-950 border border-amber-500/30 rounded-3xl p-4 space-y-3 shadow-xl">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 flex items-center justify-center text-amber-400 border border-amber-500/30">
              <Ticket className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-white text-base">የአዲስ ዕለታዊ ሎቶ እጣዎችን ይግዙ</h3>
              <p className="text-[11px] text-slate-400">100 ብር በአንድ እጣ • 70% ወደ ካዝና • 20% ለአጫዋች • 10% ለባለቤት</p>
            </div>
          </div>
        </div>

        {/* Token Count Selector */}
        <div className="grid grid-cols-4 gap-2">
          {[1, 2, 5, 10].map((count) => (
            <button
              key={count}
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setSelectedTokensCount(count);
              }}
              className={`py-2 rounded-xl text-center border transition-all ${
                selectedTokensCount === count
                  ? 'border-amber-400 bg-amber-500/20 text-white shadow-md'
                  : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
              }`}
            >
              <div className="text-xs font-black">{count} {count === 1 ? 'እጣ' : 'እጣዎች'}</div>
              <div className="text-[10px] text-amber-400 font-bold">{count * 100} ETB</div>
            </button>
          ))}
        </div>

        {purchaseStatus && (
          <div className="p-2.5 bg-slate-950 rounded-xl text-xs text-amber-300 border border-slate-800">
            {purchaseStatus}
          </div>
        )}

        <button
          onClick={handleBuyTokens}
          disabled={isLoading}
          className={`w-full py-3 rounded-xl font-black text-xs uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 active:scale-98 transition-all ${
            userBalance >= selectedTokensCount * 100
              ? 'bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 text-slate-950'
              : 'bg-slate-800 text-amber-400'
          }`}
        >
          {userBalance >= selectedTokensCount * 100 ? (
            <span>{selectedTokensCount} እጣ(ዎች) ግዛ • {selectedTokensCount * 100} ETB</span>
          ) : (
            <span>ለመግዛት {selectedTokensCount * 100 - userBalance} ETB ቀሪ ሂሳብ ይሙሉ</span>
          )}
        </button>
      </div>

      {/* Live Interactive Mega Circle Component */}
      <MegaCircleLotto
        title="የአዲስ ዕለታዊ ሎቶ (ማታ 12 ሰአት)"
        tokens={tokens}
        totalPot={totalPot}
        drawTime={drawTime}
        isSuperBonus={false}
        savedWinners={savedWinners}
        onDrawCompleted={(winners) => setSavedWinners(winners)}
      />
    </div>
  );
};
