// [수정 완료] dashboard.js (saveWriting 함수 부분)
    async function saveWriting() {
        // 버튼 비활성화
        saveBtn.disabled = true;
        blogBtn.disabled = true;
        saveBtn.textContent = '저장 중...';

        try {
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

            if (currentWritingId) {
                const docRef = doc(collectionRef, currentWritingId);
                await updateDoc(docRef, dataToSave);
            } else {
                dataToSave.createdAt = serverTimestamp();
                const docRef = await addDoc(collectionRef, dataToSave);
                currentWritingId = docRef.id;
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
        } finally {
            // [수정] 성공/실패 여부와 관계없이 버튼 상태를 항상 원래대로 복구
            saveBtn.disabled = false;
            blogBtn.disabled = false;
            saveBtn.textContent = '저장 후 닫기';
            blogBtn.innerHTML = '<i class="fa-solid fa-n"></i>'; // 아이콘으로 복구
        }
    }

    // '저장 후 닫기' 버튼 이벤트 리스너
    saveBtn.addEventListener('click', async () => {
        const success = await saveWriting();
        if (success) {
            closeEditorModal();
        }
    });

    // '저장 후 블로그로 이동' 버튼 이벤트 리스너
    blogBtn.addEventListener('click', async () => {
        const success = await saveWriting();
        if (success) {
            const blogUrl = "https://blog.naver.com/POST_WRITE.naver?blogId=tenmilli_10";
            window.open(blogUrl, '_blank');
            closeEditorModal();
        }
    });