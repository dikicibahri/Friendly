import {
    auth, db, storage,
    signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, onAuthStateChanged, signOut, signInWithRedirect,
    ref, set, get, update, push, onValue, remove, serverTimestamp, query, orderByChild,
    sRef, uploadBytes, getDownloadURL
} from './firebase-config.js';

// --- STATE MANAGEMENT ---
const state = {
    user: null,
    profile: null,
    groupId: null,
    groupData: null,
    members: [],
    tasks: [],
    logs: [],
    notes: [],
    isAdmin: false,
    completedTasks: {},  // Tek seferlik görevler için kalıcı tamamlama durumu
    groupCompletions: {}, // Grup bazlı tamamlamalar (herkes görür)
    streak: { count: 0, lastActiveDate: null }  // Streak sistemi
};

// --- INIT ---
let deferredPrompt;

function initApp() {
    if (!auth) return;

    // PWA Service Worker Registration
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./service-worker.js')
            .then(reg => console.log('✅ SW Kayıtlı:', reg.scope))
            .catch(err => console.log('❌ SW Hatası:', err));
    }

    // PWA Install Prompt Handler
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        const installBtn = document.getElementById('installAppBtn');
        if (installBtn) installBtn.style.display = 'flex';
    });

    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon();

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            state.user = user;
            await loadUserProfile(user);
        } else {
            state.user = null;
            showScreen('loginSection');
            setLoading(false);
        }
    });

    // Checkbox logic - Süresiz/Limitsiz
    const chk = document.getElementById('noDeadlineCheck');
    if (chk) {
        chk.addEventListener('change', (e) => {
            document.getElementById('deadlineInputGroup').style.display = e.target.checked ? 'none' : 'block';
        });
    }

    // Checkbox logic - Recurring Task (Her Gün Tekrarla)
    const recurringChk = document.getElementById('isRecurringCheck');
    if (recurringChk) {
        recurringChk.addEventListener('change', (e) => {
            const noDeadlineChk = document.getElementById('noDeadlineCheck');
            if (e.target.checked) {
                // Recurring seçiliyse deadline'ı otomatik süresiz yap
                noDeadlineChk.checked = true;
                noDeadlineChk.disabled = true;
                document.getElementById('deadlineInputGroup').style.display = 'none';
            } else {
                // Recurring kaldırıldıysa kullanıcı seçebilsin
                noDeadlineChk.disabled = false;
            }
        });
    }

    // File Input UI Update
    const fileInp = document.getElementById('newNoteFile');
    if (fileInp) {
        fileInp.addEventListener('change', (e) => {
            const fileName = e.target.files[0]?.name || '';
            document.getElementById('fileNameDisplay').textContent = fileName;
        });
    }
}

