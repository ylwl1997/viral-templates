import { readFileSync } from 'node:fs';
import { syncAuthoredPrompts } from '../dist/site/index.js';

const fiveSecond = {
  schemaVersion: '1.0.0',
  id: 'tiny-desk-pets-5s',
  title: 'Tiny Desk pets 5s',
  version: '1.0.0',
  aspectRatio: '9:16',
  sourceDurationSec: 5,
  notes: 'Five-second desk-concert test pack used by the official adapt and payload tests.',
  styleLine: 'Photorealistic 9:16 Tiny Desk office, packed bookshelves, warm lights, vintage mics.',
  templateAnimalTerms: ['beagle', 'shiba', 'golden retriever'],
  roles: [
    {
      id: 'lead',
      label: 'Lead singer',
      required: true,
      position: 'Hook close-up',
      appearanceHints: 'orange tabby cat',
      wardrobe: 'a red cap and a red-and-black hoodie',
      promptToken: '<Image 1>',
      staleTerms: ['orange tabby', 'green-yellow'],
    },
    {
      id: 'keys',
      label: 'Keys',
      required: false,
      position: 'Center at the red keyboard',
      appearanceHints: 'black-and-white Siberian husky',
      wardrobe: 'a black jacket and headset',
      promptToken: '<Image 2>',
      staleTerms: ['blue eyes'],
    },
    {
      id: 'left-backup',
      label: 'Left backup',
      required: false,
      position: 'Backup left',
      appearanceHints: 'Pembroke Welsh corgi',
      wardrobe: 'a white hoodie',
      promptToken: '<Image 3>',
      staleTerms: ['Pembroke', 'red-gold'],
    },
    {
      id: 'right-backup',
      label: 'Right backup',
      required: false,
      position: 'Backup right',
      appearanceHints: 'tuxedo cat',
      wardrobe: 'a red track jacket',
      promptToken: '<Image 4>',
      staleTerms: ['tuxedo'],
    },
    {
      id: 'sax',
      label: 'Saxophone',
      required: false,
      position: 'Saxophone profile',
      appearanceHints: 'cream French bulldog',
      wardrobe: 'a navy-and-white hoodie',
      promptToken: '<Image 5>',
      staleTerms: ['French bulldog'],
    },
  ],
  storyBeats: [{ id: 'hook', startSec: 0, endSec: 5, summary: 'Five-second desk concert test.' }],
  generationSegments: [
    {
      id: 'segment-1',
      startSec: 0,
      endSec: 5,
      durationSec: 5,
      promptSeconds: 5,
      beatIds: ['hook'],
      variantPrompts: { 'timed-beats': 'pending', 'locked-segment': 'pending' },
      script: {
        timedHeader: 'Photorealistic vertical 9:16 video. Follow this time-coded direction. Every performer is the exact pet in the photos, not a human. No human faces and no human hands.',
        timedCues: [
          {
            label: '0-3s',
            startSec: 0,
            endSec: 3,
            opener: 'In a cramped, shelf-packed office,',
            subjects: [
              {
                roleId: 'lead',
                authored: 'the orange tabby cat from <Image 1>',
                action: 'sings in a red cap and a red-and-black hoodie',
                wardrobePhrase: 'a red cap and a red-and-black hoodie',
              },
              {
                roleId: 'keys',
                authored: 'the husky from <Image 2>',
                action: 'plays the red keyboard in a black jacket and headset',
                wardrobePhrase: 'a black jacket and headset',
              },
            ],
            closer: 'locked medium-wide, warm lights, vintage mics',
            camera: 'Hard cut, locked medium-wide,',
            anchor: 'locked medium-wide',
            singleAction: 'sings into the vintage mic',
          },
          {
            label: '3-5s',
            startSec: 3,
            endSec: 5,
            opener: 'The same locked medium-wide holds',
            subjects: [
              {
                roleId: 'lead',
                authored: 'the orange tabby cat from <Image 1>',
                action: 'keeps the hook in a red cap',
                wardrobePhrase: 'a red cap',
              },
            ],
            closer: 'no push-in',
            camera: 'Hard cut, locked medium-wide,',
            anchor: 'locked medium-wide',
            singleAction: 'holds the hook',
          },
        ],
        timedFooter: 'Keep this animal\'s exact face and markings. Do not leave the original template animals in the shot. A hard cut marks each beat. Photorealistic, packed bookshelves, vintage mics.',
        lockedIntro: 'Photorealistic vertical 9:16 video of a single continuous shot, no hard cuts. Packed bookshelves and vintage mics.\n\nLocked medium-wide camera, no push-in, no close-up insert.',
        lockedLines: [
          {
            roleId: 'lead',
            position: 'Center',
            identity: 'the pet',
            wardrobe: 'a red cap and a red-and-black hoodie',
            action: 'singing',
          },
          {
            roleId: 'keys',
            position: 'Keys',
            identity: 'the pet',
            wardrobe: 'a black jacket and headset',
            action: 'playing',
          },
        ],
        lockedExclusion: 'Do not add another animal. Photorealistic, packed bookshelves, vintage mics.',
        lockedCamera: 'Locked medium-wide camera, no push-in, no close-up insert.',
        setting: 'A cramped shelf-packed office with vintage mics',
        styleAnchors: ['9:16', 'Photorealistic', 'vintage mics'],
      },
    },
  ],
  providerHints: {
    defaultModel: 'agnes-video-2.5',
    resolution: '720P',
    imagesOnly: true,
    mode: 'reference',
  },
  provenance: {
    boundaries: 'manual',
    shotBoundariesSec: [3],
    detail: 'Five-second test segment for the official adapt tests.',
    segmentStrategy: 'single-segment',
  },
};

export function tinyDeskPets5sPack() {
  return syncAuthoredPrompts(structuredClone(fiveSecond));
}

export function tinyDeskPetsPack() {
  return JSON.parse(readFileSync(new URL('../packs/tiny-desk-pets/pack.json', import.meta.url), 'utf8'));
}
