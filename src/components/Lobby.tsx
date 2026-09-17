import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAccount } from 'wagmi';
import { supabase, Game, Admin } from '../lib/supabase';
import { TelegramUser } from '../utils/telegram';
import { ToastContainer, ToastData } from './ToastContainer';
import { getCachedLayouts, setCachedLayouts } from '../utils/cardLayoutCache';
import { WalletDepositModal } from './WalletDepositModal';
import { BnbWithdrawalModal } from './BnbWithdrawalModal';
import { Sun, Moon, Wallet, Timer, Hash, Coins, ShieldCheck, ArrowLeft } from 'lucide-react';
import { BingoGroup } from './GroupSelector';

interface LobbyProps {
  onJoinGame: (gameId: string, selectedNumber: number, telegramUser: TelegramUser, cardLayout?: number[][]) => void;
  onSpectateGame?: (gameId: string) => void;
  telegramUser: TelegramUser | null;
  selectedGroup?: BingoGroup | null;
  selectedAdmin?: Admin | null;
  onSwitchRoom?: () => void;
}

interface RegisteredUser {
  telegram_user_id: number;
  balance: number;
  deposited_balance: number;
  won_balance: number;
  telegram_username?: string;
  telegram_first_name: string;
  referral_code?: string;
  total_referrals?: number;
}

interface PlayerInfo {
  selected_number: number;
  name: string;
  telegram_user_id: number;
  id: string;
}

