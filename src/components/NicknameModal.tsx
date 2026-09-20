import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { User, Sparkles } from 'lucide-react';
import { triggerHaptic } from '../utils/telegram';

interface NicknameModalProps {
  isOpen: boolean;
  telegramUserId: number;
  onSaved: (nickname: string) => void;
}

export const NicknameModal: React.FC<NicknameModalProps> = ({
  isOpen,
  telegramUserId,
  onSaved,
}) => {
  const [nickname, setNickname] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = nickname.trim();
    if (cleanName.length < 2) {
      setError('እባክዎ ቢያንስ 2 ፊደላት ያስገቡ (Minimum 2 characters)');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await supabase
        .from('telegram_users')
        .update({
          first_name: cleanName,
          display_name: cleanName,
        })
        .eq('telegram_user_id', telegramUserId);

      localStorage.setItem(`user_nickname_${telegramUserId}`, cleanName);
      triggerHaptic('heavy');
      onSaved(cleanName);
    } catch {
      // Local fallback
      localStorage.setItem(`user_nickname_${telegramUserId}`, cleanName);
      onSaved(cleanName);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fadeIn">
      <div className="bg-gradient-to-b from-slate-900 to-slate-950 border border-amber-500/40 rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl text-center">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-yellow-500/20 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400">
          <User className="w-7 h-7" />
        </div>

        <div>
          <div className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20 mb-1">
            <Sparkles className="w-3 h-3" />
            <span>እንኳን ደህና መጡ! Welcome</span>
          </div>
          <h3 className="text-lg font-black text-white">
            የመለያ ስምዎን ያስገቡ
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            በቢንጎ እና በሎቶ አሸናፊዎች ሰሌዳ ላይ የሚታይበትን ስም ይምረጡ።
            (Choose a display name for games & winner announcements)
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 pt-2">
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="ምሳሌ: አበበ / Abebe"
            maxLength={20}
            className="w-full bg-slate-900 border border-slate-700 rounded-2xl px-4 py-3 text-white text-center font-bold placeholder-slate-500 focus:outline-none focus:border-amber-500 text-sm shadow-inner"
            autoFocus
          />

          {error && (
            <div className="text-xs text-red-400 font-medium">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || nickname.trim().length < 2}
            className="w-full py-3 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 text-slate-950 font-black rounded-2xl text-xs uppercase tracking-wider shadow-lg active:scale-98 transition-all disabled:opacity-50"
          >
            {isSubmitting ? 'እየተመዘገበ ነው...' : 'ቀጥል (Continue) →'}
          </button>
        </form>
      </div>
    </div>
  );
};