// PWA Install Function
window.installApp = async () => {
    // Eğer tarayıcı yerel yükleme desteği sunuyorsa (Chrome/Android vb.)
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to the install prompt: ${outcome}`);
        if (outcome === 'accepted') {
            showToast("Uygulama yükleniyor! 🎉", "success");
        }
        deferredPrompt = null;
        const installBtn = document.getElementById('installAppBtn');
        if (installBtn) installBtn.style.display = 'none';
    } else {
        // Desteklenmeyen tarayıcılar (iOS Safari, Opera Mobile bazı sürümler vb.)
        if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
            alert("iOS'ta yüklemek için:\n1. 'Paylaş' butonuna basın\n2. 'Ana Ekrana Ekle' seçeneğini seçin");
        } else {
            alert("Tarayıcı menüsünden 'Uygulamayı Yükle' veya 'Ana Ekrana Ekle' seçeneğini kullanın.");
        }
    }
};

// --- HELPER: IMAGE COMPRESSION ---
function compressImage(file, maxWidth = 800, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob((blob) => {
                    resolve(blob);
                }, 'image/jpeg', quality);
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
}

// --- AUTH ---
window.handleGoogleLogin = async () => {
    setLoading(true);
    try {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error(error);
        if (error.code === 'auth/popup-blocked') {
            showToast("Popup engellendi, yönlendiriliyor...", "warning");
            signInWithRedirect(auth, new GoogleAuthProvider());
        } else {
            showToast(error.message, "error");
            setLoading(false);
        }
    }
};

window.handleEmailLogin = async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const pass = document.getElementById('loginPass').value;
    setLoading(true);
    try {
        await signInWithEmailAndPassword(auth, email, pass);
    } catch (error) {
        showToast("Giriş başarısız: " + error.message, "error");
        setLoading(false);
    }
};

window.handleRegister = async (e) => {
    e.preventDefault();
    const name = document.getElementById('regName').value;
    const email = document.getElementById('regEmail').value;
    const pass = document.getElementById('regPass').value;

    if (!name || !email || !pass) return showToast("Tüm alanları doldur!", "error");

    setLoading(true);
    try {
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        await updateProfile(cred.user, { displayName: name });
    } catch (error) {
        showToast("Kayıt hatası: " + error.message, "error");
        setLoading(false);
    }
};

window.toggleAuthMode = () => {
    document.getElementById('loginForm').classList.toggle('hidden');
    document.getElementById('registerForm').classList.toggle('hidden');
};

window.handleLogout = async () => {
    await signOut(auth);
    location.reload();
};

// --- DATA HANDLING ---
async function loadUserProfile(user) {
    const userRef = ref(db, `users/${user.uid}`);
    onValue(userRef, async (snapshot) => {
        const data = snapshot.val();
        if (data) {
            state.profile = data;
            if (data.currentGroupId) {
                state.groupId = data.currentGroupId;
                await loadGroupData(state.groupId);
            } else {
                showScreen('groupSetupSection');
                setLoading(false);
            }
        } else {
            const randomEmoji = ["🦁", "🐯", "🐻", "🚀", "🔥", "⚡"][Math.floor(Math.random() * 6)];
            await set(userRef, {
                uid: user.uid,
                name: user.displayName || "Çaylak",
                email: user.email,
                photoUrl: user.photoURL || null,
                avatarEmoji: randomEmoji,
                currentGroupId: '',
                trustScore: 0,
                createdAt: serverTimestamp()
            });
        }
    });

    // Completed Tasks dinle (tek seferlik görevler için)
    onValue(ref(db, `users/${user.uid}/completedTasks`), (snap) => {
        state.completedTasks = snap.val() || {};
        renderTasks();
        renderArena();
    });

    // Streak dinle ve kontrol et
    onValue(ref(db, `users/${user.uid}/streak`), async (snap) => {
        const streakData = snap.val() || { count: 0, lastActiveDate: null };
        await checkAndUpdateStreak(streakData);
        updateStreakUI();
    });
}

// Streak kontrolü - login'de çağrılır
async function checkAndUpdateStreak(streakData) {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    if (streakData.lastActiveDate === today) {
        // Bugün zaten aktif
        state.streak = streakData;
    } else if (streakData.lastActiveDate === yesterday) {
        // Dün aktifti, streak devam ediyor (henüz bugün görev yapmadı)
        state.streak = streakData;
    } else if (streakData.lastActiveDate && streakData.lastActiveDate !== today && streakData.lastActiveDate !== yesterday) {
        // Streak kırıldı
        state.streak = { count: 0, lastActiveDate: null };
        await set(ref(db, `users/${state.user.uid}/streak`), state.streak);
    } else {
        state.streak = streakData;
    }
}

// Streak UI güncelle
function updateStreakUI() {
    const streakDisplay = document.getElementById('streakDisplay');
    const streakCount = document.getElementById('streakCount');

    if (streakDisplay && streakCount) {
        if (state.streak.count > 0) {
            streakDisplay.style.display = 'inline-flex';
            streakCount.textContent = state.streak.count;
        } else {
            streakDisplay.style.display = 'none';
        }
    }
}

// Görev tamamlandığında streak güncelle
async function updateStreakOnTaskComplete() {
    const today = new Date().toISOString().split('T')[0];

    if (state.streak.lastActiveDate !== today) {
        // Bugün ilk görev tamamlandı
        const newCount = state.streak.count + 1;
        const newStreak = { count: newCount, lastActiveDate: today };

        await set(ref(db, `users/${state.user.uid}/streak`), newStreak);
        state.streak = newStreak;

        if (newCount > 1) {
            showToast(`🔥 ${newCount} Günlük Seri!`, 'success');
        }
        updateStreakUI();
    }
}

async function loadGroupData(groupId) {
    onValue(ref(db, `groups/${groupId}/metadata`), (snap) => {
        if (!snap.exists()) {
            update(ref(db, `users/${state.user.uid}`), { currentGroupId: '' });
            return;
        }
        state.groupData = snap.val();
        const headerName = document.getElementById('headerGroupName');
        if (headerName) headerName.textContent = state.groupData.groupName;

        // Hakkında bölümündeki grup adını güncelle
        const aboutGroupName = document.getElementById('aboutGroupName');
        if (aboutGroupName) aboutGroupName.textContent = state.groupData.groupName;
    });

    onValue(ref(db, `groups/${groupId}/members`), (snap) => {
        // Array.from ile snapshot'u düzgün array'e çevir
        state.members = [];
        if (snap.exists()) {
            snap.forEach(childSnap => {
                const memberData = childSnap.val();
                if (memberData) {
                    state.members.push(memberData);
                }
            });
        }

        const me = state.members.find(m => m.userId === state.user.uid);

        // ⚡ FAILSAFE: Grup kurucusu her zaman admin!
        const isCreator = state.groupData?.createdBy === state.user.uid;
        const hasAdminRole = me?.role === 'admin';
        state.isAdmin = hasAdminRole || isCreator;

        // Microtask delay ile render et (timing bug fix)
        setTimeout(() => {
            const activeTab = document.querySelector('.tab-content.active');
            if (activeTab) switchTab(activeTab.id);
            renderArena();
            renderProfile();
        }, 0);
    });

    onValue(ref(db, `groups/${groupId}/tasks`), (snap) => {
        state.tasks = [];
        snap.forEach(c => {
            const t = c.val();
            if (t.isActive !== false) state.tasks.push(t);
        });
        renderTasks();
        renderArena();
    });

    onValue(ref(db, `groups/${groupId}/notes`), (snap) => {
        state.notes = [];
        snap.forEach(c => {
            const noteData = c.val();
            state.notes.push(noteData);
        });
        renderNotes();
    });

    const today = new Date().toISOString().split('T')[0];
    onValue(ref(db, `groups/${groupId}/logs/${today}`), (snap) => {
        state.logs = [];
        snap.forEach(c => {
            const logData = c.val();
            state.logs.push(logData);
        });
        renderTasks();
        renderArena();
    });

    // Yeni Veri Yolu Dinleyici: Herkesin tek seferlik görev durumlarını çek
    onValue(ref(db, `groups/${groupId}/completions`), (snap) => {
        state.groupCompletions = snap.val() || {};
        renderTasks();
        renderArena();
    });

    onValue(query(ref(db, `audit_logs/${state.user.uid}`), orderByChild('timestamp')), (snap) => {
        const logs = [];
        snap.forEach(c => {
            const stalkerLog = c.val();
            logs.push(stalkerLog);
        });
        renderStalkerRadar(logs.reverse());
    });

    showScreen('dashboardSection');
    setLoading(false);
}

// --- GROUP ACTIONS ---
window.createGroup = async () => {
    const name = prompt("Takımın adı ne olsun?");
    if (!name) return;
    setLoading(true);

    try {
        const newGroupRef = push(ref(db, 'groups'));
        const groupId = newGroupRef.key;
        const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();

        const updates = {};
        updates[`groups/${groupId}/metadata`] = {
            groupId,
            groupName: name,
            inviteCode,
            createdBy: state.user.uid,
            createdAt: serverTimestamp()
        };
        updates[`groups/${groupId}/members/${state.user.uid}`] = {
            userId: state.user.uid,
            userName: state.profile.name,
            userPhoto: state.profile.photoUrl || null,
            avatarEmoji: state.profile.avatarEmoji || null,
            role: 'admin',
            joinedAt: serverTimestamp()
        };
        updates[`inviteCodes/${inviteCode}`] = groupId;
        updates[`users/${state.user.uid}/currentGroupId`] = groupId;

        await update(ref(db), updates);

        state.groupId = groupId;
        state.groupData = { groupId, groupName: name, inviteCode, createdBy: state.user.uid };
        await loadGroupData(groupId);

        showToast("Takım kuruldu! Lider sensin. 👑", "success");
    } catch (error) {
        console.error(error);
        if (error.code === 'PERMISSION_DENIED') {
            showToast("Yetki Hatası: Firebase Kurallarını kontrol et!", "error");
        } else {
            showToast("Hata: " + error.message, "error");
        }
        setLoading(false);
    }
};

window.joinGroup = async () => {
    const code = document.getElementById('inviteCodeInput').value.trim().toUpperCase();
    if (code.length < 3) return showToast("Geçerli bir kod gir.", "error");
    setLoading(true);

    try {
        const codeSnap = await get(ref(db, `inviteCodes/${code}`));
        if (!codeSnap.exists()) {
            setLoading(false);
            return showToast("Bu kod geçersiz veya süresi dolmuş.", "error");
        }
        const groupId = codeSnap.val();

        const updates = {};
        updates[`groups/${groupId}/members/${state.user.uid}`] = {
            userId: state.user.uid,
            userName: state.profile.name,
            userPhoto: state.profile.photoUrl || null,
            avatarEmoji: state.profile.avatarEmoji || null,
            role: 'member',
            joinedAt: serverTimestamp()
        };
        updates[`users/${state.user.uid}/currentGroupId`] = groupId;

        await update(ref(db), updates);
        state.groupId = groupId;
        await loadGroupData(groupId);
        showToast("Takıma hoş geldin! 🚀", "success");
    } catch (error) {
        if (error.code === 'PERMISSION_DENIED') {
            showToast("Yetki Hatası: Kuralları kontrol et.", "error");
        } else {
            showToast("Katılma hatası: " + error.message, "error");
        }
        setLoading(false);
    }
};

window.leaveGroup = async () => {
    if (!confirm("Gerçekten takımı terk ediyor musun?")) return;
    setLoading(true);
    try {
        const updates = {};
        updates[`groups/${state.groupId}/members/${state.user.uid}`] = null;
        updates[`users/${state.user.uid}/currentGroupId`] = "";
        await update(ref(db), updates);
        location.reload();
    } catch (e) {
        showToast(e.message, "error");
        setLoading(false);
    }
};

// --- TASK ACTIONS ---
window.createTask = async () => {
    if (!state.isAdmin) return showToast("Sadece yönetici görev ekleyebilir!", "error");

    const title = document.getElementById('newTaskTitle').value;
    const isNoDeadline = document.getElementById('noDeadlineCheck').checked;
    const isRecurring = document.getElementById('isRecurringCheck').checked;
    const deadlineVal = document.getElementById('newTaskDeadline').value;

    if (!title) return showToast("Görev adı boş olamaz", "error");

    const taskRef = push(ref(db, `groups/${state.groupId}/tasks`));
    const newTask = {
        taskId: taskRef.key,
        title,
        createdBy: state.user.uid,
        createdAt: serverTimestamp(),
        isActive: true,
        isRecurring: isRecurring,
        deadlineTimestamp: isNoDeadline ? 0 : (deadlineVal ? new Date(deadlineVal).getTime() : 0)
    };

    await set(taskRef, newTask);
    closeModal('addTaskModal');
    document.getElementById('newTaskTitle').value = '';
    document.getElementById('isRecurringCheck').checked = false;
    showToast("Görev eklendi! 🎯", "success");
};

window.toggleTaskStatus = async (taskId, currentStatus) => {
    const task = state.tasks.find(t => t.taskId === taskId);
    if (task && task.deadlineTimestamp && task.deadlineTimestamp < Date.now()) {
        return showToast("Süresi dolmuş görevler tamamlanamaz!", "warning");
    }

    const newStatus = currentStatus === 'done' ? 'pending' : 'done';
    const today = new Date().toISOString().split('T')[0];

    // Veritabanı Yolu: Artık grubun içinde herkese açık bir alana yazıyoruz
    const updates = {};

    if (task && task.isRecurring) {
        // Tekrarlayan görev ise LOGLARA yaz
        const logId = `${state.user.uid}_${taskId}_${today}`;
        const logPath = `groups/${state.groupId}/logs/${today}/${logId}`;

        if (newStatus === 'done') {
            updates[logPath] = {
                logId, taskId, userId: state.user.uid,
                status: 'done', date: today, timestamp: serverTimestamp()
            };
        } else {
            updates[logPath] = null; // Geri alma
        }
    } else {
        // Tek seferlik görev ise: GRUP İÇİNDEKİ COMPLETIONS tablosuna yaz
        const completionPath = `groups/${state.groupId}/completions/${taskId}/${state.user.uid}`;

        if (newStatus === 'done') {
            updates[completionPath] = true;
        } else {
            updates[completionPath] = null;
        }
    }

    try {
        await update(ref(db), updates);

        if (newStatus === 'done') {
            createConfetti();
            await updateStreakOnTaskComplete();
        }
    } catch (e) {
        console.error('Toggle Error:', e);
        showToast('Hata: ' + e.message, 'error');
    }
};

window.deleteTask = async (taskId) => {
    if (!state.isAdmin) return showToast("Sadece yönetici silebilir!", "error");
    if (!confirm("Bu görevi silmek istediğine emin misin?")) return;
    await update(ref(db, `groups/${state.groupId}/tasks/${taskId}`), { isActive: false });
    showToast("Görev silindi.", "info");
};

// --- NOTE ACTIONS (Squad Board) ---
window.createNote = async () => {
    if (!state.isAdmin) return showToast("Sadece yönetici not ekleyebilir!", "error");

    const title = document.getElementById('newNoteTitle').value;
    const text = document.getElementById('newNoteText').value;
    const imageUrl = document.getElementById('newNoteImageUrl').value.trim();
    const fileInp = document.getElementById('newNoteFile');
    const file = fileInp.files[0];

    if (!title || !text) return showToast("Başlık ve metin zorunlu!", "error");
    setLoading(true);

    try {
        let finalImageUrl = null;

        // Öncelik URL'de
        if (imageUrl) {
            finalImageUrl = imageUrl;
        } else if (file) {
            // Dosya yükle - sıkıştır
            const compressedBlob = await compressImage(file, 1024, 0.7);
            const storageRef = sRef(storage, `notes/${state.groupId}/${Date.now()}_img.jpg`);
            const snapshot = await uploadBytes(storageRef, compressedBlob);
            finalImageUrl = await getDownloadURL(snapshot.ref);
        }

        const noteRef = push(ref(db, `groups/${state.groupId}/notes`));
        await set(noteRef, {
            noteId: noteRef.key,
            title,
            text,
            imageUrl: finalImageUrl || null,
            createdBy: state.user.uid,
            createdAt: serverTimestamp()
        });

        closeModal('addNoteModal');
        document.getElementById('newNoteTitle').value = '';
        document.getElementById('newNoteText').value = '';
        document.getElementById('newNoteImageUrl').value = '';
        fileInp.value = '';
        document.getElementById('fileNameDisplay').textContent = '';
        showToast("Not yayınlandı! 📝", "success");
    } catch (e) {
        console.error("Create Note Error:", e);
        showToast("Hata: " + e.message, "error");
    } finally {
        setLoading(false);
    }
};

window.deleteNote = async (noteId, e) => {
    if (e) e.stopPropagation(); // Prevent card click
    if (!state.isAdmin) return showToast("Sadece yönetici silebilir!", "error");
    if (!confirm("Bu notu silmek istediğine emin misin?")) return;
    await remove(ref(db, `groups/${state.groupId}/notes/${noteId}`));
    showToast("Not silindi.", "info");
};

window.viewNote = (noteId) => {
    const note = state.notes.find(n => n.noteId === noteId);
    if (!note) return;

    const content = document.getElementById('viewNoteContent');
    content.innerHTML = `
        ${note.imageUrl ? `<img src="${note.imageUrl}" style="width:100%; border-radius:0 0 20px 20px; margin-bottom:1rem;">` : ''}
        <div style="padding: 0 1.5rem 2rem;">
            <h2 style="font-size:1.5rem; margin-bottom:1rem; line-height:1.3;">${note.title}</h2>
            <div style="white-space:pre-wrap; color:var(--text-muted); line-height:1.6;">${note.text}</div>
            <div style="margin-top:2rem; font-size:0.8rem; color:var(--text-muted); opacity:0.6;">
                Yayınlanma: ${new Date(note.createdAt).toLocaleDateString()}
            </div>
        </div>
    `;
    openModal('viewNoteModal');
};

// --- RENDERERS ---
function renderArena() {
    const container = document.getElementById('arenaGrid');
    if (!container) return;
    container.innerHTML = '';
    const today = new Date().toISOString().split('T')[0];

    // Görevleri ayır
    const recurringTasks = state.tasks.filter(t => t.isRecurring);
    const oneTimeTasks = state.tasks.filter(t => !t.isRecurring);

    // Sıralama için tüm görevleri say (artık herkesin tek seferlik görevleri de görünür)
    const sortedMembers = [...state.members].sort((a, b) => {
        // Recurring
        const aRecurring = state.logs.filter(l => l.userId === a.userId && l.status === 'done' && l.date === today).length;
        const bRecurring = state.logs.filter(l => l.userId === b.userId && l.status === 'done' && l.date === today).length;

        // Tek seferlik (grup verisinden)
        const aOneTime = oneTimeTasks.filter(t => state.groupCompletions?.[t.taskId]?.[a.userId] === true).length;
        const bOneTime = oneTimeTasks.filter(t => state.groupCompletions?.[t.taskId]?.[b.userId] === true).length;

        return (bRecurring + bOneTime) - (aRecurring + aOneTime);
    });

    sortedMembers.forEach((member, index) => {
        let doneCount = 0;

        // Tekrarlayan görevler: Loglardan say
        const recurringDone = state.logs.filter(l =>
            l.userId === member.userId &&
            l.status === 'done' &&
            l.date === today &&
            recurringTasks.some(t => t.taskId === l.taskId)
        ).length;
        doneCount += recurringDone;

        // Tek seferlik görevler: Grup verisinden kontrol et (ARTIK HERKES İÇİN)
        const oneTimeDone = oneTimeTasks.filter(t =>
            state.groupCompletions?.[t.taskId]?.[member.userId] === true
        ).length;
        doneCount += oneTimeDone;

        // Toplam görev sayısı (artık herkes için aynı)
        const totalTasksForMember = state.tasks.length;

        const progress = totalTasksForMember === 0 ? 0 : Math.round((doneCount / totalTasksForMember) * 100);
        const isLeader = index === 0 && doneCount > 0;

        // Progress color class
        let progressClass = 'low';
        if (progress >= 100) progressClass = 'complete';
        else if (progress >= 70) progressClass = 'high';
        else if (progress >= 30) progressClass = 'medium';

        const card = document.createElement('div');
        card.className = `arena-card ${isLeader ? 'leader' : ''}`;
        card.onclick = () => viewUserDetail(member);

        const avatarHtml = member.userPhoto
            ? `<img src="${member.userPhoto}" alt="${member.userName}">`
            : `<span>${member.avatarEmoji || '👤'}</span>`;

        // Streak badge - sadece kendi için göster (diğerlerinin streak verisi yok)
        const streakBadge = (member.userId === state.user.uid && state.streak.count > 0)
            ? `<span class="streak-badge">🔥 ${state.streak.count}</span>`
            : '';

        card.innerHTML = `
            <div class="member-avatar">${avatarHtml}</div>
            <div class="member-info">
                <div class="member-name">${member.userName}${streakBadge} ${member.userId === state.user.uid ? '(Sen)' : ''}</div>
                <div class="progress-wrapper">
                    <div class="progress-bar">
                        <div class="progress-fill ${progressClass}" style="width: ${progress}%"></div>
                    </div>
                    <span class="progress-percent">${progress}%</span>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

function viewUserDetail(member) {
    // Admin değilse ve başkasının profiline bakıyorsa audit log oluştur
    if (!state.isAdmin && member.userId !== state.user.uid) {
        push(ref(db, `audit_logs/${member.userId}`), {
            viewer: state.profile.name,
            message: `${state.profile.name} profiline gizlice baktı 👀`,
            timestamp: serverTimestamp()
        });
        showToast(`${member.userName} radarlandı!`, "success");
    }

    // Modal aç - üyenin bugünkü task detaylarını göster
    openUserDetailModal(member);
}

function openUserDetailModal(member) {
    const today = new Date().toISOString().split('T')[0];
    const content = document.getElementById('userDetailContent');

    const memberTasks = state.tasks.map(task => {
        const log = state.logs.find(l =>
            l.taskId === task.taskId &&
            l.userId === member.userId &&
            l.date === today
        );
        const isDone = log?.status === 'done';
        return { task, isDone };
    });

    const avatarHtml = member.userPhoto
        ? `<img src="${member.userPhoto}" style="width:60px; height:60px; border-radius:50%; object-fit:cover;">`
        : `<div style="width:60px; height:60px; border-radius:50%; background:var(--bg); display:flex; align-items:center; justify-content:center; font-size:2rem;">${member.avatarEmoji || '👤'}</div>`;

    const doneCount = memberTasks.filter(t => t.isDone).length;
    const totalCount = memberTasks.length;
    const progress = totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100);

    content.innerHTML = `
        <div style="text-align:center; margin-bottom:2rem;">
            ${avatarHtml}
            <h2 style="margin-top:1rem; font-size:1.5rem;">${member.userName}</h2>
            <p style="color:var(--text-muted); font-size:0.9rem;">Bugünkü İlerleme: ${progress}%</p>
        </div>
        
        <div class="section-title">BUGÜNKÜ GÖREVLER</div>
        ${memberTasks.length === 0 ? `
            <div style="text-align:center; padding:2rem; color:var(--text-muted);">
                <p>Henüz görev yok.</p>
            </div>
        ` : memberTasks.map(({ task, isDone }) => `
            <div class="task-card ${isDone ? 'done' : ''}" style="margin-bottom:0.8rem; cursor:default;">
                <div class="check-circle ${isDone ? '' : 'disabled'}">
                    ${isDone ? '<i data-lucide="check" size="16"></i>' : ''}
                </div>
                <div class="content">
                    <h4>${task.title}</h4>
                </div>
            </div>
        `).join('')}
    `;

    lucide.createIcons();
    openModal('userDetailModal');
}

