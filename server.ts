import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Support larger payload for webcam image base64
app.use(express.json({ limit: "15mb" }));

// Lazy-initialized Gemini client
let aiClient: GoogleGenAI | null = null;
function getAI(): GoogleGenAI | null {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// Health check
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    hasApiKey: Boolean(process.env.GEMINI_API_KEY),
    serverTime: new Date().toISOString(),
  });
});

// AI Waste Classification API
app.post("/api/classify-waste", async (req, res) => {
  try {
    const { image, hint } = req.body;

    if (!image) {
      return res.status(400).json({ error: "Thiếu dữ liệu hình ảnh (base64 image required)" });
    }

    // Extract raw base64 data and mimeType
    let base64Data = image;
    let mimeType = "image/jpeg";

    if (image.includes(",")) {
      const parts = image.split(",");
      base64Data = parts[1];
      const match = parts[0].match(/data:(.*?);base64/);
      if (match) {
        mimeType = match[1];
      }
    }

    const ai = getAI();

    // If Gemini API is available, analyze with gemini-3.8-flash
    if (ai) {
      try {
        const prompt = `Bạn là chuyên gia AI phân loại rác thông minh cho dự án cuộc thi STEM môi trường.
Hãy phân tích hình ảnh này và xác định vật thể rác thải, sau đó phân loại chính xác vào 1 trong 3 nhóm sau:
1. "organic" (Rác hữu cơ) -> số điểm: 1. Ví dụ: vỏ hoa quả (chuối, táo...), rau củ hỏng, lá cây, thức ăn thừa, bã trà/cà phê, thức ăn thối rữa.
2. "recyclable" (Rác tái chế) -> số điểm: 2. Ví dụ: chai nhựa PET, vỏ lon nhôm/kim loại, giấy báo vụn, thùng bìa carton, chai lọ thủy tinh, cốc nhựa sạch.
3. "inorganic" (Rác vô cơ / Rác còn lại khó phân hủy) -> số điểm: 3. Ví dụ: túi nilon, màng bọc thực phẩm, hộp xốp vỡ bẩn, tã bỉm, mảnh gốm sứ vỡ, pin cũ, bóng đèn, khẩu trang y tế đã qua sử dụng.

Kiểm tra chống gian lận (Anti-Cheat Spoof Check):
- Kiểm tra xem người dùng có đang giơ một màn hình điện thoại, máy tính bảng hoặc một bức ảnh in tĩnh phẳng lên trước camera để gian lận quét ảnh lấy điểm thay vì rác thật hay không (nhận diện qua viền màn hình, phản quang đèn nền, lưới điểm ảnh hiển thị, góc phẳng 2D).
- Nếu phát hiện rõ ràng là giơ màn hình điện thoại hoặc ảnh 2D để gian lận, hãy đặt isScreenOrPhotoSpoof = true và giải thích trong spoofReason.

Yêu cầu trả về JSON chuẩn theo schema:
- category: đúng một trong 3 chuỗi "organic", "recyclable", hoặc "inorganic".
- itemName: tên ngắn gọn tiếng Việt của món rác (ví dụ: "Vỏ chuối chín", "Chai nước suối PET", "Túi nilon dùng một lần", "Vỏ lon nước ngọt", "Hộp xốp thực phẩm").
- points: 1 nếu là organic, 2 nếu là recyclable, 3 nếu là inorganic.
- confidence: độ tin cậy từ 0.80 đến 0.99.
- description: giải thích 1 câu ngắn về chất liệu và tính chất phân hủy.
- binColor: màu thùng rác tương ứng ("green" cho hữu cơ, "yellow" cho tái chế, "orange" cho vô cơ).
- recyclingTip: lời khuyên bảo vệ môi trường và cách bỏ rác chuẩn STEM cho học sinh.
- ecoImpact: số liệu ước tính bảo vệ môi trường (ví dụ: "+0.12kg CO2 giảm phát thải", "Ủ thành 50g phân bón xanh", "Tiết kiệm năng lượng tái chế").
- isScreenOrPhotoSpoof: boolean, true nếu phát hiện ảnh chụp từ màn hình hoặc ảnh giả mạo.
- spoofReason: chuỗi mô tả nếu phát hiện gian lận màn hình.
${hint ? `Gợi ý nhận diện từ hệ thống: ${hint}` : ""}`;

        const response = await ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: mimeType,
                  data: base64Data,
                },
              },
              { text: prompt },
            ],
          },
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                category: {
                  type: Type.STRING,
                  description: "Chỉ chọn: organic, recyclable, hoặc inorganic",
                },
                itemName: {
                  type: Type.STRING,
                  description: "Tên vật thể rác tiếng Việt",
                },
                points: {
                  type: Type.INTEGER,
                  description: "1 cho organic, 2 cho recyclable, 3 cho inorganic",
                },
                confidence: {
                  type: Type.NUMBER,
                  description: "Độ tin cậy từ 0.70 đến 0.99",
                },
                description: {
                  type: Type.STRING,
                  description: "Mô tả chất liệu và tính chất",
                },
                binColor: {
                  type: Type.STRING,
                  description: "green, yellow, hoặc orange",
                },
                recyclingTip: {
                  type: Type.STRING,
                  description: "Lời khuyên bỏ rác chuẩn môi trường",
                },
                ecoImpact: {
                  type: Type.STRING,
                  description: "Tác động sinh thái tích cực",
                },
                isScreenOrPhotoSpoof: {
                  type: Type.BOOLEAN,
                  description: "True nếu người dùng chụp lại màn hình điện thoại hoặc ảnh 2D thay vì rác thật",
                },
                spoofReason: {
                  type: Type.STRING,
                  description: "Giải thích nếu phát hiện ảnh chụp từ màn hình",
                },
              },
              required: [
                "category",
                "itemName",
                "points",
                "confidence",
                "description",
                "binColor",
                "recyclingTip",
              ],
            },
          },
        });

        const rawText = response.text || "{}";
        const result = JSON.parse(rawText);

        // Ensure points align strictly with prompt rules
        if (result.category === "organic") {
          result.points = 1;
          result.binColor = "green";
        } else if (result.category === "recyclable") {
          result.points = 2;
          result.binColor = "yellow";
        } else {
          result.category = "inorganic";
          result.points = 3;
          result.binColor = "orange";
        }

        return res.json({
          success: true,
          mode: "gemini-ai",
          data: result,
        });
      } catch (geminiError: any) {
        console.warn("Gemini Vision failed, falling back to heuristic simulation:", geminiError?.message);
      }
    }

    // Heuristic demo fallback when API key is not ready or offline
    const demoCatalog = [
      {
        category: "organic" as const,
        itemName: "Vỏ chuối chín hữu cơ",
        points: 1,
        confidence: 0.94,
        description: "Chất hữu cơ tự nhiên, phân hủy hoàn toàn sau 2-4 tuần.",
        binColor: "green",
        recyclingTip: "Bỏ vào Thùng Xanh để ủ phân compost cho vườn trường.",
        ecoImpact: "Tạo 60g phân bón hữu cơ giàu vi lượng",
      },
      {
        category: "recyclable" as const,
        itemName: "Chai nhựa PET tái chế",
        points: 2,
        confidence: 0.97,
        description: "Nhựa số 1 (PET), có thể tái sinh thành sợi vải hoặc chai mới.",
        binColor: "yellow",
        recyclingTip: "Lột nhãn, xúc sạch nước thừa và bẹp chai trước khi bỏ thùng vàng.",
        ecoImpact: "Giảm 0.18kg khí CO2 phát thải ra khí quyển",
      },
      {
        category: "inorganic" as const,
        itemName: "Túi nilon dùng 1 lần (Rác vô cơ)",
        points: 3,
        confidence: 0.92,
        description: "Nhựa mỏng khó tái chế, mất 400 - 500 năm để phân rã.",
        binColor: "orange",
        recyclingTip: "Bỏ vào Thùng Cam/Xám. Hạn chế sử dụng, chuyển sang túi vải eco.",
        ecoImpact: "Ngăn chặn hạt vi nhựa phát tán vào đất & nguồn nước",
      },
      {
        category: "recyclable" as const,
        itemName: "Lon nhôm nước ngọt",
        points: 2,
        confidence: 0.96,
        description: "Kim loại nhôm có thể tái chế vô hạn lần mà không giảm chất lượng.",
        binColor: "yellow",
        recyclingTip: "Lau khô và ép dẹp để tiết kiệm diện tích thùng chứa.",
        ecoImpact: "Tiết kiệm 95% năng lượng so với luyện nhôm mới",
      },
      {
        category: "organic" as const,
        itemName: "Rau củ thừa & lá cây",
        points: 1,
        confidence: 0.91,
        description: "Sinh khối thực vật dễ ủ mùn vi sinh phục vụ nông nghiệp sạch.",
        binColor: "green",
        recyclingTip: "Để ráo nước trước khi phân loại vào thùng rác hữu cơ.",
        ecoImpact: "Giảm sinh khí Methane (CH4) tại bãi rác tập trung",
      },
    ];

    const randomIndex = Math.floor(Math.random() * demoCatalog.length);
    const simulated = demoCatalog[randomIndex];

    return res.json({
      success: true,
      mode: "simulation",
      data: simulated,
    });
  } catch (error: any) {
    console.error("Classification error:", error);
    res.status(500).json({ error: "Lỗi xử lý hình ảnh", details: error.message });
  }
});

