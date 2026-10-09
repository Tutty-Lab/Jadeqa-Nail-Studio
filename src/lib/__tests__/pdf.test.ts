import { afterEach, describe, expect, it, vi } from "vitest";
import { safeFileName, sharePdf } from "../pdf";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("safeFileName", () => {
  it("entfernt vietnamesische Akzente", () => {
    expect(safeFileName("Nguyễn Văn Tuấn")).toBe("Nguyen_Van_Tuan");
    expect(safeFileName("Đức")).toBe("Duc");
  });

  it("entfernt deutsche Umlaute und ß-fremde Zeichen", () => {
    expect(safeFileName("Jörg Müller")).toBe("Jorg_Muller");
  });

  it("lässt unbedenkliche Zeichen stehen", () => {
    expect(safeFileName("Mai-2026_08")).toBe("Mai-2026_08");
  });

  it("hat immer einen brauchbaren Rückfallwert", () => {
    expect(safeFileName("   ")).toBe("Stundenzettel");
    expect(safeFileName("///")).toBe("Stundenzettel");
  });
});

describe("deliver", () => {
  it("tải file trực tiếp qua thẻ a với download attribute và MIME octet-stream", async () => {
    const { deliver } = await import("../pdf");
    const blob = new Blob(["%PDF-dummy"], { type: "application/pdf" });
    let createdUrl = "";
    let clickedDownload = "";
    let clickedRel = "";
    let blobType = "";

    const originalDocument = (globalThis as any).document;
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;

    const mockAnchor = {
      href: "",
      download: "",
      rel: "",
      style: {} as any,
      click: () => {},
    };

    const mockBody = {
      appendChild: (node: any) => {
        clickedDownload = node.download;
        clickedRel = node.rel;
        return node;
      },
      removeChild: (node: any) => node,
      contains: () => true,
    };

    (globalThis as any).document = {
      createElement: (tag: string) => {
        if (tag === "a") return mockAnchor;
        return {};
      },
      body: mockBody,
    };

    URL.createObjectURL = (b: Blob) => {
      blobType = b.type;
      createdUrl = "blob:http://localhost/test-uuid";
      return createdUrl;
    };
    URL.revokeObjectURL = () => {};

    try {
      await deliver(blob, "Stundenzettel_Tuan.pdf");

      expect(blobType).toBe("application/octet-stream");
      expect(clickedDownload).toBe("Stundenzettel_Tuan.pdf");
      expect(clickedRel).toBe("noopener");
    } finally {
      (globalThis as any).document = originalDocument;
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
    }
  });
});

describe("sharePdf (trình duyệt nhúng Zalo/Messenger)", () => {
  const blob = new Blob(["%PDF-dummy"], { type: "application/pdf" });

  it("mở bảng Chia sẻ của hệ thống với file PDF đúng tên", async () => {
    const share = vi.fn(async () => {});
    vi.stubGlobal("navigator", { canShare: () => true, share });

    await expect(sharePdf(blob, "Stundenzettel_tat_ca_2026-09.pdf")).resolves.toBe("shared");
    expect(share).toHaveBeenCalledOnce();
    const shared = (share.mock.calls[0] as unknown as [{ files: File[] }])[0].files[0];
    expect(shared.name).toBe("Stundenzettel_tat_ca_2026-09.pdf");
    expect(shared.type).toBe("application/pdf");
  });

  it("người dùng tự đóng bảng Chia sẻ thì không coi là lỗi", async () => {
    const abort = Object.assign(new Error("cancelled"), { name: "AbortError" });
    vi.stubGlobal("navigator", { canShare: () => true, share: vi.fn(async () => { throw abort; }) });

    await expect(sharePdf(blob, "a.pdf")).resolves.toBe("cancelled");
  });

  it("báo không hỗ trợ khi WebView không chia sẻ được file (để hiện hướng dẫn mở trình duyệt)", async () => {
    vi.stubGlobal("navigator", { canShare: () => false, share: vi.fn() });
    await expect(sharePdf(blob, "a.pdf")).resolves.toBe("unsupported");

    vi.stubGlobal("navigator", {});
    await expect(sharePdf(blob, "a.pdf")).resolves.toBe("unsupported");
  });

  it("lỗi khác (ví dụ hết hạn thao tác người dùng) trả về failed", async () => {
    const denied = Object.assign(new Error("denied"), { name: "NotAllowedError" });
    vi.stubGlobal("navigator", { canShare: () => true, share: vi.fn(async () => { throw denied; }) });

    await expect(sharePdf(blob, "a.pdf")).resolves.toBe("failed");
  });
});

describe("Urlaub in PDF exports", () => {
  it("marks vacation separately from attendance and public holidays", async () => {
    const { buildStundenzettelPdf, buildDienstplanPdf } = await import("../pdf");
    const { initialScheduleFor, storeById } = await import("../stores");
    const schedule = { ...initialScheduleFor(storeById("jadeqa")), year: 2025, month: 1 };
    const employee = schedule.employees.find((e) => e.id === "jadeqa-1")!;
    const dates = ["2025-01-01", "2025-01-02", "2025-01-24", "2025-01-25"];
    const timesheet = await buildStundenzettelPdf(schedule, [employee], { dates });
    const contents = (pdf: typeof timesheet) => (pdf.internal as unknown as { pages: string[][] }).pages.flat().join("\n");
    const text = contents(timesheet);
    expect(text).toContain("Urlaub");
    expect(text).toContain("Stunden offen");
    expect(text).toContain("Feiertag");
    expect(text).not.toContain("08:00");
    expect(timesheet.getNumberOfPages()).toBe(1);
    for (const layout of ["byEmployee", "byDate"] as const) {
      const plan = buildDienstplanPdf(schedule, { dates, title: "Januar 2025", layout, employeeIds: [employee.id] });
      expect(contents(plan)).toContain("Urlaub");
      expect(plan.getNumberOfPages()).toBe(1);
    }
  });
});

describe("choose PDF save location", () => {
  it("writes the PDF to the selected file and closes it", async () => {
    const write = vi.fn(async () => {});
    const close = vi.fn(async () => {});
    const picker = vi.fn(async () => ({ createWritable: async () => ({ write, close }) }));
    vi.stubGlobal("window", { showSaveFilePicker: picker });
    const { savePdfAtLocation } = await import("../pdf");
    const blob = new Blob(["%PDF"]);
    expect(await savePdfAtLocation(blob, "Jadeqa_05_2025.pdf")).toBe("saved");
    expect(picker).toHaveBeenCalledWith(expect.objectContaining({ suggestedName: "Jadeqa_05_2025.pdf" }));
    expect(write).toHaveBeenCalledWith(blob);
    expect(close).toHaveBeenCalledOnce();
  });
  it("cancelling the chooser does not trigger a download", async () => {
    vi.stubGlobal("window", { showSaveFilePicker: async () => { throw Object.assign(new Error("cancelled"), { name: "AbortError" }); } });
    const { savePdfAtLocation } = await import("../pdf");
    expect(await savePdfAtLocation(new Blob(), "a.pdf")).toBe("cancelled");
  });
});