function renderTasks() {
    const container = document.getElementById('tasksList');
    if (!container) return;
    container.innerHTML = '';

    if (state.tasks.length === 0) {
        container.innerHTML = `<div class="empty-state" style="text-align:center; padding:2rem; color:var(--text-muted);">
            <i data-lucide="coffee" size="48"></i>
            <p>Görev yok. Rahatına bak!</p>
        </div>`;
    } else {
        const today = new Date().toISOString().split('T')[0];

        state.tasks.forEach(task => {
            let isDone = false;

            if (task.isRecurring) {
                // TEKRARLAYAN GÖREV: Bugünün loguna bak
                const myLog = state.logs.find(l =>
                    l.taskId === task.taskId &&
                    l.userId === state.user.uid &&
                    l.date === today
                );
                isDone = myLog?.status === 'done';
            } else {
                // TEK SEFERLİK GÖREV: Grup completions'a bak (YENİ)
                isDone = state.groupCompletions?.[task.taskId]?.[state.user.uid] === true;
            }

            const isExpired = task.deadlineTimestamp && task.deadlineTimestamp < Date.now();
            const div = document.createElement('div');
            div.className = `task-card ${isDone ? 'done' : ''} ${isExpired ? 'expired' : ''}`;

            // HERKES toggle edebilir (admin dahil)
            if (!isExpired) {
                div.onclick = (e) => {
                    if (!e.target.closest('button')) toggleTaskStatus(task.taskId, isDone ? 'done' : 'pending');
                };
            }

            const taskTypeBadge = task.isRecurring
                ? `<span class="tag infinite">🔁 Tekrarlayan</span>`
                : `<span class="tag" style="background: rgba(16, 185, 129, 0.1); color: var(--success);">✅ Tek Seferlik</span>`;
            const deadlineText = task.deadlineTimestamp
                ? `<span class="tag date ${isExpired ? 'expired-tag' : ''}">⏰ ${new Date(task.deadlineTimestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} ${isExpired ? '(Süresi Doldu)' : ''}</span>`
                : `<span class="tag infinite">♾️ Süresiz</span>`;
            const deleteBtn = state.isAdmin ? `<button onclick="deleteTask('${task.taskId}')" class="btn-icon danger"><i data-lucide="trash-2" size="16"></i></button>` : '';
            let checkIcon = isDone ? '<i data-lucide="check" size="16"></i>' : '';
            if (isExpired && !isDone) checkIcon = '<i data-lucide="lock" size="14"></i>';

            div.innerHTML = `
                <div class="check-circle ${isExpired ? 'disabled' : ''}">
                    ${checkIcon}
                </div>
                <div class="content">
                    <div class="header">
                        <h4>${task.title}</h4>
                        <div style="display:flex; gap:6px; flex-wrap:wrap;">
                            ${taskTypeBadge}
                            ${deadlineText}
                        </div>
                    </div>
                </div>
                ${deleteBtn}
            `;
            container.appendChild(div);
        });
    }
    lucide.createIcons();
}

