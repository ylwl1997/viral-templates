import { describe, expect, it } from "vitest";
import { adaptPack } from "../src/adapt/adapt.js";
import { formatAgnesCreatePayload } from "../src/providers/agnes-video.js";
import { tinyDeskPets5sPack } from "../examples/tinyDesk.js";

describe("Agnes video payload", () => {
  it("formats a reference-image create body and does not send it", async () => {
    const adapted = await adaptPack(tinyDeskPets5sPack(), [
      { roleId: "lead", url: "https://cdn.example/lead.jpg", appearance: { breed: "Siamese cat", colors: ["seal-point"] } },
      { roleId: "keys", url: "https://cdn.example/keys.jpg", appearance: { breed: "poodle", colors: ["white"] } },
      { roleId: "sax", url: "https://cdn.example/sax.jpg", appearance: { breed: "terrier", colors: ["wheaten"] } },
    ]);
    const request = formatAgnesCreatePayload(adapted, adapted.segments[0]!.id);
    expect(request.notSent).toBe(true);
    expect(request.create.method).toBe("POST");
    expect(request.create.url).toBe("https://api.agnes-ai.cn/v1/videos");
    expect(request.create.body).toMatchObject({
      model: "agnes-video-2.5",
      mode: "reference",
      size: "720P",
      aspect_ratio: "9:16",
      seconds: "5",
      n: 1,
      images: ["https://cdn.example/lead.jpg", "https://cdn.example/keys.jpg", "https://cdn.example/sax.jpg"],
    });
    expect(request.create.body).not.toHaveProperty("videos");
    expect(request.create.body).not.toHaveProperty("audios");
    expect(request.poll.url).toBe("https://api.agnes-ai.cn/agnesapi");
    expect(request.poll.query.model_name).toBe("agnes-video-2.5");
    expect(request.create.body.prompt).toContain("<Image 1>");
    expect(request.create.body.prompt).not.toContain("<Image 5>");
  });

  it("refuses to shift image indexes when a public URL is missing", async () => {
    const adapted = await adaptPack(tinyDeskPets5sPack(), [
      { roleId: "lead", path: "customers/local.jpg", appearance: { breed: "husky", colors: ["grey"], eyes: "amber" } },
    ]);
    const request = formatAgnesCreatePayload(adapted, "segment-1");
    expect(request.create.body.images).toEqual([]);
    expect(request.warnings.join(" ")).toMatch(/public image URL/i);
    expect(request.notSent).toBe(true);
  });
});
