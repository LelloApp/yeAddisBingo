import React, { useState } from 'react';
import { Users, Coins, ShieldCheck, Sparkles, PlusCircle, Gamepad2, Brain, Check, Ticket, Clock } from 'lucide-react';
import { triggerHaptic } from '../utils/telegram';
import { Admin, supabase } from '../lib/supabase';

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
}

type ActiveGameTab = 'bingo' | 'lotto' | 'quiz';

export const GroupSelector: React.FC<GroupSelectorProps> = ({
  groups,
  admins = [],
  selectedAdmin,
  onSelectAdmin,
  userBalance,
  onSelectGroup,
  onOpenDepositGuide,
}) => {
  const [activeTab, setActiveTab] = useState<ActiveGameTab>('bingo');
  const [showAdminPicker, setShowAdminPicker] = useState(false);
  const [selectedLottoTokens, setSelectedLottoTokens] = useState<number>(1);
  const [lottoPurchaseStatus, setLottoPurchaseStatus] = useState<{ loading: boolean; success?: boolean; message?: string; tickets?: number[] }>({ loading: false });

  const getGroupTheme = (slug: string, stake: number, _name?: string) => {
    if (slug.includes('beginner') || stake === 5) {
      return {
        icon: '🌱',
        badge: 'Beginner Friendly',
        border: 'border-emerald-500/40 hover:border-emerald-400',
        bg: 'from-emerald-950/40 via-slate-900 to-slate-950',
        accent: 'text-emerald-400',
        badgeBg: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
      };
    }
    if (slug.includes('starter') || stake === 10) {
      return {
        icon: '🎯',
        badge: 'Starter Arena',
        border: 'border-blue-500/40 hover:border-blue-400',
        bg: 'from-blue-950/40 via-slate-900 to-slate-950',
        accent: 'text-blue-400',
        badgeBg: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
      };
    }
    if (slug.includes('standard') || stake === 15) {
      return {
        icon: '🎲',
        badge: 'Standard Room',
        border: 'border-amber-500/40 hover:border-amber-400',
        bg: 'from-amber-950/30 via-slate-900 to-slate-950',
        accent: 'text-amber-400',
        badgeBg: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
      };
    }
    if (slug.includes('classic') || stake === 20) {
      return {
        icon: '🏆',
        badge: 'Addis Classic',
        border: 'border-yellow-500/40 hover:border-yellow-400',
        bg: 'from-yellow-950/30 via-slate-900 to-slate-950',
        accent: 'text-yellow-400',
        badgeBg: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20',
      };
    }
    if (slug.includes('vip') || stake === 50) {
      return {
        icon: '💎',
        badge: 'VIP Diamond',
        border: 'border-cyan-500/40 hover:border-cyan-400',
        bg: 'from-cyan-950/30 via-slate-900 to-slate-950',
        accent: 'text-cyan-400',
        badgeBg: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20',
      };
    }
    return {
      icon: '👑',
      badge: 'High Roller',
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
    const username = currentAdmin.telegram_username ? currentAdmin.telegram_username.replace(/^@/, '') : 'parcelic';
    const url = `https://t.me/${username}`;
    if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.openTelegramLink) {
      (window as any).Telegram.WebApp.openTelegramLink(url);
    } else {
      window.open(url, '_blank');
    }
  };

  return (
    <div className="p-4 max-w-md mx-auto space-y-4 pb-16">
      {/* Header Banner */}
      <div className="text-center py-2 relative">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold mb-2">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Ye Addis Games Platform</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-yellow-500 tracking-tight">
          YE ADDIS GAMES
        </h1>
        <p className="text-xs text-slate-400 mt-1 font-ethiopic">
          ጨዋታና ክፍል ይምረጡና አሁኑኑ ይቀላቀሉ
        </p>
      </div>

      {/* Game Catalog Tabs (Bingo, Quiz, Chez) */}
      <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-2xl shadow-inner">
        <button
          onClick={() => {
            triggerHaptic('light');
            setActiveTab('bingo');
          }}
          className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'bingo'
              ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Gamepad2 className="w-4 h-4" />
          <span>Bingo</span>
        </button>

        <button
          onClick={() => {
            triggerHaptic('light');
            setActiveTab('lotto');
          }}
          className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'lotto'
              ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Ticket className="w-4 h-4" />
          <span>Daily Lotto</span>
        </button>

        <button
          onClick={() => {
            triggerHaptic('light');
            setActiveTab('quiz');
          }}
          className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'quiz'
              ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-md shadow-blue-500/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Brain className="w-4 h-4" />
          <span>Quiz</span>
        </button>
      </div>

      {/* Addis Daily Lotto Tab */}
      {activeTab === 'lotto' && (
        <div className="bg-gradient-to-br from-amber-950/40 via-slate-900 to-slate-950 border border-amber-500/30 rounded-2xl p-5 space-y-4 shadow-xl">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 flex items-center justify-center text-amber-400 border border-amber-500/30 shadow-inner">
                <Ticket className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-white">Addis Daily Lotto</h3>
                  <span className="text-[10px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full">
                    12H DRAW
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Opens morning • Closes & draws in the evening
                </p>
              </div>
            </div>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-2 text-xs">
            <div className="flex items-center justify-between text-slate-300">
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-amber-400" />
                <span>Draw Interval:</span>
              </span>
              <span className="font-bold text-white">12 Hours (Evening Draw)</span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span className="flex items-center gap-1.5">
                <Coins className="w-4 h-4 text-emerald-400" />
                <span>Price per Token:</span>
              </span>
              <span className="font-bold text-emerald-400">5 ETB = 1 Token ID</span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-blue-400" />
                <span>Fair Play Pot:</span>
              </span>
              <span className="font-bold text-amber-300">&lt;5 players: 100% pot / 5+ players: 10% admin fee</span>
            </div>
          </div>

          {/* Token Multiplier Selector */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 block">
              Choose Tokens to Buy (Multiples of 5 ETB):
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { count: 1, etb: 5 },
                { count: 2, etb: 10 },
                { count: 5, etb: 25 },
                { count: 10, etb: 50 },
              ].map((tier) => (
                <button
                  key={tier.count}
                  onClick={() => {
                    triggerHaptic('light');
                    setSelectedLottoTokens(tier.count);
                  }}
                  className={`py-2 px-1 rounded-xl text-center border transition-all ${
                    selectedLottoTokens === tier.count
                      ? 'border-amber-400 bg-amber-500/20 text-white shadow-md'
                      : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="text-xs font-black">{tier.count} {tier.count === 1 ? 'Token' : 'Tokens'}</div>
                  <div className="text-[10px] text-amber-400 font-bold">{tier.etb} ETB</div>
                </button>
              ))}
            </div>
          </div>

          {/* Selected Admin Info */}
          <div className="flex items-center justify-between bg-slate-900/80 px-3 py-2 rounded-xl border border-slate-800 text-xs">
            <span className="text-slate-400">Agent: <b className="text-white">{currentAdmin.display_name}</b></span>
            <span className="text-slate-400">Your Balance: <b className="text-amber-400">{userBalance} ETB</b></span>
          </div>

          {/* Action Button */}
          <div>
            <button
              disabled={lottoPurchaseStatus.loading || userBalance < selectedLottoTokens * 5}
              onClick={async () => {
                triggerHaptic('medium');
                const totalCost = selectedLottoTokens * 5;
                if (userBalance < totalCost) {
                  onOpenDepositGuide({
                    id: 'daily_lotto',
                    slug: 'daily_lotto',
                    name: 'Addis Daily Lotto',
                    admin_name: currentAdmin.display_name,
                    admin_username: currentAdmin.telegram_username,
                    stake_amount: totalCost,
                    min_balance: totalCost,
                    online_players_count: 50,
                  });
                  return;
                }

                setLottoPurchaseStatus({ loading: true });
                try {
                  const tgUser = (window as any).Telegram?.WebApp?.initDataUnsafe?.user;
                  const userId = tgUser?.id || 123456789;

                  const { data, error } = await supabase.rpc('buy_daily_lotto_tokens', {
                    p_telegram_user_id: userId,
                    p_admin_id: currentAdmin.id,
                    p_stake_amount: totalCost,
                  });

                  if (error || !data?.success) {
                    setLottoPurchaseStatus({
                      loading: false,
                      success: false,
                      message: data?.error || error?.message || 'Purchase failed',
                    });
                  } else {
                    setLottoPurchaseStatus({
                      loading: false,
                      success: true,
                      message: `Successfully bought ${data.tokens_bought} token(s)!`,
                      tickets: data.ticket_numbers,
                    });
                  }
                } catch (err: any) {
                  setLottoPurchaseStatus({
                    loading: false,
                    success: false,
                    message: err?.message || 'Error executing order',
                  });
                }
              }}
              className={`w-full py-3 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition-all ${
                userBalance >= selectedLottoTokens * 5
                  ? 'bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 active:scale-98'
                  : 'bg-slate-800 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Ticket className="w-4 h-4" />
              <span>
                {lottoPurchaseStatus.loading
                  ? 'Processing Purchase...'
                  : userBalance >= selectedLottoTokens * 5
                  ? `Buy ${selectedLottoTokens} Token(s) • ${selectedLottoTokens * 5} ETB`
                  : `Top Up ${selectedLottoTokens * 5 - userBalance} ETB to Play`}
              </span>
            </button>
          </div>

          {/* Feedback messages */}
          {lottoPurchaseStatus.message && (
            <div
              className={`p-3 rounded-xl text-xs ${
                lottoPurchaseStatus.success
                  ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                  : 'bg-red-500/10 border border-red-500/30 text-red-300'
              }`}
            >
              <div className="font-bold">{lottoPurchaseStatus.message}</div>
              {lottoPurchaseStatus.tickets && lottoPurchaseStatus.tickets.length > 0 && (
                <div className="mt-1 text-[11px] text-emerald-400 font-mono">
                  Your Ticket IDs: {lottoPurchaseStatus.tickets.map((t: number) => `#${t}`).join(', ')}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Quiz Tab Preview */}
      {activeTab === 'quiz' && (
        <div className="bg-gradient-to-br from-indigo-950/40 via-slate-900 to-slate-950 border border-indigo-500/30 rounded-2xl p-6 text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-indigo-500/20 flex items-center justify-center text-indigo-400 border border-indigo-500/30">
            <Brain className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white">Addis Quiz Arena</h3>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            Live multiplayer trivia and trivia duels with cash prizes. Test your speed and knowledge in Ethiopian & world topics!
          </p>
          <div className="inline-block px-3 py-1 bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 rounded-full text-xs font-semibold">
            ⏳ Coming Very Soon
          </div>
        </div>
      )}

      {/* Active Tab: Bingo Flow */}
      {activeTab === 'bingo' && (
        <>
          {/* Active Admin Indicator & Switcher */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 space-y-3 shadow-xl backdrop-blur-md">
            <div className="flex justify-between items-center">
              <div>
                <span className="text-[10px] text-slate-400 block font-semibold uppercase tracking-wider">
                  Attending via Admin
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
                  {showAdminPicker ? 'Close' : 'Switch Admin'}
                </button>
              )}
            </div>

            {/* Admin Selector Dropdown */}
            {showAdminPicker && (
              <div className="space-y-1.5 pt-2 border-t border-slate-800">
                <span className="text-[11px] text-slate-400 font-medium">
                  Choose which admin manages your credit & wins:
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
                  Admin Balance
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
                <span>Top Up with Admin</span>
              </button>
            </div>
          </div>

          {/* 6 Bingo Room Sections Grid */}
          <div className="space-y-3 pt-1">
            <div className="flex justify-between items-center px-1">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                6 Live Shared Sections (Max 400 Players)
              </span>
              <span className="text-[11px] text-amber-400 font-semibold">
                Auto-Restarting
              </span>
            </div>

            {groups.map((group) => {
              const hasMinBalance = userBalance >= group.min_balance;
              const theme = getGroupTheme(group.slug, group.stake_amount, group.name);

              return (
                <div
                  key={group.id}
                  onClick={() => {
                    triggerHaptic(hasMinBalance ? 'medium' : 'warning');
                    if (hasMinBalance) {
                      onSelectGroup({
                        ...group,
                        admin_name: currentAdmin.display_name,
                        admin_username: currentAdmin.telegram_username,
                      });
                    } else {
                      onOpenDepositGuide({
                        ...group,
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
                            {group.name}
                          </h3>
                        </div>
                        <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <ShieldCheck className="w-3.5 h-3.5 text-slate-500" />
                          <span>Admin: <b className="text-slate-300">{currentAdmin.display_name}</b></span>
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${theme.badgeBg}`}>
                        {theme.badge}
                      </span>
                      <div className="flex items-center gap-1 bg-slate-950/80 px-2 py-0.5 rounded-full text-[11px] font-semibold text-emerald-400 border border-emerald-500/20">
                        <Users className="w-3 h-3" />
                        <span>{group.online_players_count || 20} Online</span>
                      </div>
                    </div>
                  </div>

                  {/* Room Footer Details */}
                  <div className="mt-3.5 pt-3 border-t border-slate-800/80 flex justify-between items-center text-xs">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1 text-slate-300">
                        <Coins className={`w-3.5 h-3.5 ${theme.accent}`} />
                        <span>Stake: <b className="text-white font-bold">{group.stake_amount} ETB</b></span>
                      </div>
                      <span className="text-[11px] text-slate-500">
                        (Min: {group.min_balance} ETB)
                      </span>
                    </div>

                    <div>
                      {hasMinBalance ? (
                        <span className="bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-black px-3.5 py-1.5 rounded-xl text-xs shadow-md active:scale-95 transition-all">
                          Join Live →
                        </span>
                      ) : (
                        <span className="bg-red-500/10 text-red-400 border border-red-500/30 px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1">
                          <span>Top Up to Join</span>
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