function renderNotes() {
    const container = document.getElementById('notesList');
    if (!container) return;
    container.innerHTML = '';

    if (state.notes.length === 0) {
        container.innerHTML = `<div class="empty-state" style="text-align:center; padding:2rem; color:var(--text-muted);">
            <i data-lucide="sticky-note" size="48"></i>
            <p>Henüz not eklenmemiş.</p>
        </div>`;
        lucide.createIcons();
        return;
    }

    state.notes.forEach(note => {
        const div = document.createElement('div');
        div.className = 'note-card';
        div.onclick = () => viewNote(note.noteId); // VIEW NOTE CLICK

        const imageHtml = note.imageUrl ? `<img src="${note.imageUrl}" alt="${note.title}" class="note-image">` : '';
        const deleteBtn = state.isAdmin ? `<button onclick="deleteNote('${note.noteId}', event)" class="btn-icon danger"><i data-lucide="trash-2" size="16"></i></button>` : '';

        div.innerHTML = `
            ${imageHtml}
            <div class="note-content">
                <div style="display:flex; justify-content:space-between; align-items:start;">
                    <h3>${note.title}</h3>
                    ${deleteBtn}
                </div>
                <p>${note.text}</p>
                <small style="color:var(--text-muted); font-size:0.75rem; margin-top:8px; display:block;">${new Date(note.createdAt).toLocaleDateString()}</small>
            </div>
        `;
        container.appendChild(div);
    });
    lucide.createIcons();
}

