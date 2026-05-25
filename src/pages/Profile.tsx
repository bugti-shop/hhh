import { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, CloudDownload } from 'lucide-react';
import { useGoogleDriveSync } from '@/hooks/useGoogleDriveSync';
import { useRevenueCat } from '@/contexts/RevenueCatContext';
import { ArrowLeft, Settings, Loader2, Camera, LogOut } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { m as motion } from 'framer-motion';
import { BottomNavigation } from '@/components/BottomNavigation';
import { TodoBottomNavigation } from '@/components/TodoBottomNavigation';
import { getSetting, setSetting } from '@/utils/settingsStorage';
import { useGoogleAuth } from '@/contexts/GoogleAuthContext';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useUserProfile } from '@/hooks/useUserProfile';
import { ProfileImageCropper } from '@/components/ProfileImageCropper';
import { ProfileStatsBanner } from '@/components/profile/ProfileStats';
import { ProfileAchievements } from '@/components/profile/ProfileAchievements';
import { ProfileSubscriptionCard } from '@/components/profile/ProfileSubscriptionCard';
import { CountryFlagPickerSheet } from '@/components/CountryFlagPickerSheet';



export default function Profile() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { restorePurchases, initialize: initRevenueCat } = useRevenueCat();
  const { user, isLoading: authLoading, isSigningIn, signIn, signOut } = useGoogleAuth();
  const { triggerSync, isSyncing } = useGoogleDriveSync();
  const [lastSyncTime, setLastSyncTime] = useState<number>(0);

  useEffect(() => {
    getSetting<number>('flowist_last_drive_sync', 0).then(setLastSyncTime);
    const handler = (e: CustomEvent<{ status: string }>) => {
      if (e.detail.status === 'synced') {
        setLastSyncTime(Date.now());
      }
    };
    window.addEventListener('syncStatusChanged', handler as EventListener);
    return () => window.removeEventListener('syncStatusChanged', handler as EventListener);
  }, []);
  const [lastDashboard, setLastDashboard] = useState<'notes' | 'todo'>('notes');
  
  const { profile, updateProfile } = useUserProfile();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [coverCropSrc, setCoverCropSrc] = useState<string | null>(null);
  const [manualCountryCode, setManualCountryCode] = useState<string | null>(null);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState('');

  useEffect(() => {
    getSetting<string | null>('flowist_manual_country', null).then(setManualCountryCode);
  }, []);


  useEffect(() => {
    const checkLastDashboard = async () => {
      const fromState = (location.state as any)?.from;
      if (fromState?.startsWith('/todo')) {
        setLastDashboard('todo');
      } else {
        const stored = await getSetting<string>('lastDashboard', 'notes');
        setLastDashboard(stored === 'todo' ? 'todo' : 'notes');
      }
    };
    checkLastDashboard();
  }, [location.state]);

  const handleSignIn = async () => {
    try {
      const googleUser = await signIn(true);
      toast({ title: t('profile.signInSuccess', 'Signed in successfully'), description: t('profile.signInSuccessCloud', 'Your account is connected for real-time sync.') });
      // Run RevenueCat init in background — don't block the UI
      (async () => {
        try {
          await initRevenueCat(googleUser?.email || undefined);
          await restorePurchases();
        } catch (rcErr) {
          console.warn('RevenueCat login with Google ID failed:', rcErr);
        }
      })();
    } catch (err: any) {
      console.error('Sign-in error:', err);
      toast({ title: t('profile.signInFailed', 'Sign-in failed'), description: err?.message || t('common.retry', 'Please try again.'), variant: 'destructive' });
    }
  };

  const handleSignOut = async () => {
    await signOut();
    // Clear all local subscription flags so paywall shows after sign out
    try {
      localStorage.removeItem('flowist_stripe_subscribed');
      localStorage.removeItem('flowist_stripe_customer_email');
      localStorage.removeItem('flowist_trial_used');
    } catch {}
    // Dispatch event so SubscriptionContext resets state
    window.dispatchEvent(new CustomEvent('flowistSignedOut'));
    toast({ title: t('profile.signedOut', 'Signed out'), description: t('profile.signedOutDesc2', 'Google account disconnected.') });
  };


  // Format joined date from user metadata
  const getJoinedDate = () => {
    if (!user) return '';
    // Use current date as fallback since Google doesn't provide join date
    return t('profile.joinedDate', 'Joined {{date}}', {
      date: new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    });
  };

  const codeToFlag = (code: string) =>
    String.fromCodePoint(...code.toUpperCase().split('').map(c => 0x1F1E6 + c.charCodeAt(0) - 65));

  const getCountryFlag = () => {
    // Manual override takes priority
    if (manualCountryCode && manualCountryCode.length === 2) {
      return codeToFlag(manualCountryCode);
    }
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      const tzCountryMap: Record<string, string> = {
        'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US',
        'America/Los_Angeles': 'US', 'America/Phoenix': 'US', 'America/Anchorage': 'US',
        'Pacific/Honolulu': 'US', 'America/Detroit': 'US', 'America/Indiana/Indianapolis': 'US',
        'America/Boise': 'US', 'America/Juneau': 'US', 'America/Adak': 'US',
        'America/Nome': 'US', 'America/Sitka': 'US', 'America/Yakutat': 'US',
        'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Edmonton': 'CA',
        'America/Winnipeg': 'CA', 'America/Halifax': 'CA', 'America/St_Johns': 'CA',
        'America/Regina': 'CA', 'America/Whitehorse': 'CA', 'America/Yellowknife': 'CA',
        'America/Mexico_City': 'MX', 'America/Cancun': 'MX', 'America/Monterrey': 'MX',
        'America/Tijuana': 'MX', 'America/Chihuahua': 'MX', 'America/Hermosillo': 'MX',
        'America/Sao_Paulo': 'BR', 'America/Manaus': 'BR', 'America/Fortaleza': 'BR',
        'America/Recife': 'BR', 'America/Belem': 'BR', 'America/Bahia': 'BR',
        'America/Argentina/Buenos_Aires': 'AR', 'America/Argentina/Cordoba': 'AR',
        'America/Bogota': 'CO', 'America/Lima': 'PE', 'America/Santiago': 'CL',
        'America/Caracas': 'VE', 'America/Guayaquil': 'EC', 'America/La_Paz': 'BO',
        'America/Asuncion': 'PY', 'America/Montevideo': 'UY', 'America/Paramaribo': 'SR',
        'America/Cayenne': 'GF', 'America/Guyana': 'GY', 'America/Havana': 'CU',
        'America/Jamaica': 'JM', 'America/Port-au-Prince': 'HT', 'America/Santo_Domingo': 'DO',
        'America/Puerto_Rico': 'PR', 'America/Panama': 'PA', 'America/Costa_Rica': 'CR',
        'America/Guatemala': 'GT', 'America/El_Salvador': 'SV', 'America/Tegucigalpa': 'HN',
        'America/Managua': 'NI', 'America/Belize': 'BZ', 'America/Port_of_Spain': 'TT',
        'America/Barbados': 'BB', 'America/Martinique': 'MQ', 'America/Guadeloupe': 'GP',
        'America/Curacao': 'CW', 'America/Aruba': 'AW',
        'Europe/London': 'GB', 'Europe/Paris': 'FR', 'Europe/Berlin': 'DE',
        'Europe/Rome': 'IT', 'Europe/Madrid': 'ES', 'Europe/Istanbul': 'TR',
        'Europe/Moscow': 'RU', 'Europe/Warsaw': 'PL', 'Europe/Amsterdam': 'NL',
        'Europe/Brussels': 'BE', 'Europe/Zurich': 'CH', 'Europe/Vienna': 'AT',
        'Europe/Stockholm': 'SE', 'Europe/Oslo': 'NO', 'Europe/Copenhagen': 'DK',
        'Europe/Helsinki': 'FI', 'Europe/Athens': 'GR', 'Europe/Bucharest': 'RO',
        'Europe/Prague': 'CZ', 'Europe/Budapest': 'HU', 'Europe/Lisbon': 'PT',
        'Europe/Dublin': 'IE', 'Europe/Belgrade': 'RS', 'Europe/Sofia': 'BG',
        'Europe/Zagreb': 'HR', 'Europe/Bratislava': 'SK', 'Europe/Ljubljana': 'SI',
        'Europe/Vilnius': 'LT', 'Europe/Riga': 'LV', 'Europe/Tallinn': 'EE',
        'Europe/Kiev': 'UA', 'Europe/Kyiv': 'UA', 'Europe/Minsk': 'BY',
        'Europe/Chisinau': 'MD', 'Europe/Sarajevo': 'BA', 'Europe/Skopje': 'MK',
        'Europe/Podgorica': 'ME', 'Europe/Tirane': 'AL', 'Europe/Luxembourg': 'LU',
        'Europe/Malta': 'MT', 'Europe/Monaco': 'MC', 'Europe/Andorra': 'AD',
        'Europe/San_Marino': 'SM', 'Europe/Vatican': 'VA', 'Europe/Gibraltar': 'GI',
        'Atlantic/Reykjavik': 'IS', 'Europe/Guernsey': 'GG', 'Europe/Jersey': 'JE',
        'Europe/Isle_of_Man': 'IM', 'Atlantic/Faroe': 'FO',
        'Asia/Karachi': 'PK', 'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN',
        'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR', 'Asia/Shanghai': 'CN',
        'Asia/Hong_Kong': 'HK', 'Asia/Taipei': 'TW', 'Asia/Dubai': 'AE',
        'Asia/Riyadh': 'SA', 'Asia/Baghdad': 'IQ', 'Asia/Tehran': 'IR',
        'Asia/Kabul': 'AF', 'Asia/Dhaka': 'BD', 'Asia/Colombo': 'LK',
        'Asia/Kathmandu': 'NP', 'Asia/Singapore': 'SG', 'Asia/Kuala_Lumpur': 'MY',
        'Asia/Jakarta': 'ID', 'Asia/Makassar': 'ID', 'Asia/Jayapura': 'ID',
        'Asia/Manila': 'PH', 'Asia/Bangkok': 'TH', 'Asia/Ho_Chi_Minh': 'VN',
        'Asia/Tashkent': 'UZ', 'Asia/Almaty': 'KZ', 'Asia/Baku': 'AZ',
        'Asia/Tbilisi': 'GE', 'Asia/Yerevan': 'AM', 'Asia/Beirut': 'LB',
        'Asia/Jerusalem': 'IL', 'Asia/Amman': 'JO', 'Asia/Kuwait': 'KW',
        'Asia/Qatar': 'QA', 'Asia/Bahrain': 'BH', 'Asia/Muscat': 'OM',
        'Asia/Yangon': 'MM', 'Asia/Phnom_Penh': 'KH', 'Asia/Vientiane': 'LA',
        'Asia/Brunei': 'BN', 'Asia/Dili': 'TL', 'Asia/Thimphu': 'BT',
        'Asia/Ulaanbaatar': 'MN', 'Asia/Pyongyang': 'KP', 'Asia/Macau': 'MO',
        'Asia/Bishkek': 'KG', 'Asia/Dushanbe': 'TJ', 'Asia/Ashgabat': 'TM',
        'Asia/Aden': 'YE', 'Asia/Damascus': 'SY', 'Asia/Nicosia': 'CY',
        'Asia/Samarkand': 'UZ', 'Asia/Oral': 'KZ', 'Asia/Hovd': 'MN',
        'Indian/Maldives': 'MV', 'Indian/Mauritius': 'MU',
        'Africa/Cairo': 'EG', 'Africa/Lagos': 'NG', 'Africa/Johannesburg': 'ZA',
        'Africa/Nairobi': 'KE', 'Africa/Casablanca': 'MA', 'Africa/Algiers': 'DZ',
        'Africa/Tunis': 'TN', 'Africa/Tripoli': 'LY', 'Africa/Accra': 'GH',
        'Africa/Abidjan': 'CI', 'Africa/Dakar': 'SN', 'Africa/Addis_Ababa': 'ET',
        'Africa/Dar_es_Salaam': 'TZ', 'Africa/Kampala': 'UG', 'Africa/Khartoum': 'SD',
        'Africa/Kinshasa': 'CD', 'Africa/Lubumbashi': 'CD', 'Africa/Luanda': 'AO',
        'Africa/Maputo': 'MZ', 'Africa/Harare': 'ZW', 'Africa/Lusaka': 'ZM',
        'Africa/Windhoek': 'NA', 'Africa/Gaborone': 'BW', 'Africa/Blantyre': 'MW',
        'Africa/Douala': 'CM', 'Africa/Brazzaville': 'CG', 'Africa/Libreville': 'GA',
        'Africa/Malabo': 'GQ', 'Africa/Niamey': 'NE', 'Africa/Bamako': 'ML',
        'Africa/Ouagadougou': 'BF', 'Africa/Conakry': 'GN', 'Africa/Freetown': 'SL',
        'Africa/Monrovia': 'LR', 'Africa/Lome': 'TG', 'Africa/Porto-Novo': 'BJ',
        'Africa/Nouakchott': 'MR', 'Africa/Banjul': 'GM', 'Africa/Bissau': 'GW',
        'Africa/Mogadishu': 'SO', 'Africa/Asmara': 'ER', 'Africa/Djibouti': 'DJ',
        'Africa/Juba': 'SS', 'Africa/Kigali': 'RW', 'Africa/Bujumbura': 'BI',
        'Indian/Antananarivo': 'MG', 'Indian/Comoro': 'KM', 'Indian/Mayotte': 'YT',
        'Indian/Reunion': 'RE', 'Atlantic/Cape_Verde': 'CV',
        'Africa/Sao_Tome': 'ST', 'Africa/Ndjamena': 'TD', 'Africa/Bangui': 'CF',
        'Africa/El_Aaiun': 'EH', 'Africa/Ceuta': 'ES',
        'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Brisbane': 'AU',
        'Australia/Perth': 'AU', 'Australia/Adelaide': 'AU', 'Australia/Darwin': 'AU',
        'Australia/Hobart': 'AU', 'Pacific/Auckland': 'NZ', 'Pacific/Chatham': 'NZ',
        'Pacific/Fiji': 'FJ', 'Pacific/Tongatapu': 'TO', 'Pacific/Apia': 'WS',
        'Pacific/Port_Moresby': 'PG', 'Pacific/Guam': 'GU', 'Pacific/Noumea': 'NC',
        'Pacific/Tahiti': 'PF', 'Pacific/Palau': 'PW', 'Pacific/Majuro': 'MH',
        'Pacific/Tarawa': 'KI', 'Pacific/Nauru': 'NR', 'Pacific/Funafuti': 'TV',
        'Pacific/Efate': 'VU', 'Pacific/Guadalcanal': 'SB', 'Pacific/Pago_Pago': 'AS',
        'Pacific/Kosrae': 'FM', 'Pacific/Chuuk': 'FM', 'Pacific/Pohnpei': 'FM',
        'Asia/Vladivostok': 'RU', 'Asia/Yakutsk': 'RU', 'Asia/Irkutsk': 'RU',
        'Asia/Krasnoyarsk': 'RU', 'Asia/Novosibirsk': 'RU', 'Asia/Omsk': 'RU',
        'Asia/Yekaterinburg': 'RU', 'Europe/Samara': 'RU', 'Asia/Kamchatka': 'RU',
        'Asia/Magadan': 'RU', 'Asia/Sakhalin': 'RU', 'Asia/Srednekolymsk': 'RU',
        'Europe/Kaliningrad': 'RU', 'Europe/Volgograd': 'RU',
      };
      let countryCode = tzCountryMap[tz];
      if (!countryCode) {
        const locale = navigator.language || navigator.languages?.[0] || '';
        const parts = locale.split('-');
        if (parts.length > 1 && parts[1].length === 2) {
          countryCode = parts[1].toUpperCase();
        }
      }
      if (countryCode && countryCode.length === 2) {
        return codeToFlag(countryCode);
      }
    } catch {}
    return '🌍';
  };

  const handleCountrySelect = async (code: string) => {
    setManualCountryCode(code);
    await setSetting('flowist_manual_country', code);
    toast({ title: t('profile.countryUpdated', 'Country flag updated') });
  };

  const handleCountryReset = async () => {
    setManualCountryCode(null);
    await setSetting('flowist_manual_country', null);
    toast({ title: t('profile.countryAutoDetect', 'Using auto-detected flag') });
  };

  const displayName = profile.name || user?.name || t('profile.guest', 'Guest User');

  return (
    <div className="min-h-screen bg-background pb-14">
      {/* Header bar */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-sm" style={{ paddingTop: 'var(--safe-top, 0px)' }}>
        <div className="flex items-center justify-between px-4 h-12">
          <Link to={lastDashboard === 'todo' ? '/todo/today' : '/'} className="p-2 -ml-2 hover:bg-muted/50 rounded-lg">
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </Link>
          <h1 className="text-base font-bold text-foreground">{t('profile.title', 'Profile')}</h1>
          <Link to="/settings" className="p-2 -mr-2 hover:bg-muted/50 rounded-lg">
            <Settings className="h-5 w-5 text-muted-foreground" />
          </Link>
        </div>
      </header>

      {/* Cover Image Area */}
      <div className="relative h-40 overflow-hidden">
        {profile.coverUrl ? (
          <img src={profile.coverUrl} alt="Profile cover photo" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary via-primary/80 to-primary/60">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZG90cyIgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48Y2lyY2xlIGN4PSIxMCIgY3k9IjEwIiByPSIxLjUiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4xKSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNkb3RzKSIvPjwvc3ZnPg==')] opacity-60" />
          </div>
        )}
        <input
          ref={coverInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => setCoverCropSrc(ev.target?.result as string);
            reader.readAsDataURL(file);
            e.target.value = '';
          }}
        />
      </div>

      {/* Profile Info Section */}
      <div className="relative px-5 -mt-14">
        {/* Profile Avatar */}
        <div className="relative inline-block">
          <div className="w-28 h-28 rounded-full border-4 border-background overflow-hidden shadow-lg bg-muted">
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt={displayName}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-primary/15 flex items-center justify-center">
                <span className="text-4xl font-bold text-primary">
                  {displayName.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="absolute bottom-1 right-1 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md border-2 border-background"
          >
            <Camera className="h-3.5 w-3.5" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = (ev) => setCropImageSrc(ev.target?.result as string);
              reader.readAsDataURL(file);
              e.target.value = '';
            }}
          />
        </div>

        {/* Name & Info */}
        <div className="mt-3">
          <div className="flex items-center gap-2">
            {isEditingName ? (
              <input
                autoFocus
                className="text-2xl font-extrabold text-foreground bg-transparent border-b-2 border-primary outline-none w-full max-w-[200px]"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={async () => {
                  const trimmed = editingName.trim();
                  if (trimmed) {
                    await updateProfile({ name: trimmed });
                  }
                  setIsEditingName(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
              />
            ) : (
              <h2
                className="text-2xl font-extrabold text-foreground cursor-pointer active:opacity-70"
                onClick={() => {
                  setEditingName(profile.name || user?.name || '');
                  setIsEditingName(true);
                }}
              >
                {displayName}
              </h2>
            )}
            <button
              onClick={() => setShowCountryPicker(true)}
              className="text-lg hover:scale-110 transition-transform active:scale-95"
              title={t('profile.changeCountry', 'Change country flag')}
            >
              {getCountryFlag()}
            </button>
          </div>
          {user && (
            <p className="text-xs text-muted-foreground mt-1">{getJoinedDate()}</p>
          )}
        </div>

        {/* Sign-in / Sign-out */}
        <div className="mt-4">
          {user ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('openSyncProgressSheet'));
                    triggerSync();
                  }}
                  disabled={isSyncing}
                  className="flex-1 h-11 rounded-lg px-4 py-2.5 text-sm font-bold bg-primary text-primary-foreground border-b-4 border-[hsl(var(--primary-darker))] shadow-[0_10px_22px_hsl(var(--primary)/0.22)] hover:bg-[hsl(var(--primary-dark))] active:border-b-0 active:translate-y-1"
                >
                  <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                  {isSyncing ? t('profile.uploading', 'Uploading...') : t('profile.uploadToCloud', 'Upload to Cloud')}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-xl h-11 w-11 border-destructive/30 text-destructive hover:bg-destructive/10"
                  onClick={handleSignOut}
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
              <Button
                variant="outline"
                onClick={async () => {
                  window.dispatchEvent(new CustomEvent('openSyncProgressSheet'));
                  try {
                    const { restoreFromDrive } = await import('@/utils/googleDriveSync');
                    await restoreFromDrive();
                    toast({ title: t('profile.restoreSuccess', 'Data restored from cloud!') });
                  } catch {
                    toast({ title: t('profile.restoreFailed', 'Restore failed'), description: t('profile.restoreFailedDesc', 'Make sure you are signed in.'), variant: 'destructive' });
                  }
                }}
                className="w-full h-10 rounded-lg text-sm font-medium"
              >
                <CloudDownload className="h-4 w-4 mr-2" />
                {t('profile.restoreFromCloud', 'Restore from Cloud')}
              </Button>
              {lastSyncTime > 0 && (
                <p className="text-xs text-muted-foreground text-center">
                  {t('profile.lastSynced')}: {new Date(lastSyncTime).toLocaleString()}
                </p>
              )}
            </div>
          ) : authLoading ? (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <button
                onClick={handleSignIn}
                disabled={isSigningIn}
                className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-white border border-[#d9d9e3] rounded-full shadow-sm hover:shadow-md transition-all disabled:opacity-50"
              >
                {isSigningIn ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : (
                  <>
                    <svg className="h-5 w-5" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    <span className="text-sm font-medium text-foreground">
                      {t('profile.signInGoogle', 'Sign in with Google')}
                    </span>
                  </>
                )}
              </button>
              <button
                onClick={async () => {
                  try {
                    const { lovable } = await import('@/integrations/lovable/index');
                    const result = await lovable.auth.signInWithOAuth('apple', {
                      redirect_uri: window.location.origin,
                    });
                    if (result.error) {
                      toast({ title: 'Sign-in failed', description: String(result.error.message || result.error), variant: 'destructive' });
                    }
                  } catch (err: any) {
                    toast({ title: 'Sign-in failed', description: err?.message || 'Unknown error', variant: 'destructive' });
                  }
                }}
                className="mt-3 w-full flex items-center justify-center gap-3 px-6 py-3 bg-black text-white rounded-xl shadow-sm hover:shadow-md transition-all"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                </svg>
                <span className="text-sm font-medium">
                  {t('profile.signInApple', 'Sign in with Apple')}
                </span>
              </button>
            </>
          )}
        </div>
      </div>


      {/* Subscription Section */}
      <div className="px-5 mt-6">
        <h3 className="text-lg font-bold text-foreground mb-3">{t('profile.subscription', 'Subscription')}</h3>
        <ProfileSubscriptionCard />
      </div>

      {/* Statistics Section */}
      <div className="px-5 mt-6">
        <h3 className="text-lg font-bold text-foreground mb-3">{t('profile.statistics', 'Statistics')}</h3>
        <ProfileStatsBanner />
      </div>

      {/* Achievements Section */}
      <div className="px-5 mt-6">
        <ProfileAchievements onViewCertificate={() => navigate('/todo/journey-badges')} />
      </div>

      {lastDashboard === 'todo' ? <TodoBottomNavigation /> : <BottomNavigation />}

      {/* Image Cropper Modal */}
      {cropImageSrc && (
        <ProfileImageCropper
          imageSrc={cropImageSrc}
          onCropComplete={async (croppedUrl) => {
            await updateProfile({ avatarUrl: croppedUrl });
            setCropImageSrc(null);
            toast({ title: t('profile.photoUpdated', 'Profile photo updated') });
          }}
          onCancel={() => setCropImageSrc(null)}
        />
      )}

      {/* Cover Image Cropper Modal */}
      {coverCropSrc && (
        <ProfileImageCropper
          imageSrc={coverCropSrc}
          aspect={16 / 5}
          cropShape="rect"
          outputWidth={800}
          outputHeight={250}
          onCropComplete={async (croppedUrl) => {
            await updateProfile({ coverUrl: croppedUrl });
            setCoverCropSrc(null);
            toast({ title: t('profile.coverUpdated', 'Cover photo updated') });
          }}
          onCancel={() => setCoverCropSrc(null)}
        />
      )}

      <CountryFlagPickerSheet
        open={showCountryPicker}
        onOpenChange={setShowCountryPicker}
        selectedCode={manualCountryCode}
        onSelect={handleCountrySelect}
        onReset={handleCountryReset}
      />
    </div>
  );
}
