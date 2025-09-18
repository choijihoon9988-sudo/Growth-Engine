// choijihoon9988-sudo/growth-engine/Growth-Engine-5abdd40852fe5bbd387120a5ee7089d50061a9cf/dashboard.js

// [수정] firebase-config.js 내용을 통합하고, SDK import를 한 곳에서 관리
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, GoogleAuthProvider, signOut, onAuthStateChanged, signInWithPopup } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, getDoc, getDocs, query, orderBy, serverTimestamp, onSnapshot, where, Timestamp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-functions.js";


// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDJJLSOPg-nExI-nISWbS-NPwIPsiO3-VI",
    authDomain: "growth-engine-9c6ab.firebaseapp.com",
    projectId: "growth-engine-9c6ab",
    storageBucket: "growth-engine-9c6ab.appspot.com", // [수정] .firebasestorage.app -> .appspot.com
    messagingSenderId: "90122365916",
    appId: "1:90122365916:web:a41acfdac4699bcd067d19",
    measurementId: "G-T8JC3C73RM"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app, "asia-northeast3"); // [수정] Cloud Functions 리전 명시


document.addEventListener('DOMContentLoaded', () => {
    // 전역 변수 선언
    let currentUser = null;
    let unsubscribeListeners = {
        todos: null,
        writings: null,
        trash: null,
        drafts: null
    };
    let statsChart, sentimentChart;
    
    // 모달 관련 DOM 요소
    const editorModal = document.getElementById('editor-modal');
    const titleInput = document.getElementById('popup-title');
    const contentInput = document.getElementById('popup-content');
    const saveBtn = document.getElementById('save-and-close-btn');
    const saveDraftBtn = document.getElementById('save-draft-btn');
    const blogBtn = document.getElementById('save-and-blog-btn');
    const editBtn = document.getElementById('edit-writing-btn');
    const cancelBtn = document.getElementById('cancel-edit-btn');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const modalTitleEl = document.getElementById('modal-title');
    const readModeContent = document.getElementById('read-mode-content');
    const writeModeContent = document.getElementById('write-mode-content');
    let currentWritingId = null;
    let currentDraftId = null; // 현재 편집이 시작된 임시저장 문서의 ID
    let isEditMode = false;
    let originalContentForDraftCheck = { title: '', content: '' };


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
        Object.values(unsubscribeListeners).forEach(unsub => {
            if (unsub) unsub();
        });
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
                // ID를 정확히 찾도록 수정
                const targetId = (tabName === 'focus') ? 'focus-zone' : `${tabName}-hub`;
                const targetTab = document.getElementById(targetId);
                if (targetTab) {
                    targetTab.classList.add('active');
                }

                if (targetId === 'focus-zone') {
                    renderPomodoroStats();
                }
            });
        });
        
        const initiallyActiveNavItem = document.querySelector('.nav-item.active');
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
        if (unsubscribeListeners.todos) unsubscribeListeners.todos();

        const q = query(collection(db, `users/${currentUser.uid}/todos`), orderBy('createdAt', 'desc'));
        
        unsubscribeListeners.todos = onSnapshot(q, (snapshot) => {
            const todoList = document.getElementById('todo-list');
            todoList.innerHTML = '';
            snapshot.docs.forEach(docSnapshot => {
                const todo = docSnapshot.data();
                const li = document.createElement('li');
                li.dataset.id = docSnapshot.id;
                if (todo.completed) li.classList.add('completed');

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
        }, (error) => console.error("Todo 수신 오류:", error));
    }
    
    async function renderPomodoroStats() {
        if (!currentUser) return;
    
        const canvas = document.getElementById('pomodoro-stats-chart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
    
        if (statsChart) statsChart.destroy();
    
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
            const [todaySnapshot, weekSnapshot, monthSnapshot] = await Promise.all([getDocs(todayQuery), getDocs(weekQuery), getDocs(monthQuery)]);
    
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
        document.getElementById('new-writing-btn').addEventListener('click', () => openEditorModal(null, null, true));
        
        // 휴지통 모달 이벤트
        const trashModal = document.getElementById('trash-modal');
        document.getElementById('open-trash-btn').addEventListener('click', () => {
            trashModal.style.display = 'flex';
            listenForTrashItems();
        });
        document.getElementById('close-trash-btn').addEventListener('click', () => trashModal.style.display = 'none');
        
        // 임시저장 모달 이벤트
        const draftsModal = document.getElementById('drafts-modal');
        document.getElementById('open-drafts-btn').addEventListener('click', () => {
            draftsModal.style.display = 'flex';
            listenForDrafts();
        });
        document.getElementById('close-drafts-btn').addEventListener('click', () => draftsModal.style.display = 'none');
        
        // 모달 외부 클릭 시 닫기
        window.addEventListener('click', (e) => { 
            if (e.target === trashModal) trashModal.style.display = 'none'; 
            if (e.target === draftsModal) draftsModal.style.display = 'none';
        });
        
        document.getElementById('sort-options').addEventListener('change', listenForWritings);
        document.getElementById('writing-search-input').addEventListener('input', listenForWritings);

        // 글쓰기/보기 모달 버튼 이벤트
        editBtn.addEventListener('click', () => setModalMode(true));
        cancelBtn.addEventListener('click', () => handleCloseAttempt(true));
        closeModalBtn.addEventListener('click', () => handleCloseAttempt(false));
        saveBtn.addEventListener('click', () => saveWriting());
        saveDraftBtn.addEventListener('click', () => saveAsDraft(true));


        blogBtn.addEventListener('click', async () => {
            let success = true;
            if (isEditMode) {
                success = await saveWriting(); // 수정 모드일 경우 먼저 저장 시도
            }
            if(success) {
                const contentToCopy = `${document.getElementById('read-title').textContent}\n\n${document.getElementById('read-body').innerText}`;
                navigator.clipboard.writeText(contentToCopy).then(() => {
                    alert('제목과 본문이 클립보드에 복사되었습니다.');
                    window.open("https://blog.naver.com/tenmilli_10", '_blank');
                }).catch(err => console.error('클립보드 복사 실패:', err));
            }
        });

        listenForWritings();
    }

    function openEditorModal(writing = null, id = null, startInEditMode = false, draftId = null) {
        currentWritingId = id;
        currentDraftId = draftId;
    
        if (writing) {
            document.getElementById('read-title').textContent = writing.title || '';
            document.getElementById('read-body').innerHTML = (writing.content || '').replace(/\n/g, '<br>');
            const readTagsContainer = document.getElementById('read-tags');
            readTagsContainer.innerHTML = '';
            if (writing.tags && Array.isArray(writing.tags)) {
                writing.tags.forEach(tag => {
                    const tagEl = document.createElement('span');
                    tagEl.textContent = `#${tag}`;
                    readTagsContainer.appendChild(tagEl);
                });
            }
            titleInput.value = writing.title || '';
            contentInput.value = writing.content || '';
            if(writing.originalWritingId !== undefined) {
                currentWritingId = writing.originalWritingId;
            }

        } else { // 새 글
            titleInput.value = '';
            contentInput.value = '';
            document.getElementById('read-title').textContent = '';
            document.getElementById('read-body').innerHTML = '';
            document.getElementById('read-tags').innerHTML = '';
        }
        
        setModalMode(startInEditMode);
        editorModal.style.display = 'flex';
    }

    function setModalMode(edit) {
        isEditMode = edit;
        readModeContent.style.display = edit ? 'none' : 'block';
        writeModeContent.style.display = edit ? 'flex' : 'none';
        
        const isNewWriting = !currentWritingId;

        document.getElementById('read-mode-buttons').style.display = edit ? 'none' : 'flex';
        document.getElementById('write-mode-buttons').style.display = edit ? 'flex' : 'none';
        
        saveDraftBtn.style.display = edit && isNewWriting ? 'block' : 'none';
        editBtn.style.display = !edit && !isNewWriting ? 'block' : 'none';
        
        blogBtn.style.display = edit ? 'none' : 'block';
        closeModalBtn.style.display = edit ? 'none' : 'block';

        modalTitleEl.textContent = edit ? (isNewWriting ? '새 글쓰기' : '글 수정') : '글 보기';

        if (edit) {
            originalContentForDraftCheck = { title: titleInput.value, content: contentInput.value };
        }
    }
    
    function closeEditorModal() {
        editorModal.style.display = 'none';
        currentWritingId = null;
        currentDraftId = null;
        isEditMode = false;
    }

    async function handleCloseAttempt(isCancelButton) {
        const hasChanged = titleInput.value !== originalContentForDraftCheck.title || contentInput.value !== originalContentForDraftCheck.content;

        if (isEditMode && hasChanged) {
            const isNewWriting = !currentWritingId;
            let confirmResult = false;

            if (isNewWriting) {
                confirmResult = confirm('작성 중인 내용을 임시 저장하시겠습니까?');
                if (confirmResult) {
                    await saveAsDraft(false);
                }
            } else {
                confirmResult = confirm('수정사항을 저장하지 않고 나가시겠습니까?');
                if (!confirmResult) return;
            }
        }

        if (isCancelButton && currentWritingId) {
            setModalMode(false);
        } else {
            closeEditorModal();
        }
    }
    
    async function saveAsDraft(isUserAction) {
        if (!currentUser) return;
        const title = titleInput.value.trim();
        const content = contentInput.value.trim();
        if (!title && !content) {
            if (isUserAction) alert('내용이 없어 임시저장할 수 없습니다.');
            return;
        };

        try {
            await addDoc(collection(db, `users/${currentUser.uid}/drafts`), {
                originalWritingId: currentWritingId, // 새 글일 경우 null
                title,
                content,
                savedAt: serverTimestamp()
            });
            
            originalContentForDraftCheck = { title, content };

            if (isUserAction) alert('임시 저장되었습니다.');
        } catch (error) {
            console.error("임시 저장 오류:", error);
            if (isUserAction) alert("임시 저장에 실패했습니다.");
        }
    }


    async function saveWriting() {
        if (!isEditMode) return true; // 수정 모드가 아니면 저장할 필요 없음
        
        saveBtn.disabled = true;
        saveBtn.textContent = '저장 중...';
        
        let success = false;
        try {
            const title = titleInput.value.trim();
            const content = contentInput.value.trim();
            if (!title) {
                alert('제목을 입력해야 합니다.');
                return false;
            }
            const tags = content.match(/#([a-zA-Z0-9ㄱ-ㅎ|ㅏ-ㅣ|가-힣]+)/g)?.map(tag => tag.substring(1)) || [];
            const dataToSave = { title, content, tags, updatedAt: serverTimestamp() };
            const collectionRef = collection(db, `users/${currentUser.uid}/writings`);
            let savedWritingId = currentWritingId;

            if (currentWritingId) {
                await updateDoc(doc(collectionRef, currentWritingId), dataToSave);
            } else {
                dataToSave.createdAt = serverTimestamp();
                const newDocRef = await addDoc(collectionRef, dataToSave);
                savedWritingId = newDocRef.id;
            }

            if (currentDraftId) {
                await deleteDoc(doc(db, `users/${currentUser.uid}/drafts`, currentDraftId));
            }
            if (savedWritingId) {
                 const draftsQuery = query(collection(db, `users/${currentUser.uid}/drafts`), where("originalWritingId", "==", savedWritingId));
                 const draftSnapshot = await getDocs(draftsQuery);
                 draftSnapshot.forEach(async (docSnapshot) => {
                     await deleteDoc(docSnapshot.ref);
                 });
            }

            const finalDocRef = doc(collectionRef, savedWritingId);
            const finalDocSnap = await getDoc(finalDocRef);
            if (finalDocSnap.exists()) {
                openEditorModal(finalDocSnap.data(), savedWritingId, false);
            } else {
                closeEditorModal();
            }
            success = true;

        } catch (error) {
            console.error("글 저장 오류:", error);
            alert(`글 저장에 실패했습니다: ${error.message}`);
            success = false;
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = '저장';
            return success;
        }
    }

    // choijihoon9988-sudo/growth-engine/Growth-Engine-220b491a5615d95000a9a96bb62dea12046bf863/dashboard.js

function listenForWritings() {
    if (!currentUser) return;
    if (unsubscribeListeners.writings) unsubscribeListeners.writings();

    const [sortBy, sortDirection] = document.getElementById('sort-options').value.split('-');
    const searchTerm = document.getElementById('writing-search-input').value.trim().toLowerCase();
    
    const q = query(collection(db, `users/${currentUser.uid}/writings`), orderBy(sortBy, sortDirection));
    
    unsubscribeListeners.writings = onSnapshot(q, (snapshot) => {
        // ✅ 수정된 부분: Timestamp를 ISO 문자열로 변환
        const allWritings = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                title: data.title,
                content: data.content,
                tags: data.tags || [],
                // Timestamp 객체를 표준 문자열 형식으로 변환하여 직렬화 문제를 방지합니다.
                createdAt: data.createdAt?.toDate().toISOString(),
                updatedAt: data.updatedAt?.toDate().toISOString(),
            };
        });
        
        const allTags = new Set(allWritings.flatMap(w => w.tags || []));
        renderTags(allTags);
        const activeTag = document.querySelector('.tag-filter.active')?.dataset.tag;
        const tagFilteredWritings = activeTag && activeTag !== 'all'
            ? allWritings.filter(w => w.tags && w.tags.includes(activeTag))
            : allWritings;

        const listElement = document.getElementById('smart-writing-list');
        const aiContainer = document.getElementById('ai-recommendation-container');
        const aiListElement = document.getElementById('ai-recommendation-list');

        if (!searchTerm) {
            listElement.style.display = 'flex';
            aiContainer.style.display = 'none';
            renderWritingList(tagFilteredWritings, "작성된 글이 없습니다.");
            return;
        }

        const exactMatches = tagFilteredWritings.filter(w =>
            (w.title && w.title.toLowerCase().includes(searchTerm)) ||
            (w.content && w.content.toLowerCase().includes(searchTerm))
        );

        if (exactMatches.length > 0) {
            listElement.style.display = 'flex';
            aiContainer.style.display = 'none';
            renderWritingList(exactMatches, "검색 결과가 없습니다.");
        } else {
            listElement.style.display = 'none';
            aiContainer.style.display = 'block';
            aiListElement.innerHTML = `<p class="empty-list-message">AI가 유사한 글을 찾고 있습니다...</p>`;

            const recommendWritings = httpsCallable(functions, 'recommendWritings');
            // 이제 allWritings는 JSON으로 변환하기 안전한 데이터만 포함합니다.
            recommendWritings({ searchTerm, allWritings: tagFilteredWritings })
                .then(result => {
                    const { recommendations } = result.data;
                    if (recommendations && recommendations.length > 0) {
                        aiListElement.innerHTML = '';
                        recommendations.forEach(writing => {
                            aiListElement.appendChild(createWritingElement(writing));
                        });
                    } else {
                        aiContainer.style.display = 'none';
                        listElement.style.display = 'flex';
                        renderWritingList([], "AI가 추천할 만한 유사한 글을 찾지 못했습니다.");
                    }
                })
                .catch(error => {
                    console.error("AI 추천 오류:", error);
                    aiContainer.style.display = 'none';
                    listElement.style.display = 'flex';
                    renderWritingList([], "AI 추천 기능을 불러오는 데 실패했습니다.");
                });
        }

    }, (error) => console.error("글 목록 수신 오류:", error));
}

    function renderTags(tags) {
        const tagContainer = document.getElementById('tag-filter-container');
        const currentActiveTag = tagContainer.querySelector('.tag-filter.active')?.dataset.tag || 'all';
        tagContainer.innerHTML = '';
        
        const createTag = (tag, text) => {
            const el = document.createElement('span');
            el.className = 'tag-filter';
            el.textContent = text;
            el.dataset.tag = tag;
            if (tag === currentActiveTag) el.classList.add('active');
            el.addEventListener('click', handleTagClick);
            return el;
        };

        tagContainer.appendChild(createTag('all', '전체'));
        tags.forEach(tag => tagContainer.appendChild(createTag(tag, `#${tag}`)));
    }

    function handleTagClick(e) {
        document.querySelector('.tag-filter.active')?.classList.remove('active');
        e.target.classList.add('active');
        listenForWritings();
    }

    function renderWritingList(writings, emptyMessage) {
        const listElement = document.getElementById('smart-writing-list');
        const selectElement = document.getElementById('analytics-writing-select');
        listElement.innerHTML = '';
        selectElement.innerHTML = '<option value="">분석할 글을 선택하세요</option>';
        
        if (writings.length === 0 && emptyMessage) {
            listElement.innerHTML = `<p class="empty-list-message">${emptyMessage}</p>`;
            return;
        }

        writings.forEach(writing => {
            listElement.appendChild(createWritingElement(writing));
            const option = document.createElement('option');
            option.value = writing.id;
            option.textContent = writing.title || '무제';
            selectElement.appendChild(option);
        });
    }

    function createWritingElement(writing) {
        const item = document.createElement('div');
        item.classList.add('smart-item');
        item.dataset.id = writing.id;

        const updatedDate = writing.updatedAt?.toDate().toLocaleString() || '날짜 없음';
        const createdDate = writing.createdAt?.toDate().toLocaleString() || '날짜 없음';
        
        const tagsHtml = (writing.tags && Array.isArray(writing.tags))
            ? `<div class="item-tags">${writing.tags.map(tag => `<span>#${tag}</span>`).join(' ')}</div>`
            : '';

        const dateOrScoreHtml = writing.score
            ? `<span class="ai-score">AI 추천: 유사도 ${writing.score}%</span>`
            : `<span>수정: ${updatedDate}</span><span>게시: ${createdDate}</span>`;
        
        item.innerHTML = `
            <h3 class="smart-item-title">${writing.title || '무제'}</h3>
            ${tagsHtml} 
            <p class="smart-item-summary">${(writing.content || '').substring(0, 150)}...</p>
            <div class="smart-item-dates">
                ${dateOrScoreHtml}
            </div>
            <button class="delete-writing-btn" title="휴지통으로 이동"><i class="fas fa-trash"></i></button>
        `;
        
        item.addEventListener('click', e => { 
            if (!e.target.closest('.delete-writing-btn')) {
                openEditorModal(writing, writing.id, false);
            }
        });
        const deleteBtn = item.querySelector('.delete-writing-btn');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('정말 삭제하시겠습니까?')) moveWritingToTrash(writing.id);
        });
        return item;
    }

    async function moveWritingToTrash(writingId) {
        if (!currentUser || !writingId) return;
        const writingRef = doc(db, `users/${currentUser.uid}/writings`, writingId);
        try {
            const writingSnap = await getDoc(writingRef);
            if (writingSnap.exists()) {
                await addDoc(collection(db, `users/${currentUser.uid}/trash`), {
                    ...writingSnap.data(),
                    deletedAt: serverTimestamp()
                });
                await deleteDoc(writingRef);
            }
        } catch (error) {
            console.error("휴지통 이동 오류:", error);
            alert('삭제 중 오류가 발생했습니다.');
        }
    }

    function listenForTrashItems() {
        if (!currentUser) return;
        if (unsubscribeListeners.trash) unsubscribeListeners.trash();
        const q = query(collection(db, `users/${currentUser.uid}/trash`), orderBy('deletedAt', 'desc'));
    
        unsubscribeListeners.trash = onSnapshot(q, (snapshot) => {
            const trashList = document.getElementById('trash-list');
            trashList.innerHTML = snapshot.empty 
                ? '<p style="text-align: center; color: var(--text-muted-color);">휴지통이 비어 있습니다.</p>'
                : '';
            
            snapshot.forEach(docSnapshot => {
                const item = docSnapshot.data();
                const id = docSnapshot.id;
                const itemDiv = document.createElement('div');
                itemDiv.classList.add('list-item');
                itemDiv.innerHTML = `
                    <div class="list-item-info">
                        <h4>${item.title || '무제'}</h4>
                        <p>삭제된 날짜: ${item.deletedAt?.toDate().toLocaleDateString() || '날짜 없음'}</p>
                    </div>
                    <div class="list-item-actions">
                        <button class="restore-btn" data-id="${id}">복원</button>
                        <button class="perm-delete-btn" data-id="${id}">영구 삭제</button>
                    </div>`;
    
                itemDiv.querySelector('.restore-btn').addEventListener('click', () => restoreWritingFromTrash(id));
                itemDiv.querySelector('.perm-delete-btn').addEventListener('click', () => {
                    if (confirm('이 항목을 영구적으로 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
                        permanentlyDeleteWriting(id);
                    }
                });
                trashList.appendChild(itemDiv);
            });
        }, (error) => {
            console.error("휴지통 목록 수신 오류:", error);
            trashList.innerHTML = '<p>휴지통을 불러오는 데 실패했습니다.</p>';
        });
    }
    
    // --- 임시저장 관련 함수 ---
    function listenForDrafts() {
        if (!currentUser) return;
        if (unsubscribeListeners.drafts) unsubscribeListeners.drafts();

        const q = query(collection(db, `users/${currentUser.uid}/drafts`), orderBy('savedAt', 'desc'));
        unsubscribeListeners.drafts = onSnapshot(q, (snapshot) => {
            renderDraftsList(snapshot.docs);
        }, (error) => {
            console.error("임시저장 목록 수신 오류:", error);
            document.getElementById('drafts-list').innerHTML = '<p>임시저장 목록을 불러오는 데 실패했습니다.</p>';
        });
    }

    function renderDraftsList(draftDocs) {
        const draftsList = document.getElementById('drafts-list');
        draftsList.innerHTML = '';

        if (draftDocs.length === 0) {
            draftsList.innerHTML = '<p style="text-align: center; color: var(--text-muted-color);">임시저장된 글이 없습니다.</p>';
            return;
        }

        draftDocs.forEach(docSnapshot => {
            const draft = docSnapshot.data();
            const id = docSnapshot.id;
            const itemDiv = document.createElement('div');
            itemDiv.classList.add('list-item');

            itemDiv.innerHTML = `
                <div class="list-item-info">
                    <h4>${draft.title || '무제'}</h4>
                    <p>저장된 시간: ${draft.savedAt?.toDate().toLocaleString() || '날짜 없음'}</p>
                </div>
                <div class="list-item-actions">
                    <button class="load-btn">불러오기</button>
                    <button class="perm-delete-btn">삭제</button>
                </div>
            `;

            itemDiv.querySelector('.load-btn').addEventListener('click', () => {
                openEditorModal(draft, draft.originalWritingId, true, id);
                document.getElementById('drafts-modal').style.display = 'none';
            });

            itemDiv.querySelector('.perm-delete-btn').addEventListener('click', () => {
                if (confirm('이 임시저장 글을 삭제하시겠습니까?')) {
                    permanentlyDeleteDraft(id);
                }
            });

            draftsList.appendChild(itemDiv);
        });
    }

    async function permanentlyDeleteDraft(draftId) {
        if (!currentUser || !draftId) return;
        try {
            await deleteDoc(doc(db, `users/${currentUser.uid}/drafts`, draftId));
        } catch (error) {
            console.error("임시저장 글 삭제 오류:", error);
            alert('임시저장 글을 삭제하는 중 오류가 발생했습니다.');
        }
    }


    async function restoreWritingFromTrash(trashId) {
        if (!currentUser || !trashId) return;
        const trashDocRef = doc(db, `users/${currentUser.uid}/trash`, trashId);
        try {
            const trashDocSnap = await getDoc(trashDocRef);
            if (trashDocSnap.exists()) {
                const { deletedAt, ...writingData } = trashDocSnap.data();
                await addDoc(collection(db, `users/${currentUser.uid}/writings`), writingData);
                await deleteDoc(trashDocRef);
            }
        } catch (error) {
            console.error("글 복원 오류:", error);
            alert('글을 복원하는 중 오류가 발생했습니다.');
        }
    }
    
    async function permanentlyDeleteWriting(trashId) {
        if (!currentUser || !trashId) return;
        try {
            await deleteDoc(doc(db, `users/${currentUser.uid}/trash`, trashId));
        } catch (error) {
            console.error("영구 삭제 오류:", error);
            alert('글을 영구적으로 삭제하는 중 오류가 발생했습니다.');
        }
    }
    
    // --- ANALYTICS HUB 기능 ---
    function initAnalyticsHub() {
        document.getElementById('analyze-text-btn').addEventListener('click', runAnalysis);
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

            if (!docSnap.exists() || !docSnap.data().content) {
                 alert('분석할 내용이 없습니다.');
                 return;
            }
            
            const analyzeText = httpsCallable(functions, 'analyzeText');
            const result = await analyzeText({ text: docSnap.data().content });
            displayAnalysisResults(result.data);

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
                    data: [0,0,0,0], // data.sentiment 값으로 채워야 함
                    backgroundColor: ['#28a745', '#dc3545', '#ffc107', '#6c757d']
                }]
            },
            options: { responsive: true, plugins: { legend: { position: 'top' } } }
        });

        const entityList = document.getElementById('entity-list');
        entityList.innerHTML = data.entities?.length > 0
            ? data.entities.slice(0, 10).map(entity => `<li>${entity.name} <span class="salience">(${entity.type}, 중요도: ${entity.salience.toFixed(2)})</span></li>`).join('')
            : '<li>추출된 키워드가 없습니다.</li>';
        
        document.getElementById('category-result').textContent = '카테고리 분석 결과 없음';
    }
});

