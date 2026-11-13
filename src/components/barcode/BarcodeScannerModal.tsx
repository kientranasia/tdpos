import { useEffect, useRef, useState } from 'react';
import type { BarcodeFormat } from '@zxing/browser';
import { Camera, Flashlight, RefreshCw, ScanLine, X } from 'lucide-react';
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

type NativeBarcode = { rawValue?: string };
type NativeBarcodeDetector = {
  detect: (source: CanvasImageSource) => Promise<NativeBarcode[]>;
};
type NativeBarcodeDetectorConstructor = new (options?: { formats?: string[] }) => NativeBarcodeDetector;

const nativeBarcodeFormats = [
  'code_128',
  'code_39',
  'codabar',
  'data_matrix',
  'ean_13',
  'ean_8',
  'itf',
  'qr_code',
  'upc_a',
  'upc_e',
];

const zxingBarcodeFormats = [
  1, // CODABAR
  4, // CODE_128
  2, // CODE_39
  5, // DATA_MATRIX
  7, // EAN_13
  6, // EAN_8
  8, // ITF
  11, // QR_CODE
  14, // UPC_A
  15, // UPC_E
] as unknown as BarcodeFormat[];

type BarcodeTrackCapabilities = MediaTrackCapabilities & {
  focusMode?: string[];
  torch?: boolean;
};

type BarcodeTrackConstraintSet = MediaTrackConstraintSet & {
  focusMode?: string;
  torch?: boolean;
};

const createNativeBarcodeDetector = async (): Promise<NativeBarcodeDetector | null> => {
  const detectorConstructor = (window as Window & {
    BarcodeDetector?: NativeBarcodeDetectorConstructor & {
      getSupportedFormats?: () => Promise<string[]>;
    };
  }).BarcodeDetector;
  if (!detectorConstructor) return null;

  try {
    const supportedFormats = detectorConstructor.getSupportedFormats
      ? await detectorConstructor.getSupportedFormats()
      : nativeBarcodeFormats;
    const formats = nativeBarcodeFormats.filter((format) => supportedFormats.includes(format));
    return formats.length ? new detectorConstructor({ formats }) : null;
  } catch {
    return null;
  }
};