// ==============================================================================
// GOOGLE SHEETS PROXY API
// ==============================================================================
let activeGoogleScriptUrl: string =
  process.env.GOOGLE_SHEETS_SCRIPT_URL ||
  process.env.VITE_GOOGLE_SHEETS_SCRIPT_URL ||
  "";

// 1. Get current Google Sheets config
app.get("/api/sheets/config", (_req, res) => {
  res.json({
    configured: Boolean(activeGoogleScriptUrl && activeGoogleScriptUrl.startsWith("http")),
    url: activeGoogleScriptUrl,
  });
});

// 2. Set / Update Google Sheets Web App URL in runtime
app.post("/api/sheets/config", (req, res) => {
  const { url } = req.body;
  if (typeof url === "string") {
    activeGoogleScriptUrl = url.trim();
    return res.json({ success: true, url: activeGoogleScriptUrl });
  }
  return res.status(400).json({ error: "URL không hợp lệ" });
});

// 3. Test connection to Google Apps Script
app.post("/api/sheets/test", async (req, res) => {
  try {
    const urlToTest = req.body.url || activeGoogleScriptUrl;
    if (!urlToTest) {
      return res.status(400).json({ success: false, error: "Chưa cung cấp URL để kiểm tra" });
    }

    const response = await fetch(urlToTest, {
      method: "GET",
      headers: { Accept: "application/json" },
      redirect: "follow",
    });

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: `Google Sheets trả về mã lỗi HTTP ${response.status}`,
      });
    }

    const data: any = await response.json();
    if (data.status === "success") {
      // Auto-save verified URL
      activeGoogleScriptUrl = urlToTest;
      return res.json({
        success: true,
        sheetTitle: data.sheetTitle || "Google Sheets EcoSort",
        totalPlayers: data.players ? data.players.length : 0,
        totalScans: data.history ? data.history.length : 0,
      });
    } else {
      return res.json({
        success: false,
        error: data.message || "Apps Script không trả về status: success",
      });
    }
  } catch (err: any) {
    return res.json({
      success: false,
      error: `Lỗi kết nối tới Google Sheets: ${err.message}`,
    });
  }
});