function renderProfile() {
    if (!state.profile) return;
    document.getElementById('profileName').innerText = state.profile.name;
    document.getElementById('profileEmail').innerText = state.profile.email;
    const codeDisplay = document.getElementById('inviteCodeDisplay');
    if (codeDisplay && state.groupData) {
        codeDisplay.innerText = state.groupData.inviteCode;
    }

    // Grup adı bölümünü güncelle
    const groupNameBox = document.getElementById('profileGroupNameBox');
    if (groupNameBox && state.groupData) {
        groupNameBox.innerHTML = `<span class="group-name-text">${state.groupData.groupName || 'Grup Adı'}</span>`;
    }

    const photoEl = document.getElementById('profilePhoto');
    if (state.profile.photoUrl) {
        photoEl.innerHTML = `<img src="${state.profile.photoUrl}">`;
    } else {
        photoEl.innerHTML = `<div class="emoji">${state.profile.avatarEmoji || '👤'}</div>`;
    }

    // Header avatar güncelle
    updateHeaderAvatar();

    // Streak UI güncelle
    updateStreakUI();

    // Grup üyeleri - HERKES GÖRSÜN ama butonlar sadece admin'de
    const membersSection = document.getElementById('groupMembersSection');
    if (membersSection) {
        membersSection.classList.remove('hidden');
        const membersList = document.getElementById('groupMembersList');
        if (membersList) {
            membersList.innerHTML = state.members.map(member => {
                const isCurrentUser = member.userId === state.user.uid;
                const isMemberAdmin = member.role === 'admin';
                const isCreator = state.groupData?.createdBy === member.userId;

                const avatarHtml = member.userPhoto
                    ? `<img src="${member.userPhoto}" style="width:40px; height:40px; border-radius:50%; object-fit:cover;">`
                    : `<div style="width:40px; height:40px; border-radius:50%; background:var(--bg); display:flex; align-items:center; justify-content:center; font-size:1.5rem;">${member.avatarEmoji || '👤'}</div>`;

                // Butonlar sadece admin için + kendini yönetemez + kurucuyu yönetemez
                let adminButtons = '';
                if (state.isAdmin && !isCurrentUser && !isCreator) {
                    adminButtons = `
                    <div class="actions">
                        ${isMemberAdmin ? `
                            <button class="btn-xs warning" onclick="removeAdmin('${member.userId}')">
                                Adminlikten Al
                            </button>
                        ` : `
                            <button class="btn-xs success" onclick="makeAdmin('${member.userId}')">
                                Admin Yap
                            </button>
                        `}
                        <button class="btn-xs danger" onclick="kickMember('${member.userId}')">
                            Gruptan At
                        </button>
                    </div>
                `;
                }

                return `
                    <div style="background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:1rem; margin-bottom:0.8rem; display:flex; justify-content:space-between; align-items:center; gap:1rem; flex-wrap:wrap;">
                        <div style="display:flex; align-items:center; gap:1rem;">
                            ${avatarHtml}
                            <div>
                                <h4 style="font-size:0.95rem; font-weight:600; margin-bottom:0.2rem;">${member.userName} ${isCurrentUser ? '(Sen)' : ''}</h4>
                                <p style="font-size:0.75rem; color:var(--text-muted);">${isCreator ? '👑 Kurucu' : (isMemberAdmin ? '⭐ Yönetici' : 'Üye')}</p>
                            </div>
                        </div>
                        ${adminButtons}
                    </div>
                `;
            }).join('');
        }
    }
}

