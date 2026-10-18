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

type NativeBarcode = { rawValue?: string };
type NativeBarcodeDetector = {
  detect: (source: HTMLVideoElement) => Promise<NativeBarcode[]>;
};
type NativeBarcodeDetectorConstructor = new (options?: { formats?: string[] }) => NativeBarcodeDetector;

const nativeBarcodeFormats = [
  'aztec',
  'code_128',
  'code_39',
  'code_93',
  'codabar',
  'data_matrix',
  'ean_13',
  'ean_8',
  'itf',
  'pdf417',
  'qr_code',
  'upc_a',
  'upc_e',
];

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
  const controlsRef = useRef<IScannerControls | null>(null);
  const startScannerRef = useRef<(() => void) | null>(null);
  const onCloseRef = useRef(onClose);
  const onDetectedRef = useRef(onDetected);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [scanStatus, setScanStatus] = useState<'starting' | 'scanning'>('starting');
  const [scanEngine, setScanEngine] = useState<'native' | 'zxing' | null>(null);

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

    const stopStream = (mediaStream: MediaStream | null) => {
      mediaStream?.getTracks().forEach((track) => track.stop());
    };

    const getCameraStream = async () => {
      const videoConstraints = {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
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

      // Once permission is granted, choose a device explicitly when the
      // browser exposes a rear-camera label but did not honor facingMode.
      try {
        const currentTrack = nextStream.getVideoTracks()[0];
        const currentSettings = currentTrack?.getSettings();
        const devices = await navigator.mediaDevices.enumerateDevices();
        const rearCamera = devices.find((device) =>
          device.kind === 'videoinput' && /back|rear|environment|camera sau|sau/i.test(device.label)
        );
        if (rearCamera?.deviceId && rearCamera.deviceId !== currentSettings?.deviceId) {
          stopStream(nextStream);
          nextStream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { ...videoConstraints, deviceId: { exact: rearCamera.deviceId } },
          });
        }
      } catch {
        // Keep the already-open stream if device enumeration is unavailable.
      }

      // Keep autofocus running while the user moves the barcode into frame.
      try {
        const track = nextStream.getVideoTracks()[0];
        const capabilities = track?.getCapabilities() as MediaTrackCapabilities & { focusMode?: string[] };
        if (track && capabilities.focusMode?.includes('continuous')) {
          await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] });
        }
      } catch {
        // Focus controls are optional and not exposed by every mobile browser.
      }

      return nextStream;
    };

    const showDetectedCode = (rawCode: string) => {
      const code = rawCode.trim();
      if (!code || cancelled) return;

      cancelled = true;
      setScanStatus('scanning');
      controls?.stop();
      controlsRef.current?.stop();
      stopStream(stream);
      onDetectedRef.current(code);
      onCloseRef.current();
    };

    const startScanner = async () => {
      setError('');
      setStarting(true);
      setScanStatus('starting');
      setScanEngine(null);
      if (!video) return;

      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError(getCameraError(null));
        setStarting(false);
        return;
      }

      const reader = new BrowserMultiFormatReader(undefined, {
        delayBetweenScanAttempts: 180,
        delayBetweenScanSuccess: 180,
      });
      reader.possibleFormats = [
        BarcodeFormat.AZTEC,
        BarcodeFormat.CODABAR,
        BarcodeFormat.DATA_MATRIX,
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.ITF,
        BarcodeFormat.PDF_417,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.QR_CODE,
      ];

      try {
        stream = await getCameraStream();
        if (cancelled) {
          stopStream(stream);
          return;
        }

        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        await video.play();
        setStarting(false);
        setScanStatus('scanning');

        const nativeDetector = await createNativeBarcodeDetector();
        if (nativeDetector) {
          setScanEngine('native');
          const detectNative = async () => {
            while (!cancelled && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
              try {
                const results = await nativeDetector.detect(video);
                const code = results.find((result) => result.rawValue?.trim())?.rawValue;
                if (code) {
                  showDetectedCode(code);
                  return;
                }
              } catch {
                // A frame can fail while the camera is adjusting focus/exposure.
              }
              await new Promise((resolve) => window.setTimeout(resolve, 120));
            }
          };
          void detectNative();
          return;
        }

        setScanEngine('zxing');
        controls = await reader.decodeFromStream(stream, video, (result, _decodeError, scanControls) => {
            if (cancelled || !result) return;
            scanControls.stop();
            showDetectedCode(result.getText());
          });

        if (cancelled) controls.stop();
        else controlsRef.current = controls;
      } catch (scannerError) {
        if (!cancelled) {
          stopStream(stream);
          setError(getCameraError(scannerError));
          setStarting(false);
          setScanStatus('starting');
          setScanEngine(null);
        }
      }
    };

    startScannerRef.current = () => {
      controls?.stop();
      stopStream(stream);
      void startScanner();
    };
    void startScanner();

    return () => {
      cancelled = true;
      startScannerRef.current = null;
      controls?.stop();
      controlsRef.current?.stop();
      controlsRef.current = null;
      stopStream(stream);
      if (video) video.srcObject = null;
    };
  }, [open]);

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
