// firebase-config.js
// 최신 모듈 방식의 Firebase SDK 초기화

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDJJLSOPg-nExI-nISWbS-NPwIPsiO3-VI",
    authDomain: "growth-engine-9c6ab.firebaseapp.com",
    projectId: "growth-engine-9c6ab",
    storageBucket: "growth-engine-9c6ab.firebasestorage.app",
    messagingSenderId: "90122365916",
    appId: "1:90122365916:web:a41acfdac4699bcd067d19",
    measurementId: "G-T8JC3C73RM"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// 다른 파일에서 사용할 수 있도록 app 객체와 서비스들을 export 합니다.
export { app };