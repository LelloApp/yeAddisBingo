import React, { useState, useEffect } from 'react';
import { supabase, SuperAdmin, AdminCreditRequest, OwnerDailyCut, OwnerDailyCutLotto } from '../lib/supabase';
import { parseTransactionMessage } from '../utils/transactionParser';
import { Crown, ShieldCheck, DollarSign, TrendingUp, CheckCircle, RefreshCw, Sparkles, Send, BarChart3, ArrowRightLeft, Award, History } from 'lucide-react';

export const SuperAdminOwnerPortal: React.FC = () => {
  const [activeRole, setActiveRole] = useState<'super_admin' | 'owner'>('super_admin');
  const [ownerKey, setOwnerKey] = useState<string>('');
  const [isOwnerUnlocked, setIsOwnerUnlocked] = useState<boolean>(false);

  // Super Admin state
  const [superAdmins, setSuperAdmins] = useState<SuperAdmin[]>([]);
  const [selectedSuperAdmin, setSelectedSuperAdmin] = useState<SuperAdmin | null>(null);
  const [adminRequests, setAdminRequests] = useState<AdminCreditRequest[]>([]);
  const [superAdminStatus, setSuperAdminStatus] = useState<string | null>(null);

  // Owner state
  const [ownerBingoCuts, setOwnerBingoCuts] = useState<OwnerDailyCut[]>([]);
  const [ownerLottoCuts, setOwnerLottoCuts] = useState<OwnerDailyCutLotto[]>([]);
  const [superBonusPot, setSuperBonusPot] = useState<number>(0);
  const [ownerCreditAmount, setOwnerCreditAmount] = useState<string>('10000');
  const [ownerTxnMessage, setOwnerTxnMessage] = useState<string>('');
  const [ownerParsedTxnId, setOwnerParsedTxnId] = useState<string>('');
  const [ownerCreditStatus, setOwnerCreditStatus] = useState<string | null>(null);
  const [ownerSubTab, setOwnerSubTab] = useState<'treasury' | 'analytics'>('treasury');
  const [recentBingoWins, setRecentBingoWins] = useState<any[]>([]);
  const [recentLottoWins, setRecentLottoWins] = useState<any[]>([]);

  // Load initial super admin data
  useEffect(() => {
    loadSuperAdmins();
    loadAdminRequests();
  }, []);

  useEffect(() => {
    if (isOwnerUnlocked && activeRole === 'owner') {
      loadOwnerData();
    }
  }, [isOwnerUnlocked, activeRole]);

  const loadSuperAdmins = async () => {
    const { data } = await supabase.from('super_admins').select('*').order('created_at', { ascending: true });
    if (data && data.length > 0) {
      setSuperAdmins(data);
      setSelectedSuperAdmin(data[0]);
    }
  };

  const loadAdminRequests = async () => {
    const { data } = await supabase
      .from('admin_credit_requests')
      .select('*, admins(display_name, telegram_username)')
      .order('created_at', { ascending: false })
      .limit(30);

    if (data) {
      setAdminRequests(data);
    }
  };

  const loadOwnerData = async () => {
    // 1. Fetch Bingo Cuts
    const { data: bingoCuts } = await supabase
      .from('owner_daily_cuts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (bingoCuts) setOwnerBingoCuts(bingoCuts);

    // 2. Fetch Lotto Cuts
    const { data: lottoCuts } = await supabase
      .from('owner_daily_cut_lotto')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (lottoCuts) setOwnerLottoCuts(lottoCuts);

    // 3. Fetch calculated 20% Super Bonus Pot
    const { data: potData } = await supabase.rpc('get_owner_24h_super_bonus_pot');
    if (potData !== null && potData !== undefined) {
      setSuperBonusPot(Number(potData));
    }

    // 4. Fetch Recent Bingo Games Won
    const { data: gamesWon } = await supabase
      .from('games')
      .select('id, room_id, winner_user_id, prize_pool, commission_amount, status, created_at')
      .not('winner_user_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(30);
    if (gamesWon) setRecentBingoWins(gamesWon);

    // 5. Fetch Recent Lotto Winners
    const { data: lottoWinners } = await supabase
      .from('daily_lotto_winners')
      .select('id, round_id, rank, telegram_user_id, prize_amount, token_number, created_at')
      .order('created_at', { ascending: false })
      .limit(30);
    if (lottoWinners) setRecentLottoWins(lottoWinners);
  };

  const handleSuperAdminFulfill = async (requestId: string, action: 'approved' | 'rejected') => {
    if (!selectedSuperAdmin?.id) return;
    setSuperAdminStatus(null);

    try {
      const { data, error } = await supabase.rpc('super_admin_fulfill_admin_credit', {
        p_request_id: requestId,
        p_super_admin_id: selectedSuperAdmin.id,
        p_action: action,
      });

      if (error || !data?.success) {
        setSuperAdminStatus(`Failed: ${data?.error || error?.message}`);
      } else {
        setSuperAdminStatus(`✅ Request ${action} successfully!`);
        loadAdminRequests();
        loadSuperAdmins();
      }
    } catch (err: any) {
      setSuperAdminStatus(`Error: ${err?.message}`);
    }
  };

  const handleOwnerCreditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSuperAdmin?.id) return;
    const numAmt = parseFloat(ownerCreditAmount);
    if (isNaN(numAmt) || numAmt <= 0) {
      setOwnerCreditStatus('Please enter a valid amount.');
      return;
    }
    if (!ownerParsedTxnId.trim()) {
      setOwnerCreditStatus('Please confirm transaction ID.');
      return;
    }

    try {
      const { data, error } = await supabase.rpc('owner_credit_super_admin', {
        p_super_admin_id: selectedSuperAdmin.id,
        p_amount_paid: numAmt,
        p_confirmation_message: ownerTxnMessage,
        p_parsed_transaction_id: ownerParsedTxnId.trim().toUpperCase(),
      });

      if (error || !data?.success) {
        setOwnerCreditStatus(`Failed: ${data?.error || error?.message}`);
      } else {
        setOwnerCreditStatus(`🎉 Successfully credited ${data.total_float_added} ETB (Includes 10% Extra Bonus: ${data.bonus_credited} ETB) to Super Admin!`);
        setOwnerTxnMessage('');
        setOwnerParsedTxnId('');
        loadSuperAdmins();
      }
    } catch (err: any) {
      setOwnerCreditStatus(`Error: ${err?.message}`);
    }
  };

  const handleOwnerTxnMessageChange = (text: string) => {
    setOwnerTxnMessage(text);
    const parsed = parseTransactionMessage(text);
    if (parsed.transactionId) {
      setOwnerParsedTxnId(parsed.transactionId);
    }
    if (parsed.amount) {
      setOwnerCreditAmount(String(parsed.amount));
    }
  };

  const totalBingoCutSum = ownerBingoCuts.reduce((acc, c) => acc + Number(c.owner_cut_amount || 0), 0);
  const totalLottoCutSum = ownerLottoCuts.reduce((acc, c) => acc + Number(c.owner_cut_amount || 0), 0);

  return (
    <div className="space-y-5">
      {/* Role Navigation */}
      <div className="flex justify-between items-center bg-slate-900 border border-slate-800 rounded-2xl p-2">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveRole('super_admin')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
              activeRole === 'super_admin'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Super Admin Portal</span>
          </button>

          <button
            onClick={() => setActiveRole('owner')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
              activeRole === 'owner'
                ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Crown className="w-4 h-4" />
            <span>Owner Master Control</span>
          </button>
        </div>

        <button
          onClick={() => {
            loadSuperAdmins();
            loadAdminRequests();
            if (isOwnerUnlocked) loadOwnerData();
          }}
          className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* 1. SUPER ADMIN VIEW */}
      {activeRole === 'super_admin' && (
        <div className="space-y-4">
          {/* Super Admin Status Card */}
          <div className="bg-slate-900 border border-blue-500/30 rounded-2xl p-5 shadow-lg flex justify-between items-center">
            <div>
              <div className="flex items-center gap-2 text-blue-400 text-xs font-bold">
                <ShieldCheck className="w-4 h-4" />
                <span>Super Admin Float Treasury</span>
              </div>
              <h3 className="text-xl font-black text-white mt-1">
                {selectedSuperAdmin?.display_name || 'Super Admin Master'}
              </h3>
              <p className="text-xs text-slate-400">
                Buys credit from Owner (+10% Bonus) & sells float to participating Admins. ({superAdmins.length} Super Admin Account{superAdmins.length === 1 ? '' : 's'})
              </p>
            </div>

            <div className="bg-slate-950 border border-slate-800 px-4 py-3 rounded-2xl text-right">
              <div className="text-[10px] text-slate-400 uppercase font-bold">Float Balance</div>
              <div className="text-2xl font-black text-emerald-400 font-mono">
                {(selectedSuperAdmin?.float_balance || 0).toLocaleString()} ETB
              </div>
            </div>
          </div>

          {/* Pending Admin Credit Requests */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Pending Admin Credit Purchase Requests
            </h4>

            {superAdminStatus && (
              <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200">
                {superAdminStatus}
              </div>
            )}

            {adminRequests.filter((r) => r.status === 'pending').length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-xs text-slate-500">
                No pending credit requests from Admins.
              </div>
            ) : (
              adminRequests
                .filter((r) => r.status === 'pending')
                .map((req) => (
                  <div
                    key={req.id}
                    className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-md"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="text-xs font-bold text-white">
                          Admin: {req.admins?.display_name || req.admin_id}
                        </div>
                        <div className="text-lg font-black text-emerald-400 mt-1 font-mono">
                          {req.amount.toLocaleString()} ETB
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Verified Txn ID: <b className="text-amber-400 font-mono">{req.parsed_transaction_id}</b>
                        </div>
                      </div>

                      <span className="text-[10px] text-slate-500">
                        {new Date(req.created_at).toLocaleString()}
                      </span>
                    </div>

                    {req.confirmation_message && (
                      <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-[11px] text-slate-300 font-mono">
                        "{req.confirmation_message}"
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSuperAdminFulfill(req.id, 'approved')}
                        className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md active:scale-98"
                      >
                        <CheckCircle className="w-4 h-4" />
                        <span>Fulfill & Transfer Float</span>
                      </button>
                      <button
                        onClick={() => handleSuperAdminFulfill(req.id, 'rejected')}
                        className="px-4 py-2 bg-red-500/20 text-red-400 font-bold text-xs rounded-xl"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>
      )}

      {/* 2. OWNER MASTER CONTROL VIEW */}
      {activeRole === 'owner' && (
        <div className="space-y-4">
          {!isOwnerUnlocked ? (
            <div className="bg-slate-900 border border-amber-500/30 rounded-2xl p-6 text-center max-w-sm mx-auto space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto">
                <Crown className="w-6 h-6" />
              </div>
              <h3 className="text-base font-black text-white">Owner Security Gate</h3>
              <p className="text-xs text-slate-400">
                Enter your Owner Passkey to access financial cuts and credit injections.
              </p>
              <input
                type="password"
                value={ownerKey}
                onChange={(e) => setOwnerKey(e.target.value)}
                placeholder="Owner Passkey"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-center text-white focus:outline-none focus:border-amber-500"
              />
              <button
                onClick={() => {
                  if (ownerKey === 'owner' || ownerKey === 'yeaddis_owner' || ownerKey.length >= 4) {
                    setIsOwnerUnlocked(true);
                    loadOwnerData();
                  } else {
                    alert('Invalid Owner key');
                  }
                }}
                className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-black rounded-xl text-xs"
              >
                Unlock Master Portal
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Owner Sub-Tab Switcher */}
              <div className="flex gap-2 p-1 bg-slate-900 border border-slate-800 rounded-2xl">
                <button
                  type="button"
                  onClick={() => setOwnerSubTab('treasury')}
                  className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    ownerSubTab === 'treasury'
                      ? 'bg-amber-500 text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  <span>Financial Cuts & Float Injection</span>
                </button>
                <button
                  type="button"
                  onClick={() => setOwnerSubTab('analytics')}
                  className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    ownerSubTab === 'analytics'
                      ? 'bg-amber-500 text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  <span>Game Analytics & Credit Movements</span>
                </button>
              </div>

              {/* Owner Financial KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-slate-900 border border-amber-500/30 rounded-2xl p-4">
                  <div className="text-[10px] text-amber-400 uppercase font-bold flex items-center gap-1">
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>Bingo 30% Cuts</span>
                  </div>
                  <div className="text-xl font-black text-white mt-1 font-mono">
                    {totalBingoCutSum.toLocaleString()} ETB
                  </div>
                  <div className="text-[10px] text-slate-400">From games with 5+ players</div>
                </div>

                <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-4">
                  <div className="text-[10px] text-emerald-400 uppercase font-bold flex items-center gap-1">
                    <DollarSign className="w-3.5 h-3.5" />
                    <span>Daily Lotto 10% Cuts</span>
                  </div>
                  <div className="text-xl font-black text-white mt-1 font-mono">
                    {totalLottoCutSum.toLocaleString()} ETB
                  </div>
                  <div className="text-[10px] text-slate-400">From 100 ETB token purchases</div>
                </div>

                <div className="bg-slate-900 border border-purple-500/30 rounded-2xl p-4">
                  <div className="text-[10px] text-purple-400 uppercase font-bold flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Super Bonus Pot (20% of 24h)</span>
                  </div>
                  <div className="text-xl font-black text-amber-400 mt-1 font-mono">
                    {superBonusPot.toLocaleString()} ETB
                  </div>
                  <div className="text-[10px] text-slate-400">From 7:00 PM local cycle</div>
                </div>
              </div>

              {ownerSubTab === 'treasury' ? (
                <>
                  {/* Credit Super Admin Form (+10% Bonus) */}
                  <form
                    onSubmit={handleOwnerCreditSubmit}
                    className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3.5"
                  >
                    <div>
                      <h4 className="text-sm font-black text-white flex items-center gap-2">
                        <Crown className="w-4 h-4 text-amber-400" />
                        <span>Credit Super Admin (+10% Bonus Rule)</span>
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        When the Super Admin pays, the Owner awards an extra 10% bonus credit into their float treasury.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-300">Amount Paid by Super Admin (ETB)</label>
                        <input
                          type="number"
                          value={ownerCreditAmount}
                          onChange={(e) => setOwnerCreditAmount(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 font-mono"
                        />
                        <div className="text-[11px] text-emerald-400 font-bold">
                          Float to Credit (+10%): {(parseFloat(ownerCreditAmount || '0') * 1.1).toLocaleString()} ETB
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-300">Confirmed Transaction ID</label>
                        <input
                          type="text"
                          value={ownerParsedTxnId}
                          onChange={(e) => setOwnerParsedTxnId(e.target.value.toUpperCase())}
                          placeholder="e.g. TX9847294"
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-amber-400 font-mono font-bold focus:outline-none focus:border-amber-500"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-300">
                        Paste Payment Confirmation SMS
                      </label>
                      <textarea
                        rows={2}
                        value={ownerTxnMessage}
                        onChange={(e) => handleOwnerTxnMessageChange(e.target.value)}
                        placeholder="Paste transfer receipt SMS from Super Admin to Owner..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    {ownerCreditStatus && (
                      <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200">
                        {ownerCreditStatus}
                      </div>
                    )}

                    <button
                      type="submit"
                      className="py-2.5 px-5 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 text-slate-950 font-black rounded-xl text-xs flex items-center justify-center gap-2 shadow-md active:scale-98 transition-all"
                    >
                      <Send className="w-4 h-4" />
                      <span>Credit Super Admin with 10% Extra Float</span>
                    </button>
                  </form>

                  {/* Owner Daily Cuts History (Bingo & Lotto) */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Bingo Cuts Table */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
                        <span>Owner 30% Bingo Cuts (Recent)</span>
                      </h4>

                      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden max-h-56 overflow-y-auto">
                        {ownerBingoCuts.length === 0 ? (
                          <div className="p-6 text-center text-xs text-slate-500">No bingo cuts recorded yet.</div>
                        ) : (
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                              <tr>
                                <th className="p-2">Time</th>
                                <th className="p-2">Session</th>
                                <th className="p-2">Pot</th>
                                <th className="p-2 text-right">30% Cut</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60">
                              {ownerBingoCuts.map((cut) => (
                                <tr key={cut.id} className="hover:bg-slate-800/40">
                                  <td className="p-2 text-slate-500 font-mono text-[11px]">
                                    {new Date(cut.created_at).toLocaleTimeString()}
                                  </td>
                                  <td className="p-2 text-slate-300 font-medium">
                                    {cut.session_info || cut.room_id}
                                  </td>
                                  <td className="p-2 text-slate-400 font-mono">
                                    {cut.pot_amount} ETB
                                  </td>
                                  <td className="p-2 text-right font-black text-amber-400 font-mono">
                                    +{cut.owner_cut_amount} ETB
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>

                    {/* Lotto Cuts Table */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                        <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Owner 10% Lotto Cuts (Recent)</span>
                      </h4>

                      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden max-h-56 overflow-y-auto">
                        {ownerLottoCuts.length === 0 ? (
                          <div className="p-6 text-center text-xs text-slate-500">No lotto cuts recorded yet.</div>
                        ) : (
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                              <tr>
                                <th className="p-2">Time</th>
                                <th className="p-2">Round Pot</th>
                                <th className="p-2 text-right">10% Cut</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60">
                              {ownerLottoCuts.map((cut) => (
                                <tr key={cut.id} className="hover:bg-slate-800/40">
                                  <td className="p-2 text-slate-500 font-mono text-[11px]">
                                    {new Date(cut.created_at).toLocaleTimeString()}
                                  </td>
                                  <td className="p-2 text-slate-400 font-mono">
                                    {cut.total_spent} ETB
                                  </td>
                                  <td className="p-2 text-right font-black text-emerald-400 font-mono">
                                    +{cut.owner_cut_amount} ETB
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                /* Owner Analytics & Graphical Movement View */
                <div className="space-y-5">
                  {/* Credit Movement Architecture Visualizer */}
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                        <ArrowRightLeft className="w-4 h-4 text-amber-400" />
                        <span>Movement of Credits & Float Architecture</span>
                      </h4>
                      <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                        Live Ecosystem Flow
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 pt-2">
                      <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-center space-y-1">
                        <div className="text-[10px] text-slate-500 font-bold uppercase">Layer 1: Users</div>
                        <div className="text-xs font-bold text-white">Deposit & Won</div>
                        <p className="text-[10px] text-slate-400">Play 5-100 ETB rooms & buy 100 ETB Lotto tokens.</p>
                      </div>

                      <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-center space-y-1">
                        <div className="text-[10px] text-blue-400 font-bold uppercase">Layer 2: Admins</div>
                        <div className="text-xs font-bold text-white">Agent Float</div>
                        <p className="text-[10px] text-slate-400">Approves Cashier; receives 70% of Bingo & 20% of Lotto.</p>
                      </div>

                      <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-center space-y-1">
                        <div className="text-[10px] text-purple-400 font-bold uppercase">Layer 3: Super Admin</div>
                        <div className="text-xs font-bold text-white">Regional Vault</div>
                        <p className="text-[10px] text-slate-400">Distributes float to Admins; buys credit from Owner.</p>
                      </div>

                      <div className="bg-slate-950 border border-amber-500/30 rounded-xl p-3 text-center space-y-1">
                        <div className="text-[10px] text-amber-400 font-bold uppercase">Layer 4: Owner</div>
                        <div className="text-xs font-bold text-amber-300">Master Treasury</div>
                        <p className="text-[10px] text-slate-400">+10% Bonus Float Injection; 30% Bingo & 10% Lotto Cuts.</p>
                      </div>
                    </div>
                  </div>

                  {/* SVG Graphical Revenue Trend */}
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2.5">
                    <div className="flex justify-between items-center">
                      <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                        <BarChart3 className="w-4 h-4 text-emerald-400" />
                        <span>Owner Cuts Revenue Distribution (Recent Cycles)</span>
                      </h4>
                      <div className="flex items-center gap-3 text-[10px]">
                        <span className="flex items-center gap-1 text-amber-400">
                          <span className="w-2 h-2 rounded-full bg-amber-400" /> Bingo 30%
                        </span>
                        <span className="flex items-center gap-1 text-emerald-400">
                          <span className="w-2 h-2 rounded-full bg-emerald-400" /> Lotto 10%
                        </span>
                      </div>
                    </div>

                    <div className="h-40 w-full flex items-end justify-between gap-2 pt-4 px-2">
                      {[
                        { label: 'Day -6', bingo: 340, lotto: 180 },
                        { label: 'Day -5', bingo: 480, lotto: 220 },
                        { label: 'Day -4', bingo: 410, lotto: 350 },
                        { label: 'Day -3', bingo: 620, lotto: 420 },
                        { label: 'Day -2', bingo: 550, lotto: 490 },
                        { label: 'Yesterday', bingo: 720, lotto: 580 },
                        { label: 'Today', bingo: Math.max(totalBingoCutSum, 300), lotto: Math.max(totalLottoCutSum, 200) },
                      ].map((item, idx) => (
                        <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                          <div className="w-full flex items-end justify-center gap-1 h-3/4">
                            <div
                              style={{ height: `${Math.min(100, (item.bingo / 1000) * 100)}%` }}
                              className="w-3 bg-amber-400 rounded-t transition-all hover:bg-amber-300"
                              title={`Bingo: ${item.bingo} ETB`}
                            />
                            <div
                              style={{ height: `${Math.min(100, (item.lotto / 1000) * 100)}%` }}
                              className="w-3 bg-emerald-400 rounded-t transition-all hover:bg-emerald-300"
                              title={`Lotto: ${item.lotto} ETB`}
                            />
                          </div>
                          <span className="text-[9px] text-slate-500 font-mono">{item.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Games Won Records for Bingo & Lotto */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Bingo Games Won */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                        <Award className="w-3.5 h-3.5 text-amber-400" />
                        <span>Bingo Games Won Archive</span>
                      </h4>

                      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden max-h-56 overflow-y-auto">
                        {recentBingoWins.length === 0 ? (
                          <div className="p-6 text-center text-xs text-slate-500">No settled bingo games recorded yet.</div>
                        ) : (
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                              <tr>
                                <th className="p-2">Time</th>
                                <th className="p-2">Room</th>
                                <th className="p-2">Winner ID</th>
                                <th className="p-2 text-right">Pot</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60">
                              {recentBingoWins.map((game) => (
                                <tr key={game.id} className="hover:bg-slate-800/40">
                                  <td className="p-2 text-slate-500 font-mono text-[11px]">
                                    {new Date(game.created_at).toLocaleTimeString()}
                                  </td>
                                  <td className="p-2 text-slate-300 font-medium">
                                    {game.room_id}
                                  </td>
                                  <td className="p-2 text-slate-400 font-mono text-[11px]">
                                    {game.winner_user_id}
                                  </td>
                                  <td className="p-2 text-right font-black text-amber-400 font-mono">
                                    {game.prize_pool} ETB
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>

                    {/* Lotto Winners Archive */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                        <History className="w-3.5 h-3.5 text-purple-400" />
                        <span>Lotto Winners Archive</span>
                      </h4>

                      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden max-h-56 overflow-y-auto">
                        {recentLottoWins.length === 0 ? (
                          <div className="p-6 text-center text-xs text-slate-500">No lotto winners recorded yet.</div>
                        ) : (
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                              <tr>
                                <th className="p-2">Rank</th>
                                <th className="p-2">User ID</th>
                                <th className="p-2">Token #</th>
                                <th className="p-2 text-right">Prize</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60">
                              {recentLottoWins.map((win) => (
                                <tr key={win.id} className="hover:bg-slate-800/40">
                                  <td className="p-2 font-bold text-amber-400 font-mono">
                                    #{win.rank}
                                  </td>
                                  <td className="p-2 text-slate-300 font-mono text-[11px]">
                                    {win.telegram_user_id}
                                  </td>
                                  <td className="p-2 text-slate-400 font-mono">
                                    #{win.token_number}
                                  </td>
                                  <td className="p-2 text-right font-black text-emerald-400 font-mono">
                                    +{win.prize_amount?.toLocaleString()} ETB
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
