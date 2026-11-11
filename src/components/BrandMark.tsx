import { useApp } from '../context/AppContext';

type BrandMarkProps = {
  compact?: boolean;
  className?: string;
};

export default function BrandMark({ compact = false, className = '' }: BrandMarkProps) {
  const { activeTenant } = useApp();
  const branding = activeTenant?.settings?.branding;
  const logoUrl = branding?.logoUrl || activeTenant?.logoUrl || '/branding/hkdsmart-logo.png';
  const iconUrl = branding?.logoUrl || activeTenant?.logoUrl || '/branding/hkdsmart-icon.png';
  const alt = branding?.appName || activeTenant?.name || 'HKD Smart';
  if (!compact) {
    return (
      <img
        src={logoUrl}
        alt={alt}
        className={`block h-9 w-auto max-w-[min(210px,calc(100vw-160px))] object-contain object-left ${className}`}
      />
    );
  }

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <img
        src={iconUrl}
        alt={alt}
        className="h-9 w-9 shrink-0 rounded-lg object-cover"
      />
    </span>
  );
}
