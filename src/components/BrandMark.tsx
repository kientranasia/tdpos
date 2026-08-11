type BrandMarkProps = {
  compact?: boolean;
  className?: string;
};

export default function BrandMark({ compact = false, className = '' }: BrandMarkProps) {
  if (!compact) {
    return (
      <img
        src="/branding/hkdcare-logo.png"
        alt="HKDCare — Quản lý gọn, an tâm kinh doanh"
        className={`h-10 w-auto max-w-[210px] object-contain object-left ${className}`}
      />
    );
  }

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <img
        src="/branding/hkdplus-icon.png"
        alt="HKDCare"
        className="h-9 w-9 shrink-0 rounded-lg object-cover"
      />
    </span>
  );
}
