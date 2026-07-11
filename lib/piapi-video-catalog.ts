export interface VideoVariant {
  id: string;
  label: string;
}

export interface PiAPIVideoModelDef {
  providerId: string;
  apiModel: string;
  label: string;
  variants: VideoVariant[];
  defaultVariant: string;
  modes?: VideoVariant[];
  defaultMode?: string;
  durations: number[];
  defaultDuration: number;
  supportsFirstFrame: boolean;
  supportsLastFrame: boolean;
}

export const PIAPI_VIDEO_CATALOG: PiAPIVideoModelDef[] = [
  {
    providerId: "piapi-kling",
    apiModel: "kling",
    label: "Kling",
    variants: [
      { id: "2.6", label: "v2.6 (Latest)" },
      { id: "2.5", label: "v2.5" },
      { id: "2.1-master", label: "v2.1 Master (Pro only)" },
      { id: "2.1", label: "v2.1" },
      { id: "1.6", label: "v1.6" },
      { id: "1.5", label: "v1.5" },
    ],
    defaultVariant: "2.6",
    modes: [
      { id: "std", label: "Standard" },
      { id: "pro", label: "Professional" },
    ],
    defaultMode: "std",
    durations: [5, 10],
    defaultDuration: 5,
    supportsFirstFrame: true,
    supportsLastFrame: true,
  },
  {
    providerId: "piapi-hailuo",
    apiModel: "hailuo",
    label: "Hailuo (Minimax)",
    variants: [
      { id: "v2.3", label: "v2.3 (768p)" },
      { id: "v2.3-fast", label: "v2.3 Fast (1080p)" },
    ],
    defaultVariant: "v2.3",
    durations: [6, 10],
    defaultDuration: 6,
    supportsFirstFrame: true,
    supportsLastFrame: false,
  },
  {
    providerId: "piapi-seedance",
    apiModel: "seedance",
    label: "Seedance 2.0",
    variants: [
      { id: "seedance-2", label: "Pro" },
      { id: "seedance-2-fast", label: "Fast" },
      { id: "seedance-2-mini", label: "Mini" },
    ],
    defaultVariant: "seedance-2-fast",
    durations: [4, 5, 6, 7, 8, 10, 15],
    defaultDuration: 5,
    supportsFirstFrame: true,
    supportsLastFrame: true,
  },
  {
    providerId: "piapi-luma",
    apiModel: "luma",
    label: "Luma (Dream Machine)",
    variants: [
      { id: "ray-v2", label: "Ray v2" },
    ],
    defaultVariant: "ray-v2",
    durations: [5, 9],
    defaultDuration: 5,
    supportsFirstFrame: true,
    supportsLastFrame: true,
  },
  {
    providerId: "piapi-veo3",
    apiModel: "veo3",
    label: "Veo 3",
    variants: [
      { id: "veo3-video", label: "Standard" },
      { id: "veo3-video-fast", label: "Fast" },
    ],
    defaultVariant: "veo3-video",
    durations: [4, 6, 8],
    defaultDuration: 8,
    supportsFirstFrame: true,
    supportsLastFrame: false,
  },
  {
    providerId: "piapi-sora2",
    apiModel: "sora2",
    label: "Sora 2",
    variants: [
      { id: "sora2-video", label: "Standard" },
    ],
    defaultVariant: "sora2-video",
    durations: [4, 8, 12],
    defaultDuration: 4,
    supportsFirstFrame: true,
    supportsLastFrame: false,
  },
  {
    providerId: "piapi-hunyuan",
    apiModel: "Qubico/hunyuan",
    label: "Hunyuan",
    variants: [
      { id: "txt2video", label: "Text-to-Video" },
      { id: "fast-txt2video", label: "Fast Text-to-Video" },
      { id: "img2video-concat", label: "Img-to-Video (Concat)" },
      { id: "img2video-replace", label: "Img-to-Video (Replace)" },
    ],
    defaultVariant: "img2video-concat",
    durations: [],
    defaultDuration: 0,
    supportsFirstFrame: true,
    supportsLastFrame: false,
  },
  {
    providerId: "piapi-wanx",
    apiModel: "Qubico/wanx",
    label: "WanX (Wan 2.1 / 2.2)",
    variants: [
      { id: "img2video-14b", label: "Img-to-Video 14B" },
      { id: "img2video-14b-keyframe", label: "Keyframe 14B (First+Last)" },
      { id: "txt2video-14b", label: "Text-to-Video 14B" },
      { id: "txt2video-1.3b", label: "Text-to-Video 1.3B (Lite)" },
      { id: "wan22-img2video-14b", label: "Wan 2.2 Img-to-Video" },
      { id: "wan22-txt2video-14b", label: "Wan 2.2 Text-to-Video" },
    ],
    defaultVariant: "img2video-14b",
    durations: [],
    defaultDuration: 0,
    supportsFirstFrame: true,
    supportsLastFrame: true,
  },
  {
    providerId: "piapi-skyreels",
    apiModel: "Qubico/skyreels",
    label: "SkyReels",
    variants: [
      { id: "img2video", label: "Image-to-Video" },
    ],
    defaultVariant: "img2video",
    durations: [],
    defaultDuration: 0,
    supportsFirstFrame: true,
    supportsLastFrame: false,
  },
  {
    providerId: "piapi-framepack",
    apiModel: "Qubico/framepack",
    label: "Framepack",
    variants: [
      { id: "img2video", label: "Image-to-Video" },
    ],
    defaultVariant: "img2video",
    durations: [10, 15, 20, 25, 30],
    defaultDuration: 10,
    supportsFirstFrame: true,
    supportsLastFrame: true,
  },
];

export function findModelDef(providerId: string): PiAPIVideoModelDef | undefined {
  return PIAPI_VIDEO_CATALOG.find(m => m.providerId === providerId);
}
