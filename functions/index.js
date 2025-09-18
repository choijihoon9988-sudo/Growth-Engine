// choijihoon9988-sudo/growth-engine/Growth-Engine-220b491a5615d95000a9a96bb62dea12046bf863/functions/index.js

const admin = require("firebase-admin");
const { initializeApp } = require("firebase-admin/app");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { logger } = require("firebase-functions");

try {
  initializeApp();
} catch (e) {
  logger.info("Firebase Admin SDK already initialized.");
}

let genAI;

// ✅ 1. 함수의 secrets 옵션을 사용하여 환경 변수를 안전하게 로드합니다.
exports.recommendWritings = onCall({ region: "asia-northeast3", secrets: ["GEMINI_KEY"] }, async (request) => {
    
    // ✅ 2. 함수 실행 시점에 SDK를 초기화합니다.
    try {
        if (!genAI) { // genAI가 초기화되지 않았을 경우에만 초기화
            const geminiKey = process.env.GEMINI_KEY;
            if (geminiKey) {
                genAI = new GoogleGenerativeAI(geminiKey);
            } else {
                logger.error("GEMINI_KEY secret이 로드되지 않았습니다.");
                throw new HttpsError("internal", "API 키 설정에 문제가 발생했습니다.");
            }
        }
    } catch (error) {
        logger.error("Gemini SDK 초기화 실패:", error);
        throw new HttpsError("internal", "AI 서비스 초기화에 실패했습니다.");
    }

    if (!request.auth) {
        throw new HttpsError("unauthenticated", "인증된 사용자만 이 기능을 호출할 수 있습니다.");
    }

    const { searchTerm, allWritings } = request.data;
    if (!searchTerm || !allWritings) {
        throw new HttpsError("invalid-argument", "검색어와 전체 글 목록 데이터가 필요합니다.");
    }
    
    const writingsForPrompt = allWritings.map(w => ({
        id: w.id,
        title: w.title,
        content: w.content ? w.content.substring(0, 200) : ''
    }));

    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    const prompt = `
        You are an intelligent search assistant for a personal note-taking app.
        Analyze the contextual meaning of the user's search query and recommend the 3 most relevant writings from the list below.
        
        User's search query: "${searchTerm}"
        
        Writings JSON: ${JSON.stringify(writingsForPrompt)}

        Instructions:
        1. Understand the user's intent. (e.g., "writing is hard" -> stress, difficulty, pain)
        2. Find writings with the most semantically similar titles and content.
        3. Respond with the "id" and a "score" (similarity score from 0 to 100) for each recommendation.
        4. YOU MUST ONLY return a JSON array in the format of [{"id": "...", "score": ...}]. Do not include any other text or explanations.
    `;

    try {
        const result = await model.generateContent(prompt);
        const response = result.response;
        
        let jsonString = response.text().trim();
        const jsonMatch = jsonString.match(/\[(.*?)\]/s);
        
        if (!jsonMatch) {
            logger.error("AI 응답에서 유효한 JSON 배열을 찾지 못했습니다. 응답 내용:", jsonString);
            throw new Error("AI did not return a valid JSON array.");
        }
        
        jsonString = jsonMatch[0];
        
        let recommendedIdsWithScores;
        try {
            recommendedIdsWithScores = JSON.parse(jsonString);
        } catch (e) {
            logger.error("AI 응답 JSON 파싱 실패:", e, "원본 문자열:", jsonString);
            throw new HttpsError("internal", "AI가 반환한 JSON 형식이 올바르지 않습니다.");
        }

        if (!Array.isArray(recommendedIdsWithScores)) {
             throw new Error("AI 응답이 유효한 JSON 배열이 아닙니다.");
        }

        const recommendations = recommendedIdsWithScores.map(rec => {
            const originalWriting = allWritings.find(w => w.id === rec.id);
            return originalWriting ? { ...originalWriting, score: rec.score } : null;
        }).filter(Boolean); 

        return { recommendations };

    } catch (error) {
        logger.error("AI 추천 생성 오류:", error);
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError("internal", "AI 추천을 생성하는 데 실패했습니다.", error.message);
    }
});