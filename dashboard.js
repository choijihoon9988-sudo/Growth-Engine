import { app } from "./firebase-config.js";
import { getAuth, signInWithEmailAndPassword, GoogleAuthProvider, signOut, onAuthStateChanged, signInWithPopup } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, getDocs, query, orderBy, serverTimestamp, onSnapshot, where, Timestamp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-functions.js";

const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app);

document.addEventListener('DOMContentLoaded', () => {
    // 전역 변수 선언
    let currentUser = null;
    let unsubscribeListeners = [];
    let statsChart, sentimentChart;
    
    // 모달 관련 DOM 요소
    const editorModal = document.getElementById('editor-modal');
    const titleInput = document.getElementById('popup-title');
    const contentInput = document.getElementById('popup-content');
    const saveBtn = document.getElementById('save-and-close-btn');
    const blogBtn = document.getElementById('save-and-blog-btn');
    let currentWritingId = null;

    // DOM 요소 캐싱
    const loginScreen = document.getElementById('login-screen');
    const dashboardContainer = document.getElementById('dashboard-container');
    const loginForm = document.getElementById('login-form');
    const googleLoginBtn = document.getElementById('google-login-btn');
    const logoutButton = document.getElementById('logout-button');
    const userEmailDisplay = document.getElementById('user-email');

    // --- 인증 상태 리스너 ---
    onAuthStateChanged(auth, user => {
        if (user) {
            currentUser = user;
            loginScreen.style.display = 'none';
            dashboardContainer.style.display = 'flex';
            userEmailDisplay.textContent = user.email;
            initDashboard();
        } else {
            currentUser = null;
            loginScreen.style.display = 'flex';
            dashboardContainer.style.display = 'none';
            cleanupListeners();
        }
    });

    // --- 로그인/로그아웃 이벤트 핸들러 ---
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        signInWithEmailAndPassword(auth, email, password)
           .catch(error => { document.getElementById('login-error').textContent = "로그인 정보가 올바르지 않습니다."; });
    });

    googleLoginBtn.addEventListener('click', () => {
        const provider = new GoogleAuthProvider();
        signInWithPopup(auth, provider).catch(error => { document.getElementById('login-error').textContent = "Google 로그인에 실패했습니다."; });
    });

    logoutButton.addEventListener('click', () => signOut(auth));
    
    // --- 대시보드 초기화 ---
    function initDashboard() {
        cleanupListeners();
        initTabs();
        initFocusZone();
        initReflectionHub();
        initAnalyticsHub();
    }

    function cleanupListeners() {
        unsubscribeListeners.forEach(unsub => unsub());
        unsubscribeListeners = [];
    }

    // --- 탭 기능 초기화 ---
    function initTabs() {
        const navItems = document.querySelectorAll('.nav-item');
        const tabs = document.querySelectorAll('.main-content > .tab-content');
        
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                navItems.forEach(i => i.classList.remove('active'));
                tabs.forEach(tab => tab.classList.remove('active'));
                
                item.classList.add('active');
                
                const tabName = item.getAttribute('data-tab');
                let targetId;
                if (tabName === 'focus') {
                    targetId = 'focus-zone';
                } else if (tabName === 'reflection') {
                    targetId = 'reflection-hub';
                } else if (tabName === 'analytics') {
                    targetId = 'analytics-hub';
                }

                const targetTab = document.getElementById(targetId);
                if (targetTab) {
                    targetTab.classList.add('active');
                }

                if (targetId === 'focus-zone') {
                    renderPomodoroStats();
                }
            });
        });
        
        const initiallyActiveNavItem = document.querySelector('.nav-item[data-tab="reflection"]');
        if (initiallyActiveNavItem) {
            initiallyActiveNavItem.click();
        } else if (navItems.length > 0) {
            navItems[0].click();
        }
    }
    
    // --- FOCUS ZONE 기능 ---
    function initFocusZone() {
        const timerDisplay = document.getElementById('timer-display');
        const startBtn = document.getElementById('start-timer-btn');
        const pauseBtn = document.getElementById('pause-timer-btn');
        const resetBtn = document.getElementById('reset-timer-btn');
        const modeBtns = document.querySelectorAll('.mode-btn');
        const todoForm = document.getElementById('todo-form');
        const todoInput = document.getElementById('todo-input');
        
        let timerInterval, timeLeft, currentMode = 1500;
        let isPaused = false;

        function updateTimerDisplay() { 
            const minutes = Math.floor(timeLeft / 60); 
            const seconds = timeLeft % 60; 
            timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`; 
        }
        
        function resetTimer() { 
            clearInterval(timerInterval); 
            timerInterval = null; 
            timeLeft = currentMode; 
            isPaused = false; 
            startBtn.style.display = 'inline-block'; 
            pauseBtn.style.display = 'none'; 
            updateTimerDisplay(); 
        }

        function startTimer() { 
            if (timerInterval) return; 
            isPaused = false; 
            startBtn.style.display = 'none'; 
            pauseBtn.style.display = 'inline-block'; 
            timerInterval = setInterval(() => { 
                if (timeLeft > 0) { 
                    timeLeft--; 
                    updateTimerDisplay(); 
                } else { 
                    clearInterval(timerInterval); 
                    timerInterval = null; 
                    if (currentMode === 1500) { 
                        addDoc(collection(db, `users/${currentUser.uid}/pomodoro_logs`), { completedAt: serverTimestamp() })
                        .then(() => {
                            if (document.getElementById('focus-zone').classList.contains('active')) {
                                renderPomodoroStats();
                            }
                        }); 
                    } 
                    alert('타이머 종료!');
                    resetTimer(); 
                } 
            }, 1000); 
        }

        function pauseTimer() { 
            isPaused = true; 
            clearInterval(timerInterval); 
            timerInterval = null; 
            startBtn.style.display = 'inline-block'; 
            pauseBtn.style.display = 'none'; 
        }

        function switchMode(e) { 
            currentMode = parseInt(e.target.dataset.time); 
            modeBtns.forEach(btn => btn.classList.remove('active')); 
            e.target.classList.add('active'); 
            resetTimer(); 
        }
        
        resetTimer();
        startBtn.addEventListener('click', startTimer);
        pauseBtn.addEventListener('click', pauseTimer);
        resetBtn.addEventListener('click', resetTimer);
        modeBtns.forEach(btn => btn.addEventListener('click', switchMode));
        
        todoForm.addEventListener('submit', e => { 
            e.preventDefault(); 
            const text = todoInput.value.trim(); 
            if (text && currentUser) { 
                addDoc(collection(db, `users/${currentUser.uid}/todos`), { 
                    text, 
                    completed: false, 
                    createdAt: serverTimestamp() 
                }); 
                todoInput.value = ''; 
            } 
        });
        
        listenForTodos();
    }
    
    function listenForTodos() {
        if (!currentUser) return;
        const q = query(collection(db, `users/${currentUser.uid}/todos`), orderBy('createdAt', 'desc'));
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const todoList = document.getElementById('todo-list');
            todoList.innerHTML = '';
            snapshot.docs.forEach(docSnapshot => {
                const todo = docSnapshot.data();
                const li = document.createElement('li');
                li.dataset.id = docSnapshot.id;
                if (todo.completed) {
                    li.classList.add('completed');
                }

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = todo.completed;
                checkbox.addEventListener('change', () => {
                    updateDoc(doc(db, `users/${currentUser.uid}/todos`, docSnapshot.id), { completed: checkbox.checked });
                });

                const span = document.createElement('span');
                span.textContent = todo.text;

                const deleteBtn = document.createElement('button');
                deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
                deleteBtn.addEventListener('click', () => {
                    if (confirm('정말 삭제하시겠습니까?')) {
                        deleteDoc(doc(db, `users/${currentUser.uid}/todos`, docSnapshot.id));
                    }
                });

                li.appendChild(checkbox);
                li.appendChild(span);
                li.appendChild(deleteBtn);
                todoList.appendChild(li);
            });
        });
        unsubscribeListeners.push(unsubscribe);
    }
    
    async function renderPomodoroStats() {
        if (!currentUser) return;
    
        const canvas = document.getElementById('pomodoro-stats-chart');
        if (!canvas) {
            console.error("캔버스 요소를 찾을 수 없습니다.");
            return;
        }
        const ctx = canvas.getContext('2d');
    
        if (statsChart) {
            statsChart.destroy();
        }
    
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const dayOfWeek = now.getDay();
        const distanceToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - distanceToMonday);
        
        const todayQuery = query(collection(db, `users/${currentUser.uid}/pomodoro_logs`), where('completedAt', '>=', startOfToday));
        const weekQuery = query(collection(db, `users/${currentUser.uid}/pomodoro_logs`), where('completedAt', '>=', startOfWeek));
        const monthQuery = query(collection(db, `users/${currentUser.uid}/pomodoro_logs`), where('completedAt', '>=', startOfMonth));
        
        try {
            const [todaySnapshot, weekSnapshot, monthSnapshot] = await Promise.all([
                getDocs(todayQuery),
                getDocs(weekQuery),
                getDocs(monthQuery)
            ]);
    
            statsChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: ['오늘', '이번 주', '이번 달'],
                    datasets: [{
                        label: '완료한 뽀모도로 세션',
                        data: [todaySnapshot.size, weekSnapshot.size, monthSnapshot.size],
                        backgroundColor: [ 'rgba(0, 170, 255, 0.5)', 'rgba(0, 170, 255, 0.7)', 'rgba(0, 170, 255, 0.9)' ],
                        borderColor: 'rgba(0, 170, 255, 1)',
                        borderWidth: 1
                    }]
                },
                options: {
                    scales: {
                        y: {  beginAtZero: true, ticks: { color: '#e0e0e0', stepSize: 1, precision: 0 } },
                        x: { ticks: { color: '#e0e0e0' } }
                    },
                    plugins: { legend: { labels: { color: '#e0e0e0' } } }
                }
            });
    
        } catch(error) {
            console.error("통계 데이터 로딩 또는 차트 렌더링 실패:", error);
        }
    }

    // --- REFLECTION HUB 기능 ---
    function initReflectionHub() {
        const newWritingBtn = document.getElementById('new-writing-btn');
        newWritingBtn.addEventListener('click', () => {
            openEditorModal();
        });
        listenForWritings();
    }

    function openEditorModal(writing = null, id = null) {
        editorModal.style.display = 'block';
        titleInput.value = writing ? writing.title : '';
        contentInput.value = writing ? writing.content : '';
        currentWritingId = id;
        
        // 버튼 상태 초기화
        saveBtn.disabled = false;
        blogBtn.disabled = false;
        saveBtn.textContent = '저장 후 닫기';
        blogBtn.textContent = '저장 후 블로그로 이동';
    }
    
    function closeEditorModal() {
        editorModal.style.display = 'none';
        currentWritingId = null;
    }

    // [수정] 저장 로직을 하나의 함수로 통합하여 중복 제거 및 안정성 확보
    async function saveWriting() {
        const title = titleInput.value.trim();
        const content = contentInput.value.trim();

        if (!title || !content) {
            alert('제목과 내용을 모두 입력해야 합니다.');
            return false; // 저장 실패
        }

        const dataToSave = {
            title: title,
            content: content,
            updatedAt: serverTimestamp()
        };
        const collectionRef = collection(db, `users/${currentUser.uid}/writings`);

        try {
            if (currentWritingId) {
                const docRef = doc(collectionRef, currentWritingId);
                await updateDoc(docRef, dataToSave);
            } else {
                dataToSave.createdAt = serverTimestamp();
                const docRef = await addDoc(collectionRef, dataToSave);
                currentWritingId = docRef.id; // 새 문서 ID 저장
            }
            return true; // 저장 성공
        } catch (error) {
            console.error("Firestore 저장 오류:", error);
            let errorMessage = "글 저장에 실패했습니다. 다시 시도해 주세요.";
            if (error.code === 'permission-denied') {
                errorMessage = "권한이 없어 글을 저장할 수 없습니다. Firebase 보안 규칙을 확인해 주세요.";
            } else if (error.code === 'unauthenticated') {
                errorMessage = "로그인 상태가 아닙니다. 다시 로그인해 주세요.";
            }
            alert(errorMessage);
            return false; // 저장 실패
        }
    }

    // '저장 후 닫기' 버튼 이벤트 리스너
    saveBtn.addEventListener('click', async () => {
        saveBtn.disabled = true;
        blogBtn.disabled = true;
        saveBtn.textContent = '저장 중...';

        const success = await saveWriting();

        if (success) {
            closeEditorModal();
        } else {
             saveBtn.textContent = '저장 실패';
        }
        
        // finally 블록 대신 성공/실패에 따라 버튼 상태 복원
        saveBtn.disabled = false;
        blogBtn.disabled = false;
        if(saveBtn.textContent !== '저장 실패') {
            saveBtn.textContent = '저장 후 닫기';
        }
    });

    // '저장 후 블로그로 이동' 버튼 이벤트 리스너
    blogBtn.addEventListener('click', async () => {
        saveBtn.disabled = true;
        blogBtn.disabled = true;
        blogBtn.textContent = '저장 중...';

        const success = await saveWriting();

        if (success) {
            const blogUrl = "https://blog.naver.com/POST_WRITE.naver?blogId=tenmilli_10";
            window.open(blogUrl, '_blank');
            closeEditorModal();
        } else {
            blogBtn.textContent = '저장 실패';
        }
        
        // finally 블록 대신 성공/실패에 따라 버튼 상태 복원
        saveBtn.disabled = false;
        blogBtn.disabled = false;
        if(blogBtn.textContent !== '저장 실패') {
           blogBtn.innerHTML = '<i class="fa-solid fa-n"></i>';
        }
         if (saveBtn.textContent !== '저장 실패') {
            saveBtn.textContent = '저장 후 닫기';
        }
    });

    function listenForWritings() {
        if (!currentUser) return;
        const q = query(collection(db, `users/${currentUser.uid}/writings`), orderBy('updatedAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const listElement = document.getElementById('smart-writing-list');
            const selectElement = document.getElementById('analytics-writing-select');

            listElement.innerHTML = '';
            selectElement.innerHTML = '<option value="">분석할 글을 선택하세요</option>';

            snapshot.forEach(docSnapshot => {
                const writing = docSnapshot.data();
                const id = docSnapshot.id;
                const item = document.createElement('div');
                item.classList.add('smart-item');
                item.dataset.id = id;
                const date = writing.updatedAt?.toDate().toLocaleString() || '날짜 없음';
                
                // [개선] 요약이 있을 경우 함께 표시
                const summary = writing.summary || (writing.content || '').substring(0, 150) + '...';

                item.innerHTML = `
                    <h3 class="smart-item-title">${writing.title || '무제'}</h3>
                    <p class="smart-item-summary">${summary}</p>
                    <p class="smart-item-date">${date}</p>
                `;
                item.addEventListener('click', () => {
                    openEditorModal(writing, id);
                });
                listElement.appendChild(item);

                const option = document.createElement('option');
                option.value = id;
                option.textContent = writing.title || '무제';
                selectElement.appendChild(option);
            });
        });
        unsubscribeListeners.push(unsubscribe);
    }
    
    // --- ANALYTICS HUB 기능 ---
    function initAnalyticsHub() {
        const analyzeBtn = document.getElementById('analyze-text-btn');
        analyzeBtn.addEventListener('click', runAnalysis);
    }

    async function runAnalysis() {
        const select = document.getElementById('analytics-writing-select');
        const writingId = select.value;
        if (!writingId || !currentUser) {
            alert('분석할 글을 선택해주세요.');
            return;
        }

        const loadingSpinner = document.getElementById('loading-spinner');
        const resultsContainer = document.getElementById('analytics-results');
        loadingSpinner.style.display = 'block';
        resultsContainer.style.display = 'none';

        try {
            const docRef = doc(db, `users/${currentUser.uid}/writings`, writingId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const textContent = docSnap.data().content;
                if (!textContent || textContent.trim() === '') {
                    alert('분석할 내용이 없습니다.');
                    loadingSpinner.style.display = 'none';
                    return;
                }
                
                const analyzeText = httpsCallable(functions, 'analyzeText');
                const result = await analyzeText({ text: textContent });
                displayAnalysisResults(result.data);

            } else {
                throw new Error("문서를 찾을 수 없습니다.");
            }
        } catch (error) {
            console.error('분석 중 오류 발생:', error);
            alert(`분석에 실패했습니다: ${error.message}`);
        } finally {
            loadingSpinner.style.display = 'none';
        }
    }

    function displayAnalysisResults(data) {
        document.getElementById('analytics-results').style.display = 'grid';

        const sentimentCtx = document.getElementById('sentiment-chart').getContext('2d');
        if (sentimentChart) sentimentChart.destroy();
        sentimentChart = new Chart(sentimentCtx, {
            type: 'doughnut',
            data: {
                labels: ['긍정', '부정', '중립', '복합'],
                datasets: [{
                    label: '감성 점수',
                    data: [
                        data.sentiment.Positive, 
                        data.sentiment.Negative, 
                        data.sentiment.Neutral, 
                        data.sentiment.Mixed
                    ],
                    backgroundColor: ['#28a745', '#dc3545', '#ffc107', '#6c757d']
                }]
            },
            options: { responsive: true, plugins: { legend: { position: 'top' } } }
        });

        const entityList = document.getElementById('entity-list');
        entityList.innerHTML = '';
        data.entities.slice(0, 10).forEach(entity => {
            const li = document.createElement('li');
            li.innerHTML = `${entity.Text} <span class="salience">(${entity.Type}, 중요도: ${entity.Score.toFixed(2)})</span>`;
            entityList.appendChild(li);
        });

        const categoryResult = document.getElementById('category-result');
        categoryResult.textContent = data.categories.length > 0 ? data.categories[0].Name : '분류된 카테고리 없음';
    }
});