// 4. Get Leaderboard and Classification History from Google Sheets
app.get("/api/sheets/data", async (_req, res) => {
  if (!activeGoogleScriptUrl) {
    return res.json({
      status: "unconfigured",
      message: "Chưa cấu hình Google Apps Script URL",
      players: [],
      history: [],
    });
  }

  try {
    const response = await fetch(activeGoogleScriptUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      redirect: "follow",
    });

    if (!response.ok) {
      return res.status(response.status).json({
        status: "error",
        message: `HTTP ${response.status} từ Google Sheets`,
        players: [],
        history: [],
      });
    }

    const data = await response.json();
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({
      status: "error",
      message: `Không thể lấy dữ liệu từ Google Sheets: ${err.message}`,
      players: [],
      history: [],
    });
  }
});

// 5. Record new waste classification (+1, +2, +3 points) to Google Sheets
app.post("/api/sheets/record", async (req, res) => {
  if (!activeGoogleScriptUrl) {
    return res.status(400).json({
      status: "error",
      message: "Chưa cấu hình Google Apps Script URL",
    });
  }

  try {
    const payload = {
      action: "recordWaste",
      ...req.body,
    };

    const response = await fetch(activeGoogleScriptUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      redirect: "follow",
    });

    if (!response.ok) {
      return res.status(response.status).json({
        status: "error",
        message: `HTTP ${response.status} khi gửi dữ liệu lên Google Sheets`,
      });
    }

    const data = await response.json();
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({
      status: "error",
      message: `Lỗi gửi điểm đến Google Sheets: ${err.message}`,
    });
  }
});

// 6. Register new player in Google Sheets with 0 points
app.post("/api/sheets/register", async (req, res) => {
  if (!activeGoogleScriptUrl) {
    return res.status(400).json({
      status: "error",
      message: "Chưa cấu hình Google Apps Script URL",
    });
  }

  try {
    const payload = {
      action: "registerPlayer",
      ...req.body,
    };

    const response = await fetch(activeGoogleScriptUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      redirect: "follow",
    });

    if (!response.ok) {
      return res.status(response.status).json({
        status: "error",
        message: `HTTP ${response.status} khi đăng ký người chơi trên Google Sheets`,
      });
    }

    const data = await response.json();
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({
      status: "error",
      message: `Lỗi đăng ký người chơi: ${err.message}`,
    });
  }
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`EcoSort Server running on http://localhost:${PORT}`);
  });
}

startServer();
