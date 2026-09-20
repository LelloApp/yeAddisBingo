import React, { useState, useEffect } from 'react';
import { X, ArrowDownToLine, ArrowUpFromLine, History, CheckCircle, AlertTriangle, Copy, Check, Sparkles, Send, UploadCloud, Image, Eye, ShieldAlert } from 'lucide-react';
import { supabase, Admin, UserFinancialRequest } from '../lib/supabase';
import { parseTransactionMessage } from '../utils/transactionParser';
import { triggerHaptic } from '../utils/telegram';

interface CashierModalProps {
  isOpen: boolean;
  onClose: () => void;
  telegramUserId: number;
  selectedAdmin: Admin | null;
  userBalance: number;
  wonBalance: number;
  depositedBalance: number;
  onBalanceUpdated?: () => void;
}

type TabType = 'topup' | 'cashout' | 'history';

export const CashierModal: React.FC<CashierModalProps> = ({
  isOpen,
  onClose,
  telegramUserId,
  selectedAdmin,
  userBalance,
  wonBalance,
  depositedBalance,
  onBalanceUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('topup');
  const [amount, setAmount] = useState<string>('100');
  const [paymentMethod, setPaymentMethod] = useState<string>('telebirr');
  const [confirmationMessage, setConfirmationMessage] = useState<string>('');
  const [parsedTxnId, setParsedTxnId] = useState<string>('');
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [accountNumber, setAccountNumber] = useState<string>('');
  const [accountName, setAccountName] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [history, setHistory] = useState<UserFinancialRequest[]>([]);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [viewingReceiptUrl, setViewingReceiptUrl] = useState<string | null>(null);
  const [disputeModalItem, setDisputeModalItem] = useState<UserFinancialRequest | null>(null);
  const [disputeReason, setDisputeReason] = useState<string>('');

  useEffect(() => {
    if (isOpen && activeTab === 'history') {
      loadHistory();
    }
  }, [isOpen, activeTab]);

  const loadHistory = async () => {
    if (!telegramUserId) return;
    const { data } = await supabase
      .from('user_financial_requests')
      .select('*')
      .eq('telegram_user_id', telegramUserId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (data) {
      setHistory(data);
    }
  };

  // Auto-parse confirmation message whenever pasted
  const handleConfirmationChange = (text: string) => {
    setConfirmationMessage(text);
    const parsed = parseTransactionMessage(text);
    if (parsed.transactionId) {
      setParsedTxnId(parsed.transactionId);
    }
    if (parsed.amount && (!amount || amount === '100')) {
      setAmount(String(parsed.amount));
    }
  };

  const handleCopy = (val: string, field: string) => {
    navigator.clipboard.writeText(val);
    setCopiedField(field);
    triggerHaptic('light');
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleReceiptImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setReceiptImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleConfirmCashoutReceived = async (reqId: string) => {
    triggerHaptic('heavy');
    await supabase.rpc('user_confirm_cashout_receipt', {
      p_request_id: reqId,
      p_telegram_user_id: telegramUserId,
    });
    loadHistory();
  };

  const handleReportDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disputeModalItem) return;
    triggerHaptic('warning');
    await supabase.rpc('report_embezzlement_or_dispute', {
      p_request_id: disputeModalItem.id,
      p_reporter_id: telegramUserId,
      p_reason: disputeReason || 'Funds not received or false receipt attached',
    });
    setDisputeModalItem(null);
    setDisputeReason('');
    loadHistory();
  };

  const handleTopupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAdmin?.id) {
      setStatusMessage({ type: 'error', text: 'Please select an active Admin first.' });
      return;
    }
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setStatusMessage({ type: 'error', text: 'Enter a valid top-up amount.' });
      return;
    }

    setIsLoading(true);
    setStatusMessage(null);
    triggerHaptic('medium');

    try {
      const finalTxn = parsedTxnId.trim() ? parsedTxnId.trim().toUpperCase() : null;
      const { data, error } = await supabase.rpc('submit_user_topup_request', {
        p_telegram_user_id: telegramUserId,
        p_admin_id: selectedAdmin.id,
        p_amount: numAmount,
        p_payment_method: paymentMethod,
        p_confirmation_message: confirmationMessage || (receiptImage ? 'Payment receipt attached' : 'Direct payment confirmation'),
        p_parsed_transaction_id: finalTxn,
      });

      if (error || !data?.success) {
        setStatusMessage({
          type: 'error',
          text: data?.error || error?.message || 'Failed to submit top up request.',
        });
      } else {
        if (receiptImage && data?.request_id) {
          await supabase
            .from('user_financial_requests')
            .update({ receipt_image_url: receiptImage })
            .eq('id', data.request_id);
        }

        setStatusMessage({
          type: 'success',
          text: '🎉 Top-up request submitted successfully! Your Admin will verify and approve.',
        });
        setConfirmationMessage('');
        setParsedTxnId('');
        setReceiptImage(null);
        if (onBalanceUpdated) onBalanceUpdated();
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Submission error.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCashoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAdmin?.id) {
      setStatusMessage({ type: 'error', text: 'Please select an active Admin first.' });
      return;
    }
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setStatusMessage({ type: 'error', text: 'Enter a valid cash-out amount.' });
      return;
    }
    if (numAmount > wonBalance) {
      setStatusMessage({
        type: 'error',
        text: `Insufficient won balance. Available cashable balance: ${wonBalance} ETB.`,
      });
      return;
    }
    if (!accountNumber.trim()) {
      setStatusMessage({ type: 'error', text: 'Please enter your receiving account or phone number.' });
      return;
    }

    setIsLoading(true);
    setStatusMessage(null);
    triggerHaptic('medium');

    try {
      const { data, error } = await supabase.rpc('submit_user_cashout_request', {
        p_telegram_user_id: telegramUserId,
        p_admin_id: selectedAdmin.id,
        p_amount: numAmount,
        p_payment_method: paymentMethod,
        p_account_number: accountNumber.trim(),
        p_account_name: accountName.trim(),
      });

      if (error || !data?.success) {
        setStatusMessage({
          type: 'error',
          text: data?.error || error?.message || 'Failed to submit cash out request.',
        });
      } else {
        setStatusMessage({
          type: 'success',
          text: '✅ Cash-out request submitted! Your Admin will process the transfer and confirm.',
        });
        setAccountNumber('');
        setAccountName('');
        if (onBalanceUpdated) onBalanceUpdated();
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Cash-out error.' });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 z-50 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-amber-500/20 via-slate-900 to-slate-900 border-b border-slate-800 flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold">
              💳
            </div>
            <div>
              <h2 className="text-base font-black text-white">Addis Cashier & Balances</h2>
              <p className="text-[11px] text-slate-400">
                Agent: <b className="text-amber-400">{selectedAdmin?.display_name || 'Parcelic Admin'}</b>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Balance Overview Cards */}
        <div className="grid grid-cols-3 gap-2 p-3 bg-slate-950/60 border-b border-slate-800">
          <div className="bg-slate-900/90 border border-blue-500/30 rounded-2xl p-2.5">
            <div className="text-[10px] uppercase font-bold text-blue-400">Total</div>
            <div className="text-base font-black text-white mt-0.5">{userBalance.toLocaleString()} ETB</div>
            <div className="text-[9px] text-slate-400">Combined</div>
          </div>

          <div className="bg-slate-900/90 border border-emerald-500/30 rounded-2xl p-2.5">
            <div className="text-[10px] uppercase font-bold text-emerald-400">Won</div>
            <div className="text-base font-black text-white mt-0.5">{wonBalance.toLocaleString()} ETB</div>
            <div className="text-[9px] text-emerald-400/80">Cashout</div>
          </div>

          <div className="bg-slate-900/90 border border-amber-500/30 rounded-2xl p-2.5">
            <div className="text-[10px] uppercase font-bold text-amber-400">Deposit</div>
            <div className="text-base font-black text-white mt-0.5">{depositedBalance.toLocaleString()} ETB</div>
            <div className="text-[9px] text-amber-400/80">Playable</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-3 gap-1 p-2 bg-slate-950 border-b border-slate-800">
          <button
            onClick={() => {
              triggerHaptic('light');
              setActiveTab('topup');
              setStatusMessage(null);
            }}
            className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'topup'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ArrowDownToLine className="w-3.5 h-3.5" />
            <span>Top Up</span>
          </button>

          <button
            onClick={() => {
              triggerHaptic('light');
              setActiveTab('cashout');
              setStatusMessage(null);
            }}
            className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'cashout'
                ? 'bg-emerald-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ArrowUpFromLine className="w-3.5 h-3.5" />
            <span>Cash Out</span>
          </button>

          <button
            onClick={() => {
              triggerHaptic('light');
              setActiveTab('history');
              setStatusMessage(null);
            }}
            className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'history'
                ? 'bg-blue-500 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>History</span>
          </button>
        </div>

        {/* Status Message */}
        {statusMessage && (
          <div
            className={`mx-3 mt-3 p-3 rounded-xl text-xs flex items-center gap-2 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                : 'bg-red-500/10 border border-red-500/30 text-red-300'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Content Area */}
        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          {/* Top-Up Tab */}
          {activeTab === 'topup' && (
            <form onSubmit={handleTopupSubmit} className="space-y-3.5">
              {/* Agent Payment Destination Box */}
              <div className="bg-slate-950 border border-amber-500/30 rounded-2xl p-3.5 space-y-2.5">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-amber-400">Agent Payment Account</span>
                  <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-semibold">
                    {selectedAdmin?.display_name}
                  </span>
                </div>
                <div className="flex items-center justify-between bg-slate-900 px-3 py-2 rounded-xl border border-slate-800 text-xs">
                  <div>
                    <div className="text-[10px] text-slate-400">Telebirr / Phone:</div>
                    <div className="font-mono font-bold text-white text-sm">
                      {selectedAdmin?.phone || '0911234567'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(selectedAdmin?.phone || '0911234567', 'admin_phone')}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-lg text-xs flex items-center gap-1"
                  >
                    {copiedField === 'admin_phone' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedField === 'admin_phone' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              {/* Amount Selection */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">Top-Up Amount (ETB)</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {['50', '100', '250', '500'].map((tier) => (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => setAmount(tier)}
                      className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                        amount === tier
                          ? 'border-amber-500 bg-amber-500/20 text-white'
                          : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                      }`}
                    >
                      {tier} ETB
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Custom amount"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Paste Confirmation SMS */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">
                  Paste Bank / Telebirr Confirmation Message
                </label>
                <textarea
                  rows={3}
                  value={confirmationMessage}
                  onChange={(e) => handleConfirmationChange(e.target.value)}
                  placeholder="e.g. Your payment of ETB 100 to ... has been completed. Transaction ID: 9CK1040..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>

              {/* Receipt Image Upload */}
              <div className="space-y-1.5 bg-slate-950/80 p-3 rounded-2xl border border-slate-800">
                <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <UploadCloud className="w-3.5 h-3.5 text-amber-400" />
                    <span>Attach Payment Receipt / Screenshot</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal">Optional</span>
                </label>
                <div className="flex items-center gap-3">
                  <label className="flex-1 cursor-pointer flex items-center justify-center gap-2 py-2 px-3 border border-dashed border-slate-700 hover:border-amber-500 rounded-xl bg-slate-900/60 text-slate-300 text-xs transition-colors">
                    <Image className="w-4 h-4 text-amber-400" />
                    <span>{receiptImage ? 'Change Receipt Photo' : 'Select Receipt Image'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleReceiptImageChange}
                      className="hidden"
                    />
                  </label>
                  {receiptImage && (
                    <div className="relative group">
                      <img
                        src={receiptImage}
                        alt="Receipt preview"
                        className="w-12 h-12 object-cover rounded-lg border border-amber-500/50 cursor-pointer"
                        onClick={() => setViewingReceiptUrl(receiptImage)}
                      />
                      <button
                        type="button"
                        onClick={() => setReceiptImage(null)}
                        className="absolute -top-1.5 -right-1.5 bg-red-600 text-white rounded-full w-4 h-4 text-[10px] flex items-center justify-center shadow"
                      >
                        ×
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Parsed / Verified Transaction ID */}
              <div className="space-y-1.5 bg-slate-950/80 p-3 rounded-2xl border border-slate-800">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-300">Confirmed Transaction ID:</span>
                  {parsedTxnId ? (
                    <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> Auto-Detected
                    </span>
                  ) : (
                    <span className="text-[10px] text-amber-400 font-bold">Manual (Optional)</span>
                  )}
                </div>
                <input
                  type="text"
                  value={parsedTxnId}
                  onChange={(e) => setParsedTxnId(e.target.value.toUpperCase())}
                  placeholder="Transaction Reference (e.g. 9CK104928)"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-amber-400 font-mono font-bold focus:outline-none focus:border-amber-500"
                />
                <p className="text-[10px] text-slate-500">
                  Either paste SMS message, enter reference, or attach receipt screenshot.
                </p>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 active:scale-98 transition-all"
              >
                <Send className="w-4 h-4" />
                <span>{isLoading ? 'Submitting...' : `Submit ${amount || '0'} ETB Top Up`}</span>
              </button>
            </form>
          )}

          {/* Cash-Out Tab */}
          {activeTab === 'cashout' && (
            <form onSubmit={handleCashoutSubmit} className="space-y-3.5">
              <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-2xl p-3 text-xs space-y-1">
                <div className="font-bold text-emerald-400 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Instant Cashout from Won Balance</span>
                </div>
                <p className="text-slate-400 text-[11px]">
                  Only cash won in games can be cashed out. Deposited balance is preserved for gameplay. Admin will send payment and attach official transfer receipt.
                </p>
                <div className="text-sm font-bold text-white pt-1">
                  Available to Withdraw: <span className="text-emerald-400">{wonBalance} ETB</span>
                </div>
              </div>

              {/* Amount to Withdraw */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">Amount to Withdraw (ETB)</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  max={wonBalance}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Payment Method */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">Payout Method</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'telebirr', name: 'Telebirr Phone' },
                    { id: 'cbe', name: 'CBE Bank Account' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPaymentMethod(m.id)}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border text-left transition-all ${
                        paymentMethod === m.id
                          ? 'border-emerald-500 bg-emerald-500/20 text-white'
                          : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                      }`}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Receiving Account Number */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">
                  {paymentMethod === 'telebirr' ? 'Telebirr Phone Number' : 'CBE Bank Account Number'}
                </label>
                <input
                  type="text"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder={paymentMethod === 'telebirr' ? '0912345678' : '1000...'}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              {/* Receiving Account Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">Account Holder Name</label>
                <input
                  type="text"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  placeholder="Full Name as shown on Bank/Telebirr"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading || wonBalance <= 0}
                className={`w-full py-3 rounded-xl font-black text-xs uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 active:scale-98 transition-all ${
                  wonBalance > 0
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 text-slate-950'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                }`}
              >
                <Send className="w-4 h-4" />
                <span>{isLoading ? 'Processing...' : `Request ${amount || '0'} ETB Cash Out`}</span>
              </button>
            </form>
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <div className="space-y-3">
              <div className="text-xs font-bold text-slate-300 flex justify-between items-center">
                <span>Recent Financial Requests</span>
                <button
                  onClick={loadHistory}
                  className="text-[11px] text-amber-400 hover:underline"
                >
                  Refresh
                </button>
              </div>

              {history.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-xs">
                  No requests found. Your top-ups and cashouts will show here.
                </div>
              ) : (
                history.map((item) => (
                  <div
                    key={item.id}
                    className="bg-slate-950 border border-slate-800/80 rounded-2xl p-3 text-xs space-y-2"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-black uppercase text-[11px] ${
                              item.type === 'topup' ? 'text-amber-400' : 'text-emerald-400'
                            }`}
                          >
                            {item.type === 'topup' ? '📥 Top Up' : '📤 Cash Out'}
                          </span>
                          <span className="font-bold text-white text-sm">{item.amount} ETB</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
                          {item.parsed_transaction_id || item.admin_transaction_id || item.payment_method}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {new Date(item.created_at).toLocaleString()}
                        </div>
                      </div>

                      <div>
                        <span
                          className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                            item.status === 'approved'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                              : item.status === 'rejected'
                              ? 'bg-red-500/20 text-red-300 border-red-500/30'
                              : 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
                          }`}
                        >
                          {item.status.toUpperCase()}
                        </span>
                      </div>
                    </div>

                    {/* Receipt Previews */}
                    <div className="flex items-center gap-2 pt-1 border-t border-slate-900">
                      {item.receipt_image_url && (
                        <button
                          type="button"
                          onClick={() => setViewingReceiptUrl(item.receipt_image_url!)}
                          className="flex items-center gap-1 text-[11px] text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 px-2 py-1 rounded-lg border border-amber-500/30 transition-colors"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Your Receipt</span>
                        </button>
                      )}

                      {item.admin_receipt_image_url && (
                        <button
                          type="button"
                          onClick={() => setViewingReceiptUrl(item.admin_receipt_image_url!)}
                          className="flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 px-2 py-1 rounded-lg border border-emerald-500/30 transition-colors"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Admin Payout Slip</span>
                        </button>
                      )}
                    </div>

                    {/* Cashout Confirmation & Dispute Actions for approved cashouts */}
                    {item.type === 'cashout' && item.status === 'approved' && (
                      <div className="bg-slate-900/90 rounded-xl p-2.5 border border-slate-800 space-y-2">
                        {item.is_flagged_embezzlement ? (
                          <div className="flex items-center gap-1.5 text-[11px] text-red-400 font-bold">
                            <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0" />
                            <span>Flagged to Owner: {item.flag_reason || 'Disputed'}</span>
                          </div>
                        ) : item.user_confirmed_cashout ? (
                          <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-bold">
                            <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                            <span>Received & Confirmed by You</span>
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            <p className="text-[10px] text-slate-400">
                              Admin completed the transfer. Did you receive the funds into your account?
                            </p>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleConfirmCashoutReceived(item.id)}
                                className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-[11px] flex items-center justify-center gap-1"
                              >
                                <Check className="w-3 h-3" />
                                <span>I Received Funds</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setDisputeModalItem(item)}
                                className="py-1.5 px-2 bg-red-900/40 hover:bg-red-800/60 border border-red-500/30 text-red-300 rounded-lg font-bold text-[10px] flex items-center gap-1"
                              >
                                <ShieldAlert className="w-3 h-3" />
                                <span>Report Fake Receipt</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

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

        {/* Modal: Report False Receipt / Embezzlement to Owner */}
        {disputeModalItem && (
          <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-slate-900 border border-red-500/40 rounded-2xl overflow-hidden shadow-2xl">
              <div className="p-3.5 bg-red-950/40 border-b border-red-500/30 flex justify-between items-center">
                <div className="flex items-center gap-2 text-red-400 font-bold text-xs">
                  <ShieldAlert className="w-4 h-4" />
                  <span>Report Dispute to Owner</span>
                </div>
                <button
                  onClick={() => setDisputeModalItem(null)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form onSubmit={handleReportDispute} className="p-4 space-y-3">
                <p className="text-xs text-slate-300">
                  This reports this transfer of <b>{disputeModalItem.amount} ETB</b> to the Platform Owner for direct review and audit against Admin embezzlement.
                </p>
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-400">Describe the issue:</label>
                  <textarea
                    rows={3}
                    value={disputeReason}
                    onChange={(e) => setDisputeReason(e.target.value)}
                    placeholder="e.g. Funds not credited in Telebirr, or fake SMS slip attached."
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs text-white focus:outline-none focus:border-red-500"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setDisputeModalItem(null)}
                    className="flex-1 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold"
                  >
                    Submit Dispute Flag
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
