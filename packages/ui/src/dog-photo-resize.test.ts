import { afterEach, describe, expect, it, vi } from "vitest";

import { DOG_PHOTO_MAX_EDGE_PX, resizeDogPhoto } from "./dog-photo-resize";

/**
 * jsdom decodes and draws nothing: the browser's side is stood in for. `createImageBitmap` answers
 * a picture of `width` × `height`; the canvas encodes the types in `encodes` (another type comes
 * back as PNG, as a browser does), records the size it was drawn at and, in `painted`, what was
 * painted on it in order.
 */
function browser({
  encodes = ["image/webp", "image/jpeg"],
  height,
  width,
}: {
  encodes?: string[];
  height: number;
  width: number;
}) {
  const close = vi.fn();
  const decode = vi.fn(() => Promise.resolve({ close, height, width }));
  vi.stubGlobal("createImageBitmap", decode);
  const painted: string[] = [];
  const context = {
    drawImage: vi.fn((_image: unknown, x: number, y: number, w: number, h: number) => {
      painted.push(`picture ${String(x)},${String(y)} ${String(w)}×${String(h)}`);
    }),
    fillRect: vi.fn((x: number, y: number, w: number, h: number) => {
      painted.push(
        `${String(context.fillStyle)} ${String(x)},${String(y)} ${String(w)}×${String(h)}`,
      );
    }),
    fillStyle: "black" as unknown,
    imageSmoothingQuality: "low",
  };
  const drawImage = context.drawImage;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => context as never);
  const drawn: { height: number; quality: unknown; type: string; width: number }[] = [];
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (
    this: HTMLCanvasElement,
    callback: BlobCallback,
    type?: string,
    quality?: unknown,
  ) {
    drawn.push({ height: this.height, quality, type: type ?? "", width: this.width });
    const encoded = type !== undefined && encodes.includes(type) ? type : "image/png";
    callback(new Blob(["encoded"], { type: encoded }));
  });
  return { close, decode, drawImage, drawn, painted };
}

const photo = (name = "IMG_0042.JPG", type = "image/jpeg") =>
  new File(["a large camera picture"], name, { lastModified: 1_700_000_000_000, type });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("WEB-05: a dog photo is reduced in the browser before it is uploaded", () => {
  it("a 4032 × 3024 camera picture goes up as a 1600 × 1200 JPEG (0.85), upright, with its name kept, even where the browser encodes WebP", async () => {
    const { close, decode, drawImage, drawn } = browser({ height: 3024, width: 4032 });
    const original = photo();
    const resized = await resizeDogPhoto(original);
    expect(DOG_PHOTO_MAX_EDGE_PX).toBe(1600);
    expect(decode).toHaveBeenCalledWith(original, { imageOrientation: "from-image" });
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 1200);
    // The api makes the lists' thumbnail only from a JPEG or PNG photo: WebP is never asked for.
    expect(drawn).toEqual([{ height: 1200, quality: 0.85, type: "image/jpeg", width: 1600 }]);
    expect(resized).not.toBe(original);
    expect(resized.type).toBe("image/jpeg");
    expect(resized.name).toBe("IMG_0042.jpg");
    expect(resized.lastModified).toBe(original.lastModified);
    expect(close).toHaveBeenCalledOnce();
  });

  it("a portrait keeps its proportions, and a transparent PNG is laid on white before it becomes a JPEG", async () => {
    const { drawn, painted } = browser({ height: 4000, width: 3000 });
    const resized = await resizeDogPhoto(photo("duna.png", "image/png"));
    expect(painted).toEqual(["white 0,0 1200×1600", "picture 0,0 1200×1600"]);
    expect(drawn).toEqual([{ height: 1600, quality: 0.85, type: "image/jpeg", width: 1200 }]);
    expect(resized.type).toBe("image/jpeg");
    expect(resized.name).toBe("duna.jpg");
  });

  it("a picture already within 1600 px goes up as it is", async () => {
    const { close, drawn } = browser({ height: 1200, width: 1600 });
    const original = photo();
    expect(await resizeDogPhoto(original)).toBe(original);
    expect(drawn).toEqual([]);
    expect(close).toHaveBeenCalledOnce();
  });

  it("a file the browser cannot decode or reduce, or that is not an image, goes up as it is", async () => {
    const { decode } = browser({ height: 3024, width: 4032 });
    const document = photo("cartilla.pdf", "application/pdf");
    expect(await resizeDogPhoto(document)).toBe(document);
    expect(decode).not.toHaveBeenCalled();

    decode.mockImplementationOnce(() => Promise.reject(new Error("HEIC is not decoded here")));
    const heic = photo("IMG_0043.HEIC", "image/heic");
    expect(await resizeDogPhoto(heic)).toBe(heic);

    // No JPEG comes out of this canvas (only WebP, which the api cannot thumbnail).
    const { drawn } = browser({ encodes: ["image/webp"], height: 3024, width: 4032 });
    const original = photo();
    expect(await resizeDogPhoto(original)).toBe(original);
    expect(drawn.map(({ type }) => type)).toEqual(["image/jpeg"]);

    // No `createImageBitmap` at all.

    vi.unstubAllGlobals();
    expect(await resizeDogPhoto(original)).toBe(original);
  });
});
