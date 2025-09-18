/* [수정 완료] functions/index.js */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

/*
 [수정] Firebase Functions 환경에서는 .env 파일보다 환경 변수 설정을 사용하는 것이 권장됨.
 require("dotenv").config(); 로 변경하거나, 아래 주석처럼 Firebase CLI를 통해 설정.
 firebase functions:config:set gemini.key="YOUR_API_KEY"
*/
require("dotenv").config();

admin.initializeApp();
const db = admin.firestore();

// [수정] Firebase 환경 변수에서 Gemini API 키를 가져오도록 수정.
// 로컬 테스트 시에는 functions/.env 파일에 GEMINI_KEY="YOUR_KEY" 형식으로 저장.
const GEMINI_API_KEY = functions.config().gemini ? functions.config().gemini.key : process.env.GEMINI_KEY;


exports.generateSummary = functions.region("asia-northeast3")
    .firestore.document("users/{userId}/writings/{writingId}")
    .onWrite(async (change, context) => {
        // 문서가 삭제된 경우 함수 종료
        if (!change.after.exists) {
            return null;
        }

        const data = change.after.data();
        const content = data.content;

        // 요약이 이미 있거나, 내용이 너무 짧으면 함수 종료
        if (data.summary || !content || content.length < 50) {
            return null;
        }

        // 내용이 변경되지 않았으면 함수 종료 (성능 최적화)
        if (change.before.exists && content === change.before.data().content) {
            return null;
        }
        
        // API 키가 설정되지 않은 경우 오류 처리
        if (!GEMINI_API_KEY) {
             console.error("Gemini API 키가 설정되지 않았습니다. 'firebase functions:config:set gemini.key=...'를 실행하세요.");
             return change.after.ref.update({ summary: "오류: API 키가 설정되지 않았습니다." });
        }

        try {
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`;
            const requestData = {
                contents: [{
                    parts: [{
                        // [개선] 프롬프트를 더 명확하게 수정
                        text: `다음 텍스트를 전문적이고 간결한 한국어 한 문장으로 요약해줘.\n\n---\n${content}`
                    }]
                }],
                generationConfig: {
                    temperature: 0.4,
                    maxOutputTokens: 100,
                }
            };

            const response = await axios.post(apiUrl, requestData, {
                headers: { "Content-Type": "application/json" }
            });
            
            // [수정] API 응답 구조에 대한 예외 처리 강화
            if (response.data && response.data.candidates && response.data.candidates.length > 0 && response.data.candidates[0].content && response.data.candidates[0].content.parts && response.data.candidates[0].content.parts.length > 0) {
                const summary = response.data.candidates[0].content.parts[0].text.trim();
                return change.after.ref.update({ summary: summary });
            } else {
                // [수정] 응답 구조가 예상과 다를 경우 로그 기록
                console.error("Gemini API로부터 유효한 요약을 받지 못했습니다. 응답:", JSON.stringify(response.data));
                return change.after.ref.update({ summary: "요약 생성에 실패했습니다." });
            }

        } catch (error) {
            // [수정] 오류 로깅을 더 상세하게 변경
            console.error("Gemini API 호출 중 오류 발생:", error.response ? JSON.stringify(error.response.data) : error.message);
            return change.after.ref.update({ summary: "요약 생성 중 오류가 발생했습니다." });
        }
    });