function renderStalkerRadar(logs) {
    const list = document.getElementById('stalkerList');
    if (!list) return;

    // Sadece BUGÜN olanları filtrele (Senior Filter)
    const today = new Date().toDateString();

    const dailyLogs = logs.filter(log => {
        // Firebase timestamp objesi veya sayı olabilir
        const ts = typeof log.timestamp === 'object' ? log.timestamp : log.timestamp;
        if (!ts) return false;
        const logDate = new Date(ts).toDateString();
        return logDate === today;
    });

    if (!dailyLogs || dailyLogs.length === 0) {
        list.innerHTML = `<div class="empty-log">Bugün henüz kimse sana bakmadı. 🕵️‍♂️</div>`;
        return;
    }

    // En yeniden eskiye sırala ve bas
    list.innerHTML = dailyLogs.map(log => {
        const ts = typeof log.timestamp === 'object' ? log.timestamp : log.timestamp;
        const timeStr = ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';
        return `
        <div class="log-row" style="animation: fadeIn 0.5s ease;">
            <span class="msg">${log.message}</span>
            <span class="time">${timeStr}</span>
        </div>
    `}).join('');
}

// --- UTILS ---
window.showScreen = (id) => {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
};

window.switchTab = (tabId) => {
    document.querySelectorAll('.tab-content').forEach(t => {
        t.style.display = 'none';
        t.classList.remove('fade-in');
    });
    const target = document.getElementById(tabId);
    target.style.display = 'block';
    setTimeout(() => target.classList.add('fade-in'), 10);

    // Sync both mobile and desktop nav
    document.querySelectorAll('.nav-btn, .desktop-nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll(`[data-target="${tabId}"]`).forEach(b => b.classList.add('active'));

    const taskFab = document.getElementById('addTaskFab');
    const noteFab = document.getElementById('addNoteFab');

    if (taskFab) taskFab.classList.add('hidden');
    if (noteFab) noteFab.classList.add('hidden');

    if (state.isAdmin) {
        if (tabId === 'tabTasks' && taskFab) taskFab.classList.remove('hidden');
        if (tabId === 'tabNotes' && noteFab) noteFab.classList.remove('hidden');
    }
};

// Grup üyeleri collapsible toggle
window.toggleGroupMembers = () => {
    const content = document.getElementById('groupMembersContent');
    const chevron = document.getElementById('groupMembersChevron');

    if (content.style.maxHeight === '0px') {
        content.style.maxHeight = '1000px';
        chevron.style.transform = 'rotate(0deg)';
    } else {
        content.style.maxHeight = '0px';
        chevron.style.transform = 'rotate(-90deg)';
    }
};

window.openModal = (id) => document.getElementById(id).classList.add('active');
window.closeModal = (id) => document.getElementById(id).classList.remove('active');

window.copyCode = () => {
    const code = state.groupData ? state.groupData.inviteCode : '---';
    if (code === '---') return showToast("Kod yüklenemedi!", "error");

    navigator.clipboard.writeText(code).then(() => {
        showToast("Kopyalandı: " + code, "success");
    }).catch(err => {
        // Fallback
        const textArea = document.createElement("textarea");
        textArea.value = code;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
        showToast("Kopyalandı!", "success");
    });
};

window.shareCode = () => {
    const code = state.groupData ? state.groupData.inviteCode : '---';
    if (code === '---') return showToast("Kod yüklenemedi!", "error");

    const shareData = {
        title: 'Friendly Takım Daveti',
        text: `Friendly takımına katıl! Davet Kodum: ${code}`,
        url: window.location.href
    };

    if (navigator.share) {
        navigator.share(shareData).catch(() => copyCode());
    } else {
        copyCode();
        showToast("Paylaşma desteklenmiyor, kod kopyalandı.", "info");
    }
};

window.toggleTheme = () => {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    updateThemeIcon();
};

function updateThemeIcon() {
    const icon = document.getElementById('themeIcon');
    if (icon) {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        icon.setAttribute('data-lucide', isDark ? 'sun' : 'moon');
        lucide.createIcons();
    }
}

window.showToast = (msg, type = 'info') => {
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerText = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => {
        t.classList.remove('show');
        setTimeout(() => t.remove(), 300);
    }, 3000);
};

