/**
 * Demo media for the dental clinic. Unsplash photo ids (each one checked to show
 * that treatment) and Pexels clips of a chair, exam, clean and tools. Both are
 * free to use; the seed downloads them once and caches them (core demoMedia).
 */

export const SERVICE_PHOTO_SIZE = {width: 1200, height: 750};
export const PRACTITIONER_PHOTO_SIZE = {width: 800, height: 800};

export const SERVICE_SLUGS = ["check-up", "cleaning", "filling", "whitening", "ortho-consult"] as const;
export type DemoServiceSlug = (typeof SERVICE_SLUGS)[number];

const PHOTOS = {
    consult: "1606811841689-23dfddce3e95",
    xrays: "1588776814546-1ffcf47267a5",
    exam: "1758205307804-097f5437189f",
    operatory: "1629909613654-28e377c37b09",
    chairs: "1629909615184-74f495363b67",
    scaling: "1766338390573-ec092d69cdcb",
    aligner: "1609840114035-3c981b782dfe",
    smile: "1573496359142-b8d87734a5a2",
};

export const SERVICE_PHOTOS: Record<DemoServiceSlug, string[]> = {
    "check-up": [PHOTOS.consult, PHOTOS.xrays, PHOTOS.exam, PHOTOS.operatory],
    cleaning: [PHOTOS.scaling, PHOTOS.exam, PHOTOS.chairs, PHOTOS.operatory],
    filling: [PHOTOS.exam, PHOTOS.scaling, PHOTOS.xrays, PHOTOS.operatory],
    whitening: [PHOTOS.smile, PHOTOS.consult, PHOTOS.chairs, PHOTOS.operatory],
    "ortho-consult": [PHOTOS.aligner, PHOTOS.consult, PHOTOS.xrays, PHOTOS.chairs],
};

export const PRACTITIONER_PHOTOS: Record<string, string[]> = {
    "Dr. Elira Shehu": ["1559839734-2b71ea197ec2"],
    "Dr. Marco Rossi": ["1622253692010-333f2da6031d"],
    "Anila Doda": ["1594824476967-48c8b964273f"],
};

const CLIPS = {
    tools: "https://videos.pexels.com/video-files/3024321/3024321-sd_960_540_30fps.mp4",
    exam: "https://videos.pexels.com/video-files/6763253/6763253-sd_960_540_25fps.mp4",
    chair: "https://videos.pexels.com/video-files/6630540/6630540-sd_960_506_25fps.mp4",
    cleaning: "https://videos.pexels.com/video-files/5099652/5099652-sd_960_540_30fps.mp4",
};

export const DEMO_VIDEO_URLS = Object.values(CLIPS);

/** Which clips each treatment shows on the booking site. */
export const SERVICE_VIDEOS: Record<DemoServiceSlug, string[]> = {
    "check-up": [CLIPS.exam, CLIPS.tools],
    cleaning: [CLIPS.cleaning],
    filling: [CLIPS.chair, CLIPS.tools],
    whitening: [CLIPS.exam],
    "ortho-consult": [CLIPS.chair],
};
