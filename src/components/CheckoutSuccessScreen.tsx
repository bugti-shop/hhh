import { useEffect, useState } from 'react';
import { m as motion } from 'framer-motion';
import { CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import appLogo from '@/assets/app-logo.webp';

interface CheckoutSuccessScreenProps {
  isVerified: boolean;
  isFailed: boolean;
}

export function CheckoutSuccessScreen({ isVerified, isFailed }: CheckoutSuccessScreenProps) {
  const [dots, setDots] = useState('');
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isVerified || isFailed) return;
    const interval = setInterval(() => {
      setDots(prev => (prev.length >= 3 ? '' : prev + '.'));
    }, 500);
    return () => clearInterval(interval);
  }, [isVerified, isFailed]);

  // Auto-dismiss failed screen after 5 seconds
  useEffect(() => {
    if (!isFailed) return;
    const timer = setTimeout(() => setDismissed(true), 5000);
    return () => clearTimeout(timer);
  }, [isFailed]);

  if (dismissed) return null;

  return (
    <div
      className="fixed inset-0 z-[250] flex flex-col items-center justify-center"
      style={{
        background: 'linear-gradient(135deg, hsl(var(--primary) / 0.05), hsl(var(--primary) / 0.15))',
        backdropFilter: 'blur(20px)',
        fontFamily: "'Nunito Sans', sans-serif",
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="flex flex-col items-center gap-6 px-8 text-center"
      >
        {/* Logo */}
        <motion.img
          src={appLogo}
          alt="Flowist"
          className="h-16 w-16"
          initial={{ rotate: -10 }}
          animate={{ rotate: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />

        {/* Status Icon */}
        {isFailed ? (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
          >
            <AlertCircle size={56} className="text-destructive" />
          </motion.div>
        ) : isVerified ? (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
          >
            <CheckCircle2 size={56} style={{ color: 'hsl(142 71% 45%)' }} />
          </motion.div>
        ) : (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
          >
            <Loader2 size={56} className="text-primary" />
          </motion.div>
        )}

        {/* Title */}
        <motion.h1
          className="text-2xl font-bold tracking-tight"
          style={{ color: 'hsl(var(--foreground))' }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          {isFailed
            ? 'Verification Failed'
            : isVerified
              ? 'Welcome to Flowist Pro! 🎉'
              : `Activating your subscription${dots}`}
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          className="text-sm max-w-[280px]"
          style={{ color: 'hsl(var(--muted-foreground))' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          {isFailed
            ? 'We couldn\'t verify your payment. Please tap "Restore Purchase" on the paywall to try again.'
            : isVerified
              ? 'All Pro features are now unlocked. Enjoy!'
              : 'Confirming your payment with Stripe. This usually takes a few seconds.'}
        </motion.p>

        {/* Progress steps */}
        {!isFailed && (
          <motion.div
            className="flex flex-col gap-2 mt-4 text-left w-full max-w-[260px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            <StepItem label="Payment received" done />
            <StepItem label="Verifying subscription" done={isVerified} active={!isVerified} />
            <StepItem label="Unlocking Pro features" done={isVerified} />
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}

function StepItem({ label, done, active }: { label: string; done: boolean; active?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      {done ? (
        <CheckCircle2 size={18} style={{ color: 'hsl(142 71% 45%)' }} />
      ) : active ? (
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
          <Loader2 size={18} className="text-primary" />
        </motion.div>
      ) : (
        <div className="h-[18px] w-[18px] rounded-full border-2" style={{ borderColor: 'hsl(var(--muted-foreground) / 0.3)' }} />
      )}
      <span
        className="text-sm"
        style={{
          color: done
            ? 'hsl(var(--foreground))'
            : active
              ? 'hsl(var(--primary))'
              : 'hsl(var(--muted-foreground) / 0.5)',
          fontWeight: active ? 600 : 400,
        }}
      >
        {label}
      </span>
    </div>
  );
}