import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { adaptPack } from "../src/adapt/adapt.js";
import { MissingRequiredRoleError } from "../src/errors.js";
import { LOCKED_SEGMENT_5S, TIMED_BEATS_5S } from "../examples/exactPrompts.js";
import { tinyDeskPets5sPack, tinyDeskPetsPack } from "../examples/tinyDesk.js";

const huskyJob = JSON.parse(readFileSync(new URL("../examples/adapt-husky-only.json", import.meta.url), "utf8")) as {
  images: Array<{ roleId: string; path?: string; appearance?: { breed?: string } }>;
};
const shortPack = tinyDeskPets5sPack();
const fullPack = tinyDeskPetsPack();

const STALE = [
  "orange tabby",
  "green-yellow",
  "blue eyes",
  "Pembroke",
  "red-gold",
  "tuxedo",
  "French bulldog",
  "beagle",
  "shiba",
  "golden retriever",
];

describe("5s pack prompts", () => {
  it("reproduces the 2026-11-12 timed-beats and locked-segment prompts", () => {
    const segment = shortPack.generationSegments[0]!;
    expect(segment.variantPrompts["timed-beats"]).toBe(TIMED_BEATS_5S);
    expect(segment.variantPrompts["locked-segment"]).toBe(LOCKED_SEGMENT_5S);
  });
});

