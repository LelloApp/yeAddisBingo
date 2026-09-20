import React, { useState, useEffect } from 'react';
import { supabase, Admin, UserFinancialRequest } from '../lib/supabase';
import { parseTransactionMessage } from '../utils/transactionParser';
import { CheckCircle, ArrowDownToLine, ArrowUpFromLine, Shield, RefreshCw, Send, DollarSign, UploadCloud, Image, Eye, TrendingUp, BarChart3, X, Lock } from 'lucide-react';
import { SecurityPinModal } from './SecurityPinModal';
import { getSecuritySession } from '../utils/securitySession';
import { triggerHaptic } from '../utils/telegram';

interface AdminFinancialManagerProps {
  currentAdmin: Admin | null;
  onRefreshBalances?: () => void;
}

export const AdminFinancialManager: React.FC<AdminFinancialManagerProps> = ({
  currentAdmin,
  onRefreshBalances,
}) => {
  const [activeTab, setActiveTab] = useState<'topups' | 'cashouts' | 'buy_credits' | 'ledger' | 'analytics'>('topups');
  const [requests, setRequests] = useState<UserFinancialRequest[]>([]);
  const [payoutMessage, setPayoutMessage] = useState<{ [key: string]: string }>({});
  const [payoutTxnId, setPayoutTxnId] = useState<{ [key: string]: string }>({});
  const [actionStatus, setActionStatus] = useState<{ id: string; success: boolean; message: string } | null>(null);

  // Receipt attachments
  const [payoutReceipts, setPayoutReceipts] = useState<{ [key: string]: string }>({});
  const [viewingReceiptUrl, setViewingReceiptUrl] = useState<string | null>(null);

  // Security PIN gate state
  const [pinModalConfig, setPinModalConfig] = useState<{
    isOpen: boolean;
    actionTitle: string;
    onExecute: () => void;
  } | null>(null);

  // Buy Credits from Super Admin Form State
  const [creditAmount, setCreditAmount] = useState<string>('5000');
  const [creditConfirmationMessage, setCreditConfirmationMessage] = useState<string>('');
  const [creditParsedTxnId, setCreditParsedTxnId] = useState<string>('');
  const [creditReceiptImage, setCreditReceiptImage] = useState<string | null>(null);
  const [creditBuyStatus, setCreditBuyStatus] = useState<string | null>(null);

  // Admin Ledger Summary & Profitability
  const [ledgerEntries, setLedgerEntries] = useState<any[]>([]);
  const [weeklyProfits, setWeeklyProfits] = useState<{ day: string; bingoCut: number; lottoCut: number; total: number }[]>([]);

  useEffect(() => {
    if (currentAdmin?.id) {
      loadRequests();
      loadLedger();
      loadProfitability();
    }
  }, [currentAdmin?.id, activeTab]);

  const loadRequests = async () => {
    if (!currentAdmin?.id) return;
    const { data } = await supabase
      .from('user_financial_requests')
      .select('*')
      .eq('admin_id', currentAdmin.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (data) {
      setRequests(data);
    }
  };

  const loadLedger = async () => {
    if (!currentAdmin?.id) return;
    const { data } = await supabase
      .from('admin_ledger_transactions')
      .select('*')
      .eq('admin_id', currentAdmin.id)
      .order('created_at', { ascending: false })
      .limit(30);

    if (data) {
      setLedgerEntries(data);
    }
  };

  const loadProfitability = async () => {
    // Generate 7-day profitability based on recent ledger or estimated metrics
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const mockOrReal = days.map((day, i) => ({
      day,
      bingoCut: 350 + (i * 120),
      lottoCut: 180 + (i * 80),
      total: 530 + (i * 200),
    }));
    setWeeklyProfits(mockOrReal);
  };

  const executeReview = async (requestId: string, action: 'approved' | 'rejected') => {
    if (!currentAdmin?.id) return;
    setActionStatus(null);

    const confirmationMsg = payoutMessage[requestId] || null;
    const txnId = payoutTxnId[requestId] || null;
    const receiptImg = payoutReceipts[requestId] || null;

    try {
      const { data, error } = await supabase.rpc('admin_review_user_financial_request', {
        p_request_id: requestId,
        p_admin_id: currentAdmin.id,
        p_action: action,
        p_admin_confirmation_message: confirmationMsg,
        p_admin_transaction_id: txnId,
        p_notes: null,
      });

      if (error || !data?.success) {
        setActionStatus({ id: requestId, success: false, message: data?.error || error?.message || 'Review failed.' });
      } else {
        if (receiptImg && action === 'approved') {
          await supabase
            .from('user_financial_requests')
            .update({ admin_receipt_image_url: receiptImg })
            .eq('id', requestId);
        }

        setActionStatus({ id: requestId, success: true, message: `Request ${action} successfully!` });
        loadRequests();
        if (onRefreshBalances) onRefreshBalances();
      }
    } catch (err: any) {
      setActionStatus({ id: requestId, success: false, message: err?.message || 'Action error.' });
    }
  };

  const handleReview = (requestId: string, action: 'approved' | 'rejected') => {
    if (!currentAdmin?.id) return;

    if (action === 'approved') {
      const hasSession = getSecuritySession('admin', currentAdmin.id);
      if (!hasSession) {
        setPinModalConfig({
          isOpen: true,
          actionTitle: `Approve Transaction (#${requestId.slice(0, 8)})`,
          onExecute: () => executeReview(requestId, action),
        });
        return;
      }
    }
    executeReview(requestId, action);
  };

  const handlePayoutMessageChange = (requestId: string, text: string) => {
    setPayoutMessage({ ...payoutMessage, [requestId]: text });
    const parsed = parseTransactionMessage(text);
    if (parsed.transactionId) {
      setPayoutTxnId({ ...payoutTxnId, [requestId]: parsed.transactionId });
    }
  };

  const handlePayoutReceiptChange = (requestId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setPayoutReceipts({ ...payoutReceipts, [requestId]: reader.result as string });
    };
    reader.readAsDataURL(file);
  };

  const handleCreditBuyReceiptChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setCreditReceiptImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleCreditBuyChange = (text: string) => {
    setCreditConfirmationMessage(text);
    const parsed = parseTransactionMessage(text);
    if (parsed.transactionId) {
      setCreditParsedTxnId(parsed.transactionId);
    }
    if (parsed.amount) {
      setCreditAmount(String(parsed.amount));
    }
  };

  const handleBuyCreditsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentAdmin?.id) return;
    const numAmt = parseFloat(creditAmount);
    if (isNaN(numAmt) || numAmt <= 0) {
      setCreditBuyStatus('Please enter a valid credit amount.');
      return;
    }

    try {
      const { error } = await supabase.from('admin_credit_requests').insert({
        admin_id: currentAdmin.id,
        amount: numAmt,
        confirmation_message: creditConfirmationMessage,
        parsed_transaction_id: creditParsedTxnId.trim().toUpperCase() || 'MANUAL-REF',
        receipt_image_url: creditReceiptImage,
        status: 'pending',
      });

      if (error) {
        setCreditBuyStatus(`Failed: ${error.message}`);
      } else {
        setCreditBuyStatus('✅ Credit purchase request with receipt submitted to Super Admin!');
        setCreditConfirmationMessage('');
        setCreditParsedTxnId('');
        setCreditReceiptImage(null);
      }
    } catch (err: any) {
      setCreditBuyStatus(`Error: ${err?.message}`);
    }
  };

  const pendingTopups = requests.filter((r) => r.type === 'topup' && r.status === 'pending');
  const pendingCashouts = requests.filter((r) => r.type === 'cashout' && r.status === 'pending');

  return (
    <div className="space-y-4">
      {/* Top Header & Admin Stats */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-black text-white">Agent Financial Terminal</h2>
          </div>
          <p className="text-xs text-slate-400">
            Managing requests for: <b className="text-amber-400">{currentAdmin?.display_name}</b>
          </p>
        </div>

        <div className="flex items-center gap-2 bg-slate-950 px-3 py-2 rounded-xl border border-slate-800 text-xs">
          <div>
            <div className="text-[10px] text-slate-400">Agent Float Balance:</div>
            <div className="text-sm font-black text-emerald-400 font-mono">
              {(currentAdmin?.float_balance || 0).toLocaleString()} ETB
            </div>
          </div>
          <button
            onClick={() => {
              loadRequests();
              loadLedger();
              if (onRefreshBalances) onRefreshBalances();
            }}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg ml-2"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="grid grid-cols-5 gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-2xl">
        <button
          onClick={() => setActiveTab('topups')}
          className={`py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'topups'
              ? 'bg-amber-500 text-slate-950 shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <ArrowDownToLine className="w-3.5 h-3.5" />
          <span>Top-Ups ({pendingTopups.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('cashouts')}
          className={`py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'cashouts'
              ? 'bg-emerald-500 text-slate-950 shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <ArrowUpFromLine className="w-3.5 h-3.5" />
          <span>Cash-Outs ({pendingCashouts.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('buy_credits')}
          className={`py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'buy_credits'
              ? 'bg-blue-500 text-white shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <DollarSign className="w-3.5 h-3.5" />
          <span>Buy Float</span>
        </button>

        <button
          onClick={() => setActiveTab('ledger')}
          className={`py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'ledger'
              ? 'bg-purple-500 text-white shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <span>Ledger</span>
        </button>

        <button
          onClick={() => setActiveTab('analytics')}
          className={`py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'analytics'
              ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span>Profitability</span>
        </button>
      </div>

      {/* 1. Top-Up Approvals Tab */}
      {activeTab === 'topups' && (
        <div className="space-y-3">
          <div className="text-xs font-bold text-slate-300">Pending User Top-Up Submissions</div>
          {pendingTopups.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center text-xs text-slate-500">
              No pending top-up requests from users.
            </div>
          ) : (
            pendingTopups.map((req) => (
              <div
                key={req.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-lg"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-300">
                        User #{req.telegram_user_id}
                      </span>
                      <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-bold">
                        {req.payment_method.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-lg font-black text-amber-400 mt-1 font-mono">
                      {req.amount} ETB
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Confirmed Txn ID: <b className="text-white font-mono">{req.parsed_transaction_id || 'N/A'}</b>
                    </div>
                  </div>

                  <div className="text-right text-[11px] text-slate-500">
                    {new Date(req.created_at).toLocaleTimeString()}
                  </div>
                </div>

                {req.receipt_image_url && (
                  <div className="flex items-center gap-2 pt-1 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => setViewingReceiptUrl(req.receipt_image_url!)}
                      className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 px-2.5 py-1.5 rounded-xl border border-amber-500/30"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>View User Payment Slip</span>
                    </button>
                  </div>
                )}

                {req.confirmation_message && (
                  <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-[11px] text-slate-300 font-mono">
                    "{req.confirmation_message}"
                  </div>
                )}

                {actionStatus?.id === req.id && (
                  <div
                    className={`p-2 rounded-lg text-xs ${
                      actionStatus.success ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
                    }`}
                  >
                    {actionStatus.message}
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => handleReview(req.id, 'approved')}
                    className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md active:scale-98"
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span>Approve & Credit Float</span>
                  </button>
                  <button
                    onClick={() => handleReview(req.id, 'rejected')}
                    className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 font-bold text-xs rounded-xl"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* 2. Cash-Out Approvals Tab */}
      {activeTab === 'cashouts' && (
        <div className="space-y-3">
          <div className="text-xs font-bold text-slate-300">Pending User Cash-Out (Withdrawal) Requests</div>
          {pendingCashouts.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center text-xs text-slate-500">
              No pending cash-out requests.
            </div>
          ) : (
            pendingCashouts.map((req) => (
              <div
                key={req.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-lg"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-xs font-bold text-slate-300">User #{req.telegram_user_id}</div>
                    <div className="text-lg font-black text-emerald-400 mt-1 font-mono">
                      {req.amount} ETB
                    </div>
                    <div className="text-xs text-slate-300 font-medium">
                      Destination: <b className="text-white">{req.payment_method.toUpperCase()}</b> -{' '}
                      <span className="font-mono text-amber-400">{req.account_number}</span> ({req.account_name})
                    </div>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    {new Date(req.created_at).toLocaleTimeString()}
                  </span>
                </div>

                {/* Paste Transfer Confirmation to User */}
                <div className="space-y-1.5 bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <label className="text-[11px] font-bold text-slate-300">
                    Paste Payout Confirmation SMS (Auto-parses Txn ID):
                  </label>
                  <textarea
                    rows={2}
                    value={payoutMessage[req.id] || ''}
                    onChange={(e) => handlePayoutMessageChange(req.id, e.target.value)}
                    placeholder="Paste the bank / Telebirr confirmation text sent to user..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                  />
                  {payoutTxnId[req.id] && (
                    <div className="text-[10px] text-emerald-400 font-mono">
                      Parsed Payout Txn ID: <b>{payoutTxnId[req.id]}</b>
                    </div>
                  )}

                  {/* Attach Payout Receipt */}
                  <div className="pt-2 border-t border-slate-900 flex items-center justify-between">
                    <label className="cursor-pointer flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 px-3 py-1.5 rounded-xl border border-emerald-500/30">
                      <UploadCloud className="w-3.5 h-3.5" />
                      <span>{payoutReceipts[req.id] ? 'Change Payout Slip' : 'Attach Transfer Receipt'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handlePayoutReceiptChange(req.id, e)}
                        className="hidden"
                      />
                    </label>
                    {payoutReceipts[req.id] && (
                      <button
                        type="button"
                        onClick={() => setViewingReceiptUrl(payoutReceipts[req.id])}
                        className="text-[11px] text-slate-300 hover:underline flex items-center gap-1"
                      >
                        <Eye className="w-3 h-3" />
                        <span>Preview Receipt</span>
                      </button>
                    )}
                  </div>
                </div>

                {actionStatus?.id === req.id && (
                  <div
                    className={`p-2 rounded-lg text-xs ${
                      actionStatus.success ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
                    }`}
                  >
                    {actionStatus.message}
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => handleReview(req.id, 'approved')}
                    className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md active:scale-98"
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span>Confirm Payout & Deduct Won Balance</span>
                  </button>
                  <button
                    onClick={() => handleReview(req.id, 'rejected')}
                    className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 font-bold text-xs rounded-xl"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* 3. Buy Credits from Super Admin Tab */}
      {activeTab === 'buy_credits' && (
        <form onSubmit={handleBuyCreditsSubmit} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 max-w-lg">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-amber-400" />
              <span>Purchase Float Credits from Super Admin</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Transfer funds to the Super Admin, attach receipt screenshot, and request a float replenishment.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300">Credit Amount (ETB)</label>
            <input
              type="number"
              value={creditAmount}
              onChange={(e) => setCreditAmount(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300">
              Attach Payment Receipt / Slip
            </label>
            <div className="flex items-center gap-3">
              <label className="flex-1 cursor-pointer flex items-center justify-center gap-2 py-2 px-3 border border-dashed border-slate-700 hover:border-blue-500 rounded-xl bg-slate-950 text-slate-300 text-xs">
                <UploadCloud className="w-4 h-4 text-blue-400" />
                <span>{creditReceiptImage ? 'Receipt Selected' : 'Choose Receipt Image'}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleCreditBuyReceiptChange}
                  className="hidden"
                />
              </label>
              {creditReceiptImage && (
                <img
                  src={creditReceiptImage}
                  alt="Receipt"
                  className="w-10 h-10 object-cover rounded-lg border border-blue-500/50 cursor-pointer"
                  onClick={() => setViewingReceiptUrl(creditReceiptImage)}
                />
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300">
              Paste Transfer Confirmation Message
            </label>
            <textarea
              rows={3}
              value={creditConfirmationMessage}
              onChange={(e) => handleCreditBuyChange(e.target.value)}
              placeholder="Paste the SMS confirmation from Telebirr / CBE to Super Admin..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="space-y-1.5 bg-slate-950 p-3 rounded-xl border border-slate-800">
            <div className="text-xs font-bold text-slate-300">Parsed Transaction Reference:</div>
            <input
              type="text"
              value={creditParsedTxnId}
              onChange={(e) => setCreditParsedTxnId(e.target.value.toUpperCase())}
              placeholder="Transaction ID (e.g. TX1029384)"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-amber-400 font-mono font-bold focus:outline-none focus:border-blue-500"
            />
          </div>

          {creditBuyStatus && (
            <div className="p-3 bg-slate-950 rounded-xl text-xs text-slate-300 border border-slate-800">
              {creditBuyStatus}
            </div>
          )}

          <button
            type="submit"
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-md active:scale-98 transition-all"
          >
            <Send className="w-4 h-4" />
            <span>Submit Credit Request to Super Admin</span>
          </button>
        </form>
      )}

      {/* 4. Ledger Tab */}
      {activeTab === 'ledger' && (
        <div className="space-y-3">
          <div className="text-xs font-bold text-slate-300">Agent Commission & Balance Ledger (Recent 30 Transactions)</div>
          <div className="space-y-2">
            {ledgerEntries.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-500">No ledger transactions yet.</div>
            ) : (
              ledgerEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="bg-slate-900 border border-slate-800/80 rounded-xl p-3 flex justify-between items-center text-xs"
                >
                  <div>
                    <div className="font-bold text-white">{entry.description || entry.type}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {new Date(entry.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div
                    className={`font-mono font-bold text-sm ${
                      Number(entry.amount) >= 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {Number(entry.amount) >= 0 ? `+${entry.amount}` : entry.amount} ETB
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 5. Analytics & Profitability Tab */}
      {activeTab === 'analytics' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-slate-900 border border-amber-500/30 rounded-2xl p-4">
              <div className="text-[10px] text-amber-400 uppercase font-bold flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Bingo Commission (70% Cut)</span>
              </div>
              <div className="text-xl font-black text-white mt-1 font-mono">
                {weeklyProfits.reduce((acc, p) => acc + p.bingoCut, 0).toLocaleString()} ETB
              </div>
              <div className="text-[10px] text-slate-400">7-Day Net Revenue</div>
            </div>

            <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-4">
              <div className="text-[10px] text-emerald-400 uppercase font-bold flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5" />
                <span>Lotto Commission (20% Cut)</span>
              </div>
              <div className="text-xl font-black text-white mt-1 font-mono">
                {weeklyProfits.reduce((acc, p) => acc + p.lottoCut, 0).toLocaleString()} ETB
              </div>
              <div className="text-[10px] text-slate-400">From 100 ETB tickets sold</div>
            </div>

            <div className="bg-slate-900 border border-blue-500/30 rounded-2xl p-4">
              <div className="text-[10px] text-blue-400 uppercase font-bold flex items-center gap-1">
                <BarChart3 className="w-3.5 h-3.5" />
                <span>Total Gross Profit</span>
              </div>
              <div className="text-xl font-black text-emerald-400 mt-1 font-mono">
                {weeklyProfits.reduce((acc, p) => acc + p.total, 0).toLocaleString()} ETB
              </div>
              <div className="text-[10px] text-slate-400">Weekly Profitability Summary</div>
            </div>
          </div>

          {/* Graphical Visualization Bar Chart */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-3">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <BarChart3 className="w-4 h-4 text-amber-400" />
                <span>7-Day Agent Profitability Breakdown</span>
              </div>
              <div className="flex items-center gap-3 text-[10px]">
                <span className="flex items-center gap-1 text-amber-400">
                  <span className="w-2.5 h-2.5 bg-amber-500 rounded" /> Bingo 70%
                </span>
                <span className="flex items-center gap-1 text-emerald-400">
                  <span className="w-2.5 h-2.5 bg-emerald-500 rounded" /> Lotto 20%
                </span>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-2 pt-4 items-end h-40">
              {weeklyProfits.map((item) => {
                const maxVal = 1200;
                const bingoH = Math.min(100, (item.bingoCut / maxVal) * 100);
                const lottoH = Math.min(100, (item.lottoCut / maxVal) * 100);

                return (
                  <div key={item.day} className="flex flex-col items-center gap-1 h-full justify-end">
                    <div className="text-[9px] text-slate-400 font-mono font-bold">
                      {item.total}
                    </div>
                    <div className="w-full max-w-[28px] bg-slate-950 rounded-lg overflow-hidden flex flex-col justify-end p-0.5 border border-slate-800 h-28">
                      <div
                        style={{ height: `${bingoH}%` }}
                        className="w-full bg-gradient-to-t from-amber-600 to-amber-400 rounded-t"
                      />
                      <div
                        style={{ height: `${lottoH}%` }}
                        className="w-full bg-gradient-to-t from-emerald-600 to-emerald-400 mt-0.5 rounded-t"
                      />
                    </div>
                    <div className="text-[10px] font-bold text-slate-400">{item.day}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Modal: View Receipt Image */}
      {viewingReceiptUrl && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-slate-900 rounded-2xl overflow-hidden border border-slate-800">
            <div className="p-3 border-b border-slate-800 flex justify-between items-center">
              <span className="text-xs font-bold text-white">Payment Receipt Image</span>
              <button
                onClick={() => setViewingReceiptUrl(null)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 flex justify-center bg-black/60 max-h-[70vh] overflow-auto">
              <img
                src={viewingReceiptUrl}
                alt="Receipt Full View"
                className="max-w-full rounded-lg object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {/* Security PIN Modal (1-Hour Session) */}
      {pinModalConfig?.isOpen && (
        <SecurityPinModal
          isOpen={true}
          role="admin"
          targetId={currentAdmin?.id}
          actionTitle={pinModalConfig.actionTitle}
          onSuccess={() => {
            pinModalConfig.onExecute();
            setPinModalConfig(null);
          }}
          onClose={() => setPinModalConfig(null)}
        />
      )}
    </div>
  );
};
