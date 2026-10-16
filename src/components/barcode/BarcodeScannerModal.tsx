import { useEffect, useRef, useState } from 'react';
import { BarcodeFormat, BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { Camera, RefreshCw, ScanLine, X } from 'lucide-react';
import { Button } from '../ui/Button';

type BarcodeScannerModalProps = {
  open: boolean;
  title?: string;
  description?: string;
  onClose: () => void;
  onDetected: (code: string) => void;
};

const getCameraError = (error: unknown) => {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    return `Camera điện thoại cần HTTPS hoặc localhost. Địa chỉ hiện tại: ${window.location.origin}. Nếu đang mở qua IP nội bộ trên điện thoại, hãy dùng hostname có chứng chỉ HTTPS.`;
  }

  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Trình duyệt đang chặn camera. Hãy cấp quyền Camera cho trang này rồi bấm “Bật camera lại”. Nếu trang nằm trong iframe, máy chủ cần cho phép camera qua Permissions-Policy.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'Không tìm thấy camera trên thiết bị này.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'Camera đang được ứng dụng khác sử dụng. Hãy đóng ứng dụng đó rồi thử lại.';
  }
  if (name === 'OverconstrainedError') {
    return 'Camera không hỗ trợ cấu hình hiện tại. Hãy thử lại để dùng camera mặc định của thiết bị.';
  }
  return 'Không mở được camera. Hãy kiểm tra quyền truy cập rồi thử lại hoặc dùng máy quét mã vạch.';
};

export function BarcodeScannerModal({
  open,
  title = 'Quét mã vạch',
  description = 'Đưa mã vạch vào giữa khung. Camera sau của điện thoại sẽ tự nhận diện mã.',
  onClose,
  onDetected,
}: BarcodeScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const startScannerRef = useRef<(() => void) | null>(null);
  const onCloseRef = useRef(onClose);
  const onDetectedRef = useRef(onDetected);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    onCloseRef.current = onClose;
    onDetectedRef.current = onDetected;
  }, [onClose, onDetected]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    let controls: IScannerControls | null = null;
    let stream: MediaStream | null = null;
    const video = videoRef.current;

    const startScanner = async () => {
      setError('');
      setStarting(true);
      if (!video) return;

      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError(getCameraError(null));
        setStarting(false);
        return;
      }

      const reader = new BrowserMultiFormatReader();
      reader.possibleFormats = [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.QR_CODE,
      ];

      try {
        // Request the stream explicitly so permission is triggered by the
        // user's click on "Bật camera lại" on Safari/WebView as well.
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        controls = await reader.decodeFromStream(stream, video, (result, _decodeError, scanControls) => {
            if (cancelled || !result) return;
            const code = result.getText().trim();
            if (!code) return;

            cancelled = true;
            scanControls.stop();
            controls?.stop();
            controlsRef.current?.stop();
            onDetectedRef.current(code);
            onCloseRef.current();
          });

        if (cancelled) controls.stop();
        else controlsRef.current = controls;
        setStarting(false);
      } catch (scannerError) {
        if (!cancelled) {
          stream?.getTracks().forEach((track) => track.stop());
          setError(getCameraError(scannerError));
          setStarting(false);
        }
      }
    };

    startScannerRef.current = () => {
      controls?.stop();
      stream?.getTracks().forEach((track) => track.stop());
      void startScanner();
    };
    void startScanner();

    return () => {
      cancelled = true;
      startScannerRef.current = null;
      controls?.stop();
      controlsRef.current?.stop();
      controlsRef.current = null;
      stream?.getTracks().forEach((track) => track.stop());
      if (video) video.srcObject = null;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/75 p-3 backdrop-blur-sm sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="barcode-scanner-title"
        className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-5 sm:py-4">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
              <Camera className="h-4 w-4" />
            </span>
            <h3 id="barcode-scanner-title" className="truncate text-base font-semibold text-slate-900">
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Đóng trình quét mã vạch"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 p-3 sm:p-4">
          <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-slate-950">
            <video ref={videoRef} className="h-full w-full object-cover" muted playsInline autoPlay />
            <div className="pointer-events-none absolute inset-[14%_9%] rounded-xl border-2 border-white/90 shadow-[0_0_0_999px_rgba(15,23,42,0.28)]" />
            <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
              <span className="rounded-full bg-slate-950/70 px-3 py-1 text-[11px] font-medium text-white">
                Giữ mã vạch nằm ngang trong khung
              </span>
            </div>
            {error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/95 px-5 text-center">
                <ScanLine className="h-8 w-8 text-amber-300" />
                <p className="text-sm leading-5 text-white">{error}</p>
                <Button
                  type="button"
                  variant="outline"
                  className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                  disabled={starting}
                  onClick={() => startScannerRef.current?.()}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {starting ? 'Đang mở camera...' : 'Bật camera lại'}
                </Button>
              </div>
            )}
          </div>

          <p className="text-xs leading-5 text-slate-500">{description}</p>
          <p className="text-[11px] leading-4 text-slate-400">
            Nếu camera không mở, bạn có thể nhập mã bằng tay hoặc dùng máy quét mã vạch dạng bàn phím.
          </p>
          <Button type="button" variant="outline" className="w-full" onClick={onClose}>
            Đóng
          </Button>
        </div>
      </div>
    </div>
  );
}