describe("adapt identity rewrite", () => {
  it("keeps a locked single-performer shot continuous", async () => {
    const adapted = await adaptPack(shortPack, huskyJob.images, { variant: "locked-segment" });
    const prompt = adapted.segments[0]!.prompt;
    expect(adapted.segments[0]?.derivedFrom).toBe("locked-segment");
    expect(prompt).toMatch(/no hard cuts/i);
    expect(prompt).toContain("Locked medium-wide camera, no push-in, no close-up insert.");
    expect(prompt).not.toMatch(/0-3s/);
    expect(prompt).not.toMatch(/\. a /);
    expect(prompt).toMatch(/The only animal is a solid grey Siberian husky with amber eyes/i);
    for (const term of STALE) expect(prompt.toLowerCase()).not.toContain(term.toLowerCase());
  });

  it("rewrites a one-pet job onto the new appearance and drops template breeds", async () => {
    const adapted = await adaptPack(shortPack, huskyJob.images);
    expect(adapted.adaptation.interaction).toBe("single-performer");
    expect(adapted.adaptation.countClass).toBe("single");
    expect(adapted.adaptation.petCount).toBe(1);
    expect(adapted.adaptation.usedModelText).toBe(false);
    expect(adapted.mappingPolicy).toBe("drop-unfilled");
    const prompt = adapted.segments[0]!.prompt;
    expect(adapted.segments[0]?.variant).toBe("single-performer");
    expect(adapted.segments[0]?.derivedFrom).toBe("timed-beats");
    expect(prompt).toMatch(/solid grey/i);
    expect(prompt).toMatch(/amber eyes/i);
    expect(prompt).toContain("0-3s");
    expect(prompt).toContain("3-5s");
    expect(prompt).toContain("hard cut");
    expect(prompt).toContain("locked medium-wide");
    expect(prompt).toContain("9:16");
    for (const term of STALE) expect(prompt.toLowerCase()).not.toContain(term.toLowerCase());
    expect(adapted.roles.find((role) => role.roleId === "lead")?.status).toBe("filled");
    expect(adapted.roles.filter((role) => role.status === "dropped").map((role) => role.roleId)).toEqual([
      "keys",
      "left-backup",
      "right-backup",
      "sax",
    ]);
  });

  it("collapses every full-pack segment without inventing the rest of the band", async () => {
    const adapted = await adaptPack(fullPack, huskyJob.images);
    expect(adapted.segments).toHaveLength(2);
    for (const segment of adapted.segments) {
      expect(segment.collapsed).toBe(true);
      expect(segment.prompt).toMatch(/amber eyes/i);
      for (const term of ["orange tabby", "Pembroke", "tuxedo", "French bulldog", "beagle", "shiba", "golden retriever", "blue eyes"]) {
        expect(segment.prompt.toLowerCase()).not.toContain(term.toLowerCase());
      }
    }
    expect(adapted.generationHints).toMatchObject({
      model: "agnes-video-2.5",
      resolution: "720P",
      aspectRatio: "9:16",
      imagesOnly: true,
      mode: "reference",
      seconds: ["12", "6"],
    });
  });

  it("refuses a job that leaves the required lead empty", async () => {
    await expect(
      adaptPack(shortPack, [
        {
          roleId: "keys",
          path: "customers/someone.jpg",
          appearance: { species: "dog", breed: "poodle", colors: ["apricot"] },
        },
      ]),
    ).rejects.toBeInstanceOf(MissingRequiredRoleError);
  });

  it("drops unfilled backups from an ensemble and keeps the new lead and keys", async () => {
    const adapted = await adaptPack(shortPack, [
      { roleId: "lead", url: "https://cdn.example/lead.jpg", appearance: { breed: "Siamese cat", colors: ["seal-point"] } },
      { roleId: "keys", url: "https://cdn.example/keys.jpg", appearance: { breed: "standard poodle", colors: ["apricot"] } },
    ]);
    expect(adapted.adaptation.interaction).toBe("ensemble-in-frame");
    expect(adapted.adaptation.photoLayout).toBe("solo-stills");
    expect(adapted.segments[0]?.variant).toBe("timed-beats");
    const prompt = adapted.segments[0]!.prompt;
    expect(prompt).toMatch(/seal-point Siamese cat/i);
    expect(prompt).toMatch(/apricot standard poodle/i);
    expect(prompt).toMatch(/separate photos/i);
    expect(prompt).toContain("red cap");
    expect(prompt).not.toMatch(/Pembroke|tuxedo|French bulldog|orange tabby|blue eyes/i);
    expect(prompt).not.toMatch(/while\s*,|and\s+and/);
  });

  it("keeps pets who share one photo together and prefers the locked variant", async () => {
    const adapted = await adaptPack(shortPack, [
      {
        roleId: "lead",
        url: "https://cdn.example/pair.jpg",
        groupId: "pair",
        appearance: { breed: "orange tabby", count: 2 },
      },
      {
        roleId: "keys",
        url: "https://cdn.example/pair.jpg",
        groupId: "pair",
        label: "the blue-eyed husky beside the tabby",
        appearance: { breed: "Siberian husky", eyes: "blue", count: 2 },
      },
    ]);
    expect(adapted.adaptation.petCount).toBe(2);
    expect(adapted.adaptation.photoLayout).toBe("grouped");
    expect(adapted.adaptation.interaction).toBe("grouped-together");
    expect(adapted.segments[0]?.variant).toBe("locked-segment");
    const prompt = adapted.segments[0]!.prompt;
    expect(prompt).toMatch(/stay together/i);
    expect(prompt).toContain("<Image 1>");
    expect(prompt).toContain("<Image 2>");
    expect(prompt).not.toMatch(/Pembroke|tuxedo|French bulldog/i);
  });

  it("replaces every default breed when the customer fills the whole cast", async () => {
    const adapted = await adaptPack(fullPack, [
      { roleId: "lead", url: "https://cdn.example/1.jpg", appearance: { breed: "Siamese cat", colors: ["seal-point"] } },
      { roleId: "keys", url: "https://cdn.example/2.jpg", appearance: { breed: "standard poodle", colors: ["apricot"] } },
      { roleId: "left-backup", url: "https://cdn.example/3.jpg", appearance: { breed: "pug", colors: ["black"] } },
      { roleId: "right-backup", url: "https://cdn.example/4.jpg", appearance: { breed: "calico cat" } },
      { roleId: "sax", url: "https://cdn.example/5.jpg", appearance: { breed: "wheaten terrier" } },
    ]);
    const text = adapted.segments.map((segment) => segment.prompt).join("\n");
    expect(text).toMatch(/Siamese cat/);
    expect(text).toMatch(/standard poodle/);
    expect(text).toMatch(/black pug/);
    expect(text).toMatch(/calico cat/);
    expect(text).toMatch(/wheaten terrier/);
    for (const term of ["orange tabby", "blue eyes", "Pembroke", "tuxedo", "French bulldog", "beagle", "shiba", "golden retriever"]) {
      expect(text.toLowerCase()).not.toContain(term.toLowerCase());
    }
  });
});
