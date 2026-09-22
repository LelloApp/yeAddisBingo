import { useState } from 'react';
import { useNetworkQuality } from '../hooks/useNetworkQuality';
import { Wifi, WifiOff, SignalLow, SignalMedium, SignalHigh, X } from 'lucide-react';

interface NetworkQualityIndicatorProps {
  compact?: boolean;
  isDarkMode?: boolean;
  pendingActions?: number;
  isReconnecting?: boolean;
}

export function NetworkQualityIndicator({
  compact = false,
  isDarkMode = false,
  pendingActions = 0,
  isReconnecting = false
}: NetworkQualityIndicatorProps) {
  const { quality, showNetworkWarning } = useNetworkQuality();
  const [isDismissed, setIsDismissed] = useState(false);

  if (compact) {
    const getStatusColor = () => {
      if (!quality.isOnline || isReconnecting) return 'text-red-500';
      if (quality.latency > 500 || quality.bandwidth === 'slow') return 'text-yellow-500';
      return isDarkMode ? 'text-green-400' : 'text-green-500';
    };

    const getIcon = () => {
      if (!quality.isOnline) return <WifiOff className="w-4 h-4" />;
      if (isReconnecting) return <Wifi className="w-4 h-4 animate-pulse" />;
      if (quality.bandwidth === 'slow') return <SignalLow className="w-4 h-4" />;
      if (quality.bandwidth === 'medium') return <SignalMedium className="w-4 h-4" />;
      return <SignalHigh className="w-4 h-4" />;
    };

    return (
      <div className={`flex items-center gap-1.5 ${getStatusColor()}`}>
        {getIcon()}
        {pendingActions > 0 && (
          <span className="text-xs bg-yellow-500 text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
            {pendingActions}
          </span>
        )}
        {quality.latency > 0 && quality.isOnline && (
          <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {quality.latency}ms
          </span>
        )}
      </div>
    );
  }

  if (isDismissed || (!showNetworkWarning && !isReconnecting)) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-50 animate-fadeIn">
      <div className={`border rounded-xl p-3.5 shadow-2xl relative backdrop-blur-md ${
        !quality.isOnline
          ? 'bg-red-950/90 border-red-500/50 text-red-200'
          : isReconnecting
            ? 'bg-blue-950/90 border-blue-500/50 text-blue-200'
            : 'bg-slate-900/95 border-amber-500/50 text-amber-200'
      }`}>
        <button
          onClick={() => setIsDismissed(true)}
          className="absolute top-2.5 right-2.5 p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Close slow connection banner"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="flex items-start gap-3 pr-6">
          {!quality.isOnline ? (
            <WifiOff className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          ) : isReconnecting ? (
            <Wifi className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5 animate-pulse" />
          ) : (
            <SignalLow className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <p className="font-bold text-sm text-white">
              {!quality.isOnline ? 'መስመር ተቋርጧል (Offline)' : isReconnecting ? 'እየተገናኘ ነው... (Reconnecting)' : 'ቀስተኛ መስመር (Slow Connection)'}
            </p>
            <p className="text-xs mt-1 text-gray-300">
              {!quality.isOnline ? (
                <>
                  መስመር ሲመለስ ተግባራት ይቀጥላሉ
                  {pendingActions > 0 && (
                    <span className="block mt-1 font-medium text-amber-400">
                      {pendingActions} በመጠባበቅ ላይ ያለ
                    </span>
                  )}
                </>
              ) : isReconnecting ? (
                'ግንኙነትን መልሶ ለመመስረት እየሞከረ ነው...'
              ) : (
                <>
                  Latency: {quality.latency}ms | Speed: {quality.bandwidth}
                  <br />
                  የጨዋታ ቁጥሮች መዘግየት ሊያጋጥማቸው ይችላል
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
