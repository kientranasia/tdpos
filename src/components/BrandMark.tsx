type BrandMarkProps = {
  compact?: boolean;
  className?: string;
};

export default function BrandMark({ compact = false, className = '' }: BrandMarkProps) {
  if (!compact) {
    return (
      <img
        src="/branding/hkdsmart-logo.png"
        alt="HKD Smart — Kinh Doanh Tinh Gọn"
        className={`block h-9 w-auto max-w-[min(210px,calc(100vw-160px))] object-contain object-left ${className}`}
      />
    );
  }

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <img
        src="/branding/hkdsmart-icon.png"
        alt="HKD Smart"
        className="h-9 w-9 shrink-0 rounded-lg object-cover"
      />
    </span>
  );
}
