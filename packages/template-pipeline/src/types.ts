export type Variant = 'timed-beats' | 'locked-segment';

export type PackRole = {
  id: string;
  label: string;
  required: boolean;
  position?: string;
  appearanceHints?: string;
  wardrobe?: string;
  promptToken?: string;
  staleTerms?: string[];
};

export type CueSubject = {
  roleId: string;
  authored?: string;
  action?: string;
  wardrobePhrase?: string;
};

export type OptionalSentence = {
  roleId: string;
  identity?: string;
  template: string;
};

export type TimedCue = {
  label: string;
  startSec?: number;
  endSec?: number;
  opener?: string;
  subjects?: CueSubject[];
  closer?: string;
  camera?: string;
  singleAction?: string;
  optionalSentences?: OptionalSentence[];
};

export type LockedLine = {
  roleId: string;
  position?: string;
  identity?: string;
  wardrobe?: string;
  action?: string;
};

export type SegmentScript = {
  timedHeader?: string;
  timedCues?: TimedCue[];
  timedFooter?: string;
  lockedIntro?: string;
  lockedLines?: LockedLine[];
  lockedExclusion?: string;
  lockedCamera?: string;
  setting?: string;
};

export type GenerationSegment = {
  id: string;
  startSec: number;
  endSec: number;
  durationSec: number;
  promptSeconds: number;
  beatIds?: string[];
  variantPrompts: Record<Variant, string>;
  script?: SegmentScript;
};

export type TemplatePack = {
  schemaVersion: '1.0.0';
  id: string;
  title?: string;
  version?: string;
  aspectRatio: '9:16';
  sourceDurationSec: number;
  styleLine?: string;
  roles: PackRole[];
  generationSegments: GenerationSegment[];
  providerHints?: {
    defaultModel?: string;
    resolution?: string;
    imagesOnly?: boolean;
    mode?: string;
  };
  provenance?: {
    shotBoundariesSec?: number[];
    segmentStrategy?: string;
  };
};

export type CustomerImage = {
  roleId?: string;
  url?: string;
  shared?: boolean;
  subjects?: number;
};

export type AdaptedImage = {
  roleId: string;
  url: string;
  token: string;
};

export type AdaptedSegment = {
  id: string;
  index: number;
  startSec: number;
  endSec: number;
  durationSec: number;
  promptSeconds: number;
  prompt: string;
};

export type AdaptedPromptSet = {
  packId: string;
  aspectRatio: '9:16';
  sourceDurationSec: number;
  shotBoundariesSec: number[];
  variant: Variant;
  stayTogether: boolean;
  collapsed: boolean;
  images: AdaptedImage[];
  segments: AdaptedSegment[];
};

export type AgnesCreatePayload = {
  sent: false;
  imagesOnly: true;
  segmentId: string;
  body: {
    model: 'agnes-video-2.5';
    prompt: string;
    seconds: string;
    mode: 'reference';
    size: '720P';
    aspect_ratio: '9:16';
    images: string[];
  };
};
