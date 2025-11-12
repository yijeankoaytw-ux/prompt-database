const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");

exports.handler = async (event) => {
    // 處理 CORS
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
    };

    // 處理 OPTIONS 請求（CORS preflight）
    if (event.httpMethod === "OPTIONS") {
        return {
            statusCode: 200,
            headers,
            body: ""
        };
    }

    // 1. 從環境變數中安全地讀取 API 金鑰
    const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
    if (!GOOGLE_API_KEY) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "API Key not configured" })
        };
    }

    // 2. 初始化 Gemini
    const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);
    const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash", // 使用 gemini-1.5-flash 以求快速
        generationConfig: {
            responseMimeType: "application/json", // 3. 強制回傳 JSON
        }
    });

    // 4. (可選) 設定安全門檻
    const safetySettings = [
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    ];

    // 5. 從前端獲取關鍵字
    let keyword;
    try {
        const body = event.body ? JSON.parse(event.body) : {};
        keyword = body.keyword;
    } catch (e) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: "Invalid request body" })
        };
    }
    if (!keyword || keyword.trim() === "") {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: "Keyword is required" })
        };
    }

    // 6. 準備給 Gemini 的指令 (Prompt)
    const prompt = `
你是一個 AI 繪圖提示詞專家。請根據使用者提供的關鍵字，生成 4 個獨特、詳細、充滿視覺創意的 AI 繪圖提示詞。
你必須只回傳一個 JSON 物件，格式為: {"suggestions": ["提示詞1", "提示詞2", "提示詞3", "提示詞4"]}

使用者關鍵字: "${keyword}"
    `;

    // 7. 呼叫 Gemini API
    try {
        const result = await model.generateContent(prompt, safetySettings);
        const response = result.response;
        const suggestionsJson = response.text();

        // 8. 將 Gemini 回傳的 JSON 字串直接傳回給前端
        return {
            statusCode: 200,
            headers: {
                ...headers,
                "Content-Type": "application/json"
            },
            body: suggestionsJson
        };

    } catch (error) {
        console.error("Error calling Gemini API:", error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }
};

