import React from 'react';
import { Users, Coins, ShieldCheck, Sparkles, PlusCircle } from 'lucide-react';
import { triggerHaptic } from '../utils/telegram';

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
  userBalance: number;
  onSelectGroup: (group: BingoGroup) => void;
  onOpenDepositGuide: (group: BingoGroup) => void;
}

export const GroupSelector: React.FC<GroupSelectorProps> = ({
  groups,
  userBalance,
  onSelectGroup,
  onOpenDepositGuide,
}) => {
  const getGroupTheme = (slug: string, stake: number, name: string) => {
    if (slug.includes('kera') || name.includes('ቄራ') || name.includes('🐮')) {
      return {
        icon: '🐮',
        badge: 'ቄራ ማህበረሰብ',
        border: 'border-orange-500/40 hover:border-orange-400',
        bg: 'from-orange-950/40 via-slate-900 to-slate-950',
        accent: 'text-orange-400',
        badgeBg: 'bg-orange-500/10 text-orange-300 border-orange-500/20',
      };
    }
    if (slug.includes('stadium') || slug.includes('hasen') || name.includes('ስታዲየም') || name.includes('⚽️')) {
      return {
        icon: '⚽️',
        badge: 'ስታዲየም ክለብ',
        border: 'border-lime-500/40 hover:border-lime-400',
        bg: 'from-lime-950/40 via-slate-900 to-slate-950',
        accent: 'text-lime-400',
        badgeBg: 'bg-lime-500/10 text-lime-300 border-lime-500/20',
      };
    }
    if (slug.includes('vip') || stake === 50) {
      return {
        icon: '💎',
        badge: 'VIP Club',
        border: 'border-cyan-500/40 hover:border-cyan-400',
        bg: 'from-cyan-950/30 via-slate-900 to-slate-950',
        accent: 'text-cyan-400',
        badgeBg: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20',
      };
    }
    if (slug.includes('high') || stake >= 100) {
      return {
        icon: '👑',
        badge: 'High Roller',
        border: 'border-purple-500/40 hover:border-purple-400',
        bg: 'from-purple-950/30 via-slate-900 to-slate-950',
        accent: 'text-purple-400',
        badgeBg: 'bg-purple-500/10 text-purple-300 border-purple-500/20',
      };
    }
    if (slug.includes('starter')) {
      return {
        icon: '🎯',
        badge: 'Beginner Friendly',
        border: 'border-emerald-500/40 hover:border-emerald-400',
        bg: 'from-emerald-950/40 via-slate-900 to-slate-950',
        accent: 'text-emerald-400',
        badgeBg: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
      };
    }
    return {
      icon: '🎲',
      badge: 'Most Popular',
      border: 'border-amber-500/40 hover:border-amber-400',
      bg: 'from-amber-950/30 via-slate-900 to-slate-950',
      accent: 'text-amber-400',
      badgeBg: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
    };
  };

  const handleOpenTopup = () => {
    triggerHaptic('light');
    const url = 'https://t.me/parcelic';
    if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.openTelegramLink) {
      (window as any).Telegram.WebApp.openTelegramLink(url);
    } else {
      window.open(url, '_blank');
    }
  };

  return (
    <div className="p-4 max-w-md mx-auto space-y-4 pb-12">
      {/* Header Banner */}
      <div className="text-center py-2 relative">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold mb-2">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Multiplayer Live Rooms</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-yellow-500 tracking-tight">
          YE ADDIS BINGO
        </h1>
        <p className="text-xs text-slate-400 mt-1 font-ethiopic">
          ክፍል ይምረጡና አሁኑኑ ጨዋታውን ይቀላቀሉ
        </p>
      </div>

      {/* User Balance Card with Quick Top-Up */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 flex justify-between items-center shadow-xl backdrop-blur-md">
        <div>
          <span className="text-[11px] text-slate-400 block font-medium uppercase tracking-wider">
            Available Balance
          </span>
          <span className="text-xl font-black text-emerald-400 tracking-tight">
            {userBalance} <span className="text-xs font-bold text-emerald-500/80">ETB</span>
          </span>
        </div>
        <button
          onClick={handleOpenTopup}
          className="flex items-center gap-1.5 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 px-3.5 py-2 rounded-xl text-xs font-bold shadow-lg shadow-amber-500/20 active:scale-95 transition-all"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Top Up</span>
        </button>
      </div>

      {/* Rooms Grid */}
      <div className="space-y-3 pt-1">
        {groups.map((group) => {
          const hasMinBalance = userBalance >= group.min_balance;
          const theme = getGroupTheme(group.slug, group.stake_amount, group.name);

          return (
            <div
              key={group.id}
              onClick={() => {
                triggerHaptic(hasMinBalance ? 'medium' : 'warning');
                if (hasMinBalance) {
                  onSelectGroup(group);
                } else {
                  onOpenDepositGuide(group);
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
                      <span>Admin: <b className="text-slate-300">{group.admin_name}</b></span>
                    </p>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${theme.badgeBg}`}>
                    {theme.badge}
                  </span>
                  <div className="flex items-center gap-1 bg-slate-950/80 px-2 py-0.5 rounded-full text-[11px] font-semibold text-emerald-400 border border-emerald-500/20">
                    <Users className="w-3 h-3" />
                    <span>{group.online_players_count} Online</span>
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
                      Play Now →
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
    </div>
  );
};
