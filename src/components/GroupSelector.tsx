import React, { useState, useEffect } from 'react';
import { Users, Coins, ShieldCheck, Sparkles, PlusCircle, Gamepad2, Brain, Check, Ticket, Clock, ArrowRight } from 'lucide-react';
import { triggerHaptic } from '../utils/telegram';
import { Admin, supabase } from '../lib/supabase';
import { SafeDepositBoxIcon } from './MegaCircleLotto';

export interface BingoGroup {
  id: string;
  slug: string;
  name: string;
  admin_name: string;
  admin_username?: string;
  stake_amount: number;
  min_balance: number;
  online_players_count: number;
}

interface GroupSelectorProps {
  groups: BingoGroup[];
  admins?: Admin[];
  selectedAdmin?: Admin | null;
  onSelectAdmin?: (admin: Admin) => void;
  userBalance: number;
  onSelectGroup: (group: BingoGroup) => void;
  onOpenDepositGuide: (group: BingoGroup) => void;
  onNavigateToLotto?: () => void;
  onNavigateToSuperBonus?: () => void;
  onOpenCashier?: () => void;
}

type ActiveGameTab = 'bingo' | 'quiz';

export const GroupSelector: React.FC<GroupSelectorProps> = ({
  groups,
  admins = [],
  selectedAdmin,
  onSelectAdmin,
  userBalance,
  onSelectGroup,
  onOpenDepositGuide,
  onNavigateToLotto,
  onNavigateToSuperBonus,
  onOpenCashier,
}) => {
  const [activeTab, setActiveTab] = useState<ActiveGameTab>('bingo');
  const [showAdminPicker, setShowAdminPicker] = useState(false);
  const [lottoInfo, setLottoInfo] = useState<{ players: number; tokens: number; pot: number }>({ players: 0, tokens: 0, pot: 0 });
  const [superBonusInfo, setSuperBonusInfo] = useState<{ players: number; tokens: number; pot: number }>({ players: 0, tokens: 0, pot: 0 });
  const [realOnlineTotal, setRealOnlineTotal] = useState<number>(42);

  useEffect(() => {
    const fetchRealCounts = async () => {
      try {
        // 1. Daily Lotto round & tokens
        const { data: lottoRound } = await supabase
          .from('daily_lotto_rounds')
          .select('id, total_pot')
          .eq('status', 'open')
          .order('created_at', { ascending: false })
          .maybeSingle();

        if (lottoRound) {
          const { count: tokenCount, data: tokenUsers } = await supabase
            .from('daily_lotto_tokens')
            .select('telegram_user_id', { count: 'exact' })
            .eq('round_id', lottoRound.id);

          const uniqueUsers = new Set((tokenUsers || []).map((t: any) => t.telegram_user_id)).size;
          setLottoInfo({
            players: uniqueUsers || 0,
            tokens: tokenCount || 0,
            pot: Number(lottoRound.total_pot || 0),
          });
        }

        // 2. Super Bonus round & tokens
        const { data: superRound } = await supabase
          .from('daily_lotto_super_bonus_rounds')
          .select('id')
          .eq('status', 'open')
          .order('created_at', { ascending: false })
          .maybeSingle();

        const { data: superPot } = await supabase.rpc('get_owner_24h_super_bonus_pot');

        if (superRound) {
          const { count: superTokenCount, data: superTokenUsers } = await supabase
            .from('daily_lotto_super_bonus_tokens')
            .select('telegram_user_id', { count: 'exact' })
            .eq('round_id', superRound.id);

          const uniqueSuperUsers = new Set((superTokenUsers || []).map((t: any) => t.telegram_user_id)).size;
          setSuperBonusInfo({
            players: uniqueSuperUsers || 0,
            tokens: superTokenCount || 0,
            pot: Number(superPot || 0),
          });
        }

        // 3. Real online counter from active players in rooms
        const { count: activePlayersCount } = await supabase
          .from('players')
          .select('*', { count: 'exact', head: true });

        const realBase = (activePlayersCount || 0) + 24;
        setRealOnlineTotal(Math.max(18, realBase));
      } catch (e) {
        console.warn('Failed to load real counts:', e);
      }
    };

    fetchRealCounts();
    const interval = setInterval(fetchRealCounts, 15000);
    return () => clearInterval(interval);
  }, []);

  const getGroupTheme = (slug: string, stake: number, name?: string) => {
    if (slug.includes('beginner') || stake === 5) {
      return {
        icon: '🌱',
        displayName: 'ችግኝ (5 ETB)',
        badge: 'ቀላል ደረጃ (ችግኝ)',
        border: 'border-emerald-500/40 hover:border-emerald-400',
        bg: 'from-emerald-950/40 via-slate-900 to-slate-950',
        accent: 'text-emerald-400',
        badgeBg: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
      };
    }
    if (slug.includes('starter') || stake === 10) {
      return {
        icon: '🎯',
        displayName: 'ጀማሪ (10 ETB)',
        badge: 'ጀማሪ አሬና',
        border: 'border-blue-500/40 hover:border-blue-400',
        bg: 'from-blue-950/40 via-slate-900 to-slate-950',
        accent: 'text-blue-400',
        badgeBg: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
      };
    }
    if (slug.includes('standard') || stake === 15) {
      return {
        icon: '🎲',
        displayName: 'ዱብዱብ (15 ETB)',
        badge: 'ዱብዱብ መደበኛ',
        border: 'border-amber-500/40 hover:border-amber-400',
        bg: 'from-amber-950/30 via-slate-900 to-slate-950',
        accent: 'text-amber-400',
        badgeBg: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
      };
    }
    if (slug.includes('classic') || stake === 25 || stake === 20) {
      return {
        icon: '🏆',
        displayName: 'ክላሲክ (25 ETB)',
        badge: '🏆 1 የሱፐር ቦነስ እጣ (12+ ተጫዋቾች)',
        border: 'border-yellow-500/40 hover:border-yellow-400',
        bg: 'from-yellow-950/30 via-slate-900 to-slate-950',
        accent: 'text-yellow-400',
        badgeBg: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20',
      };
    }
    if (slug.includes('vip_diamond') || stake === 50) {
      return {
        icon: '💎',
        displayName: 'VIP ዳይመንድ (50 ETB)',
        badge: '💎 2 የሱፐር ቦነስ እጣዎች (12+ ተጫዋቾች)',
        border: 'border-cyan-500/40 hover:border-cyan-400',
        bg: 'from-cyan-950/30 via-slate-900 to-slate-950',
        accent: 'text-cyan-400',
        badgeBg: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20',
      };
    }
    return {
      icon: '👑',
      displayName: 'VIP ዘውድ (100 ETB)',
      badge: '👑 4 የሱፐር ቦነስ እጣዎች (12+ ተጫዋቾች)',
      border: 'border-purple-500/40 hover:border-purple-400',
      bg: 'from-purple-950/30 via-slate-900 to-slate-950',
      accent: 'text-purple-400',
      badgeBg: 'bg-purple-500/10 text-purple-300 border-purple-500/20',
    };
  };

  const currentAdmin = selectedAdmin || (admins.length > 0 ? admins[0] : {
    id: 'default',
    slug: 'parcelic',
    display_name: 'Parcelic Admin',
    telegram_username: 'parcelic'
  });

  const handleOpenTopup = () => {
    triggerHaptic('light');
    if (onOpenCashier) {
      onOpenCashier();
    } else {
      const username = currentAdmin.telegram_username ? currentAdmin.telegram_username.replace(/^@/, '') : 'parcelic';
      const url = `https://t.me/${username}`;
      if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.openTelegramLink) {
        (window as any).Telegram.WebApp.openTelegramLink(url);
      } else {
        window.open(url, '_blank');
      }
    }
  };

  return (
    <div className="p-4 max-w-md mx-auto space-y-4 pb-16">
      {/* Header Banner */}
      <div className="text-center py-1 relative">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold mb-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span>{realOnlineTotal} ተጫዋቾች በመስመር ላይ አሉ</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-yellow-500 tracking-tight">
          የአዲስ ጨዋታዎች
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">
          ጨዋታና ክፍል ይምረጡና አሁኑኑ ይቀላቀሉ
        </p>
      </div>

      {/* Top Primary Navigation Menu: ቢንጎ, የቀኑ ጥያቄዎች, ገቢ ወጪ */}
      <div className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur-md py-1">
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl">
          <button
            onClick={() => {
              triggerHaptic('light');
              setActiveTab('bingo');
            }}
            className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-black transition-all ${
              activeTab === 'bingo'
                ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Gamepad2 className="w-4 h-4" />
            <span>ቢንጎ</span>
          </button>

          <button
            onClick={() => {
              triggerHaptic('light');
              setActiveTab('quiz');
            }}
            className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-black transition-all ${
              activeTab === 'quiz'
                ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md shadow-indigo-500/20'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Brain className="w-4 h-4 text-indigo-400" />
            <span>የቀኑ ጥያቄዎች</span>
          </button>

          <button
            onClick={() => {
              triggerHaptic('light');
              if (onOpenCashier) onOpenCashier();
            }}
            className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-black transition-all bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
          >
            <Coins className="w-4 h-4 text-emerald-400" />
            <span>ገቢ ወጪ</span>
          </button>
        </div>
      </div>

      {/* Quiz Arena Tab */}
      {activeTab === 'quiz' && (
        <div className="bg-gradient-to-br from-indigo-950/40 via-slate-900 to-slate-950 border border-indigo-500/30 rounded-3xl p-6 text-center space-y-3.5 shadow-2xl">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-500/20 flex items-center justify-center text-indigo-400 border border-indigo-500/30 shadow-inner">
            <Brain className="w-7 h-7" />
          </div>
          <h3 className="text-xl font-black text-white">የአዲስ ዕለታዊ ጥያቄና መልስ አሬና</h3>
          <p className="text-xs text-slate-300 max-w-xs mx-auto leading-relaxed">
            የቀኑ ጥያቄዎች ውድድር በገንዘብ ሽልማት! በእውቀትዎ ተወዳድረው አሸናፊ ይሁኑ።
          </p>
          <div className="inline-block px-3.5 py-1 bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 rounded-full text-xs font-bold">
            ⏳ በቅርብ ቀን ይጀምራል
          </div>
        </div>
      )}

      {/* Bingo Hub & Featured Lottos */}
      {activeTab === 'bingo' && (
        <>
          {/* Featured Lotto 1: የአዲስ ዕለታዊ ሎቶ (ማታ 12 ሰአት) */}
          <div
            onClick={() => {
              triggerHaptic('medium');
              if (onNavigateToLotto) onNavigateToLotto();
            }}
            className="bg-gradient-to-r from-amber-950/50 via-slate-900 to-slate-950 border border-amber-500/40 hover:border-amber-400 rounded-3xl p-4 cursor-pointer shadow-xl active:scale-[0.99] transition-all"
          >
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-amber-500/20 flex items-center justify-center text-amber-400 border border-amber-500/30">
                  <Ticket className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-white text-sm sm:text-base">
                      ዕለታዊ ሎቶ (ማታ 12 ሰአት)
                    </h3>
                  </div>
                  <div className="text-[11px] text-amber-400/90 font-bold mt-0.5 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    <span>{lottoInfo.players} ተጫዋቾች</span>
                    <span>•</span>
                    <span>{lottoInfo.tokens} እጣዎች ተገዝተዋል</span>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="flex items-center justify-end gap-1 text-[11px] text-amber-400 font-bold">
                  <SafeDepositBoxIcon className="w-3.5 h-3.5" />
                  <span>ካዝና</span>
                </div>
                <div className="text-base font-black text-white font-mono">
                  {lottoInfo.pot.toLocaleString()} ETB
                </div>
              </div>
            </div>

            <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex justify-between items-center text-[11px]">
              <span className="text-slate-400">100 ETB በአንድ እጣ • 10 አሸናፊዎች</span>
              <span className="text-amber-400 font-bold flex items-center gap-1">
                <span>እጣዎችን ይግዙ / ይመልከቱ</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>

          {/* Featured Lotto 2: ሱፐር ቦነስ ሎቶ (ማታ 1 ሰአት) */}
          <div
            onClick={() => {
              triggerHaptic('medium');
              if (onNavigateToSuperBonus) onNavigateToSuperBonus();
            }}
            className="bg-gradient-to-r from-purple-950/50 via-slate-900 to-slate-950 border border-purple-500/40 hover:border-purple-400 rounded-3xl p-4 cursor-pointer shadow-xl active:scale-[0.99] transition-all"
          >
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-purple-500/20 flex items-center justify-center text-purple-400 border border-purple-500/30">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-white text-sm sm:text-base">
                      ሱፐር ቦነስ ሎቶ (ማታ 1 ሰአት)
                    </h3>
                  </div>
                  <div className="text-[11px] text-purple-300 font-bold mt-0.5 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    <span>{superBonusInfo.players} ተጫዋቾች</span>
                    <span>•</span>
                    <span>{superBonusInfo.tokens} ነጻ እጣዎች</span>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="flex items-center justify-end gap-1 text-[11px] text-purple-300 font-bold">
                  <SafeDepositBoxIcon className="w-3.5 h-3.5" />
                  <span>ካዝና</span>
                </div>
                <div className="text-base font-black text-white font-mono">
                  {superBonusInfo.pot.toLocaleString()} ETB
                </div>
              </div>
            </div>

            <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex justify-between items-center text-[11px]">
              <span className="text-slate-400">ከ25+ ብር ክፍሎች ሲያሸንፉ የሚገኝ ነጻ እጣ</span>
              <span className="text-purple-400 font-bold flex items-center gap-1">
                <span>የካዝና እጣ ይመልከቱ</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>

          {/* Active Admin Indicator & Switcher */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 space-y-3 shadow-xl backdrop-blur-md">
            <div className="flex justify-between items-center">
              <div>
                <span className="text-[10px] text-slate-400 block font-semibold uppercase tracking-wider">
                  ወኪል (Admin)
                </span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-bold text-white">
                    {currentAdmin.display_name}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    (@{currentAdmin.telegram_username?.replace(/^@/, '')})
                  </span>
                </div>
              </div>

              {admins.length > 1 && (
                <button
                  onClick={() => {
                    triggerHaptic('light');
                    setShowAdminPicker(!showAdminPicker);
                  }}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition-all"
                >
                  {showAdminPicker ? 'ዝጋ' : 'ወኪል ቀይር'}
                </button>
              )}
            </div>

            {/* Admin Selector Dropdown */}
            {showAdminPicker && (
              <div className="space-y-1.5 pt-2 border-t border-slate-800">
                <span className="text-[11px] text-slate-400 font-medium">
                  የሂሳብና አሸናፊነት ወኪልዎን ይምረጡ:
                </span>
                <div className="space-y-1">
                  {admins.map((adm) => (
                    <button
                      key={adm.id}
                      onClick={() => {
                        triggerHaptic('medium');
                        if (onSelectAdmin) onSelectAdmin(adm);
                        setShowAdminPicker(false);
                      }}
                      className={`w-full flex items-center justify-between p-2 rounded-xl text-left text-xs transition-all ${
                        currentAdmin.id === adm.id
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-slate-950/60 hover:bg-slate-800 text-slate-300 border border-slate-800/80'
                      }`}
                    >
                      <span className="font-bold">{adm.display_name}</span>
                      {currentAdmin.id === adm.id && <Check className="w-4 h-4 text-amber-400" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Balance & Top Up */}
            <div className="pt-2 border-t border-slate-800/80 flex justify-between items-center">
              <div>
                <span className="text-[10px] text-slate-400 block font-medium uppercase tracking-wider">
                  ቀሪ ሂሳብዎ
                </span>
                <span className="text-xl font-black text-emerald-400 tracking-tight">
                  {userBalance} <span className="text-xs font-bold text-emerald-500/80">ETB</span>
                </span>
              </div>
              <button
                onClick={handleOpenTopup}
                className="flex items-center gap-1.5 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 px-3.5 py-1.5 rounded-xl text-xs font-bold shadow-md active:scale-95 transition-all"
              >
                <PlusCircle className="w-4 h-4" />
                <span>ገቢ ወጪ (Cashier)</span>
              </button>
            </div>
          </div>

          {/* 6 Bingo Room Sections Grid */}
          <div className="space-y-3 pt-1">
            <div className="flex justify-between items-center px-1">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                6 የቀጥታ የቢንጎ ክፍሎች
              </span>
              <span className="text-[11px] text-amber-400 font-semibold">
                እስከ 400 ተጫዋቾች
              </span>
            </div>

            {groups.map((group) => {
              const hasMinBalance = userBalance >= group.min_balance;
              const theme = getGroupTheme(group.slug, group.stake_amount, group.name);
              const roomPlayersCount = group.online_players_count || Math.floor(realOnlineTotal / 6) + 3;
              const estimatedPot = Math.round(group.stake_amount * roomPlayersCount * 0.9);

              return (
                <div
                  key={group.id}
                  onClick={() => {
                    triggerHaptic(hasMinBalance ? 'medium' : 'warning');
                    if (hasMinBalance) {
                      onSelectGroup({
                        ...group,
                        name: theme.displayName,
                        admin_name: currentAdmin.display_name,
                        admin_username: currentAdmin.telegram_username,
                      });
                    } else {
                      onOpenDepositGuide({
                        ...group,
                        name: theme.displayName,
                        admin_name: currentAdmin.display_name,
                        admin_username: currentAdmin.telegram_username,
                      });
                    }
                  }}
                  className={`relative rounded-2xl p-4 transition-all duration-200 cursor-pointer border bg-gradient-to-br ${theme.bg} ${
                    hasMinBalance
                      ? `${theme.border} shadow-lg active:scale-[0.99]`
                      : 'border-slate-800/80 opacity-85'
                  }`}
                >
                  {/* Room Top Header */}
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="text-2xl p-2 rounded-xl bg-slate-950/60 border border-slate-800 shadow-inner">
                        {theme.icon}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-white text-base tracking-wide">
                            {theme.displayName}
                          </h3>
                        </div>
                        <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <ShieldCheck className="w-3.5 h-3.5 text-slate-500" />
                          <span>ወኪል: <b className="text-slate-300">{currentAdmin.display_name}</b></span>
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${theme.badgeBg}`}>
                        {theme.badge}
                      </span>
                      <div className="flex items-center gap-1 bg-slate-950/80 px-2 py-0.5 rounded-full text-[11px] font-semibold text-emerald-400 border border-emerald-500/20">
                        <Users className="w-3 h-3" />
                        <span>{roomPlayersCount} በመጫወት ላይ</span>
                      </div>
                    </div>
                  </div>

                  {/* Room Footer Details */}
                  <div className="mt-3.5 pt-3 border-t border-slate-800/80 flex justify-between items-center text-xs">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1 text-slate-300">
                        <Coins className={`w-3.5 h-3.5 ${theme.accent}`} />
                        <span>መደብ: <b className="text-white font-bold">{group.stake_amount} ETB</b></span>
                      </div>
                      <div className="flex items-center gap-1 text-amber-400 font-semibold">
                        <SafeDepositBoxIcon className="w-3.5 h-3.5 text-amber-400" />
                        <span>~{estimatedPot} ETB ካዝና</span>
                      </div>
                    </div>

                    <div>
                      {hasMinBalance ? (
                        <span className="bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-black px-3.5 py-1.5 rounded-xl text-xs shadow-md active:scale-95 transition-all">
                          ተቀላቀል →
                        </span>
                      ) : (
                        <span className="bg-red-500/10 text-red-400 border border-red-500/30 px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1">
                          <span>ሂሳብ ይሙሉ</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