window.setLoading = (isLoading) => {
    const loader = document.getElementById('loader');
    if (loader) loader.style.display = isLoading ? 'flex' : 'none';
};

window.createConfetti = () => {
    for (let i = 0; i < 30; i++) {
        const c = document.createElement('div');
        c.className = 'confetti';
        c.style.left = Math.random() * 100 + '%';
        c.style.animationDuration = (Math.random() * 2 + 1) + 's';
        c.style.background = `hsl(${Math.random() * 360}, 70%, 50%)`;
        document.body.appendChild(c);
        setTimeout(() => c.remove(), 3000);
    }
};

// --- ADMIN MANAGEMENT ---
window.kickMember = async (userId) => {
    if (!state.isAdmin) return showToast("Sadece yönetici yapabilir!", "error");
    if (!state.groupId) return showToast("Grup ID bulunamadı!", "error");
    if (userId === state.user.uid) return showToast("Kendini atamazsın!", "warning");

    if (!confirm("Bu üyeyi gruptan atmak istediğine emin misin?")) return;

    setLoading(true);
    try {
        const updates = {};
        // 1. Üyeyi gruptan sil
        updates[`groups/${state.groupId}/members/${userId}`] = null;
        // 2. Kullanıcının currentGroupId'sini sıfırla
        updates[`users/${userId}/currentGroupId`] = null;

        await update(ref(db), updates);

        // UI'dan da manuel sil (Anlık tepki için)
        state.members = state.members.filter(m => m.userId !== userId);
        renderProfile();

        showToast("Üye gruptan şutlandı.", "success");
    } catch (e) {
        console.error("Kick Error:", e);
        showToast("Yetki veya Veritabanı Hatası: " + e.message, "error");
    } finally {
        setLoading(false);
    }
};