export function Lobby({ onJoinGame, onSpectateGame: _onSpectateGame, telegramUser, selectedGroup, selectedAdmin, onSwitchRoom }: LobbyProps) {
  const { address: walletAddress } = useAccount();
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  const [previewCard, setPreviewCard] = useState<number[][] | null>(null);
  const [activeGame, setActiveGame] = useState<Game | null>(null);
  const [takenNumbers, setTakenNumbers] = useState<number[]>([]);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [countdown, setCountdown] = useState<number>(0);
  const [registeredUser, setRegisteredUser] = useState<RegisteredUser | null>(null);
  const [, setIsCheckingRegistration] = useState(true);
  const [balanceChanged, setBalanceChanged] = useState(false);
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const [optimisticSelection, setOptimisticSelection] = useState<number | null>(null);
  const [processingNumbers, setProcessingNumbers] = useState<Set<number>>(new Set());
  const [timeOffset, setTimeOffset] = useState<number>(0);
  const [, setIsTimeSynced] = useState(false);
  const [, setIsLoadingData] = useState(true);
  const [cardLayoutCache, setCardLayoutCache] = useState<Map<number, number[][]>>(new Map());
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isWalletDepositModalOpen, setIsWalletDepositModalOpen] = useState(false);
  const [isBnbWithdrawalModalOpen, setIsBnbWithdrawalModalOpen] = useState(false);
  const [cardPage, setCardPage] = useState<number>(0); // 0: 1-100, 1: 101-200, 2: 201-300, 3: 301-400

  const canPlay = !!telegramUser;

  const addToast = useCallback((message: string, type: 'success' | 'error' | 'info') => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const syncTimeWithServer = useCallback(async () => {
    try {
      const clientTimeBefore = Date.now();
      const { data: serverTime } = await supabase.rpc('get_server_timestamp_ms');
      const clientTimeAfter = Date.now();

      if (serverTime) {
        const networkLatency = (clientTimeAfter - clientTimeBefore) / 2;
        const adjustedServerTime = serverTime + networkLatency;
        const offset = adjustedServerTime - clientTimeAfter;

        setTimeOffset(offset);
        setIsTimeSynced(true);
      }
    } catch (error) {
      console.error('Failed to sync time with server:', error);
      setIsTimeSynced(false);
    }
  }, []);

  const loadLobbyDataOptimized = useCallback(async () => {
    setIsLoadingData(true);

    try {
      const roomId = selectedGroup?.slug || selectedGroup?.id || 'starter_room';
      const adminId = selectedAdmin?.id || null;

      // Try room and admin-scoped v2 lobby RPC
      const { data: v2Data, error: v2Error } = await supabase.rpc('get_lobby_data_v2', {
        p_room_id: roomId,
        p_telegram_user_id: telegramUser?.id || null,
        p_admin_id: adminId,
      });

      if (!v2Error && v2Data) {
        const { game, server_time, taken_numbers, players: playersList, user } = v2Data;

        if (game) {
          setActiveGame(game);
          setTakenNumbers(taken_numbers || []);
          setPlayers(playersList || []);

          if (server_time) {
            const clientTime = Date.now();
            const offset = server_time - clientTime;
            setTimeOffset(offset);
            setIsTimeSynced(true);
          }
        } else {
          await createNewGame();
        }

        if (user) {
          setRegisteredUser({
            telegram_user_id: user.telegram_user_id,
            balance: user.balance || 0,
            deposited_balance: user.deposited_balance || 0,
            won_balance: user.won_balance || 0,
            telegram_username: user.telegram_username,
            telegram_first_name: user.telegram_first_name,
          });
        }
        setIsCheckingRegistration(false);
        return;
      }

      // Legacy fallback
      const { data, error } = await supabase.rpc('get_lobby_data_instant', {
        user_telegram_id: telegramUser?.id || null,
        user_wallet_address: (!telegramUser && walletAddress) ? walletAddress : null
      });

      if (error) {
        console.error('[Lobby] Error loading lobby data via RPC:', error);
      }

      if (data) {
        const { game, serverTime, takenNumbers, players: playersList, user } = data;

        if (game) {
          setActiveGame(game);
          setTakenNumbers(takenNumbers || []);
          setPlayers(playersList || []);

          if (serverTime) {
            const clientTime = Date.now();
            const offset = serverTime - clientTime;
            setTimeOffset(offset);
            setIsTimeSynced(true);
          }
        } else {
          await createNewGame();
        }

        if (user) {
          setRegisteredUser(user);
          setIsCheckingRegistration(false);
        }
      }
    } catch (error) {
      console.error('[Lobby] Failed to load lobby data:', error);
      setIsTimeSynced(false);
      setIsCheckingRegistration(false);
    } finally {
      setIsLoadingData(false);
    }
  }, [telegramUser, walletAddress, selectedGroup, selectedAdmin]);

  const getSyncedTime = useCallback(() => {
    return Date.now() + timeOffset;
  }, [timeOffset]);

  const fetchCardLayout = useCallback(async (cardNumber: number): Promise<number[][] | null> => {
    if (cardLayoutCache.has(cardNumber)) {
      return cardLayoutCache.get(cardNumber)!;
    }

    try {
      const { data, error } = await supabase.rpc('get_or_create_card_layout', {
        p_card_number: cardNumber
      });

      if (error) {
        return null;
      }

      if (data) {
        const layout = data as number[][];
        setCardLayoutCache(prev => new Map(prev).set(cardNumber, layout));
        return layout;
      }

      return null;
    } catch {
      return null;
    }
  }, [cardLayoutCache]);

  const layoutsLoadedRef = useRef(false);

  const loadAllCardLayouts = useCallback(async () => {
    if (layoutsLoadedRef.current) return;
    layoutsLoadedRef.current = true;

    try {
      const cachedLayouts = await getCachedLayouts();
      if (cachedLayouts && Object.keys(cachedLayouts).length >= 400) {
        const newCache = new Map<number, number[][]>();
        for (const [key, value] of Object.entries(cachedLayouts)) {
          newCache.set(parseInt(key, 10), value);
        }
        setCardLayoutCache(newCache);
        return;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/get-card-layouts?all=true`, {
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch card layouts');
      }

      const layouts: Record<string, number[][]> = await response.json();

      const newCache = new Map<number, number[][]>();
      const persistLayouts: Record<number, number[][]> = {};

      for (const [key, value] of Object.entries(layouts)) {
        const cardNum = parseInt(key, 10);
        newCache.set(cardNum, value);
        persistLayouts[cardNum] = value;
      }

      setCardLayoutCache(newCache);
      setCachedLayouts(persistLayouts).catch(() => {});
    } catch {
      layoutsLoadedRef.current = false;
    }
  }, []);

  useEffect(() => {
    syncTimeWithServer();

    const syncInterval = setInterval(() => {
      syncTimeWithServer();
    }, 30000);

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        syncTimeWithServer();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(syncInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [syncTimeWithServer]);

  useEffect(() => {
    loadLobbyDataOptimized();
    loadAllCardLayouts();

    if (!telegramUser) return;

    const userChannel = supabase
      .channel(`user:${telegramUser.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'telegram_users', filter: `telegram_user_id=eq.${telegramUser.id}` },
        (payload) => {
          if (payload.new) {
            setRegisteredUser(payload.new as RegisteredUser);
            setBalanceChanged(true);
            setTimeout(() => setBalanceChanged(false), 2000);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(userChannel);
    };
  }, [telegramUser, loadLobbyDataOptimized, loadAllCardLayouts]);

  useEffect(() => {
    const roomId = selectedGroup?.slug || selectedGroup?.id || 'starter_room';
    const gameChannel = supabase
      .channel(`games-${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games' },
        (payload) => {
          const game = (payload.new || payload.old) as any;
          if (game && (game.room_id === roomId || game.room_slug === roomId || !game.room_id)) {
            loadLobbyDataOptimized();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(gameChannel);
    };
  }, [loadLobbyDataOptimized, selectedGroup]);

  useEffect(() => {
    if (!activeGame) return;

    const playersChannel = supabase
      .channel(`players-${activeGame.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'players',
          filter: `game_id=eq.${activeGame.id}`
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newPlayer = payload.new as PlayerInfo;
            if (newPlayer.selected_number) {
              setPlayers((prev) => [...prev, newPlayer]);
              setTakenNumbers((prev) => [...prev, newPlayer.selected_number]);
              setProcessingNumbers((prev) => {
                const next = new Set(prev);
                next.delete(newPlayer.selected_number);
                return next;
              });
            }
          } else if (payload.eventType === 'DELETE') {
            const deletedPlayer = payload.old as PlayerInfo;
            setPlayers((prev) => prev.filter(p => p.id !== deletedPlayer.id));
            setTakenNumbers((prev) => prev.filter(n => n !== deletedPlayer.selected_number));
          } else if (payload.eventType === 'UPDATE') {
            const updatedPlayer = payload.new as PlayerInfo;
            setPlayers((prev) => prev.map(p => p.id === updatedPlayer.id ? updatedPlayer : p));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(playersChannel);
    };
  }, [activeGame]);

  useEffect(() => {
    if (activeGame) {
      updateCountdown();
      const interval = setInterval(updateCountdown, 1000);
      return () => clearInterval(interval);
    }
  }, [activeGame]);

  useEffect(() => {
    if (selectedNumber && selectedNumber >= 1 && selectedNumber <= 400) {
      const layout = cardLayoutCache.get(selectedNumber);
      if (layout) {
        setPreviewCard(layout);
      } else {
        setIsLoadingPreview(true);
        fetchCardLayout(selectedNumber).then(layout => {
          if (layout) {
            setPreviewCard(layout);
          }
          setIsLoadingPreview(false);
        });
      }
    } else {
      setPreviewCard(null);
    }
  }, [selectedNumber, fetchCardLayout, cardLayoutCache]);

  useEffect(() => {
    if (telegramUser && players.length > 0) {
      const myPlayer = players.find(p => p.telegram_user_id === telegramUser.id);
      if (myPlayer) {
        setSelectedNumber(myPlayer.selected_number);
      }
    }
  }, [players, telegramUser]);

  const updateCountdown = async () => {
    if (!activeGame) return;
    const now = getSyncedTime();
    const startsAt = new Date(activeGame.starts_at).getTime();
    const diff = Math.max(0, Math.floor((startsAt - now) / 1000));
    setCountdown(diff);

    if (diff === 0 && activeGame.status === 'waiting') {
      const { data: players } = await supabase
        .from('players')
        .select('id')
        .eq('game_id', activeGame.id);

      if (players && players.length >= 2) {
        await startGame();
      } else {
        const { data: serverTime } = await supabase.rpc('get_server_timestamp_ms');

        if (serverTime) {
          const newStartTimeMs = serverTime + 30000;
          const newStartTime = new Date(newStartTimeMs).toISOString();
          const newSelectionClosedAt = new Date(newStartTimeMs - 5000).toISOString();

          const { data: updatedGame } = await supabase
            .from('games')
            .update({ starts_at: newStartTime, selection_closed_at: newSelectionClosedAt })
            .eq('id', activeGame.id)
            .select()
            .maybeSingle();

          if (updatedGame) {
            setActiveGame(updatedGame);
            const clientTime = Date.now();
            const offset = serverTime - clientTime;
            setTimeOffset(offset);
          }
        }
      }
    }
  };

  const createNewGame = async () => {
    const roomId = selectedGroup?.slug || selectedGroup?.id || 'starter_room';
    const { data: existingWaiting } = await supabase
      .from('games')
      .select('*')
      .eq('status', 'waiting')
      .or(`room_id.eq.${roomId},room_slug.eq.${roomId}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingWaiting) {
      setActiveGame(existingWaiting);
      return;
    }

    const { data: result } = await supabase.rpc('ensure_room_waiting_game', {
      p_room_id: roomId,
      p_seconds: 45
    });

    if (result && result.game_id) {
      const { data: gameRecord } = await supabase
        .from('games')
        .select('*')
        .eq('id', result.game_id)
        .maybeSingle();

      if (gameRecord) {
        setActiveGame(gameRecord);
      }
    }
  };

  const startGame = async () => {
    if (!activeGame) return;
    await supabase
      .from('games')
      .update({ status: 'playing', started_at: new Date().toISOString() })
      .eq('id', activeGame.id)
      .eq('status', 'waiting');
  };

  const handleNumberClick = async (num: number, isRetry = false) => {
    if (!canPlay || !activeGame || activeGame.status !== 'waiting') return;

    if (countdown > 0 && countdown < 3 && !isRetry) {
      addToast('Selection window is about to close!', 'error');
      return;
    }

    const myPlayer = players.find(p => p.telegram_user_id === telegramUser!.id);
    const clickedMyNumber = myPlayer && myPlayer.selected_number === num;
    const clickedOptimisticSelection = optimisticSelection === num;

    if (clickedMyNumber) {
      await handleDeselectNumber(myPlayer.id);
      return;
    }

    if (clickedOptimisticSelection) {
      setOptimisticSelection(null);
      setSelectedNumber(null);
      setProcessingNumbers((prev) => {
        const next = new Set(prev);
        next.delete(num);
        return next;
      });
      addToast(`Card ${num} deselected`, 'info');
      return;
    }

    if (myPlayer && !clickedMyNumber) {
      const oldNumber = myPlayer.selected_number;
      const deselectSuccess = await handleDeselectNumber(myPlayer.id);
      if (!deselectSuccess) return;
      addToast(`Changed from card ${oldNumber} to ${num}`, 'info');
    }

    if (optimisticSelection && optimisticSelection !== num && !myPlayer) {
      setOptimisticSelection(null);
      setSelectedNumber(null);
      setProcessingNumbers((prev) => {
        const next = new Set(prev);
        next.delete(optimisticSelection);
        return next;
      });
    }

    if (processingNumbers.has(num)) {
      addToast('That card is being processed. Please wait.', 'info');
      return;
    }

    setSelectedNumber(num);
    setOptimisticSelection(num);

    const layoutPromise = fetchCardLayout(num);

    setTimeout(() => {
      setProcessingNumbers((prev) => new Set(prev).add(num));
    }, 50);

    try {
      const layout = await layoutPromise;
      await onJoinGame(activeGame.id, num, telegramUser!, layout || undefined);
      setProcessingNumbers((prev) => {
        const next = new Set(prev);
        next.delete(num);
        return next;
      });
      addToast(`Card ${num} secured!`, 'success');
    } catch (error) {
      setOptimisticSelection(null);
      setSelectedNumber(null);
      setProcessingNumbers((prev) => {
        const next = new Set(prev);
        next.delete(num);
        return next;
      });

      const errorMessage = error instanceof Error ? error.message : '';

      if (errorMessage.includes('SELECTION_CLOSED') || errorMessage.includes('Selection window has closed')) {
        addToast('Selection window has closed. Game is starting!', 'error');
      } else if (errorMessage.includes('duplicate') || errorMessage.includes('already been taken') || errorMessage.includes('CARD_TAKEN')) {
        addToast('That card was just taken! Please choose another.', 'info');
      } else if (errorMessage.includes('balance') || errorMessage.includes('INSUFFICIENT_BALANCE')) {
        addToast('Insufficient balance to join this game.', 'error');
      } else if (errorMessage.includes('timeout') || errorMessage.includes('network')) {
        if (!isRetry) {
          addToast('Connection slow, retrying...', 'info');
          setTimeout(() => handleNumberClick(num, true), 500);
        } else {
          addToast('Unable to select card. Please try another or check connection.', 'error');
        }
      } else {
        addToast('Unable to select this card. Please try another.', 'error');
      }
    }
  };

  const handleDeselectNumber = async (playerId: string): Promise<boolean> => {
    if (!activeGame || !telegramUser) return false;

    const player = players.find(p => p.id === playerId);
    const cardNumber = player?.selected_number;
    if (!player || !cardNumber) return false;

    setOptimisticSelection(null);
    setSelectedNumber(null);
    setPreviewCard(null);

    const previousPlayers = [...players];
    const previousTakenNumbers = [...takenNumbers];

    setPlayers((prev) => prev.filter(p => p.id !== playerId));
    setTakenNumbers((prev) => prev.filter(n => n !== cardNumber));

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/deselect-card`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          playerId,
          telegramUserId: telegramUser.id
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to deselect card');
      }

      addToast(`Card ${cardNumber} released`, 'info');
      return true;
    } catch {
      addToast('Unable to deselect card. Please try again.', 'error');
      setPlayers(previousPlayers);
      setTakenNumbers(previousTakenNumbers);
      setSelectedNumber(cardNumber);
      return false;
    }
  };

  const playersByNumber = useMemo(() => {
    const map = new Map<number, PlayerInfo>();
    for (const player of players) {
      if (player.selected_number) {
        map.set(player.selected_number, player);
      }
    }
    return map;
  }, [players]);

  const numberStatusMap = useMemo(() => {
    const map = new Map<number, { status: 'taken' | 'mine' | 'available' | 'processing' | 'optimistic', playerName: string | null }>();

    for (let num = 1; num <= 400; num++) {
      let status: 'taken' | 'mine' | 'available' | 'processing' | 'optimistic' = 'available';
      let playerName: string | null = null;

      if (processingNumbers.has(num)) {
        status = 'processing';
      } else if (optimisticSelection === num) {
        status = 'optimistic';
      } else {
        const player = playersByNumber.get(num);
        if (player) {
          status = telegramUser && player.telegram_user_id === telegramUser.id ? 'mine' : 'taken';
          playerName = player.name;
        }
      }

      map.set(num, { status, playerName });
    }

    return map;
  }, [playersByNumber, telegramUser, processingNumbers, optimisticSelection]);

  const getNumberStatus = useCallback((num: number) => {
    return numberStatusMap.get(num)?.status || 'available';
  }, [numberStatusMap]);

  const getPlayerName = useCallback((num: number) => {
    return numberStatusMap.get(num)?.playerName || null;
  }, [numberStatusMap]);

  const numberGrid = useMemo(() => {
    const start = cardPage * 100 + 1;
    return Array.from({ length: 100 }, (_, i) => start + i);
  }, [cardPage]);

  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved === 'false' ? false : true;
  });

  useEffect(() => {
    localStorage.setItem('darkMode', String(isDarkMode));
  }, [isDarkMode]);

  const displayName = telegramUser?.first_name || (walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : 'Player');

  const totalBalance = (registeredUser?.deposited_balance || 0) + (registeredUser?.won_balance || 0) || (registeredUser?.balance || 0);

  return (
    <div className={`min-h-screen transition-colors duration-300 ${isDarkMode ? 'bg-gradient-to-br from-gray-900 to-gray-800' : 'bg-gradient-to-br from-blue-50 to-indigo-100'} p-2 sm:p-4`}>
      <div className="max-w-4xl mx-auto pt-1">
        {/* Active Room & Admin Info Header */}
        <div className={`rounded-2xl mb-3 transition-all duration-300 overflow-hidden ${isDarkMode ? 'bg-gray-800/90 border border-gray-700/40 shadow-lg shadow-black/20' : 'bg-white/95 border border-gray-200/60 shadow-lg shadow-black/5'}`}>
          <div className="flex items-center justify-between px-3 py-2.5 sm:px-4 sm:py-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className={`text-sm font-bold truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    {displayName}
                  </p>
                  {selectedGroup && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                      {selectedGroup.name}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[11px] mt-0.5">
                  <span className={isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}>
                    @{telegramUser?.username || 'player'}
                  </span>
                  {selectedAdmin && (
                    <span className="flex items-center gap-0.5 text-slate-400">
                      <ShieldCheck className="w-3 h-3 text-slate-500" />
                      <span>Admin: <b className="text-slate-300">{selectedAdmin.display_name}</b></span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {onSwitchRoom && (
                <button
                  onClick={onSwitchRoom}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-semibold bg-slate-700/60 hover:bg-slate-600/60 text-slate-300 transition-all"
                >
                  <ArrowLeft className="w-3 h-3" />
                  <span className="hidden sm:inline">Rooms</span>
                </button>
              )}

              {activeGame && countdown > 0 && (
                <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl transition-all ${
                  countdown <= 5
                    ? 'bg-red-500/15 border border-red-500/30 animate-pulse'
                    : isDarkMode ? 'bg-gray-700/60 border border-gray-600/30' : 'bg-gray-100 border border-gray-200/60'
                }`}>
                  <Timer className={`w-3.5 h-3.5 ${
                    countdown <= 5
                      ? 'text-red-400'
                      : isDarkMode ? 'text-gray-400' : 'text-gray-500'
                  }`} />
                  <span className={`text-sm font-bold tabular-nums ${
                    countdown <= 5
                      ? 'text-red-400'
                      : isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>
                    {countdown}s
                  </span>
                  <span className={`text-[10px] font-medium uppercase ${
                    countdown <= 5
                      ? 'text-red-400/70'
                      : isDarkMode ? 'text-gray-500' : 'text-gray-400'
                  }`}>
                    {countdown <= 5 ? 'closing' : 'start'}
                  </span>
                </div>
              )}

              <button
                onClick={() => setIsDarkMode(!isDarkMode)}
                className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${isDarkMode ? 'bg-gray-700/60 hover:bg-gray-600/60 text-amber-400' : 'bg-gray-100 hover:bg-gray-200 text-slate-600'}`}
              >
                {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className={`flex items-stretch border-t ${isDarkMode ? 'border-gray-700/40 bg-gray-900/30' : 'border-gray-100 bg-gray-50/50'}`}>
            <div className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 ${isDarkMode ? 'text-orange-400' : 'text-orange-600'}`}>
              <Hash className="w-3.5 h-3.5 opacity-60" />
              <span className="text-xs text-gray-400 font-normal">Card:</span>
              <span className="text-sm font-bold tabular-nums">{selectedNumber || '--'}</span>
            </div>

            <div className={`w-px ${isDarkMode ? 'bg-gray-700/40' : 'bg-gray-200/80'}`} />

            <div className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 transition-all ${balanceChanged ? 'scale-105' : ''} ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
              <Coins className="w-3.5 h-3.5 opacity-60" />
              <span className="text-xs text-gray-400 font-normal">Balance:</span>
              <span className="text-sm font-bold tabular-nums">{totalBalance} ETB</span>
            </div>

            <div className={`w-px ${isDarkMode ? 'bg-gray-700/40' : 'bg-gray-200/80'}`} />

            <div className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 ${isDarkMode ? 'text-amber-400' : 'text-amber-600'}`}>
              <Wallet className="w-3.5 h-3.5 opacity-60" />
              <span className="text-xs text-gray-400 font-normal">Stake:</span>
              <span className="text-sm font-bold tabular-nums">{activeGame?.stake_amount || selectedGroup?.stake_amount || 10} ETB</span>
            </div>
          </div>
        </div>

        {activeGame && countdown > 25 && activeGame.status === 'waiting' && (
          <div className={`border-l-4 p-2 mb-3 rounded transition-colors duration-300 ${isDarkMode ? 'bg-blue-900/20 border-blue-500 text-blue-300' : 'bg-blue-50 border-blue-400 text-blue-800'}`}>
            <p className="text-xs sm:text-sm font-medium">Extra time! Previous game just finished - you have more time to select your card.</p>
          </div>
        )}
        {activeGame && countdown > 0 && countdown <= 5 && activeGame.status === 'waiting' && (
          <div className={`border-l-4 p-3 mb-3 rounded transition-all duration-300 ${countdown <= 3 ? 'animate-pulse' : ''} ${isDarkMode ? 'bg-orange-900/30 border-orange-500 text-orange-200' : 'bg-orange-50 border-orange-500 text-orange-900'}`}>
            <p className="text-sm sm:text-base font-bold">
              Selection closing in {countdown} second{countdown !== 1 ? 's' : ''}!
            </p>
            <p className="text-xs sm:text-sm mt-1 opacity-90">
              Choose your card now or you may miss this game
            </p>
          </div>
        )}

        {/* Number Selection Grid */}
        <div className={`rounded-xl shadow-lg p-3 sm:p-4 mb-3 transition-colors duration-300 ${isDarkMode ? 'bg-gray-800/95 border border-gray-700/50' : 'bg-white border border-gray-100'}`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <div className="flex gap-2 text-[10px] sm:text-xs">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-green-500"></div>
                <span className={isDarkMode ? 'text-gray-300' : 'text-gray-600'}>Your pick</span>
              </div>
              <div className="flex items-center gap-1">
                <div className={`w-3 h-3 rounded ${isDarkMode ? 'bg-red-500/40' : 'bg-red-100'}`}></div>
                <span className={isDarkMode ? 'text-gray-300' : 'text-gray-600'}>Taken</span>
              </div>
            </div>

            {/* Range Filter for 400 Cards */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
              {[
                { label: '1-100', page: 0 },
                { label: '101-200', page: 1 },
                { label: '201-300', page: 2 },
                { label: '301-400', page: 3 },
              ].map((tab) => (
                <button
                  key={tab.page}
                  onClick={() => setCardPage(tab.page)}
                  className={`px-2.5 py-0.5 rounded-lg text-xs font-bold transition-all ${
                    cardPage === tab.page
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : isDarkMode
                      ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
              <span className={`text-[10px] sm:text-xs font-medium ml-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                {takenNumbers.length}/400
              </span>
            </div>
          </div>

          <div className="grid grid-cols-10 sm:grid-cols-15 md:grid-cols-20 gap-1 max-h-[40vh] overflow-y-auto p-1">
            {numberGrid.map((num) => {
              const status = getNumberStatus(num);
              const playerName = getPlayerName(num);
              const isSelectionClosing = countdown < 3 && countdown > 0;
              const isDisabled = status === 'taken' || status === 'processing' || (activeGame?.status === 'playing') || !canPlay || isSelectionClosing;

              return (
                <button
                  key={num}
                  onClick={() => handleNumberClick(num)}
                  disabled={isDisabled}
                  title={
                    playerName ? `Selected by ${playerName}` :
                    status === 'processing' ? 'Checking...' :
                    status === 'optimistic' ? 'Your selection' : ''
                  }
                  className={`
                    h-8 sm:h-9 flex flex-col items-center justify-center text-xs font-semibold rounded relative
                    select-none touch-manipulation transition-colors duration-150
                    ${status === 'taken'
                      ? isDarkMode ? 'bg-red-900/40 text-red-400 cursor-not-allowed' : 'bg-red-100 text-red-600 cursor-not-allowed'
                      : status === 'mine' || status === 'optimistic'
                      ? 'bg-green-500 text-white ring-2 sm:ring-4 ring-green-400 cursor-pointer active:scale-95 active:ring-green-500'
                      : status === 'processing'
                      ? isDarkMode ? 'bg-yellow-900/40 text-yellow-400 cursor-wait border-2 border-yellow-500' : 'bg-yellow-100 text-yellow-700 cursor-wait border-2 border-yellow-400'
                      : canPlay && activeGame?.status === 'waiting'
                      ? isDarkMode ? 'bg-gray-700 text-gray-200 cursor-pointer active:scale-95 active:bg-blue-700 active:shadow-inner' : 'bg-gray-100 text-gray-800 cursor-pointer active:scale-95 active:bg-blue-200 active:shadow-inner'
                      : isDarkMode ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }
                  `}
                >
                  <span className="font-bold">{num}</span>
                  {status === 'processing' && (
                    <span className="absolute top-0 right-0 w-1.5 h-1.5 m-0.5">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-yellow-500 opacity-75"></span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Bingo Card Preview */}
        {selectedNumber && (
          <div className={`rounded-xl shadow-lg p-4 mb-3 max-w-md mx-auto transition-colors duration-300 ${isDarkMode ? 'bg-gray-800/95 border border-gray-700/50' : 'bg-white border border-gray-100'}`}>
            {isLoadingPreview ? (
              <div className="flex items-center justify-center h-64">
                <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Loading card layout...</div>
              </div>
            ) : previewCard ? (
              <>
                <div className="grid grid-cols-5 gap-1.5 mb-1.5">
                  {['B', 'I', 'N', 'G', 'O'].map((letter) => (
                    <div
                      key={letter}
                      className="h-8 sm:h-10 flex items-center justify-center bg-blue-600 text-white font-bold text-sm sm:text-base rounded"
                    >
                      {letter}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  {Array.from({ length: 5 }, (_, rowIndex) =>
                    previewCard.map((column, colIndex) => {
                      const number = column[rowIndex];
                      const isFree = colIndex === 2 && rowIndex === 2;
                      return (
                        <div
                          key={`${colIndex}-${rowIndex}`}
                          className={`h-10 sm:h-12 flex items-center justify-center text-xs sm:text-sm font-semibold rounded transition-colors duration-300 ${
                            isFree ? isDarkMode ? 'bg-yellow-500 text-gray-900' : 'bg-yellow-400 text-gray-800' : isDarkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {isFree ? '\u2605' : number}
                        </div>
                      );
                    })
                  )}
                </div>
                {getNumberStatus(selectedNumber!) === 'mine' && (
                  <div className={`mt-3 rounded-lg p-2 border text-center transition-colors duration-300 ${isDarkMode ? 'bg-green-900/20 border-green-600 text-green-300' : 'bg-green-50 border-green-200 text-gray-700'}`}>
                    <p className="text-[10px] sm:text-xs">Tap same card to deselect or tap another to change</p>
                  </div>
                )}
              </>
            ) : null}
          </div>
        )}

      </div>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      {telegramUser && (
        <>
          <WalletDepositModal
            isOpen={isWalletDepositModalOpen}
            onClose={() => setIsWalletDepositModalOpen(false)}
            telegramUserId={telegramUser.id}
            onSuccess={() => {
              addToast('Deposit successful! Your balance will be updated shortly.', 'success');
              loadLobbyDataOptimized();
            }}
          />
          <BnbWithdrawalModal
            isOpen={isBnbWithdrawalModalOpen}
            onClose={() => setIsBnbWithdrawalModalOpen(false)}
            telegramUserId={telegramUser.id}
            wonBalance={registeredUser?.won_balance || 0}
            depositedBalance={registeredUser?.deposited_balance || 0}
            onSuccess={() => {
              addToast('Withdrawal request submitted successfully!', 'success');
              loadLobbyDataOptimized();
            }}
          />
        </>
      )}
    </div>
  );
}
