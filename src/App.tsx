import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClientProvider } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import { Lobby } from './components/Lobby';
import { GameRoom } from './components/GameRoom';
import { WalletDepositModal } from './components/WalletDepositModal';
import { NetworkQualityIndicator } from './components/NetworkQualityIndicator';
import { supabase, Admin as AdminType } from './lib/supabase';
import { initTelegram, TelegramUser } from './utils/telegram';
import { config, queryClient } from './lib/walletConfig';
import { GroupSelector, BingoGroup } from './components/GroupSelector';
import { DailyLottoPage } from './components/DailyLottoPage';
import { DailySuperBonusLottoPage } from './components/DailySuperBonusLottoPage';
import { CashierModal } from './components/CashierModal';
import { ExternalLink, X } from 'lucide-react';

const Admin = lazy(() => import('./components/Admin').then(module => ({ default: module.Admin })));

type View = 'lobby' | 'game' | 'admin' | 'daily_lotto' | 'super_bonus';

function AppContent() {
  const { address, isConnected } = useAccount();
  const [view, setView] = useState<View>('lobby');
  const [appUser, setAppUser] = useState<TelegramUser | null>(null);
  const [gameId, setGameId] = useState<string | null>(() => localStorage.getItem('gameId'));
  const [playerId, setPlayerId] = useState<string | null>(() => localStorage.getItem('playerId'));
  const [gameStarted, setGameStarted] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showCashierModal, setShowCashierModal] = useState(false);
  const [userBalance, setUserBalance] = useState(0);
  const [wonBalance, setWonBalance] = useState(0);
  const [depositedBalance, setDepositedBalance] = useState(0);
  const [selectedGroup, setSelectedGroup] = useState<BingoGroup | null>(null);
  const [groups, setGroups] = useState<BingoGroup[]>([]);
  const [admins, setAdmins] = useState<AdminType[]>([]);
  const [selectedAdmin, setSelectedAdmin] = useState<AdminType | null>(null);
  const [insufficientModalGroup, setInsufficientModalGroup] = useState<BingoGroup | null>(null);
  const walletRegistered = useRef(false);

  useEffect(() => {
    const telegramData = initTelegram();
    if (telegramData.user) {
      setAppUser(telegramData.user);
    }
  }, []);

  // Fetch 6 active rooms and admins, check deep link params
  useEffect(() => {
    const DEFAULT_ROOMS: BingoGroup[] = [
      {
        id: 'beginner_room',
        slug: 'beginner_room',
        name: '🌱 Beginner Room (5 ETB)',
        admin_name: 'Parcelic Admin',
        admin_username: 'parcelic',
        stake_amount: 5,
        min_balance: 5,
        online_players_count: 5,
      },
      {
        id: 'starter_room',
        slug: 'starter_room',
        name: '🎯 Starter Room (10 ETB)',
        admin_name: 'Parcelic Admin',
        admin_username: 'parcelic',
        stake_amount: 10,
        min_balance: 10,
        online_players_count: 20,
      },
      {
        id: 'standard_room',
        slug: 'standard_room',
        name: '🎲 Standard Room (15 ETB)',
        admin_name: 'Parcelic Admin',
        admin_username: 'parcelic',
        stake_amount: 15,
        min_balance: 15,
        online_players_count: 30,
      },
      {
        id: 'addis_classic',
        slug: 'addis_classic',
        name: '🏆 Addis Classic (25 ETB)',
        admin_name: 'Parcelic Admin',
        admin_username: 'parcelic',
        stake_amount: 25,
        min_balance: 25,
        online_players_count: 30,
      },
      {
        id: 'vip_diamond',
        slug: 'vip_diamond',
        name: '💎 VIP Diamond (50 ETB)',
        admin_name: 'Parcelic Admin',
        admin_username: 'parcelic',
        stake_amount: 50,
        min_balance: 50,
        online_players_count: 30,
      },
      {
        id: 'high_roller',
        slug: 'high_roller',
        name: '👑 High Roller (100 ETB)',
        admin_name: 'Parcelic Admin',
        admin_username: 'parcelic',
        stake_amount: 100,
        min_balance: 100,
        online_players_count: 30,
      },
    ];

    const fetchRoomsAndAdmins = async () => {
      try {
        // 1. Fetch Rooms from bingo_rooms table
        let loadedRooms: BingoGroup[] = DEFAULT_ROOMS;
        const { data: dbRooms, error: roomErr } = await supabase
          .from('bingo_rooms')
          .select('*')
          .eq('is_active', true)
          .order('sort_order', { ascending: true });

        if (!roomErr && dbRooms && dbRooms.length > 0) {
          loadedRooms = dbRooms.map((r: any) => ({
            id: r.id,
            slug: r.slug || r.id,
            name: r.name,
            admin_name: 'Parcelic Admin',
            admin_username: 'parcelic',
            stake_amount: r.stake_amount || 10,
            min_balance: r.min_balance || 10,
            online_players_count: r.display_online_count || 20,
          }));
        }
        setGroups(loadedRooms);

        // 2. Fetch Admins
        let loadedAdmins: AdminType[] = [];
        const { data: dbAdmins } = await supabase
          .from('admins')
          .select('*')
          .eq('is_active', true)
          .order('sort_order', { ascending: true });

        if (dbAdmins && dbAdmins.length > 0) {
          loadedAdmins = dbAdmins;
          setAdmins(dbAdmins);
        } else {
          loadedAdmins = [
            {
              id: '00000000-0000-0000-0000-000000000001',
              slug: 'parcelic',
              display_name: 'Parcelic Admin',
              telegram_username: 'parcelic',
              commission_rate: 0.10,
            },
            {
              id: '00000000-0000-0000-0000-000000000002',
              slug: 'fekadu_kera',
              display_name: 'ፍቃዱ ቄራ (Fekadu Kera)',
              telegram_username: 'fekadu_kera_bot',
              commission_rate: 0.10,
            },
            {
              id: '00000000-0000-0000-0000-000000000003',
              slug: 'hasen_stadium',
              display_name: 'ሀሰን ስታዲየም (Hasen Stadium)',
              telegram_username: 'hasen_stadium_bot',
              commission_rate: 0.10,
            },
          ];
          setAdmins(loadedAdmins);
        }

        // 3. Handle deep link params
        const tg = initTelegram();
        const urlParams = new URLSearchParams(window.location.search);
        const adminParam = tg.adminIdFromParam || urlParams.get('admin');

        if (adminParam && loadedAdmins.length > 0) {
          const matchedAdmin = loadedAdmins.find(
            (a) => a.id === adminParam || a.slug === adminParam || a.telegram_username?.replace(/^@/, '') === adminParam.replace(/^@/, '')
          );
          if (matchedAdmin) {
            setSelectedAdmin(matchedAdmin);
          } else {
            setSelectedAdmin(loadedAdmins[0]);
          }
        } else if (loadedAdmins.length > 0) {
          setSelectedAdmin(loadedAdmins[0]);
        }

        const roomParam = tg.roomIdFromParam || tg.groupIdFromParam || urlParams.get('room') || urlParams.get('group');
        if (roomParam && loadedRooms.length > 0) {
          const matchedRoom = loadedRooms.find(
            (g) => g.slug === roomParam || g.id === roomParam
          );
          if (matchedRoom) {
            setSelectedGroup(matchedRoom);
          }
        }
      } catch (err) {
        console.warn('Could not fetch rooms/admins from DB, using defaults:', err);
        setGroups(DEFAULT_ROOMS);
      }
    };
    fetchRoomsAndAdmins();
  }, []);

  // Sync user balance scoped to selectedAdmin
  useEffect(() => {
    if (!appUser?.id) return;
    const loadUserBalance = async () => {
      if (selectedAdmin?.id) {
        const { data: wallet } = await supabase
          .from('admin_user_wallets')
          .select('deposited_balance, won_balance')
          .eq('telegram_user_id', appUser.id)
          .eq('admin_id', selectedAdmin.id)
          .maybeSingle();

        if (wallet) {
          setDepositedBalance(wallet.deposited_balance || 0);
          setWonBalance(wallet.won_balance || 0);
          const total = (wallet.deposited_balance || 0) + (wallet.won_balance || 0);
          setUserBalance(total);
          return;
        }
      }

      // Legacy fallback
      const { data } = await supabase
        .from('telegram_users')
        .select('balance, deposited_balance, won_balance')
        .eq('telegram_user_id', appUser.id)
        .maybeSingle();

      if (data) {
        setDepositedBalance(data.deposited_balance || 0);
        setWonBalance(data.won_balance || 0);
        const total = (data.deposited_balance || 0) + (data.won_balance || 0) || data.balance || 0;
        setUserBalance(total);
      }
    };
    loadUserBalance();
  }, [appUser?.id, selectedAdmin]);

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

      let query = supabase
        .from('games')
        .select('id')
        .eq('status', 'playing')
        .order('created_at', { ascending: false });

      if (selectedGroup) {
        query = query.or(`room_id.eq.${selectedGroup.id},room_slug.eq.${selectedGroup.slug || selectedGroup.id}`);
      }

      const { data: playingGames } = await query.limit(1);

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
  }, [appUser, gameId, gameStarted, selectedGroup]);

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
        adminId: selectedAdmin?.id,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      if (result.error === 'Insufficient balance' || result.error_code === 'INSUFFICIENT_BALANCE') {
        if (selectedAdmin?.id) {
          const { data: walletData } = await supabase
            .from('admin_user_wallets')
            .select('deposited_balance, won_balance')
            .eq('telegram_user_id', user.id)
            .eq('admin_id', selectedAdmin.id)
            .maybeSingle();

          setUserBalance((walletData?.deposited_balance || 0) + (walletData?.won_balance || 0));
        }
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
      const path = window.location.pathname;
      const urlParams = new URLSearchParams(window.location.search);
      const isAdminQuery = urlParams.get('admin') === 'true' || urlParams.get('view') === 'admin';

      if (path === '/admin' || path === '/admin/' || isAdminQuery) {
        setView('admin');
      } else {
        setView('lobby');
      }
    };

    checkAdminPath();
    window.addEventListener('popstate', checkAdminPath);
    return () => window.removeEventListener('popstate', checkAdminPath);
  }, []);

  if (view === 'admin') {
    return (
      <Suspense fallback={
        <div className="min-h-screen bg-gray-900 flex items-center justify-center">
          <div className="text-white text-lg">Loading Admin Panel...</div>
        </div>
      }>
        <Admin />
      </Suspense>
    );
  }

  if (view === 'game' && gameId) {
    return (
      <GameRoom
        gameId={gameId}
        playerId={playerId}
        onReturnToLobby={() => {
          setGameId(null);
          setPlayerId(null);
          setGameStarted(false);
          setView('lobby');
        }}
      />
    );
  }

  if (view === 'daily_lotto') {
    return (
      <DailyLottoPage
        currentAdmin={selectedAdmin}
        telegramUserId={appUser?.id || 123456789}
        userBalance={userBalance}
        onOpenCashier={() => setShowCashierModal(true)}
        onBackToLobby={() => setView('lobby')}
      />
    );
  }

  if (view === 'super_bonus') {
    return (
      <DailySuperBonusLottoPage
        telegramUserId={appUser?.id || 123456789}
        userBalance={userBalance}
        onOpenCashier={() => setShowCashierModal(true)}
        onBackToLobby={() => setView('lobby')}
      />
    );
  }

  if (!selectedGroup && view === 'lobby' && !gameStarted) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-between">
        <GroupSelector
          groups={groups}
          admins={admins}
          selectedAdmin={selectedAdmin}
          onSelectAdmin={(admin) => setSelectedAdmin(admin)}
          userBalance={userBalance}
          onSelectGroup={(group) => setSelectedGroup(group)}
          onOpenDepositGuide={(group) => setInsufficientModalGroup(group)}
          onNavigateToLotto={() => setView('daily_lotto')}
          onNavigateToSuperBonus={() => setView('super_bonus')}
          onOpenCashier={() => setShowCashierModal(true)}
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
                    const target = selectedAdmin?.telegram_username || insufficientModalGroup.admin_username || 'parcelic';
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
                  <span>Contact Admin (@{selectedAdmin?.telegram_username?.replace(/^@/, '') || 'parcelic'})</span>
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
      <Lobby
        onJoinGame={handleJoinGame}
        onSpectateGame={handleSpectateGame}
        telegramUser={appUser}
        selectedGroup={selectedGroup}
        selectedAdmin={selectedAdmin}
        onSwitchRoom={() => setSelectedGroup(null)}
      />
      {appUser && (
        <WalletDepositModal
          isOpen={showDepositModal}
          onClose={() => setShowDepositModal(false)}
          telegramUserId={appUser.id}
          onSuccess={() => setShowDepositModal(false)}
        />
      )}
      <CashierModal
        isOpen={showCashierModal}
        onClose={() => setShowCashierModal(false)}
        telegramUserId={appUser?.id || 123456789}
        selectedAdmin={selectedAdmin}
        userBalance={userBalance}
        wonBalance={wonBalance}
        depositedBalance={depositedBalance}
        onBalanceUpdated={() => {
          // Re-sync balance
        }}
      />
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
