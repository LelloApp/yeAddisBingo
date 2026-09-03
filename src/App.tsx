import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClientProvider } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import { Lobby } from './components/Lobby';
import { GameRoom } from './components/GameRoom';
import { WalletDepositModal } from './components/WalletDepositModal';
import { NetworkQualityIndicator } from './components/NetworkQualityIndicator';
import { supabase } from './lib/supabase';
import { initTelegram, TelegramUser } from './utils/telegram';
import { config, queryClient } from './lib/walletConfig';
import { GroupSelector, BingoGroup } from './components/GroupSelector';
import { ExternalLink, X, ArrowLeft } from 'lucide-react';

const Admin = lazy(() => import('./components/Admin').then(module => ({ default: module.Admin })));

type View = 'lobby' | 'game' | 'admin';

function AppContent() {
  const { address, isConnected } = useAccount();
  const [view, setView] = useState<View>('lobby');
  const [appUser, setAppUser] = useState<TelegramUser | null>(null);
  const [gameId, setGameId] = useState<string | null>(() => localStorage.getItem('gameId'));
  const [playerId, setPlayerId] = useState<string | null>(() => localStorage.getItem('playerId'));
  const [gameStarted, setGameStarted] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [userBalance, setUserBalance] = useState(0);
  const [selectedGroup, setSelectedGroup] = useState<BingoGroup | null>(null);
  const [groups, setGroups] = useState<BingoGroup[]>([]);
  const [insufficientModalGroup, setInsufficientModalGroup] = useState<BingoGroup | null>(null);
  const walletRegistered = useRef(false);

  useEffect(() => {
    const telegramData = initTelegram();
    if (telegramData.user) {
      setAppUser(telegramData.user);
    }
  }, []);

  // Fetch active groups and check deep link params
  useEffect(() => {
    const DEFAULT_ROOMS: BingoGroup[] = [
      {
        id: 'starter_room',
        slug: 'starter_room',
        name: '🎯 Starter Room (10 ETB)',
        admin_name: 'Parcelic Admin',
        admin_username: 'parcelic',
        stake_amount: 10,
        min_balance: 10,
        online_players_count: 0,
      },
      {
        id: 'addis_classic',
        slug: 'addis_classic',
        name: '🎲 Addis Classic (20 ETB)',
        admin_name: 'Parcelic Admin',
        admin_username: 'parcelic',
        stake_amount: 20,
        min_balance: 20,
        online_players_count: 0,
      },
      {
        id: 'vip_diamond',
        slug: 'vip_diamond',
        name: '💎 VIP Diamond Club (50 ETB)',
        admin_name: 'Parcelic Admin',
        admin_username: 'parcelic',
        stake_amount: 50,
        min_balance: 50,
        online_players_count: 0,
      },
      {
        id: 'high_roller',
        slug: 'high_roller',
        name: '👑 High Roller Room (100 ETB)',
        admin_name: 'Parcelic Admin',
        admin_username: 'parcelic',
        stake_amount: 100,
        min_balance: 100,
        online_players_count: 0,
      },
      {
        id: 'fekadu_kera',
        slug: 'fekadu_kera',
        name: '🐮 ፍቃዱ ቄራ (10 ETB)',
        admin_name: 'Parcelic Admin',
        admin_username: 'parcelic',
        stake_amount: 10,
        min_balance: 10,
        online_players_count: 0,
      },
      {
        id: 'hasen_stadium',
        slug: 'hasen_stadium',
        name: '⚽️ ሀሰን ስታዲየም (10 ETB)',
        admin_name: 'Parcelic Admin',
        admin_username: 'parcelic',
        stake_amount: 10,
        min_balance: 10,
        online_players_count: 0,
      },
    ];

    const fetchGroups = async () => {
      try {
        let loadedGroups: any[] | null = null;
        const { data: activeData, error: activeErr } = await supabase
          .from('groups')
          .select('*')
          .eq('is_active', true);

        if (!activeErr && activeData && activeData.length > 0) {
          loadedGroups = activeData;
        } else {
          const { data: allData } = await supabase.from('groups').select('*');
          if (allData && allData.length > 0) {
            loadedGroups = allData;
          }
        }

        const validSlugs = new Set(['starter_room', 'addis_classic', 'vip_diamond', 'high_roller', 'fekadu_kera', 'hasen_stadium']);
        const filtered = (loadedGroups && loadedGroups.length > 0)
          ? loadedGroups.filter(
              (g: any) =>
                validSlugs.has(g.slug) &&
                (g.name.includes('🎯') ||
                  g.name.includes('🎲') ||
                  g.name.includes('💎') ||
                  g.name.includes('👑') ||
                  g.name.includes('🐮') ||
                  g.name.includes('⚽️'))
            )
          : [];

        const formatted: BingoGroup[] = filtered.length > 0
          ? filtered.map((g: any) => ({
              id: g.id,
              slug: g.slug || g.id,
              name: g.name,
              admin_name: g.admin_name || 'Parcelic Admin',
              admin_username: g.admin_username || 'parcelic',
              stake_amount: g.stake_amount || 10,
              min_balance: g.min_balance || 10,
              online_players_count: g.online_players_count || 0,
            }))
          : DEFAULT_ROOMS;

        setGroups(formatted);

        const tg = initTelegram();
        if (tg.groupIdFromParam) {
          const matched = formatted.find(
            (g) => g.slug === tg.groupIdFromParam || g.id === tg.groupIdFromParam
          );
          if (matched) {
            if (userBalance >= matched.min_balance) {
              setSelectedGroup(matched);
            } else {
              setInsufficientModalGroup(matched);
            }
          }
        }
      } catch (err) {
        console.warn('Could not fetch rooms from DB, using defaults:', err);
        setGroups(DEFAULT_ROOMS);
      }
    };
    fetchGroups();
  }, [userBalance]);

  // Sync user balance for group gating
  useEffect(() => {
    if (!appUser?.id) return;
    const loadUserBalance = async () => {
      const { data } = await supabase
        .from('telegram_users')
        .select('balance, deposited_balance, won_balance')
        .eq('telegram_user_id', appUser.id)
        .maybeSingle();

      if (data) {
        const total = (data.deposited_balance || 0) + (data.won_balance || 0) || data.balance || 0;
        setUserBalance(total);

        // Check if user came from a deep link for a specific group
        const tg = initTelegram();
        if (tg.groupIdFromParam && groups.length > 0) {
          const matched = groups.find(
            (g) => g.slug === tg.groupIdFromParam || g.id === tg.groupIdFromParam
          );
          if (matched) {
            if (total >= matched.min_balance) {
              setSelectedGroup(matched);
            } else {
              setInsufficientModalGroup(matched);
              setSelectedGroup(null);
            }
          }
        }
      }
    };
    loadUserBalance();
  }, [appUser?.id, groups]);

  useEffect(() => {
    if (appUser || !isConnected || !address || walletRegistered.current) return;

    const registerWalletUser = async () => {
      try {
        walletRegistered.current = true;
        const { data, error } = await supabase.rpc('get_or_create_wallet_user', {
          p_wallet_address: address,
        });

        if (error || !data?.success) {
          walletRegistered.current = false;
          return;
        }

        const user = data.user;
        setAppUser({
          id: user.telegram_user_id,
          first_name: user.telegram_first_name || `${address.slice(0, 6)}...${address.slice(-4)}`,
          username: user.telegram_username || undefined,
        });
      } catch {
        walletRegistered.current = false;
      }
    };

    registerWalletUser();
  }, [isConnected, address, appUser]);

  useEffect(() => {
    if (!isConnected && !appUser) {
      walletRegistered.current = false;
    }
  }, [isConnected, appUser]);

  useEffect(() => {
    if (gameId) {
      localStorage.setItem('gameId', gameId);
    } else {
      localStorage.removeItem('gameId');
    }
  }, [gameId]);

  useEffect(() => {
    if (playerId) {
      localStorage.setItem('playerId', playerId);
    } else {
      localStorage.removeItem('playerId');
    }
  }, [playerId]);

  useEffect(() => {
    const restoreSession = async () => {
      if (!playerId || !gameId) return;

      const { data: game } = await supabase
        .from('games')
        .select('status')
        .eq('id', gameId)
        .maybeSingle();

      if (game?.status === 'playing' || game?.status === 'finished') {
        setGameStarted(true);
      } else if (!game) {
        setGameId(null);
        setPlayerId(null);
        setGameStarted(false);
      }
    };

    restoreSession();
  }, []);

  useEffect(() => {
    const checkForActiveGames = async () => {
      if (gameId && gameStarted) {
        const { data: currentGame } = await supabase
          .from('games')
          .select('status')
          .eq('id', gameId)
          .maybeSingle();

        if (currentGame?.status === 'finished' || currentGame?.status === 'playing') {
          return;
        }
      }

      const { data: playingGames } = await supabase
        .from('games')
        .select('id')
        .eq('status', 'playing')
        .order('created_at', { ascending: false })
        .limit(1);

      if (playingGames && playingGames.length > 0) {
        const activeGameId = playingGames[0].id;

        if (appUser) {
          const { data: playerRecord } = await supabase
            .from('players')
            .select('id')
            .eq('game_id', activeGameId)
            .eq('telegram_user_id', appUser.id)
            .maybeSingle();

          setPlayerId(playerRecord?.id || null);
        } else {
          setPlayerId(null);
        }

        setGameId(activeGameId);
        setGameStarted(true);
      } else {
        if (gameId) {
          const { data: currentGame } = await supabase
            .from('games')
            .select('status')
            .eq('id', gameId)
            .maybeSingle();

          if (currentGame?.status === 'finished') {
            setGameStarted(true);
          } else {
            setGameStarted(false);
          }
        } else {
          setGameStarted(false);
        }
      }
    };

    checkForActiveGames();

    const activeGameChannel = supabase
      .channel('auto-redirect-games')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games' },
        () => { checkForActiveGames(); }
      )
      .subscribe();

    const pollInterval = setInterval(() => {
      if (!document.hidden) {
        checkForActiveGames();
      }
    }, 10000);

    return () => {
      supabase.removeChannel(activeGameChannel);
      clearInterval(pollInterval);
    };
  }, [appUser, gameId, gameStarted]);

  useEffect(() => {
    if (!playerId || !gameId) return;

    const playerChannel = supabase
      .channel(`player:${playerId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        (payload) => {
          const updatedGame = payload.new as { status: string };
          if (updatedGame.status === 'playing') {
            setGameStarted(true);
          }
        }
      )
      .subscribe();

    const pollInterval = setInterval(async () => {
      if (document.hidden) return;

      const { data: game } = await supabase
        .from('games')
        .select('status')
        .eq('id', gameId)
        .maybeSingle();

      if (game?.status === 'playing' && !gameStarted) {
        setGameStarted(true);
      }
    }, 5000);

    return () => {
      supabase.removeChannel(playerChannel);
      clearInterval(pollInterval);
    };
  }, [playerId, gameId, gameStarted]);

  const handleJoinGame = async (gameId: string, selectedNumber: number, user: TelegramUser, cardLayout?: number[][]) => {
    const playerName = user.username
      ? `@${user.username}`
      : user.first_name;

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    const response = await fetch(`${supabaseUrl}/functions/v1/select-card`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        gameId,
        cardNumber: selectedNumber,
        telegramUserId: user.id,
        playerName,
        telegramUsername: user.username || null,
        telegramFirstName: user.first_name,
        telegramLastName: user.last_name || null,
        cardLayout,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      if (result.error === 'Insufficient balance') {
        const { data: userData } = await supabase
          .from('telegram_users')
          .select('deposited_balance, won_balance')
          .eq('telegram_user_id', user.id)
          .maybeSingle();

        setUserBalance((userData?.deposited_balance || 0) + (userData?.won_balance || 0));
        setShowDepositModal(true);
      }
      throw new Error(result.error || 'Failed to join game');
    }

    setPlayerId(result.playerId);
    setGameId(gameId);
  };

  const handleSpectateGame = (gameId: string) => {
    setGameId(gameId);
    setGameStarted(true);
    setView('game');
  };

  useEffect(() => {
    const checkAdminPath = () => {
      if (window.location.pathname === '/admin') {
        setView('admin');
      }
    };
    checkAdminPath();
    window.addEventListener('popstate', checkAdminPath);
    return () => window.removeEventListener('popstate', checkAdminPath);
  }, []);

  const handleReturnToLobby = useCallback(() => {
    localStorage.removeItem('gameId');
    localStorage.removeItem('playerId');
    setGameId(null);
    setPlayerId(null);
    setGameStarted(false);
  }, []);

  if (view === 'admin') {
    return (
      <>
        <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center"><div className="text-gray-600">Loading admin panel...</div></div>}>
          <Admin />
        </Suspense>
        <NetworkQualityIndicator />
      </>
    );
  }

  if (gameId && gameStarted) {
    return (
      <>
        <GameRoom gameId={gameId} playerId={playerId} onReturnToLobby={handleReturnToLobby} />
        {appUser && (
          <WalletDepositModal
            isOpen={showDepositModal}
            onClose={() => setShowDepositModal(false)}
            telegramUserId={appUser.id}
            onSuccess={() => setShowDepositModal(false)}
          />
        )}
        <NetworkQualityIndicator />
      </>
    );
  }

  if (!selectedGroup && view === 'lobby' && !gameStarted) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-between">
        <GroupSelector
          groups={groups}
          userBalance={userBalance}
          onSelectGroup={(group) => setSelectedGroup(group)}
          onOpenDepositGuide={(group) => setInsufficientModalGroup(group)}
        />

        {insufficientModalGroup && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-slate-900 border border-amber-500/50 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
              <div className="flex justify-between items-start">
                <h3 className="font-bold text-lg text-white">Insufficient Balance</h3>
                <button
                  onClick={() => setInsufficientModalGroup(null)}
                  className="text-gray-400 hover:text-white p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-gray-300">
                To join <b className="text-amber-400">{insufficientModalGroup.name}</b>, you need at least{' '}
                <b className="text-green-400">{insufficientModalGroup.min_balance} ETB</b> in your account.
              </p>
              <div className="bg-slate-800/80 rounded-xl p-3 text-xs text-gray-300 flex justify-between">
                <span>Your Current Balance:</span>
                <span className="font-bold text-amber-400">{userBalance} ETB</span>
              </div>
              <div className="pt-2 flex flex-col gap-2">
                <button
                  onClick={() => {
                    const target = insufficientModalGroup.admin_username || 'parcelic';
                    const clean = target.replace(/^@/, '');
                    const url = `https://t.me/${clean}`;
                    if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.openTelegramLink) {
                      (window as any).Telegram.WebApp.openTelegramLink(url);
                    } else if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.openLink) {
                      (window as any).Telegram.WebApp.openLink(url);
                    } else {
                      window.open(url, '_blank');
                    }
                  }}
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 px-4 rounded-xl text-center flex items-center justify-center gap-2 shadow-lg text-sm active:scale-95 transition-all"
                >
                  <span>Contact Admin (@{insufficientModalGroup.admin_username || 'parcelic'})</span>
                  <ExternalLink className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setInsufficientModalGroup(null)}
                  className="bg-slate-800 hover:bg-slate-700 text-gray-300 py-2 px-4 rounded-xl text-xs font-semibold"
                >
                  Choose Another Room
                </button>
              </div>
            </div>
          </div>
        )}
        <NetworkQualityIndicator />
      </div>
    );
  }

  return (
    <>
      {selectedGroup && (
        <div className="bg-slate-900 border-b border-slate-800 px-4 py-2 flex items-center justify-between text-xs text-gray-300 sticky top-0 z-30 shadow-md">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="font-bold text-amber-400">{selectedGroup.name}</span>
            <span className="text-slate-400">({selectedGroup.stake_amount} ETB)</span>
          </div>
          <button
            onClick={() => setSelectedGroup(null)}
            className="flex items-center gap-1 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded-lg transition-colors font-medium text-[11px]"
          >
            <ArrowLeft className="w-3 h-3" />
            <span>Switch Room</span>
          </button>
        </div>
      )}
      <Lobby onJoinGame={handleJoinGame} onSpectateGame={handleSpectateGame} telegramUser={appUser} />
      {appUser && (
        <WalletDepositModal
          isOpen={showDepositModal}
          onClose={() => setShowDepositModal(false)}
          telegramUserId={appUser.id}
          onSuccess={() => setShowDepositModal(false)}
        />
      )}
      <NetworkQualityIndicator />
    </>
  );
}

function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <AppContent />
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default App;