window.makeAdmin = async (userId) => {
    if (!state.isAdmin) return showToast("Sadece yönetici yapabilir!", "error");
    if (!confirm("Bu üyeyi yönetici yapmak istediğine emin misin?")) return;

    setLoading(true);
    try {
        await update(ref(db, `groups/${state.groupId}/members/${userId}`), {
            role: 'admin'
        });
        showToast("Üye yönetici oldu! 👑", "success");
    } catch (e) {
        showToast("Hata: " + e.message, "error");
    } finally {
        setLoading(false);
    }
};

window.removeAdmin = async (userId) => {
    if (!state.isAdmin) return showToast("Sadece yönetici yapabilir!", "error");

    // Kurucuyu adminlikten alamazsın
    if (state.groupData?.createdBy === userId) {
        return showToast("Grup kurucusunun yetkisi alınamaz!", "warning");
    }

    if (!confirm("Bu üyenin yönetici yetkisini almak istediğine emin misin?")) return;

    setLoading(true);
    try {
        await update(ref(db, `groups/${state.groupId}/members/${userId}`), {
            role: 'member'
        });
        showToast("Yönetici yetkisi alındı.", "success");
    } catch (e) {
        showToast("Hata: " + e.message, "error");
    } finally {
        setLoading(false);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    initApp();
    lucide.createIcons();

    // Mobile bottom nav
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.target));
    });

    // Desktop nav
    document.querySelectorAll('.desktop-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.target));
    });
});

// --- PASSWORD VISIBILITY TOGGLE ---
window.togglePasswordVisibility = (inputId, button) => {
    const input = document.getElementById(inputId);
    const icon = button.querySelector('i');

    if (input.type === 'password') {
        input.type = 'text';
        icon.setAttribute('data-lucide', 'eye');
    } else {
        input.type = 'password';
        icon.setAttribute('data-lucide', 'eye-off');
    }
    lucide.createIcons();
};

// --- ABOUT SECTION TOGGLE ---
window.toggleAboutSection = () => {
    const content = document.getElementById('aboutContent');
    const chevron = document.getElementById('aboutChevron');

    if (content.classList.contains('collapsed')) {
        content.classList.remove('collapsed');
        chevron.style.transform = 'rotate(180deg)';
    } else {
        content.classList.add('collapsed');
        chevron.style.transform = 'rotate(0deg)';
    }
};

// --- HEADER AVATAR UPDATE ---
function updateHeaderAvatar() {
    const avatarContent = document.getElementById('headerAvatarContent');
    const headerAvatar = document.getElementById('headerAvatar');

    if (!avatarContent || !state.profile) return;

    if (state.profile.photoUrl) {
        headerAvatar.innerHTML = `<img src="${state.profile.photoUrl}" alt="Avatar">`;
    } else {
        avatarContent.textContent = state.profile.avatarEmoji || '👤';
    }
}

// --- PROFILE DROPDOWN ---
window.toggleProfileDropdown = () => {
    // Mobilde direkt profil sekmesine git
    if (window.innerWidth < 768) {
        switchTab('tabProfile');
        return;
    }

    const dropdown = document.getElementById('profileDropdown');
    const nameEl = document.getElementById('dropdownUserName');
    const emailEl = document.getElementById('dropdownUserEmail');

    // Update dropdown content
    if (nameEl) nameEl.textContent = state.profile?.name || 'Kullanıcı';
    if (emailEl) emailEl.textContent = state.user?.email || 'Email yok';

    dropdown.classList.toggle('show');
    lucide.createIcons();
};

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('profileDropdown');
    const wrapper = document.querySelector('.profile-dropdown-wrapper');
    if (dropdown && wrapper && !wrapper.contains(e.target)) {
        dropdown.classList.remove('show');
    }
});

// ==========================================
// MOBİL FİXLER VE OVERRIDE FONKSİYONLAR
// ==========================================

window.copyCode = async () => {
    const code = state.groupData ? state.groupData.inviteCode : '---';
    if (code === '---') return showToast("Kod yüklenemedi!", "error");

    try {
        await navigator.clipboard.writeText(code);
        showToast("Kopyalandı: " + code, "success");
    } catch (err) {
        console.error('Clipboard Error:', err);
        // Fallback: iOS ve bazı mobil tarayıcılar için
        const textArea = document.createElement("textarea");
        textArea.value = code;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            document.execCommand('copy');
            showToast("Kopyalandı!", "success");
        } catch (execErr) {
            console.error('ExecCommand Error:', execErr);
            showToast("Kopyalama başarısız, manuel seçin.", "error");
            prompt("Kodu kopyalayın:", code);
        }
        document.body.removeChild(textArea);
    }
};

window.shareCode = async () => {
    const code = state.groupData ? state.groupData.inviteCode : '---';
    if (code === '---') return showToast("Kod yüklenemedi!", "error");

    const shareData = {
        title: 'Friendly Takım Daveti',
        text: `Friendly takımına katıl! Davet Kodum: ${code}`,
        url: window.location.href
    };

    if (navigator.share) {
        try {
            await navigator.share(shareData);
        } catch (err) {
            if (err.name !== 'AbortError') copyCode();
        }
    } else {
        copyCode();
        showToast("Paylaşma desteklenmiyor, kod kopyalandı.", "info");
    }
};