export function BarcodeScannerModal({
  open,
  title = 'Quét mã vạch',
  description = 'Đưa mã vạch vào giữa khung. Camera sau của điện thoại sẽ tự nhận diện mã.',
  onClose,
  onDetected,
}: BarcodeScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const startScannerRef = useRef<(() => void) | null>(null);
  const onCloseRef = useRef(onClose);
  const onDetectedRef = useRef(onDetected);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [scanStatus, setScanStatus] = useState<'starting' | 'scanning'>('starting');
  const [scanEngine, setScanEngine] = useState<'native' | 'zxing' | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);

  useEffect(() => {
    onCloseRef.current = onClose;
    onDetectedRef.current = onDetected;
  }, [onClose, onDetected]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    let stream: MediaStream | null = null;
    let scanRun = 0;
    const video = videoRef.current;

    const stopStream = (mediaStream: MediaStream | null) => {
      mediaStream?.getTracks().forEach((track) => track.stop());
    };

    const getCameraStream = async () => {
      const videoConstraints = {
        // 720p is enough for retail barcodes and starts much faster than
        // asking a phone for a full 1080p stream.
        width: { ideal: 1280, min: 640 },
        height: { ideal: 720, min: 480 },
        frameRate: { ideal: 30, max: 30 },
        aspectRatio: { ideal: 16 / 9 },
      };
      let nextStream: MediaStream;

      try {
        // Prefer the rear camera on phones. The exact constraint is important
        // because some mobile browsers otherwise open the selfie camera even
        // when the environment camera is available.
        nextStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { ...videoConstraints, facingMode: { exact: 'environment' } },
        });
      } catch (cameraError) {
        const name = cameraError instanceof DOMException ? cameraError.name : '';
        if (name !== 'OverconstrainedError' && name !== 'ConstraintNotSatisfiedError') throw cameraError;
        nextStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { ...videoConstraints, facingMode: { ideal: 'environment' } },
        });
      }

      // Keep autofocus running while the user moves the barcode into frame.
      try {
        const track = nextStream.getVideoTracks()[0];
        cameraTrackRef.current = track || null;
        const capabilities = track?.getCapabilities() as BarcodeTrackCapabilities;
        setTorchSupported(Boolean(capabilities?.torch));
        setTorchEnabled(false);
        if (track && capabilities.focusMode?.includes('continuous')) {
          await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as BarcodeTrackConstraintSet] });
        }
      } catch {
        // Focus controls are optional and not exposed by every mobile browser.
      }

      return nextStream;
    };

    const showDetectedCode = (rawCode: string, runId: number) => {
      const code = rawCode.trim();
      if (!code || cancelled || runId !== scanRun) return;

      cancelled = true;
      setScanStatus('scanning');
      stopStream(stream);
      onDetectedRef.current(code);
      onCloseRef.current();
    };

    const waitForNextFrame = () => new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });

    const drawScanRegion = (canvas: HTMLCanvasElement, fullFrame: boolean) => {
      if (!video.videoWidth || !video.videoHeight) return false;

      const sourceWidth = video.videoWidth;
      const sourceHeight = video.videoHeight;
      const cropX = fullFrame ? 0 : Math.round(sourceWidth * 0.09);
      const cropY = fullFrame ? 0 : Math.round(sourceHeight * 0.14);
      const cropWidth = fullFrame ? sourceWidth : Math.round(sourceWidth * 0.82);
      const cropHeight = fullFrame ? sourceHeight : Math.round(sourceHeight * 0.72);
      const maxDecodeWidth = 960;
      const scale = Math.min(1, maxDecodeWidth / cropWidth);

      canvas.width = Math.max(1, Math.round(cropWidth * scale));
      canvas.height = Math.max(1, Math.round(cropHeight * scale));
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) return false;
      context.imageSmoothingEnabled = false;
      context.drawImage(
        video,
        cropX,
        cropY,
        cropWidth,
        cropHeight,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      return true;
    };

    const startScanner = async () => {
      const runId = ++scanRun;
      setError('');
      setStarting(true);
      setScanStatus('starting');
      setScanEngine(null);
      setTorchSupported(false);
      setTorchEnabled(false);
      if (!video) return;

      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError(getCameraError(null));
        setStarting(false);
        return;
      }

      const nativeDetectorPromise = createNativeBarcodeDetector();

      try {
        stream = await getCameraStream();
        if (cancelled || runId !== scanRun) {
          stopStream(stream);
          return;
        }

        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        await video.play();
        if (!video.videoWidth || !video.videoHeight) {
          await new Promise<void>((resolve) => {
            video.addEventListener('loadeddata', () => resolve(), { once: true });
          });
        }
        setStarting(false);
        setScanStatus('scanning');

        const nativeDetector = await nativeDetectorPromise;
        if (nativeDetector) {
          setScanEngine('native');
          const canvas = document.createElement('canvas');
          const detectNative = async () => {
            let attempts = 0;
            while (!cancelled && runId === scanRun && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
              try {
                // Most retail codes are placed in the guided region. A full
                // frame retry every few attempts still catches badly aligned
                // codes without making every detection expensive.
                const fullFrame = attempts % 6 === 5;
                if (!drawScanRegion(canvas, fullFrame)) break;
                const results = await nativeDetector.detect(canvas);
                const code = results.find((result) => result.rawValue?.trim())?.rawValue;
                if (code) {
                  showDetectedCode(code, runId);
                  return;
                }
              } catch {
                // A frame can fail while the camera is adjusting focus/exposure.
              }
              attempts += 1;
              await waitForNextFrame();
            }
          };
          void detectNative();
          return;
        }

        setScanEngine('zxing');
        // Keep the fallback decoder out of the initial page bundle. Modern
        // browsers use BarcodeDetector; ZXing is loaded only when needed.
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        const reader = new BrowserMultiFormatReader(undefined, {
          delayBetweenScanAttempts: 90,
          delayBetweenScanSuccess: 90,
        });
        reader.possibleFormats = zxingBarcodeFormats;
        const canvas = document.createElement('canvas');
        let attempts = 0;
        while (!cancelled && runId === scanRun && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          try {
            const fullFrame = attempts % 5 === 4;
            if (drawScanRegion(canvas, fullFrame)) {
              const result = reader.decodeFromCanvas(canvas);
              if (result) {
                showDetectedCode(result.getText(), runId);
                return;
              }
            }
          } catch {
            // ZXing throws when a frame has no readable code; keep scanning.
          }
          attempts += 1;
          await waitForNextFrame();
        }
      } catch (scannerError) {
        if (!cancelled && runId === scanRun) {
          stopStream(stream);
          setError(getCameraError(scannerError));
          setStarting(false);
          setScanStatus('starting');
          setScanEngine(null);
        }
      }
    };

    startScannerRef.current = () => {
      scanRun += 1;
      stopStream(stream);
      stream = null;
      cameraTrackRef.current = null;
      void startScanner();
    };
    void startScanner();

    return () => {
      cancelled = true;
      scanRun += 1;
      startScannerRef.current = null;
      stopStream(stream);
      cameraTrackRef.current = null;
      setTorchSupported(false);
      setTorchEnabled(false);
      if (video) video.srcObject = null;
    };
  }, [open]);

  const toggleTorch = async () => {
    const track = cameraTrackRef.current;
    if (!track || !torchSupported) return;
    const nextEnabled = !torchEnabled;
    try {
      await track.applyConstraints({ advanced: [{ torch: nextEnabled } as BarcodeTrackConstraintSet] });
      setTorchEnabled(nextEnabled);
    } catch {
      // Torch support is optional and some browsers report it incorrectly.
      setTorchSupported(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/75 p-2 backdrop-blur-sm sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="barcode-scanner-title"
        className="flex max-h-[calc(100dvh-1rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
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

        <div className="min-h-0 space-y-3 overflow-y-auto p-3 sm:p-4">
          <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-slate-950">
            <video ref={videoRef} className="h-full w-full object-cover" muted playsInline autoPlay />
            <div className="pointer-events-none absolute inset-[14%_9%] rounded-xl border-2 border-white/90 shadow-[0_0_0_999px_rgba(15,23,42,0.28)]" />
            {torchSupported && !error && (
              <button
                type="button"
                onClick={() => void toggleTorch()}
                aria-label={torchEnabled ? 'Tắt đèn hỗ trợ quét mã' : 'Bật đèn hỗ trợ quét mã'}
                aria-pressed={torchEnabled}
                className={`absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border text-white shadow-lg backdrop-blur transition ${torchEnabled ? 'border-amber-300 bg-amber-400/90 text-slate-950' : 'border-white/40 bg-slate-950/60 hover:bg-slate-950/80'}`}
              >
                <Flashlight className="h-4 w-4" />
              </button>
            )}
            <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
              <span className="rounded-full bg-slate-950/70 px-3 py-1 text-[11px] font-medium text-white">
                {scanStatus === 'starting' ? 'Đang mở camera...' : 'Đang nhận diện mã...'}
              </span>
            </div>
            {scanStatus === 'scanning' && !error && (
              <div className="pointer-events-none absolute inset-[14%_9%] overflow-hidden rounded-xl">
                <div className="absolute inset-x-0 top-0 h-0.5 animate-[barcode-scanline_2.2s_ease-in-out_infinite] bg-sky-300 shadow-[0_0_14px_4px_rgba(125,211,252,0.75)]" />
              </div>
            )}
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
          {scanStatus === 'scanning' && !error && (
            <p className="text-[11px] text-sky-700">
              {scanEngine === 'native' ? 'Đang dùng bộ nhận diện của trình duyệt.' : 'Đang dùng bộ nhận diện tương thích đa định dạng.'}
            </p>
          )}
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
