const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { HttpsError } = require("firebase-functions/v1");

// Google Generative AI SDK import
const { GoogleGenerativeAI } = require("@google/generative-ai");

admin.initializeApp();

// Initialize Gemini AI with API Key from Firebase environment configuration
// 네가 터미널에서 실행한 `firebase functions:config:set` 명령어로 키가 여기에 설정된다.
// DEPRECATION NOTICE: 터미널의 경고 메시지처럼, 이 방식은 2026년 3월 이후 지원 중단된다.
// 나중에는 .env 파일을 사용하는 방식으로 바꿔야 한다.
let genAI;
if (functions.config().gemini && functions.config().gemini.key) {
    genAI = new GoogleGenerativeAI(functions.config().gemini.key);
} else {
    console.warn("Gemini API key가 Firebase 환경 변수에 설정되지 않았습니다.");
}

exports.recommendWritings = functions.region("asia-northeast3").https.onCall(async (data, context) => {
    if (!genAI) {
        throw new HttpsError("failed-precondition", "Gemini AI가 설정되지 않았습니다. API 키를 확인하세요.");
    }

    if (!context.auth) {
        throw new HttpsError("unauthenticated", "인증된 사용자만 이 기능을 호출할 수 있습니다.");
    }

    const { searchTerm, allWritings } = data;
    if (!searchTerm || !allWritings) {
        throw new HttpsError("invalid-argument", "검색어와 전체 글 목록 데이터가 필요합니다.");
    }
    
    // Gemini에게 보낼 데이터 양을 줄이기 위해 글 내용을 200자로 요약
    const writingsForPrompt = allWritings.map(w => ({
        id: w.id,
        title: w.title,
        content: w.content.substring(0, 200)
    }));

    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    const prompt = `
        당신은 개인 노트 앱의 지능형 검색 어시스턴트입니다.
        사용자 검색어의 맥락적 의미를 분석해서, 아래의 글 목록 중에서 가장 관련성 높은 글 3개를 추천해주세요.
        
        사용자 검색어: "${searchTerm}"
        
        글 목록 JSON: ${JSON.stringify(writingsForPrompt)}

        지침:
        1. 사용자 검색어의 의미를 파악하세요. (예: "글쓰기 힘들다" -> 스트레스, 어려움, 고통)
        2. 글 목록의 제목과 내용을 보고, 검색어와 의미적으로 가장 유사한 글을 찾으세요.
        3. 각 추천 글에 대해 "id"와 0에서 100 사이의 "score"(유사도 점수)를 포함하여 응답하세요.
        4. 반드시 [{"id": "...", "score": ...}] 형식의 JSON 배열만 반환하세요. 다른 설명은 절대 추가하지 마세요.
    `;

    try {
        const result = await model.generateContent(prompt);
        const response = result.response;
        const jsonResponse = response.text().trim();
        
        const recommendedIdsWithScores = JSON.parse(jsonResponse);

        if (!Array.isArray(recommendedIdsWithScores)) {
             throw new Error("AI 응답이 유효한 JSON 배열이 아닙니다.");
        }

        const recommendations = recommendedIdsWithScores.map(rec => {
            const originalWriting = allWritings.find(w => w.id === rec.id);
            return originalWriting ? { ...originalWriting, score: rec.score } : null;
        }).filter(Boolean); 

        return { recommendations };

    } catch (error) {
        console.error("AI 추천 생성 오류:", error);
        if (error instanceof SyntaxError) {
             console.error("AI 응답 파싱 실패. 응답 내용:", error.message);
             return { recommendations: [] };
        }
        throw new HttpsError("internal", "AI 추천을 생성하는 데 실패했습니다.");
    }
});

